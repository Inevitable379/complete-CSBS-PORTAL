/* ============================================================
   CSBS Portal — Main Application Logic
   Navigation, data fetching, rendering, interactions
   ============================================================ */

const API_BASE = '';
// Sheets are proxied through the backend (login required) — the raw
// Google Sheets URL is no longer exposed to the browser.
const SCHEDULE_CSV = '/api/sheets/schedule';
const ATTENDANCE_CSV = '/api/sheets/attendance';

// State
let currentSection = 'dashboard';
let modulesData = [];
let assignmentsData = [];
let projectsData = [];
let announcementsData = [];
let examsData = [];
let attendanceData = [];
let attendanceSort = 'default';

// ── Theme ───────────────────────────────────────
function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.dataset.theme = saved;
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.querySelector('i').className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// ── Init ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initGreeting();
    initKeyboard();
    navigate('dashboard');
});

// ── Navigation ──────────────────────────────────
function navigate(section) {
    if (currentSection === section && document.querySelector('.page-section.active')) return;
    const oldEl = document.querySelector('.page-section.active');
    currentSection = section;

    // Update sidebar
    document.querySelectorAll('.sidebar-item[data-section]').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    // Update header
    const titles = {
        dashboard: '<i class="fas fa-house"></i> Dashboard',
        modules: '<i class="fas fa-cubes"></i> Courses',
        assignments: '<i class="fas fa-clipboard-list"></i> Assignments',
        projects: '<i class="fas fa-diagram-project"></i> Projects',
        announcements: '<i class="fas fa-bullhorn"></i> Announcements',
        schedule: '<i class="fas fa-calendar"></i> Schedule',
        attendance: '<i class="fas fa-chart-bar"></i> Attendance',
        gpa: '<i class="fas fa-calculator"></i> GPA Calculator'
    };
    document.getElementById('page-title').innerHTML = titles[section] || section;

    // Scroll to top
    document.querySelector('.main-scroll').scrollTop = 0;

    // Load data eagerly
    loadSection(section);

    // Close mobile nav
    document.querySelector('.sidebar')?.classList.remove('mobile-open');

    // Fade-out old → fade-in new
    if (oldEl) {
        oldEl.style.animation = 'fadeOut 120ms ease-in forwards';
        setTimeout(() => {
            oldEl.classList.remove('active');
            oldEl.style.animation = '';
            activateSection(section);
        }, 130);
    } else {
        activateSection(section);
    }
}

function activateSection(section) {
    const newEl = document.getElementById('section-' + section);
    if (newEl) { newEl.classList.add('active'); }
}

function loadSection(section) {
    switch (section) {
        case 'dashboard': loadDashboard(); break;
        case 'modules': loadModules(); break;
        case 'assignments': loadAssignments(); break;
        case 'projects': loadProjects(); break;
        case 'announcements': loadAnnouncements(); break;
        case 'schedule': loadSchedule(); break;
        case 'attendance': loadAttendance(); break;
        case 'gpa': loadGpa(); break;
    }
}

// ── Dashboard ───────────────────────────────────
async function loadDashboard() {
    // Show skeletons while loading
    showDashboardSkeletons();
    try {
        const [stats, announcements] = await Promise.all([
            fetchJSON('/api/stats'),
            fetchJSON('/api/announcements')
        ]);
        renderStatCards(stats, announcements);
        renderDashboardAnnouncements(announcements.slice(0, 3));
        loadPriorityStrip(stats, announcements);
        loadLivePanel(stats, announcements);

    } catch (e) {
        console.error('Dashboard load error:', e);
        showToast('Could not load dashboard data — retrying...', 'error');
    }
    fetchScheduleForTimeline();
}

function showDashboardSkeletons() {
    document.querySelectorAll('.stat-value').forEach(el => {
        el.innerHTML = '<div class="skeleton skeleton-title" style="width:60px;height:28px;display:inline-block"></div>';
    });
}

function renderStatCards(stats, announcements) {
    // Attendance — fetch from CSV and populate
    const attEl = document.getElementById('stat-attendance');
    attEl.textContent = '—';
    document.getElementById('stat-attendance-sub').innerHTML = 'Loading from sheet...';
    fetchAttendanceForDashboard();

    // Assignments — human copy
    const aCount = stats.assignments || 0;
    animateNumber('stat-assignments', aCount);
    document.getElementById('stat-assignments-sub').textContent = aCount === 0 ? 'All caught up ✓' : aCount === 1 ? 'waiting for you' : 'need your attention';

    // Courses
    animateNumber('stat-modules', stats.modules || 0);

    // Exam countdown — smart and specific
    const examEl = document.getElementById('stat-exam');
    const examSub = document.getElementById('stat-exam-sub');
    examEl.textContent = '—';
    examSub.textContent = 'No exams scheduled';
    if (stats.exams > 0) {
        fetchJSON('/api/exams').then(exams => {
            const upcoming = exams.filter(e => new Date(e.date) > new Date()).sort((a,b) => new Date(a.date) - new Date(b.date));
            if (upcoming.length > 0) {
                const days = Math.ceil((new Date(upcoming[0].date) - new Date()) / 86400000);
                if (days <= 0) { examEl.textContent = 'Today'; examEl.style.color = 'var(--danger)'; examSub.textContent = esc(upcoming[0].course); }
                else if (days === 1) { examEl.textContent = 'Tomorrow'; examEl.style.color = 'var(--warning)'; examSub.textContent = esc(upcoming[0].course); }
                else { animateNumber('stat-exam', days); examSub.textContent = 'days · ' + esc(upcoming[0].course); }
            }
        });
    }
}

