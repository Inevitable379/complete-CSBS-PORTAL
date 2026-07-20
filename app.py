"""
app.py — Flask application factory for CSBS Portal.
Clean, secure, all-JSON API with proper auth and error handling.
"""
import os
from datetime import datetime
from flask import Flask, jsonify, request, session, send_from_directory, redirect
from flask_cors import CORS
from werkzeug.utils import secure_filename
from config import Config
from database import (
    init_db, get_all_courses, update_topic_url,
    get_all, add_item, delete_item, get_count,
    get_whitelisted_emails, add_course, delete_course,
    add_topic, delete_topic, get_all_materials, unlink_material,
    rename_topic, add_whitelisted_email, remove_whitelisted_email,
    get_timetable, get_timetable_semesters, upsert_timetable_slot,
    delete_timetable_slot, clear_timetable_semester
)
from auth import verify_google_token, login_required, admin_required


def create_app():
    app = Flask(__name__, static_folder=None)
    app.secret_key = Config.SECRET_KEY
    app.config['UPLOAD_FOLDER'] = Config.UPLOAD_FOLDER
    app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH

    # Session cookie hardening
    app.config['PERMANENT_SESSION_LIFETIME'] = Config.SESSION_LIFETIME
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = not Config.DEBUG

    # Fail fast in production if critical secrets are missing/insecure
    for problem in Config.validate():
        print(f"[CONFIG WARNING] {problem}")
        if not Config.DEBUG:
            raise RuntimeError(f"Insecure production config: {problem}")

    CORS(app, origins=Config.CORS_ORIGINS, supports_credentials=True)

    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    with app.app_context():
        init_db()

    # -----------------------------------------------------------------------
    # Page routes
    # -----------------------------------------------------------------------

    def _page(fname):
        """Serve an HTML page with ETag revalidation (304 on repeat visits)."""
        resp = send_from_directory(Config.BASE_DIR, fname)
        resp.cache_control.no_cache = True  # always revalidate, but a 304 is ~0 bytes
        resp.add_etag()
        resp.make_conditional(request)
        return resp

    @app.route('/')
    def home():
        return _page('index.html')

    @app.route('/login.html')
    def login_page():
        return _page('login.html')

    @app.route('/admin')
    def admin_page():
        if not session.get('is_admin'):
            return redirect('/login.html')
        return _page('admin.html')

    @app.route('/ether')
    def ether_page():
        """ETHER — immersive 3D mode (desktop). Same data, different universe."""
        if 'user_email' not in session:
            return redirect('/login.html')
        return _page('ether.html')

    @app.route('/sw.js')
    def service_worker():
        # Served from root so the worker's scope covers the whole app.
        resp = send_from_directory(os.path.join(Config.BASE_DIR, 'static'), 'sw.js')
        resp.cache_control.no_cache = True  # browsers must always check for SW updates
        return resp

    # -----------------------------------------------------------------------
    # Auth routes
    # -----------------------------------------------------------------------

    @app.route('/api/auth/login', methods=['POST'])
    def auth_login():
        """Verify Google token server-side, create session."""
        data = request.json
        if not data:
            return jsonify({"error": "Request body required"}), 400

        # Dev bypass — only when explicitly enabled for local development
        if data.get('dev_bypass') and Config.DEBUG and Config.ALLOW_DEV_BYPASS:
            session['user_email'] = 'dev@localhost'
            session['user_name'] = 'Developer'
            session['is_admin'] = True
            session.permanent = True
            return jsonify({
                "success": True,
                "email": "dev@localhost",
                "name": "Developer",
                "is_admin": True
            })

        if 'token' not in data:
            return jsonify({"error": "Token required"}), 400

        payload = verify_google_token(data['token'])
        if not payload:
            return jsonify({"error": "Invalid token"}), 401

        email = payload.get('email', '').lower().strip()
        name = payload.get('name', '')

        # Check whitelist (admin emails are always allowed)
        whitelist = set(get_whitelisted_emails()) | set(Config.ADMIN_EMAILS)
        if email not in whitelist:
            return jsonify({"error": f"Access denied: {email} is not authorized"}), 403

        # Create server-side session
        session['user_email'] = email
        session['user_name'] = name
        session['is_admin'] = email in Config.ADMIN_EMAILS
        session.permanent = True

        return jsonify({
            "success": True,
            "email": email,
            "name": name,
            "is_admin": session['is_admin']
        })

    @app.route('/api/auth/check')
    def auth_check():
        """Check if the current session is valid."""
        if 'user_email' in session:
            return jsonify({
                "authenticated": True,
                "email": session['user_email'],
                "name": session.get('user_name', ''),
                "is_admin": session.get('is_admin', False)
            })
        return jsonify({"authenticated": False}), 401

    @app.route('/api/auth/logout', methods=['POST'])
    def auth_logout():
        session.clear()
        return jsonify({"success": True})

    @app.route('/api/config')
    def api_config():
        """Public: the Google client ID the login page needs to start sign-in."""
        return jsonify({"google_client_id": Config.GOOGLE_CLIENT_ID})

    # -----------------------------------------------------------------------
    # Data API routes (require login)
    # -----------------------------------------------------------------------

    @app.route('/api/modules')
    @login_required
    def api_modules():
        try:
            return jsonify(get_all_courses())
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route('/api/<category>')
    @login_required
    def api_get_data(category):
        valid = {'assignments', 'projects', 'exams', 'announcements'}
        if category not in valid:
            return jsonify([])
        return jsonify(get_all(category))

    @app.route('/api/materials')
    @admin_required
    def api_materials():
        """Get all topics with attached materials."""
        return jsonify(get_all_materials())

    @app.route('/api/materials/<int:topic_id>', methods=['DELETE'])
    @admin_required
    def api_delete_material(topic_id):
        """Remove the material link from a topic without deleting the topic."""
        unlink_material(topic_id)
        return jsonify({"success": True})

    @app.route('/api/stats')
    @login_required
    def api_stats():
        """Dashboard statistics."""
        from database import get_db
        conn = get_db()
        module_count = conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
        conn.close()
        return jsonify({
            "assignments": get_count('assignments'),
            "projects": get_count('projects'),
            "exams": get_count('exams'),
            "announcements": get_count('announcements'),
            "modules": module_count
        })

    # -----------------------------------------------------------------------
    # Google Sheets proxy (login required — keeps the sheet URL private
    # and the class data off the public internet)
    # -----------------------------------------------------------------------

    _sheet_cache = {}  # name -> (fetched_at_ts, text)

    def _fetch_sheet(name, url):
        import time
        import requests as _rq
        now = time.time()
        cached = _sheet_cache.get(name)
        if cached and now - cached[0] < Config.SHEET_CACHE_SECONDS:
            return cached[1]
        r = _rq.get(url, timeout=10)
        r.raise_for_status()
        _sheet_cache[name] = (now, r.text)
        return r.text

    @app.route('/api/sheets/<name>')
    @login_required
    def api_sheets(name):
        if name == 'schedule':
            # Multi-semester: /api/sheets/schedule?sem=3
            sched = Config.schedule_map()
            default_sem = sorted(sched.keys())[0]
            try:
                sem = int(request.args.get('sem', default_sem))
            except ValueError:
                return jsonify({"error": "Invalid semester"}), 400
            if sem not in sched:
                return jsonify({"error": f"No timetable published for Semester {sem}"}), 404
            cache_key, url = f'schedule_sem{sem}', sched[sem]
        elif name == 'attendance':
            cache_key, url = 'attendance', Config.ATTENDANCE_CSV_URL
        else:
            return jsonify({"error": "Unknown sheet"}), 404
        try:
            csv_text = _fetch_sheet(cache_key, url)
            return csv_text, 200, {'Content-Type': 'text/csv; charset=utf-8'}
        except Exception:
            # Serve stale cache if Google is unreachable
            cached = _sheet_cache.get(cache_key)
            if cached:
                return cached[1], 200, {'Content-Type': 'text/csv; charset=utf-8'}
            return jsonify({"error": "Sheet temporarily unavailable"}), 502

    @app.route('/api/sheets/schedule/semesters')
    @login_required
    def api_schedule_semesters():
        """Sorted list of semester numbers that have timetable data in the DB."""
        return jsonify(get_timetable_semesters())

    # -----------------------------------------------------------------------
    # Admin write routes (require admin session)
    # -----------------------------------------------------------------------

    @app.route('/api/add', methods=['POST'])
    @admin_required
    def api_add_item():
        """Add an assignment, project, or exam."""
        category = request.form.get('category')
        valid = {'assignments', 'projects', 'exams'}
        if category not in valid:
            return jsonify({"error": "Invalid category"}), 400

        field_map = {
            'assignments': ['subject_code', 'title', 'date', 'status', 'message'],
            'projects': ['course', 'title', 'description', 'due_date', 'repo_link', 'demo_link'],
            'exams': ['course', 'type', 'date', 'time', 'location'],
        }

        data = {}
        for field in field_map[category]:
            value = request.form.get(field, '')
            if value:
                data[field] = value

        if not data.get('title') and not data.get('course'):
            return jsonify({"error": "Title or course is required"}), 400

        new_id = add_item(category, data)
        return jsonify({"success": True, "id": new_id})

    @app.route('/api/announcements', methods=['POST'])
    @admin_required
    def api_add_announcement():
        """Add an announcement."""
        data = {
            'title': request.form.get('title', ''),
            'content': request.form.get('content', ''),
            'date': datetime.now().strftime("%d %b %Y"),
            'type': request.form.get('type', 'info'),
            'author': 'Admin'
        }
        if not data['title']:
            return jsonify({"error": "Title is required"}), 400

        new_id = add_item('announcements', data)
        return jsonify({"success": True, "id": new_id})

    @app.route('/api/delete', methods=['POST'])
    @admin_required
    def api_delete_item():
        """Delete any item by ID and category."""
        data = request.json
        category = data.get('category')
        item_id = data.get('id')

        valid = {'assignments', 'projects', 'exams', 'announcements'}
        if category not in valid:
            return jsonify({"error": "Invalid category"}), 400

        delete_item(category, item_id)
        return jsonify({"success": True})

    @app.route('/api/upload', methods=['POST'])
    @admin_required
    def api_upload_file():
        """Upload a module resource file."""
        subject_code = request.form.get('subject_code')
        topic_name = request.form.get('topic_name')
        file = request.files.get('file')

        if not file or file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        filename = secure_filename(file.filename)
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext not in Config.ALLOWED_UPLOAD_EXTENSIONS:
            allowed = ', '.join(sorted(Config.ALLOWED_UPLOAD_EXTENSIONS))
            return jsonify({"error": f"File type .{ext} not allowed. Allowed types: {allowed}"}), 400
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

        url = f"/static/uploads/{filename}"
        success = update_topic_url(subject_code, topic_name, url)

        if success:
            return jsonify({"success": True, "url": url})
        return jsonify({"error": "Topic not found"}), 404

    @app.route('/api/link', methods=['POST'])
    @admin_required
    def api_set_link():
        """Set an external URL (Google Drive, etc.) for a topic."""
        data = request.json or {}
        subject_code = data.get('subject_code', '').strip()
        topic_name = data.get('topic_name', '').strip()
        url = data.get('url', '').strip()

        if not subject_code or not topic_name or not url:
            return jsonify({"error": "Subject, topic, and URL are required"}), 400

        import re
        drive_match = re.search(r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)', url)
        if drive_match:
            file_id = drive_match.group(1)
            url = f"https://drive.google.com/file/d/{file_id}/preview"

        success = update_topic_url(subject_code, topic_name, url)
        if success:
            return jsonify({"success": True, "url": url})
        return jsonify({"error": "Topic not found"}), 404

    # -----------------------------------------------------------------------
    # Module / Course management
    # -----------------------------------------------------------------------

    @app.route('/api/modules', methods=['POST'])
    @admin_required
    def api_add_module():
        """Add a new course/module with topics."""
        data = request.json or {}
        code = data.get('code', '').strip()
        title = data.get('title', '').strip()
        semester = int(data.get('semester', 1))
        icon = data.get('icon', 'fas fa-book').strip()
        topics = data.get('topics', [])
        credits = int(data.get('credits', 0))
        internal_marks = data.get('internal_marks', '').strip()

        if not code or not title:
            return jsonify({"error": "Code and title are required"}), 400

        try:
            new_id = add_course(code, title, icon, semester, topics, credits, internal_marks)
            return jsonify({"success": True, "id": new_id})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route('/api/modules/<int:course_id>', methods=['DELETE'])
    @admin_required
    def api_delete_module(course_id):
        """Delete a course/module and all its topics."""
        try:
            delete_course(course_id)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route('/api/topics', methods=['POST'])
    @admin_required
    def api_add_topic():
        """Add a single (empty) topic to an existing course."""
        data = request.json or {}
        subject_code = data.get('subject_code', '').strip()
        topic_name = data.get('topic_name', '').strip()
        if not subject_code or not topic_name:
            return jsonify({"error": "Subject and topic name are required"}), 400
        if add_topic(subject_code, topic_name):
            return jsonify({"success": True})
        return jsonify({"error": "Course not found or topic already exists"}), 400

    @app.route('/api/topics/<int:topic_id>', methods=['DELETE'])
    @admin_required
    def api_delete_topic(topic_id):
        """Remove a single topic by id."""
        delete_topic(topic_id)
        return jsonify({"success": True})

    @app.route('/api/topics/<int:topic_id>', methods=['PUT'])
    @admin_required
    def api_rename_topic(topic_id):
        data = request.json
        new_name = data.get('name', '').strip()
        if not new_name:
            return jsonify({"error": "Topic name cannot be empty"}), 400
        rename_topic(topic_id, new_name)
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Users Management
    # -----------------------------------------------------------------------

    @app.route('/api/users', methods=['GET'])
    @admin_required
    def api_get_users():
        emails = get_whitelisted_emails()
        # Include hardcoded admins as well to show who has access
        all_users = set(emails) | set(Config.ADMIN_EMAILS)
        return jsonify([{"email": e, "is_admin": e in Config.ADMIN_EMAILS} for e in sorted(list(all_users))])

    @app.route('/api/users', methods=['POST'])
    @admin_required
    def api_add_user():
        data = request.json
        email = data.get('email', '').strip().lower()
        if not email:
            return jsonify({"error": "Email is required"}), 400
        add_whitelisted_email(email)
        return jsonify({"success": True, "email": email})

    @app.route('/api/users/<email>', methods=['DELETE'])
    @admin_required
    def api_delete_user(email):
        email = email.strip().lower()
        if email in Config.ADMIN_EMAILS:
            return jsonify({"error": "Cannot remove hardcoded admin emails"}), 400
        remove_whitelisted_email(email)
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Timetable API (DB-backed, replaces Google Sheets for timetable)
    # -----------------------------------------------------------------------

    @app.route('/api/timetable')
    @login_required
    def api_get_timetable():
        """GET /api/timetable?sem=1 — return all slots for a semester."""
        try:
            sem = int(request.args.get('sem', 1))
        except ValueError:
            return jsonify({"error": "Invalid semester"}), 400
        slots = get_timetable(sem)
        return jsonify(slots)

    @app.route('/api/timetable/semesters')
    @login_required
    def api_timetable_semesters():
        """GET /api/timetable/semesters — list of semesters that have data."""
        return jsonify(get_timetable_semesters())

    @app.route('/api/timetable/slot', methods=['POST'])
    @admin_required
    def api_upsert_slot():
        """POST /api/timetable/slot — add or update a timetable slot.
        Body (JSON): semester, day, slot_time, slot_order, subject,
                     subject_code (opt), room (opt), id (opt — if editing)."""
        data = request.get_json(force=True)
        required = ('semester', 'day', 'slot_time', 'slot_order', 'subject')
        if not all(data.get(k) is not None for k in required):
            return jsonify({"error": f"Missing required fields: {required}"}), 400
        new_id = upsert_timetable_slot(
            semester=data['semester'],
            day=data['day'],
            slot_time=data['slot_time'],
            slot_order=data['slot_order'],
            subject=data['subject'],
            subject_code=data.get('subject_code', ''),
            faculty=data.get('faculty', ''),
            room=data.get('room', ''),
            slot_id=data.get('id')
        )
        return jsonify({"success": True, "id": new_id})

    @app.route('/api/timetable/slot/<int:slot_id>', methods=['DELETE'])
    @admin_required
    def api_delete_slot(slot_id):
        """DELETE /api/timetable/slot/<id> — remove a single slot."""
        delete_timetable_slot(slot_id)
        return jsonify({"success": True})

    @app.route('/api/timetable/bulk', methods=['POST'])
    @admin_required
    def api_bulk_import():
        """POST /api/timetable/bulk — bulk import slots for a semester.
        Body (JSON): { semester: int, slots: [{day, slot_time, slot_order,
                       subject, subject_code?, room?}, ...] }
        Clears existing data for that semester first."""
        data = request.get_json(force=True)
        sem = data.get('semester')
        slots = data.get('slots', [])
        if not sem or not isinstance(slots, list):
            return jsonify({"error": "semester and slots[] required"}), 400
        clear_timetable_semester(sem)
        for i, slot in enumerate(slots):
            upsert_timetable_slot(
                semester=sem,
                day=slot.get('day', ''),
                slot_time=slot.get('slot_time', ''),
                slot_order=slot.get('slot_order', i),
                subject=slot.get('subject', ''),
                subject_code=slot.get('subject_code', ''),
                faculty=slot.get('faculty', ''),
                room=slot.get('room', '')
            )
        return jsonify({"success": True, "imported": len(slots)})

    @app.route('/api/timetable/semester/<int:sem>', methods=['DELETE'])
    @admin_required
    def api_clear_semester(sem):
        """DELETE /api/timetable/semester/<sem> — wipe all slots for a semester."""
        clear_timetable_semester(sem)
        return jsonify({"success": True})

    # -----------------------------------------------------------------------
    # Static file serving
    # -----------------------------------------------------------------------

    @app.route('/static/<path:filename>')
    def serve_static(filename):
        # Uploaded course materials are for logged-in users only.
        # CSS/JS/fonts stay public so the login page can render.
        if filename.startswith('uploads/') and 'user_email' not in session:
            return jsonify({"error": "Unauthorized"}), 401
        resp = send_from_directory(os.path.join(Config.BASE_DIR, 'static'), filename)
        # Let browsers reuse CSS/JS for 5 min without asking, then revalidate
        # cheaply (304 via ETag) — cuts repeat-visit payload to near zero.
        if not filename.startswith('uploads/'):
            resp.cache_control.public = True
            resp.cache_control.max_age = 3600
            resp.add_etag()
            resp.make_conditional(request)
        return resp

    # -----------------------------------------------------------------------
    # Error handlers
    # -----------------------------------------------------------------------

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": f"File too large. Maximum size is {Config.MAX_UPLOAD_MB} MB."}), 413

    # -----------------------------------------------------------------------
    # Gzip compression — main.js goes 77 KB → ~19 KB on the wire.
    # Compressed copies are cached in memory so repeat hits cost nothing.
    # -----------------------------------------------------------------------

    import gzip as _gzip
    _gz_cache = {}  # (path, etag) -> compressed bytes
    _GZ_TYPES = ('text/', 'application/json', 'application/javascript', 'image/svg')

    @app.after_request
    def compress_response(resp):
        accept = request.headers.get('Accept-Encoding', '')
        if ('gzip' not in accept.lower()
                or resp.status_code != 200
                or resp.headers.get('Content-Encoding')):
            return resp
        ctype = resp.headers.get('Content-Type', '')
        if not any(ctype.startswith(t) for t in _GZ_TYPES):
            return resp
        try:
            key = (request.path, resp.headers.get('ETag', ''))
            gz = _gz_cache.get(key) if key[1] else None
            if gz is None:
                resp.direct_passthrough = False  # static files stream by default
                data = resp.get_data()
                if len(data) < 500:
                    return resp
                gz = _gzip.compress(data, 6)
                if key[1] and len(_gz_cache) < 128:
                    _gz_cache[key] = gz
            resp.set_data(gz)
            resp.headers['Content-Encoding'] = 'gzip'
            resp.headers['Content-Length'] = len(gz)
            resp.headers.add('Vary', 'Accept-Encoding')
        except Exception:
            pass  # never let compression break a response
        return resp

    return app
