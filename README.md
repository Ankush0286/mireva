<div align="center">

# ⚡ GrowthCraft

### **The 24/7 Autonomous Marketing Strategist & Social CRM Engine**

An autonomous, self-regulating AI growth hacker and social operations platform.  
GrowthCraft audits metrics, identifies search intent, monitors competitors, drafts high-converting content, scouts creator leads, and manages cold outreach—all on its own continuous heartbeat.

[![Python 3.12](https://img.shields.io/badge/Python-3.12%2B-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.161%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Pydantic AI](https://img.shields.io/badge/Pydantic_AI-2.60%2B-E92063?logo=pydantic&logoColor=white)](https://ai.pydantic.dev)
[![React 19](https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Playwright Stealth](https://img.shields.io/badge/Playwright-Stealth_Chromium-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Tests Passing](https://img.shields.io/badge/Tests-253_Passed-success?logo=pytest&logoColor=white)](#testing--quality-assurance)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

[Architecture](#-system-architecture) •
[Core Capabilities](#-core-capabilities) •
[Quickstart](#-getting-started) •
[Supported Models](#-supported-ai-models) •
[Testing](#-testing--quality-assurance)

</div>

---

## 🌟 Executive Overview

GrowthCraft is not a chatbot waiting for prompts. It is an **autonomous, full-stack Head of Growth** that operates continuously in the background through a self-regulated cognitive cycle:

1. **Wake Up & Evaluate:** Queries live telemetry—audits Search Console striking-distance keywords, checks account health, and analyzes human review feedback from previous cycles.
2. **Strategy Synthesis:** Gathers ground-truth positioning from the official **Brand Kit** (target buyer personas, value battlecards, tone rules, and banned buzzwords).
3. **Execute High-Leverage Actions:** Queues multi-platform social posts, scouts authentic creator leads, updates competitor keyword trigger rules, and stages personalized cold DMs.
4. **Decision & Regulation Gate:** Decides whether to request human operator guidance (`ask_human_for_help`), or schedule its next rest window (`sleep(30m - 180m)`). Sleep timers are persisted to PostgreSQL so cycles resume safely across server restarts.

---

## 🏛 System Architecture

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

## ✨ Core Capabilities

### 🧠 24/7 Mission Control & Autonomous Strategist
* **Self-Regulating Sleep Cycle:** Agent schedules its own wake-up countdowns (clamped between 30 and 180 minutes) based on campaign performance and peak audience hours.
* **Dual Autonomy Policies:**
  * `Staged Review`: All outbound DMs, posts, and auto-replies route to a flush **Review Queue Right Sidebar** for 1-click human sign-off.
  * `Full Auto`: Agent autonomously approves and dispatches actions within daily safe rate limits without human bottlenecks.
* **Closed-Loop Feedback:** Agent evaluates which past recommendations you approved or dismissed, adapting its pitch angles on subsequent cycles.

### 🤖 Interactive AI Copilot & Streaming Chat
* **ReAct Execution Loop:** Powered by Pydantic AI with real-time Server-Sent Events (SSE) token streaming.
* **Deep Chain-of-Thought:** Live `<think>` reasoning traces render in an expandable drawer with active timers.
* **In-Place Retry & Edit:** Edit any past user prompt to truncate and regenerate in place; retry assistant answers without cluttering the database with duplicate turns.
* **Live Token & Cost Telemetry:** Real-time token tracking (`promptTokens`, `completionTokens`, `contextWindow`, and exact USD cost) calculated via model registry pricing.

### 🕵️ Stealth Browser Automation (Playwright)
* **Hardened Bot Evasions:** Strips `navigator.webdriver`, mocks desktop Chrome plugins and runtime objects, and manages persistent profile directories (`storage/browser_sessions/`).
* **DOM Distillation Engine:** Converts web pages into numbered interactive arrays (`[1] <button> "Create"`) and accessibility (ARIA) snapshots. Replaces expensive vision-token processing with fast, deterministic text prompts.
* **Organic Human Motor Behavior:** Types with character jitter (25–75ms) and cognitive punctuation pauses (300–600ms); scrolls using non-linear mouse wheel increments.

### 🎯 Triggers Radar & Social Listening
* **Competitor Feed Scraping:** Background workers poll competitor feeds on safe intervals (>= 60 minutes) to avoid platform checkpoints.
* **Lookaround Regex Engine:** Evaluates posts using word-boundary regex (`(?<!\w)keyword(?!\w)`) with `ANY`, `ALL`, and negative `EXCLUDE` logic.
* **Anti-Spam Deduplication:** Database unique constraints ensure post IDs are never matched twice; author cooldowns prevent repeatedly messaging the same user.

### 🤝 Outreach CRM & Human Review Gate
* **Lead Directory:** Segment creators and prospective buyers across relationship stages (`discovered` → `qualified` → `contacted` → `replied` → `converted`).
* **AI Creator Scout:** Autonomous agent explores Instagram or Twitter search/hashtags, reads bios, filters bots, and imports verified creator leads.
* **Safety Quotas:** Enforces hard daily post and cold DM limits per connected account with token-bucket pacing (`AccountThrottler`).

### 🎬 Action Recipe Studio
* **Zero-Token Automation:** Record deterministic browser sequences (Click, Upload, Next, Caption, Share) through an interactive canvas screencast stream.
* **Resilient Selector Fallbacks:** Generates multi-selector chains (`data-testid`, `aria-label`, semantic roles, text content) that survive social network UI updates.

---

## 🛠 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Backend** | Python 3.12, FastAPI, Pydantic v2, Pydantic AI, APScheduler, Cryptography (Fernet) |
| **Database** | PostgreSQL (Supabase / Supavisor pooler compatible), Async SQLAlchemy 2.0, Alembic |
| **Automation** | Playwright (Stealth Chromium), Chrome DevTools Protocol (CDP) |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router v7 |
| **State & Cache** | TanStack Query v5 (React Query), Context API |
| **Styling & Icons** | Custom Dither/Sky theme, Lucide Icons, Instrument Serif, Plus Jakarta Sans |
| **Testing** | Pytest, AnyIO, Httpx, StaticPool SQLite in-memory, Mypy, Ruff, Oxlint |

---

## 🚀 Getting Started

### Prerequisites
* **Python 3.12+** (managed via [`uv`](https://github.com/astral-sh/uv) recommended)
* **Node.js 20+** & **npm**
* **Chromium** (installed via Playwright)

### 1. Repository Setup
```bash
git clone https://github.com/your-username/growthcraft.git
cd growthcraft
```

### 2. Backend Installation & Environment Setup
```bash
cd backend

# Create virtual environment and install dependencies
uv sync

# Install Playwright browser binaries
uv run playwright install chromium

# Create your .env configuration
cp .env.example .env
```

Edit `backend/.env` with your API keys:
```env
ENVIRONMENT=development
DEBUG=true

# Database (Supabase or local PostgreSQL)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres

# Master Vault Encryption Key (Generate via: uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
SECRET_KEY=your-32-byte-base64-secret-key-here

# AI Model Gateways (At least one required)
OPENROUTER_API_KEY=sk-or-v1-...
FIREWORKS_API_KEY=fw-...
```

Start the backend server:
```bash
uv run uvicorn app.main:app --app-dir src --reload
```
API Documentation will be live at `http://127.0.0.1:8000/docs`.

### 3. Frontend Installation & Startup
```bash
cd ../frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
Open `http://localhost:5173` to launch the application workspace.

---

## 🧠 Supported AI Models

GrowthCraft includes dynamic model routing configured in `backend/src/app/core/agent_config.py`:

| Model ID | Provider | Context Window | Pricing (In / Out per 1M) | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter | **1,048,576** | **$0.00 / $0.00** | **Risk-free testing & background dry runs** |
| `accounts/fireworks/models/deepseek-v4p1-flash-1017` | Fireworks | **1,048,576** | **$0.30 / $1.20** | **552B MoE Flagship (Deep reasoning & actions)** |
| `accounts/fireworks/models/glm-5p3-flash` | Fireworks | **1,048,576** | **$0.15 / $0.50** | **Ultra-budget high-frequency tool calling** |
| `accounts/fireworks/models/minimax-m3p1-flash` | Fireworks | **1,000,000** | **$0.15 / $0.60** | **High-speed creative copywriting & hooks** |

---

## 🧪 Testing & Quality Assurance

The codebase enforces strict type safety and modular isolation across **253 automated tests**:

```bash
cd backend

# Run Linter & Formatter (0 warnings)
uv run ruff check src tests --fix

# Run Static Type Checker (Strict Mypy - 0 errors across 165 source files)
uv run mypy src tests

# Run Full Pytest Suite (In-memory transactional isolation)
uv run pytest -v
```

### Frontend Code Quality
```bash
cd frontend

# Run Oxlint (0 warnings, 0 errors across all React 19 components)
npx oxlint --fix

# Typecheck TypeScript build
npm run build
```

---

## 🔒 Security & Anti-Ban Architecture

1. **Zero Plaintext Secrets:** All API secrets, OAuth tokens, and session passwords are encrypted at rest with **AES-128 Fernet**. Public Pydantic schemas explicitly exclude sensitive database fields.
2. **Decoupled Database Transactions:** Long-running browser exploration sessions (e.g., live WebSocket screencasts or inbox scraping) borrow a short-lived DB connection to read metadata and immediately release it back to the connection pool. Results are batch-persisted in a fresh transaction upon completion, eliminating pool starvation.
3. **Account Throttling:** Background dispatchers acquire slots from an in-memory `AccountThrottler` (token bucket: 3-action burst limit, 1 token refilled per 60s, mandatory 30s minimum action spacing).

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.