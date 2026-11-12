## Summary
<!-- Briefly describe what this Pull Request changes and why -->

## Related Issue
<!-- Link the issue this resolves, e.g., Fixes #12 -->

## Type of Change
- [ ] Bug fix (`fix:`)
- [ ] New feature (`feat:`)
- [ ] Breaking change (`feat!:` / `fix!:`)
- [ ] Documentation update (`docs:`)
- [ ] Refactor, test, or CI/CD maintenance (`refactor:` / `test:` / `ci:`)

---

## Verification & Pre-Flight Checklist

Please ensure all relevant checks pass locally before submitting:

### Backend (`backend/`)
- [ ] `uv run ruff check src tests` & `uv run ruff format --check src tests` pass
- [ ] `uv run vulture src/app` reports no dead code
- [ ] `uv run mypy src tests` reports 0 type errors
- [ ] `uv run pytest -v` passes (with external network calls mocked in unit tests)

### Frontend (`frontend/`)
- [ ] `npm run lint` (`oxlint`) passes with 0 warnings/errors
- [ ] `npm run build` (`tsc -b && vite build`) completes with 0 errors

### Go Browser Bridge (`services/browser-bridge/`)
- [ ] `go test -v -race ./test/...` passes

### Security & Hygiene
- [ ] No `.env` files, API keys, passwords, or `storage/browser_sessions/` cookies are staged
- [ ] Sensitive database fields remain encrypted at rest and excluded from public Pydantic response schemas
- [ ] PR title / commits follow [Conventional Commits](https://www.conventionalcommits.org/)