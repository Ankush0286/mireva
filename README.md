<div align="center">
  <a href="#readme">
    <img alt="Mireva" src="assets/logo.svg" width="220">
  </a>
</div>

<div align="center">
  <h3>Dual-AI Marketing Platform: Interactive Growth Copilot & 24/7 Autonomous Strategist</h3>
</div>

<div align="center">
  <a href="https://github.com/Ankush0286/mireva/actions/workflows/ci.yml"><img src="https://github.com/Ankush0286/mireva/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI Status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License: MIT"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white" alt="Python 3.12+"></a>
  <a href="https://go.dev"><img src="https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white" alt="Go 1.25"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=black" alt="React 19"></a>
  <a href="#testing-and-verification"><img src="https://img.shields.io/badge/Tests-251_Passed-success?logo=pytest&logoColor=white" alt="253 Tests Passed"></a>
</div>

<br>

<div align="center">
  <a href="#the-dual-ai-architecture">Dual-AI Architecture</a> &bull;
  <a href="#complete-capabilities">Capabilities</a> &bull;
  <a href="#system-architecture">System Design</a> &bull;
  <a href="#quick-start-docker-compose">Docker Quickstart</a> &bull;
  <a href="#local-development-setup">Local Setup</a> &bull;
  <a href="CONTRIBUTING.md">Contributing</a>
</div>

<br>

**Mireva** is an open-source, self-hosted marketing automation engine and Social CRM powered by **two coordinated AI systems** alongside a specialized **Autonomous Browser Sub-Agent**:

1. **The Interactive AI Copilot (On-Demand Chat):** A real-time conversational partner with streaming tokens, `<think>` reasoning traces, live tool execution cards, and inline human-approval gates.
2. **The 24/7 Continuous Marketing Strategist (Background Autopilot):** A self-regulating autonomous Head of Growth that wakes up on its own schedule, audits search intent and competitor feeds, drafts content, scouts influencers, learns from human review feedback, and puts itself back to sleep.

```bash
# Self-host the full stack in under 2 minutes with Docker
git clone https://github.com/Ankush0286/mireva.git && cd mireva
cp backend/.env.example backend/.env
docker compose up -d
```

> [!TIP]
> **Risk-Free Sandbox Testing:** Mireva comes pre-configured with `nvidia/nemotron-3-ultra-550b-a55b:free` on OpenRouter (a 550B parameter MoE model with a 1M token context window and **$0.00/token** cost), ensuring your 24/7 background loops never drain your wallet during testing.

---

## The Dual-AI Architecture

Mireva separates **interactive human collaboration** from **continuous background execution**, while allowing both to share the same Brand Kit, Social CRM, and specialized Browser Sub-Agent:

### 1. Interactive AI Copilot (On-Demand Chat Workspace)
Built for fast, collaborative marketing execution with full transparency:
* **Real-Time SSE Token Streaming:** Streams responses word-by-word with zero proxy buffering (`flush_interval -1`).
* **Inspectable Tool Traces (`AgentSteps`):** Every database read, SEO query, or outreach action invoked by the AI appears in a collapsible accordion displaying exact JSON arguments, outputs, and millisecond latency.
* **Chain-of-Thought Reasoning (`ReasoningTrace`):** Optional DeepSeek-style `<think>...</think>` reasoning drawer with a live elapsed thinking clock.
* **Docked Approval Gates (`ApprovalCard`):** When the AI prepares an outbound action (cold DM, post, or auto-reply), an interactive approval card slides smoothly behind the chat composer for 1-click **Approve & Dispatch** or **Dismiss**.
* **Context & Cost Telemetry (`UsageMeter`):** Live token tracking against the model's context window (e.g., 1M tokens) and real-time USD cost calculation.
* **In-Place Edit & Retry:** Edit any past prompt or regenerate any assistant reply in place—automatically truncating subsequent database turns and orphaned tool logs.

