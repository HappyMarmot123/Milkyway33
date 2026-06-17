### Frontend (Port: 3333) React + Vite

```bash
npm run dev
```

### Backend (Port: 8888) Python + FastAPI

```bash
cd backend
uv run uvicorn main:app --reload --port 8888
uv run python cli_chat.py
```

LLM 개발자라면 “모델을 호출해본다”에서 멈추지 말고, 아래 기능들을 직접 구현해보면 실력이 확 올라갑니다. 특히 제품형 LLM 앱을 만들 때 필요한 감각이 생겨요.
기본기
채팅 UI + 스트리밍 응답
토큰이 실시간으로 흘러나오는 UX, 중단 버튼, 재시도, 응답 복사까지.

대화 히스토리 관리
messages 배열 관리, system/user/assistant 역할 분리, 긴 대화 요약, context window 초과 처리.

프롬프트 템플릿 시스템
역할별 system prompt, 변수 주입, few-shot 예시, 버전 관리.

JSON/Structured Output
모델 응답을 JSON schema로 강제하고, 파싱 실패 시 자동 복구하는 흐름.

---

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
