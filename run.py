"""
run.py — Entry point for the CSBS Portal server.
"""
from app import create_app
from config import Config

app = create_app()

if __name__ == '__main__':
    print(f"Starting CSBS Portal on port {Config.PORT}...")
    # threaded=True — the dashboard fires several API calls at once;
    # without threads Flask's dev server answers them one by one.
    app.run(debug=Config.DEBUG, port=Config.PORT, threaded=True)