function loadPriorityStrip(stats, announcements) {
    const strip = document.getElementById('priority-strip');
    const items = [];

    // Assignments — most urgent first
    if (stats.assignments > 0) {
        items.push(`<div class="priority-item warning" onclick="navigate('assignments')">
            <i class="fas fa-clipboard-list" style="color:var(--warning)"></i>
            <span>${stats.assignments} assignment${stats.assignments > 1 ? 's' : ''} waiting</span>
            <i class="fas fa-chevron-right" style="font-size:0.6rem;color:var(--text-3);margin-left:auto"></i>
        </div>`);
    }

    // Urgent announcements
    const urgentCount = announcements.filter(a => a.type === 'urgent').length;
    if (urgentCount > 0) {
        items.push(`<div class="priority-item urgent" onclick="navigate('announcements')">
            <i class="fas fa-triangle-exclamation" style="color:var(--danger)"></i>
            <span>${urgentCount} urgent notice${urgentCount > 1 ? 's' : ''}</span>
            <i class="fas fa-chevron-right" style="font-size:0.6rem;color:var(--text-3);margin-left:auto"></i>
        </div>`);
    } else if (stats.announcements > 0) {
        items.push(`<div class="priority-item info" onclick="navigate('announcements')">
            <i class="fas fa-bullhorn" style="color:var(--accent)"></i>
            <span>${stats.announcements} new update${stats.announcements > 1 ? 's' : ''}</span>
            <i class="fas fa-chevron-right" style="font-size:0.6rem;color:var(--text-3);margin-left:auto"></i>
        </div>`);
    }

    // Exams
    if (stats.exams > 0) {
        items.push(`<div class="priority-item urgent" onclick="navigate('schedule')">
            <i class="fas fa-calendar-check" style="color:var(--danger)"></i>
            <span>${stats.exams} exam${stats.exams > 1 ? 's' : ''} scheduled</span>
            <i class="fas fa-chevron-right" style="font-size:0.6rem;color:var(--text-3);margin-left:auto"></i>
        </div>`);
    }

    // If nothing needs attention
    if (items.length === 0) {
        strip.innerHTML = `<div class="priority-item" style="border-left:3px solid var(--success);cursor:default">
            <i class="fas fa-check-circle" style="color:var(--success)"></i>
            <span>All clear — nothing needs your attention right now</span>
        </div>`;
    } else {
        strip.innerHTML = items.join('');
    }
}

function renderDashboardAnnouncements(items) {
    const el = document.getElementById('dashboard-announcements');
    if (!items.length) {
        el.innerHTML = `<div class="empty-state" style="padding:var(--sp-8)">
            <i class="fas fa-bell-slash"></i>
            <h3>All caught up</h3>
            <p>No announcements right now. Enjoy the quiet.</p>
        </div>`;
        return;
    }
    el.innerHTML = items.map(a => {
        const isUrgent = a.type === 'urgent';
        const preview = (a.content || '').substring(0, 80);
        return `<div class="card ${isUrgent ? 'card-danger glow-left' : 'card-accent'}" style="cursor:pointer" onclick="navigate('announcements')">
            <div class="flex justify-between items-center mb-2">
                <span class="badge ${isUrgent ? 'badge-danger' : 'badge-accent'}">${isUrgent ? 'Urgent' : 'Update'}</span>
                <span class="text-caption">${timeAgo(a.date)}</span>
            </div>
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px">${esc(a.title)}</div>
            ${preview ? `<div class="text-caption" style="font-weight:400">${esc(preview)}${preview.length >= 80 ? '...' : ''}</div>` : ''}
        </div>`;
    }).join('');
}

function loadLivePanel(stats, announcements) {
    const deadlines = document.getElementById('panel-deadlines');
    const panelStats = document.getElementById('panel-stats');
    if (deadlines) deadlines.innerHTML = announcements.length
        ? announcements.slice(0, 5).map(a => `<div class="card" style="padding:var(--sp-3)"><span class="text-caption">${esc(a.date || '')}</span><br><span style="font-size:0.82rem">${esc(a.title)}</span></div>`).join('')
        : '<p class="text-caption">Nothing upcoming</p>';
    if (panelStats) panelStats.innerHTML = `
        <div class="card" style="padding:var(--sp-3)"><span class="text-caption">Assignments</span><br><strong>${stats.assignments || 0}</strong></div>
        <div class="card" style="padding:var(--sp-3)"><span class="text-caption">Exams</span><br><strong>${stats.exams || 0}</strong></div>
    `;
}

// ── Modules ─────────────────────────────────────
let currentSemester = null;

async function loadModules() {
    if (!modulesData.length) {
        try {
            modulesData = await fetchJSON('/api/modules');
        } catch (e) { showToast('Failed to load modules', 'error'); return; }
    }
    buildSemesterMenu();
    renderModules(modulesData.filter(c => (c.semester || 1) === currentSemester));
}

function buildSemesterMenu() {
    // Only offer semesters that actually have courses — no dead-end tabs.
    const sems = [...new Set(modulesData.map(c => c.semester || 1))].sort((a, b) => a - b);
    if (!sems.length) return;

    // Restore last choice if still valid, else first available
    const saved = parseInt(localStorage.getItem('semester'));
    currentSemester = sems.includes(saved) ? saved : sems[0];

    const menu = document.getElementById('sem-menu');
    menu.innerHTML = sems.map(s =>
        `<button class="sem-option ${s === currentSemester ? 'active' : ''}" onclick="selectSemester(${s}, this)">Sem ${s}</button>`
    ).join('');
    document.getElementById('sem-label').textContent = `Sem ${currentSemester}`;

    // Hide the dropdown entirely when there's only one semester
    document.getElementById('sem-dropdown').style.display = sems.length > 1 ? '' : 'none';
}

