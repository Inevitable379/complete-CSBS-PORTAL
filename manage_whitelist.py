"""
manage_whitelist.py — add / remove / list authorized login emails.

Run on the server (PythonAnywhere Bash console), from the project folder:

    cd ~/csbs-portal

    python3 manage_whitelist.py list
    python3 manage_whitelist.py add juug25btech26920@jainuniversity.ac.in
    python3 manage_whitelist.py add a@ju.ac.in b@ju.ac.in c@ju.ac.in
    python3 manage_whitelist.py remove someone@ju.ac.in
    python3 manage_whitelist.py count

Emails are stored lowercase; duplicates are ignored automatically.
"""
import sys
from database import get_db, init_db


def _normalize(email):
    return email.strip().lower()


def list_emails():
    conn = get_db()
    rows = [r[0] for r in conn.execute(
        "SELECT email FROM whitelisted_emails ORDER BY email").fetchall()]
    conn.close()
    if not rows:
        print("Whitelist is EMPTY. Add emails with:  python3 manage_whitelist.py add <email>")
        return
    print(f"{len(rows)} authorized email(s):")
    for e in rows:
        print("  -", e)


def add_emails(emails):
    conn = get_db()
    added, skipped = 0, 0
    for raw in emails:
        email = _normalize(raw)
        if not email or "@" not in email:
            print(f"  [skip] '{raw}' doesn't look like an email")
            skipped += 1
            continue
        cur = conn.execute(
            "INSERT OR IGNORE INTO whitelisted_emails (email) VALUES (?)", (email,))
        if cur.rowcount:
            print(f"  [added] {email}")
            added += 1
        else:
            print(f"  [already there] {email}")
            skipped += 1
    conn.commit()
    conn.close()
    print(f"\nDone. {added} added, {skipped} skipped.")


def remove_emails(emails):
    conn = get_db()
    removed = 0
    for raw in emails:
        email = _normalize(raw)
        cur = conn.execute(
            "DELETE FROM whitelisted_emails WHERE email = ?", (email,))
        if cur.rowcount:
            print(f"  [removed] {email}")
            removed += 1
        else:
            print(f"  [not found] {email}")
    conn.commit()
    conn.close()
    print(f"\nDone. {removed} removed.")


def count():
    conn = get_db()
    n = conn.execute("SELECT COUNT(*) FROM whitelisted_emails").fetchone()[0]
    conn.close()
    print(f"{n} email(s) whitelisted.")


USAGE = __doc__


def main():
    init_db()  # ensure the table exists
    args = sys.argv[1:]
    if not args:
        print(USAGE)
        return
    cmd, rest = args[0].lower(), args[1:]
    if cmd == "list":
        list_emails()
    elif cmd == "count":
        count()
    elif cmd == "add":
        if not rest:
            print("Give at least one email:  python3 manage_whitelist.py add you@ju.ac.in")
            return
        add_emails(rest)
    elif cmd == "remove":
        if not rest:
            print("Give at least one email:  python3 manage_whitelist.py remove you@ju.ac.in")
            return
        remove_emails(rest)
    else:
        print(f"Unknown command '{cmd}'.\n")
        print(USAGE)


if __name__ == "__main__":
    main()
