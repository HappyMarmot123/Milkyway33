## Milkyway AI
LLM 개발자라면 “모델을 호출해본다”에서 멈추지 말고, 아래 기능들을 직접 구현해보면 실력이 확 올라갑니다. 특히 제품형 LLM 앱을 만들 때 필요한 감각이 생겨요.
기본기
채팅 UI + 스트리밍 응답
토큰이 실시간으로 흘러나오는 UX, 중단 버튼, 재시도, 응답 복사까지.

# 프론트랑 백의 분리
- 프론트랑 백을 분리하여 만들면 더 좋을 것 같습니다. (Repo 분리)
- 각각 README에 해당 기술스택과 환경변수 세팅방법 및 실행 방법, 프로젝트 구조 설명적어놓으면 좋을 것 같습니다.

## 기술 스택

### Frontend
- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4
- Radix UI / shadcn 컴포넌트
- TanStack Query
- Dexie (IndexedDB, 대화 로컬 저장)
- AI SDK (`ai`, `@ai-sdk/react`)

### Backend
- FastAPI
- Google Gemini API (`google-genai`)
- Upstash Redis (Rate Limiting)
- Server-Sent Events (SSE) 스트리밍

## 사전 요구 사항

| 항목 | 버전 |
|---|---|
| Node.js | 20 이상 권장 |
| Python | 3.9 이상 |
| uv | 최신 ([설치 가이드](https://docs.astral.sh/uv/getting-started/installation/)) |

`uv`가 없다면 아래 명령으로 설치할 수 있습니다.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 환경 변수 설정

`backend/.env` 파일을 생성하고 아래 값을 채워주세요.

```bash
# Google Gemini API (필수)
GOOGLE_API_KEY=your_google_api_key

# Gemini 모델명 (선택, 기본값: gemini-2.5-flash)
GEMINI_MODEL_NAME=gemini-2.5-flash

# 동일 사용자 연속 요청 쿨다운 (초 단위, 선택, 기본값: 30)
CHAT_COOLDOWN_SECONDS=30

# Rate Limiting용 Upstash Redis (둘 중 하나의 키 세트 필요)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
# 또는 Vercel KV 연동 시
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token
```

- `GOOGLE_API_KEY`는 [Google AI Studio](https://aistudio.google.com/apikey)에서 발급받을 수 있습니다.
- Upstash Redis 키가 없으면 Rate Limiting 기능이 비활성화된 채로 동작합니다(초기화 에러 처리).

## 설치 및 실행

### 1. 프론트엔드 (포트 3333)

```bash
npm install
npm run dev
```

### 2. 백엔드 (포트 8888)

```bash
cd backend
uv sync
uv run uvicorn main:app --reload --port 8888
```

`uv` 없이 pip로 실행하려면:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r ../requirements.txt
uvicorn main:app --reload --port 8888
```

### 3. 접속

| 서비스 | URL |
|---|---|
| 프론트엔드 | http://localhost:3333 |
| 백엔드 API 문서 (Swagger) | http://localhost:8888/docs |

> 백엔드는 CORS 설정상 `http://localhost:3333` 요청만 허용합니다. 포트를 변경하면 `backend/main.py`의 `allow_origins`도 함께 수정해야 합니다.

## 백엔드 단독 테스트 (CLI)

프론트엔드 없이 터미널에서 바로 채팅을 테스트할 수 있습니다.

```bash
cd backend
uv run python cli_chat.py
```

사용 가능한 Gemini 모델 목록을 확인하려면:

```bash
cd backend
uv run python list_models.py
```

## 주요 API 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/chat` | SSE 스트리밍 채팅 응답 |
| POST | `/api/v1/chat/summarize` | 대화 내용 한 줄 요약 |
| GET | `/api/v1/chat/daily-usage` | 클라이언트별 일일 사용량 조회 |
| GET | `/api/v1/chat/token-usage` | 전체 사용자 누적 토큰 사용량 |
| GET | `/api/v1/chat/model-info` | 현재 Gemini 모델 메타데이터 |

## 테스트 실행

```bash
cd backend
uv run pytest
```

## 프로젝트 구조

```
Milkyway33/
├── src/                          # 프론트엔드 (React + Vite)
│   ├── api/                      # 백엔드 API 호출 함수
│   ├── components/
│   │   ├── ai-elements/          # 채팅 UI 프리미티브 (메시지, 코드블록, reasoning 등)
│   │   ├── chat/                 # 채팅 입력창, 메시지 리스트
│   │   ├── features/             # 설정, 토큰 사용량, 즐겨찾기 등 기능 모듈
│   │   ├── landing/               # 랜딩 페이지
│   │   ├── layout/                # 앱 레이아웃, 사이드바, 헤더
│   │   └── ui/                    # shadcn/Radix 기반 공용 UI 컴포넌트
│   └── App.tsx
├── backend/                      # 백엔드 (FastAPI)
│   ├── app/
│   │   ├── api/endpoints/chat.py # 채팅 관련 라우터
│   │   ├── core/config.py        # 환경 설정
│   │   ├── schemas/chat.py       # Pydantic 스키마
│   │   └── services/
│   │       ├── gemini.py         # Gemini API 연동
│   │       ├── guardrail.py      # Prompt Injection 방어
│   │       ├── rate_limit.py     # Upstash 기반 Rate Limiting
│   │       └── token_usage.py    # 토큰 사용량 집계
│   ├── tests/                    # pytest 테스트
│   ├── cli_chat.py                # CLI 채팅 클라이언트
│   ├── list_models.py             # 사용 가능 모델 조회 스크립트
│   └── main.py                    # FastAPI 엔트리포인트
└── docs/                          # 기능별 설계/작업 문서
```

## 참고 문서

`docs/` 폴더에 기능별 상세 설계 및 작업 내역이 정리되어 있습니다.

- `prompt-template-system.md` — 프롬프트 템플릿 시스템
- `codex-tasks-backend.md` / `codex-tasks-frontend.md` — 백엔드/프론트엔드 작업 내역
- `codex-tasks-shared-token-usage.md` — 공유 토큰 사용량 기능
- `codex-tasks-settings-upgrade.md` — 설정 화면 개선
- `perf-rerender-refactor.md` — 리렌더링 성능 개선
- `qa-history-liked.md` — 대화 히스토리 / 좋아요 기능 QA




대화 히스토리 관리
messages 배열 관리, system/user/assistant 역할 분리, 긴 대화 요약, context window 초과 처리.

프롬프트 템플릿 시스템
역할별 system prompt, 변수 주입, few-shot 예시, 버전 관리.

JSON/Structured Output
모델 응답을 JSON schema로 강제하고, 파싱 실패 시 자동 복구하는 흐름.
---

## 아래의 내용들은 notion 통해 정리해놓으면 좋을 것 같고 진행도 같은 것을 만들어 어디까지 진행되고 있는지를 체크하면 좋을 것 같습니다. (태스크 보드 / 칸반 보드 같은 형태)
## https://www.notion.so/3851ceaca90f805b9e3ffbab7812adaf?source=copy_link
## 중요한 것은 혼자 개발하는 것이 아닌 협력을 한다는 것에 의미를 두어야합니다.
## 망해도 왜 그렇게 되었는지 어디서 망가졌는지에 대한 토론을 심도있게 해야합니다.
## master에 PR을 올릴경우 강제로 merge를 하지 못하게 규칙을 정해야할 것 같습니다.

RAG
문서 업로드 + 청킹
PDF/Markdown/HTML을 읽고 적절히 chunk로 나누기.

임베딩 + 벡터 검색
문서를 embedding해서 vector DB에 저장하고 query와 유사한 chunk 검색.

RAG 답변 생성
검색된 context를 넣어 답변하고, 출처 citation 붙이기.

Hybrid Search
벡터 검색 + 키워드 검색 조합. 실서비스에선 이게 꽤 중요합니다.

RAG 평가
답변 정확도, groundedness, hallucination, retrieval recall 측정.

Agent
ReAct 스타일 Agent
생각 → 도구 호출 → 관찰 → 다음 행동 루프 구현.

플래너/실행자 분리
planner가 작업 목록을 만들고 executor가 단계별 수행.

장기 작업 상태 관리
todo, plan, progress, 실패 복구, 이어서 실행하기.

Human-in-the-loop 승인
파일 삭제, 결제, 이메일 전송 같은 위험 행동 전에 사용자 승인 받기.

Multi-agent
researcher, coder, reviewer처럼 역할을 나눠 협업시키기.

제품 기능
비용 추적
요청별 토큰 수, 모델별 비용, 사용자별 사용량 기록.

Rate limit / quota
사용자별 하루 사용량 제한, 초과 시 graceful fallback.

모델 라우팅
쉬운 요청은 저렴한 모델, 어려운 요청은 강한 모델로 보내기.

캐싱
같은 질문/문서 검색/임베딩 결과를 캐싱해서 비용 줄이기.

대화 저장/검색
과거 대화 제목 자동 생성, 검색, 즐겨찾기, export.

안전성과 신뢰성
Prompt injection 방어
RAG 문서나 웹페이지가 “이전 지시 무시해”라고 해도 무시하게 설계.

PII/비밀정보 탐지
API key, 주민번호, 이메일, 전화번호 같은 민감정보 마스킹.

Moderation
사용자 입력과 모델 출력을 검사해서 정책 위반 대응.

응답 검증기
LLM이 낸 답을 별도 verifier가 검사하거나, 코드/SQL/JSON은 실행 전 검증.

실패 복구
timeout, rate limit, JSON parse error, tool failure 재시도 전략.

개발자 도구
Prompt playground
프롬프트, 모델, temperature, top_p를 바꿔가며 비교.

평가 데이터셋 관리
입력, 기대 출력, 채점 기준을 저장하고 회귀 테스트.

Trace viewer
모델 호출, tool call, retrieval 결과, token usage를 한 화면에서 보기.

A/B 테스트
프롬프트 v1/v2, 모델 A/B를 비교하고 승률 측정.

Fine-tuning 데이터 생성
좋은 대화 로그를 정제해서 학습 데이터 형태로 변환.
