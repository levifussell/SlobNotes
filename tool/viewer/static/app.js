/* ── Slunk Characters ── */
const SLUNK_CHARS = [
  [".#....#.",".#....#.",".######.","##.##.##",".######.",".######.","..#..#..",".##..##."],
  ["..####..",".######.",".#.##.#.",".######.","..####..","..####..","..#..#..",".##..##."],
  ["...##...",".######.","##.##.##","########","..####..",".######.",".#....#.",".#....#."],
  ["..####..",".######.","##.##.##","########","########","########","########","#.#..#.#"],
  ["..####..",".######.","###.####","####.###","########",".######.","..####.."],
  ["..##..",".####.","#.##.#","#.##.#",".####.","..##..","..##..","..##..","..##..",".#..#."],
  [".##....##.","#..#..#..#",".##....##.","..######..","..######..","..######..","...#..#...","..##..##.."],
  ["..#....#..","..#....#..",".########.","##.####.##","##########",".########."],
];

function slunkGridToSVG(grid) {
  const rows = grid.length;
  const cols = Math.max(...grid.map(r => r.length));
  let rects = "";
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < grid[y].length; x++)
      if (grid[y][x] === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  return `<svg viewBox="0 0 ${cols} ${rows}" fill="currentColor" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

const slunkSVGs = SLUNK_CHARS.map(slunkGridToSVG);
let slunkIdx = Math.floor(Math.random() * slunkSVGs.length);

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
let isGitRepo = true;
let sources = [];
let activeSource = "";
let searchQuery = "";
let searchResults = null;  // null = no search active, Set = matched paths

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
    "--accent-text":   "#000000",
    "--success-text":  "#000000",
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
    "--accent-text":   "#FFFFFF",
    "--success-text":  "#000000",
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
    "--accent-text":   "#000000",
    "--success-text":  "#FFFFFF",
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
    "--accent-text":   "#000000",
    "--success-text":  "#000000",
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
    "--accent-text":   "#FFFFFF",
    "--success-text":  "#FFFFFF",
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

/* ── Slunky ── */
function toggleSlunky() {
  document.body.classList.toggle("slunky");
  const on = document.body.classList.contains("slunky");
  localStorage.setItem("slunky", on ? "1" : "");
}

function initSlunkIcon() {
  const el = document.getElementById("slunk-icon");
  el.innerHTML = slunkSVGs[slunkIdx];
}

function cycleSlunkIcon() {
  slunkIdx = (slunkIdx + 1) % slunkSVGs.length;
  const el = document.getElementById("slunk-icon");
  el.innerHTML = slunkSVGs[slunkIdx];
}

function loadSlunky() {
  if (localStorage.getItem("slunky") === "1") {
    document.body.classList.add("slunky");
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
document.addEventListener("DOMContentLoaded", async () => {
  loadSavedPalette();
  loadSlunky();
  initSlunkIcon();
  await fetchSources();
  if (sources.length === 0) {
    showNoSourceState();
  } else {
    fetchNotes();
    checkGitStatus();
  }
  initResize();
  initKeyboard();
  initTitleEditing();
  // Search filtering (debounced, hits backend for full-text + comment search)
  let searchTimer = null;
  document.getElementById("search-input").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    clearTimeout(searchTimer);
    if (!searchQuery.trim()) {
      searchResults = null;
      renderNoteList();
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        searchResults = new Set(data.paths);
      } catch {
        searchResults = null;
      }
      renderNoteList();
    }, 200);
  });
  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    const dd = document.getElementById("source-dropdown");
    if (dd && !dd.contains(e.target)) {
      document.getElementById("source-menu").classList.remove("open");
    }
  });
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

  // Update title input with derived title
  const titleInput = document.getElementById("note-title");
  titleInput.value = pathToTitle(path);
  titleInput.dataset.originalTitle = titleInput.value;

  // Update editor
  document.getElementById("editor").value = data.content;

  // Update rendered view
  renderMarkdown(data.content);

  // Load comments and cross-references
  fetchComments(path);
  fetchCrossrefs(path);

  // Show render by default if nothing is visible
  if (!editVisible && !renderVisible) {
    toggleRender();
  }

  updateTitleEditing();

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
      await rebuild();
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
  // Include tags from tagLevels (e.g. empty dirs) so they're always visible
  Object.keys(tagLevels).forEach(t => tagSet.add(t));

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

  const dirGroup = document.createElement("div");
  dirGroup.className = "tag-group tag-group-dir";
  const lowGroup = document.createElement("div");
  lowGroup.className = "tag-group tag-group-low";

  // Desktop-only "+" button to create a new category
  if (window.innerWidth > 768) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn-add";
    addBtn.textContent = "+";
    addBtn.title = "New category";
    addBtn.onclick = () => createDir();
    dirGroup.appendChild(addBtn);
  }

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
    (level === "low" ? lowGroup : dirGroup).appendChild(pill);
  });

  bar.appendChild(dirGroup);
  if (lowGroup.children.length > 0) bar.appendChild(lowGroup);
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
  let notes = allNotes;

  if (activeTags.size > 0) {
    const tags = Array.from(activeTags);
    if (filterMode === "and") {
      notes = notes.filter(n => tags.every(t => n.tags.includes(t)));
    } else {
      notes = notes.filter(n => tags.some(t => n.tags.includes(t)));
    }
  }

  if (searchResults !== null) {
    notes = notes.filter(n => searchResults.has(n.path));
  }

  return notes;
}

function canAddNote() {
  if (window.innerWidth <= 768) return false;
  if (filterMode !== "only") return false;
  if (activeTags.size !== 1) return false;
  const tag = Array.from(activeTags)[0];
  const level = tagLevels[tag] || "low";
  return level === "top" || level === "mid";
}

function renderNoteList() {
  const list = document.getElementById("note-list");
  const notes = getFilteredNotes();
  list.innerHTML = "";

  // Desktop-only "+" button to create a new note
  if (canAddNote()) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn-add-note";
    addBtn.textContent = "+";
    addBtn.title = "New note";
    addBtn.onclick = () => createNote();
    list.appendChild(addBtn);
  }

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
    if (n.commentCount > 0) {
      const badge = document.createElement("span");
      badge.className = "comment-badge";
      badge.textContent = n.commentCount;
      item.appendChild(badge);
    }
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
  updateTitleEditing();
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

  let html = marked.parse(processed, { renderer });

  // Replace [[note title]] with clickable cross-reference links
  html = html.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
    const found = allNotes.find(n => n.title.toLowerCase() === title.trim().toLowerCase());
    if (found) {
      return `<a href="#" class="crossref" data-path="${found.path}">${title}</a>`;
    }
    return `<span class="crossref broken">${title}</span>`;
  });

  document.getElementById("rendered").innerHTML = html;

  // Attach click handlers to cross-reference links
  document.querySelectorAll(".crossref[data-path]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      loadNote(el.dataset.path);
    });
  });
}

/* ── Comments ── */
async function fetchComments(notePath) {
  const section = document.getElementById("comments-section");
  try {
    const res = await fetch(`/api/comments/${encodeURIComponent(notePath)}`);
    const data = await res.json();
    renderComments(data.comments || []);
    section.style.display = "block";
  } catch {
    section.style.display = "none";
  }
}

function renderComments(comments) {
  const list = document.getElementById("comments-list");
  const count = document.getElementById("comments-count");
  list.innerHTML = "";
  const active = comments.filter(c => !c.resolved).length;
  count.textContent = comments.length ? `(${active} active, ${comments.length} total)` : "";

  comments.forEach(c => {
    const item = document.createElement("div");
    item.className = "comment-item" + (c.resolved ? " resolved" : "");
    item.dataset.id = c.id;

    const text = document.createElement("div");
    text.className = "comment-text";
    text.textContent = c.text;

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const time = document.createElement("span");
    time.textContent = timeAgo(c.created);

    const resolveBtn = document.createElement("button");
    resolveBtn.textContent = c.resolved ? "unresolve" : "resolve";
    resolveBtn.onclick = () => toggleResolve(c.id, c.resolved);

    const editBtn = document.createElement("button");
    editBtn.textContent = "edit";
    editBtn.onclick = () => editComment(c.id, c.text);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "delete";
    deleteBtn.onclick = () => deleteComment(c.id);

    meta.appendChild(time);
    meta.appendChild(resolveBtn);
    meta.appendChild(editBtn);
    meta.appendChild(deleteBtn);
    item.appendChild(text);
    item.appendChild(meta);
    list.appendChild(item);
  });
}

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

async function addComment() {
  if (!selectedNote) return;
  const input = document.getElementById("comment-input");
  const text = input.value.trim();
  if (!text) return;
  const res = await fetch(`/api/comments/${encodeURIComponent(selectedNote.path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!data.ok) {
    alert("Failed to add comment: " + (data.error || "unknown error"));
    return;
  }
  input.value = "";
  fetchComments(selectedNote.path);
  rebuild();
}

async function toggleResolve(commentId, currentResolved) {
  if (!selectedNote) return;
  await fetch(`/api/comments/${encodeURIComponent(selectedNote.path)}/${commentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolved: !currentResolved }),
  });
  fetchComments(selectedNote.path);
  rebuild();
}

async function deleteComment(commentId) {
  if (!selectedNote || !confirm("Delete this comment?")) return;
  await fetch(`/api/comments/${encodeURIComponent(selectedNote.path)}/${commentId}`, {
    method: "DELETE",
  });
  fetchComments(selectedNote.path);
  rebuild();
}

function editComment(commentId, currentText) {
  const item = document.querySelector(`.comment-item[data-id="${commentId}"]`);
  if (!item) return;
  item.classList.add("editing");

  const textEl = item.querySelector(".comment-text");
  const metaEl = item.querySelector(".comment-meta");
  textEl.style.display = "none";
  metaEl.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.value = currentText;
  textarea.rows = 3;

  const actions = document.createElement("div");
  actions.className = "comment-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = "Save";
  saveBtn.onclick = async () => {
    const newText = textarea.value.trim();
    if (!newText || !selectedNote) return;
    await fetch(`/api/comments/${encodeURIComponent(selectedNote.path)}/${commentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newText }),
    });
    fetchComments(selectedNote.path);
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => fetchComments(selectedNote.path);

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  item.insertBefore(textarea, metaEl);
  item.insertBefore(actions, metaEl);
  textarea.focus();
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

  // Tab inserts two spaces in editor
  document.getElementById("editor").addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + "  " + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      ta.dispatchEvent(new Event("input"));
    }
  });

  // Track dirty state
  document.getElementById("editor").addEventListener("input", () => {
    dirty = true;
    document.getElementById("save-status").textContent = "Unsaved changes";
    document.getElementById("save-status").style.color = "var(--warn)";
  });
}

