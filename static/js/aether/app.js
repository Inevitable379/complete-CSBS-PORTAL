/* ============================================================
   AETHER — Main Application
   Navigation, data fetching, rendering, 3D integration
   ============================================================ */

import * as THREE from 'three';
import { initScene, animate as sceneAnimate, highlightSection, getCamera, WING_COLORS } from './scene.js';
import { initCamera, flyTo, playEntrance, setExploreMode, getExploreMode, updateCamera, setProximityCallback, getCurrentSection, setRailCallbacks, VOYAGE_ORDER, getVoyageT } from './camera.js';

// ── Constants ───────────────────────────────────────────────
const API_BASE = '';
const SCHEDULE_CSV = '/api/sheets/schedule';
const ATTENDANCE_CSV = '/api/sheets/attendance';

// ── State ───────────────────────────────────────────────────
let currentSection = 'dashboard';
let modulesData = [];
let assignmentsData = [];
let projectsData = [];
let announcementsData = [];
let examsData = [];
let attendanceData = [];
let attendanceSort = 'default';
let currentSemester = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calEvents = {};
let calSelectedDay = null;
let scheduleTabActive = 'calendar';

// ── Boot ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Show loading
    updateLoadingStatus('Initializing environment...', 20);

    // Init Three.js scene
    const canvas = document.getElementById('aether-canvas');
    const { scene, camera, renderer } = initScene(canvas);

    updateLoadingStatus('Building command center...', 50);

    // Init camera
    initCamera(camera);

    // Set up proximity detection for explore mode
    setProximityCallback((section) => {
        navigate(section, false); // don't fly camera, we're already there
    });

    // Voyage rail: panels dock in when you arrive, slide out when you leave
    setRailCallbacks({
        onArrive: (section) => {
            if (currentSection !== section) {
                currentSection = section;
                syncNavUI(section);
                loadSection(section);
            }
            showPanel(section);
        },
        onDepart: () => {
            hideCurrentPanel();
        },
        onProgress: updateVoyageLine,
    });
    buildVoyageLine();

    updateLoadingStatus('Loading systems...', 75);

    // Start render loop
    startRenderLoop();

    // Init UI
    initGreeting();
    initKeyboard();
    initNavigation();

    updateLoadingStatus('AETHER online', 100);

    // Play entrance animation after brief delay
    setTimeout(() => {
        const loading = document.getElementById('aether-loading');
        if (loading) loading.classList.add('done');

        playEntrance(() => {
            navigate('dashboard');
        });
    }, 1200);
});

// ── Render Loop ─────────────────────────────────────────────
function startRenderLoop() {
    function loop() {
        requestAnimationFrame(loop);
        updateCamera();
    }
    sceneAnimate(); // Three.js scene animation
    loop(); // Camera updates
}

// ── Loading Screen ──────────────────────────────────────────
function updateLoadingStatus(text, percent) {
    const status = document.getElementById('loading-status');
    const bar = document.getElementById('loading-bar-fill');
    if (status) status.textContent = text;
    if (bar) bar.style.width = percent + '%';
}

// ── Navigation ──────────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', () => {
            navigate(item.dataset.section);
        });
    });
}

window.navigate = navigate; // expose globally for inline handlers

const SECTION_TITLES = {
    dashboard: 'Command Core',
    modules: 'Research Archives',
    assignments: 'Logistics Bay',
    projects: 'Engineering Shipyard',
    announcements: 'Communications',
    schedule: 'Navigation Systems',
    attendance: 'Reactor Core',
    gpa: 'Observatory',
};

function syncNavUI(section) {
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });
    const sectionTitle = document.getElementById('section-title');
    if (sectionTitle) sectionTitle.textContent = SECTION_TITLES[section] || section;
    highlightSection(section);
    applyWingTheme(section);
    updateStationChart(section);
}

function navigate(section, flyCamera = true) {
    if (currentSection === section && document.querySelector('.aether-panel.visible')) return;

    currentSection = section;
    syncNavUI(section);

    // Fly camera to section (rail's onArrive shows the panel)
    if (flyCamera && !getExploreMode()) {
        flyTo(section, 2.0);
    } else {
        hideCurrentPanel();
        setTimeout(() => showPanel(section), 100);
    }

    // Load data
    loadSection(section);
}

function hideCurrentPanel() {
    const activePanel = document.querySelector('.aether-panel.visible');
    if (activePanel) {
        activePanel.classList.add('exiting');
        activePanel.classList.remove('visible');
        setTimeout(() => {
            activePanel.classList.remove('exiting');
            activePanel.style.display = 'none';
        }, 350);
    }
}

function showPanel(section) {
    // Hide all panels first
    document.querySelectorAll('.aether-panel').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('visible', 'exiting');
    });

    const panel = document.getElementById('panel-' + section);
    if (panel) {
        panel.style.display = 'block';
        // Force reflow then animate in
        panel.offsetHeight;
        panel.classList.add('visible');
    }
}

// ── Voyage Line (route progress along the bottom) ───────────
function buildVoyageLine() {
    const el = document.getElementById('voyage-line');
    if (!el) return;
    el.innerHTML = VOYAGE_ORDER.map((name) =>
        `<button class="voyage-stop" data-stop="${name}" title="${SECTION_TITLES[name] || name}"
            onclick="navigate('${name}')"><span class="voyage-dot"></span></button>`
    ).join('<span class="voyage-track"></span>');
}

