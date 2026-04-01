# Testing

## Current Coverage

**None.** There are no automated tests of any kind:

- No unit tests
- No integration tests
- No end-to-end tests
- No test framework installed (no pytest, no jest, no playwright)
- No CI/CD pipeline (no GitHub Actions, no test step in Netlify build)

## Manual Testing Surface

The only testing is manual via the browser:

| Area | How to Test |
|---|---|
| Note scanning | Run server, verify notes appear in sidebar |
| Tag filtering | Click tag pills, verify Only/Or/And modes |
| Note editing | Open editor, modify, Ctrl+S, verify save |
| Note creation | Select category, click +, verify file created |
| Note renaming | Enter edit mode, change title, blur, verify |
| Comments | Add/resolve/delete comments on a note |
| Git operations | Make changes, click push/pull buttons |
| Source switching | Add/select/remove sources via dropdown |
| Palette cycling | Click palette button, verify colors change |
| Mobile layout | Resize below 768px, test sidebar toggle |
| Static build | `SITE_PASSWORD=x python3 tool/scripts/build_static.py`, open dist/index.html |

## Coverage Gaps

### High Risk (no automated tests)
- **Path traversal protection** — security-critical, tested only by code review
- **Git operations** — `git add .` / `git commit` / `git push` / `git pull` executed as subprocess
- **Source switching** — mutable global state changes, cache invalidation
- **Sidecar file management** — rename moves sidecar, delete cleans up sidecar
- **Concurrent access** — no tests for race conditions during rebuild/source switch

### Medium Risk
- **Tag extraction logic** — directory hierarchy + frontmatter parsing, edge cases with special characters
- **Note creation** — date-based naming with collision avoidance
- **Markdown rendering** — checkbox conversion, auto-linking, relative image path rewriting
- **Encryption round-trip** — `build_static.py` encrypt + browser decrypt (different codebases)

### Low Risk
- **Palette cycling** — visual only
- **Resize handle** — UI interaction only
- **Keyboard shortcuts** — Ctrl+S, Escape

## Recommended Test Strategy

1. **Unit tests (pytest)** for `extract_tags_and_title()`, `scan_notes()`, `load_sources()`, comment CRUD
2. **API integration tests (pytest + Flask test client)** for all 18 routes including path traversal checks
3. **Encryption round-trip test** to verify `build_static.py` output can be decrypted by the browser JS
