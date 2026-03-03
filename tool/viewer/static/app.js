/* ── State ── */
let allNotes = [];
let tagLevels = {};       // { tagName: "top"|"mid"|"low" }
let tagParents = {};      // { midTag: "parentTopTag" }
let activeTags = new Set();
let filterMode = "only";  // "only" | "or" | "and"
let selectedNote = null;
let editVisible = false;
let renderVisible = false;
let dirty = false;
let gitDirty = false;

/* ── Palettes ── */
const PALETTES = {
  "Default": {
    "--bg":            "#1D2B53",
    "--bg-alt":        "#121B35",
    "--surface":       "#2A3A6A",
    "--surface-hover": "#3A4A7A",
    "--border":        "#4A5A8A",
    "--text":          "#FFF1E8",
    "--text-muted":    "#83769C",
    "--text-dim":      "#5F5678",
    "--accent":        "#FF004D",
    "--accent-hover":  "#FF3377",
    "--tag-top":       "#FFF1E8",
    "--tag-mid":       "#FFA300",
    "--tag-low":       "#29ADFF",
    "--tag-text":      "#000000",
    "--tag-active":    "#FF004D",
    "--success":       "#00E436",
    "--warn":          "#FFA300",
  },
  "Mononoke": {
    "--bg":            "#1A2418",
    "--bg-alt":        "#111A0F",
    "--surface":       "#2B3626",
    "--surface-hover": "#3B4A33",
    "--border":        "#4A5E3E",
    "--text":          "#E8E4D9",
    "--text-muted":    "#8A9A78",
    "--text-dim":      "#5A6B4E",
    "--accent":        "#C23B22",
    "--accent-hover":  "#D95040",
    "--tag-top":       "#E8E4D9",
    "--tag-mid":       "#D4A843",
    "--tag-low":       "#6BAF7A",
    "--tag-text":      "#111A0F",
    "--tag-active":    "#C23B22",
    "--success":       "#6BAF7A",
    "--warn":          "#D4A843",
  },
  "County Highway": {
    "--bg":            "#2C2C2E",
    "--bg-alt":        "#1C1C1E",
    "--surface":       "#3A3A3C",
    "--surface-hover": "#48484A",
    "--border":        "#5A5A5E",
    "--text":          "#F2F2F0",
    "--text-muted":    "#8E8E93",
    "--text-dim":      "#636366",
    "--accent":        "#FFB814",
    "--accent-hover":  "#FFCB45",
    "--tag-top":       "#F2F2F0",
    "--tag-mid":       "#FFB814",
    "--tag-low":       "#2D9B4E",
    "--tag-text":      "#1C1C1E",
    "--tag-active":    "#FFB814",
    "--success":       "#2D9B4E",
    "--warn":          "#FFB814",
  },
  "Deepsea Jellyfish": {
    "--bg":            "#0A0E1A",
    "--bg-alt":        "#060912",
    "--surface":       "#121833",
    "--surface-hover": "#1C2448",
    "--border":        "#2A3366",
    "--text":          "#C8F0F8",
    "--text-muted":    "#5A7A99",
    "--text-dim":      "#2E4A66",
    "--accent":        "#E040A0",
    "--accent-hover":  "#F060C0",
    "--tag-top":       "#C8F0F8",
    "--tag-mid":       "#A060E0",
    "--tag-low":       "#20D0D0",
    "--tag-text":      "#060912",
    "--tag-active":    "#E040A0",
    "--success":       "#20D0D0",
    "--warn":          "#E0A020",
  },
  "Daylight": {
    "--bg":            "#F4F1EC",
    "--bg-alt":        "#E8E4DD",
    "--surface":       "#DBD7CF",
    "--surface-hover": "#CECAC1",
    "--border":        "#B8B4AB",
    "--text":          "#2C2C2C",
    "--text-muted":    "#6E6E6E",
    "--text-dim":      "#9E9E9E",
    "--accent":        "#1A1A1A",
    "--accent-hover":  "#3A3A3A",
    "--tag-top":       "#2C2C2C",
    "--tag-mid":       "#5A5A5A",
    "--tag-low":       "#7A7A7A",
    "--tag-text":      "#F4F1EC",
    "--tag-active":    "#1A1A1A",
    "--success":       "#3A7A3A",
    "--warn":          "#8A6A20",
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

/* ── Mobile Sidebar ── */
function toggleSidebar() {
  document.getElementById("left-panel").classList.toggle("mobile-open");
}

function closeSidebarOnSelect() {
  if (window.innerWidth <= 768) {
    document.getElementById("left-panel").classList.remove("mobile-open");
  }
}

/* ── Init ── */
document.addEventListener("DOMContentLoaded", () => {
  loadSavedPalette();
  fetchNotes();
  initResize();
  initKeyboard();
  checkGitStatus();
});

/* ── API ── */
async function fetchNotes() {
  const res = await fetch("/api/notes");
  const data = await res.json();
  allNotes = data.notes;
  tagLevels = data.tagLevels;
  tagParents = data.tagParents || {};
  buildTagBar();
  renderNoteList();
}

async function rebuild() {
  const btn = document.getElementById("btn-rebuild");
  btn.textContent = "...";
  const res = await fetch("/api/rebuild", { method: "POST" });
  const data = await res.json();
  allNotes = data.notes;
  tagLevels = data.tagLevels;
  tagParents = data.tagParents || {};
  buildTagBar();
  renderNoteList();
  btn.textContent = "Rebuild";
}

async function loadNote(path) {
  const res = await fetch(`/api/note/${encodeURIComponent(path)}`);
  const data = await res.json();
  selectedNote = data;
  dirty = false;

  document.getElementById("current-path").textContent = path;
  document.getElementById("empty-state").style.display = "none";

  // Update editor
  document.getElementById("editor").value = data.content;

  // Update rendered view
  renderMarkdown(data.content);

  // Show render by default if nothing is visible
  if (!editVisible && !renderVisible) {
    toggleRender();
  }

  // Update list selection
  document.querySelectorAll(".note-item").forEach(el => {
    el.classList.toggle("selected", el.dataset.path === path);
  });

  closeSidebarOnSelect();
}

async function saveNote() {
  if (!selectedNote) return;
  const content = document.getElementById("editor").value;
  const status = document.getElementById("save-status");
  status.textContent = "Saving...";
  status.style.color = "var(--warn)";

  try {
    const res = await fetch(`/api/note/${encodeURIComponent(selectedNote.path)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (data.ok) {
      status.textContent = "Saved";
      status.style.color = "var(--success)";
      dirty = false;
      selectedNote.content = content;
      renderMarkdown(content);
      setTimeout(() => { status.textContent = ""; }, 2000);
      checkGitStatus();
    } else {
      status.textContent = "Error: " + (data.error || "unknown");
      status.style.color = "var(--accent)";
    }
  } catch (e) {
    status.textContent = "Error: " + e.message;
    status.style.color = "var(--accent)";
  }
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

  // Sort: top first, then mid, then low; alphabetical within each tier
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

    // Mid tags: only show if parent is active OR this mid tag itself is active
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
    // ONLY mode: clicking a tag unselects all others
    if (activeTags.has(tag) && activeTags.size === 1) {
      // Clicking the sole active tag deselects it
      activeTags.clear();
    } else {
      // Select only this tag (mid tags stay visible because they're active)
      activeTags.clear();
      activeTags.add(tag);
    }
  } else {
    // OR / AND mode: toggle individually
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
    // AND: note must have ALL active tags
    return allNotes.filter(n => tags.every(t => n.tags.includes(t)));
  } else {
    // OR and ONLY: note must have ANY active tag
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

/* ── Right Panel ── */
function toggleEdit() {
  editVisible = !editVisible;
  document.getElementById("btn-edit").classList.toggle("active", editVisible);
  document.getElementById("editor-pane").classList.toggle("visible", editVisible);
  updateRightContentClass();
  hideEmptyState();
}

function toggleRender() {
  renderVisible = !renderVisible;
  document.getElementById("btn-render").classList.toggle("active", renderVisible);
  document.getElementById("render-pane").classList.toggle("visible", renderVisible);
  updateRightContentClass();
  hideEmptyState();
}

function updateRightContentClass() {
  const rc = document.getElementById("right-content");
  rc.classList.toggle("split", editVisible && renderVisible);
}

function hideEmptyState() {
  if (editVisible || renderVisible) {
    document.getElementById("empty-state").style.display = "none";
  }
}

/* ── Markdown Rendering ── */
function renderMarkdown(md) {
  // Configure marked
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Custom renderer for links and images
  const renderer = new marked.Renderer();

  renderer.link = function ({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : "";
    // Make external links open in new tab
    const isExternal = href && (href.startsWith("http://") || href.startsWith("https://"));
    const target = isExternal ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
  };

  renderer.image = function ({ href, title, text }) {
    // Rewrite relative image paths to go through /files/
    let src = href;
    if (href && !href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/")) {
      // Relative to note's directory
      if (selectedNote) {
        const dir = selectedNote.path.split("/").slice(0, -1).join("/");
        src = `/files/${dir ? dir + "/" : ""}${href}`;
      } else {
        src = `/files/${href}`;
      }
    }
    const titleAttr = title ? ` title="${title}"` : "";
    const alt = text || "";
    return `<img src="${src}" alt="${alt}"${titleAttr}>`;
  };

  // Handle checkbox syntax: [] and [x]
  let processed = md.replace(/^\[\s*\]/gm, "- [ ]");
  processed = processed.replace(/^\[x\]/gm, "- [x]");
  // Handle indented checkboxes
  processed = processed.replace(/^(\s+)\[\s*\]/gm, "$1- [ ]");
  processed = processed.replace(/^(\s+)\[x\]/gm, "$1- [x]");

  // Auto-link bare URLs that aren't already in markdown link syntax
  processed = processed.replace(
    /(?<!\()(https?:\/\/[^\s\)>\]]+)/g,
    (match, url, offset, str) => {
      // Don't linkify if inside a markdown link already
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
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (editVisible && selectedNote) saveNote();
    }
    // Escape to deselect
    if (e.key === "Escape") {
      if (document.activeElement === document.getElementById("editor")) {
        document.getElementById("editor").blur();
      }
    }
  });

  // Track dirty state
  document.getElementById("editor").addEventListener("input", () => {
    dirty = true;
    document.getElementById("save-status").textContent = "Unsaved changes";
    document.getElementById("save-status").style.color = "var(--warn)";
  });
}

/* ── Git Operations ── */
async function checkGitStatus() {
  try {
    const res = await fetch("/api/git/status");
    const data = await res.json();
    gitDirty = data.hasChanges;
    document.getElementById("btn-push").disabled = !gitDirty;
  } catch {
    // Silently fail — git status is non-critical
  }
}

async function gitCommit() {
  const btn = document.getElementById("btn-push");
  btn.disabled = true;
  try {
    const res = await fetch("/api/git/commit", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      btn.classList.add("success");
      setTimeout(() => { btn.classList.remove("success"); }, 2000);
    } else {
      alert("Commit failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Commit failed: " + e.message);
  }
  checkGitStatus();
}

async function gitPull() {
  const btn = document.getElementById("btn-pull");
  btn.disabled = true;
  try {
    const res = await fetch("/api/git/pull", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      btn.classList.add("success");
      setTimeout(() => { btn.classList.remove("success"); }, 2000);
      // Refresh notes after pull
      await rebuild();
    } else if (data.hasConflicts) {
      document.getElementById("conflict-details").textContent =
        (data.output || "") + "\n" + (data.error || "");
      document.getElementById("conflict-modal").style.display = "flex";
    } else {
      alert("Pull failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Pull failed: " + e.message);
  }
  btn.disabled = false;
  checkGitStatus();
}

function closeConflictModal() {
  document.getElementById("conflict-modal").style.display = "none";
}
