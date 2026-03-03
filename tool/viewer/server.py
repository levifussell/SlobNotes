#!/usr/bin/env python3
"""Note visualizer server."""

import os
import json
import re
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, abort

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", ".venv", "viewer", "scripts", "__pycache__", "node_modules"}

app = Flask(__name__, static_folder="static", static_url_path="/static")


def extract_tags_and_title(filepath: Path):
    """Extract frontmatter tags and derive title from a markdown file.

    Returns (title, tags_list, tag_levels_dict) where tag_levels_dict maps
    each tag to its level: "top", "mid", or "low".
    """
    rel = filepath.relative_to(ROOT)
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
    """Walk ROOT and collect all .md files with metadata.

    Returns (notes_list, tag_levels_dict, tag_parents_dict).
    """
    notes = []
    global_tag_levels = {}
    global_tag_parents = {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fname in sorted(filenames):
            if not fname.endswith(".md"):
                continue
            fp = Path(dirpath) / fname
            rel = str(fp.relative_to(ROOT))
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
    fp = ROOT / note_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(ROOT)):
        abort(404)
    try:
        content = fp.read_text(encoding="utf-8")
    except Exception:
        abort(500)
    return jsonify({"path": note_path, "content": content})


@app.route("/api/note/<path:note_path>", methods=["PUT"])
def api_save_note(note_path):
    fp = ROOT / note_path
    if not str(fp.resolve()).startswith(str(ROOT)):
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
    """Serve files from the org root (for images etc.)."""
    fp = ROOT / file_path
    if not fp.is_file() or not str(fp.resolve()).startswith(str(ROOT)):
        abort(404)
    return send_from_directory(fp.parent, fp.name)


if __name__ == "__main__":
    _notes_cache, _tag_levels_cache, _tag_parents_cache = scan_notes()
    print(f"Serving notes from: {ROOT}")
    print(f"Found {len(_notes_cache)} notes")
    app.run(host="127.0.0.1", port=5000, debug=True)
