#!/usr/bin/env python3
"""Note visualizer server."""

import os
import json
import re
import subprocess
from datetime import date
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, abort

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
NOTES_ROOT = REPO_ROOT / "notes"
SKIP_DIRS = {".git", ".venv", "__pycache__", "node_modules"}

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
            notes.append({
                "path": rel,
                "title": title,
                "tags": tags,
                "modified": stat.st_mtime,
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
        old_fp.rename(new_fp)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

    new_path = str(new_fp.relative_to(NOTES_ROOT))
    return jsonify({"ok": True, "newPath": new_path})


# --- Git operations ---

@app.route("/api/git/status")
def api_git_status():
    result = subprocess.run(
        ["git", "status", "--porcelain", "notes/"],
        cwd=str(REPO_ROOT),
        capture_output=True, text=True,
    )
    changed = []
    for line in result.stdout.strip().split("\n"):
        line = line.strip()
        if line:
            changed.append(line)
    return jsonify({"changes": changed, "hasChanges": len(changed) > 0})


@app.route("/api/git/commit", methods=["POST"])
def api_git_commit():
    # Check what changed
    status = subprocess.run(
        ["git", "status", "--porcelain", "notes/"],
        cwd=str(REPO_ROOT),
        capture_output=True, text=True,
    )
    changed_files = []
    for line in status.stdout.strip().split("\n"):
        line = line.strip()
        if line:
            # Extract filename (after status codes)
            changed_files.append(line[2:].strip())

    if not changed_files:
        return jsonify({"ok": False, "error": "No changes to commit"})

    # Stage notes/
    add_result = subprocess.run(
        ["git", "add", "notes/"],
        cwd=str(REPO_ROOT),
        capture_output=True, text=True,
    )
    if add_result.returncode != 0:
        return jsonify({"ok": False, "error": add_result.stderr})

    # Build commit message
    msg = "notes updated.\n\n" + "\n".join(f"- {f}" for f in changed_files)

    commit_result = subprocess.run(
        ["git", "commit", "-m", msg],
        cwd=str(REPO_ROOT),
        capture_output=True, text=True,
    )
    if commit_result.returncode != 0:
        return jsonify({"ok": False, "error": commit_result.stderr})

    return jsonify({"ok": True, "message": msg, "files": changed_files})


@app.route("/api/git/pull", methods=["POST"])
def api_git_pull():
    result = subprocess.run(
        ["git", "pull"],
        cwd=str(REPO_ROOT),
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
    _notes_cache, _tag_levels_cache, _tag_parents_cache = scan_notes()
    print(f"Serving notes from: {NOTES_ROOT}")
    print(f"Found {len(_notes_cache)} notes")
    app.run(host="127.0.0.1", port=5000, debug=True)
