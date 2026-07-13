"""
run.py — Entry point for the CSBS Portal server.
"""
from app import create_app
from config import Config

app = create_app()

if __name__ == '__main__':
    print(f"Starting CSBS Portal on port {Config.PORT}...")
    app.run(debug=Config.DEBUG, port=Config.PORT)