/* ── Title Editing ── */
function pathToTitle(path) {
  const filename = path.split("/").pop();
  let name = filename.replace(/\.md$/, "");
  name = name.replace(/^\[.*?\]/, "");
  return name.replace(/_/g, " ").trim();
}

function updateTitleEditing() {
  const pathEl = document.getElementById("current-path");
  const titleEl = document.getElementById("note-title");
  if (editVisible && selectedNote) {
    pathEl.style.display = "none";
    titleEl.style.display = "block";
  } else {
    pathEl.style.display = "";
    titleEl.style.display = "none";
  }
}

function initTitleEditing() {
  const titleEl = document.getElementById("note-title");
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleEl.blur();
    }
    if (e.key === "Escape") {
      titleEl.value = titleEl.dataset.originalTitle || "";
      titleEl.blur();
    }
  });
  titleEl.addEventListener("blur", () => {
    const newTitle = titleEl.value.trim();
    const oldTitle = titleEl.dataset.originalTitle || "";
    if (newTitle && newTitle !== oldTitle) {
      renameNote(newTitle);
    }
  });
}

async function renameNote(newTitle) {
  if (!selectedNote) return;
  try {
    const res = await fetch("/api/note/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPath: selectedNote.path, newTitle }),
    });
    const data = await res.json();
    if (data.ok) {
      selectedNote.path = data.newPath;
      document.getElementById("current-path").textContent = data.newPath;
      document.getElementById("note-title").dataset.originalTitle = newTitle;
      // Refresh note list to show new title
      await rebuild();
    } else {
      alert("Rename failed: " + (data.error || "unknown error"));
      document.getElementById("note-title").value =
        document.getElementById("note-title").dataset.originalTitle || "";
    }
  } catch (e) {
    alert("Rename failed: " + e.message);
    document.getElementById("note-title").value =
      document.getElementById("note-title").dataset.originalTitle || "";
  }
}