function renderModules(courses) {
    const grid = document.getElementById('modules-grid');
    const colors = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#14B8A6','#F97316','#06B6D4','#84CC16','#A855F7'];
    grid.innerHTML = courses.map((c, i) => {
        const color = colors[i % colors.length];
        const topics = (c.topics || []).map(t => {
            if (t.url) return `<div class="topic-item"><a href="${esc(t.url)}" target="_blank"><i class="fas fa-file-lines" style="color:${color};font-size:0.75rem"></i> ${esc(t.name)}</a></div>`;
            return `<div class="topic-item"><span class="no-file"><i class="fas fa-circle" style="font-size:0.3rem;vertical-align:middle;margin-right:6px"></i>${esc(t.name)}</span></div>`;
        }).join('');
        const creditsBadge = c.credits ? `<span class="badge badge-accent" style="font-size:0.7rem"><i class="fas fa-graduation-cap" style="margin-right:4px"></i>${c.credits} Credits</span>` : '';
        const internalsHtml = c.internal_marks ? `<div class="course-internals"><i class="fas fa-clipboard-check"></i> <strong>CA / Internals:</strong> ${esc(c.internal_marks)}</div>` : '';
        return `<div class="card module-card" style="padding:0;overflow:hidden">
            <div class="module-header" style="border-left:3px solid ${color}">
                <i class="${esc(c.icon || 'fas fa-book')}" style="color:${color}"></i>
                <h3>${esc(c.title)}</h3>
                <div class="module-meta">
                    <span class="code">${esc(c.code)}</span>
                    ${creditsBadge}
                </div>
            </div>
            ${internalsHtml}
            <div class="module-body">${topics || '<p class="text-caption">No topics yet</p>'}</div>
        </div>`;
    }).join('');
}

function toggleSemDropdown() {
    document.getElementById('sem-dropdown').classList.toggle('open');
}

function selectSemester(sem, btn) {
    currentSemester = sem;
    localStorage.setItem('semester', sem);

    // Update active state
    document.querySelectorAll('.sem-option').forEach(o => o.classList.remove('active'));
    btn.classList.add('active');

    // Update trigger label & close
    document.getElementById('sem-label').textContent = `Sem ${sem}`;
    document.getElementById('sem-dropdown').classList.remove('open');

    renderModules(modulesData.filter(c => (c.semester || 1) === sem));
}

// Close dropdown when clicking outside
document.addEventListener('click', e => {
    const dd = document.getElementById('sem-dropdown');
    if (dd && !dd.contains(e.target)) dd.classList.remove('open');
});

// ── Assignments ─────────────────────────────────
async function loadAssignments() {
    try {
        assignmentsData = await fetchJSON('/api/assignments');
        renderAssignments(assignmentsData);
    } catch (e) { showToast('Failed to load assignments', 'error'); }
}

function isMarkedDone(category, id) {
    const done = JSON.parse(localStorage.getItem('csbs_done') || '{}');
    return !!(done[category] && done[category][id]);
}
function toggleDone(category, id) {
    const done = JSON.parse(localStorage.getItem('csbs_done') || '{}');
    if (!done[category]) done[category] = {};
    done[category][id] = !done[category][id];
    if (!done[category][id]) delete done[category][id];
    localStorage.setItem('csbs_done', JSON.stringify(done));
    if (category === 'assignments') renderAssignments(assignmentsData);
    else if (category === 'projects') renderProjects(projectsData);
}

