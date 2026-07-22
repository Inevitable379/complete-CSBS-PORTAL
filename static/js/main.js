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
// Start as null (not 'dashboard') so the first navigate('dashboard') on load
// doesn't short-circuit on the same-section guard and skip loading data.
let currentSection = null;
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
    // Schedule is the hero — kick it off first, don't make it wait on stats
    const schedulePromise = renderDashboardSchedule();
    try {
        const [stats, announcements] = await Promise.all([
            cachedJSON('/api/stats'),
            cachedJSON('/api/announcements')
        ]);
        renderStatCards(stats, announcements);
        renderDashboardAnnouncements(announcements.slice(0, 2));
        loadPriorityStrip(stats, announcements);
        loadLivePanel(stats, announcements);

    } catch (e) {
        console.error('Dashboard load error:', e);
        showToast('Could not load dashboard data — retrying...', 'error');
    }
    await schedulePromise;
    markDashUpdated();
}

// Small "Updated Xm ago" hint under the greeting — since we serve cached
// data instantly, this tells people how fresh what they're seeing is.
function markDashUpdated() {
    try { localStorage.setItem('dash_updated_at', Date.now()); } catch (e) {}
    renderDashUpdated();
}
function renderDashUpdated() {
    const sub = document.getElementById('greeting-sub');
    if (!sub) return;
    let t = 0;
    try { t = parseInt(localStorage.getItem('dash_updated_at')) || 0; } catch (e) {}
    if (!t) return;
    const mins = Math.floor((Date.now() - t) / 60000);
    const label = mins < 1 ? 'Updated just now' : mins < 60 ? `Updated ${mins}m ago` : `Updated ${Math.floor(mins / 60)}h ago`;
    let pill = document.getElementById('dash-updated-pill');
    if (!pill) {
        pill = document.createElement('span');
        pill.id = 'dash-updated-pill';
        pill.className = 'dash-updated-pill';
        sub.after(pill);
    }
    pill.innerHTML = `<i class="fas fa-rotate"></i> ${label}${navigator.onLine === false ? ' · offline' : ''}`;
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
        } catch (e) {
            const grid = document.getElementById('modules-grid');
            if (grid) grid.innerHTML = retryCardHTML('loadModules');
            else showToast('Failed to load courses', 'error');
            return;
        }
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
        const topics = (c.topics || []).filter(t => t.url).map(t => {
            return `<div class="topic-item"><a href="${esc(t.url)}" target="_blank"><i class="fas fa-file-lines" style="color:${color};font-size:0.75rem"></i> ${esc(t.name)}</a></div>`;
        }).join('');
        const creditsBadge = c.credits ? `<span class="badge badge-accent" style="font-size:0.7rem"><i class="fas fa-graduation-cap" style="margin-right:4px"></i>${c.credits} Credits</span>` : '';
        const internalsHtml = c.internal_marks ? `<div class="course-internals"><i class="fas fa-clipboard-check"></i> <strong>CA / Internals:</strong> ${esc(c.internal_marks)}</div>` : '';
        return `<div class="card module-card" data-course-id="${esc(c.id)}" style="padding:0;overflow:hidden">
            <div class="module-header" style="border-left:3px solid ${color}">
                <i class="${esc(c.icon || 'fas fa-book')}" style="color:${color}"></i>
                <h3>${esc(c.title)}</h3>
                <div class="module-meta">
                    <span class="code">${esc(c.code)}</span>
                    ${creditsBadge}
                </div>
            </div>
            ${internalsHtml}
            <div class="module-body">${topics || '<p class="text-caption">Materials show up here as faculty share them</p>'}</div>
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
// Inline "couldn't load — retry" card, better than a toast that vanishes
function retryCardHTML(fnName) {
    return `<div class="empty-state retry-card" style="padding:var(--sp-8)">
        <i class="fas fa-wifi"></i>
        <h3>Couldn't load this</h3>
        <p>Check your connection.</p>
        <button class="btn-ghost retry-btn" onclick="${fnName}()"><i class="fas fa-rotate-right"></i> Try again</button>
    </div>`;
}

async function loadAssignments() {
    try {
        assignmentsData = await fetchJSON('/api/assignments');
        renderAssignments(assignmentsData);
    } catch (e) {
        const grid = document.getElementById('assignments-grid');
        if (grid && !assignmentsData.length) grid.innerHTML = retryCardHTML('loadAssignments');
        else showToast('Failed to load assignments', 'error');
    }
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
    } catch (e) {
        const grid = document.getElementById('projects-grid');
        if (grid && !projectsData.length) grid.innerHTML = retryCardHTML('loadProjects');
        else showToast('Failed to load projects', 'error');
    }
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
    } catch (e) {
        const container = document.getElementById('announcements-container');
        if (container && !announcementsData.length) container.innerHTML = retryCardHTML('loadAnnouncements');
        else showToast('Failed to load announcements', 'error');
    }
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

// Schedule → Timetable tab: DB-backed week grid (same data as the dashboard)
async function fetchScheduleTable() {
    const wrap = document.getElementById('tt-tab-content');
    if (!wrap) return;
    if (!wrap.dataset.loaded) {
        wrap.innerHTML = `<div class="skeleton" style="height:220px;border-radius:var(--r-lg)"></div>`;
    }
    try {
        await loadScheduleSems();
        const slots = await getTimetable(currentScheduleSem);

        const semPills = availableScheduleSems.map(s =>
            `<button class="filter-pill ${s === currentScheduleSem ? 'active' : ''}" onclick="selectTTSem(${s})">Sem ${s}</button>`
        ).join('');

        wrap.innerHTML = `
            <div class="tt-toolbar">
                <div class="filter-bar" style="margin-bottom:0">${semPills}</div>
                <div class="tt-legend">
                    <span><span class="tt-legend-dot" style="background:var(--accent)"></span>Now</span>
                    <span><span class="tt-legend-dot" style="background:var(--success)"></span>Lunch</span>
                    <span class="text-caption" style="font-size:0.72rem"><i class="fas fa-hand-pointer"></i> Tap a class for materials</span>
                </div>
            </div>
            <div class="dash-grid-table-container tt-grid-wrap">${buildWeekGridTable(slots, { highlightNow: true, clickable: true })}</div>`;
        wrap.dataset.loaded = '1';

        // Bring today's row into view on small screens
        const liveCell = wrap.querySelector('.tt-live-cell');
        if (liveCell) setTimeout(() => liveCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 150);
    } catch (e) {
        console.error('Timetable load error:', e);
        wrap.innerHTML = `<div class="empty-state" style="padding:var(--sp-8)">
            <i class="fas fa-table-cells"></i>
            <h3>Couldn't load the timetable</h3>
            <p>Check your connection and try again.</p>
        </div>`;
    }
}

window.selectTTSem = function(sem) {
    if (sem === currentScheduleSem) return;
    currentScheduleSem = sem;
    localStorage.setItem('scheduleSem', sem);
    fetchScheduleTable();
}

// ── Timetable API & State ───────────────────────────────────
let currentScheduleSem = parseInt(localStorage.getItem('scheduleSem')) || 1;
let availableScheduleSems = [];
let timetableCache = {};  // sem -> slots[]
const TT_CACHE_TTL = 10 * 60 * 1000; // 10 min

async function getTimetable(sem) {
    if (timetableCache[sem]) return timetableCache[sem];
    const key = `tt_cache_${sem}`;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(key)); } catch (e) { /* corrupt — refetch */ }
    const refresh = fetchJSON(`/api/timetable?sem=${sem}`).then(slots => {
        timetableCache[sem] = slots;
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), slots })); } catch (e) { /* quota */ }
        return slots;
    });
    // Timetables barely change — paint instantly from any stored copy
    // (up to 7 days old) while the background refresh updates the cache.
    if (stored && stored.slots && Date.now() - stored.t < 7 * 24 * 60 * 60 * 1000) {
        timetableCache[sem] = stored.slots;
        refresh.catch(() => {});
        return stored.slots;
    }
    return refresh;
}

function slotTimeRange(slotTime) {
    const m = (slotTime || '').match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let sh = parseInt(m[1]), sm = parseInt(m[2]), eh = parseInt(m[3]), em = parseInt(m[4]);
    if (sh < 8) sh += 12; if (eh < 8) eh += 12;
    return { start: sh * 60 + sm, end: eh * 60 + em };
}

function isBreakSlot(slot) {
    const cl = (slot.subject || '').toLowerCase();
    return cl.includes('break') || cl.includes('lunch');
}

function isFreeSlot(slot) {
    return !slot.subject || slot.subject === '-' || slot.subject === '—';
}

async function loadScheduleSems() {
    if (availableScheduleSems.length) return availableScheduleSems;
    // Cached list paints the dropdown instantly; refresh quietly after.
    try {
        const stored = JSON.parse(localStorage.getItem('tt_sems'));
        if (stored && stored.length) availableScheduleSems = stored;
    } catch (e) { /* ignore */ }
    const refresh = fetchJSON('/api/timetable/semesters').then(sems => {
        if (sems && sems.length) {
            availableScheduleSems = sems;
            try { localStorage.setItem('tt_sems', JSON.stringify(sems)); } catch (e) {}
        }
        return sems;
    }).catch(() => {});
    if (!availableScheduleSems.length) {
        await refresh;
        if (!availableScheduleSems.length) availableScheduleSems = [1, 3, 5, 7];
    }
    if (!availableScheduleSems.includes(currentScheduleSem)) {
        currentScheduleSem = availableScheduleSems[0];
        localStorage.setItem('scheduleSem', currentScheduleSem);
    }
    return availableScheduleSems;
}

// ── Dashboard Timeline ───────────────────────────────────
let dashRefreshTimer = null;
let dashHeroSlots = { live: null, next: null };
let dashChipReg = {};   // 'today' | day name → slot array (for chip → materials lookup)

async function renderDashboardSchedule() {
    try {
        await loadScheduleSems();
        renderDashSemMenu();
        const slots = await getTimetable(currentScheduleSem);

        renderDashHeroCards(slots);
        renderWeekTable(slots);

        clearInterval(dashRefreshTimer);
        dashRefreshTimer = setInterval(() => {
            if (currentSection !== 'dashboard') { clearInterval(dashRefreshTimer); return; }
            renderDashHeroCards(slots);
        }, 60000);
    } catch (e) {
        console.error('Dashboard schedule error:', e);
    }
}

// ── Dashboard semester dropdown ──
function renderDashSemMenu() {
    const menu = document.getElementById('dash-sem-menu');
    const label = document.getElementById('dash-sem-label');
    const picker = document.getElementById('dash-sem-picker');
    if (!menu || !label) return;
    label.textContent = `Sem ${currentScheduleSem}`;
    menu.innerHTML = availableScheduleSems.map(s =>
        `<button class="dash-sem-option ${s === currentScheduleSem ? 'active' : ''}" onclick="selectDashSem(${s})">
            <i class="fas ${s === currentScheduleSem ? 'fa-check' : 'fa-graduation-cap'}"></i> Semester ${s}
        </button>`
    ).join('');
    if (picker) picker.style.display = availableScheduleSems.length > 1 ? '' : 'none';
}

window.toggleDashSemMenu = function() {
    document.getElementById('dash-sem-picker')?.classList.toggle('open');
}

window.selectDashSem = function(sem) {
    document.getElementById('dash-sem-picker')?.classList.remove('open');
    if (sem === currentScheduleSem) return;
    currentScheduleSem = sem;
    localStorage.setItem('scheduleSem', sem);
    renderDashboardSchedule();
}

// Close the sem menu on outside click
document.addEventListener('click', (e) => {
    const picker = document.getElementById('dash-sem-picker');
    if (picker && !picker.contains(e.target)) picker.classList.remove('open');
});

function todayClassSlots(slots) {
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    return (slots || []).filter(s => s.day === todayName).sort((a, b) => a.slot_order - b.slot_order);
}

// When today's classes are done (or it's the weekend), preview the next
// class day instead of leaving a dead "all caught up" card.
function renderTomorrowPreview(slots) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayIdx = new Date().getDay();
    let nextDay = null, label = '', offset = 0;
    for (let i = 1; i <= 7 && !nextDay; i++) {
        const name = dayNames[(todayIdx + i) % 7];
        const daySlots = (slots || []).filter(s => s.day === name && !isBreakSlot(s) && !isFreeSlot(s))
            .sort((a, b) => a.slot_order - b.slot_order);
        if (daySlots.length) { nextDay = daySlots; label = name; offset = i; }
    }

    const doneCard = (msg) => `<div class="dash-hero-combined-card" style="width: 100%; background: var(--bg-0); padding: 24px; border-radius: 24px; box-shadow: var(--shadow-md); border: 1px solid var(--border);">
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-1);"><i class="fas fa-check-circle" style="color:var(--success);"></i> You're all caught up!</div>
        <div style="font-size: 0.85rem; color: var(--text-2); margin-top: 4px;">${msg}</div>
    </div>`;

    if (!nextDay) return doneCard('No more classes right now.');

    const first = nextDay[0];
    const startTime = (first.slot_time || '').split(/[-–]/)[0].trim();
    const dayLabel = offset === 1 ? 'Tomorrow' : label;
    const labCount = nextDay.filter(s => /lab/i.test(s.subject)).length;
    // Distinct class blocks (merged labs count once), same merge rule as the grid
    let blocks = 0, prev = null;
    nextDay.forEach(s => { if (!prev || prev.subject !== s.subject || prev.room !== s.room) blocks++; prev = s; });

    return `<div class="dash-hero-combined-card" style="width: 100%;">
        <div style="flex:1;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--violet); text-transform: uppercase; margin-bottom: 6px;">
                <i class="fas fa-moon" style="margin-right:6px;"></i>${dayLabel.toUpperCase()}'S PLAN
            </div>
            <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-1); margin-bottom: 8px;">
                Starts ${startTime} with ${esc(first.subject)}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-2); display:flex; flex-wrap:wrap; gap: 6px 16px;">
                <span><i class="fas fa-layer-group" style="width:16px;"></i> ${blocks} class${blocks > 1 ? 'es' : ''}</span>
                ${labCount ? `<span><i class="fas fa-flask" style="width:16px;"></i> ${labCount > 1 ? labCount + ' labs' : 'has a lab'}</span>` : ''}
                <span><i class="fas fa-location-dot" style="width:16px;"></i> ${esc(first.room || 'TBA')} first</span>
            </div>
        </div>
    </div>`;
}

function renderDashHeroCards(slots) {
    const wrap = document.getElementById('dash-hero-cards');
    if (!wrap) return;

    const todaySlots = todayClassSlots(slots).filter(s => !isBreakSlot(s) && !isFreeSlot(s));
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let live = null, next = null;
    for (let s of todaySlots) {
        const t = slotTimeRange(s.slot_time);
        if (!t) continue;
        if (nowMin >= t.start && nowMin < t.end) live = s;
        else if (nowMin < t.start && !next) next = s;
    }

    dashHeroSlots.live = live;
    dashHeroSlots.next = next;
    heroStripReg = todaySlots;

    if (!todaySlots.length || (!live && !next)) {
        // day over or no classes — tomorrow preview takes the stage
        wrap.innerHTML = dayTimelineHTML(todaySlots, nowMin) + renderTomorrowPreview(slots);
        return;
    }

    // One horizontal strip: every class today as a compact card.
    // Done classes grey out, the live one glows, scroll right for what's ahead.
    const cards = todaySlots.map((slot, i) => {
        const t = slotTimeRange(slot.slot_time);
        const isLive = t && nowMin >= t.start && nowMin < t.end;
        const isPast = t && nowMin >= t.end;
        const isNext = slot === next;

        let stateClass = isLive ? 'live' : isPast ? 'past' : 'upcoming';
        let tag, tagStyle = '';
        if (isLive) {
            tag = `<span class="hero-slot-dot"></span> NOW`;
        } else if (isPast) {
            tag = `<i class="fas fa-check" style="font-size:0.6rem"></i> DONE`;
        } else if (isNext) {
            tag = `UP NEXT`;
        } else {
            tag = esc((slot.slot_time || '').split(/[-–]/)[0].trim());
        }

        let meta;
        if (isLive) {
            const rem = t.end - nowMin;
            const pct = Math.min(100, Math.max(0, Math.round(((nowMin - t.start) / (t.end - t.start)) * 100)));
            meta = `<div class="hero-slot-meta"><i class="fas fa-clock"></i> ${rem} min left · ${esc(slot.room || 'TBA')}</div>
                <div class="hero-progress"><div class="hero-progress-fill" style="width:${pct}%"></div></div>`;
        } else if (isPast) {
            meta = `<div class="hero-slot-meta">${esc(slot.slot_time || '')}</div>`;
        } else {
            const startsIn = t ? t.start - nowMin : null;
            meta = `<div class="hero-slot-meta">${isNext && startsIn !== null ? `<i class="fas fa-hourglass-start"></i> in ${startsIn} min · ` : ''}${esc(slot.room || 'TBA')}</div>
                <div class="hero-slot-meta"><i class="fas fa-user-tie"></i> ${esc(slot.faculty || 'TBA')}</div>`;
        }

        return `<div class="hero-slot-card ${stateClass}" onclick="openCourseFromStrip(${i})">
            <div class="hero-slot-tag">${tag}</div>
            <div class="hero-slot-subject">${esc(slot.subject)}</div>
            ${meta}
        </div>`;
    }).join('');

    wrap.innerHTML = dayTimelineHTML(todaySlots, nowMin) +
        `<div class="hero-strip" id="hero-strip">${cards}</div>`;

    // bring the live (or next) class into view
    setTimeout(() => {
        const target = wrap.querySelector('.hero-slot-card.live') || wrap.querySelector('.hero-slot-card.upcoming');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 120);
}

let heroStripReg = [];
window.openCourseFromStrip = function(i) {
    if (heroStripReg[i]) openCourseForSlot(heroStripReg[i]);
}

// Big horizontal day timeline — one rainbow bar for the whole college day.
// Filled (full color) up to now, upcoming part sits faded; ticks mark each
// class boundary and a dot shows where "now" is between first and last class.
function dayTimelineHTML(todaySlots, nowMin) {
    if (!todaySlots.length) return '';
    let dayStart = null, dayEnd = null;
    const bounds = new Set();
    for (const s of todaySlots) {
        const t = slotTimeRange(s.slot_time);
        if (!t) continue;
        if (dayStart === null || t.start < dayStart) dayStart = t.start;
        if (dayEnd === null || t.end > dayEnd) dayEnd = t.end;
        bounds.add(t.start); bounds.add(t.end);
    }
    if (dayStart === null || dayEnd <= dayStart) return '';

    const span = dayEnd - dayStart;
    const pct = Math.min(100, Math.max(0, ((nowMin - dayStart) / span) * 100));
    const done = nowMin >= dayEnd;

    const ticks = [...bounds]
        .filter(b => b > dayStart && b < dayEnd)
        .map(b => `<span class="day-tl-tick" style="left:${(((b - dayStart) / span) * 100).toFixed(2)}%"></span>`)
        .join('');

    const label = done ? 'Day complete' :
        nowMin < dayStart ? `Day starts ${fmtMin(dayStart)}` :
        `${Math.round(pct)}% of the day done`;

    return `
    <div class="day-timeline">
        <div class="day-tl-head">
            <span class="day-tl-time">${fmtMin(dayStart)}</span>
            <span class="day-tl-label">${label}</span>
            <span class="day-tl-time">${fmtMin(dayEnd)}</span>
        </div>
        <div class="day-tl-track">
            <div class="day-tl-rainbow"></div>
            <div class="day-tl-veil" style="left:${pct.toFixed(2)}%"></div>
            ${ticks}
            ${!done && nowMin >= dayStart ? `<span class="day-tl-now" style="left:${pct.toFixed(2)}%"></span>` : ''}
        </div>
    </div>`;
}

// End time (minutes) of the most recently finished class today, or null if none ended yet
function lastEndedSlotEnd(todaySlots, nowMin) {
    let end = null;
    for (const s of todaySlots) {
        const t = slotTimeRange(s.slot_time);
        if (t && nowMin >= t.end && (end === null || t.end > end)) end = t.end;
    }
    return end;
}

function fmtMin(min) {
    let h = Math.floor(min / 60), m = min % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// Today's Schedule strip now lives inside the hero (renderDashHeroCards) —
// this stays only to clear the old container.
function renderTodayTimeline(slots) {
    const wrap = document.getElementById('dash-today-section');
    if (wrap) wrap.innerHTML = '';
    return;
    // (legacy code below is unreachable, kept for reference)

    const todaySlots = todayClassSlots(slots).filter(s => !isBreakSlot(s) && !isFreeSlot(s));
    dashChipReg['today'] = todaySlots;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let stripHtml = `<div class="dash-strip">` + todaySlots.map((s, i) => {
        const t = slotTimeRange(s.slot_time);
        const isNow = t && nowMin >= t.start && nowMin < t.end;
        const isPast = t && nowMin >= t.end;
        return dashChipHTML(s, isNow, isPast, 'today', i);
    }).join('') + `</div>`;

    wrap.innerHTML = `
        <div class="dash-section-title" style="margin-bottom: 16px;"><span><i class="fas fa-calendar-day" style="margin-right:8px; color:var(--accent);"></i>Today's Schedule</span></div>
        <div>${todaySlots.length ? stripHtml : '<div style="font-size:0.85rem; color:var(--text-3); padding: 12px; background: var(--bg-1); border-radius: 16px;">No classes today.</div>'}</div>
    `;
    
    setTimeout(() => {
        const liveEl = wrap.querySelector('.dash-chip.live');
        if (liveEl) {
            liveEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, 100);
}

// ── Shared week-grid builder (dashboard fold + Schedule → Timetable tab) ──
let ttSlotReg = [];  // slot registry for clickable timetable cells

function buildWeekGridTable(slots, opts = {}) {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const thStyle = "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 100%;";
    const subThStyle = "font-size: 0.65rem; color: var(--text-3); font-weight: normal; font-family: var(--font-mono);";
    const periods = [['P1', '8:45-9:35'], ['P2', '9:40-10:30'], ['P3', '10:35-11:25'], ['P4', '11:30-12:20'], ['P5', '12:25-1:15'], ['P6', '1:20-2:10'], ['P7', '2:15-3:05'], ['P8', '3:10-4:00']];
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (opts.clickable) ttSlotReg = [];

    let html = `<table class="dash-grid-table"><thead><tr><th>Day</th>`
        + periods.map(p => `<th><div style="${thStyle}"><span>${p[0]}</span><span style="${subThStyle}">(${p[1]})</span></div></th>`).join('')
        + `</tr></thead><tbody>`;

    dayOrder.forEach(d => {
        const isToday = !!opts.highlightNow && d === todayName;
        let rowHtml = `<tr${isToday ? ' class="tt-today-row"' : ''}><th>${d.slice(0, 3)}</th>`;
        const dSlots = (slots || []).filter(s => s.day === d);

        let p = 1;
        while (p <= 8) {
            const slot = dSlots.find(s => s.slot_order === p);
            if (slot) {
                // Determine colspan
                let colspan = 1;
                let nextP = p + 1;
                while (nextP <= 8) {
                    const nextSlot = dSlots.find(s => s.slot_order === nextP);
                    if (nextSlot && nextSlot.subject === slot.subject && nextSlot.room === slot.room) {
                        colspan++;
                        nextP++;
                    } else {
                        break;
                    }
                }

                let cellClass = "slot-regular";
                if (isBreakSlot(slot)) cellClass = "slot-lunch";
                else if (slot.subject_code && slot.subject_code.includes('29A')) cellClass = "slot-pink";

                // Live-now highlight — span whole merged block (labs run 2-3 periods)
                const tStart = slotTimeRange(slot.slot_time);
                const lastSlot = dSlots.find(s => s.slot_order === p + colspan - 1) || slot;
                const tEnd = slotTimeRange(lastSlot.slot_time) || tStart;
                const isLive = isToday && tStart && !isBreakSlot(slot)
                    && nowMin >= tStart.start && nowMin < tEnd.end;
                if (isLive) cellClass += " tt-live-cell";

                let clickAttr = '';
                if (opts.clickable && !isBreakSlot(slot) && !isFreeSlot(slot)) {
                    clickAttr = ` onclick="openCourseFromTT(${ttSlotReg.length})" title="Open course materials"`;
                    cellClass += " tt-click";
                    ttSlotReg.push(slot);
                }

                // Formatting text inside
                let text = "";
                if (isBreakSlot(slot)) {
                    text = `<div style="font-weight: 800; color: var(--success); letter-spacing: 1px; font-size: 0.85rem;">L.U.N.C.H</div>`;
                } else {
                    // Create short form of subject name
                    let shortName = esc(slot.subject);
                    if (shortName.length > 12) {
                        const ignoreWords = ['of', 'and', 'the', 'in', 'for', 'to', 'a', 'an'];
                        const isLab = shortName.toLowerCase().includes('lab');
                        const isTute = shortName.toLowerCase().includes('tutorial');

                        let acronym = shortName.replace(/[^a-zA-Z0-9\s-]/g, '').split(/[\s-]+/)
                            .filter(w => w && !ignoreWords.includes(w.toLowerCase()) && w.toLowerCase() !== 'lab' && w.toLowerCase() !== 'tutorial')
                            .map(w => {
                                // If word is roman numeral I, II, III etc, keep it
                                if (/^(I|II|III|IV|V|VI)$/i.test(w)) return w.toUpperCase();
                                return w[0].toUpperCase();
                            })
                            .join('');

                        if (isLab) acronym += " (L)";
                        if (isTute) acronym += " (T)";

                        // Use acronym if it's meaningful, else fallback
                        if (acronym.length > 1) shortName = acronym;
                    }

                    text = `<div style="font-weight: 700; color: var(--text-1); font-size: 0.85rem;">${shortName}</div>`;
                    if (slot.room) {
                        text += `<div style="font-weight: 500; font-size: 0.75rem; color: var(--text-2); margin-top: 4px;">in ${esc(slot.room)}</div>`;
                    }
                    if (slot.faculty) {
                        text += `<div style="font-size:0.75rem; color:var(--text-3); font-weight: 500; margin-top:2px;"><i class="fas fa-user-tie" style="margin-right:3px;"></i>${esc(slot.faculty)}</div>`;
                    }
                    if (isLive) text += `<div class="tt-now-badge">NOW</div>`;
                }

                rowHtml += `<td class="${cellClass}" colspan="${colspan}"${clickAttr}>${text}</td>`;
                p += colspan;
            } else {
                rowHtml += `<td></td>`;
                p++;
            }
        }
        rowHtml += `</tr>`;
        html += rowHtml;
    });
    return html + `</tbody></table>`;
}

window.openCourseFromTT = function(idx) {
    if (ttSlotReg[idx]) openCourseForSlot(ttSlotReg[idx]);
}

function renderWeekTable(slots) {
    const wrap = document.getElementById('dash-week-section');
    if (!wrap) return;

    // On phones the full week table is overwhelming — start it folded there,
    // open on desktop where there's room
    const startFolded = window.innerWidth <= 640;
    let tableHtml = `
    <button class="dash-info-dropdown-btn" onclick="toggleWeekGrid()" style="margin-bottom: 12px;">
        <span class="dash-section-title" style="font-size:1.05rem;"><i class="fas fa-calendar-week" style="margin-right:8px; color:var(--accent);"></i>CSBS — Semester ${currentScheduleSem}</span>
        <i class="fas fa-chevron-down" id="week-grid-arrow" style="transition: transform 0.2s; transform: rotate(${startFolded ? 0 : 180}deg);"></i>
    </button>
    <div class="dash-grid-table-container" id="week-grid-content" ${startFolded ? 'style="display:none"' : ''}>${buildWeekGridTable(slots, { highlightNow: true })}</div>`;

    // SUBJECT ALLOCATION table
    const uniqueSubjects = {};
    (slots || []).forEach(s => {
        if (!isBreakSlot(s) && !isFreeSlot(s)) {
            uniqueSubjects[s.subject] = { code: s.subject_code, teacher: s.faculty };
        }
    });

    let allocRows = Object.keys(uniqueSubjects).map(sub => {
        const info = uniqueSubjects[sub];
        let ltpe = "3-0-0-0"; 
        if (typeof modulesData !== 'undefined' && modulesData) {
            const m = modulesData.find(c => c.code === info.code || c.title === sub);
            if (m && m.credits) ltpe = `${m.credits}-0-0-0`;
        }
        return `
            <tr>
                <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-2);">${esc(info.code || '--')}</td>
                <td style="font-weight: 500; color: var(--text-1);">${esc(sub)}</td>
                <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-2);">${esc(ltpe)}</td>
                <td style="color: var(--text-2);">${esc(info.teacher || 'TBA')}</td>
            </tr>
        `;
    }).join('');

    let allocTable = `
    <button class="dash-info-dropdown-btn" onclick="toggleFacultyInfo()" style="margin-top: 24px;">
        <span><i class="fas fa-list-ul" style="margin-right: 8px; color: var(--accent);"></i> Subject Allocation & Faculty</span>
        <i class="fas fa-chevron-down" id="faculty-info-arrow" style="transition: transform 0.2s;"></i>
    </button>
    <div class="dash-info-dropdown-content" id="faculty-info-content" style="display: none;">
        <div style="overflow-x: auto;">
            <table class="dash-alloc-table">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Subject Name</th>
                        <th>LTPE</th>
                        <th>Faculty</th>
                    </tr>
                </thead>
                <tbody>
                    ${allocRows || '<tr><td colspan="4" style="text-align:center;">No subjects found</td></tr>'}
                </tbody>
            </table>
        </div>
    </div>
    `;

    wrap.innerHTML = tableHtml + allocTable;
}

// Week grid folds to just its header when clicked
window.toggleWeekGrid = function() {
    const content = document.getElementById('week-grid-content');
    const arrow = document.getElementById('week-grid-arrow');
    if (!content) return;
    const folded = content.style.display === 'none';
    content.style.display = folded ? '' : 'none';
    if (arrow) arrow.style.transform = folded ? 'rotate(180deg)' : 'rotate(0deg)';
}

window.toggleFacultyInfo = function() {
    const content = document.getElementById('faculty-info-content');
    const arrow = document.getElementById('faculty-info-arrow');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

window.toggleChipDetail = function(el) {
    const detail = el.querySelector('.dash-chip-detail');
    if (!detail) return;
    const isOpened = detail.style.display === 'flex';
    
    if (!isOpened) {
        detail.style.display = 'flex';
        el.style.height = 'auto';
    } else {
        detail.style.display = 'none';
    }
}

function dashChipHTML(s, isNow, isPast, group, idx) {
    const startTime = (s.slot_time || '').split(/[-–]/)[0].trim();
    return `
        <div class="dash-chip ${isNow ? 'live' : ''} ${isPast ? 'past' : ''}" onclick="toggleChipDetail(this)">
            <div class="dash-chip-header" style="display:flex; align-items:flex-start; gap:12px;">
                <div class="dash-chip-time" style="font-family:var(--font-mono); font-weight:600; font-size:0.8rem; color: ${isNow ? 'var(--accent)' : 'var(--text-3)'}; margin-top: 2px;">${esc(startTime)}</div>
                <div class="dash-chip-info" style="display:flex; flex-direction:column; gap:4px; flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.95rem; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(s.subject)}</div>
                    <div style="font-size:0.75rem; color:var(--text-2);"><i class="fas fa-location-dot"></i> ${esc(s.room || 'TBA')}</div>
                </div>
            </div>
            
            <div class="dash-chip-detail" style="display:none; flex-direction:column; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
                <div style="font-size:0.85rem; color:var(--text-2); display:flex; align-items:center; gap:8px;"><i class="fas fa-user" style="width:16px;"></i> ${esc(s.faculty || 'TBA')}</div>
                <div style="font-size:0.85rem; color:var(--text-2); display:flex; align-items:center; gap:8px;"><i class="fas fa-barcode" style="width:16px;"></i> ${esc(s.subject_code || '--')}</div>
                <div style="font-size:0.85rem; color:var(--text-2); display:flex; align-items:center; gap:8px;"><i class="fas fa-clock" style="width:16px;"></i> ${esc(s.slot_time)}</div>
                <button onclick="event.stopPropagation(); openCourseFromChip('${group}', ${idx})" style="margin-top:8px; width:100%; padding:8px; border-radius:12px; background:var(--accent-muted); color:var(--accent); font-weight:700; font-size:0.85rem; border:none; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--accent-muted)'"><i class="fas fa-book-open"></i> Go to Course</button>
            </div>
        </div>
    `;
}

window.openCourseFromChip = function(group, idx) {
    const slots = dashChipReg[group];
    if (slots && slots[idx]) openCourseForSlot(slots[idx]);
}

window.openCourseFromHero = function(type) {
    const slot = dashHeroSlots[type];
    if (slot) openCourseForSlot(slot);
}

// Find the course matching a timetable slot and jump to its materials
async function openCourseForSlot(slot) {
    if (!modulesData.length) {
        try { modulesData = await fetchJSON('/api/modules'); }
        catch (e) { showToast('Could not load courses', 'error'); return; }
    }
    const norm = str => (str || '').toLowerCase().replace(/\s*\((l|t)\)\s*$/, '').replace(/\s+(lab|tutorial)$/, '').replace(/[^a-z0-9]/g, '');
    const subj = norm(slot.subject);
    const course = modulesData.find(c => slot.subject_code && c.code === slot.subject_code)
        || modulesData.find(c => norm(c.title) === subj)
        || modulesData.find(c => subj && (norm(c.title).includes(subj) || subj.includes(norm(c.title))));
    if (!course) {
        showToast(`No course materials for "${slot.subject}" yet`, 'error');
        return;
    }
    // Land on the right semester, then highlight the card
    currentSemester = course.semester || 1;
    localStorage.setItem('semester', currentSemester);
    navigate('modules');
    setTimeout(() => {
        const card = document.querySelector(`.module-card[data-course-id="${course.id}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('course-flash');
            setTimeout(() => card.classList.remove('course-flash'), 2400);
        }
    }, 350);
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
        // Same stale-while-revalidate trick for the CSV — Google Sheets can be
        // slow (server proxies it), so paint from the last copy instantly
        const csvKey = 'swr_att_csv';
        let csv = null, stored = null;
        try { stored = JSON.parse(localStorage.getItem(csvKey)); } catch (e) { }
        const refresh = fetchText(ATTENDANCE_CSV).then(text => {
            try { localStorage.setItem(csvKey, JSON.stringify({ t: Date.now(), text })); } catch (e) { }
            return text;
        });
        if (stored && Date.now() - stored.t < SWR_MAX_STALE) {
            csv = stored.text;
            refresh.catch(() => {});
        } else {
            csv = await refresh;
        }
        const rows = csv.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')));
        if (rows.length < 2) return;
        const parsed = rows.slice(1).filter(r => r.length >= 6).map((r, i) => ({
            sno: i + 1, usn: r[1] || '', name: r[2] || '',
            attended: parseInt(r[3]) || 0, total: parseInt(r[4]) || 0,
            percentage: parseFloat(r[5]) || 0
        }));
        if (!attendanceData.length) attendanceData = parsed;

        const avg = Math.round(parsed.reduce((s, a) => s + a.percentage, 0) / parsed.length);
        const attEl = document.getElementById('stat-attendance');
        const sub = document.getElementById('stat-attendance-sub');
        animateNumber('stat-attendance', avg);
        setTimeout(() => { attEl.textContent = avg + '%'; }, 900);
        const lowCount = parsed.filter(a => a.percentage < 75).length;
        sub.innerHTML = lowCount > 0
            ? `<i class="fas fa-triangle-exclamation" style="color:var(--warning)"></i> ${lowCount} below 75%`
            : `<i class="fas fa-arrow-trend-up" style="color:var(--success)"></i> Class average`;
    } catch (e) {
        document.getElementById('stat-attendance-sub').textContent = 'Could not load';
        console.error('Attendance fetch for dashboard:', e);
    }
}