/* ── Note & Directory Creation ── */
async function createDir() {
  const name = prompt("New category name:");
  if (!name || !name.trim()) return;
  try {
    const res = await fetch("/api/dir/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      await rebuild();
    } else {
      alert("Failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

async function createNote() {
  if (!canAddNote()) return;
  const tag = Array.from(activeTags)[0];
  const level = tagLevels[tag] || "low";

  // Determine target directory
  let dir;
  if (level === "mid") {
    const parent = tagParents[tag];
    dir = parent + "/" + tag.replace(/ /g, "_");
  } else {
    dir = tag;
  }

  try {
    const res = await fetch("/api/note/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir }),
    });
    const data = await res.json();
    if (data.ok) {
      await rebuild();
      await loadNote(data.path);
      // Open edit mode and focus title
      if (!editVisible) toggleEdit();
      setTimeout(() => {
        document.getElementById("note-title").select();
      }, 100);
    } else {
      alert("Failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

/* ── Git Operations ── */
async function checkGitStatus() {
  try {
    const res = await fetch("/api/git/status");
    const data = await res.json();
    isGitRepo = data.isRepo !== false;
    gitDirty = data.hasChanges;
    document.getElementById("btn-push").disabled = !isGitRepo || !gitDirty;
    document.getElementById("btn-pull").disabled = !isGitRepo;
    document.getElementById("btn-push").title = isGitRepo ? "Commit & push notes" : "Not a git repo";
    document.getElementById("btn-pull").title = isGitRepo ? "Pull updates from remote" : "Not a git repo";
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
      if (data.pushError) {
        alert("Committed but push failed: " + data.pushError);
      }
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

/* ── No-Source State ── */
function showNoSourceState() {
  // Hide left panel content and show a prompt in the main area
  document.getElementById("left-panel").style.display = "none";
  document.getElementById("resize-handle").style.display = "none";
  document.getElementById("empty-state").innerHTML =
    '<div>No note sources configured.</div>' +
    '<button class="btn" style="margin-top:1rem" onclick="addSource()">+ Add source</button>';
  document.getElementById("empty-state").style.display = "flex";
}

function hideNoSourceState() {
  document.getElementById("left-panel").style.display = "";
  document.getElementById("resize-handle").style.display = "";
  document.getElementById("empty-state").innerHTML = "Select a note to view";
  document.getElementById("empty-state").style.display = "flex";
}

/* ── Source Selector ── */
async function fetchSources() {
  try {
    const res = await fetch("/api/sources");
    const data = await res.json();
    sources = data.sources || [];
    activeSource = data.active || "";
    updateSourceButton();
  } catch {
    // Silently fail
  }
}

function updateSourceButton() {
  const btn = document.getElementById("btn-source");
  if (!btn) return;
  const active = sources.find(s => s.path === activeSource);
  btn.textContent = active ? active.name : "Source";
}

function toggleSourceDropdown() {
  const menu = document.getElementById("source-menu");
  const wasOpen = menu.classList.contains("open");
  menu.classList.toggle("open");
  if (!wasOpen) buildSourceMenu();
}

function buildSourceMenu() {
  const menu = document.getElementById("source-menu");
  menu.innerHTML = "";

  sources.forEach(s => {
    const item = document.createElement("div");
    item.className = "dropdown-item" + (s.path === activeSource ? " active" : "");
    item.onclick = (e) => {
      if (e.target.classList.contains("remove-btn")) return;
      selectSource(s.path);
    };

    const nameEl = document.createElement("span");
    nameEl.className = "source-name";
    nameEl.textContent = s.name;

    item.appendChild(nameEl);

    // Remove button
    {
      const rmBtn = document.createElement("span");
      rmBtn.className = "remove-btn";
      rmBtn.textContent = "×";
      rmBtn.title = "Remove source";
      rmBtn.onclick = (e) => {
        e.stopPropagation();
        removeSource(s.path, s.name);
      };
      item.appendChild(rmBtn);
    }

    menu.appendChild(item);
  });

  // Add source action
  const addAction = document.createElement("button");
  addAction.className = "dropdown-action";
  addAction.textContent = "+ Add source";
  addAction.onclick = () => addSource();
  menu.appendChild(addAction);
}

async function selectSource(path) {
  document.getElementById("source-menu").classList.remove("open");
  if (path === activeSource) return;

  const btn = document.getElementById("btn-source");
  btn.textContent = "...";

  try {
    const res = await fetch("/api/sources/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (data.notes !== undefined) {
      activeSource = path;
      allNotes = data.notes;
      tagLevels = data.tagLevels;
      tagParents = data.tagParents || {};
      activeTags.clear();
      searchQuery = "";
      searchResults = null;
      document.getElementById("search-input").value = "";
      selectedNote = null;
      editVisible = false;
      renderVisible = false;
      document.getElementById("editor-pane").classList.remove("visible");
      document.getElementById("render-pane").classList.remove("visible");
      document.getElementById("btn-edit").classList.remove("active");
      document.getElementById("btn-render").classList.remove("active");
      document.getElementById("empty-state").style.display = "flex";
      document.getElementById("current-path").textContent = "Select a note";
      document.getElementById("note-title").style.display = "none";
      document.getElementById("comments-section").style.display = "none";
      document.getElementById("crossrefs-section").style.display = "none";
      buildTagBar();
      renderNoteList();
      checkGitStatus();
    } else {
      alert("Switch failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Switch failed: " + e.message);
  }

  updateSourceButton();
}

async function addSource() {
  document.getElementById("source-menu").classList.remove("open");
  const wasEmpty = sources.length === 0;
  const name = prompt("Source name:");
  if (!name || !name.trim()) return;
  const path = prompt("Absolute path to notes directory:");
  if (!path || !path.trim()) return;

  try {
    const res = await fetch("/api/sources/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), path: path.trim() }),
    });
    const data = await res.json();
    if (data.ok) {
      await fetchSources();
      // First source added — bootstrap the UI
      if (wasEmpty && sources.length > 0) {
        hideNoSourceState();
        // Force-select: reset activeSource so selectSource doesn't bail
        activeSource = "";
        await selectSource(sources[0].path);
      }
    } else {
      alert("Failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Failed: " + e.message);
  }
}

/* ── Cross-References ── */
async function fetchCrossrefs(notePath) {
  const section = document.getElementById("crossrefs-section");
  try {
    const res = await fetch(`/api/crossrefs/${encodeURIComponent(notePath)}`);
    const data = await res.json();
    const forward = data.forward || [];
    const backlinks = data.backlinks || [];
    if (forward.length === 0 && backlinks.length === 0) {
      section.style.display = "none";
      return;
    }
    renderCrossrefs(forward, backlinks);
    section.style.display = "block";
  } catch {
    section.style.display = "none";
  }
}

function renderCrossrefs(forward, backlinks) {
  const list = document.getElementById("crossrefs-list");
  list.innerHTML = "";

  if (forward.length > 0) {
    const group = document.createElement("div");
    group.className = "crossref-group";
    const label = document.createElement("div");
    label.className = "crossref-group-label";
    label.textContent = "Links to";
    group.appendChild(label);
    forward.forEach(ref => {
      const item = document.createElement("div");
      item.className = "crossref-item";
      item.textContent = ref.title;
      item.onclick = () => loadNote(ref.path);
      group.appendChild(item);
    });
    list.appendChild(group);
  }

  if (backlinks.length > 0) {
    const group = document.createElement("div");
    group.className = "crossref-group";
    const label = document.createElement("div");
    label.className = "crossref-group-label";
    label.textContent = "Linked from";
    group.appendChild(label);
    backlinks.forEach(ref => {
      const item = document.createElement("div");
      item.className = "crossref-item";
      item.textContent = ref.title;
      item.onclick = () => loadNote(ref.path);
      group.appendChild(item);
    });
    list.appendChild(group);
  }
}

/* ── Garden Visualization ── */
let gardenVisible = false;
let gardenData = null;
let gardenAnimId = null;
let gardenNodes = [];
let gardenEdges = [];
let hoveredNode = null;
let gardenTagColors = {};

function toggleGarden() {
  gardenVisible = !gardenVisible;
  const overlay = document.getElementById("garden-overlay");
  const btn = document.getElementById("btn-garden");
  btn.classList.toggle("active", gardenVisible);

  if (gardenVisible) {
    overlay.style.display = "block";
    fetchGardenData();
  } else {
    overlay.style.display = "none";
    if (gardenAnimId) {
      cancelAnimationFrame(gardenAnimId);
      gardenAnimId = null;
    }
    const legend = document.getElementById("garden-legend");
    if (legend) legend.remove();
  }
}

async function fetchGardenData() {
  try {
    const res = await fetch("/api/garden");
    gardenData = await res.json();
    initGarden();
  } catch (e) {
    console.error("Failed to fetch garden data:", e);
  }
}

function initGarden() {
  const canvas = document.getElementById("garden-canvas");
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  const w = rect.width;
  const h = rect.height;

  // Build nodes with physics
  gardenNodes = gardenData.nodes.map((n, i) => ({
    x: w * 0.2 + Math.random() * w * 0.6,
    y: h * 0.2 + Math.random() * h * 0.6,
    vx: 0,
    vy: 0,
    radius: Math.max(8, Math.min(40, 8 + Math.sqrt(n.views) * 4)),
    path: n.path,
    title: n.title,
    views: n.views,
    tags: n.tags,
  }));

  // Build edge index
  const pathIndex = {};
  gardenNodes.forEach((n, i) => { pathIndex[n.path] = i; });
  gardenEdges = gardenData.edges
    .filter(e => pathIndex[e.from] !== undefined && pathIndex[e.to] !== undefined)
    .map(e => ({ from: pathIndex[e.from], to: pathIndex[e.to] }));

  // Build tag color map and legend
  gardenTagColors = buildTagColorMap();
  renderGardenLegend();

  // Mouse interaction
  canvas.onmousemove = (e) => {
    const cr = canvas.getBoundingClientRect();
    const mx = e.clientX - cr.left;
    const my = e.clientY - cr.top;
    hoveredNode = null;
    for (const node of gardenNodes) {
      const dx = node.x - mx;
      const dy = node.y - my;
      if (dx * dx + dy * dy < (node.radius + 4) * (node.radius + 4)) {
        hoveredNode = node;
        break;
      }
    }
    canvas.style.cursor = hoveredNode ? "pointer" : "default";
  };

  canvas.onclick = (e) => {
    if (hoveredNode) {
      loadNote(hoveredNode.path);
      toggleGarden();
    }
  };

  // Start animation
  if (gardenAnimId) cancelAnimationFrame(gardenAnimId);
  gardenAnimLoop();
}

function buildTagColorMap() {
  const topTags = new Set();
  for (const node of gardenNodes) {
    if (node.tags.length > 0) {
      const tag = node.tags.find(t => tagLevels[t] === "top") || node.tags[0];
      topTags.add(tag);
    }
  }
  const tags = Array.from(topTags).sort();
  const map = {};
  tags.forEach((tag, i) => {
    const hue = (i * 360 / tags.length) % 360;
    map[tag] = `hsl(${hue}, 60%, 55%)`;
  });
  return map;
}

function renderGardenLegend() {
  let legend = document.getElementById("garden-legend");
  if (!legend) {
    legend = document.createElement("div");
    legend.id = "garden-legend";
    document.getElementById("garden-overlay").appendChild(legend);
  }

  let html = '<div class="legend-title">Legend</div>';
  html += '<div class="legend-item"><span class="legend-circle legend-small"></span><span class="legend-circle legend-large"></span> Size = view count</div>';
  html += '<div class="legend-item"><span class="legend-line"></span> Line = cross-reference</div>';

  const tags = Object.keys(gardenTagColors).sort();
  if (tags.length > 0) {
    html += '<div class="legend-divider"></div>';
    for (const tag of tags) {
      html += `<div class="legend-item"><span class="legend-dot" style="background:${gardenTagColors[tag]}"></span> ${tag}</div>`;
    }
  }

  legend.innerHTML = html;
}

function gardenAnimLoop() {
  const canvas = document.getElementById("garden-canvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  // Physics step
  const repulseK = 2000;
  const springK = 0.005;
  const restLen = 120;
  const centerK = 0.001;
  const damping = 0.9;
  const t = Date.now() / 1000;

  // Repulsion
  for (let i = 0; i < gardenNodes.length; i++) {
    for (let j = i + 1; j < gardenNodes.length; j++) {
      const a = gardenNodes[i];
      const b = gardenNodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 1;
      const f = Math.min(repulseK / d2, 5);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
  }

  // Attraction (springs)
  for (const edge of gardenEdges) {
    const a = gardenNodes[edge.from];
    const b = gardenNodes[edge.to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = springK * (d - restLen);
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  // Centering + damping + update
  for (const node of gardenNodes) {
    node.vx += (w / 2 - node.x) * centerK;
    node.vy += (h / 2 - node.y) * centerK;
    node.vx *= damping;
    node.vy *= damping;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(node.radius, Math.min(w - node.radius, node.x));
    node.y = Math.max(node.radius, Math.min(h - node.radius, node.y));
  }

  // Read theme colors
  const cs = getComputedStyle(document.documentElement);
  const bgColor = cs.getPropertyValue("--bg").trim();
  const borderColor = cs.getPropertyValue("--border").trim();
  const textColor = cs.getPropertyValue("--text").trim();
  const accentColor = cs.getPropertyValue("--accent").trim();

  // Clear
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // Draw edges (curved)
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  for (const edge of gardenEdges) {
    const a = gardenNodes[edge.from];
    const b = gardenNodes[edge.to];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const cx = mx + (a.y - b.y) * 0.15;
    const cy = my + (b.x - a.x) * 0.15;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);
    ctx.stroke();
  }

  // Draw nodes
  for (const node of gardenNodes) {
    const isHovered = node === hoveredNode;
    const breath = 1 + Math.sin(t * 2 + node.x * 0.01) * 0.05;
    const r = node.radius * breath * (isHovered ? 1.3 : 1);

    // Color by tag name
    const primaryTag = node.tags.find(t => tagLevels[t] === "top") || node.tags[0];
    let color = gardenTagColors[primaryTag] || borderColor;
    if (isHovered) color = accentColor;

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = isHovered ? 1 : 0.8;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Label
    const maxLabelLen = isHovered ? 40 : 12;
    let label = node.title;
    if (label.length > maxLabelLen) label = label.slice(0, maxLabelLen - 1) + "\u2026";
    ctx.font = `${isHovered ? 13 : 11}px ${cs.getPropertyValue("--font-mono").trim() || "monospace"}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.fillText(label, node.x, node.y + r + 14);
  }

  ctx.restore();

  gardenAnimId = requestAnimationFrame(gardenAnimLoop);
}

// Resize handler for garden
window.addEventListener("resize", () => {
  if (gardenVisible && gardenData) {
    const canvas = document.getElementById("garden-canvas");
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }
});

async function removeSource(path, name) {
  if (!confirm(`Remove source "${name}"?`)) return;
  document.getElementById("source-menu").classList.remove("open");

  try {
    const res = await fetch("/api/sources/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (data.ok) {
      await fetchSources();
      if (sources.length === 0) {
        showNoSourceState();
      } else if (path === activeSource) {
        await selectSource(sources[0].path);
      }
    } else {
      alert("Failed: " + (data.error || "unknown error"));
    }
  } catch (e) {
    alert("Failed: " + e.message);
  }
}
