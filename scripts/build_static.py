#!/usr/bin/env python3
"""Build an encrypted static site into dist/.

Reads SITE_PASSWORD from env. Scans all notes, bundles index + contents
into a single JSON blob, encrypts with AES-256-GCM (PBKDF2 key derivation),
and writes dist/data.enc alongside the static frontend assets.
"""

import json
import os
import re
import shutil
import sys
from pathlib import Path

# AES-GCM via cryptography
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
VIEWER_STATIC = ROOT / "viewer" / "static"
SKIP_DIRS = {
    ".git",
    ".venv",
    "viewer",
    "scripts",
    "__pycache__",
    "node_modules",
    "dist",
}

PBKDF2_ITERATIONS = 600_000


def extract_tags_and_title(filepath: Path):
    rel = filepath.relative_to(ROOT)
    parts = rel.parts

    top_tags = [parts[0]] if len(parts) > 1 else []
    mid_tags = []
    if len(parts) > 2:
        mid_tags = [p.replace("_", " ") for p in parts[1:-1]]

    name = filepath.stem
    name = re.sub(r"^\[.*?\]", "", name)
    title = name.replace("_", " ").strip()

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

    tag_parents = {}
    if top_tags and mid_tags:
        for t in mid_tags:
            tag_parents[t] = top_tags[0]

    return title, all_tags, tag_levels, tag_parents


def scan_notes():
    notes = []
    contents = {}
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

            try:
                text = fp.read_text(encoding="utf-8")
            except Exception:
                text = ""

            stat = fp.stat()
            notes.append(
                {
                    "path": rel,
                    "title": title,
                    "tags": tags,
                    "modified": stat.st_mtime,
                }
            )
            contents[rel] = text

    notes.sort(key=lambda n: n["modified"], reverse=True)
    return notes, global_tag_levels, global_tag_parents, contents


def encrypt(plaintext_bytes: bytes, password: str) -> bytes:
    """Encrypt with AES-256-GCM + PBKDF2. Returns salt(16) + iv(12) + ciphertext."""
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    key = kdf.derive(password.encode("utf-8"))

    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, plaintext_bytes, None)

    return salt + iv + ct


def build():
    password = os.environ.get("SITE_PASSWORD")
    if not password:
        print("ERROR: Set SITE_PASSWORD environment variable.", file=sys.stderr)
        sys.exit(1)

    print("Scanning notes...")
    notes, tag_levels, tag_parents, contents = scan_notes()
    print(f"  Found {len(notes)} notes")

    payload = json.dumps(
        {
            "notes": notes,
            "tagLevels": tag_levels,
            "tagParents": tag_parents,
            "contents": contents,
        },
        ensure_ascii=False,
    )

    print("Encrypting...")
    encrypted = encrypt(payload.encode("utf-8"), password)

    # Prepare dist/
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()

    # Write encrypted blob
    (DIST / "data.enc").write_bytes(encrypted)
    print(f"  data.enc: {len(encrypted)} bytes")

    # Copy static assets (theme.css, style.css)
    for name in ("theme.css", "style.css"):
        shutil.copy2(VIEWER_STATIC / name, DIST / name)

    # Write static index.html and app.js (generated, not copied)
    write_static_html()
    write_static_js()

    print(f"Build complete -> {DIST}/")


def write_static_html():
    html = f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>slob notes</title>
  <link rel="stylesheet" href="theme.css">
  <link rel="stylesheet" href="style.css">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    #lock-screen {{
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: var(--bg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--gap-lg);
    }}
    #lock-screen.hidden {{ display: none; }}
    #lock-screen .lock-title {{
      font-family: var(--font-body);
      font-weight: 700;
      font-size: var(--font-size-xl);
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--accent);
    }}
    #lock-screen input {{
      font-family: var(--font-mono);
      font-size: var(--font-size-base);
      padding: 8px 16px;
      background: var(--bg-alt);
      color: var(--text);
      border: var(--border-w) solid var(--border);
      outline: none;
      text-align: center;
      width: 260px;
    }}
    #lock-screen input:focus {{
      border-color: var(--accent);
    }}
    #lock-error {{
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--accent);
      height: 1.2em;
    }}
    #app.locked {{ display: none; }}
  </style>