// Match the logged-in user to their attendance row: exact name, then
// name-parts overlap, then USN digits found in the university email.
// NOTE: built but intentionally NOT wired to the dashboard yet — waiting
// on the class teacher's OK for attendance data. Flip csbs_show_my_att
// in localStorage (or call this from renderStatCards) when approved.
function findMyAttendanceRow(rows) {
    const normName = s => (s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
    const me = normName(userProfile.name);
    if (me) {
        let hit = rows.find(r => normName(r.name) === me);
        if (hit) return hit;
        const myParts = me.split(' ').filter(p => p.length > 2);
        if (myParts.length) {
            hit = rows.find(r => {
                const rp = normName(r.name).split(' ');
                return myParts.every(p => rp.includes(p));
            });
            if (hit) return hit;
        }
    }
    // juug25btech26920@... — the digits usually appear in the USN
    const m = (userProfile.email || '').match(/(\d{4,})@/);
    if (m) {
        const hit = rows.find(r => (r.usn || '').replace(/\D/g, '').includes(m[1]));
        if (hit) return hit;
    }
    return null;
}

// "You can miss N more classes" (or "must attend the next N") to stay ≥75%
function bunkMeterText(row) {
    if (!row.total) return `<i class="fas fa-user"></i> Your attendance`;
    const TARGET = 0.75;
    if (row.percentage >= 75) {
        // attended / (total + x) >= 0.75  →  x <= attended/0.75 - total
        const canMiss = Math.floor(row.attended / TARGET - row.total);
        return canMiss > 0
            ? `<i class="fas fa-umbrella-beach" style="color:var(--success)"></i> You can miss ${canMiss} more class${canMiss > 1 ? 'es' : ''}`
            : `<i class="fas fa-scale-balanced" style="color:var(--warning)"></i> Right at the edge — don't skip`;
    }
    // (attended + x) / (total + x) >= 0.75  →  x >= (0.75·total − attended)/0.25
    const mustAttend = Math.ceil((TARGET * row.total - row.attended) / (1 - TARGET));
    return `<i class="fas fa-person-running" style="color:var(--danger)"></i> Attend the next ${mustAttend} to reach 75%`;
}

// ── Greeting ────────────────────────────────────
let userProfile = { name: '', email: '' };  // filled from auth check; used to find "my" attendance row
async function initGreeting() {
    let name = 'there';
    try {
        // Reuse the auth check the page already fired in <head> — no 2nd request
        const res = window.__authCheck
            ? await window.__authCheck
            : await fetch('/api/auth/check', { credentials: 'same-origin' });
        if (res && res.ok) {
            const data = await res.json();
            name = data.name || 'there';
            userProfile = { name: data.name || '', email: data.email || '' };
            try { localStorage.setItem('csbs_profile', JSON.stringify(userProfile)); } catch (e) {}
            // Reveal the admin shortcut for admins
            if (data.is_admin) document.getElementById('admin-link')?.classList.remove('hidden');
        }
    } catch (e) { /* fallback to 'there' */ }
    if (!userProfile.name) {
        // Offline or auth check raced — last known profile still lets us personalize
        try { userProfile = JSON.parse(localStorage.getItem('csbs_profile')) || userProfile; } catch (e) {}
        if (userProfile.name) name = userProfile.name;
    }

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

// Stale-while-revalidate JSON: serve the last copy instantly from
// localStorage (survives closing the tab — every open paints instantly),
// refresh it in the background. First visit ever fetches normally.
const SWR_TTL = 5 * 60 * 1000;        // serve without waiting if newer than 5 min
const SWR_MAX_STALE = 24 * 60 * 60 * 1000; // still paint with data up to a day old
async function cachedJSON(url) {
    const key = `swr_${url}`;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(key)); } catch (e) { /* corrupt */ }
    const refresh = fetchJSON(url).then(data => {
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch (e) { /* quota */ }
        return data;
    });
    if (stored && Date.now() - stored.t < SWR_MAX_STALE) {
        refresh.catch(() => {}); // background refresh; ignore failures, we have data
        return stored.data;
    }
    return refresh;
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

// Refetch on tab focus — but only if we were away a while, so quick
// app-switches (especially on mobile) don't re-trigger full reloads
let lastHiddenAt = 0;
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lastHiddenAt = Date.now(); return; }
    if (Date.now() - lastHiddenAt > 2 * 60 * 1000) loadSection(currentSection);
});