function renderAssignments(items) {
    const grid = document.getElementById('assignments-grid');
    const empty = document.getElementById('assignments-empty');
    if (!items.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = items.map(a => {
        const done = isMarkedDone('assignments', a.id);
        const statusLabel = done ? 'done' : (a.status || 'pending');
        const statusClass = done ? 'badge-success' : a.status === 'submitted' ? 'badge-success' : a.status === 'overdue' ? 'badge-danger' : 'badge-warning';
        return `<div class="card assignment-card${done ? ' card-done' : ''}">
            <span class="badge badge-accent subject">${esc(a.subject_code || 'General')}</span>
            <h3>${esc(a.title)}</h3>
            <p class="text-caption">${esc(a.message || '')}</p>
            <div class="meta">
                <span class="text-caption"><i class="fas fa-calendar"></i> ${esc(a.date || 'No date')}</span>
                <span class="badge ${statusClass}">${esc(statusLabel)}</span>
            </div>
            <button class="btn-mark-done ${done ? 'marked' : ''}" onclick="event.stopPropagation();toggleDone('assignments',${a.id})" title="${done ? 'Undo' : 'Mark as done'}">
                <i class="fas ${done ? 'fa-check-circle' : 'fa-circle'}"></i> ${done ? 'Done' : 'Mark as done'}
            </button>
        </div>`;
    }).join('');
}

function filterAssignments(filter, btn) {
    document.querySelectorAll('#assignment-filters .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    if (filter === 'all') { renderAssignments(assignmentsData); return; }
    renderAssignments(assignmentsData.filter(a => (a.status || 'pending') === filter));
}

// ── Projects ────────────────────────────────────
async function loadProjects() {
    try {
        projectsData = await fetchJSON('/api/projects');
        renderProjects(projectsData);
    } catch (e) { showToast('Failed to load projects', 'error'); }
}

function renderProjects(items) {
    const grid = document.getElementById('projects-grid');
    const empty = document.getElementById('projects-empty');
    if (!items.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    grid.innerHTML = items.map(p => {
        const done = isMarkedDone('projects', p.id);
        return `<div class="card assignment-card${done ? ' card-done' : ''}">
            <span class="badge badge-accent subject">${esc(p.course || 'General')}</span>
            <h3>${esc(p.title)}</h3>
            <p class="text-caption">${esc(p.description || '')}</p>
            <div class="meta">
                <span class="text-caption"><i class="fas fa-calendar"></i> ${esc(p.due_date || 'No due date')}</span>
            </div>
            <button class="btn-mark-done ${done ? 'marked' : ''}" onclick="event.stopPropagation();toggleDone('projects',${p.id})" title="${done ? 'Undo' : 'Mark as done'}">
                <i class="fas ${done ? 'fa-check-circle' : 'fa-circle'}"></i> ${done ? 'Done' : 'Mark as done'}
            </button>
        </div>`;
    }).join('');
}

// ── Announcements ───────────────────────────────
async function loadAnnouncements() {
    try {
        announcementsData = await fetchJSON('/api/announcements');
        renderAnnouncements(announcementsData);
    } catch (e) { showToast('Failed to load announcements', 'error'); }
}

function renderAnnouncements(items) {
    const container = document.getElementById('announcements-container');
    const empty = document.getElementById('announcements-empty');
    if (!items.length) { container.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    container.innerHTML = items.map(a => {
        const variant = a.type === 'urgent' ? 'card-danger' : 'card-accent';
        const badge = a.type === 'urgent' ? 'badge-danger' : 'badge-accent';
        return `<div class="card ${variant} announcement-card">
            <div class="ann-header">
                <span class="badge ${badge}">${esc(a.type || 'info')}</span>
                <span class="text-caption">${esc(a.date || '')}</span>
            </div>
            <div class="ann-title">${esc(a.title)}</div>
            <div class="ann-body">${esc(a.content || '')}</div>
        </div>`;
    }).join('');
}

function filterAnnouncements(filter, btn) {
    document.querySelectorAll('#section-announcements .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    if (filter === 'all') { renderAnnouncements(announcementsData); return; }
    renderAnnouncements(announcementsData.filter(a => (a.type || 'info') === filter));
}

// ── Schedule ────────────────────────────────────
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed
let calEvents = {}; // key: "YYYY-MM-DD", value: [{type, title, meta}]
let calSelectedDay = null;
let scheduleTabActive = 'calendar';

async function loadSchedule() {
    try {
        examsData = await fetchJSON('/api/exams');
        assignmentsData = assignmentsData.length ? assignmentsData : await fetchJSON('/api/assignments');
        renderExams(examsData);
        buildCalendarEvents(examsData, assignmentsData);
        renderCalendar();
    } catch (e) { showToast('Failed to load schedule data', 'error'); }
    fetchScheduleTable();
}

// ── Schedule Tab Switching ──────────────────────
function switchScheduleTab(tab, btn) {
    scheduleTabActive = tab;
    document.querySelectorAll('#schedule-tabs .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('schedule-view-calendar').style.display = tab === 'calendar' ? '' : 'none';
    document.getElementById('schedule-view-exams').style.display = tab === 'exams' ? '' : 'none';
    document.getElementById('schedule-view-timetable').style.display = tab === 'timetable' ? '' : 'none';
    if (tab === 'timetable') fetchScheduleTable();
}

// ── Calendar Event Builder ─────────────────────
function buildCalendarEvents(exams, assignments) {
    calEvents = {};

    exams.forEach(e => {
        if (!e.date) return;
        const key = normalizeDate(e.date);
        if (!key) return;
        if (!calEvents[key]) calEvents[key] = [];
        calEvents[key].push({
            type: 'exam',
            title: esc(e.course) + (e.type ? ` — ${esc(e.type)}` : ''),
            meta: [e.time, e.location].filter(Boolean).join(' · ') || 'Exam'
        });
    });

    assignments.forEach(a => {
        if (!a.date) return;
        const key = normalizeDate(a.date);
        if (!key) return;
        if (!calEvents[key]) calEvents[key] = [];
        calEvents[key].push({
            type: 'assignment',
            title: esc(a.title),
            meta: esc(a.subject_code || 'Assignment') + (a.status ? ` · ${esc(a.status)}` : '')
        });
    });
}

// Parse various date formats → "YYYY-MM-DD"
function normalizeDate(str) {
    if (!str) return null;
    // Try native first
    const d1 = new Date(str);
    if (!isNaN(d1)) return d1.toISOString().slice(0, 10);
    // DD Mon YYYY
    const m = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) {
        const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
        const mo = months[m[2].toLowerCase().slice(0,3)];
        if (mo !== undefined) {
            const d = new Date(parseInt(m[3]), mo, parseInt(m[1]));
            return d.toISOString().slice(0, 10);
        }
    }
    return null;
}

// ── Calendar Render ─────────────────────────────
function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const label = document.getElementById('cal-month-label');
    if (!grid || !label) return;

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);

    label.textContent = firstDay.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const cells = [];
    // Pad start
    for (let i = 0; i < firstDay.getDay(); i++) {
        const d = new Date(calYear, calMonth, -firstDay.getDay() + i + 1);
        cells.push({ date: d, otherMonth: true });
    }
    // This month
    for (let d = 1; d <= lastDay.getDate(); d++) {
        cells.push({ date: new Date(calYear, calMonth, d), otherMonth: false });
    }
    // Pad end to fill 6 rows
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) {
        cells.push({ date: new Date(calYear, calMonth + 1, i), otherMonth: true });
    }

    grid.innerHTML = cells.map(({ date, otherMonth }) => {
        const key = date.toISOString().slice(0, 10);
        const isToday = key === todayKey;
        const events = calEvents[key] || [];
        const hasExam = events.some(e => e.type === 'exam');
        const hasAssign = events.some(e => e.type === 'assignment');

        const classes = [
            'cal-day',
            otherMonth ? 'other-month' : '',
            isToday ? 'today' : '',
            events.length ? 'has-events' : '',
            hasExam ? 'has-exam' : '',
            hasAssign ? 'has-assignment' : '',
            calSelectedDay === key ? 'selected' : ''
        ].filter(Boolean).join(' ');

        // Show up to 2 event labels
        const dots = events.slice(0, 2).map(ev =>
            `<div class="cal-event-dot ${ev.type}">${ev.title.split('—')[0].trim()}</div>`
        ).join('');
        const more = events.length > 2 ? `<div class="cal-event-dot" style="color:var(--text-3)">+${events.length - 2} more</div>` : '';

        return `<div class="${classes}" data-key="${key}" onclick="calDayClick('${key}', ${otherMonth})">
            <div class="cal-day-num">${date.getDate()}</div>
            ${!otherMonth ? dots + more : ''}
        </div>`;
    }).join('');
}

function calDayClick(key, otherMonth) {
    if (otherMonth) return;
    calSelectedDay = key;

    // Re-render to update selected state
    renderCalendar();

    const panel = document.getElementById('cal-events-panel');
    const events = calEvents[key] || [];

    const [y, m, d] = key.split('-').map(Number);
    const dateLabel = new Date(y, m - 1, d).toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    if (!events.length) {
        panel.innerHTML = `
            <div class="cal-panel-date">${dateLabel}</div>
            <div style="padding:var(--sp-5);text-align:center;color:var(--text-3);font-size:0.82rem">
                <i class="fas fa-calendar-check" style="display:block;font-size:1.4rem;margin-bottom:var(--sp-2)"></i>
                No events on this day
            </div>`;
        return;
    }

    panel.innerHTML = `
        <div class="cal-panel-date">${dateLabel} — ${events.length} event${events.length > 1 ? 's' : ''}</div>
        <div class="cal-events-list">
            ${events.map(ev => `
                <div class="cal-event-item">
                    <div class="event-icon ${ev.type}">
                        <i class="fas ${ev.type === 'exam' ? 'fa-file-pen' : 'fa-clipboard-list'}"></i>
                    </div>
                    <div class="event-info">
                        <div class="event-title">${ev.title}</div>
                        <div class="event-meta">${ev.meta}</div>
                    </div>
                    <span class="badge ${ev.type === 'exam' ? 'badge-danger' : 'badge-warning'}">${ev.type}</span>
                </div>`).join('')}
        </div>`;
}

function calPrev() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    calSelectedDay = null;
    renderCalendar();
    document.getElementById('cal-events-panel').innerHTML = '<p class="text-caption" style="padding:var(--sp-4)">Click a highlighted date to see events.</p>';
}

function calNext() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calSelectedDay = null;
    renderCalendar();
    document.getElementById('cal-events-panel').innerHTML = '<p class="text-caption" style="padding:var(--sp-4)">Click a highlighted date to see events.</p>';
}