### 2. 24/7 Continuous Autonomous Strategist (Mission Control)
A restart-safe, persistent background agent (`StrategistState`) governed by a 60-second `APScheduler` heartbeat:
* **Self-Scheduled Sleep/Wake Cycles:** After finishing a growth cycle, the agent calls `sleep(duration_minutes, rationale)` (30m–180m) and persists its next wake timestamp in PostgreSQL. If your server restarts, it picks up right where it left off.
* **Closed-Loop Feedback Learning:** Before waking up, Mireva compiles a **Human Review Queue Digest** showing which of the agent's previously staged DMs or trigger replies were *Approved*, *Rejected* (with operator feedback), or *Still Pending*—ensuring it adapts its copy and never stages duplicate messages.
* **Dual Autonomy Policies:**
  * **`Staged Review` (Default):** All outbound cold DMs, posts, and trigger replies pause in a slide-over **Review Queue** sidebar for human sign-off.
  * **`Full Auto`:** Authorizes the strategist to automatically approve and queue outbound actions live within your account's anti-ban daily limits.
* **Human Intervention Blocker (`ask_human_for_help`):** If the agent hits a critical blocker (expired session cookies, 2FA checkpoint, or major strategic fork), it pauses the loop, flags the urgency in Mission Control, and resumes once you reply.
* **Operator Controls:** Switch LLM models on the fly, **Run Cycle Now**, **Pause / Resume** (cleanly cancelling in-flight asyncio tasks), delete individual cycle briefings, or **Reset Context**.

### 3. Autonomous Browser Sub-Agent (DOM Distillation Engine)
Invoked by both the Chat Copilot and the 24/7 Strategist for unstructured web exploration:
* **Zero-Vision DOM Distillation:** Instead of burning thousands of vision tokens on screenshots, Mireva injects `data-agent-id` tags onto visible interactive elements (`[1] [IN MODAL] <button> "Message"`) and pairs them with Playwright's semantic ARIA accessibility tree.
* **Inbox Triage (`read_and_summarize_inbox`):** Scans Instagram/X Direct Message inboxes and hidden message requests, skips threads awaiting replies, reads incoming lead messages, and summarizes sentiment.
* **Creator & Influencer Scouting (`scout_influencer_leads`):** Searches hashtags and niches, inspects candidate bios and follower counts, filters out spam/theme pages, and imports vetted prospects directly into the CRM.

---

## System Architecture

```text
                                      INTERNET (80 / 443)
                                               │
                                               ▼
                        ┌─────────────────────────────────────────────┐
                        │           UNIFIED CADDY GATEWAY             │
                        │  • Serves React 19 + Vite SPA (/srv)        │
                        │  • Automatic HTTPS & HTTP/3                 │
                        │  • Unbuffered SSE & WebSocket Proxy         │
                        └──────┬───────────────────────────────┬──────┘
                               │                               │
                 /api/* & /health                              │ /ws/*
                               ▼                               ▼
               ┌──────────────────────────────┐  ┌─────────────────────────────┐
               │       FASTAPI BACKEND        │  │      GO BROWSER BRIDGE      │
               │ • Python 3.12 + Pydantic AI  │  │ • Go 1.25 + Gin + chromedp  │
               │ • Dual AI Agents & Sub-Agent │  │ • 60 FPS JPEG Screencasts   │
               │ • 5 APScheduler Workers      │  │ • Interactive Auth & Record │
               │ • Stealth Playwright Engine  │  │ • Real-Time Canvas Control  │
               └──────────────┬───────────────┘  └──────────────┬──────────────┘
                              │                                 │
                              └────────────────┬────────────────┘
                                               ▼
                        ┌─────────────────────────────────────────────┐
                        │         PERSISTENT STORAGE & VAULT          │
                        │ • PostgreSQL / Supabase (Async SQLAlchemy)  │
                        │ • Shared Browser Sessions (storage_state)   │
                        │ • AES-128 Fernet Encrypted Credentials      │
                        └─────────────────────────────────────────────┘
```

---

## The Autonomous 24/7 Growth Loop

Every scheduled wakeup cycle executes a structured 4-step cognitive pipeline:

```text
                  ┌──────────────────────────────────────────────┐
                  │            1. WAKE UP & EVALUATE             │
                  │  • Audits GSC, Ahrefs & Account metrics      │
                  │  • Reads Human Review Queue feedback digest  │
                  │  • Inspects quota usage & cooldown state     │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │             2. STRATEGY SYNTHESIS            │
                  │  • Queries Brand Kit (voice, personas, ICP)  │
                  │  • Finds striking-distance SEO opportunities │
                  │  • Identifies trending competitor gaps       │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │              3. EXECUTE ACTIONS              │
                  │  • Queues high-hook social posts             │
                  │  • Configures keyword trigger rules          │
                  │  • Stages personalized cold DMs              │
                  │  • Vets & imports new leads into CRM         │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         4. DECISION GATE (Tool Call)         │
                  └──────────────┬────────────────┬──────────────┘
                                 │                │
            Needs critical human │                │ Cycle completed
            intervention         ▼                ▼
                  ┌────────────────────┐   ┌─────────────────────┐
                  │ ask_human_for_help │   │ sleep(30m - 180m)   │
                  │ (Pauses Loop)      │   │ (Sets Wake Timer)   │
                  └────────────────────┘   └─────────────────────┘
```

