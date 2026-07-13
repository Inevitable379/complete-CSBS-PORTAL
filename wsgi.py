"""
wsgi.py — Production entry point (PythonAnywhere / gunicorn / waitress).

PythonAnywhere: point the web app's WSGI config at this file, e.g.

    import sys
    sys.path.insert(0, '/home/YOURUSER/csbs-portal')
    from wsgi import application
"""
from app import create_app

application = create_app()
