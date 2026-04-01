# Stack

## Languages

| Language | Usage | Version |
|---|---|---|
| Python 3 | Backend server, static site builder | 3.12+ (Netlify), 3.13 (local venv) |
| JavaScript | Frontend SPA (vanilla, no framework) | ES6+ (async/await, modules, template literals) |
| CSS | Styling with custom properties | CSS3 |
| HTML | Single-page shell | HTML5 |
| Bash | Launch/install scripts | POSIX-compatible |

## Backend

| Package | Purpose | Version |
|---|---|---|
| Flask | HTTP server, routing, static file serving | Latest (unpinned in requirements.txt) |
| cryptography | AES-256-GCM encryption for static build | Required only by `build_static.py` |

**Standard library usage:** `os`, `json`, `re`, `subprocess`, `time`, `uuid`, `datetime`, `pathlib`

## Frontend

| Library | Purpose | Loaded Via |
|---|---|---|
| marked.js | Markdown to HTML rendering | CDN (`cdn.jsdelivr.net/npm/marked/marked.min.js`) |
| Space Grotesk | Body font | Google Fonts CSS import in `theme.css` |
| Space Mono | Monospace font | Google Fonts CSS import in `theme.css` |
| Web Crypto API | Client-side AES-GCM decryption (static build only) | Browser built-in |

No build tools, bundlers, transpilers, or package managers on the frontend.

## Infrastructure

| Service | Purpose |
|---|---|
| Netlify | Static site hosting (encrypted read-only build) |
| Git | Version control for notes (commit/push/pull from UI) |

## Runtime Requirements

**Local development:**
- Python 3.12+
- Flask (only Python dependency)
- Modern browser with ES6 support

**Static deployment (Netlify):**
- Python 3.12
- `cryptography` package (for AES-GCM encryption at build time)
- `SITE_PASSWORD` env var
- `NOTES_REPO` env var (git URL to clone at build time)

## Package Management

- Python: `pip` with `requirements.txt` (contains only `flask`)
- Frontend: None (single CDN script tag for marked.js)
- No `package.json`, no `node_modules`, no npm/bun
