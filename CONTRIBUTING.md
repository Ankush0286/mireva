# Contributing to Mireva

Thank you for your interest in contributing to **Mireva**! Whether you are fixing a bug, adding a new platform adapter, improving the DOM distillation engine, or refining the UI, your contributions are welcome.

This document outlines the development workflow, quality checks, and commit conventions required to merge changes into the repository.

---

## Monorepo Architecture

Mireva is organized as a 3-service monorepo:

```text
mireva/
├── backend/                  # Python 3.12 + FastAPI + Pydantic AI + Playwright
├── frontend/                 # React 19 + TypeScript + Vite 8 + Tailwind CSS v4
├── services/
│   └── browser-bridge/       # Go 1.25 + Gin + chromedp (60 FPS CDP WebSocket Bridge)
├── Caddyfile                 # Unified Edge Reverse Proxy & Static Server
└── docker-compose.yml        # Production Container Orchestration
```

---

## Prerequisites

To develop locally across all services, ensure you have the following installed:

* **Python 3.12+** (managed via [`uv`](https://github.com/astral-sh/uv))
* **Node.js 20+** and **npm**
* **Go 1.24+** (for the WebSocket browser bridge)
* **Docker & Docker Compose** (optional, for containerized testing)

---

## Local Development Setup

### 1. Fork and Clone
```bash
git clone https://github.com/<your-username>/mireva.git
cd mireva
```

### 2. Backend Setup (`backend/`)
```bash
cd backend

# Install dependencies including dev tools (pytest, ruff, mypy, vulture)
uv sync --dev

# Install Playwright Chromium binary
uv run playwright install chromium

# Configure local environment variables
cp .env.example .env

# Start the FastAPI server with hot-reload on port 8000
uv run uvicorn app.main:app --app-dir src --reload
```

### 3. Frontend Setup (`frontend/`)
```bash
cd frontend

# Install dependencies
npm install

# Start the Vite dev server on port 5173
npm run dev
```

### 4. Browser Bridge Setup (`services/browser-bridge/`)
```bash
cd services/browser-bridge

# Download Go modules and start the CDP bridge on port 8080
go mod download
go run ./cmd/server
```

---

## Pre-Submission Quality Gates

Our CI pipeline enforces strict linting, dead-code checks, static typing, and automated tests on every Pull Request. **Please run these checks locally before pushing:**

### Backend Checks
```bash
cd backend

# 1. Lint & auto-fix code style
uv run ruff check src tests --fix

# 2. Format code
uv run ruff format src tests

# 3. Check for dead/unused code
uv run vulture src/app

# 4. Run static type checking
uv run mypy src tests

# 5. Run the full test suite (in-memory SQLite isolation)
uv run pytest -v
```

### Frontend Checks
```bash
cd frontend

# 1. Run Oxlint
npm run lint

# 2. Verify TypeScript compilation and production bundle build
npm run build
```

### Go Browser Bridge Checks
```bash
cd services/browser-bridge

# Run unit tests with race detector
go test -v -race ./test/...
```

---

## Commit Message Guidelines (Conventional Commits)

Mireva uses **automated Semantic Versioning (SemVer)** in our CD pipeline. Your commit messages directly determine version bumps and changelog generation.

Please format commit messages according to the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<optional-scope>): <short summary>
```

### Allowed Types:
* **`feat`**: A new feature or capability (triggers a **Minor** version bump, e.g., `v1.0.0` &rarr; `v1.1.0`)
  * *Example:* `feat(agent): add linkedin profile scraper tool`
* **`fix`**: A bug fix (triggers a **Patch** version bump, e.g., `v1.0.0` &rarr; `v1.0.1`)
  * *Example:* `fix(instagram): handle cookie consent banner in eu regions`
* **`perf`**: A code change that improves performance (triggers a **Patch** bump)
  * *Example:* `perf(browser): reduce dom distillation token footprint`
* **`refactor`**: A code change that neither fixes a bug nor adds a feature
* **`docs`**: Documentation-only changes
* **`test`**: Adding or updating unit/integration tests
* **`ci`** / **`build`**: Changes to GitHub Actions, Dockerfiles, or dependencies
* **`chore`**: Routine maintenance tasks

> **Breaking Changes:** Append `!` after the type/scope (e.g., `feat(api)!: change response schema`) to trigger a **Major** version bump (`v1.0.0` &rarr; `v2.0.0`).

---

## Pull Request Process

1. **Create a Feature Branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Write Tests:** New features or bug fixes in the backend should include corresponding unit or integration tests under `backend/tests/`. External network calls must be mocked in unit tests.
3. **Verify Security:**
   * **Never** commit `.env` files, real API keys, or session cookies (`storage/browser_sessions/`).
   * Ensure all sensitive database fields remain encrypted with `encrypt_token()` and excluded from public Pydantic response schemas.
4. **Open a Pull Request:** Push your branch to your fork and open a PR against the `master` branch with a clear description of what changed and why.

---

## License

By contributing to Mireva, you agree that your contributions will be licensed under the [MIT License](LICENSE).