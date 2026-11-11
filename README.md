<div align="center">
  <a href="#readme">
    <img alt="Mireva" src="assets/logo.svg" width="220">
  </a>
</div>

<div align="center">
  <h3>Autonomous 24/7 Marketing Strategist and Social Growth Engine</h3>
</div>

<div align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License: MIT"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white" alt="Python 3.12+"></a>
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.161%2B-009688?logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="https://ai.pydantic.dev"><img src="https://img.shields.io/badge/Pydantic_AI-2.60%2B-E92063?logo=pydantic&logoColor=white" alt="Pydantic AI"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=black" alt="React 19"></a>
  <a href="#testing-and-verification"><img src="https://img.shields.io/badge/Tests-253_Passed-success?logo=pytest&logoColor=white" alt="253 Tests Passed"></a>
</div>

<br>

<div align="center">
  <a href="#system-architecture">Architecture</a> &bull;
  <a href="#core-capabilities">Core Capabilities</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#supported-models">Supported Models</a> &bull;
  <a href="#testing-and-verification">Testing</a>
</div>

<br>

Mireva is not a chatbot that waits for your prompt. It is a full-time, self-regulating **Head of Growth** running continuously in the background. It audits search intent, monitors competitors, drafts high-converting content, scouts creator leads, and manages cold outreach on its own self-scheduled heartbeat.

```bash
# Clone and launch Mireva in minutes
git clone https://github.com/Ankush0286/mireva.git && cd mireva
```

> [!TIP]
> **Risk-Free Sandbox Testing:** Mireva comes pre-configured with `nvidia/nemotron-3-ultra-550b-a55b:free` on OpenRouter (a 550B parameter MoE model with a 1M token context window and **$0.00/token** cost), ensuring your background autonomous loops never drain your wallet during development.

---

## Why use Mireva?

Mireva provides the foundational architecture needed for long-running, self-directed marketing operations:

* **Durable Autonomous Lifecycle:** Built on a restart-safe sleep/wake loop. The agent schedules its own rest periods (30m to 180m) in PostgreSQL. If your server crashes or restarts, the agent automatically resumes on schedule.
* **Human-in-the-Loop Review Queue:** Maintain oversight with dual autonomy policies (`Staged Review` vs `Full Auto`). Review cold DMs, auto-replies, and post drafts in a dedicated sliding drawer.
* **Token-Efficient Browser Perception:** Replaces expensive vision-token processing with a DOM Distillation Engine that maps interactive elements to numbered indices and semantic ARIA accessibility trees for deterministic web exploration.
* **Stealth Anti-Ban Infrastructure:** Defeats bot heuristics on Instagram and Twitter/X with masked navigator flags, natural typing jitter (25 to 75ms), non-linear mouse wheel scrolling, and token-bucket rate limiting.
* **Ground-Truth Brand Governance:** Operates against a strictly configured Brand Kit containing buyer personas, competitor battlecards, value propositions, and banned buzzwords (*delve*, *leverage*) to eliminate generic corporate fluff.

---

## System Architecture

```
                                  USER INTERFACE
           React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + TanStack Query v5
       ┌────────────────────────────────────────────────────────────────────────┐
       │  Mission Control  •  Copilot Chat  •  Social CRM  •  Action Studio  ...│
       └───────────────────────────────────┬────────────────────────────────────┘
                                           │ HTTP / SSE Stream / WebSockets
                                           ▼
                                   FASTAPI BACKEND
       ┌────────────────────────────────────────────────────────────────────────┐
       │ REST Routers • Fernet Vault • Exception Handlers • APScheduler Engine  │
       └───────┬───────────────────────────┬────────────────────────────┬───────┘
               │                           │                            │
               ▼                           ▼                            ▼
   ┌───────────────────────┐   ┌───────────────────────┐   ┌────────────────────────┐
   │      AI Engine        │   │   Stealth Browser     │   │   Persistent Storage   │
   │  Pydantic AI ReAct    │   │  Chromium Persistent  │   │  PostgreSQL (Supabase) │
   │  Fireworks/OpenRouter │   │  DOM Distillation     │   │  Encrypted Credentials │
   │  Thinking Telemetry   │   │  Human Jitter & CDP   │   │  Append-Only Audits    │
   └───────────────────────┘   └───────────────────────┘   └────────────────────────┘
```

---

## The Autonomous Lifecycle

Every background growth cycle follows a structured 4-step cognitive loop:

