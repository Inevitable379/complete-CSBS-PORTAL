# CSBS Portal — Complete Project Context & Status Report

> **Last Updated:** 12 July 2026  
> **Project Location:** `c:\proper csbs portal`  
> **Purpose:** A student portal for the Computer Science & Business Systems (CSBS) department at Jain University, Bangalore. It serves as a centralized hub for students to access course modules/materials, assignments, projects, exams, announcements, class schedule (timetable), and attendance data.

---

## 1. HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (HTML/CSS/JS)                   │
│  ┌──────────┐   ┌───────────┐   ┌───────────────────┐          │
│  │login.html│   │index.html │   │   admin.html      │          │
│  │Google    │   │Student    │   │Admin Dashboard    │          │
│  │Sign-In   │   │Dashboard  │   │CRUD for all data  │          │
│  └────┬─────┘   └─────┬─────┘   └────────┬──────────┘          │
│       │               │                  │                      │
│       └───────────────┼──────────────────┘                      │
│                       │ fetch() to /api/*                       │
├───────────────────────┼─────────────────────────────────────────┤
│                       ▼                                         │
│              BACKEND (Flask / Python)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐                  │
│  │ app.py   │  │ auth.py  │  │ database.py  │                  │
│  │ Routes + │  │ Google   │  │ SQLite CRUD  │                  │
│  │ API      │  │ JWT +    │  │              │                  │
│  │          │  │ Session  │  │              │                  │
│  └──────────┘  └──────────┘  └──────┬───────┘                  │
│                                     │                           │
│                              ┌──────▼───────┐                  │
│                              │ data/portal.db│ (SQLite)         │
│                              └──────────────┘                   │
│                                                                 │
│  External Data Sources (Google Sheets CSV):                     │
│  • Schedule/Timetable                                           │
│  • Attendance records                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Tech Stack:**
- **Backend:** Python 3 + Flask 3.x + Flask-CORS
- **Database:** SQLite (file: `data/portal.db`)
- **Auth:** Google OAuth2 (JWT verification) + server-side Flask sessions + email whitelist
- **Frontend:** Vanilla HTML/CSS/JS (no framework), Font Awesome icons, Inter + JetBrains Mono fonts
- **External Data:** Google Sheets published as CSV for timetable & attendance
- **File Uploads:** Stored in `static/uploads/` on the server

---

## 2. FILE STRUCTURE (every file, explained)

```
c:\proper csbs portal\
│
├── .env                    # Environment variables (SECRET_KEY, ADMIN_PASSWORD, GOOGLE_CLIENT_ID, PORT, DEBUG, CORS)
├── config.py               # Config class — reads .env, sets DB_PATH, UPLOAD_FOLDER, etc.
├── app.py                  # Flask app factory (create_app) — ALL API routes defined here
├── auth.py                 # Google JWT verification + @login_required / @admin_required decorators
├── database.py             # SQLite schema (init_db) + all CRUD functions
├── run.py                  # Entry point: creates app, runs on port 5001
├── run.bat                 # Windows batch file to start the server
├── migrate.py              # One-time migration script: JSON files → SQLite
├── validate_json.py        # Small utility to validate JSON files
├── requirements.txt        # Python deps: flask, flask-cors, python-dotenv, google-auth, requests, werkzeug, bcrypt
│
├── index.html              # STUDENT PORTAL (main SPA-like page, 438 lines)
├── login.html              # LOGIN PAGE (Google Sign-In + dev bypass)
├── admin.html              # ADMIN DASHBOARD (1042 lines — forms for CRUD, manage views)
│
├── courses.json            # 12 courses with topics (JSON, used as seed data for migration)
├── assignments.json        # 3 assignments (includes junk test data)
├── exam.json               # 4 exams (includes 1 malformed entry with wrong schema)
├── project.json            # 2 projects
├── announcements.json      # Empty array []
│
├── image.png               # Some image asset (663KB)
├── TODO.md                 # Task tracking for admin module fix
│
├── static/
│   ├── css/
│   │   ├── base.css        # Design system: CSS variables, reset, themes (light/dark), animations, utilities
│   │   └── components.css  # All UI components: sidebar, cards, tables, modals, calendar, toast, etc. (25KB)
│   ├── js/
│   │   └── main.js         # ALL student portal JS logic (939 lines): navigation, data fetching, rendering, calendar, attendance, search, etc.
│   └── uploads/            # 15 uploaded module resource files (PDFs, PPTXs) ~61MB total
│
├── data/
│   └── portal.db           # SQLite database (53KB) — the active data store
│
└── backups/
    └── FULL COMPELETE CSBS PORTAL.html  # A backup of an older single-file version (102KB)
```

---

## 3. DATABASE SCHEMA (SQLite — `data/portal.db`)

```sql
-- Courses & their topics (modules with study materials)
CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,       -- e.g. "DMCS", "IPS", "PHYSICS"
    title TEXT NOT NULL,             -- e.g. "Discrete Mathematics for Computer Science"
    color TEXT DEFAULT '',           -- CSS gradient string (not currently used in DB-driven UI)
    icon TEXT DEFAULT 'fas fa-book', -- Font Awesome class
    semester INTEGER DEFAULT 1      -- Which semester this course belongs to
);

CREATE TABLE topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,     -- FK → courses.id
    name TEXT NOT NULL,             -- e.g. "Graph Theory & Applications"
    url TEXT DEFAULT '',            -- Link to uploaded file or Google Drive embed URL
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Assignments, Projects, Exams, Announcements (generic item tables)
CREATE TABLE assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_code TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    message TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    due_date TEXT DEFAULT '',
    repo_link TEXT DEFAULT '',
    demo_link TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course TEXT NOT NULL,
    type TEXT NOT NULL,             -- "Mid-term", "Final Exam", "Practical"
    date TEXT DEFAULT '',
    time TEXT DEFAULT '',
    location TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    date TEXT DEFAULT '',
    type TEXT DEFAULT 'info',       -- "info" or "urgent"
    author TEXT DEFAULT 'Admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Access control: only whitelisted emails can log in
CREATE TABLE whitelisted_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL      -- e.g. "juug25btech12345@jainuniversity.ac.in"
);
```

**Current data in DB (migrated from JSON):**
- **12 courses** (Sem 1): BCSV-I, DMCS, ITPSC, PHYSICS, PEE, IPS, IPS LAB, PHYSICS LAB, PEE LAB, DSA, UHV, IC
- Each course has **5–7 topics** — some have URLs (uploaded PDFs or Google Drive embeds), most are empty
- **~58 whitelisted student emails** (all `@jainuniversity.ac.in`)
- 2 assignments, 3 exams, 2 projects, 0 announcements (after junk data was cleaned in migration)

---

## 4. API ENDPOINTS (all defined in `app.py`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | None | Serves `index.html` (student portal) |
| GET | `/login.html` | None | Serves login page |
| GET | `/admin` | None | Serves `admin.html` |
| POST | `/api/auth/login` | None | Google JWT verification → create session. Also supports `dev_bypass` on localhost |
| GET | `/api/auth/check` | None | Returns `{authenticated, email, name}` or 401 |
| POST | `/api/auth/logout` | None | Clears session |
| GET | `/api/modules` | None | Returns all courses with nested topics array |
| GET | `/api/<category>` | None | Generic GET for `assignments`, `projects`, `exams`, `announcements` |
| GET | `/api/stats` | None | Counts of each category + module count (for dashboard) |
| POST | `/api/add` | `@admin_required` | Add assignment/project/exam (form-encoded) |
| POST | `/api/announcements` | `@admin_required` | Add announcement (form-encoded) |
| POST | `/api/delete` | `@admin_required` | Delete item by id + category (JSON body) |
| POST | `/api/upload` | `@admin_required` | Upload file for a topic (multipart) |
| POST | `/api/link` | `@admin_required` | Set external URL for a topic (JSON body, auto-converts Google Drive links) |
| POST | `/api/modules` | `@admin_required` | Add new course + topics (JSON body) |
| DELETE | `/api/modules/<id>` | `@admin_required` | Delete course + cascade-delete topics |

**Auth Model:**
- **Student login:** Google OAuth2 → server verifies JWT → checks email against `whitelisted_emails` table → creates Flask session
- **Admin actions:** Every write endpoint requires an `admin_password` field in the request body (compared to `Config.ADMIN_PASSWORD`, default: `"admin"`)
- **Dev bypass:** On localhost with `DEBUG=True`, login can be skipped with `{"dev_bypass": true}`

---

## 5. STUDENT PORTAL FEATURES (index.html + main.js)

### Sections / Pages (SPA-style navigation, no page reloads):

1. **Dashboard** — Greeting with user's name, stat cards (attendance %, assignments, courses, next exam countdown), priority strip (urgent items), today's schedule timeline, latest announcements
2. **Courses** — Grid of course cards with topics listed, semester filter dropdown (Sem 1–8), clickable topic links to view uploaded materials
3. **Assignments** — Cards with subject code, title, date, status badge. Filter by: All/Pending/Submitted/Overdue
4. **Projects** — Cards with course, title, description, due date, repo/demo links
5. **Announcements** — Cards with type badge (info/urgent), date, title, content. Filter by: All/Urgent/General
6. **Schedule** — Three sub-tabs:
   - **Calendar** — Interactive monthly calendar with exam/assignment events plotted, click to see event details
   - **Exams** — Table view of all exams
   - **Timetable** — Pulls from Google Sheets CSV, renders as a table
7. **Attendance** — Table pulled from Google Sheets CSV showing USN, name, classes attended/total, percentage. Search by name/USN, sort by low-first/high-first/name/default. Warning banner for students below 75%

### Other UI Features:
- **Command Palette** (Ctrl+K) — Search across pages and courses
- **Light/Dark theme** toggle with persistence in localStorage
- **Toast notifications** system
- **Keyboard shortcuts** (Ctrl+K, Escape)
- **Mobile responsive** sidebar (hamburger menu)
- **Activity side panel** with upcoming deadlines and quick stats
- **Animated number counters** on dashboard stat cards
- **Syllabus modal** (exists in HTML but not fully wired up)
- **Auto-refetch on tab focus** (`visibilitychange` event)

### External Data Sources (hardcoded Google Sheets URLs in main.js):
- **Schedule CSV:** `https://docs.google.com/spreadsheets/d/e/2PACX-1vQelGRJbrqerJsUMeScuBiSMhJOGlyFb0E3IUjjxpnFbhOg0MtO_0dlzxSMjNlHOImmPLSHYqcjsJEe/pub?gid=0&single=true&output=csv`
- **Attendance CSV:** Same sheet, different gid (`gid=1674592517`)

---

## 6. ADMIN PANEL FEATURES (admin.html)

### Create Section:
- **Add Assignment** — Subject code (datalist from courses), title, date, status
- **Add Project** — Course, title, description, due date, repo link, demo link
- **Schedule Exam** — Course, type, date, time, location
- **Upload Module Resource** — Two modes:
  - **Paste Link (Recommended):** Paste Google Drive share link → auto-converts to embed format on the server side
  - **Upload File:** Direct file upload (PDF, etc.) → saves to `static/uploads/`
- **Add Announcement** — Title, content, priority type (info/urgent)
- **Add Module** — Course code, title, semester, icon class, topics (one per line)

### Manage Section:
- **Manage Assignments/Projects/Exams/Announcements** — Table view with delete button
- **Manage Modules** — Lists all modules grouped by semester, delete button per module

All admin write operations require the admin password in the form.

---

## 7. WHAT HAS BEEN COMPLETED ✅

### Backend (fully built):
- [x] Flask app factory pattern with clean structure
- [x] SQLite database with proper schema, foreign keys, cascading deletes
- [x] All CRUD API endpoints for courses, topics, assignments, projects, exams, announcements
- [x] Google OAuth2 JWT verification with fallback for dev mode
- [x] Email whitelist system (~58 student emails)
- [x] Server-side session management
- [x] `@admin_required` decorator for write operations
- [x] File upload to `static/uploads/`
- [x] Google Drive link auto-conversion (share link → embed/preview URL)
- [x] JSON → SQLite migration script (`migrate.py`)
- [x] CORS configuration for local development

### Frontend — Student Portal:
- [x] Complete SPA-style navigation with 7 sections
- [x] Dashboard with stats, priority strip, today's timeline, announcements
- [x] Courses page with semester filtering and topic links
- [x] Assignments page with status filtering
- [x] Projects page with repo/demo links
- [x] Announcements page with type filtering
- [x] Schedule page with calendar, exams table, and timetable views
- [x] Attendance page with search, sort, and low-attendance warnings
- [x] Command palette (Ctrl+K)
- [x] Dark/Light theme toggle
- [x] Mobile-responsive sidebar
- [x] Toast notification system
- [x] Animated stat counters

### Frontend — Admin Panel:
- [x] Dashboard with stats overview
- [x] Forms for creating assignments, projects, exams, announcements, modules
- [x] Module upload with dual mode (link paste / file upload)
- [x] Management tables for deleting items
- [x] Module management with semester grouping

### Design System:
- [x] Clean Apple/Vercel-inspired design with CSS custom properties
- [x] Full light and dark theme token sets
- [x] Component library (cards, badges, tables, modals, calendar, timeline, etc.)
- [x] Smooth animations (fadeUp, fadeOut, shimmer, slideDown, scaleIn)
- [x] Inter + JetBrains Mono typography

### Data:
- [x] 12 courses with topics seeded
- [x] Some topics have uploaded PDFs (15 files, ~61MB)
- [x] Some topics have Google Drive embed links
- [x] 58 student emails whitelisted
- [x] Migration from old JSON files to SQLite completed

---

## 8. KNOWN ISSUES & BUGS 🐛

### Critical / High Priority:

1. **DUPLICATE PROJECTS SECTION in `index.html` (Lines 186–210)**
   - The `<!-- ===== PROJECTS ===== -->` section is duplicated — appears twice with the same `id="section-projects"`. This causes the first one to be the active target, and the second one is dead HTML. It also means there are duplicate element IDs (`projects-grid`, `projects-empty`) which causes unpredictable behavior.
   - **Fix:** Remove lines 199–210 (the second duplicate section).

2. **`semester` field not stored per course during migration**
   - In `migrate.py`, all courses are hardcoded to `semester=1`. The courses.json doesn't have a semester field, so all 12 courses appear under Semester 1. When selecting Sem 2–8, the grid shows "No courses yet."
   - **Impact:** Semester filtering is broken — all courses pile under Sem 1.

3. **Attendance data source is hardcoded to a specific Google Sheet**
   - The Google Sheets URLs in `main.js` (lines 7–8) are hardcoded. If the sheet is deleted, made private, or the URL changes, both attendance and timetable will break silently. There's no fallback or admin configuration for these.

4. **No admin UI to manage whitelisted emails**
   - Emails can only be added via the migration script or directly in SQLite. There's no API endpoint or admin UI to add/remove whitelisted students.
   - The function `add_whitelisted_email()` exists in `database.py` but is never called from any route.

5. **`bcrypt` listed in requirements.txt but never used**
   - The `bcrypt` package is a dependency but is never imported or used anywhere. Admin password is stored as plaintext in `.env` and compared as plaintext in `auth.py`.

### Medium Priority:

6. **Admin password is plaintext**
   - `Config.ADMIN_PASSWORD` defaults to `"admin"` and is compared directly as a string. No hashing, no rate limiting. Anyone who guesses "admin" can create/delete content.

7. **No CSRF protection**
   - All POST endpoints accept requests without any CSRF token. Combined with session-based auth, this is a CSRF vulnerability.

8. **Duplicate "Projects" entry in command palette**
   - In `index.html` line 384, there's a duplicate "Projects" command item in the command palette results.

9. **`color` field in courses is not used in the DB-driven UI**
   - The `courses.json` has CSS gradient `color` fields per course, but after migration to SQLite and the new rendering in `main.js`, colors are assigned from a hardcoded array (`colors` in `renderModules()`), and the DB `color` column is ignored.

10. **Form submission for assignments/exams uses native form submit (not AJAX)**
    - In `admin.html`, while uploads, links, and modules use AJAX (`fetch`), regular assignment/project/exam form submissions fall through to native browser form submission (`form.action` + `form.submit()`). This causes a full page navigation to the API JSON response instead of a nice in-page feedback.

11. **Exam data has a malformed entry in JSON**
    - `exam.json` has one entry (id `1765341772`) with `subject_code` instead of `course`, and `title` instead of `type`. The migration script detects and skips this, but it shows the data was not validated at entry time.

12. **Date formats are inconsistent**
    - Some dates are `"10 Dec"`, some are `"20th dec 2025"`, some are ISO `"2025-01-15"`. The `normalizeDate()` function in `main.js` tries to handle multiple formats but `"10 Dec"` (no year) will fail to parse correctly.

### Low Priority:

13. **No input validation on admin forms**
    - For example, you can create an exam with empty course and type fields (the check is only for `title` or `course` being truthy).

14. **SQL injection is partially mitigated but uses f-strings for table names**
    - In `database.py`, table names are interpolated via f-strings (`f"SELECT * FROM {table}"`). While the table name is validated against `VALID_TABLES`, it's still a pattern that could be dangerous if the validation is ever relaxed.

15. **`get_all_courses()` includes an empty `resources: []` field**
    - Line 113 of `database.py` adds `course['resources'] = []` — a placeholder that was never implemented.

16. **No pagination or search on API endpoints**
    - All GET endpoints return ALL records. As data grows, this will become slow.

17. **Attendance and schedule are read-only from Google Sheets**
    - There's no way to edit attendance or schedule through the portal. Any changes require editing the Google Sheet directly.

18. **The `project.json` filename is singular (`project.json`) but assignments/announcements are plural**
    - Minor inconsistency in file naming convention.

19. **Timetable CSV parsing is fragile**
    - It splits by comma and strips quotes, which will break if any cell contains a comma (e.g., "Room 301, Block A").

20. **No loading states or error boundaries on the student portal**
    - If an API call fails, the section may show stale data or nothing. Only a toast is shown.

---

## 9. WHAT REMAINS TO BE DONE / NOT YET IMPLEMENTED

- [ ] **Email whitelist management** — Admin UI + API to add/remove students
- [ ] **Semester assignment for existing courses** — Currently all hardcoded to Sem 1
- [ ] **Edit functionality** — Can only create and delete; no update/edit for assignments, projects, exams, announcements, or module topics
- [ ] **Proper admin authentication** — Currently just a password field on every form. Should have an admin login session.
- [ ] **Password hashing** — Hash the admin password instead of plaintext comparison
- [ ] **CSRF protection** — Add Flask-WTF or similar
- [ ] **Student-specific features** — Currently every whitelisted student sees the same data. No personal assignment tracking or grade viewing.
- [ ] **Notification system** — No email/push notifications for new announcements or upcoming deadlines
- [ ] **The `resources` field on courses** — Placeholder that was never built out
- [ ] **Production deployment** — Currently localhost-only. Would need proper SECRET_KEY, HTTPS, a real web server (gunicorn/nginx), etc.
- [ ] **Proper error handling on frontend** — Better UX when network requests fail
- [ ] **Mobile optimization** — Admin panel sidebar is hidden on mobile with no hamburger toggle
- [ ] **Cleanup of old JSON files** — `courses.json`, `assignments.json`, `exam.json`, `project.json`, `announcements.json` are orphaned after migration to SQLite

---

## 10. HOW TO RUN THE PROJECT

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the migration (first time only — populates SQLite from JSON)
python migrate.py

# 3. Start the server
python run.py
# OR
run.bat

# Server starts on http://localhost:5001
# Student portal: http://localhost:5001/
# Admin panel: http://localhost:5001/admin
# Login: http://localhost:5001/login.html

# On localhost, you can use "Skip Login" button (dev bypass)
# Admin password for all write operations: "admin" (from .env)
```

---

## 11. KEY CONFIGURATION VALUES

| Setting | Value | Location |
|---------|-------|----------|
| Port | 5001 | `.env` |
| Admin Password | `admin` | `.env` → `Config.ADMIN_PASSWORD` |
| Secret Key | `change-this-to-a-random-string-in-production` | `.env` |
| Google Client ID | `212930513958-1mh49c4j0l3sqjbsbq5b6q1o4oav139e.apps.googleusercontent.com` | `.env` + `config.py` + `login.html` |
| Database | `data/portal.db` (SQLite) | `config.py` |
| Upload folder | `static/uploads/` | `config.py` |
| Debug mode | `True` | `.env` |
| CORS Origins | `localhost:5001, 127.0.0.1:5001, localhost:5500, 127.0.0.1:5500` | `.env` |

---

## 12. DESIGN SYSTEM SUMMARY

- **Theme:** Apple/Vercel-inspired, ultra-clean with sharp typography
- **Fonts:** Inter (UI) + JetBrains Mono (code/mono)
- **Color tokens:** Full light + dark theme (CSS variables)
- **Light accent:** `#171717` (near-black), Dark accent: `#FAFAFA` (near-white)
- **Semantic colors:** Success (green), Warning (amber), Danger (red), Info (blue), Violet
- **Animations:** fadeUp, fadeOut, fadeIn, shimmer, slideDown, scaleIn
- **Components in CSS:** sidebar, cards, stat-cards, badges, tables, modals, calendar, timeline, toast, filter pills, command palette, skeleton loaders, priority strip, module cards, assignment cards, announcement cards
