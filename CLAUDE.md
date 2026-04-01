# SlobNotes — Claude Workspace

## Goal

A Flask + vanilla JS markdown notes viewer with multi-source support, tag-based filtering, git integration, and theming.

## Architecture

**Backend:** Flask server (`tool/viewer/server.py`) serving a single-page app. Notes are plain `.md` files organized in directories. Directory structure maps to a tag hierarchy (top/mid/low levels). Multiple note sources configurable via `tool/sources.json`.

**Frontend:** Vanilla JS SPA (`tool/viewer/static/`). No build step. Uses `marked.js` for markdown rendering. CSS custom properties for theming with 5 palettes (Default, Mononoke, County Highway, Deepsea Jellyfish, Daylight).

**Data model:** Filesystem-based. No database. Tags derived from directory structure + frontmatter. Comments stored as sidecar `.comments.json` files (dotfile-prefixed, hidden from note scanning).

## Key Files

| File | Purpose |
|---|---|
| `tool/viewer/server.py` | Flask backend — all API routes, note scanning, git ops, comment API |
| `tool/viewer/static/index.html` | Single-page HTML shell |
| `tool/viewer/static/app.js` | All frontend logic — state, API calls, rendering, palettes, comments |
| `tool/viewer/static/style.css` | Layout and component styles |
| `tool/viewer/static/theme.css` | CSS custom properties (colors, fonts, spacing) |
| `tool/sources.json` | Multi-source configuration (auto-created) |
| `tool/scripts/run.sh` | Launch script |

## Running

```bash
cd /Users/jc/Projects/Slunk/SlobNotes && ./tool/scripts/run.sh
# Opens at http://127.0.0.1:5001
```

Or directly: `python3 tool/viewer/server.py`

## API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/notes` | List all notes with tags |
| GET | `/api/note/<path>` | Read note content |
| PUT | `/api/note/<path>` | Save note content |
| POST | `/api/rebuild` | Re-scan filesystem |
| POST | `/api/note/create` | Create new note |
| POST | `/api/note/rename` | Rename note (moves sidecar too) |
| POST | `/api/dir/create` | Create category directory |
| GET | `/api/sources` | List configured sources |
| POST | `/api/sources/add` | Add note source |
| POST | `/api/sources/select` | Switch active source |
| POST | `/api/sources/remove` | Remove source |
| GET | `/api/git/status` | Check git status |
| POST | `/api/git/commit` | Commit + push |
| POST | `/api/git/pull` | Pull from remote |
| GET | `/api/comments/<path>` | Get comments for a note |
| POST | `/api/comments/<path>` | Add comment |
| PUT | `/api/comments/<path>/<id>` | Update comment |
| DELETE | `/api/comments/<path>/<id>` | Delete comment |

## Conventions

- **No build step** — edit static files directly
- **CSS custom properties** — all colors via `var(--name)`, defined in `theme.css` and overridden per-palette in `app.js`
- **Tag hierarchy** — top-level dirs = top tags, subdirs = mid tags, frontmatter = low tags
- **Sidecar pattern** — metadata files use dotfile prefix (e.g., `.my_note.comments.json`) to stay hidden from `scan_notes()`
- **Path validation** — all file access routes check `str(fp.resolve()).startswith(str(NOTES_ROOT))`

## Dependencies

- Python 3, Flask
- Frontend: marked.js (CDN), no other deps

## Gotchas

- `NOTES_ROOT` is mutable global state — changed by `switch_notes_root()` when switching sources
- Notes cache (`_notes_cache`) must be invalidated manually via `rebuild` or `switch_notes_root`
- Git operations use `NOTES_ROOT` as cwd — git status reflects the active source's repo, not SlobNotes itself