function updateVoyageLine(t, nearest, docked) {
    const ship = document.getElementById('voyage-ship');
    if (ship) ship.style.left = (t * 100).toFixed(2) + '%';
    document.querySelectorAll('.voyage-stop').forEach((el) => {
        el.classList.toggle('near', el.dataset.stop === nearest);
        el.classList.toggle('docked', docked && el.dataset.stop === nearest);
    });
    const hint = document.getElementById('voyage-hint');
    if (hint) hint.textContent = docked
        ? (SECTION_TITLES[nearest] || nearest)
        : 'En route → ' + (SECTION_TITLES[nearest] || nearest);
}

// ── Station Chart (dashboard: where am I, what's around) ────
const WING_MAP = {   // top-down station map, x/z from SECTION_POSITIONS
    dashboard:     { x: 50, y: 50, icon: 'fa-circle-nodes' },
    announcements: { x: 50, y: 26, icon: 'fa-tower-broadcast' },
    schedule:      { x: 50, y: 12, icon: 'fa-compass' },
    modules:       { x: 22, y: 32, icon: 'fa-box-archive' },
    assignments:   { x: 22, y: 68, icon: 'fa-clipboard-list' },
    gpa:           { x: 50, y: 84, icon: 'fa-star-half-stroke' },
    projects:      { x: 78, y: 68, icon: 'fa-wrench' },
    attendance:    { x: 78, y: 32, icon: 'fa-atom' },
};

function renderStationChart() {
    const el = document.getElementById('station-chart');
    if (!el || el.dataset.built) return;
    el.dataset.built = '1';

    const pts = VOYAGE_ORDER.map((n) => `${WING_MAP[n].x},${WING_MAP[n].y}`).join(' ');
    let html = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="chart-route">
        <polygon points="${pts}" fill="none" stroke="currentColor" stroke-width="0.6"
            stroke-dasharray="2 2" opacity="0.35"/></svg>`;

    html += Object.entries(WING_MAP).map(([name, m]) => {
        return `<button class="chart-node" data-chart="${name}"
            style="left:${m.x}%;top:${m.y}%" onclick="navigate('${name}')">
            <i class="fas ${m.icon}"></i>
            <span class="chart-node-label">${SECTION_TITLES[name] || name}</span>
            <span class="chart-node-hop"></span>
        </button>`;
    }).join('');
    el.innerHTML = html;
    updateStationChart('dashboard');
}

function updateStationChart(section) {
    document.querySelectorAll('.chart-node').forEach((el) => {
        const name = el.dataset.chart;
        el.classList.toggle('here', name === section);
        const from = VOYAGE_ORDER.indexOf(section);
        const to = VOYAGE_ORDER.indexOf(name);
        const fwd = (to - from + VOYAGE_ORDER.length) % VOYAGE_ORDER.length;
        const hop = el.querySelector('.chart-node-hop');
        if (hop) hop.textContent = name === section ? 'You are here'
            : (fwd <= VOYAGE_ORDER.length / 2
                ? `${fwd} stop${fwd > 1 ? 's' : ''} ↑`
                : `${VOYAGE_ORDER.length - fwd} stop${VOYAGE_ORDER.length - fwd > 1 ? 's' : ''} ↓`);
    });
}

// ── Wing Theme (UI accent follows the active wing) ──────────
function applyWingTheme(section) {
    const hex = WING_COLORS[section];
    if (hex === undefined) return;
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const root = document.documentElement.style;
    root.setProperty('--wing', `rgb(${r},${g},${b})`);
    root.setProperty('--wing-glow', `rgba(${r},${g},${b},0.25)`);
    root.setProperty('--wing-muted', `rgba(${r},${g},${b},0.10)`);
}

// ── Section Data Loader ─────────────────────────────────────
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

// ── Dashboard ───────────────────────────────────────────────
async function loadDashboard() {
    renderStationChart();
    showDashboardSkeletons();
    try {
        const [stats, announcements] = await Promise.all([
            fetchJSON('/api/stats'),
            fetchJSON('/api/announcements')
        ]);
        renderStatCards(stats, announcements);
        renderDashboardAnnouncements(announcements.slice(0, 3));
        loadPriorityStrip(stats, announcements);
    } catch (e) {
        console.error('Dashboard load error:', e);
        showToast('Could not load dashboard data', 'error');
    }
    fetchScheduleForTimeline();
}

function showDashboardSkeletons() {
    document.querySelectorAll('.stat-value').forEach(el => {
        el.innerHTML = '<div class="skeleton skeleton-title" style="width:60px;height:28px;display:inline-block"></div>';
    });
}

function renderStatCards(stats, announcements) {
    const attEl = document.getElementById('stat-attendance');
    attEl.textContent = '—';
    document.getElementById('stat-attendance-sub').innerHTML = 'Loading from sheet...';
    fetchAttendanceForDashboard();

    const aCount = stats.assignments || 0;
    animateNumber('stat-assignments', aCount);
    document.getElementById('stat-assignments-sub').textContent = aCount === 0 ? 'All clear ✓' : aCount === 1 ? 'waiting for you' : 'need your attention';

    animateNumber('stat-modules', stats.modules || 0);

    const examEl = document.getElementById('stat-exam');
    const examSub = document.getElementById('stat-exam-sub');
    examEl.textContent = '—';
    examSub.textContent = 'No exams scheduled';
    if (stats.exams > 0) {
        fetchJSON('/api/exams').then(exams => {
            const upcoming = exams.filter(e => new Date(e.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date));
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

    if (stats.assignments > 0) {
        items.push(`<div class="priority-item warning" onclick="navigate('assignments')">
            <i class="fas fa-clipboard-list" style="color:var(--warning)"></i>
            <span>${stats.assignments} assignment${stats.assignments > 1 ? 's' : ''} waiting</span>
            <i class="fas fa-chevron-right" style="font-size:0.6rem;color:var(--text-3);margin-left:auto"></i>
        </div>`);
    }

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

    if (stats.exams > 0) {
        items.push(`<div class="priority-item urgent" onclick="navigate('schedule')">
            <i class="fas fa-calendar-check" style="color:var(--danger)"></i>
            <span>${stats.exams} exam${stats.exams > 1 ? 's' : ''} scheduled</span>
            <i class="fas fa-chevron-right" style="font-size:0.6rem;color:var(--text-3);margin-left:auto"></i>
        </div>`);
    }

    if (items.length === 0) {
        strip.innerHTML = `<div class="priority-item" style="border-left:2px solid var(--success);cursor:default">
            <i class="fas fa-check-circle" style="color:var(--success)"></i>
            <span>All clear — nothing needs your attention</span>
        </div>`;
    } else {
        strip.innerHTML = items.join('');
    }
}

function renderDashboardAnnouncements(items) {
    const el = document.getElementById('dashboard-announcements');
    if (!items.length) {
        el.innerHTML = `<div class="empty-state" style="padding:var(--sp-8)"><i class="fas fa-bell-slash"></i><h3>All caught up</h3><p>No announcements right now.</p></div>`;
        return;
    }
    el.innerHTML = items.map(a => {
        const isUrgent = a.type === 'urgent';
        const preview = (a.content || '').substring(0, 80);
        return `<div class="glass-card ${isUrgent ? '' : ''}" style="cursor:pointer;${isUrgent ? 'border-left:2px solid var(--danger)' : 'border-left:2px solid var(--accent)'}" onclick="navigate('announcements')">
            <div class="flex justify-between items-center mb-2">
                <span class="badge ${isUrgent ? 'badge-danger' : 'badge-accent'}">${isUrgent ? 'Urgent' : 'Update'}</span>
                <span class="text-caption">${timeAgo(a.date)}</span>
            </div>
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px">${esc(a.title)}</div>
            ${preview ? `<div class="text-caption" style="font-weight:400">${esc(preview)}${preview.length >= 80 ? '...' : ''}</div>` : ''}
        </div>`;
    }).join('');
}

// ── Modules ─────────────────────────────────────────────────
async function loadModules() {
    if (!modulesData.length) {
        try { modulesData = await fetchJSON('/api/modules'); }
        catch (e) { showToast('Failed to load modules', 'error'); return; }
    }
    buildSemesterMenu();
    renderModules(modulesData.filter(c => (c.semester || 1) === currentSemester));
}

function buildSemesterMenu() {
    const sems = [...new Set(modulesData.map(c => c.semester || 1))].sort((a, b) => a - b);
    if (!sems.length) return;
    const saved = parseInt(localStorage.getItem('semester'));
    currentSemester = sems.includes(saved) ? saved : sems[0];
    const menu = document.getElementById('sem-menu');
    if (menu) {
        menu.innerHTML = sems.map(s => `<button class="sem-option ${s === currentSemester ? 'active' : ''}" onclick="selectSemester(${s}, this)">Sem ${s}</button>`).join('');
    }
    const label = document.getElementById('sem-label');
    if (label) label.textContent = `Sem ${currentSemester}`;
    const dd = document.getElementById('sem-dropdown');
    if (dd) dd.style.display = sems.length > 1 ? '' : 'none';
}

function renderModules(courses) {
    const grid = document.getElementById('modules-grid');
    if (!grid) return;
    const colors = ['#4DA8FF','#8B5CF6','#F87171','#FBBF24','#34D399','#6366F1','#EC4899','#14B8A6','#F97316','#06B6D4','#84CC16','#A855F7'];
    grid.innerHTML = courses.map((c, i) => {
        const color = colors[i % colors.length];
        const topics = (c.topics || []).filter(t => t.url).map(t =>
            `<div class="topic-item"><a href="${esc(t.url)}" target="_blank"><i class="fas fa-file-lines" style="color:${color};font-size:0.75rem"></i> ${esc(t.name)}</a></div>`
        ).join('');
        const creditsBadge = c.credits ? `<span class="badge badge-accent" style="font-size:0.68rem"><i class="fas fa-graduation-cap" style="margin-right:4px"></i>${c.credits} Credits</span>` : '';
        const internalsHtml = c.internal_marks ? `<div class="course-internals"><i class="fas fa-clipboard-check"></i> <strong>CA / Internals:</strong> ${esc(c.internal_marks)}</div>` : '';
        return `<div class="module-card glass-card" style="padding:0">
            <div class="module-header" style="border-left:2px solid ${color}">
                <i class="${esc(c.icon || 'fas fa-book')}" style="color:${color}"></i>
                <h3>${esc(c.title)}</h3>
                <div class="module-meta"><span class="code">${esc(c.code)}</span>${creditsBadge}</div>
            </div>
            ${internalsHtml}
            <div class="module-body">${topics || '<p class="text-caption">No topics yet</p>'}</div>
        </div>`;
    }).join('');
}

// ── Assignments ─────────────────────────────────────────────
async function loadAssignments() {
    try { assignmentsData = await fetchJSON('/api/assignments'); renderAssignments(assignmentsData); }
    catch (e) { showToast('Failed to load assignments', 'error'); }
}

function renderAssignments(items) {
    const grid = document.getElementById('assignments-grid');
    const empty = document.getElementById('assignments-empty');
    if (!grid) return;
    if (!items.length) { grid.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = items.map(a => {
        const done = isMarkedDone('assignments', a.id);
        const statusLabel = done ? 'done' : (a.status || 'pending');
        const statusClass = done ? 'badge-success' : a.status === 'submitted' ? 'badge-success' : a.status === 'overdue' ? 'badge-danger' : 'badge-warning';
        const borderColor = done ? 'var(--success)' : a.status === 'overdue' ? 'var(--danger)' : 'var(--warning)';
        return `<div class="glass-card assignment-card${done ? ' card-done' : ''}" style="border-left:2px solid ${borderColor}">
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

// ── Projects ────────────────────────────────────────────────
async function loadProjects() {
    try { projectsData = await fetchJSON('/api/projects'); renderProjects(projectsData); }
    catch (e) { showToast('Failed to load projects', 'error'); }
}

function renderProjects(items) {
    const grid = document.getElementById('projects-grid');
    const empty = document.getElementById('projects-empty');
    if (!grid) return;
    if (!items.length) { grid.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = items.map(p => {
        const done = isMarkedDone('projects', p.id);
        return `<div class="glass-card assignment-card${done ? ' card-done' : ''}">
            <span class="badge badge-nebula subject">${esc(p.course || 'General')}</span>
            <h3>${esc(p.title)}</h3>
            <p class="text-caption">${esc(p.description || '')}</p>
            <div class="meta"><span class="text-caption"><i class="fas fa-calendar"></i> ${esc(p.due_date || 'No due date')}</span></div>
            <button class="btn-mark-done ${done ? 'marked' : ''}" onclick="event.stopPropagation();toggleDone('projects',${p.id})">
                <i class="fas ${done ? 'fa-check-circle' : 'fa-circle'}"></i> ${done ? 'Done' : 'Mark as done'}
            </button>
        </div>`;
    }).join('');
}

// ── Announcements ───────────────────────────────────────────
async function loadAnnouncements() {
    try { announcementsData = await fetchJSON('/api/announcements'); renderAnnouncements(announcementsData); }
    catch (e) { showToast('Failed to load announcements', 'error'); }
}

function renderAnnouncements(items) {
    const container = document.getElementById('announcements-container');
    const empty = document.getElementById('announcements-empty');
    if (!container) return;
    if (!items.length) { container.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    container.innerHTML = items.map(a => {
        const isUrgent = a.type === 'urgent';
        return `<div class="glass-card announcement-card" style="${isUrgent ? 'border-left:2px solid var(--danger)' : 'border-left:2px solid var(--accent)'}">
            <div class="ann-header">
                <span class="badge ${isUrgent ? 'badge-danger' : 'badge-accent'}">${esc(a.type || 'info')}</span>
                <span class="text-caption">${esc(a.date || '')}</span>
            </div>
            <div class="ann-title">${esc(a.title)}</div>
            <div class="ann-body">${esc(a.content || '')}</div>
        </div>`;
    }).join('');
}

// ── Schedule ────────────────────────────────────────────────
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

function renderExams(exams) {
    const tbody = document.getElementById('exam-tbody');
    if (!tbody) return;
    tbody.innerHTML = exams.map(e => `<tr>
        <td style="font-weight:500">${esc(e.course)}</td>
        <td><span class="badge badge-danger exam-type">${esc(e.type || 'exam')}</span></td>
        <td>${esc(e.date)}</td>
        <td>${esc(e.time || '—')}</td>
        <td>${esc(e.location || '—')}</td>
    </tr>`).join('');
}

function buildCalendarEvents(exams, assignments) {
    calEvents = {};
    exams.forEach(e => {
        if (!e.date) return;
        const key = normalizeDate(e.date);
        if (!key) return;
        if (!calEvents[key]) calEvents[key] = [];
        calEvents[key].push({ type: 'exam', title: esc(e.course) + (e.type ? ` — ${esc(e.type)}` : ''), meta: [e.time, e.location].filter(Boolean).join(' · ') || 'Exam' });
    });
    assignments.forEach(a => {
        if (!a.date) return;
        const key = normalizeDate(a.date);
        if (!key) return;
        if (!calEvents[key]) calEvents[key] = [];
        calEvents[key].push({ type: 'assignment', title: esc(a.title), meta: esc(a.subject_code || 'Assignment') });
    });
}

function renderCalendar() {
    const label = document.getElementById('cal-month-label');
    if (label) label.textContent = new Date(calYear, calMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();
    let html = '';
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day other-month"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
        const events = calEvents[dateStr] || [];
        const cls = [isToday ? 'today' : '', calSelectedDay === dateStr ? 'selected' : ''].filter(Boolean).join(' ');
        html += `<div class="cal-day ${cls}" onclick="selectCalDay('${dateStr}')">
            <span class="cal-day-num">${d}</span>
            ${events.slice(0, 2).map(e => `<span class="cal-event-dot ${e.type}">${e.type === 'exam' ? 'E' : 'A'}</span>`).join('')}
        </div>`;
    }
    grid.innerHTML = html;
}

// ── Attendance ──────────────────────────────────────────────
async function loadAttendance() {
    try {
        const csvText = await fetchText(ATTENDANCE_CSV);
        attendanceData = parseCSV(csvText);
        renderAttendance(attendanceData);
        checkAttendanceWarnings(attendanceData);
    } catch (e) { showToast('Failed to load attendance', 'error'); }
}

function renderAttendance(data) {
    const tbody = document.getElementById('attendance-tbody');
    if (!tbody) return;
    tbody.innerHTML = data.map((row, i) => {
        const pct = parseFloat(row.percentage || 0);
        const color = pct < 75 ? 'var(--danger)' : pct < 85 ? 'var(--warning)' : 'var(--success)';
        return `<tr>
            <td>${i + 1}</td>
            <td class="text-mono">${esc(row.usn || '')}</td>
            <td style="font-weight:500">${esc(row.name || '')}</td>
            <td>${esc(row.attended || '')}</td>
            <td>${esc(row.total || '')}</td>
            <td style="color:${color};font-weight:600">${pct.toFixed(1)}%</td>
        </tr>`;
    }).join('');
}

function checkAttendanceWarnings(data) {
    const warning = document.getElementById('attendance-warning');
    const warningText = document.getElementById('attendance-warning-text');
    if (!warning) return;
    const lowSubjects = data.filter(r => parseFloat(r.percentage || 0) < 75);
    if (lowSubjects.length > 0) {
        warning.classList.remove('hidden');
        if (warningText) warningText.textContent = `${lowSubjects.length} student(s) below 75% attendance.`;
    } else {
        warning.classList.add('hidden');
    }
}

// ── GPA Calculator ──────────────────────────────────────────
let gpaMode = 'marks';
let gpaSemester = 1;

async function loadGpa() {
    if (!modulesData.length) {
        try { modulesData = await fetchJSON('/api/modules'); } catch (e) { return; }
    }
    buildGpaSemTabs();
    renderGpaRows();
    updateCGPA();
}

function buildGpaSemTabs() {
    const tabs = document.getElementById('gpa-sem-tabs');
    if (!tabs) return;
    const sems = [...new Set(modulesData.map(c => c.semester || 1))].sort((a, b) => a - b);
    if (!sems.length) return;
    gpaSemester = sems.includes(gpaSemester) ? gpaSemester : sems[0];
    tabs.innerHTML = sems.map(s => `<button class="filter-pill ${s === gpaSemester ? 'active' : ''}" onclick="selectGpaSem(${s}, this)">Sem ${s}</button>`).join('');
}

function renderGpaRows() {
    const container = document.getElementById('gpa-rows');
    const empty = document.getElementById('gpa-empty');
    if (!container) return;
    const courses = modulesData.filter(c => (c.semester || 1) === gpaSemester);
    if (!courses.length) { container.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');

    container.innerHTML = courses.map(c => {
        const stored = getGpaData(gpaSemester, c.code);
        if (gpaMode === 'marks') {
            return `<div class="gpa-row">
                <div class="gpa-row-info"><span class="gpa-row-title">${esc(c.title)}</span><span class="gpa-row-code">${esc(c.code)}</span></div>
                <span class="gpa-row-credits">${c.credits || 0} <small>cr</small></span>
                <div class="gpa-row-input">
                    <input type="number" class="gpa-marks-input" min="0" max="100" placeholder="—" value="${stored.marks || ''}" oninput="updateGpaMarks('${esc(c.code)}', this.value)">
                    <span class="gpa-row-grade ${stored.grade ? '' : 'muted'}">${stored.grade || '—'}</span>
                </div>
            </div>`;
        } else {
            return `<div class="gpa-row">
                <div class="gpa-row-info"><span class="gpa-row-title">${esc(c.title)}</span><span class="gpa-row-code">${esc(c.code)}</span></div>
                <span class="gpa-row-credits">${c.credits || 0} <small>cr</small></span>
                <div class="gpa-row-input">
                    <select class="gpa-grade-select" onchange="updateGpaGrade('${esc(c.code)}', this.value)">
                        <option value="">Select</option>
                        <option value="O" ${stored.grade === 'O' ? 'selected' : ''}>O (10)</option>
                        <option value="A+" ${stored.grade === 'A+' ? 'selected' : ''}>A+ (9)</option>
                        <option value="A" ${stored.grade === 'A' ? 'selected' : ''}>A (8)</option>
                        <option value="B+" ${stored.grade === 'B+' ? 'selected' : ''}>B+ (7)</option>
                        <option value="B" ${stored.grade === 'B' ? 'selected' : ''}>B (6)</option>
                        <option value="C" ${stored.grade === 'C' ? 'selected' : ''}>C (5)</option>
                        <option value="P" ${stored.grade === 'P' ? 'selected' : ''}>P (4)</option>
                        <option value="F" ${stored.grade === 'F' ? 'selected' : ''}>F (0)</option>
                    </select>
                </div>
            </div>`;
        }
    }).join('');
    updateSGPA();
}

// GPA storage helpers
function getGpaStore() { return JSON.parse(localStorage.getItem('aether_gpa') || '{}'); }
function setGpaStore(data) { localStorage.setItem('aether_gpa', JSON.stringify(data)); }
function getGpaData(sem, code) { const s = getGpaStore(); return (s[sem] && s[sem][code]) || {}; }

const GRADE_MAP = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0 };

function marksToGrade(marks) {
    const m = parseFloat(marks);
    if (isNaN(m)) return '';
    if (m >= 90) return 'O'; if (m >= 80) return 'A+'; if (m >= 70) return 'A';
    if (m >= 60) return 'B+'; if (m >= 55) return 'B'; if (m >= 50) return 'C';
    if (m >= 40) return 'P'; return 'F';
}

// Global GPA functions
window.updateGpaMarks = function(code, val) {
    const store = getGpaStore();
    if (!store[gpaSemester]) store[gpaSemester] = {};
    const grade = marksToGrade(val);
    store[gpaSemester][code] = { marks: val, grade };
    setGpaStore(store);
    renderGpaRows();
};

window.updateGpaGrade = function(code, grade) {
    const store = getGpaStore();
    if (!store[gpaSemester]) store[gpaSemester] = {};
    store[gpaSemester][code] = { grade, marks: '' };
    setGpaStore(store);
    updateSGPA();
    updateCGPA();
};

window.setGpaMode = function(mode) {
    gpaMode = mode;
    document.getElementById('gpa-mode-marks')?.classList.toggle('active', mode === 'marks');
    document.getElementById('gpa-mode-grade')?.classList.toggle('active', mode === 'grade');
    renderGpaRows();
};

window.resetGpaSemester = function() {
    const store = getGpaStore();
    delete store[gpaSemester];
    setGpaStore(store);
    renderGpaRows();
    updateCGPA();
};

window.selectGpaSem = function(sem, btn) {
    gpaSemester = sem;
    document.querySelectorAll('#gpa-sem-tabs .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    renderGpaRows();
};

function updateSGPA() {
    const courses = modulesData.filter(c => (c.semester || 1) === gpaSemester);
    let totalCredits = 0, weightedSum = 0, filled = 0;
    courses.forEach(c => {
        const d = getGpaData(gpaSemester, c.code);
        if (d.grade && GRADE_MAP[d.grade] !== undefined) {
            const cr = c.credits || 0;
            totalCredits += cr;
            weightedSum += cr * GRADE_MAP[d.grade];
            filled++;
        }
    });
    const sgpa = totalCredits > 0 ? (weightedSum / totalCredits).toFixed(2) : '—';
    const sgpaEl = document.getElementById('gpa-sgpa-value');
    if (sgpaEl) sgpaEl.textContent = sgpa;
    const metaEl = document.getElementById('gpa-sgpa-meta');
    if (metaEl) metaEl.innerHTML = `<span class="text-caption">${filled}/${courses.length} courses · ${totalCredits} credits</span>`;
    updateCGPA();
}

function updateCGPA() {
    const store = getGpaStore();
    const sems = Object.keys(store).filter(k => Object.keys(store[k]).length > 0);
    let totalCredits = 0, weightedSum = 0;
    const breakdownItems = [];

    sems.sort((a, b) => a - b).forEach(sem => {
        const courses = modulesData.filter(c => (c.semester || 1) === parseInt(sem));
        let semCredits = 0, semSum = 0;
        courses.forEach(c => {
            const d = store[sem]?.[c.code];
            if (d?.grade && GRADE_MAP[d.grade] !== undefined) {
                const cr = c.credits || 0;
                semCredits += cr;
                semSum += cr * GRADE_MAP[d.grade];
            }
        });
        if (semCredits > 0) {
            const semGpa = (semSum / semCredits).toFixed(2);
            totalCredits += semCredits;
            weightedSum += semSum;
            breakdownItems.push(`<div class="gpa-cgpa-pill"><span>Sem ${sem}</span><strong>${semGpa}</strong></div>`);
        }
    });

    const cgpa = totalCredits > 0 ? (weightedSum / totalCredits).toFixed(2) : '—';
    const cgpaEl = document.getElementById('gpa-cgpa-value');
    if (cgpaEl) cgpaEl.textContent = cgpa;
    const subEl = document.getElementById('gpa-cgpa-sub');
    if (subEl) subEl.textContent = totalCredits > 0 ? `${totalCredits} total credits across ${sems.length} semester(s)` : 'Fill in a semester below to begin';
    const breakdown = document.getElementById('gpa-cgpa-breakdown');
    if (breakdown) breakdown.innerHTML = breakdownItems.join('');
}

// ── Schedule Helpers ────────────────────────────────────────
async function fetchScheduleForTimeline() {
    try {
        const csvText = await fetchText(SCHEDULE_CSV);
        const rows = parseScheduleCSV(csvText);
        renderTodayTimeline(rows);
    } catch (e) { /* silent */ }
}

function parseScheduleCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    const today = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    const dayIdx = headers.findIndex(h => h.toLowerCase() === today.toLowerCase());
    if (dayIdx < 0) return [];
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols[0]) result.push({ time: cols[0], subject: cols[dayIdx] || '' });
    }
    return result;
}

function renderTodayTimeline(slots) {
    const el = document.getElementById('today-timeline');
    if (!el) return;
    if (!slots.length) { el.innerHTML = '<p class="text-caption" style="padding:var(--sp-4)">No schedule data available.</p>'; return; }
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    el.innerHTML = slots.map(s => {
        const isBreak = /break|lunch|free/i.test(s.subject);
        const timeMatch = s.time.match(/(\d{1,2}):(\d{2})/);
        let isNow = false;
        if (timeMatch) {
            const slotMins = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
            isNow = nowMins >= slotMins && nowMins < slotMins + 60;
        }
        return `<div class="timeline-slot ${isBreak ? 'break' : ''} ${isNow ? 'now' : ''}">
            <span class="time">${esc(s.time)}</span>
            <span class="subject">${esc(s.subject || '—')}</span>
        </div>`;
    }).join('');
}

async function fetchScheduleTable() {
    try {
        const csvText = await fetchText(SCHEDULE_CSV);
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return;
        const headers = lines[0].split(',').map(h => h.trim());
        const table = document.getElementById('timetable');
        if (!table) return;
        let html = '<thead><tr>' + headers.map(h => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>';
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.trim());
            html += '<tr>' + cols.map((c, j) => {
                const isBreak = /break|lunch/i.test(c);
                const cls = j === 0 ? 'day-header' : isBreak ? 'break-cell' : 'subject-cell';
                return `<td class="${cls}">${esc(c)}</td>`;
            }).join('') + '</tr>';
        }
        html += '</tbody>';
        table.innerHTML = html;
    } catch (e) { /* silent */ }
}

// ── Attendance for Dashboard ────────────────────────────────
async function fetchAttendanceForDashboard() {
    try {
        const csvText = await fetchText(ATTENDANCE_CSV);
        const data = parseCSV(csvText);
        if (!data.length) return;
        const percentages = data.map(r => parseFloat(r.percentage || 0)).filter(p => !isNaN(p));
        const avg = percentages.length ? (percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0;
        const attEl = document.getElementById('stat-attendance');
        const attSub = document.getElementById('stat-attendance-sub');
        if (attEl) attEl.textContent = avg.toFixed(1) + '%';
        if (attSub) {
            const icon = avg >= 75 ? '<i class="fas fa-arrow-trend-up" style="color:var(--success)"></i>' : '<i class="fas fa-arrow-trend-down" style="color:var(--danger)"></i>';
            attSub.innerHTML = `${icon} Overall average`;
        }
    } catch (e) { /* silent */ }
}

// ── Utility Functions ───────────────────────────────────────
async function fetchJSON(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchText(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return esc(dateStr);
    const diff = Date.now() - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return esc(dateStr);
}

function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const duration = 800;
    const start = performance.now();
    const from = parseInt(el.textContent) || 0;
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(from + (target - from) * eased);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function normalizeDate(str) {
    if (!str) return null;
    const d = new Date(str);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = cols[i] || '');
        return obj;
    }).filter(r => r.name || r.usn);
}

