"""
migrate.py — One-time migration from JSON files to SQLite.
Run this once to populate the database from existing JSON data.

Usage:  python migrate.py
"""
import json
import os
from database import get_db, init_db
from config import Config

BASE_DIR = Config.BASE_DIR


def load_json(filename):
    # JSON archives live in legacy/ now (the SQLite DB is the source of truth).
    for base in (os.path.join(BASE_DIR, 'legacy'), BASE_DIR):
        filepath = os.path.join(base, filename)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    print(f"  Skipped: {filename} (not found)")
    return []


def migrate(force=False):
    print("=" * 50)
    print("CSBS Portal — JSON to SQLite Migration")
    print("=" * 50)

    # Initialize schema
    init_db()
    conn = get_db()

    # Idempotency guard — this is a ONE-TIME import. Re-running duplicates data.
    existing = conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
    if existing and not force:
        print(f"\n[ABORT] Database already contains {existing} courses.")
        print("        Migration is one-time; re-running would duplicate rows.")
        print("        Use `python migrate.py --force` only on a fresh/empty DB.")
        conn.close()
        return

    # --- 1. Courses & Topics ---
    print("\n[1/6] Migrating courses & topics...")
    courses = load_json('courses.json')
    for course in courses:
        conn.execute(
            "INSERT OR IGNORE INTO courses (id, code, title, color, icon, semester) VALUES (?,?,?,?,?,?)",
            (course['id'], course['code'], course['title'],
             course.get('color', ''), course.get('icon', 'fas fa-book'), 1)
        )
        for idx, topic in enumerate(course.get('topics', [])):
            t_name = topic['name'] if isinstance(topic, dict) else topic
            t_url = topic.get('url', '') if isinstance(topic, dict) else ''
            conn.execute(
                "INSERT OR IGNORE INTO topics (course_id, name, url, sort_order) VALUES (?,?,?,?)",
                (course['id'], t_name, t_url, idx)
            )
    print(f"  [OK] {len(courses)} courses migrated")

    # --- 2. Assignments ---
    print("\n[2/6] Migrating assignments...")
    assignments = load_json('assignments.json')
    clean_assignments = [a for a in assignments if a.get('title', '') != 'zjkdckcd']
    for item in clean_assignments:
        conn.execute(
            "INSERT INTO assignments (subject_code, title, date, status, message) VALUES (?,?,?,?,?)",
            (item.get('subject_code', ''), item.get('title', ''),
             item.get('date', ''),
             'pending' if item.get('status', '') == 'Room 305' else item.get('status', 'pending'),
             item.get('message', ''))
        )
    print(f"  [OK] {len(clean_assignments)} assignments migrated (junk data skipped)")

    # --- 3. Projects ---
    print("\n[3/6] Migrating projects...")
    projects = load_json('project.json')
    for item in projects:
        conn.execute(
            "INSERT INTO projects (course, title, description, due_date, repo_link, demo_link) VALUES (?,?,?,?,?,?)",
            (item.get('course', ''), item.get('title', ''),
             item.get('description', ''), item.get('due_date', ''),
             item.get('repo_link', ''), item.get('demo_link', ''))
        )
    print(f"  [OK] {len(projects)} projects migrated")

    # --- 4. Exams ---
    print("\n[4/6] Migrating exams...")
    exams = load_json('exam.json')
    for item in exams:
        # Skip malformed entries (wrong schema)
        if 'course' not in item and 'subject_code' in item:
            print(f"  [WARN] Skipped malformed exam entry: {item.get('title', 'unknown')}")
            continue
        conn.execute(
            "INSERT INTO exams (course, type, date, time, location) VALUES (?,?,?,?,?)",
            (item.get('course', ''), item.get('type', ''),
             item.get('date', ''), item.get('time', ''),
             item.get('location', ''))
        )
    print(f"  [OK] Exams migrated")

    # --- 5. Announcements ---
    print("\n[5/6] Migrating announcements...")
    announcements = load_json('announcements.json')
    for item in announcements:
        conn.execute(
            "INSERT INTO announcements (title, content, date, type, author) VALUES (?,?,?,?,?)",
            (item.get('title', ''), item.get('content', ''),
             item.get('date', ''), item.get('type', 'info'),
             item.get('author', 'Admin'))
        )
    print(f"  [OK] {len(announcements)} announcements migrated")

    # --- 6. Whitelisted Emails ---
    print("\n[6/6] Migrating email whitelist...")
    emails = [
        "juug25btech11186@jainuniversity.ac.in",
        "juug25btech12052@jainuniversity.ac.in",
        "juug25btech12131@jainuniversity.ac.in",
        "juug25btech12520@jainuniversity.ac.in",
        "juug25btech13071@jainuniversity.ac.in",
        "juug25btech13112@jainuniversity.ac.in",
        "juug25btech13497@jainuniversity.ac.in",
        "juug25btech13731@jainuniversity.ac.in",
        "juug25btech14971@jainuniversity.ac.in",
        "juug25btech15025@jainuniversity.ac.in",
        "juug25btech16979@jainuniversity.ac.in",
        "juug25btech17192@jainuniversity.ac.in",
        "juug25btech17199@jainuniversity.ac.in",
        "juug25btech19844@jainuniversity.ac.in",
        "juug25btech19935@jainuniversity.ac.in",
        "juug25btech22524@jainuniversity.ac.in",
        "juug25btech22916@jainuniversity.ac.in",
        "juug25btech23002@jainuniversity.ac.in",
        "juug25btech23109@jainuniversity.ac.in",
        "juug25btech23158@jainuniversity.ac.in",
        "juug25btech23274@jainuniversity.ac.in",
        "juug25btech23280@jainuniversity.ac.in",
        "juug25btech23494@jainuniversity.ac.in",
        "juug25btech23511@jainuniversity.ac.in",
        "juug25btech23717@jainuniversity.ac.in",
        "juug25btech24219@jainuniversity.ac.in",
        "juug25btech24345@jainuniversity.ac.in",
        "juug25btech24730@jainuniversity.ac.in",
        "juug25btech24817@jainuniversity.ac.in",
        "juug25btech25439@jainuniversity.ac.in",
        "juug25btech25476@jainuniversity.ac.in",
        "juug25btech25890@jainuniversity.ac.in",
        "juug25btech26056@jainuniversity.ac.in",
        "juug25btech26206@jainuniversity.ac.in",
        "juug25btech26252@jainuniversity.ac.in",
        "juug25btech26253@jainuniversity.ac.in",
        "juug25btech26740@jainuniversity.ac.in",
        "juug25btech26760@jainuniversity.ac.in",
        "juug25btech26920@jainuniversity.ac.in",
        "juug25btech27281@jainuniversity.ac.in",
        "juug25btech27341@jainuniversity.ac.in",
        "juug25btech27501@jainuniversity.ac.in",
        "juug25btech27606@jainuniversity.ac.in",
        "juug25btech27971@jainuniversity.ac.in",
        "juug25btech28647@jainuniversity.ac.in",
        "juug25btech28767@jainuniversity.ac.in",
        "juug25btech28888@jainuniversity.ac.in",
        "juug25btech28902@jainuniversity.ac.in",
        "juug25btech28918@jainuniversity.ac.in",
        "juug25btech29102@jainuniversity.ac.in",
        "juug25btech29635@jainuniversity.ac.in",
        "juug25btech29771@jainuniversity.ac.in",
        "juug25btech30044@jainuniversity.ac.in",
        "juug25btech30058@jainuniversity.ac.in",
        "juug25btech30063@jainuniversity.ac.in",
        "juug25btech30203@jainuniversity.ac.in",
        "juug25btech30303@jainuniversity.ac.in",
        "juug25btech30530@jainuniversity.ac.in",
        "juug25btech30944@jainuniversity.ac.in",
    ]
    for email in emails:
        conn.execute("INSERT OR IGNORE INTO whitelisted_emails (email) VALUES (?)", (email,))
    print(f"  [OK] {len(emails)} emails whitelisted")

    conn.commit()
    conn.close()

    print("\n" + "=" * 50)
    print("[DONE] Migration complete!")
    print(f"Database saved to: {Config.DB_PATH}")
    print("=" * 50)


if __name__ == '__main__':
    import sys
    migrate(force='--force' in sys.argv)
