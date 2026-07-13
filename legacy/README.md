# Legacy data (archived)

These JSON files were the portal's original storage **before** the move to SQLite
(`data/portal.db`). They are kept only as an archive.

**The database is now the single source of truth.** The running app reads and writes
`data/portal.db` — it does not read these files. `migrate.py` will read them (from here)
only if you ever re-seed a fresh, empty database, and it now refuses to run if the
database already has data (so it can't duplicate rows again).

Safe to delete once you're confident the database is correct.