function calToday() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDay = null;
    renderCalendar();
    document.getElementById('cal-events-panel').innerHTML = '<p class="text-caption" style="padding:var(--sp-4)">Click a highlighted date to see events.</p>';
}

// ── Exams Table ─────────────────────────────────
function renderExams(items) {
    const tbody = document.getElementById('exam-tbody');
    if (!items.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center;padding:40px">No exams scheduled</td></tr>'; return; }
    tbody.innerHTML = items.map(e => {
        const typeClass = (e.type || '').toLowerCase().includes('mid') ? 'badge-accent' : (e.type || '').toLowerCase().includes('final') ? 'badge-warning' : 'badge-muted';
        return `<tr>
            <td>${esc(e.course)}</td>
            <td><span class="badge ${typeClass} exam-type">${esc(e.type)}</span></td>
            <td>${esc(e.date)}</td>
            <td><span class="text-mono">${esc(e.time || '—')}</span></td>
            <td>${esc(e.location || '—')}</td>
        </tr>`;
    }).join('');
}

async function fetchScheduleTable() {
    try {
        const csv = await fetchText(SCHEDULE_CSV);
        const rows = csv.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')));
        if (rows.length < 2) return;
        const table = document.getElementById('timetable');
        const header = rows[0].map(h => `<th>${esc(h)}</th>`).join('');
        const body = rows.slice(1).filter(r => r.length > 1).map(r =>
            '<tr>' + r.map((c, i) => {
                let cls = '';
                const cl = c.toLowerCase();
                if (i === 0) cls = 'day-header';
                else if (cl.includes('break')) cls = 'break-cell';
                else if (cl.includes('lunch')) cls = 'lunch-cell';
                else if (c && c !== '-') cls = 'subject-cell';
                return `<td class="${cls}">${esc(c)}</td>`;
            }).join('') + '</tr>'
        ).join('');
        table.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
    } catch (e) { console.error('Schedule fetch error:', e); }
}

async function fetchScheduleForTimeline() {
    try {
        const csv = await fetchText(SCHEDULE_CSV);
        const rows = csv.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')));
        if (rows.length < 2) return;
        const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        const today = days[new Date().getDay()];
        const headers = rows[0];
        const todayRow = rows.find(r => r[0] && r[0].toLowerCase().includes(today));
        const timeline = document.getElementById('today-timeline');
        if (!todayRow) {
            const isWeekend = [0, 6].includes(new Date().getDay());
            timeline.innerHTML = `<div class="empty-state" style="padding:var(--sp-6);text-align:left;display:flex;align-items:center;gap:var(--sp-4)">
                <i class="fas ${isWeekend ? 'fa-mug-hot' : 'fa-calendar-xmark'}" style="font-size:1.5rem;color:var(--text-3)"></i>
                <div>
                    <h3 style="font-size:0.9rem;margin-bottom:2px">${isWeekend ? 'It\'s the weekend!' : 'No classes today'}</h3>
                    <p style="font-size:0.8rem;color:var(--text-2)">${isWeekend ? 'Recharge and come back Monday.' : 'Enjoy your free day.'}</p>
                </div>
            </div>`;
            return;
        }
        const hour = new Date().getHours();
        timeline.innerHTML = todayRow.slice(1).map((cell, i) => {
            const time = headers[i + 1] || '';
            const isNow = (hour >= 8 + i && hour < 9 + i);
            const isBreak = cell.toLowerCase().includes('break') || cell.toLowerCase().includes('lunch');
            return `<div class="timeline-slot ${isNow ? 'now' : ''} ${isBreak ? 'break' : ''}">
                <div class="time">${esc(time)}</div>
                <div class="subject">${esc(cell || '—')}</div>
            </div>`;
        }).join('');
    } catch (e) {
        document.getElementById('today-timeline').innerHTML = `<div class="empty-state" style="padding:var(--sp-6);text-align:left;display:flex;align-items:center;gap:var(--sp-4)">
            <i class="fas fa-wifi-slash" style="font-size:1.2rem;color:var(--text-3)"></i>
            <div><p style="font-size:0.8rem;color:var(--text-2)">Could not load schedule. Check your connection.</p></div>
        </div>`;
    }
}

// ── Attendance ──────────────────────────────────
async function loadAttendance() {
    if (attendanceData.length) { renderAttendance(attendanceData); return; }
    try {
        const csv = await fetchText(ATTENDANCE_CSV);
        const rows = csv.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')));
        if (rows.length < 2) return;
        attendanceData = rows.slice(1).filter(r => r.length >= 6).map((r, i) => ({
            sno: i + 1, usn: r[1] || '', name: r[2] || '',
            attended: parseInt(r[3]) || 0, total: parseInt(r[4]) || 0,
            percentage: parseFloat(r[5]) || 0
        }));
        renderAttendance(attendanceData);
        animateNumber('stat-attendance', Math.round(attendanceData.reduce((s, a) => s + a.percentage, 0) / attendanceData.length) + '%');
    } catch (e) { showToast('Failed to load attendance', 'error'); }
}

function renderAttendance(data) {
    const tbody = document.getElementById('attendance-tbody');
    const warning = document.getElementById('attendance-warning');
    const lowCount = data.filter(a => a.percentage < 75).length;
    if (lowCount > 0) {
        warning.classList.remove('hidden');
        document.getElementById('attendance-warning-text').textContent = `${lowCount} student${lowCount > 1 ? 's' : ''} below 75% attendance threshold.`;
    } else { warning.classList.add('hidden'); }

    tbody.innerHTML = data.map(a => {
        const pctClass = a.percentage >= 85 ? 'text-success' : a.percentage >= 75 ? 'text-warning' : 'text-danger';
        const rowBg = a.percentage < 75 ? 'style="background:rgba(239,68,68,0.04)"' : '';
        return `<tr ${rowBg}>
            <td>${a.sno}</td>
            <td><span class="text-mono">${esc(a.usn)}</span></td>
            <td>${esc(a.name)}</td>
            <td>${a.attended}</td>
            <td>${a.total}</td>
            <td class="${pctClass}">${a.percentage.toFixed(1)}%</td>
        </tr>`;
    }).join('');
}

function searchAttendance() {
    const q = document.getElementById('attendance-search').value.toLowerCase();
    const filtered = attendanceData.filter(a => a.name.toLowerCase().includes(q) || a.usn.toLowerCase().includes(q));
    renderAttendance(filtered);
}

function sortAttendance(type, btn) {
    document.querySelectorAll('#section-attendance .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    let sorted = [...attendanceData];
    if (type === 'low') sorted.sort((a, b) => a.percentage - b.percentage);
    else if (type === 'high') sorted.sort((a, b) => b.percentage - a.percentage);
    else if (type === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    renderAttendance(sorted);
}

// ── Attendance for Dashboard Stat ───────────────
async function fetchAttendanceForDashboard() {
    try {
        const csv = await fetchText(ATTENDANCE_CSV);
        const rows = csv.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')));
        if (rows.length < 2) return;
        const parsed = rows.slice(1).filter(r => r.length >= 6).map((r, i) => ({
            sno: i + 1, usn: r[1] || '', name: r[2] || '',
            attended: parseInt(r[3]) || 0, total: parseInt(r[4]) || 0,
            percentage: parseFloat(r[5]) || 0
        }));
        if (!attendanceData.length) attendanceData = parsed;
        const avg = Math.round(parsed.reduce((s, a) => s + a.percentage, 0) / parsed.length);
        animateNumber('stat-attendance', avg);
        const attEl = document.getElementById('stat-attendance');
        // Append % after animation
        setTimeout(() => { attEl.textContent = avg + '%'; }, 900);
        const sub = document.getElementById('stat-attendance-sub');
        const lowCount = parsed.filter(a => a.percentage < 75).length;
        if (lowCount > 0) {
            sub.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:var(--warning)"></i> ${lowCount} below 75%`;
        } else {
            sub.innerHTML = `<i class="fas fa-arrow-trend-up" style="color:var(--success)"></i> Class average`;
        }
    } catch (e) {
        document.getElementById('stat-attendance-sub').textContent = 'Could not load';
        console.error('Attendance fetch for dashboard:', e);
    }
}

// ── Greeting ────────────────────────────────────
async function initGreeting() {
    let name = 'there';
    try {
        const res = await fetch('/api/auth/check', { credentials: 'same-origin' });
        if (res.ok) {
            const data = await res.json();
            name = data.name || 'there';
            // Reveal the admin shortcut for admins
            if (data.is_admin) document.getElementById('admin-link')?.classList.remove('hidden');
        }
    } catch (e) { /* fallback to 'there' */ }

    const hour = new Date().getHours();
    let greet = 'Good evening';
    if (hour < 12) greet = 'Good morning';
    else if (hour < 17) greet = 'Good afternoon';
    document.getElementById('greeting-text').textContent = `${greet}, ${name}.`;
    const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('greeting-sub').textContent = dateStr;

    // Set avatar initials and display name in sidebar
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('user-avatar').textContent = initials || '?';
    const displayNameEl = document.getElementById('user-display-name');
    if (displayNameEl) displayNameEl.textContent = name !== 'there' ? name : 'Student';
}

// ── Command Palette ─────────────────────────────
function openCommandPalette() {
    document.getElementById('cmd-palette').classList.add('open');
    const input = document.getElementById('cmd-input');
    input.value = '';
    input.focus();
    handleCmdSearch('');
}

function closeCommandPalette() {
    document.getElementById('cmd-palette').classList.remove('open');
}

function handleCmdSearch(query) {
    const results = document.getElementById('cmd-results');
    const pages = [
        { icon: 'fa-house', label: 'Dashboard', section: 'dashboard' },
        { icon: 'fa-cubes', label: 'Modules', section: 'modules' },
        { icon: 'fa-clipboard-list', label: 'Assignments', section: 'assignments' },
        { icon: 'fa-diagram-project', label: 'Projects', section: 'projects' },
        { icon: 'fa-bullhorn', label: 'Announcements', section: 'announcements' },
        { icon: 'fa-calendar', label: 'Schedule', section: 'schedule' },
        { icon: 'fa-chart-bar', label: 'Attendance', section: 'attendance' },
    ];
    const q = query.toLowerCase();
    const filtered = q ? pages.filter(p => p.label.toLowerCase().includes(q)) : pages;
    let html = '<div class="cmd-section">Pages</div>';
    html += filtered.map(p => `<div class="cmd-item" onclick="navigate('${p.section}');closeCommandPalette()"><i class="fas ${p.icon}"></i> ${p.label}</div>`).join('');
    if (q && modulesData.length) {
        const courses = modulesData.filter(c => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
        if (courses.length) {
            html += '<div class="cmd-section">Courses</div>';
            html += courses.map(c => `<div class="cmd-item" onclick="navigate('modules');closeCommandPalette()"><i class="fas fa-book"></i> ${esc(c.title)}</div>`).join('');
        }
    }
    results.innerHTML = html;
}

// ── Keyboard Shortcuts ──────────────────────────
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Cmd+K / Ctrl+K
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openCommandPalette();
        }
        // Escape
        if (e.key === 'Escape') {
            closeCommandPalette();
            closeSyllabusModal();
        }
    });
}

