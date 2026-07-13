"""
auth.py — Authentication layer for CSBS Portal.
Handles Google JWT verification, session management, and route protection.
Admin access is granted by session role (set at login from Config.ADMIN_EMAILS),
not by a shared password.
"""
from functools import wraps
from flask import session, jsonify
from config import Config

try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False
    print("WARNING: google-auth not installed. JWT verification will be skipped.")


def verify_google_token(token):
    """
    Verify a Google OAuth2 ID token server-side.
    Returns the decoded payload if valid, None otherwise.
    """
    if not GOOGLE_AUTH_AVAILABLE:
        # Fallback: decode without verification (dev only)
        import json, base64
        try:
            payload = token.split('.')[1]
            payload += '=' * (4 - len(payload) % 4)
            return json.loads(base64.b64decode(payload))
        except Exception:
            return None

    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            Config.GOOGLE_CLIENT_ID
        )
        return idinfo
    except ValueError:
        return None


def login_required(f):
    """Protect routes that require any logged-in whitelisted user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_email' not in session:
            return jsonify({"error": "Unauthorized — please log in"}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Protect admin-only write operations — requires an admin session."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_email' not in session:
            return jsonify({"error": "Unauthorized — please log in"}), 401
        if not session.get('is_admin'):
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated
