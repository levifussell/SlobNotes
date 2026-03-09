#!/usr/bin/env python3
"""Note visualizer server."""

import os
import json
import re
import subprocess
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, abort

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
NOTES_ROOT = Path(os.environ.get("NOTES_ROOT", REPO_ROOT / "notes")).resolve()
SKIP_DIRS = {".git", ".venv", "__pycache__", "node_modules"}
SOURCES_FILE = REPO_ROOT / "tool" / "sources.json"

app = Flask(__name__, static_folder="static", static_url_path="/static")


def extract_tags_and_title(filepath: Path):
    """Extract frontmatter tags and derive title from a markdown file.

    Returns (title, tags_list, tag_levels_dict) where tag_levels_dict maps
    each tag to its level: "top", "mid", or "low".
    """
    rel = filepath.relative_to(NOTES_ROOT)
    parts = rel.parts

    # Top-level tag: first directory
    top_tags = [parts[0]] if len(parts) > 1 else []

    # Mid-level tags: intermediate directories (e.g. courses/perf_aware/file.md -> perf_aware)
    mid_tags = []
    if len(parts) > 2:
        mid_tags = [p.replace("_", " ") for p in parts[1:-1]]

    # Title from filename
    name = filepath.stem
    # Strip [p] prefix
    name = re.sub(r"^\[.*?\]", "", name)
    # Replace underscores with spaces
    title = name.replace("_", " ").strip()

    # Parse frontmatter tags (low-level)
    low_tags = []
    try:
        text = filepath.read_text(encoding="utf-8")
        lines = text.split("\n")
        for line in lines:
            stripped = line.strip()
            if stripped == "---":
                break
            m = re.match(r"^tags:\s*(.+)$", stripped, re.IGNORECASE)
            if m:
                low_tags = [t.strip() for t in m.group(1).split(",") if t.strip()]
                break
    except Exception:
        pass

    all_tags = top_tags + mid_tags + low_tags
    tag_levels = {}
    for t in top_tags:
        tag_levels[t] = "top"
    for t in mid_tags:
        tag_levels[t] = "mid"
    for t in low_tags:
        tag_levels[t] = "low"

    # Map each mid tag to its parent top tag
    tag_parents = {}
    if top_tags and mid_tags:
        for t in mid_tags:
            tag_parents[t] = top_tags[0]

    return title, all_tags, tag_levels, tag_parents


def scan_notes():
    """Walk NOTES_ROOT and collect all .md files with metadata.

    Returns (notes_list, tag_levels_dict, tag_parents_dict).
    """
    notes = []
    global_tag_levels = {}
    global_tag_parents = {}
    if not NOTES_ROOT.is_dir():
        return notes, global_tag_levels, global_tag_parents
    for dirpath, dirnames, filenames in os.walk(NOTES_ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in sorted(filenames):
            if not fname.endswith(".md"):
                continue
            fp = Path(dirpath) / fname
            rel = str(fp.relative_to(NOTES_ROOT))
            title, tags, tag_levels, tag_parents = extract_tags_and_title(fp)
            global_tag_levels.update(tag_levels)
            global_tag_parents.update(tag_parents)
            stat = fp.stat()
            # Count comments from sidecar file
            sidecar = fp.parent / f".{fp.stem}.comments.json"
            comment_count = 0
            if sidecar.is_file():
                try:
                    cdata = json.loads(sidecar.read_text(encoding="utf-8"))
                    comment_count = len([c for c in cdata.get("comments", []) if not c.get("resolved")])
                except Exception:
                    pass
            notes.append({
                "path": rel,
                "title": title,
                "tags": tags,
                "modified": stat.st_mtime,
                "commentCount": comment_count,
            })
    # Include empty top-level dirs as tags so new categories show up immediately
    for entry in sorted(NOTES_ROOT.iterdir()):
        if entry.is_dir() and entry.name not in SKIP_DIRS:
            if entry.name not in global_tag_levels:
                global_tag_levels[entry.name] = "top"

    notes.sort(key=lambda n: n["modified"], reverse=True)
    return notes, global_tag_levels, global_tag_parents


# In-memory cache
_notes_cache = []
_tag_levels_cache = {}
_tag_parents_cache = {}


def get_notes():
    global _notes_cache, _tag_levels_cache, _tag_parents_cache
    if not _notes_cache:
        _notes_cache, _tag_levels_cache, _tag_parents_cache = scan_notes()
    return _notes_cache, _tag_levels_cache, _tag_parents_cache


# --- Source config ---

def load_sources():
    """Load sources config from SOURCES_FILE. Returns dict with 'sources' and 'active'.

    Sources whose directories no longer exist are silently excluded.
    If no sources.json exists, a default entry is created only when the
    default NOTES_ROOT directory is present on disk.
    """
    cfg = None
    if SOURCES_FILE.is_file():
        try:
            cfg = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    if cfg is None:
        # No config file – only add default source if the directory exists
        if NOTES_ROOT.is_dir():
            cfg = {"sources": [{"name": "Default", "path": str(NOTES_ROOT)}], "active": str(NOTES_ROOT)}
        else:
            cfg = {"sources": [], "active": ""}
    else:
        # Filter out sources whose directories no longer exist
        cfg["sources"] = [s for s in cfg.get("sources", []) if Path(s["path"]).resolve().is_dir()]
        active = cfg.get("active", "")
        if active and not Path(active).resolve().is_dir():
            cfg["active"] = cfg["sources"][0]["path"] if cfg["sources"] else ""
        elif not active and cfg["sources"]:
            cfg["active"] = cfg["sources"][0]["path"]

    return cfg


def save_sources(cfg):
    """Save sources config to SOURCES_FILE."""
    SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SOURCES_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def switch_notes_root(new_path):
    """Switch NOTES_ROOT to a new path and invalidate cache."""
    global NOTES_ROOT, _notes_cache, _tag_levels_cache, _tag_parents_cache
    NOTES_ROOT = Path(new_path).resolve()
    _notes_cache = []
    _tag_levels_cache = {}
    _tag_parents_cache = {}


# --- Routes ---

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/notes")
def api_notes():
    notes, tag_levels, tag_parents = get_notes()
    return jsonify({"notes": notes, "tagLevels": tag_levels, "tagParents": tag_parents})


@app.route("/api/note/<path:note_path>")
def api_note(note_path):
    fp = NOTES_ROOT / note_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(404)
    try:
        content = fp.read_text(encoding="utf-8")
    except Exception:
        abort(500)
    return jsonify({"path": note_path, "content": content})


@app.route("/api/note/<path:note_path>", methods=["PUT"])
def api_save_note(note_path):
    fp = NOTES_ROOT / note_path
    if not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(403)
    data = request.get_json(force=True)
    content = data.get("content", "")
    try:
        fp.write_text(content, encoding="utf-8")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"ok": True})


@app.route("/api/rebuild", methods=["POST"])
def api_rebuild():
    global _notes_cache, _tag_levels_cache, _tag_parents_cache
    _notes_cache, _tag_levels_cache, _tag_parents_cache = scan_notes()
    return jsonify({"notes": _notes_cache, "tagLevels": _tag_levels_cache, "tagParents": _tag_parents_cache})


@app.route("/api/sources")
def api_sources():
    cfg = load_sources()
    return jsonify(cfg)


@app.route("/api/sources/add", methods=["POST"])
def api_sources_add():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    path = data.get("path", "").strip()
    if not name or not path:
        return jsonify({"ok": False, "error": "Name and path are required"}), 400
    p = Path(path).resolve()
    if not p.is_dir():
        return jsonify({"ok": False, "error": "Directory does not exist"}), 400
    cfg = load_sources()
    # Prevent duplicates
    for s in cfg["sources"]:
        if str(Path(s["path"]).resolve()) == str(p):
            return jsonify({"ok": False, "error": "Source already exists"}), 409
    cfg["sources"].append({"name": name, "path": str(p)})
    # Auto-activate if no active source
    if not cfg.get("active"):
        cfg["active"] = str(p)
    save_sources(cfg)
    return jsonify({"ok": True})


@app.route("/api/sources/select", methods=["POST"])
def api_sources_select():
    data = request.get_json(force=True)
    path = data.get("path", "").strip()
    if not path:
        return jsonify({"ok": False, "error": "Path is required"}), 400
    p = Path(path).resolve()
    if not p.is_dir():
        return jsonify({"ok": False, "error": "Directory does not exist"}), 400
    cfg = load_sources()
    cfg["active"] = str(p)
    save_sources(cfg)
    switch_notes_root(p)
    notes, tag_levels, tag_parents = scan_notes()
    global _notes_cache, _tag_levels_cache, _tag_parents_cache
    _notes_cache = notes
    _tag_levels_cache = tag_levels
    _tag_parents_cache = tag_parents
    return jsonify({"notes": notes, "tagLevels": tag_levels, "tagParents": tag_parents})


@app.route("/api/sources/remove", methods=["POST"])
def api_sources_remove():
    data = request.get_json(force=True)
    path = data.get("path", "").strip()
    if not path:
        return jsonify({"ok": False, "error": "Path is required"}), 400
    p = str(Path(path).resolve())
    cfg = load_sources()
    cfg["sources"] = [s for s in cfg["sources"] if str(Path(s["path"]).resolve()) != p]
    if cfg["active"] == p and cfg["sources"]:
        cfg["active"] = cfg["sources"][0]["path"]
    save_sources(cfg)
    return jsonify({"ok": True})


@app.route("/files/<path:file_path>")
def serve_file(file_path):
    """Serve files from the notes root (for images etc.)."""
    fp = NOTES_ROOT / file_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(404)
    return send_from_directory(fp.parent, fp.name)


# --- Note & directory creation ---

@app.route("/api/dir/create", methods=["POST"])
def api_create_dir():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name or "/" in name or "\\" in name:
        return jsonify({"ok": False, "error": "Invalid directory name"}), 400
    dirpath = NOTES_ROOT / name
    if dirpath.exists():
        return jsonify({"ok": False, "error": "Directory already exists"}), 409
    try:
        dirpath.mkdir()
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500
    return jsonify({"ok": True})


@app.route("/api/note/create", methods=["POST"])
def api_create_note():
    data = request.get_json(force=True)
    target_dir = data.get("dir", "").strip()
    if not target_dir:
        return jsonify({"ok": False, "error": "No directory specified"}), 400
    dirpath = NOTES_ROOT / target_dir
    if not dirpath.is_dir() or not str(dirpath.resolve()).startswith(str(NOTES_ROOT)):
        return jsonify({"ok": False, "error": "Invalid directory"}), 400

    # Generate date-based filename
    today = date.today()
    base = today.strftime("%Y_%m_%d")
    filename = base + ".md"
    counter = 2
    while (dirpath / filename).exists():
        filename = f"{base}_{counter}.md"
        counter += 1

    # Write default template
    content = f"tags: \ndate: {today.isoformat()}\n---\n"
    fp = dirpath / filename
    try:
        fp.write_text(content, encoding="utf-8")
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    rel = str(fp.relative_to(NOTES_ROOT))
    return jsonify({"ok": True, "path": rel})


@app.route("/api/note/rename", methods=["POST"])
def api_rename_note():
    data = request.get_json(force=True)
    old_path = data.get("oldPath", "")
    new_title = data.get("newTitle", "").strip()
    if not old_path or not new_title:
        return jsonify({"ok": False, "error": "Missing oldPath or newTitle"}), 400

    old_fp = NOTES_ROOT / old_path
    if not old_fp.is_file() or not str(old_fp.resolve()).startswith(str(NOTES_ROOT)):
        return jsonify({"ok": False, "error": "File not found"}), 404

    # Preserve any status prefix like [p] or [d]
    old_stem = old_fp.stem
    prefix_match = re.match(r"^(\[.*?\])", old_stem)
    prefix = prefix_match.group(1) if prefix_match else ""

    new_stem = prefix + new_title.replace(" ", "_")
    new_fp = old_fp.parent / (new_stem + ".md")

    if new_fp == old_fp:
        return jsonify({"ok": True, "newPath": old_path})
    if new_fp.exists():
        return jsonify({"ok": False, "error": "A note with that name already exists"}), 409

    try:
        # Move sidecar comments file if it exists
        old_comments = old_fp.parent / f".{old_fp.stem}.comments.json"
        old_fp.rename(new_fp)
        if old_comments.is_file():
            new_comments = new_fp.parent / f".{new_fp.stem}.comments.json"
            old_comments.rename(new_comments)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    new_path = str(new_fp.relative_to(NOTES_ROOT))
    return jsonify({"ok": True, "newPath": new_path})


# --- Comments (sidecar JSON) ---

def comments_path(note_path):
    """Return the sidecar .comments.json path for a given note path."""
    fp = NOTES_ROOT / note_path
    cp = fp.parent / f".{fp.stem}.comments.json"
    if not str(cp.resolve()).startswith(str(NOTES_ROOT)):
        raise ValueError("sidecar path escapes notes root")
    return cp


def load_comments(note_path):
    """Load comments for a note. Returns list (empty if no sidecar)."""
    cp = comments_path(note_path)
    if not cp.is_file():
        return []
    try:
        data = json.loads(cp.read_text(encoding="utf-8"))
        return data.get("comments", [])
    except Exception:
        return []


def save_comments(note_path, comments):
    """Save comments list to sidecar file. Deletes file if empty."""
    cp = comments_path(note_path)
    if not comments:
        if cp.is_file():
            cp.unlink()
        return
    cp.write_text(json.dumps({"comments": comments}, indent=2, ensure_ascii=False), encoding="utf-8")


@app.route("/api/comments/<path:note_path>")
def api_get_comments(note_path):
    fp = NOTES_ROOT / note_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(404)
    return jsonify({"comments": load_comments(note_path)})