function showShortcuts() {
    showToast('Ctrl+K: Search | Esc: Close', 'info');
}

// ── Modals ──────────────────────────────────────
function closeSyllabusModal() {
    document.getElementById('syllabus-modal').classList.remove('open');
}

// ── Toast System ────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-circle-xmark' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i>
        <span>${esc(message)}</span><div class="toast-progress"></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('dismissing'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ── Mobile Navigation ───────────────────────────
function toggleMobileNav() {
    document.querySelector('.sidebar').classList.toggle('mobile-open');
}

// ── Auth ────────────────────────────────────────
function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).finally(() => {
        window.location.href = '/login.html';
    });
}

// ── Utilities ───────────────────────────────────
async function fetchJSON(url) {
    const res = await fetch(API_BASE + url, { credentials: 'same-origin' });
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Session expired'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchText(url) {
    const res = await fetch(API_BASE + url, { credentials: 'same-origin' });
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Session expired'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

function esc(str) {
    if (str == null) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

function animateNumber(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (typeof target === 'string') { el.textContent = target; return; }
    const duration = 800;
    const start = performance.now();
    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(eased * target);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return esc(dateStr); // fallback to raw string
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 172800) return 'Yesterday';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── GPA Calculator ──────────────────────────────
// Jain University 10-point absolute scale
const GPA_GRADES = [
    { g: 'O',  p: 10, min: 90 },
    { g: 'A+', p: 9,  min: 80 },
    { g: 'A',  p: 8,  min: 70 },
    { g: 'B+', p: 7,  min: 60 },
    { g: 'B',  p: 6,  min: 55 },
    { g: 'C',  p: 5,  min: 50 },
    { g: 'P',  p: 4,  min: 40 },
    { g: 'F',  p: 0,  min: 0  }
];

let gpaSem = null;
let gpaMode = localStorage.getItem('csbs_gpa_mode') || 'marks';

function marksToGrade(marks) {
    const m = Math.max(0, Math.min(100, Number(marks)));
    return GPA_GRADES.find(x => m >= x.min) || GPA_GRADES[GPA_GRADES.length - 1];
}

function getGpaStore() { return JSON.parse(localStorage.getItem('csbs_gpa') || '{}'); }
function setGpaStore(s) { localStorage.setItem('csbs_gpa', JSON.stringify(s)); }

function entryPoint(entry) {
    if (!entry) return null;
    if (entry.mode === 'grade') return typeof entry.grade === 'number' ? entry.grade : null;
    if (entry.marks === '' || entry.marks == null) return null;
    return marksToGrade(entry.marks).p;
}

async function loadGpa() {
    if (!modulesData.length) {
        try { modulesData = await fetchJSON('/api/modules'); }
        catch (e) { showToast('Failed to load courses', 'error'); return; }
    }
    const sems = [...new Set(modulesData.map(c => c.semester || 1))].sort((a, b) => a - b);
    if (!sems.length) return;
    if (gpaSem === null || !sems.includes(gpaSem)) {
        const saved = parseInt(localStorage.getItem('csbs_gpa_sem'));
        gpaSem = sems.includes(saved) ? saved : sems[0];
    }
    document.getElementById('gpa-mode-marks').classList.toggle('active', gpaMode === 'marks');
    document.getElementById('gpa-mode-grade').classList.toggle('active', gpaMode === 'grade');
    buildGpaSemTabs(sems);
    renderGpaRows();
    renderCgpa();
}

function buildGpaSemTabs(sems) {
    document.getElementById('gpa-sem-tabs').innerHTML = sems.map(s =>
        `<button class="filter-pill ${s === gpaSem ? 'active' : ''}" onclick="selectGpaSem(${s})">Sem ${s}</button>`
    ).join('');
}

function selectGpaSem(sem) {
    gpaSem = sem;
    localStorage.setItem('csbs_gpa_sem', sem);
    loadGpa();
}

function setGpaMode(mode) {
    gpaMode = mode;
    localStorage.setItem('csbs_gpa_mode', mode);
    document.getElementById('gpa-mode-marks').classList.toggle('active', mode === 'marks');
    document.getElementById('gpa-mode-grade').classList.toggle('active', mode === 'grade');
    renderGpaRows();
}

function renderGpaRows() {
    const rows = document.getElementById('gpa-rows');
    const empty = document.getElementById('gpa-empty');
    const bar = document.getElementById('gpa-sgpa-bar');
    const courses = modulesData.filter(c => (c.semester || 1) === gpaSem);

    if (!courses.length) {
        rows.innerHTML = '';
        empty.classList.remove('hidden');
        bar.style.display = 'none';
        return;
    }
    empty.classList.add('hidden');
    bar.style.display = 'flex';

    const semStore = getGpaStore()[gpaSem] || {};

    rows.innerHTML = courses.map(c => {
        const entry = semStore[c.id] || {};
        const credits = c.credits || 0;
        let inputHtml;
        if (gpaMode === 'marks') {
            const val = (entry.mode !== 'grade' && entry.marks != null) ? entry.marks : '';
            const gr = val !== '' ? marksToGrade(val) : null;
            inputHtml = `
                <input type="number" class="gpa-marks-input" min="0" max="100" placeholder="—"
                    value="${esc(val)}" oninput="onGpaMarks(${c.id}, this.value)">
                <span class="gpa-row-grade ${gr ? '' : 'muted'}">${gr ? gr.g + ' · ' + gr.p : '—'}</span>`;
        } else {
            const cur = entry.mode === 'grade' ? entry.grade : null;
            const opts = GPA_GRADES.map(x => `<option value="${x.p}" ${cur === x.p ? 'selected' : ''}>${x.g} (${x.p})</option>`).join('');
            inputHtml = `
                <select class="gpa-grade-select" onchange="onGpaGrade(${c.id}, this.value)">
                    <option value="" ${cur == null ? 'selected' : ''}>—</option>${opts}
                </select>`;
        }
        return `<div class="gpa-row">
            <div class="gpa-row-info">
                <span class="gpa-row-title">${esc(c.title)}</span>
                <span class="gpa-row-code">${esc(c.code)}</span>
            </div>
            <span class="gpa-row-credits">${credits} <small>cr</small></span>
            <div class="gpa-row-input">${inputHtml}</div>
        </div>`;
    }).join('');

    renderSgpa();
}

function onGpaMarks(courseId, value) {
    const store = getGpaStore();
    if (!store[gpaSem]) store[gpaSem] = {};
    if (value === '') delete store[gpaSem][courseId];
    else store[gpaSem][courseId] = { mode: 'marks', marks: Math.max(0, Math.min(100, Number(value))) };
    setGpaStore(store);
    renderGpaRows();
    renderCgpa();
}

function onGpaGrade(courseId, value) {
    const store = getGpaStore();
    if (!store[gpaSem]) store[gpaSem] = {};
    if (value === '') delete store[gpaSem][courseId];
    else store[gpaSem][courseId] = { mode: 'grade', grade: Number(value) };
    setGpaStore(store);
    renderSgpa();
    renderCgpa();
}

function computeSgpa(sem) {
    const courses = modulesData.filter(c => (c.semester || 1) === sem);
    const semStore = getGpaStore()[sem] || {};
    let weighted = 0, credits = 0, graded = 0;
    courses.forEach(c => {
        const p = entryPoint(semStore[c.id]);
        if (p == null || !c.credits) return;
        weighted += p * c.credits;
        credits += c.credits;
        graded++;
    });
    return { sgpa: credits ? weighted / credits : null, credits, graded, total: courses.length };
}

function renderSgpa() {
    const { sgpa, credits, graded, total } = computeSgpa(gpaSem);
    const valEl = document.getElementById('gpa-sgpa-value');
    const metaEl = document.getElementById('gpa-sgpa-meta');
    if (sgpa == null) {
        valEl.textContent = '—';
        metaEl.innerHTML = `<span class="text-caption">Grade some courses to see your SGPA</span>`;
    } else {
        valEl.textContent = sgpa.toFixed(2);
        valEl.style.color = sgpa >= 8 ? 'var(--success)' : sgpa >= 6 ? 'var(--warning)' : 'var(--danger)';
        metaEl.innerHTML = `<span class="text-caption">${graded}/${total} courses · ${credits} credits counted</span>`;
    }
}

function renderCgpa() {
    const sems = [...new Set(modulesData.map(c => c.semester || 1))].sort((a, b) => a - b);
    let totWeighted = 0, totCredits = 0;
    const parts = [];
    sems.forEach(s => {
        const r = computeSgpa(s);
        if (r.sgpa != null) {
            totWeighted += r.sgpa * r.credits;
            totCredits += r.credits;
            parts.push(`<div class="gpa-cgpa-pill"><span>Sem ${s}</span><strong>${r.sgpa.toFixed(2)}</strong></div>`);
        }
    });
    const cgpa = totCredits ? totWeighted / totCredits : null;
    document.getElementById('gpa-cgpa-value').textContent = cgpa == null ? '—' : cgpa.toFixed(2);
    document.getElementById('gpa-cgpa-sub').textContent = cgpa == null
        ? 'Fill in a semester below to begin'
        : `${parts.length} semester${parts.length > 1 ? 's' : ''} · ${totCredits} credits`;
    document.getElementById('gpa-cgpa-breakdown').innerHTML = parts.join('');
}

function resetGpaSemester() {
    const store = getGpaStore();
    if (store[gpaSem]) { delete store[gpaSem]; setGpaStore(store); }
    showToast(`Semester ${gpaSem} cleared`, 'info');
    renderGpaRows();
    renderCgpa();
}

// Refetch on tab focus
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadSection(currentSection);
});
