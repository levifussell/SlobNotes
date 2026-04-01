# Architecture

## System Overview

SlobNotes is a markdown notes viewer with two deployment modes:

1. **Local server** — Flask backend + vanilla JS SPA for interactive editing
2. **Static site** — Encrypted, read-only build for Netlify (password-gated)

Both modes share the same CSS theming, tag system, and rendering pipeline. The static build strips editing, comments, git, and source-switching features.

## Component Diagram

```
┌─────────────────────────────────────────────────────┐
│  Browser (SPA)                                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Tag Bar  │  │ Note List│  │ Right Panel        │  │
│  │ (filter) │  │ (sorted) │  │ Editor + Renderer  │  │
│  └──────────┘  └──────────┘  │ + Comments         │  │
│                               └───────────────────┘  │
│  marked.js (CDN) for markdown → HTML                 │
└──────────────────┬──────────────────────────────────┘
                   │ REST API (fetch)
┌──────────────────▼──────────────────────────────────┐
│  Flask Server (server.py)                            │
│  ┌────────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │ Note CRUD  │ │ Git Ops  │ │ Source Switching    │ │
│  │ scan/read/ │ │ status/  │ │ load/save/select   │ │
│  │ save/create│ │ commit/  │ │ sources.json       │ │
│  │ rename     │ │ push/pull│ │                    │ │
│  └────────────┘ └──────────┘ └────────────────────┘ │
│  ┌────────────────────────────────────────────────┐  │
│  │ Comment System (sidecar .comments.json files)  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────┘
                   │ Filesystem (pathlib)
┌──────────────────▼──────────────────────────────────┐
│  Notes Directory (NOTES_ROOT)                        │
│  top_dir/                                            │
│    mid_dir/                                          │
│      note.md             (content)                   │
│      .note.comments.json (sidecar metadata)          │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Reading Notes

1. `scan_notes()` walks `NOTES_ROOT` recursively, collecting `.md` files
2. For each file: extract title (from filename), tags (from directory hierarchy + frontmatter)
3. Notes sorted by `mtime` descending (most recently modified first)
4. Results cached in module-level globals (`_notes_cache`, `_tag_levels_cache`, `_tag_parents_cache`)
5. Cache invalidated by `rebuild` endpoint or `switch_notes_root()`

### Tag Hierarchy (3 levels)

- **Top tags** — first directory component (e.g. `courses/` -> tag "courses")
- **Mid tags** — intermediate directories with underscore-to-space conversion (e.g. `courses/perf_aware/` -> tag "perf aware")
- **Low tags** — parsed from `tags:` frontmatter line in note content

Mid tags track their parent top tag via `tag_parents` dict. The frontend conditionally shows mid tags only when their parent top tag (or the mid tag itself) is active.

### Editing

1. User edits in `<textarea>`, tracked as `dirty` state
2. `Ctrl+S` triggers `PUT /api/note/<path>` with content body
3. Server writes file directly, frontend re-renders markdown and triggers `rebuild` + `checkGitStatus`

### Comment System

- Comments stored in sidecar dotfiles: `.{note_stem}.comments.json`
- Dotfile prefix keeps them hidden from `scan_notes()` (which only reads `.md` files)
- Each comment has: `id`, `text`, `created` (ISO datetime), `resolved` (boolean)
- IDs generated as `c_{timestamp}_{uuid_hex[:6]}`
- Empty comment lists delete the sidecar file

### Source Switching

- `sources.json` stores array of `{name, path}` entries plus `active` path
- Switching source changes `NOTES_ROOT` (mutable global), invalidates cache, re-scans
- Sources with non-existent directories are silently filtered out on load

### Static Build Pipeline

1. `build_static.py` scans all notes and bundles into a single JSON blob (notes + contents + tag metadata)
2. Encrypts with AES-256-GCM (PBKDF2 key derivation, 600K iterations) using `SITE_PASSWORD` env var
3. Outputs `dist/data.enc` + modified `index.html` and `app.js` (read-only, with password gate)
4. Netlify deploys from `tool/dist/` — clones notes repo at build time via `$NOTES_REPO` env var

## Key Design Decisions

- **No database** — filesystem is the single source of truth
- **No build step for local dev** — edit static files directly
- **In-memory cache** — scanned once, invalidated manually (no file watchers)
- **Mutable global `NOTES_ROOT`** — enables multi-source switching but requires careful cache management
- **Path traversal protection** — all file routes validate `resolve().startswith(NOTES_ROOT)`
