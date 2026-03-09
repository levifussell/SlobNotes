# Concerns

## Security

### Path Traversal Protection — Partially Effective
- File access routes check `str(fp.resolve()).startswith(str(NOTES_ROOT))` which is correct
- However, `api_create_dir()` does NOT perform this check — only validates no `/` or `\` in name (line 305)
- `api_save_note()` checks path but allows writing to any `.md` path under `NOTES_ROOT`

### Git Commit Runs `git add .`
- `api_git_commit()` runs `git add .` on `NOTES_ROOT` (line 524) which stages ALL untracked files, not just notes
- Could accidentally commit sensitive files placed in the notes directory

### No Authentication
- The local server has zero auth — anyone on the network can read/write/delete notes
- Only mitigated by binding to `127.0.0.1` (line 584)

### No CSRF Protection
- All mutation endpoints accept plain JSON POSTs with no CSRF tokens
- Low risk since bound to localhost, but would be an issue if exposed to LAN

### Static Build Security
- Password-gated via AES-256-GCM with PBKDF2 (600K iterations) — solid
- Rate limiting is client-side only (lockout timer in JS) — trivially bypassable
- All notes decrypted into memory at once after unlock — no per-note encryption

## Code Quality

### Mutable Global State
- `NOTES_ROOT` is a mutable global that changes when switching sources (line 172)
- `_notes_cache`, `_tag_levels_cache`, `_tag_parents_cache` are module-level mutable globals
- No locking — concurrent requests during source switch could see inconsistent state
- Flask debug mode uses a reloader which re-initializes these globals

### Code Duplication
- `extract_tags_and_title()` and `scan_notes()` are fully duplicated in `build_static.py` (lines 35-114)
- Palette definitions duplicated between `app.js` and the generated static `app.js`
- Markdown rendering, tag filtering, resize/keyboard logic all duplicated in static build
- Risk: fixes applied to one copy but not the other

### Unpinned Dependencies
- `requirements.txt` contains just `flask` with no version pin
- `marked.js` loaded from CDN with no version pin (`npm/marked/marked.min.js` = latest)
- Could break on major version bumps

### No Input Sanitization on Rendered Markdown
- `marked.js` output inserted via `innerHTML` (line 507 in app.js)
- marked.js has some built-in sanitization but `sanitize` option was removed in v2+
- XSS risk if notes contain malicious HTML (low risk since notes are self-authored)

## Performance

### Full Filesystem Walk on Every Rebuild
- `scan_notes()` does `os.walk()` over the entire `NOTES_ROOT` tree
- Reads every `.md` file to parse frontmatter tags
- No incremental updates — any change triggers full rescan
- For large note collections (1000+), rebuild latency could be noticeable

### All Notes Loaded to Frontend at Once
- `/api/notes` returns the full note list (metadata only, not content)
- No pagination, no virtual scrolling in the note list
- Content loaded per-note on click, which is efficient

### Static Build Loads Everything into Memory
- All note contents decrypted and held in `noteContents` object
- For very large collections this could be memory-heavy in the browser

## Missing Features / TODOs

- No search functionality (no full-text search, no title search)
- No URL routing — refreshing the page loses the selected note
- No offline support / service worker
- No image upload — images must be manually placed in the notes directory
- No note deletion from the UI
- No drag-and-drop for reordering or moving notes between categories
- Source dropdown hidden on mobile (`#source-dropdown { display: none }` at 768px)

## Deployment

### Netlify Build Depends on External Repo
- `netlify.toml` clones `$NOTES_REPO` at build time — build fails if repo is inaccessible
- No fallback or error handling in the build command
- Notes repo must be accessible from Netlify's build environment (requires appropriate SSH keys or HTTPS tokens)

### Static Build Has No Incremental Mode
- Every Netlify deploy re-encrypts all notes from scratch
- No cache between builds