---

## Complete Capabilities

### Workspace & Analytics
* **Overview Telemetry Dashboard:** 7-day execution velocity SVG area chart, post queue breakdown donut chart, CRM conversion funnel (`Discovered` $\rightarrow$ `Qualified` $\rightarrow$ `Contacted` $\rightarrow$ `Replied` $\rightarrow$ `Converted`), micro-sparkline KPI cards, and live system logs.
* **Brand Kit Ground Truth:** Central repository for company positioning, tone traits, emoji policy, **banned buzzwords** (*delve*, *leverage*), preferred phrases, ICP buyer personas, feature-to-benefit matrices, and competitor battlecards—complete with an **AI Context Inspector**.

### Social Automation & CRM
* **Multi-Platform Account Vault:** Connect **X (Twitter)**, **Instagram**, **Facebook**, and **Email** profiles. Supports `api_keys`, `browser_session`, and `hybrid` auth modes with per-account daily post/DM caps and 24-hour auto-resets.
* **60 FPS Live Auth Studio (Go Bridge):** Launches an isolated Chromium container and streams interactive JPEG frames over WebSockets directly into an HTML5 `<canvas>`. Log in manually (including 2FA/CAPTCHAs) to persist `storage_state.json` cookies seamlessly between Go and Python.
* **Campaigns & Content Scheduler:** Plan multi-channel campaigns, stage drafts, attach local media or remote URLs (auto-cached locally), and let the background `post_dispatcher` worker (30s interval) publish with atomic claim locks and retry handling.
* **Triggers Radar (Social Listening):** Monitors competitor handles (`WatchedHandle`) with randomized scraping jitter. Evaluates incoming posts using word-boundary regex (`keywords_any`, `keywords_all`, `keywords_exclude`, `#hashtags`, `@mentions`), author cooldowns, deduplication, and `{author}` reply templates.
* **Outreach CRM & Cold DM Gate:** Track leads across audience tiers (`nano` to `mega`) and pipeline stages. Deploy the **AI Creator Scout** from the UI to discover leads, stage cold DMs behind human review gates, and let the `dm_dispatcher` worker (60s interval) deliver messages and advance lead stages automatically.

### Intelligence, Workflows & Safety
* **External Data Connectors:** Encrypted vault for **Google Search Console** (extracts striking-distance queries ranking positions 4–20 with high impressions and low CTR) and **Ahrefs / DataForSEO** (competitor organic keyword gaps), complete with live credential verification and an Opportunities Inspector.
* **Action Studio (Zero-Token Recipes):** Record custom browser workflows directly through the live WebSocket canvas studio or via the interactive terminal CLI recorder (`recorder.py`), saving deterministic selector fallback sequences that execute at **0 LLM token cost**.
* **Stealth Anti-Ban Engine:** Defeats bot detection with masked `navigator.webdriver` / spoofed `chrome.runtime` / fake plugins, stale `SingletonLock` cleanup, human-like typing jitter (`human_type` with cognitive punctuation pauses), non-linear mouse-wheel scrolling (`human_scroll`), and an in-memory async `AccountThrottler` token bucket (3-action burst, 1 token/60s refill, mandatory 30s spacing).
* **System Diagnostics & Unified Audit Trail:** Live subsystem health checks (DB latency, AES-128 Fernet roundtrip, AI Gateway keys, Playwright storage, APScheduler jobs), a 3x3 **Platform $\times$ Action Recipe Coverage Matrix** with 1-click recipe seeding, manual worker triggers, and an append-only `ActivityLog` timeline.

---

## Supported Models

Mireva uses deterministic model routing configured in `backend/src/app/core/agent_config.py`:

| Model ID | Provider | Context Window | Pricing (In / Out per 1M) | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter | **1,048,576** | **$0.00 / $0.00** | **Risk-free testing & 24/7 dry runs** |
| `accounts/fireworks/models/deepseek-v4p1-flash-1017` | Fireworks | **1,048,576** | **$0.30 / $1.20** | **552B MoE Flagship (Deep reasoning & tool calling)** |
| `accounts/fireworks/models/glm-5p3-flash` | Fireworks | **1,048,576** | **$0.15 / $0.50** | **Ultra-budget high-frequency autonomous loops** |
| `accounts/fireworks/models/minimax-m3p1-flash` | Fireworks | **1,000,000** | **$0.15 / $0.60** | **High-speed creative copywriting & hooks** |

---

## Quick Start (Docker Compose)

The fastest way to run Mireva locally or on a VPS is via Docker Compose, which orchestrates the Caddy gateway, FastAPI backend, Playwright engine, and Go Browser Bridge together (with `1GB` shared memory configured for Chromium stability).

### 1. Clone and Configure

> [!IMPORTANT]
> **Using Supabase with Docker:** Supabase's default Direct Connection (`db.<ref>.supabase.co`) is **IPv6-only** and unreachable from standard Docker networks (`Errno 101`). Always select the **IPv4-compatible Session Pooler** (`...pooler.supabase.com:5432`) in your Supabase **Connect** modal, and make sure the URL starts with `postgresql+asyncpg://`.

```bash
git clone https://github.com/Ankush0286/mireva.git
cd mireva
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your PostgreSQL connection string, a generated Fernet `SECRET_KEY`, and at least one AI provider key (`OPENROUTER_API_KEY` or `FIREWORKS_API_KEY`).

### 2. Launch Stack
```bash
docker compose up -d
```
* **Local UI:** Open `http://localhost`
* **Custom Domain (Production Auto-HTTPS):** Run `DOMAIN=app.yourdomain.com docker compose up -d`

---

## Local Development Setup

If you prefer running each service natively for active development:

### Prerequisites
* **Python 3.12+** (managed via [`uv`](https://github.com/astral-sh/uv))
* **Node.js 20+** & **npm**
* **Go 1.24+** (for the WebSocket browser bridge)
* **Chromium** (installed via Playwright)

### 1. Backend (`backend/`)
```bash
cd backend

# Install dependencies and dev tools
uv sync --dev

# Install Playwright Chromium binaries
uv run playwright install chromium

# Configure environment variables
cp .env.example .env

# Start FastAPI server (Port 8000)
uv run uvicorn app.main:app --app-dir src --reload
```
API documentation is available at `http://127.0.0.1:8000/docs`.

### 2. Go Browser Bridge (`services/browser-bridge/`)
```bash
cd ../services/browser-bridge

# Download Go modules and start the CDP screencast bridge (Port 8080)
go mod download
go run ./cmd/server
```

### 3. Frontend (`frontend/`)
```bash
cd ../../frontend

# Install dependencies and start Vite dev server (Port 5173)
npm install
npm run dev
```
Open `http://localhost:5173` to launch the application.

---

## Testing and Verification

Mireva enforces strict type safety, dead-code auditing, and automated testing across all three services (**251 backend tests**):

### Backend Verification
```bash
cd backend

# Linter & Formatter
uv run ruff check src tests
uv run ruff format --check src tests

# Dead-Code & Static Type Checking (0 errors across 165 source files)
uv run vulture src/app
uv run mypy src tests

# Full Pytest Suite (In-memory SQLite isolation)
uv run pytest -v
```

### Frontend Verification
```bash
cd frontend

# Run Oxlint (0 warnings, 0 errors)
npm run lint

# Typecheck & Production Build
npm run build
```

### Go Browser Bridge Verification
```bash
cd services/browser-bridge

go test -v -race ./test/...
```

---

## Security Architecture

1. **Zero Plaintext Secrets:** All API secrets, OAuth tokens, connector keys, and account passwords are encrypted at rest using **AES-128 Fernet**. Public Pydantic response schemas strictly exclude all encrypted columns.
2. **Decoupled Database Connections:** Long-running browser tasks (such as live WebSocket screencasts, creator scouting, and inbox sweeps) open a short-lived DB session to read metadata, release the connection back to the pool before launching Chromium, and commit results in a fresh transaction—preventing connection pool exhaustion.
3. **Atomic Worker Claims:** Background dispatchers use atomic `UPDATE ... WHERE status = ...` claims to guarantee duplicate posts or DMs are never sent across concurrent worker ticks.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on our branch workflow, pre-submission checks, and Conventional Commit requirements.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.