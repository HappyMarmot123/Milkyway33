# Milkyway-33 기술 기능명세서

> 이 문서는 Milkyway-33의 현재 구현을 기능 단위로 설명한다.
> 목표는 개발자가 코드를 열기 전에 "이 기능이 왜 있고, 사용자가 어떻게 쓰며, 내부에서 어떤 데이터가 오가고, 어디를 고쳐야 하는지"를 이해하게 만드는 것이다.
> 앞으로 만들 RAG/Agent 기능은 [LLM 엔지니어링 로드맵](./LLM-ENGINEERING-ROADMAP.md)과 `project-docs/phases/`의 Phase별 기능명세서를 따른다.

---

## 1. 서비스 개요

Milkyway-33은 사용자가 브라우저에서 Gemini와 대화하는 채팅 앱이다. 사용자가 메시지를 입력하면 프론트엔드는 FastAPI 백엔드에 요청을 보내고, 백엔드는 Gemini 응답을 작은 조각으로 받아 다시 프론트엔드에 스트리밍한다.

이 앱의 가장 중요한 특징은 다음과 같다.

| 구분 | 설명 |
|---|---|
| 대화 저장 위치 | 서버가 아니라 사용자 브라우저 IndexedDB에 저장한다. |
| AI 호출 위치 | FastAPI 백엔드가 Gemini API를 호출한다. |
| 응답 전달 방식 | JSON 객체를 한 줄씩 보내는 NDJSON 스트림이다. 표준 SSE가 아니다. |
| 사용량 제한 | Upstash Redis로 IP 기준 쿨다운과 일일 제한을 관리한다. |
| 토큰 통계 | 브라우저 로컬 통계와 Redis 공유 통계를 따로 관리한다. |

현재 구현은 "일반 Gemini 채팅"이다. RAG 검색, 문서 citation, agent tool 실행은 아직 백엔드에 연결되어 있지 않다.

---

## 2. 전체 동작 흐름

사용자 입장에서 앱은 단순하다.

1. 사용자가 `/chat` 화면에서 메시지를 입력한다.
2. 화면은 즉시 사용자의 메시지를 대화 목록에 추가한다.
3. AI가 생각 중이면 로더를 보여준다.
4. AI 응답이 도착하는 동안 글자가 실시간으로 이어 붙는다.
5. 응답이 끝나면 assistant 메시지로 저장된다.
6. 토큰 사용량과 대화 제목이 필요하면 같이 갱신된다.

내부 흐름은 다음과 같다.

```text
사용자 입력
  -> ChatComposer
  -> useChat.sendMessage()
  -> Dexie에 user message 저장
  -> src/api/chat.ts의 streamChat()
  -> POST /api/v1/chat
  -> FastAPI rate limit 검사
  -> guardrail 검사
  -> Gemini stream 호출
  -> NDJSON 이벤트 수신
  -> currentResponse에 임시 응답 누적
  -> complete 이벤트에서 assistant message 저장
```

이 흐름에서 서버가 대화 본문을 저장하는 단계는 없다. 백엔드는 요청을 처리하고 스트리밍 응답을 내려준 뒤 끝난다.

---

## 3. 기능 1: 채팅 메시지 전송

### 3.1 기능 목적

사용자가 입력한 메시지를 Gemini에 보내고, Gemini의 답변을 끊기지 않는 스트리밍 응답으로 보여준다.

이 기능은 Milkyway-33의 핵심 기능이다. 다른 기능인 대화 저장, 토큰 사용량, rate limit, guardrail은 모두 채팅 전송 흐름 주변에서 동작한다.

### 3.2 사용자가 보는 동작

사용자는 채팅 입력창에 메시지를 입력하고 제출 버튼을 누른다. 제출 후에는 입력창이 잠시 비활성화되고, AI 상태가 다음 순서로 바뀐다.