// ── PWA: offline support + Add to Home Screen ───
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
window.addEventListener('offline', () => showToast('You\'re offline — showing saved data', 'info'));
window.addEventListener('online', () => { showToast('Back online', 'success'); loadSection(currentSection); });

// ── Ambient background dots — drift slowly, shy away from the cursor ──
// A sparse field of tiny dots behind the content. Each drifts on its own,
// and gets gently pushed away when the pointer comes near, then eases home.
(function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'bg-dots';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, dots = [];
    let mx = -9999, my = -9999;          // pointer position (offscreen = inert)
    const RADIUS = 130;                   // how close the cursor has to get

    function build() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = innerWidth; H = innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // density scales with area, capped so phones stay light
        const n = Math.min(110, Math.round((W * H) / 11000));
        dots = Array.from({ length: n }, () => {
            const hx = Math.random() * W, hy = Math.random() * H;
            return {
                hx, hy,                     // home position it eases back to
                x: hx, y: hy,
                r: 1 + Math.random() * 1.8, // tiny
                a: 0.05 + Math.random() * 0.08,
                ph: Math.random() * Math.PI * 2,           // drift phase
                sp: 0.0004 + Math.random() * 0.0006        // drift speed
            };
        });
    }
    build();
    window.addEventListener('resize', build);

    function ink() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? '196,181,253' : '20,20,20';
    }

    let last = 0;
    function tick(now) {
        // ~30fps is plenty for ambience and halves the battery cost
        if (now - last < 33) { requestAnimationFrame(tick); return; }
        last = now;

        ctx.clearRect(0, 0, W, H);
        const rgb = ink();
        for (const d of dots) {
            // slow figure-8 drift around home
            d.ph += d.sp * 33;
            let gx = d.hx + Math.sin(d.ph) * 14;
            let gy = d.hy + Math.sin(d.ph * 2) * 9;

            // cursor repulsion — push the goal point away, dot eases after it
            const dx = gx - mx, dy = gy - my;
            const dist = Math.hypot(dx, dy);
            if (dist < RADIUS && dist > 0.01) {
                const f = (1 - dist / RADIUS) * 46;
                gx += (dx / dist) * f;
                gy += (dy / dist) * f;
            }
            d.x += (gx - d.x) * 0.06;
            d.y += (gy - d.y) * 0.06;

            // dots near the cursor glow a touch brighter
            const near = dist < RADIUS ? (1 - dist / RADIUS) : 0;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r + near * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${rgb},${(d.a + near * 0.1).toFixed(3)})`;
            ctx.fill();
        }
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });
    document.addEventListener('mouseleave', () => { mx = -9999; my = -9999; });
    window.addEventListener('touchmove', e => {
        const t = e.touches[0]; mx = t.clientX; my = t.clientY;
    }, { passive: true });
    window.addEventListener('touchend', () => { mx = -9999; my = -9999; }, { passive: true });

    // note: requestAnimationFrame auto-pauses while the tab is hidden,
    // so the field costs nothing in the background
})();

// ── Magnetic UI — cards tilt toward the cursor, small controls lean in ──
// One delegated mousemove does everything: the element under the cursor
// gets a light 3D tilt (cards) or a magnetic pull (buttons/chips/pills).
// Desktop only — hover doesn't exist on touch, and phones get the ribbon+dots.
(function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const TILT_SEL = '.card, .stat-card, .dash-hero-combined-card, .hero-slot-card, .module-card';
    const MAG_SEL = '.dash-chip, .filter-pill, .btn-ghost, .priority-item, .sidebar-item, .dash-sem-btn, .retry-btn';
    let active = null, activeKind = null;

    function reset(el, kind) {
        if (!el) return;
        el.style.transform = '';
        el.style.boxShadow = '';
        el.style.transition = kind === 'tilt'
            ? 'transform 0.5s var(--ease-out), box-shadow 0.5s var(--ease-out)'
            : 'transform 0.35s var(--ease-spring)';
        // let the element's own CSS transitions take back over afterwards
        setTimeout(() => { if (el !== active) el.style.transition = ''; }, 500);
    }

    window.addEventListener('mousemove', e => {
        const tiltEl = e.target.closest(TILT_SEL);
        const magEl = !tiltEl && e.target.closest(MAG_SEL);
        const el = tiltEl || magEl;
        const kind = tiltEl ? 'tilt' : 'mag';

        if (el !== active) { reset(active, activeKind); active = el; activeKind = el ? kind : null; }
        if (!el) return;

        const r = el.getBoundingClientRect();
        // cursor position within the element, -0.5 … 0.5
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;

        el.style.transition = 'transform 0.12s ease-out, box-shadow 0.12s ease-out';
        if (kind === 'tilt') {
            // big surfaces: subtle 3D tilt + tiny lift, like the card is looking at you
            const max = r.width > 500 ? 1.9 : 3.5;      // wide cards tilt less
            el.style.transform =
                `perspective(700px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-3px)`;
            // cursor = light source: shadow falls away from it, deepest at the
            // far corner. Hover a corner and the opposite corner grounds the card.
            const dark = document.documentElement.getAttribute('data-theme') === 'dark';
            const a = dark ? 0.65 : 0.16;
            el.style.boxShadow =
                `${(-px * 26).toFixed(1)}px ${(-py * 26).toFixed(1)}px 34px -6px rgba(0,0,0,${a}), ` +
                `0 3px 8px rgba(0,0,0,${dark ? 0.4 : 0.07})`;
        } else {
            // small controls: slide a few px toward the cursor + gentle pop
            el.style.transform =
                `translate(${(px * 7).toFixed(1)}px, ${(py * 7).toFixed(1)}px) scale(1.05)`;
        }
    }, { passive: true });

    // snap everything back when the mouse leaves the window
    document.addEventListener('mouseleave', () => {
        reset(active, activeKind); active = null; activeKind = null;
    });
})();