@app.route("/api/comments/<path:note_path>", methods=["POST"])
def api_add_comment(note_path):
    fp = NOTES_ROOT / note_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(404)
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"ok": False, "error": "Empty comment"}), 400
    comments = load_comments(note_path)
    comment = {
        "id": f"c_{int(time.time())}_{uuid.uuid4().hex[:6]}",
        "text": text,
        "created": datetime.now(timezone.utc).isoformat(),
        "resolved": False,
    }
    comments.append(comment)
    save_comments(note_path, comments)
    return jsonify({"ok": True, "comment": comment})


@app.route("/api/comments/<path:note_path>/<comment_id>", methods=["PUT"])
def api_update_comment(note_path, comment_id):
    fp = NOTES_ROOT / note_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(404)
    data = request.get_json(force=True)
    comments = load_comments(note_path)
    for c in comments:
        if c["id"] == comment_id:
            if "text" in data:
                c["text"] = data["text"]
            if "resolved" in data:
                c["resolved"] = data["resolved"]
            save_comments(note_path, comments)
            return jsonify({"ok": True, "comment": c})
    return jsonify({"ok": False, "error": "Comment not found"}), 404


@app.route("/api/comments/<path:note_path>/<comment_id>", methods=["DELETE"])
def api_delete_comment(note_path, comment_id):
    fp = NOTES_ROOT / note_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(NOTES_ROOT)):
        abort(404)
    comments = load_comments(note_path)
    comments = [c for c in comments if c["id"] != comment_id]
    save_comments(note_path, comments)
    return jsonify({"ok": True})


# --- Git operations ---

def is_git_repo():
    """Check if NOTES_ROOT is inside a git repo."""
    return (NOTES_ROOT / ".git").exists() or subprocess.run(
        ["git", "rev-parse", "--git-dir"],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    ).returncode == 0


@app.route("/api/git/status")
def api_git_status():
    repo = is_git_repo()
    if not repo:
        return jsonify({"changes": [], "hasChanges": False, "isRepo": False})
    result = subprocess.run(
        ["git", "status", "--porcelain", "."],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    )
    changed = []
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line:
            changed.append(line)
    return jsonify({"changes": changed, "hasChanges": len(changed) > 0, "isRepo": True})


@app.route("/api/git/commit", methods=["POST"])
def api_git_commit():
    if not is_git_repo():
        return jsonify({"ok": False, "error": "Not a git repository"})

    status = subprocess.run(
        ["git", "status", "--porcelain", "."],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    )
    changed_files = []
    for line in status.stdout.strip().split("\n"):
        line = line.strip()
        if line:
            changed_files.append(line[2:].strip())

    if not changed_files:
        return jsonify({"ok": False, "error": "No changes to commit"})

    add_result = subprocess.run(
        ["git", "add", "."],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    )
    if add_result.returncode != 0:
        return jsonify({"ok": False, "error": add_result.stderr})

    msg = "notes updated.\n\n" + "\n".join(f"- {f}" for f in changed_files)

    commit_result = subprocess.run(
        ["git", "commit", "-m", msg],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    )
    if commit_result.returncode != 0:
        return jsonify({"ok": False, "error": commit_result.stderr})

    push_result = subprocess.run(
        ["git", "push"],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    )
    if push_result.returncode != 0:
        return jsonify({"ok": True, "message": msg, "files": changed_files,
                        "pushError": push_result.stderr})

    return jsonify({"ok": True, "message": msg, "files": changed_files})


@app.route("/api/git/pull", methods=["POST"])
def api_git_pull():
    if not is_git_repo():
        return jsonify({"ok": False, "error": "Not a git repository"})

    result = subprocess.run(
        ["git", "pull"],
        cwd=str(NOTES_ROOT),
        capture_output=True, text=True,
    )
    has_conflicts = "CONFLICT" in result.stdout or result.returncode != 0
    return jsonify({
        "ok": not has_conflicts,
        "output": result.stdout,
        "error": result.stderr if has_conflicts else "",
        "hasConflicts": has_conflicts,
    })


if __name__ == "__main__":
    # Load active source from config if available
    cfg = load_sources()
    if cfg.get("active"):
        active = Path(cfg["active"]).resolve()
        if active.is_dir():
            switch_notes_root(active)
            _notes_cache, _tag_levels_cache, _tag_parents_cache = scan_notes()
            print(f"Serving notes from: {NOTES_ROOT}")
            print(f"Found {len(_notes_cache)} notes")
    else:
        print("No active source. Add a source via the UI.")
    app.run(host="127.0.0.1", port=5001, debug=True)
