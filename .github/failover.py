"""Promote this mirror only if willowwhitman.com stops being the site.

Daily. The probe is the IndexNow key file: only the real site serves it, so a
registrar parking page (which answers 200) still counts as down. Three failed
days in a row and every willowwhitman.com URL in the mirror is rewritten to
this host, so search engines move here. When the domain answers again, the
files are restored from the commit taken just before the switch.
"""
import json, pathlib, subprocess, urllib.request

PRIMARY = "https://willowwhitman.com"
MIRROR = "https://willowwhitman.github.io"
PROBE = PRIMARY + "/36ed7564c1f9e2fcb388a24edd6d5f52.txt"
KEY = "36ed7564c1f9e2fcb388a24edd6d5f52"
DAYS_DOWN = 3
STATE = pathlib.Path(".github/failover-state.json")
TEXT = (".html", ".xml", ".txt", ".js")


def primary_up():
    try:
        req = urllib.request.Request(PROBE, headers={"User-Agent": "willowwhitman-mirror-check"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200 and r.read(200).decode("utf8", "ignore").strip() == KEY
    except Exception:
        return False


def git(*a):
    return subprocess.run(["git", *a], check=True, capture_output=True, text=True).stdout.strip()


def site_files():
    for p in pathlib.Path(".").rglob("*"):
        if p.is_file() and p.suffix in TEXT and ".git" not in p.parts and ".github" not in p.parts:
            yield p


state = json.loads(STATE.read_text()) if STATE.exists() else {"mode": "mirror", "fails": 0}
up = primary_up()
print(f"primary up: {up}; state before: {state}")

if state["mode"] == "mirror":
    state["fails"] = 0 if up else state["fails"] + 1
    if state["fails"] >= DAYS_DOWN:
        state["pre_failover"] = git("rev-parse", "HEAD")
        for p in site_files():
            s = p.read_text(encoding="utf8")
            if PRIMARY in s:
                p.write_text(s.replace(PRIMARY, MIRROR), encoding="utf8")
        state["mode"] = "primary"
        print("FAILOVER: the mirror now names itself as the canonical site")
elif up:
    git("checkout", state["pre_failover"], "--", ".", ":(exclude).github")
    state = {"mode": "mirror", "fails": 0}
    print("RECOVERED: canonicals point back to willowwhitman.com")

STATE.write_text(json.dumps(state, indent=1) + "\n")
