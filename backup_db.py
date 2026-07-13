"""
backup_db.py — Snapshot data/portal.db into data/backups/, keep the last 14.

Run manually before risky changes, or daily via a scheduled task
(PythonAnywhere: Tasks tab -> `python3 /home/YOURUSER/csbs-portal/backup_db.py`).
"""
import os
import sqlite3
from datetime import datetime

from config import Config

BACKUP_DIR = os.path.join(os.path.dirname(Config.DB_PATH), 'backups')
KEEP = 14


def backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    dest = os.path.join(BACKUP_DIR, f'portal-{stamp}.db')

    # sqlite3 backup API is safe even while the app is serving requests
    src = sqlite3.connect(Config.DB_PATH)
    dst = sqlite3.connect(dest)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    print(f'[OK] backed up -> {dest}')

    # prune old snapshots
    snaps = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith('portal-'))
    for old in snaps[:-KEEP]:
        os.remove(os.path.join(BACKUP_DIR, old))
        print(f'[prune] {old}')


if __name__ == '__main__':
    backup()
