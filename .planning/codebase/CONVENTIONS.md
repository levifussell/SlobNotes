# Conventions

## Code Style

### Python (server.py)

- **Module-level globals** for mutable state: `NOTES_ROOT`, `_notes_cache`, `_tag_levels_cache`, `_tag_parents_cache`
- **Constants** in UPPER_SNAKE_CASE: `REPO_ROOT`, `SKIP_DIRS`, `SOURCES_FILE`
- **Functions** in snake_case: `scan_notes()`, `load_sources()`, `switch_notes_root()`
- **Route handlers** prefixed with `api_`: `api_notes()`, `api_save_note()`, `api_git_status()`
- **Type hints** used sparingly (only in `extract_tags_and_title(filepath: Path)`)
- **Docstrings** on utility functions but not on route handlers
- **Error handling** pattern: `try/except Exception` with generic fallback, returning `jsonify({"ok": False, "error": str(e)})` or aborting with HTTP status

### JavaScript (app.js)

- **Global variables** at top of file: `let allNotes`, `let tagLevels`, `let activeTags`, etc.
- **Functions** in camelCase: `fetchNotes()`, `buildTagBar()`, `renderNoteList()`
- **DOM manipulation** via `document.getElementById()` and `document.createElement()` — no jQuery, no framework
- **Async/await** for all API calls, no callbacks or `.then()` chains
- **No modules** — everything in global scope, loaded via `<script src="app.js">`
- **Event binding** split between: HTML `onclick` attributes (toolbar buttons) and `addEventListener` in init functions (keyboard, resize, title editing)

### CSS

- **All colors via CSS custom properties** defined in `theme.css`, overridden per-palette in `app.js`
- **BEM-lite naming**: `.note-item`, `.note-title`, `.note-meta`, `.tag-pill`, `.comment-item`, `.comment-text`
- **State classes**: `.active`, `.selected`, `.visible`, `.resolved`, `.dragging`, `.mobile-open`, `.split`
- **Level classes**: `.level-top`, `.level-mid`, `.level-low`
- **No CSS preprocessor** — plain CSS with custom properties

## API Response Patterns

- **Success**: `{"ok": true, ...}` or direct data object
- **Error**: `{"ok": false, "error": "message"}` with appropriate HTTP status
- **List endpoints** return data directly: `{"notes": [...], "tagLevels": {...}}`
- **Mutation endpoints** return `{"ok": true}` plus any relevant updated data

## File Naming

- **Note files**: `{title_with_underscores}.md` or `[prefix]{title_with_underscores}.md`
- **Auto-created notes**: `YYYY_MM_DD.md`, incrementing with `_2`, `_3` on collision
- **Sidecar files**: `.{note_stem}.comments.json` (dotfile prefix hides from scanner)
- **Config files**: `sources.json` (auto-created, gitignored)

## Frontend State Management

- All state in module-level `let` variables (no state library, no reactive framework)
- State changes trigger explicit re-renders: `buildTagBar()`, `renderNoteList()`
- No URL routing — SPA state is ephemeral (lost on refresh)
- Palette preference persisted to `localStorage` under key `notesViewerPalette`

## Path Handling

- Server uses `pathlib.Path` throughout
- All user-facing paths are relative to `NOTES_ROOT`
- Path traversal prevention: `str(fp.resolve()).startswith(str(NOTES_ROOT))` on every file access route
- Frontend encodes paths with `encodeURIComponent()` for API calls

## Duplication Pattern

`build_static.py` duplicates `extract_tags_and_title()` and `scan_notes()` from `server.py` rather than importing them. The static `app.js` duplicates palettes, tag logic, markdown rendering, and resize/keyboard code from the main `app.js`. This is intentional — the static build is a self-contained artifact independent of the server.