```
                  ┌──────────────────────────────────────────────┐
                  │            1. WAKE UP & EVALUATE             │
                  │  • Audits GSC, Ahrefs & Account metrics      │
                  │  • Checks review queue feedback from humans  │
                  │  • Inspects quota usage & cooldown state     │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │             2. STRATEGY SYNTHESIS            │
                  │  • Consults Brand Kit (voice, personas, ICP) │
                  │  • Finds new striking-distance opportunities │
                  │  • Identifies trending competitor topics     │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │              3. EXECUTE ACTIONS              │
                  │  • Queues high-hook social posts             │
                  │  • Adjusts keyword trigger rules             │
                  │  • Stages personalized cold DMs              │
                  │  • Vets new influencer leads into CRM        │
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
                  │ (Agent Pauses)     │   │ (Sets countdown)    │
                  └────────────────────┘   └─────────────────────┘
```

---

## Core Capabilities

* **Mission Control:** Live telemetry dashboard with an active countdown timer, real-time activity monologue feed, and a slide-over Review Queue sidebar.
* **Interactive Copilot:** Chat workspace with SSE token streaming, expandable `<think>` reasoning traces, and in-place prompt editing and retrying.
* **Social CRM & Outreach:** Manage influencer relationships through structured stages (`discovered` &rarr; `qualified` &rarr; `contacted` &rarr; `replied` &rarr; `converted`) with autonomous creator bio scouting.
* **Triggers Radar:** Social listening engine that polls competitor feeds and matches keywords using regex word boundaries (`(?<!\w)keyword(?!\w)`).
* **Action Studio:** Record zero-token browser automation scripts via an interactive canvas screencast streamed over WebSockets.
* **Data Connectors:** Connect Google Search Console, Ahrefs, and DataForSEO to extract striking-distance queries (positions 4.0 to 20.0).

> [!NOTE]
> All outbound cold DMs and posts pass through account-level anti-ban safety limits managed by an in-memory token-bucket throttler (`AccountThrottler`).

---

## Supported Models

Mireva uses dynamic model routing configured in `backend/src/app/core/agent_config.py`:

| Model ID | Provider | Context Window | Pricing (In / Out per 1M) | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter | **1,048,576** | **$0.00 / $0.00** | **Risk-free testing & background dry runs** |
| `accounts/fireworks/models/deepseek-v4p1-flash-1017` | Fireworks | **1,048,576** | **$0.30 / $1.20** | **552B MoE Flagship (Deep reasoning & actions)** |
| `accounts/fireworks/models/glm-5p3-flash` | Fireworks | **1,048,576** | **$0.15 / $0.50** | **Ultra-budget high-frequency tool calling** |
| `accounts/fireworks/models/minimax-m3p1-flash` | Fireworks | **1,000,000** | **$0.15 / $0.60** | **High-speed creative copywriting & hooks** |

---

## Getting Started

### Prerequisites
* **Python 3.12+** (managed via [`uv`](https://github.com/astral-sh/uv) recommended)
* **Node.js 20+** & **npm**
* **Chromium** (installed via Playwright)

### 1. Repository Setup
```bash
git clone https://github.com/your-username/mireva.git
cd mireva
```

### 2. Backend Setup
```bash
cd backend

# Install dependencies with uv
uv sync

# Install Playwright browser binaries
uv run playwright install chromium

# Copy environment configuration
cp .env.example .env
```

Configure `backend/.env`:
```env
ENVIRONMENT=development
DEBUG=true

# Database (PostgreSQL / Supabase pooler compatible)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres

# Master Vault Encryption Key (AES-128 Fernet)
SECRET_KEY=your-32-byte-base64-secret-key-here

# AI Model Gateways (At least one required)
OPENROUTER_API_KEY=sk-or-v1-...
FIREWORKS_API_KEY=fw-...
```

Start the backend:
```bash
uv run uvicorn app.main:app --app-dir src --reload
```
API docs will be available at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
Open `http://localhost:5173` to launch the application.

---

## Testing and Verification

Mireva enforces strict type safety and architectural boundaries across **253 automated tests**:

```bash
cd backend

# Linter & Formatter (0 warnings)
uv run ruff check src tests --fix

# Static Type Checking (0 errors across 165 source files)
uv run mypy src tests

# Full Pytest Suite (In-memory transactional isolation)
uv run pytest -v
```

### Frontend Verification
```bash
cd frontend

# Run Oxlint (0 warnings, 0 errors across all React 19 components)
npx oxlint --fix

# Typecheck TypeScript build
npm run build
```

---

## Security and Rate Limiting

1. **Zero Plaintext Secrets:** All API secrets, OAuth tokens, and session passwords are encrypted at rest with **AES-128 Fernet**. Public Pydantic schemas explicitly exclude sensitive database fields.
2. **Decoupled Database Sessions:** Long-running browser exploration sessions (such as live WebSocket screencasts or inbox scraping) borrow a short-lived DB connection to read metadata and immediately release it back to the connection pool. Results are batch-persisted in a fresh transaction upon completion, eliminating pool starvation.
3. **Account Throttling:** Background dispatchers acquire slots from an in-memory `AccountThrottler` (token bucket: 3-action burst limit, 1 token refilled per 60s, mandatory 30s minimum action spacing).

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
