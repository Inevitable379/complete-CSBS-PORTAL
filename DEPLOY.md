# CSBS Portal — Deploy Guide (PythonAnywhere free tier)

Follow top to bottom. ~30 minutes the first time.

## 1. Prepare secrets (do this locally first)

Generate a strong secret key:

```
python -c "import secrets; print(secrets.token_hex(32))"
```

Edit `.env`:

```
SECRET_KEY=<paste the generated value>
ADMIN_EMAILS=<your-email>@jainuniversity.ac.in     # comma-separate for more admins
DEBUG=False
ALLOW_DEV_BYPASS=false
```

Your admin email must ALSO be in the whitelist (it is — all batch emails are).
Remove the old `ADMIN_PASSWORD=` line; it is no longer used by the code.

## 2. Test locally once

```
pip install -r requirements.txt
python run.py
```

- Sign in with your Google account → you should land on the dashboard.
- Visit `/admin` → it should load (because your email is in ADMIN_EMAILS).
- Ask a friend (whitelisted, but not in ADMIN_EMAILS) to check `/admin` redirects them away.

## 3. Create the PythonAnywhere app

1. Sign up at pythonanywhere.com (free "Beginner" plan).
2. Open a **Bash console** and upload the project (zip it first, or `git clone` if you push to GitHub — `.gitignore` already excludes secrets/data):
   ```
   cd ~
   unzip csbs-portal.zip -d csbs-portal    # or: git clone <your-repo> csbs-portal
   cd csbs-portal
   pip3 install --user -r requirements.txt
   ```
3. Upload your real `.env` separately (Files tab → into `~/csbs-portal/`). Never put it in git.
4. Upload `data/portal.db` (Files tab → into `~/csbs-portal/data/`) — this carries your courses/topics over.
   The PDFs in `static/uploads/` too, if you want existing file links to keep working.

## 4. Configure the web app

1. **Web tab → Add a new web app → Manual configuration → Python 3.10+**
2. Set **Source code** to `/home/YOURUSER/csbs-portal`.
3. Edit the **WSGI configuration file** to exactly:
   ```python
   import sys
   sys.path.insert(0, '/home/YOURUSER/csbs-portal')
   from wsgi import application
   ```
4. Reload the web app.

## 5. Google sign-in for the new domain

In Google Cloud Console → your OAuth client → **Authorized JavaScript origins**, add:

```
https://YOURUSER.pythonanywhere.com
```

Also set in `.env` on the server:

```
CORS_ORIGINS=https://YOURUSER.pythonanywhere.com
```

Reload the web app after editing `.env`.

## 6. Backups (recommended)

**Tasks tab** → create a daily task:

```
python3 /home/YOURUSER/csbs-portal/backup_db.py
```

Keeps the last 14 daily snapshots in `data/backups/`.

## 7. Go-live checklist

- [ ] `https://YOURUSER.pythonanywhere.com` redirects to login when signed out
- [ ] Google sign-in works with a whitelisted email
- [ ] Non-whitelisted Google account is refused
- [ ] `/admin` works for you, redirects for a non-admin friend
- [ ] Upload a test PDF in Admin → Upload material → opens from the course card
- [ ] `curl https://YOURUSER.pythonanywhere.com/api/modules` returns `{"error": ...}` (not data!) — proves the API is locked
- [ ] Attendance/Schedule pages load (sheet proxy working)

## Notes / limits (free tier)

- ~512 MB disk. PDFs add up — prefer **Paste link** (Google Drive) for big files.
- The app sleeps if unvisited for 3 months (just log in to keep it alive).
- Custom domains need a paid plan; the `pythonanywhere.com` subdomain is fine.

## Troubleshooting

- **"Insecure production config" error on startup** — you forgot SECRET_KEY or ADMIN_EMAILS in `.env`. That error is on purpose: it refuses to boot unsafely.
- **Google button does nothing** — origin not added in Google Cloud Console (step 5).
- **500 on first request** — check the error log link on the Web tab; usually a missing package (`pip3 install --user -r requirements.txt`).

---

# Updating after you're live

There are two kinds of changes, and they work very differently.

## A) Content changes — NO redeploy needed
Adding courses, uploading module PDFs, posting assignments/exams/announcements,
adding or removing topics: do it **live in the `/admin` panel** on your site.
Changes appear instantly. This is ~95% of what you'll ever do.

## B) Code / design changes — edit → upload → reload
For editing HTML/CSS/JS or Python (e.g. tweak the GPA scale, colours, add a feature):

1. Edit the file on your computer.
2. Get it onto the server, either:
   - **Git (recommended):** commit + push locally, then in a PythonAnywhere **Bash console**:
     ```
     cd ~/csbs-portal && git pull
     ```
   - **Or upload:** Files tab → upload the changed file(s), overwriting the old ones.
3. **Web tab → Reload.** The change is live.

## ⚠️ Never overwrite these on the server when updating code
They hold your live data and secrets:
- `data/portal.db` — all your courses, topics, assignments, exams
- `static/uploads/` — uploaded PDFs
- `.env` — your secrets

`.gitignore` already excludes all three, so **`git pull` is always safe** — it only
touches code, never your data. (This is the big reason to use Git over re-uploading.)

## Backing up your live content
Anytime, download `data/portal.db` from the server (Files tab) — that single file is
your entire portal's content. `backup_db.py` (daily task) also keeps 14 rolling snapshots.

## Server vs local reminder
Once live, the **server's** database is the real one (it has everything you added via
the admin panel). Your laptop's copy will fall behind — that's fine and expected.
Only push *code* up; pull the *db* down if you want a backup.
