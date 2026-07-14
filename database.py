"""
database.py — SQLite database layer for CSBS Portal.
Handles schema creation and all CRUD operations.
"""
import sqlite3
import os
from config import Config


def get_db():
    """Get a database connection with Row factory for dict-like access."""
    os.makedirs(os.path.dirname(Config.DB_PATH), exist_ok=True)
    conn = sqlite3.connect(Config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            color TEXT DEFAULT '',
            icon TEXT DEFAULT 'fas fa-book',
            semester INTEGER DEFAULT 1,
            credits INTEGER DEFAULT 0,
            internal_marks TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            url TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_code TEXT NOT NULL,
            title TEXT NOT NULL,
            date TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            message TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_date TEXT DEFAULT '',
            repo_link TEXT DEFAULT '',
            demo_link TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course TEXT NOT NULL,
            type TEXT NOT NULL,
            date TEXT DEFAULT '',
            time TEXT DEFAULT '',
            location TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            date TEXT DEFAULT '',
            type TEXT DEFAULT 'info',
            author TEXT DEFAULT 'Admin',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whitelisted_emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL
        );
    ''')
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# CRUD helpers — each returns plain dicts (JSON-serializable)
# ---------------------------------------------------------------------------

def _rows_to_dicts(rows):
    return [dict(r) for r in rows]


# --- Courses & Topics ---

def get_all_courses():
    """Return courses with their topics nested."""
    conn = get_db()
    courses = _rows_to_dicts(conn.execute("SELECT * FROM courses ORDER BY id").fetchall())
    for course in courses:
        topics = _rows_to_dicts(
            conn.execute(
                "SELECT id, name, url FROM topics WHERE course_id = ? ORDER BY sort_order",
                (course['id'],)
            ).fetchall()
        )
        course['topics'] = topics
        course['resources'] = []  # Placeholder for future resource system
    conn.close()
    return courses


def update_topic_url(course_code, topic_name, url):
    """Set the file URL for a topic. Creates the topic if it doesn't exist yet
    (so an admin can upload straight to a new topic name — no pre-setup needed)."""
    conn = get_db()
    course = conn.execute("SELECT id FROM courses WHERE code = ?", (course_code,)).fetchone()
    if not course:
        conn.close()
        return False
    course_id = course['id']
    existing = conn.execute(
        "SELECT id FROM topics WHERE course_id = ? AND name = ?",
        (course_id, topic_name)
    ).fetchone()
    if existing:
        conn.execute("UPDATE topics SET url = ? WHERE id = ?", (url, existing['id']))
    else:
        next_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM topics WHERE course_id = ?",
            (course_id,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO topics (course_id, name, url, sort_order) VALUES (?, ?, ?, ?)",
            (course_id, topic_name, url, next_order)
        )
    conn.commit()
    conn.close()
    return True


def add_topic(course_code, topic_name):
    """Add an empty topic to an existing course.
    Returns False if the course is missing or the topic already exists."""
    conn = get_db()
    course = conn.execute("SELECT id FROM courses WHERE code = ?", (course_code,)).fetchone()
    if not course:
        conn.close()
        return False
    course_id = course['id']
    if conn.execute("SELECT 1 FROM topics WHERE course_id = ? AND name = ?",
                    (course_id, topic_name)).fetchone():
        conn.close()
        return False
    next_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM topics WHERE course_id = ?",
        (course_id,)
    ).fetchone()[0]
    conn.execute("INSERT INTO topics (course_id, name, sort_order) VALUES (?, ?, ?)",
                 (course_id, topic_name, next_order))
    conn.commit()
    conn.close()
    return True


def delete_topic(topic_id):
    """Remove a single topic by id."""
    conn = get_db()
    conn.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
    conn.commit()
    conn.close()
    return True


# --- Materials Management ---

def get_all_materials():
    """Return all topics that have a URL attached, joined with their course details."""
    conn = get_db()
    query = '''
        SELECT t.id, t.name as topic_name, t.url, 
               c.code as subject_code, c.title as course_title 
        FROM topics t
        JOIN courses c ON t.course_id = c.id
        WHERE t.url != '' AND t.url IS NOT NULL
        ORDER BY t.id DESC
    '''
    rows = _rows_to_dicts(conn.execute(query).fetchall())
    conn.close()
    return rows

def unlink_material(topic_id):
    """Remove the URL from a topic, keeping the topic itself."""
    conn = get_db()
    conn.execute("UPDATE topics SET url = '' WHERE id = ?", (topic_id,))
    conn.commit()
    conn.close()
    return True


# --- Generic CRUD for assignments, projects, exams, announcements ---

VALID_TABLES = {'assignments', 'projects', 'exams', 'announcements'}

def get_all(table):
    if table not in VALID_TABLES:
        return []
    conn = get_db()
    rows = _rows_to_dicts(conn.execute(f"SELECT * FROM {table} ORDER BY id DESC").fetchall())
    conn.close()
    return rows


def add_item(table, data):
    if table not in VALID_TABLES:
        return None
    conn = get_db()
    columns = ', '.join(data.keys())
    placeholders = ', '.join(['?'] * len(data))
    cursor = conn.execute(
        f"INSERT INTO {table} ({columns}) VALUES ({placeholders})",
        list(data.values())
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id


def delete_item(table, item_id):
    if table not in VALID_TABLES:
        return False
    conn = get_db()
    conn.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    return True


def get_count(table):
    if table not in VALID_TABLES:
        return 0
    conn = get_db()
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    conn.close()
    return count


# --- Whitelisted Emails ---

def get_whitelisted_emails():
    conn = get_db()
    rows = conn.execute("SELECT email FROM whitelisted_emails").fetchall()
    conn.close()
    return [r['email'] for r in rows]


def add_whitelisted_email(email):
    conn = get_db()
    try:
        conn.execute("INSERT OR IGNORE INTO whitelisted_emails (email) VALUES (?)", (email,))
        conn.commit()
    finally:
        conn.close()


# --- Course / Module Management ---

def add_course(code, title, icon='fas fa-book', semester=1, topics=None, credits=0, internal_marks=''):
    """Add a new course with optional topics. Returns the new course ID."""
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO courses (code, title, icon, semester, credits, internal_marks) VALUES (?, ?, ?, ?, ?, ?)",
            (code, title, icon, semester, credits, internal_marks)
        )
        course_id = cursor.lastrowid
        if topics:
            for i, topic_name in enumerate(topics):
                topic_name = topic_name.strip()
                if topic_name:
                    conn.execute(
                        "INSERT INTO topics (course_id, name, sort_order) VALUES (?, ?, ?)",
                        (course_id, topic_name, i)
                    )
        conn.commit()
        return course_id
    finally:
        conn.close()


def delete_course(course_id):
    """Delete a course and all its topics (cascade)."""
    conn = get_db()
    try:
        conn.execute("DELETE FROM topics WHERE course_id = ?", (course_id,))
        conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))
        conn.commit()
    finally:
        conn.close()
    return True


def get_course_by_id(course_id):
    """Get a single course by ID."""
    conn = get_db()
    row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
    conn.close()
    return dict(row) if row else None