</head>
<body>
  <!-- Password gate -->
  <div id="lock-screen">
    <div class="lock-title">slob notes</div>
    <form id="lock-form" onsubmit="return handleUnlock(event)" style="display:flex;flex-direction:column;align-items:center;gap:var(--gap)">
      <input type="password" id="lock-input" placeholder="password" autofocus>
      <button type="submit" class="btn" style="width:260px">Enter</button>
    </form>
    <div id="lock-error"></div>
  </div>

  <div id="app" class="locked">
    <div id="toolbar">
      <button class="btn" id="btn-sidebar" onclick="toggleSidebar()">List</button>
      <span class="logo">slob notes</span>
      <button class="btn" id="btn-palette" onclick="cyclePalette()">Default</button>
    </div>
    <div id="panels">
      <div id="left-panel">
        <div id="filter-mode">
          <button class="mode-btn active" data-mode="only" onclick="setFilterMode('only')">Only</button>
          <button class="mode-btn" data-mode="or" onclick="setFilterMode('or')">Or</button>
          <button class="mode-btn" data-mode="and" onclick="setFilterMode('and')">And</button>
        </div>
        <div id="tag-bar"></div>
        <div id="note-list"></div>
      </div>
      <div id="resize-handle"></div>
      <div id="right-panel">
        <div id="right-toolbar">
          <span class="note-path" id="current-path">Select a note</span>
        </div>
        <div id="right-content">
          <div id="empty-state">Select a note to view</div>
          <div id="render-pane">
            <div id="rendered"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>"""
    (DIST / "index.html").write_text(html, encoding="utf-8")


def write_static_js():
    js = r"""/* ── slob notes static (read-only, encrypted) ── */

/* ── State ── */
let allNotes = [];
let tagLevels = {};
let tagParents = {};
let noteContents = {};
let activeTags = new Set();
let filterMode = "only";
let selectedNote = null;
let renderVisible = false;

/* ── Palettes ── */
const PALETTES = {
  "Default": {
    "--bg":"#1D2B53","--bg-alt":"#121B35","--surface":"#2A3A6A",
    "--surface-hover":"#3A4A7A","--border":"#4A5A8A","--text":"#FFF1E8",
    "--text-muted":"#83769C","--text-dim":"#5F5678","--accent":"#FF004D",
    "--accent-hover":"#FF3377","--tag-top":"#FFF1E8","--tag-mid":"#FFA300",
    "--tag-low":"#29ADFF","--tag-text":"#000000","--tag-active":"#FF004D",
    "--success":"#00E436","--warn":"#FFA300",
  },
  "Mononoke": {
    "--bg":"#1A2418","--bg-alt":"#111A0F","--surface":"#2B3626",
    "--surface-hover":"#3B4A33","--border":"#4A5E3E","--text":"#E8E4D9",
    "--text-muted":"#8A9A78","--text-dim":"#5A6B4E","--accent":"#C23B22",
    "--accent-hover":"#D95040","--tag-top":"#E8E4D9","--tag-mid":"#D4A843",
    "--tag-low":"#6BAF7A","--tag-text":"#111A0F","--tag-active":"#C23B22",
    "--success":"#6BAF7A","--warn":"#D4A843",
  },
  "County Highway": {
    "--bg":"#2C2C2E","--bg-alt":"#1C1C1E","--surface":"#3A3A3C",
    "--surface-hover":"#48484A","--border":"#5A5A5E","--text":"#F2F2F0",
    "--text-muted":"#8E8E93","--text-dim":"#636366","--accent":"#FFB814",
    "--accent-hover":"#FFCB45","--tag-top":"#F2F2F0","--tag-mid":"#FFB814",
    "--tag-low":"#2D9B4E","--tag-text":"#1C1C1E","--tag-active":"#FFB814",
    "--success":"#2D9B4E","--warn":"#FFB814",
  },
  "Deepsea Jellyfish": {
    "--bg":"#0A0E1A","--bg-alt":"#060912","--surface":"#121833",
    "--surface-hover":"#1C2448","--border":"#2A3366","--text":"#C8F0F8",
    "--text-muted":"#5A7A99","--text-dim":"#2E4A66","--accent":"#E040A0",
    "--accent-hover":"#F060C0","--tag-top":"#C8F0F8","--tag-mid":"#A060E0",
    "--tag-low":"#20D0D0","--tag-text":"#060912","--tag-active":"#E040A0",
    "--success":"#20D0D0","--warn":"#E0A020",
  },
  "Daylight": {
    "--bg":"#F4F1EC","--bg-alt":"#E8E4DD","--surface":"#DBD7CF",
    "--surface-hover":"#CECAC1","--border":"#B8B4AB","--text":"#2C2C2C",
    "--text-muted":"#6E6E6E","--text-dim":"#9E9E9E","--accent":"#1A1A1A",
    "--accent-hover":"#3A3A3A","--tag-top":"#2C2C2C","--tag-mid":"#5A5A5A",
    "--tag-low":"#7A7A7A","--tag-text":"#F4F1EC","--tag-active":"#1A1A1A",
    "--success":"#3A7A3A","--warn":"#8A6A20",
  },
};