// Mark-as-done
function isMarkedDone(category, id) {
    const done = JSON.parse(localStorage.getItem('csbs_done') || '{}');
    return !!(done[category] && done[category][id]);
}

window.toggleDone = function(category, id) {
    const done = JSON.parse(localStorage.getItem('csbs_done') || '{}');
    if (!done[category]) done[category] = {};
    done[category][id] = !done[category][id];
    if (!done[category][id]) delete done[category][id];
    localStorage.setItem('csbs_done', JSON.stringify(done));
    if (category === 'assignments') renderAssignments(assignmentsData);
    else if (category === 'projects') renderProjects(projectsData);
};

// ── Toast ───────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}" style="color:${type === 'error' ? 'var(--danger)' : 'var(--success)'}"></i><span>${esc(message)}</span><div class="toast-progress"></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('dismissing'); setTimeout(() => toast.remove(), 300); }, 4000);
}
window.showToast = showToast;

// ── Greeting ────────────────────────────────────────────────
function initGreeting() {
    const h = new Date().getHours();
    const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const el = document.getElementById('greeting-text');
    if (el) el.textContent = greeting;

    // Set user name from session
    fetchJSON('/api/auth/check').then(data => {
        if (data.name) {
            if (el) el.textContent = greeting + ', ' + data.name.split(' ')[0];
            const nameEl = document.getElementById('user-display-name');
            if (nameEl) nameEl.textContent = data.name;
            const avatarEl = document.getElementById('user-avatar');
            if (avatarEl) avatarEl.textContent = data.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        }
        if (data.is_admin) {
            const adminLink = document.getElementById('admin-link');
            if (adminLink) adminLink.classList.remove('hidden');
        }
    }).catch(() => {});
}

