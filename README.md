# Waseet AI Microservice (`waseet-ai-service`)

Enterprise-grade standalone AI microservice powering the **Waseet** freelance & marketplace platform, built with **Node.js 24, TypeScript, Fastify 5, Socket.IO, and Google Gemini APIs**.

## Key Architectural Pillars
- **20-Slot Isolated Gemini Project Pool (`src/router/`):** Concurrent round-robin routing across 20 independent project lanes (`project-pool.manager.ts`, `smart-router.ts`, `gemini-gateway.ts`) with automatic failover, quota tracking, and task-specific model selection.
- **Full End-to-End Platform Features (`src/features/`):**
  - **Client Project Creation (`client-projects/`):** Full-brief AI generation & enhancement (title, structured multi-paragraph description, skills, acceptance criteria, deliverables, duration, budget estimation, and 100%-balanced milestone breakdown), project health reviews, and text refinement.
  - **Provider Proposals (`proposals/`):** Context-aware technical proposal authoring, numbered execution plan generation, milestone synchronization matching client duration/budget, and pre-submission proposal quality auditing.
  - **Provider Specialties & Assessments (`assessments/`, `providers/`):** Portfolio accreditation drafting, profile bio & skill suggestions, and 15-question live technical assessments with deterministic server-side grading (`assessment-engine.service.ts`).
  - **Marketplace & Business Models (`marketplace/`, `business-models/`):** Real-timeSSE streaming service generator, automated 5-step quality/feasibility/risk inspection, and instant provider-project matching radar (`matching.service.ts`).
  - **Dispute Resolution & Support (`disputes/`, `help/`, `bebo/`, `avatar/`, `tts/`):** Evidence-backed dispute summaries, semantic RAG platform assistant, and low-latency Arabic dialect TTS with Cloud Storage shared audio caching.
- **Dynamic Vector Memory & Semantic Retrieval (`src/core/knowledge/`):** Persistent SQLite durable store (`durable-store.ts`), client memory store, and real-time project vector indexing (`project-vector-store.ts`, `semantic-index.ts`).
- **Security & Isolated Execution (`src/core/security/`, `workers/`):** Untrusted document extraction inside a network-blocked worker sandbox (`isolated-runner.mjs`), prompt-injection content inspector, and HMAC tenant authentication (`tenant-auth.service.ts`).

## Repository Structure
- `src/` ? Complete TypeScript source code (84 modules across `core`, `router`, `runtime`, `bridge`, and `features`).
- `tests/` ? 25 automated unit, integration, security, and latency test suites (`npm test`).
- `architecture/` ? Complete technical architecture specification (`ARCHITECTURE_IMPLEMENTATION_PLAN.md`), all 31 feature contracts (`FEATURE_CONTRACTS.md`), and verified technology notes.
- `docs/` ? Backend integration guides, shared Bebo backend documentation, and semantic retrieval specifications.
- `public/` ? Interactive API testing console and embedded Bebo/Nadeem assistant preview.
- `workers/` ? Isolated execution worker for untrusted document parsing.

## Quick Start
```bash
npm install
cp .env.example .env.local
npm run dev:local
```
Run the automated test suite:
```bash
npm test
```