const PALETTE_NAMES = Object.keys(PALETTES);
let currentPaletteIndex = 0;

function applyPalette(name) {
  const vars = PALETTES[name];
  if (!vars) return;
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(vars)) {
    root.style.setProperty(prop, val);
  }
  const btn = document.getElementById("btn-palette");
  if (btn) btn.textContent = name;
  localStorage.setItem("notesViewerPalette", name);
}

function cyclePalette() {
  currentPaletteIndex = (currentPaletteIndex + 1) % PALETTE_NAMES.length;
  applyPalette(PALETTE_NAMES[currentPaletteIndex]);
}

function loadSavedPalette() {
  const saved = localStorage.getItem("notesViewerPalette");
  if (saved && PALETTES[saved]) {
    currentPaletteIndex = PALETTE_NAMES.indexOf(saved);
    applyPalette(saved);
  }
}

/* ── Crypto ── */
const PBKDF2_ITERATIONS = 600000;

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptBlob(encBytes, password) {
  const salt = encBytes.slice(0, 16);
  const iv = encBytes.slice(16, 28);
  const ct = encBytes.slice(28);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

/* ── Unlock ── */
let encryptedData = null;

async function handleUnlock(e) {
  e.preventDefault();
  const pw = document.getElementById("lock-input").value;
  const errEl = document.getElementById("lock-error");
  errEl.textContent = "";

  if (!encryptedData) {
    try {
      const res = await fetch("data.enc");
      encryptedData = await res.arrayBuffer();
    } catch {
      errEl.textContent = "Failed to load data";
      return false;
    }
  }

  try {
    const json = await decryptBlob(new Uint8Array(encryptedData), pw);
    const data = JSON.parse(json);
    allNotes = data.notes;
    tagLevels = data.tagLevels;
    tagParents = data.tagParents || {};
    noteContents = data.contents;

    // Unlock UI
    document.getElementById("lock-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("locked");
    buildTagBar();
    renderNoteList();
    initResize();
    initKeyboard();
  } catch {
    errEl.textContent = "Wrong password";
    document.getElementById("lock-input").value = "";
    document.getElementById("lock-input").focus();
  }
  return false;
}

/* ── Init ── */
document.addEventListener("DOMContentLoaded", () => {
  loadSavedPalette();
  document.getElementById("lock-input").focus();
});

/* ── Mobile Sidebar ── */
function toggleSidebar() {
  document.getElementById("left-panel").classList.toggle("mobile-open");
}

function closeSidebarOnSelect() {
  if (window.innerWidth <= 768) {
    document.getElementById("left-panel").classList.remove("mobile-open");
  }
}

/* ── Load Note (from memory) ── */
function loadNote(path) {
  const content = noteContents[path] || "";
  selectedNote = { path, content };

  document.getElementById("current-path").textContent = path;
  document.getElementById("empty-state").style.display = "none";

  renderMarkdown(content);

  if (!renderVisible) {
    toggleRender();
  }

  document.querySelectorAll(".note-item").forEach(el => {
    el.classList.toggle("selected", el.dataset.path === path);
  });

  closeSidebarOnSelect();
}

/* ── Filter Mode ── */
function setFilterMode(mode) {
  filterMode = mode;
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  renderNoteList();
}

/* ── Tag Bar ── */
function buildTagBar() {
  const tagSet = new Set();
  allNotes.forEach(n => n.tags.forEach(t => tagSet.add(t)));

  const levelOrder = { top: 0, mid: 1, low: 2 };
  const tags = Array.from(tagSet).sort((a, b) => {
    const la = levelOrder[tagLevels[a] || "low"];
    const lb = levelOrder[tagLevels[b] || "low"];
    if (la !== lb) return la - lb;
    return a.localeCompare(b);
  });

  const bar = document.getElementById("tag-bar");
  bar.innerHTML = "";
  tags.forEach(tag => {
    const level = tagLevels[tag] || "low";
    if (level === "mid") {
      const parent = tagParents[tag];
      if (!activeTags.has(tag) && (!parent || !activeTags.has(parent))) return;
    }
    const pill = document.createElement("button");
    pill.className = "tag-pill level-" + level + (activeTags.has(tag) ? " active" : "");
    pill.textContent = tag;
    pill.onclick = () => toggleTag(tag);
    bar.appendChild(pill);
  });
}

function toggleTag(tag) {
  if (filterMode === "only") {
    if (activeTags.has(tag) && activeTags.size === 1) {
      activeTags.clear();
    } else {
      activeTags.clear();
      activeTags.add(tag);
    }
  } else {
    if (activeTags.has(tag)) {
      activeTags.delete(tag);
    } else {
      activeTags.add(tag);
    }
  }
  buildTagBar();
  renderNoteList();
}

/* ── Note List ── */
function getFilteredNotes() {
  if (activeTags.size === 0) return allNotes;
  const tags = Array.from(activeTags);
  if (filterMode === "and") {
    return allNotes.filter(n => tags.every(t => n.tags.includes(t)));
  } else {
    return allNotes.filter(n => tags.some(t => n.tags.includes(t)));
  }
}

function renderNoteList() {
  const list = document.getElementById("note-list");
  const notes = getFilteredNotes();
  list.innerHTML = "";

  notes.forEach(n => {
    const item = document.createElement("div");
    item.className = "note-item" + (selectedNote && selectedNote.path === n.path ? " selected" : "");
    item.dataset.path = n.path;
    item.onclick = () => loadNote(n.path);

    const title = document.createElement("div");
    title.className = "note-title";
    title.textContent = n.title;

    const meta = document.createElement("div");
    meta.className = "note-meta";
    n.tags.forEach(t => {
      const span = document.createElement("span");
      const level = tagLevels[t] || "low";
      span.className = "tag level-" + level;
      span.textContent = t;
      meta.appendChild(span);
    });

    item.appendChild(title);
    item.appendChild(meta);
    list.appendChild(item);
  });
}

/* ── Right Panel (render only) ── */
function toggleRender() {
  renderVisible = !renderVisible;
  document.getElementById("render-pane").classList.toggle("visible", renderVisible);
}

/* ── Markdown Rendering ── */
function renderMarkdown(md) {
  marked.setOptions({ breaks: true, gfm: true });

  const renderer = new marked.Renderer();

  renderer.link = function ({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : "";
    const isExternal = href && (href.startsWith("http://") || href.startsWith("https://"));
    const target = isExternal ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
  };

  renderer.image = function ({ href, title, text }) {
    let src = href;
    if (href && !href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/")) {
      if (selectedNote) {
        const dir = selectedNote.path.split("/").slice(0, -1).join("/");
        src = `files/${dir ? dir + "/" : ""}${href}`;
      } else {
        src = `files/${href}`;
      }
    }
    const titleAttr = title ? ` title="${title}"` : "";
    const alt = text || "";
    return `<img src="${src}" alt="${alt}"${titleAttr}>`;
  };

  let processed = md.replace(/^\[\s*\]/gm, "- [ ]");
  processed = processed.replace(/^\[x\]/gm, "- [x]");
  processed = processed.replace(/^(\s+)\[\s*\]/gm, "$1- [ ]");
  processed = processed.replace(/^(\s+)\[x\]/gm, "$1- [x]");

  processed = processed.replace(
    /(?<!\()(https?:\/\/[^\s\)>\]]+)/g,
    (match, url, offset, str) => {
      const before = str.substring(Math.max(0, offset - 2), offset);
      if (before.endsWith("](") || before.endsWith("](")) return match;
      return `[${url}](${url})`;
    }
  );

  const html = marked.parse(processed, { renderer });
  document.getElementById("rendered").innerHTML = html;
}

/* ── Resize Handle ── */
function initResize() {
  const handle = document.getElementById("resize-handle");
  const left = document.getElementById("left-panel");
  let dragging = false;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    handle.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const x = e.clientX;
    const min = 200;
    const max = window.innerWidth * 0.6;
    left.style.width = Math.max(min, Math.min(max, x)) + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
    handle.classList.remove("dragging");
  });
}

/* ── Keyboard Shortcuts ── */
function initKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.activeElement.tagName === "INPUT") {
        document.activeElement.blur();
      }
    }
  });
}
"""
    (DIST / "app.js").write_text(js, encoding="utf-8")


if __name__ == "__main__":
    build()
