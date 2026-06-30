# AGENTS.md

Guidance for Codex (and other coding agents) working in this repository.
Read this before making changes. Commands assume the repo root unless noted.

## What this is

**Milkyway-33** — a Gemini-powered chat app with a marketing landing page.

- **Frontend** (repo root): React 19 + Vite 7 + TypeScript, Tailwind v4, shadcn/ui
  (new-york style), React Router 7, Dexie (IndexedDB) for local persistence.
  Storybook 10 + Vitest (browser/Playwright) for component tests. UI copy is **Korean**.
- **Backend** (`backend/`): Python FastAPI + `google-genai` (Gemini). Streams chat
  responses and runs a prompt-injection **guardrail**.
- **Deploy**: Vercel. `api/index.py` wraps the FastAPI app as a serverless function;
  `vercel.json` rewrites `/api/*` to it and builds the frontend to `dist/`.

The frontend and backend are **separate apps in one repo** — different toolchains,
different package managers. Don't assume a root command touches the backend.

## Run / build / test

### Frontend (port 3333)
```bash
npm install          # first time
npm run dev          # vite dev server, http://localhost:3333 (proxies /api -> :8888)
npm run build        # vite build -> dist/   (NOTE: does NOT run tsc, see below)
npm run lint         # eslint . — this is the real gate
npm run preview      # serve the production build
npm run storybook    # component workbench on :6006
```

### Backend (port 8888)
Managed with `uv` (`pyproject.toml` + `uv.lock`). A committed `.venv/` also exists.
```bash
cd backend
uv run uvicorn main:app --reload --port 8888     # preferred (README)
# uv not installed? use the existing venv directly:
.venv/bin/uvicorn main:app --reload --port 8888
```
- Docs: http://localhost:8888/docs · chat endpoint: `POST /api/v1/chat`
- Requires `backend/.env` with `GOOGLE_API_KEY` and `GEMINI_MODEL_NAME`
  (defaults to `gemini-2.5-flash`). `.env` is gitignored — never commit it.

## Critical conventions & gotchas

1. **`tsc` is NOT clean and NOT part of the build.** The project has ~1270
   pre-existing type errors, mostly because `src/components/ui/**` and
   `src/components/ai-elements/**` are vendored shadcn/reactbits components authored
   in JS-style `.tsx` (no prop types → every prop infers as a required `any`).
   `npm run build` runs `vite build` only, with no typecheck. **Do not try to zero
   out the whole project's type errors.** Scope type work to the files you touch and
   verify with `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep <yourfile>`.

2. **Treat `src/components/ui/**` and `src/components/ai-elements/**` as vendored.**
   They're generated (shadcn `new-york`; reactbits registry in `components.json`).
   Prefer composing them over editing them. If you must type one to fix a consumer,
   annotate the props against **DOM element types** (`ComponentProps<"div">`) or the
   already-typed primitives (`Button`, Radix, `Streamdown`) — not against the other
   untyped wrappers, or you'll propagate broken inferred types.

3. **Lint is the gate, not types.** `eslint.config.js` is flat config; `no-explicit-any`
   is **off**, `no-unused-vars` is a **warning**. Keep `npm run lint` clean for files
   you change (no new unused imports — easy to leave behind when adding type imports).

4. **Path alias**: `@/` → `src/` (configured in both `vite.config.ts` and
   `tsconfig.app.json`). Use it; don't write long relative paths.

5. **Streaming protocol is newline-delimited JSON (NDJSON), not real SSE.** Despite the
   `# Server-Sent Events` comment in `chat.py`, the backend yields `json.dumps(...) + "\n"`
   and the client (`src/api/chat.ts`) splits on `\n` and `JSON.parse`s each line. Event
   shapes are typed in `src/features/chat/types.ts` (`ChatEvent`, statuses:
   `thinking | generating | streaming | complete | error`). Keep both sides in sync if
   you change the wire format.

6. **Guardrail**: `backend/app/services/guardrail.py` blocks injection patterns, dangerous
   shell chars, >1000-char inputs, refusal-suppression, etc. before calling Gemini. See
   `README.md` for the full list of blocked example prompts.

7. **UI text is Korean.** Match existing tone when adding user-facing strings.

## Architecture map

```
Frontend
  src/App.tsx                       routes: / (Landing), /chat, /settings, * (404)
  src/pages/                        page components (index.ts barrel)
  src/components/
    landing/                        one-page marketing sections (Navbar, PhysicsSection, ...)
    layout/                         AppLayout, Header, AppSidebar (sidebar shell for /chat,/settings)
    features/                       app-specific modals (ErrorModal, PromptConfigModal, ...)
    ChatBot.tsx                     main chat UI
    ai-elements/                    VENDORED chat primitives (Message, PromptInput, Reasoning, ...)
    ui/                             VENDORED shadcn primitives
  src/contexts/                     ChatContext (wraps useChat), ThemeContext
  src/hooks/useChat.ts              chat state machine (status, streaming, persistence)
  src/hooks/useChatStorage.ts       Dexie-backed live queries
  src/services/chatRepository.ts    persistence operations
  src/lib/db.ts                     Dexie schema (MilkywayDB: conversations, messages, configs, tokenUsage)
  src/api/chat.ts                   streamChat() NDJSON client; base = VITE_API_BASE_URL ?? '/api/v1'
  src/features/chat/types.ts        shared chat types (source of truth for wire shapes)

Backend (backend/)
  main.py                           FastAPI app, CORS (allows :3333), mounts router at /api/v1
  app/api/endpoints/chat.py         POST /chat -> guardrail -> StreamingResponse
  app/services/gemini.py            Gemini streaming, emits NDJSON events
  app/services/guardrail.py         injection / safety checks
  app/core/config.py                env-based settings
  app/schemas/chat.py               pydantic request/response models
  cli_chat.py                       terminal client hitting localhost:8888

Deploy
  api/index.py                      Vercel entry: adds backend/ to sys.path, re-exports FastAPI app
  vercel.json                       buildCommand=npm run build, rewrites /api/* -> /api/index
```

## Data flow (chat)

`ChatBot` → `useChatContext()` → `useChat()` → `streamChat()` (NDJSON over `/api/v1/chat`)
→ FastAPI `/chat` → guardrail → `gemini_service.generate_response_stream()`.
Messages/conversations/settings persist to **IndexedDB via Dexie** (`src/lib/db.ts`),
not to the backend — the backend is stateless.

## Before you finish a change

- `npm run lint` clean for touched files.
- If you changed typed code, spot-check `npx tsc --noEmit -p tsconfig.app.json` for
  **your** files only (the global count will still be large — that's expected).
- If you changed the chat wire format, update **both** `src/features/chat/types.ts`
  and `backend/app/services/gemini.py`.
- Don't commit `.env`, `dist/`, or `node_modules/`.
