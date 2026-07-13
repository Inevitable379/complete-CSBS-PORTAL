import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


def _split_csv(value):
    """Parse a comma-separated env value into a clean lowercase list."""
    return [v.strip().lower() for v in (value or '').split(',') if v.strip()]


class Config:
    # --- Secrets ---
    SECRET_KEY = os.getenv('SECRET_KEY', 'csbs-portal-dev-key-change-in-prod')
    GOOGLE_CLIENT_ID = os.getenv(
        'GOOGLE_CLIENT_ID',
        '212930513958-1mh49c4j0l3sqjbsbq5b6q1o4oav139e.apps.googleusercontent.com'
    )

    # Emails (must also be on the whitelist) that get admin-panel access.
    # Comma-separated in .env, e.g. ADMIN_EMAILS=you@jainuniversity.ac.in
    ADMIN_EMAILS = _split_csv(os.getenv('ADMIN_EMAILS', ''))

    # --- Paths ---
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(BASE_DIR, 'data', 'portal.db')
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')

    # --- Google Sheets (published CSV) sources, proxied via /api/sheets/* ---
    SCHEDULE_CSV_URL = os.getenv(
        'SCHEDULE_CSV_URL',
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQelGRJbrqerJsUMeScuBiSMhJOGlyFb0E3IUjjxpnFbhOg0MtO_0dlzxSMjNlHOImmPLSHYqcjsJEe/pub?gid=0&single=true&output=csv'
    )
    ATTENDANCE_CSV_URL = os.getenv(
        'ATTENDANCE_CSV_URL',
        'https://docs.google.com/spreadsheets/d/e/2PACX-1vQelGRJbrqerJsUMeScuBiSMhJOGlyFb0E3IUjjxpnFbhOg0MtO_0dlzxSMjNlHOImmPLSHYqcjsJEe/pub?gid=1674592517&single=true&output=csv'
    )
    SHEET_CACHE_SECONDS = int(os.getenv('SHEET_CACHE_SECONDS', 180))

    # --- Uploads ---
    ALLOWED_UPLOAD_EXTENSIONS = {'pdf', 'ppt', 'pptx', 'doc', 'docx', 'png', 'jpg', 'jpeg'}
    MAX_UPLOAD_MB = int(os.getenv('MAX_UPLOAD_MB', 25))
    MAX_CONTENT_LENGTH = MAX_UPLOAD_MB * 1024 * 1024

    # --- Runtime ---
    PORT = int(os.getenv('PORT', 5001))
    DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
    # The "skip login" dev button only works when this is explicitly enabled locally.
    ALLOW_DEV_BYPASS = os.getenv('ALLOW_DEV_BYPASS', 'false').lower() == 'true'
    SESSION_LIFETIME = timedelta(days=int(os.getenv('SESSION_DAYS', 7)))

    CORS_ORIGINS = _split_csv(os.getenv(
        'CORS_ORIGINS',
        'http://localhost:5001,http://127.0.0.1:5001,http://localhost:5500,http://127.0.0.1:5500'
    ))

    @classmethod
    def validate(cls):
        """Return a list of production-safety problems (empty = all good)."""
        problems = []
        if cls.SECRET_KEY == 'csbs-portal-dev-key-change-in-prod':
            problems.append("SECRET_KEY is the insecure default — set a strong random SECRET_KEY in .env.")
        if not cls.ADMIN_EMAILS:
            problems.append("ADMIN_EMAILS is empty — no one can reach the admin panel. Set at least one email in .env.")
        return problems