// ── Keyboard Shortcuts ──────────────────────────────────────
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+K — Command Palette
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openCommandPalette();
        }
        // Escape — close modals
        if (e.key === 'Escape') {
            closeCommandPalette();
            closeSyllabusModal();
        }
        // E — toggle explore mode
        if (e.key === 'e' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            toggleExploreMode();
        }
    });
}

// ── Command Palette ─────────────────────────────────────────
window.openCommandPalette = function() {
    const el = document.getElementById('cmd-palette');
    if (el) { el.classList.add('open'); el.querySelector('.cmd-input')?.focus(); }
};

window.closeCommandPalette = function() {
    const el = document.getElementById('cmd-palette');
    if (el) el.classList.remove('open');
};

window.handleCmdSearch = function(val) {
    const results = document.getElementById('cmd-results');
    if (!results) return;
    if (!val.trim()) {
        results.querySelectorAll('.cmd-item').forEach(item => item.style.display = '');
        return;
    }
    const q = val.toLowerCase();
    results.querySelectorAll('.cmd-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
};

// ── Explore Mode Toggle ────────────────────────────────────
window.toggleExploreMode = function() {
    const isExplore = !getExploreMode();
    setExploreMode(isExplore);
    const btn = document.getElementById('explore-toggle');
    if (btn) btn.textContent = isExplore ? '✕ Exit Explore' : '🚀 Explore Mode';
    const hud = document.getElementById('explore-hud');
    if (hud) hud.style.display = isExplore ? 'flex' : 'none';
    const wasdToggle = document.querySelector('.wasd-toggle');
    if (wasdToggle) wasdToggle.style.display = isExplore ? 'none' : '';
};

// ── Calendar Nav ────────────────────────────────────────────
window.calPrev = function() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
window.calNext = function() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };
window.calToday = function() { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); };
window.selectCalDay = function(dateStr) {
    calSelectedDay = dateStr;
    renderCalendar();
    const events = calEvents[dateStr];
    const panel = document.getElementById('cal-events-panel');
    if (!panel) return;
    if (!events?.length) { panel.innerHTML = '<p class="text-caption" style="padding:var(--sp-4)">No events on this date.</p>'; return; }
    panel.innerHTML = `<div class="cal-panel-date">${new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div class="cal-events-list">${events.map(e => `<div class="cal-event-item"><div class="event-icon ${e.type}"><i class="fas ${e.type === 'exam' ? 'fa-file-pen' : 'fa-clipboard-list'}"></i></div><div class="event-info"><div class="event-title">${e.title}</div><div class="event-meta">${e.meta}</div></div></div>`).join('')}</div>`;
};