| 상태 | 화면 의미 |
|---|---|
| `thinking` | 요청이 접수되어 AI 호출을 준비 중이다. |
| `generating` | Gemini 스트림이 열렸고 응답 생성을 시작했다. |
| `streaming` | 응답 텍스트가 조각 단위로 도착하고 있다. |
| `idle` | 응답이 끝났고 다시 입력할 수 있다. |

### 3.3 프론트엔드 처리

구현 위치:

- `src/components/chat/ChatComposer.tsx`
- `src/hooks/useChat.ts`
- `src/api/chat.ts`

`ChatComposer`는 입력 UI만 담당한다. 실제 전송 로직은 `useChat.sendMessage()`에 있다.

`sendMessage()`는 다음 순서로 동작한다.

1. 입력값이 비어 있으면 중단한다.
2. 이미 응답 중이면 중단한다.
3. 프론트 쿨다운이 활성화되어 있으면 오류 메시지를 보여주고 중단한다.
4. 현재 대화가 없으면 새 대화를 만든다.
5. 사용자 메시지를 Dexie에 저장한다.
6. 기존 메시지로 Gemini history를 만든다.
7. 백엔드에 스트리밍 요청을 보낸다.
8. 수신 이벤트에 따라 화면 상태를 바꾼다.
9. 완료 이벤트가 오면 assistant 메시지를 Dexie에 저장한다.

### 3.4 백엔드 처리

구현 위치:

- `backend/app/api/endpoints/chat.py`
- `backend/app/services/rate_limit.py`
- `backend/app/services/guardrail.py`
- `backend/app/services/gemini.py`

`POST /api/v1/chat`은 다음 순서로 처리된다.

1. `enforce_limits()`가 요청 가능 여부를 검사한다.
2. `guardrail_service.check_injection()`이 사용자 메시지를 검사한다.
3. `format_with_delimiters()`가 사용자 메시지를 삼중따옴표로 감싼다.
4. `gemini_service.generate_response_stream()`이 Gemini를 호출한다.
5. FastAPI가 `StreamingResponse`로 이벤트를 내려준다.

### 3.5 요청 데이터

프론트엔드가 백엔드로 보내는 body:

```json
{
  "message": "오늘 회의 내용을 요약해줘",
  "system_instruction": "답변은 한국어로 작성해줘",
  "history": [
    { "role": "user", "content": "이전 질문" },
    { "role": "model", "content": "이전 답변" }
  ]
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `message` | 예 | 현재 사용자가 입력한 메시지 |
| `system_instruction` | 아니오 | 사용자가 설정한 AI 행동 지침 |
| `history` | 아니오 | 이전 대화 일부. Gemini에는 `user`/`model` role로 전달된다. |

### 3.6 응답 데이터

백엔드는 JSON 객체를 한 줄씩 내려준다.

```text
{"status":"thinking","model":"gemini-2.5-flash"}
{"status":"generating"}
{"status":"streaming","chunk":"회의"}
{"status":"streaming","chunk":" 내용을"}
{"status":"complete","response":"회의 내용을 요약하면...","model_used":"gemini-2.5-flash"}
```

프론트엔드는 줄바꿈(`\n`) 기준으로 자르고 `JSON.parse()`한다.

### 3.7 예외 처리

| 상황 | 처리 |
|---|---|
| 메시지가 1000자를 넘음 | 백엔드가 HTTP 400을 반환한다. 프론트는 길이 확인 메시지를 보여준다. |
| prompt injection 패턴 감지 | 백엔드가 HTTP 403을 반환한다. 프론트는 보안 정책 차단 메시지를 보여준다. |
| 쿨다운 또는 일일 제한 초과 | 백엔드가 HTTP 429를 반환한다. 프론트는 방금 저장한 user message를 삭제한다. |
| Gemini 호출 실패 | 백엔드가 `error` 이벤트를 보낸다. 프론트는 user message를 유지하고 오류를 보여준다. |
| JSON 파싱 실패 | 프론트가 console warning만 남기고 다음 이벤트 처리를 계속한다. |

### 3.8 수정할 때 확인할 파일

| 변경하려는 것 | 확인할 파일 |
|---|---|
| 요청 body 필드 | `src/api/chat.ts`, `backend/app/schemas/chat.py`, `backend/app/api/endpoints/chat.py` |
| 스트리밍 이벤트 필드 | `backend/app/services/gemini.py`, `src/features/chat/types.ts`, `src/hooks/useChat.ts` |
| 응답 상태 추가 | `src/features/chat/types.ts`, `src/hooks/useChat.ts` |
| 오류 문구 | `src/hooks/useChat.ts`, `backend/app/services/gemini.py` |

---

## 4. 기능 2: 스트리밍 이벤트 수신

### 4.1 기능 목적

AI 답변 전체가 끝날 때까지 기다리지 않고, 도착한 텍스트 조각을 바로 화면에 보여준다.

사용자는 답변이 생성되는 과정을 실시간으로 볼 수 있고, 긴 답변에서도 앱이 멈춘 것처럼 보이지 않는다.

### 4.2 중요한 구현 사실

코드에는 SSE라는 주석과 `text/event-stream` media type이 있지만, 실제 payload는 표준 SSE가 아니다.

표준 SSE는 보통 다음처럼 온다.

```text
data: {"status":"streaming","chunk":"안녕"}
```

Milkyway-33은 다음처럼 온다.

```text
{"status":"streaming","chunk":"안녕"}
```

즉 프론트엔드는 SSE parser가 아니라 NDJSON parser를 사용한다.

### 4.3 이벤트 종류

| status | 언제 발생하나 | 프론트 동작 |
|---|---|---|
| `thinking` | 백엔드가 Gemini 호출을 시작하기 전 | 로딩 상태를 thinking으로 바꾼다. |
| `generating` | Gemini stream이 열린 직후 | 로딩 상태를 generating으로 바꾼다. |
| `streaming` | 텍스트 조각이 도착할 때마다 | `currentResponse`에 chunk를 이어 붙인다. |
| `complete` | 응답이 끝났을 때 | assistant 메시지를 저장하고 토큰 사용량을 누산한다. |
| `error` | Gemini 호출 중 오류가 났을 때 | 오류 메시지를 표시하고 입력 가능 상태로 돌아간다. |

### 4.4 complete 이벤트에 포함되는 메타데이터

`complete` 이벤트는 답변 본문 외에도 모델 실행 정보를 포함할 수 있다.

| 필드 | 설명 |
|---|---|
| `response` | 전체 응답 텍스트 |
| `model_used` | 실제 사용된 Gemini 모델명 |
| `thought` | Gemini가 제공한 thinking text가 있으면 저장 |
| `finish_reason` | 응답 종료 이유 |
| `safety_ratings` | Gemini safety rating |
| `usage_metadata` | 입력/출력/생각/캐시 토큰 수 |

프론트는 이 값을 `ChatMessage.metadata`로 저장한다.

---

## 5. 기능 3: 대화 저장과 대화 세션 관리

### 5.1 기능 목적

사용자가 브라우저를 새로고침하거나 페이지를 이동해도 이전 대화를 볼 수 있게 한다.

대화는 서버에 저장되지 않는다. 같은 사용자가 다른 브라우저나 다른 기기에서 접속하면 기존 대화가 보이지 않는다.

### 5.2 저장 위치

구현 위치:

- `src/lib/db.ts`
- `src/services/chatRepository.ts`
- `src/hooks/useChatStorage.ts`

DB 이름은 `MilkywayDB`다. Dexie가 IndexedDB 위에서 동작한다.

| Store | 저장 내용 |
|---|---|
| `conversations` | 대화 세션 목록 |
| `messages` | user/assistant 메시지 |
| `configs` | system instruction 설정 |
| `tokenUsage` | 브라우저 로컬 토큰 사용량 |
| `promptTemplates` | 프롬프트 템플릿 |

### 5.3 conversation 데이터

```ts
{
  id: "conv_...",
  title: "대화 제목",
  createdAt: Date,
  updatedAt: Date
}
```

대화는 최대 5개까지 만들 수 있다. 5개를 넘으면 새 대화를 만들지 않고 오류 메시지를 보여준다.

### 5.4 message 데이터

```ts
{
  id: "msg_...",
  conversationId: "conv_...",
  role: "user",
  content: "사용자 메시지",
  timestamp: Date,
  metadata: {}
}
```

assistant 메시지는 `complete` 이벤트가 온 뒤 저장된다. 스트리밍 중간 텍스트는 아직 메시지로 저장되지 않고 `currentResponse`에만 있다.

### 5.5 대화 제목 갱신

새 대화의 첫 메시지를 보내면 제목은 우선 사용자 메시지 앞 30자로 설정된다.

대화 메시지가 user/assistant 포함 총 6개가 되는 시점에는 `/api/v1/chat/summarize`를 호출해 더 자연스러운 제목으로 바꾼다.

제목 요약 endpoint는 최근 20개 메시지만 사용한다.

### 5.6 좋아요한 답변의 역할

assistant 메시지에 좋아요를 표시하면 `liked: true`, `pinned: true`로 저장된다.

좋아요한 assistant 메시지는 이후 Gemini history를 만들 때 더 오래 포함된다. 즉 단순 UI 표시가 아니라 "이 답변은 앞으로도 참고하라"는 기억 고정 기능에 가깝다.

---

## 6. 기능 4: 대화 history 구성

### 6.1 기능 목적

Gemini가 이전 대화를 참고할 수 있게 하되, 너무 많은 메시지를 보내 비용과 지연이 커지지 않게 제한한다.

### 6.2 구성 규칙

구현 위치:

- `src/lib/historyBuilder.ts`

규칙:

| 항목 | 값 |
|---|---|
| 최근 메시지 | 최대 20개 |
| 좋아요한 assistant 기반 고정 pair | 최대 10개 |
| 토큰 추정 | 문자 수 / 4 |
| 최대 history 크기 | 약 40,000 토큰 |

history 생성 과정:

1. assistant 메시지 중 `liked === true`인 항목을 찾는다.
2. 해당 assistant 바로 앞 user 메시지가 있으면 둘을 pair로 포함한다.
3. 나머지 메시지 중 최근 20개를 포함한다.
4. 중복을 제거한다.
5. 시간순으로 정렬한다.
6. 뒤에서부터 40,000 토큰 추정치 안에 들어오는 만큼만 남긴다.
7. Gemini role 형식으로 변환한다.

role 변환:

| 앱 내부 role | Gemini history role |
|---|---|
| `user` | `user` |
| `assistant` | `model` |

---

## 7. 기능 5: 프롬프트 설정과 템플릿

### 7.1 기능 목적

사용자가 AI의 답변 스타일이나 역할을 미리 지정할 수 있게 한다.

예를 들어 "항상 한국어로 답변해", "React 전문가처럼 답변해", "짧게 요약해" 같은 지시를 system instruction으로 저장한다.

### 7.2 system instruction 설정

구현 위치:

- `src/components/features/PromptConfigModal.tsx`
- `src/hooks/useChat.ts`
- `src/services/chatRepository.ts`

저장 흐름:

1. 사용자가 설정 모달을 연다.
2. system instruction을 입력한다.
3. 프론트가 1000자 제한을 검사한다.
4. 저장하면 Dexie `configs`에 `default_config`로 저장한다.
5. 다음 메시지부터 `/api/v1/chat` 요청의 `system_instruction`에 포함된다.

주의할 점:

- 프론트 UI는 system instruction을 1000자로 제한한다.
- 하지만 백엔드는 `system_instruction` 길이나 내용을 별도로 검사하지 않는다.
- 외부 클라이언트가 API를 직접 호출할 수 있는 구조로 확장한다면 백엔드 검증을 추가해야 한다.

### 7.3 프롬프트 템플릿

구현 위치:

- `src/services/promptTemplateRepository.ts`
- `src/hooks/usePromptTemplates.ts`
- `src/components/features/PromptTemplateSection.tsx`

템플릿은 자주 쓰는 system instruction을 저장하는 기능이다.

템플릿 데이터:

```ts
{
  id: "prompt_...",
  name: "React 리뷰어",
  description: "React 코드 리뷰용",
  systemInstruction: "너는 React 전문가야...",
  createdAt: Date,
  updatedAt: Date
}
```

템플릿을 적용하면 현재 채팅 설정의 system instruction이 해당 템플릿 내용으로 바뀐다. 템플릿 원본은 바뀌지 않는다.

---

## 8. 기능 6: 사용량 제한

### 8.1 기능 목적

무료 플랜과 API 비용을 보호하기 위해 사용자가 너무 자주 요청하지 못하게 한다.

제한은 두 겹이다.

| 제한 | 위치 | 목적 |
|---|---|---|
| 프론트 쿨다운 | localStorage | 사용자가 버튼을 연속 클릭하는 것을 막는다. |
| 백엔드 rate limit | Upstash Redis | 실제 API 요청을 IP 기준으로 제한한다. |

### 8.2 백엔드 제한

구현 위치:

- `backend/app/services/rate_limit.py`

현재 값:

| 제한 | 값 |
|---|---|
| 쿨다운 | 기본 30초 |
| 일일 제한 | 24시간 13회 |

백엔드는 `x-forwarded-for` 헤더의 첫 번째 IP를 client key로 사용한다. 헤더가 없으면 `request.client.host`를 사용한다.

### 8.3 프론트 제한

구현 위치:

- `src/features/chat/cooldownStore.ts`
- `src/components/chat/ChatComposer.tsx`

프론트는 요청을 보내기 직전에 localStorage에 다음 요청 가능 시간을 저장한다.

```text
milkyway_chat_cooldown_until
```

이 값 때문에 사용자는 응답이 끝난 직후에도 쿨다운이 끝나기 전까지 다시 제출할 수 없다.

### 8.4 일일 사용량 표시

구현 위치:

- `src/features/chat/dailyUsageStore.ts`
- `src/api/dailyUsage.ts`
- `src/api/chat.ts`

일일 사용량은 두 방식으로 갱신된다.

1. 채팅 화면이 열릴 때 `/api/v1/chat/daily-usage`를 호출한다.
2. `/api/v1/chat` 응답 header의 `X-Daily-Limit`, `X-Daily-Remaining`을 읽는다.

서버가 사용량을 알려주기 전에는 프론트 fallback 값이 보일 수 있다. 실제 제한값은 서버 응답을 받은 뒤 맞춰진다.

### 8.5 제한 초과 처리

| 상황 | 백엔드 응답 | 프론트 처리 |
|---|---|---|
| 쿨다운 초과 | HTTP 429 + `Retry-After: <초>` | 해당 초만큼 입력 비활성화, user message 삭제 |
| 일일 제한 초과 | HTTP 429 + `Retry-After: 86400` | 오늘 사용량 소진 메시지 표시, user message 삭제 |

`Retry-After: 86400`은 프론트가 일일 제한을 구분하는 기준이다. 이 값을 바꾸면 `src/api/chat.ts`의 분기도 같이 바꿔야 한다.

---

## 9. 기능 7: Guardrail 입력 검사

### 9.1 기능 목적

Gemini를 호출하기 전에 위험하거나 정책상 차단할 입력을 걸러낸다.

현재 guardrail은 정규식 기반의 기본 방어다. 완전한 보안 솔루션이 아니라, 명백한 prompt injection과 위험한 shell operator를 1차 차단하는 수준이다.

### 9.2 검사 대상

현재 백엔드는 `message`만 검사한다.

검사하지 않는 것:

- `system_instruction`
- `history`
- `/chat/summarize` 요청

이 점은 보안상 중요한 제한이다.

### 9.3 차단 조건

구현 위치:

- `backend/app/services/guardrail.py`

| 분류 | 차단 예시 |
|---|---|
| 길이 제한 | 1000자 초과 |
| instruction 무시 | `ignore previous instructions` |
| system prompt 탈취 | `system prompt` |
| jailbreak | `DAN mode`, `jailbreak` |
| 거부 회피 | `never refuse`, `do not apologize` |
| 권한 상승 | `developer mode`, `god mode`, `sudo` |
| 인코딩 공격 의도 | `decode`, `base64`, `hex string` |
| shell operator | `||`, `&&`, `$(` |

### 9.4 delimiter wrapping

검사를 통과한 사용자 메시지는 Gemini에 보내기 전에 다음처럼 감싼다.

```text
"""
사용자 메시지
"""
```

목적은 사용자 입력을 "명령"이 아니라 "데이터"처럼 다루게 하는 것이다.

---

## 10. 기능 8: 토큰 사용량과 모델 정보

### 10.1 기능 목적

AI 호출이 얼마나 많은 토큰을 사용했는지 보여주고, 현재 사용 중인 Gemini 모델의 제한 정보를 확인한다.

### 10.2 로컬 토큰 사용량

로컬 토큰 사용량은 사용자 브라우저 Dexie에 저장된다.

구현 위치:

- `src/services/chatRepository.ts`
- `src/lib/db.ts`

저장 key:

| key | 의미 |
|---|---|
| `total_usage` | 현재 브라우저 전체 누산 |
| `model_usage:{modelId}` | 모델별 누산 |

이 값은 현재 브라우저에서만 의미가 있다. 다른 기기와 공유되지 않는다.

### 10.3 공유 토큰 사용량

공유 토큰 사용량은 Upstash Redis에 저장된다.

구현 위치:

- `backend/app/services/token_usage.py`

Redis Hash key:

```text
shared:token_usage
```

누산 필드:

| 필드 | 의미 |
|---|---|
| `total_tokens` | 전체 토큰 |
| `prompt_tokens` | 입력 토큰 |
| `candidates_tokens` | 출력 토큰 |
| `thoughts_tokens` | thinking 토큰 |
| `cached_tokens` | cache 처리된 토큰 |
| `request_count` | usage metadata가 있는 요청 수 |

이 통계는 전체 사용자 합산이다. 개인 사용량으로 설명하면 안 된다.

### 10.4 모델 정보

`GET /api/v1/chat/model-info`는 Gemini API에서 현재 모델 정보를 조회한다.

반환 정보:

| 필드 | 설명 |
|---|---|
| `model_id` | 현재 설정된 모델명 |
| `display_name` | Gemini API가 반환한 표시 이름 |
| `input_token_limit` | 입력 토큰 제한 |
| `output_token_limit` | 출력 토큰 제한 |

백엔드는 모델 정보를 한 번 조회하면 `gemini_service._model_info`에 캐시한다.

---

## 11. 기능 9: 설정 화면

### 11.1 기능 목적

사용자가 토큰 사용량, 모델 정보, 프롬프트 템플릿, 일부 설정 UI를 한 화면에서 볼 수 있게 한다.

구현 위치:

- `src/pages/SettingsPage.tsx`
- `src/components/features/SettingsPanel.tsx`

### 11.2 표시 항목

| 섹션 | 데이터 출처 |
|---|---|
| 토큰 사용량 | `/api/v1/chat/token-usage` |
| AI 모델 | `/api/v1/chat/model-info` |
| 프롬프트 템플릿 | Dexie `promptTemplates` |
| 오류 테스트 | 프론트 error modal 테스트용 |

토큰 사용량은 30초마다 다시 불러온다.

현재 모델 카드에는 고정 문구가 일부 있다. 실제 모델 기본값은 `backend/app/core/config.py`의 `GEMINI_MODEL_NAME`을 따른다. 모델을 바꾸면 설정 화면 문구도 같이 확인해야 한다.

---

## 12. 배포 구조

### 12.1 기능 목적

프론트엔드는 정적 파일로 배포하고, 백엔드는 Vercel Python serverless function으로 실행한다.

### 12.2 구성 파일

| 파일 | 역할 |
|---|---|
| `vercel.json` | build command, output directory, API rewrite, function 설정 |
| `api/index.py` | Vercel이 실행하는 Python entrypoint |
| `backend/main.py` | 실제 FastAPI app |

### 12.3 요청 경로

배포 환경에서 `/api/v1/chat` 요청은 다음 순서로 처리된다.

```text
/api/v1/chat
  -> vercel.json rewrite
  -> api/index.py
  -> backend/main.py의 FastAPI app
  -> /api/v1 prefix가 붙은 chat.router
```

프론트 라우트는 SPA fallback으로 `/index.html`에 연결된다.

### 12.4 서버리스 제약

Vercel function의 `maxDuration`은 60초다.

따라서 다음 작업은 채팅 요청 안에서 실행하면 안 된다.

- 웹 크롤링
- 대량 문서 정제
- 대량 embedding
- 긴 agent 작업
- 장시간 파일 처리

이런 기능은 Phase 0처럼 CLI나 별도 batch job으로 분리해야 한다.

---

## 13. 현재 미구현 기능과 Phase 연결

현재 코드에는 UI 프리미티브만 있고 백엔드 기능이 없는 영역이 있다.

| 영역 | 현재 상태 | 연결 문서 |
|---|---|---|
| RAG source card | `ai-elements/sources.tsx` 존재, 데이터 연결 없음 | Phase 1 |
| inline citation | UI 컴포넌트 존재, 답변 citation 연결 없음 | Phase 1 |
| plan/task UI | 컴포넌트 존재, planner 백엔드 없음 | Phase 3 |
| tool UI | 컴포넌트 존재, tool execution 없음 | Phase 3 |
| confirmation UI | 컴포넌트 존재, HITL 승인 흐름 없음 | Phase 3 |
| trace/playground | 일부 설정/통계 기반만 있음 | Phase 5 |

즉 "컴포넌트 파일이 있다"는 것과 "기능이 구현됐다"는 것은 다르다. Phase 문서에서는 이 UI를 어떤 백엔드 event와 연결할지 별도로 정의해야 한다.

---

## 14. 기능 변경 시 영향 범위

### 14.1 스트리밍 이벤트를 바꿀 때

확인 파일:

- `backend/app/services/gemini.py`
- `src/api/chat.ts`
- `src/features/chat/types.ts`
- `src/hooks/useChat.ts`
- `src/components/chat/StreamingPreview.tsx`

예를 들어 `sources` 이벤트를 추가하려면 단순히 백엔드에서 이벤트를 보내는 것만으로는 부족하다. 프론트 타입에 status를 추가하고, `useChat()`에서 해당 이벤트를 받아 저장하거나 화면에 넘기는 로직이 필요하다.

### 14.2 저장 데이터를 바꿀 때

확인 파일:

- `src/lib/db.ts`
- `src/features/chat/types.ts`
- `src/services/chatRepository.ts`
- `src/hooks/useChatStorage.ts`

Dexie schema를 바꾸면 기존 사용자의 IndexedDB가 이미 존재한다는 점을 고려해야 한다. 필드를 추가하는 정도는 metadata 객체 확장으로 끝날 수 있지만, store나 index를 바꾸면 version migration이 필요하다.

### 14.3 rate limit 값을 바꿀 때

확인 위치:

- `backend/app/services/rate_limit.py`
- `backend/app/core/config.py`
- `src/features/chat/cooldownStore.ts`
- `src/features/chat/dailyUsageStore.ts`
- `src/components/chat/ChatComposer.tsx`

프론트와 백엔드 제한이 다르면 사용자는 "버튼은 눌리는데 서버가 거절"하거나 "서버는 허용하는데 UI가 막는" 상태를 겪는다.

### 14.4 모델을 바꿀 때

확인 위치:

- `backend/app/core/config.py`
- Vercel 환경변수 `GEMINI_MODEL_NAME`
- `src/components/features/SettingsPanel.tsx`
- `src/components/chat/ChatComposer.tsx`
- 문서의 모델명 설명

현재 코드 기준 기본 모델은 `gemini-2.5-flash`다.

---

## 15. 핵심 파일 위치

### 15.1 프론트엔드

| 파일 | 역할 |
|---|---|
| `src/App.tsx` | 라우팅 구성 |
| `src/components/ChatBot.tsx` | 채팅 화면 조립 |
| `src/components/chat/ChatComposer.tsx` | 입력창, 제출, 쿨다운/일일 사용량 표시 |
| `src/components/chat/MessageList.tsx` | 저장된 메시지 목록 |
| `src/components/chat/StreamingPreview.tsx` | 저장 전 스트리밍 응답 |
| `src/hooks/useChat.ts` | 채팅 상태 머신 |
| `src/api/chat.ts` | 스트리밍 API client |
| `src/features/chat/types.ts` | 메시지, 이벤트, metadata 타입 |
| `src/lib/historyBuilder.ts` | Gemini history 구성 |
| `src/lib/db.ts` | Dexie schema |
| `src/services/chatRepository.ts` | Dexie 저장/조회 함수 |
| `src/features/chat/cooldownStore.ts` | 프론트 쿨다운 store |
| `src/features/chat/dailyUsageStore.ts` | 일일 사용량 store |

### 15.2 백엔드

| 파일 | 역할 |
|---|---|
| `backend/main.py` | FastAPI app, CORS, router mount |
| `backend/app/api/endpoints/chat.py` | chat endpoint |
| `backend/app/schemas/chat.py` | Pydantic schema |
| `backend/app/services/gemini.py` | Gemini streaming |
| `backend/app/services/guardrail.py` | 입력 검사 |
| `backend/app/services/rate_limit.py` | Redis rate limit |
| `backend/app/services/token_usage.py` | Redis 공유 토큰 누산 |
| `backend/app/core/config.py` | 환경변수 설정 |
| `api/index.py` | Vercel Python entrypoint |
| `vercel.json` | Vercel build/rewrite/function 설정 |

---

## 16. 수정 전 체크리스트

- [ ] 이 기능이 사용자가 보는 기능인지, 내부 운영 기능인지 구분했는가?
- [ ] 요청 데이터와 응답 데이터가 어디에서 생성되고 어디에서 소비되는지 확인했는가?
- [ ] 프론트 타입과 백엔드 이벤트 필드가 같은 이름을 쓰는가?
- [ ] 백엔드가 저장하지 않는 데이터를 서버 저장 데이터처럼 설명하지 않았는가?
- [ ] Redis 공유 통계와 Dexie 로컬 통계를 혼동하지 않았는가?
- [ ] 새 상태값을 추가했다면 `useChat.ts` switch에서 처리했는가?
- [ ] Dexie schema 변경 시 기존 브라우저 데이터 migration을 검토했는가?
- [ ] rate limit 변경 시 프론트/백엔드 값을 같이 맞췄는가?
- [ ] RAG/Agent처럼 아직 미구현인 기능을 현재 구현처럼 표현하지 않았는가?