// ── Schedule Tab Switching ──────────────────────────────────
window.switchScheduleTab = function(tab, btn) {
    scheduleTabActive = tab;
    document.querySelectorAll('#schedule-tabs .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('schedule-view-calendar').style.display = tab === 'calendar' ? '' : 'none';
    document.getElementById('schedule-view-exams').style.display = tab === 'exams' ? '' : 'none';
    document.getElementById('schedule-view-timetable').style.display = tab === 'timetable' ? '' : 'none';
    if (tab === 'timetable') fetchScheduleTable();
};

// ── Semester Dropdown ───────────────────────────────────────
window.toggleSemDropdown = function() { document.getElementById('sem-dropdown')?.classList.toggle('open'); };
window.selectSemester = function(sem, btn) {
    currentSemester = sem;
    localStorage.setItem('semester', sem);
    document.querySelectorAll('.sem-option').forEach(o => o.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('sem-label').textContent = `Sem ${sem}`;
    document.getElementById('sem-dropdown')?.classList.remove('open');
    renderModules(modulesData.filter(c => (c.semester || 1) === sem));
};

document.addEventListener('click', e => {
    const dd = document.getElementById('sem-dropdown');
    if (dd && !dd.contains(e.target)) dd.classList.remove('open');
});

// ── Filter Functions ────────────────────────────────────────
window.filterAssignments = function(filter, btn) {
    document.querySelectorAll('#assignment-filters .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    if (filter === 'all') { renderAssignments(assignmentsData); return; }
    renderAssignments(assignmentsData.filter(a => (a.status || 'pending') === filter));
};

window.filterAnnouncements = function(filter, btn) {
    document.querySelectorAll('#section-announcements .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    if (filter === 'all') { renderAnnouncements(announcementsData); return; }
    renderAnnouncements(announcementsData.filter(a => (a.type || 'info') === filter));
};

window.searchAttendance = function() {
    const q = document.getElementById('attendance-search')?.value.toLowerCase() || '';
    const filtered = attendanceData.filter(r => (r.name || '').toLowerCase().includes(q) || (r.usn || '').toLowerCase().includes(q));
    renderAttendance(filtered);
};

window.sortAttendance = function(mode, btn) {
    attendanceSort = mode;
    document.querySelectorAll('#section-attendance .filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    let sorted = [...attendanceData];
    if (mode === 'low') sorted.sort((a, b) => parseFloat(a.percentage || 0) - parseFloat(b.percentage || 0));
    else if (mode === 'high') sorted.sort((a, b) => parseFloat(b.percentage || 0) - parseFloat(a.percentage || 0));
    else if (mode === 'name') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderAttendance(sorted);
};

// ── Syllabus Modal ──────────────────────────────────────────
window.closeSyllabusModal = function() {
    document.getElementById('syllabus-modal')?.classList.remove('open');
};

// ── Logout ──────────────────────────────────────────────────
window.logout = function() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        .then(() => window.location.href = '/login.html')
        .catch(() => window.location.href = '/login.html');
};
