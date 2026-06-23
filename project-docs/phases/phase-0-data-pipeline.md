# Phase 0 — 데이터 파이프라인 (크롤링부터 벡터 적재까지)

> 이 문서는 **AI 개발 입문자**가 처음부터 끝까지 따라 할 수 있도록 쓴 튜토리얼입니다.
> "왜 이걸 하는지" → "어떤 도구를 왜 고르는지" → "실제 명령어와 코드" → "자주 나는 에러"까지 순서대로 설명합니다.
> 모르는 단어가 나와도 그 자리에서 설명하니 위에서부터 차례로 읽으세요.

---

## 0. 이 단계가 도대체 뭘 하는 건가요?

우리가 만들 최종 기능은 **RAG**(Retrieval-Augmented Generation, 검색 증강 생성)입니다.
쉽게 말해 "AI가 대답하기 전에, 우리가 준비해 둔 문서 더미에서 관련 내용을 먼저 찾아보고, 그걸 근거로 답하게 하는 것"입니다.

그러려면 **AI가 검색할 수 있는 형태로 문서를 미리 가공해서 저장**해 둬야 합니다. 그 준비 작업 전체가 Phase 0이고, 흐름은 이렇습니다:

```
①크롤링        ②정제            ③청킹           ④임베딩            ⑤적재
웹에서 글을 → 쓰레기를 치우고 → 적당한 크기로 → 숫자 벡터로 바꿔 → 벡터 DB에
긁어온다     깨끗하게 만든다    잘게 자른다      (의미를 좌표화)   넣어둔다
```

비유하자면, **도서관을 만드는 일**입니다.
- 크롤링 = 책을 사 온다
- 정제 = 찢어지거나 더러운 페이지를 버린다
- 청킹 = 책을 "검색하기 좋은 챕터 단위"로 나눈다
- 임베딩 = 각 챕터에 "내용 좌표"를 매긴다 (비슷한 내용은 가까운 좌표)
- 적재 = 그 좌표대로 서가(벡터 DB)에 꽂는다

이렇게 해두면 나중에 사용자가 질문할 때 "질문의 좌표"와 가까운 챕터들을 순식간에 찾을 수 있습니다. 그게 Phase 1입니다.

> **중요한 제약**: 우리 백엔드는 Vercel 서버리스 함수입니다. 한 번 실행에 **최대 60초** 제한이 있어요. 크롤링·대량 임베딩처럼 오래 걸리는 작업은 이 함수 안에서 돌리면 안 됩니다.
> → 그래서 Phase 0은 **여러분의 컴퓨터(또는 별도 배치)에서 한 번 돌려서** 벡터 DB를 채워두는 "오프라인 작업"으로 만듭니다. 실시간 채팅(Vercel 함수)은 이미 채워진 DB를 읽기만 합니다.

---

## 1. 준비물과 폴더 구조

### 1-1. 새로 만들 폴더
지금 `backend/app/`은 "실시간으로 도는 코드"입니다. 파이프라인은 성격이 다르니 **`backend/pipeline/`** 폴더를 따로 만듭니다. 섞이면 나중에 Vercel 배포 용량만 커지고 헷갈립니다.

```
backend/
  app/            ← 기존: 실시간 채팅 (건드리지 않음)
  pipeline/       ← 새로 만듦: 오프라인 데이터 작업
    __init__.py
    crawl.py      # ① 크롤링
    clean.py      # ② 정제
    chunk.py      # ③ 청킹
    embed.py      # ④ 임베딩
    load.py       # ⑤ 적재
    run.py        # 위 5개를 순서대로 실행하는 메인
  data/           ← 중간 결과물 저장 (git에는 안 올림)
    bronze/       # 크롤링 원본
    silver/       # 정제된 것
    gold/         # 청킹까지 끝난 것
```

### 1-2. data 폴더는 git에 올리지 않기
크롤링 데이터는 용량이 크고 자주 바뀌니 git에 넣지 않습니다. `backend/.gitignore` 파일에 아래 줄을 추가하세요.
```
data/
```

---

## 2. 크롤링 — 웹에서 글 긁어오기

### 2-1. 크롤링이란?
**크롤링(crawling)** = 프로그램이 사람 대신 웹페이지를 열어서 그 안의 글(텍스트)을 자동으로 가져오는 것입니다.
브라우저로 페이지를 열면 사람은 글을 읽지만, 프로그램은 그 페이지의 **HTML 코드**를 받습니다. 우리는 그 HTML에서 광고·메뉴·버튼 같은 건 버리고 **본문 글자만** 뽑아내야 합니다.

### 2-2. 어떤 언어로 하나요? — Python을 씁니다 (왜인지 설명)
크롤링과 데이터 처리, AI는 **2024~2026년 현재 사실상 Python이 표준**입니다. 이유:
- 데이터/AI 라이브러리(크롤링, 임베딩, 벡터 DB 클라이언트)가 전부 Python에 가장 잘 갖춰져 있음
- 우리 백엔드도 이미 Python(FastAPI)이라 코드·환경을 공유할 수 있음
- JavaScript(Node.js)로도 가능하지만, 임베딩·정제·평가 라이브러리 생태계가 Python이 압도적

> 정리: **크롤링·전처리·임베딩은 Python**으로 하고, 화면(프론트)만 JavaScript(React)로 하는 게 현재 가장 흔한 조합입니다. 우리 프로젝트가 정확히 그 구조예요.

### 2-3. 크롤링 도구 — 페이지 종류에 따라 다릅니다
웹페이지는 크게 두 종류입니다. **어떤 종류냐에 따라 도구가 달라집니다.**

| 페이지 종류 | 설명 | 쓰는 도구 |
|---|---|---|
| **정적 페이지** | HTML에 글이 그대로 들어있음 (블로그, 문서, 위키 대부분) | `httpx` + `trafilatura` |
| **동적 페이지** | 처음엔 빈 껍데기고, JavaScript가 나중에 글을 채움 (요즘 SPA, 무한스크롤) | `Playwright` (진짜 브라우저를 띄움) |

**최근 트렌드 도구 정리** (입문자가 알아둘 것):
- **httpx**: 페이지 HTML을 받아오는 도구. 예전엔 `requests`를 많이 썼는데, httpx는 비동기(여러 페이지 동시에)도 되고 더 현대적이라 요즘 선호됩니다.
- **trafilatura**: HTML 덩어리에서 **본문만 똑똑하게 추출**해 주는 도구. 광고·메뉴·댓글을 알아서 걸러줍니다. 입문자에게 강력 추천. (대안: BeautifulSoup은 직접 태그를 골라야 해서 손이 많이 감)
- **Playwright**: 진짜 크롬 브라우저를 코드로 조종합니다. JavaScript로 그려지는 페이지를 사람처럼 기다렸다가 긁을 때 씁니다. (대안 Selenium보다 빠르고 설정이 쉬워 최근 표준)
- **Scrapy**: 수만 페이지를 대규모로 크롤링할 때 쓰는 프레임워크. 입문 단계에선 과합니다. **나중에** 규모가 커지면 고려.

→ **입문 추천 조합: 정적 페이지면 `httpx + trafilatura`, JS 페이지면 `Playwright`.** 아래 예제는 정적 페이지 기준입니다.

### 2-4. 설치
터미널에서 `backend` 폴더로 이동한 뒤:
```bash
cd backend
uv add httpx trafilatura          # 정적 페이지용
# JavaScript로 그려지는 페이지도 긁어야 하면 추가로:
uv add playwright
uv run playwright install chromium   # 브라우저 본체 다운로드
```
> `uv`는 이 프로젝트가 쓰는 파이썬 패키지 매니저입니다(`uv.lock`이 그 증거). `pip` 대신 `uv add`를 쓰면 됩니다.

### 2-5. 예의 지키기 (꼭 읽으세요)
크롤링은 남의 서버에 부담을 줍니다. 매너를 안 지키면 IP가 차단되거나 법적 문제가 될 수 있어요.
1. **robots.txt 확인**: `사이트주소/robots.txt`에 "크롤링 금지" 규칙이 있는지 봅니다.
2. **요청 간격 두기**: 한 페이지 긁고 0.5~1초 쉽니다. 폭격하면 안 됩니다.
3. **User-Agent 표시**: 내가 누군지 헤더에 적습니다.
4. **공개 데이터만**: 로그인 뒤 개인정보, 저작권 콘텐츠는 함부로 긁지 않습니다.

### 2-6. 실제 코드 — `pipeline/crawl.py` (한 줄씩 설명)
```python
import asyncio          # 여러 페이지를 동시에 처리하기 위한 비동기 도구
import hashlib          # URL을 고유 ID로 바꿀 때 사용 (해시)
import json             # 결과를 파일로 저장할 형식
from pathlib import Path

import httpx            # 페이지 HTML 받아오기
import trafilatura      # HTML에서 본문만 추출

BRONZE = Path("data/bronze")   # 크롤링 원본을 저장할 폴더

async def fetch_one(client: httpx.AsyncClient, url: str) -> None:
    """URL 하나를 긁어서 본문을 data/bronze/에 저장한다."""
    try:
        # 1) 페이지의 HTML을 받아온다. 20초 안에 응답 없으면 포기.
        resp = await client.get(
            url,
            headers={"User-Agent": "Milkyway33Bot/0.1 (학습용 크롤러)"},
            timeout=20,
            follow_redirects=True,   # 주소가 바뀌면 따라간다
        )
        resp.raise_for_status()      # 404, 500 같은 에러면 예외 발생

        # 2) HTML 덩어리에서 본문 텍스트만 뽑는다 (광고·메뉴 자동 제거)
        body = trafilatura.extract(resp.text) or ""
        if not body.strip():
            print(f"[빈 본문] {url}")
            return

        # 3) URL을 16자리 고유 ID로 만든다 (같은 URL은 항상 같은 ID → 중복 방지)
        doc_id = hashlib.sha256(url.encode()).hexdigest()[:16]

        # 4) JSON 파일로 저장. ensure_ascii=False 라야 한글이 안 깨진다.
        BRONZE.mkdir(parents=True, exist_ok=True)
        (BRONZE / f"{doc_id}.json").write_text(
            json.dumps({"id": doc_id, "url": url, "raw": body}, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"[성공] {url} ({len(body)}자)")

    except Exception as e:
        print(f"[실패] {url} -> {e}")

async def crawl(urls: list[str]) -> None:
    """여러 URL을 적당한 간격을 두고 크롤링한다."""
    async with httpx.AsyncClient() as client:
        for url in urls:
            await fetch_one(client, url)
            await asyncio.sleep(0.7)   # ← 예의: 0.7초 쉬기

# 단독 테스트용
if __name__ == "__main__":
    test_urls = [
        "https://ko.wikipedia.org/wiki/검색_증강_생성",
    ]
    asyncio.run(crawl(test_urls))
```
실행해보기:
```bash
cd backend
uv run python -m pipeline.crawl
```
→ `data/bronze/` 안에 `.json` 파일이 생기면 성공입니다. 열어서 `raw`에 본문이 들어있는지 확인하세요.

> **JS 페이지(Playwright) 버전이 필요하면** `httpx.get` 대신 아래처럼:
> ```python
> from playwright.async_api import async_playwright
> async with async_playwright() as p:
>     browser = await p.chromium.launch()
>     page = await browser.new_page()
>     await page.goto(url, wait_until="networkidle")  # JS 다 그려질 때까지 대기
>     html = await page.content()
>     body = trafilatura.extract(html)
> ```

---

## 3. Qdrant 벡터 DB 세팅 — 처음부터

크롤링한 글을 나중에 "의미로 검색"하려면 벡터 DB가 필요합니다. 우리는 **Qdrant**를 씁니다.
세팅 방법은 두 가지입니다. **둘 다 설명**하니 상황에 맞게 고르세요.

### 3-1. 벡터 DB가 뭔가요?
일반 DB(예: 엑셀, MySQL)는 "정확히 일치하는 값"을 찾습니다. `이름 = "홍길동"` 같은 식이죠.
벡터 DB는 **"의미가 비슷한 것"**을 찾습니다. "강아지"로 검색하면 "반려견", "puppy" 같은 글도 찾아줍니다.
이게 가능한 이유는 글을 **숫자 벡터(좌표)**로 바꿔 저장하고, 좌표가 가까운 걸 찾기 때문입니다(=임베딩, 4번에서 설명).

용어 정리:
- **컬렉션(collection)**: 일반 DB의 "테이블"에 해당. 우리는 `milkyway_docs`라는 컬렉션을 만들 겁니다.
- **포인트(point)**: 일반 DB의 "행(row)" 하나. `{ id, 벡터, payload }` 로 구성.
- **payload**: 벡터에 딸린 부가정보(원문 텍스트, 출처 URL 등). 검색 후 사람에게 보여줄 내용.
- **차원(dimension)**: 벡터 숫자의 개수. 임베딩 모델이 정합니다(우리가 쓸 모델은 768).
- **거리(distance)**: 두 벡터가 얼마나 가까운지 재는 방법. 우리는 **Cosine(코사인)**을 씁니다.

### 3-2. [방법 A] 로컬에서 Docker로 띄우기 — 개발·연습용
인터넷 가입 없이 내 컴퓨터에서 바로 띄우는 방법입니다. **Docker Desktop이 설치돼 있어야** 합니다.
```bash
# Qdrant를 내 컴퓨터 6333 포트에 띄운다 (데이터는 ./qdrant_storage에 보관)
docker run -p 6333:6333 -p 6334:6334 -v ${PWD}/qdrant_storage:/qdrant/storage qdrant/qdrant
```
- 브라우저에서 `http://localhost:6333/dashboard` 를 열면 Qdrant 관리 화면이 보입니다.
- 이 경우 연결 주소는 `http://localhost:6333`, API 키는 필요 없습니다(빈 값).
- 장점: 빠르고 무료, 인터넷 불필요. 단점: 내 컴퓨터 끄면 멈춤 → **실제 Vercel 배포에선 못 씀.**

### 3-3. [방법 B] Qdrant Cloud 무료 클러스터 — 실배포용 (추천)
Vercel에 올린 앱이 항상 접속할 수 있으려면 클라우드에 떠 있어야 합니다. 무료 플랜으로 충분합니다.

**단계별로:**
1. https://cloud.qdrant.io 접속 → 이메일/구글로 **회원가입**.
2. 로그인 후 **"Create"** 또는 **"Clusters" → "Create Cluster"** 클릭.
3. **Free tier**(무료, 보통 1GB)를 선택. 지역(Region)은 가까운 곳(예: AWS Asia)으로.
4. 클러스터 이름 입력(예: `milkyway`) → 생성. 1~2분 기다리면 준비됨.
5. 클러스터가 만들어지면 **두 가지 정보**를 받습니다. 둘 다 복사해 두세요:
   - **Endpoint URL**: `https://xxxx-xxxx.aws.cloud.qdrant.io:6333` 형태
   - **API Key**: "API Keys" 메뉴에서 **Create** 눌러 발급 (한 번만 보이니 바로 복사!)

### 3-4. 연결 정보를 .env에 저장
발급받은 정보를 `backend/.env` 파일에 적습니다. (이 파일은 git에 올리지 않습니다)
```
# 방법 B (클라우드)를 쓸 때:
QDRANT_URL=https://xxxx-xxxx.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=여기에_발급받은_키

# 방법 A (로컬 Docker)를 쓸 때는:
# QDRANT_URL=http://localhost:6333
# QDRANT_API_KEY=        (비워둠)
```
그리고 우리 설정 파일 `backend/app/core/config.py`에 두 줄을 추가합니다(기존 `Settings` 클래스 안):
```python
    QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
    QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")   # 로컬이면 None이어도 됨
```

### 3-5. Qdrant 클라이언트 설치 + 연결 테스트
```bash
cd backend
uv add qdrant-client
```
연결이 잘 되는지 확인하는 작은 스크립트(`pipeline/check_qdrant.py`):
```python
from qdrant_client import QdrantClient
from app.core.config import settings

client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
    prefer_grpc=False,   # ★ 서버리스/클라우드에선 REST(HTTP)를 쓴다. gRPC는 연결 문제 잦음.
)

print("연결 성공! 현재 컬렉션 목록:", client.get_collections())
```
```bash
uv run python -m pipeline.check_qdrant
```
→ `연결 성공!`이 뜨면 DB 준비 끝입니다.

> **`prefer_grpc=False`를 반드시 기억하세요.** Qdrant는 gRPC와 REST 두 방식으로 통신하는데, Vercel 서버리스 함수는 수명이 짧아 gRPC 연결을 유지하기 어렵습니다. REST(HTTP)를 써야 안정적입니다.

---

## 4. 데이터 정제 — 쓰레기를 치운다 (아주 자세히)

크롤링한 원본(`data/bronze/`)에는 쓸데없는 게 섞여 있습니다. **"쓰레기를 넣으면 쓰레기가 나온다(Garbage In, Garbage Out)"** — 정제 품질이 RAG 품질의 상한선입니다.

정제는 보통 아래 6단계를 거칩니다. 하나씩 코드와 함께 봅니다.

### 4-1. 공백·특수문자 정리
연속된 공백, 줄바꿈 폭탄, 깨진 문자를 정리합니다.
```python
import re
import unicodedata

def normalize_text(text: str) -> str:
    # 1) 유니코드 정규화: 똑같아 보이는 다른 코드의 문자를 하나로 통일
    text = unicodedata.normalize("NFKC", text)
    # 2) 3줄 이상 연속 줄바꿈 → 2줄로
    text = re.sub(r"\n{3,}", "\n\n", text)
    # 3) 줄 끝 공백 제거
    text = re.sub(r"[ \t]+\n", "\n", text)
    # 4) 보이지 않는 제어문자 제거
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    return text.strip()
```

### 4-2. 보일러플레이트(반복 쓰레기) 제거
"이용약관", "쿠키 동의", "구독하세요" 같이 모든 페이지에 반복되는 문구나, 너무 짧은 줄을 버립니다.
```python
JUNK_LINES = ["쿠키", "구독", "저작권", "all rights reserved", "로그인", "회원가입"]

def drop_boilerplate(text: str) -> str:
    good_lines = []
    for line in text.split("\n"):
        s = line.strip()
        if len(s) < 2:                              # 너무 짧은 줄
            continue
        if any(j in s.lower() for j in JUNK_LINES): # 쓰레기 키워드 포함
            continue
        good_lines.append(s)
    return "\n".join(good_lines)
```
> `trafilatura`가 이미 광고/메뉴를 많이 걸러주지만, 사이트마다 남는 게 다르니 직접 본 뒤 `JUNK_LINES`를 채우세요.

### 4-3. PII(개인정보) 마스킹 — 정규식 설명 포함
**PII**(Personally Identifiable Information) = 이메일, 전화번호, 주민번호, API 키 같은 민감정보입니다. 이런 게 그대로 AI에 들어가면 유출 사고가 납니다. **정규식(regular expression)**으로 찾아서 가립니다.

정규식이 처음이면, "글자 패턴을 찾는 규칙"이라고 생각하세요. 예: `\d`는 숫자 하나, `\d{4}`는 숫자 4개.
```python
PII_PATTERNS = {
    # 이메일: 글자들 @ 글자들 . 글자들
    "email":    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
    # 한국 휴대폰: 010-1234-5678 등
    "phone_kr": re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}"),
    # 주민등록번호: 6자리-7자리(2번째 묶음 첫 숫자 1~4)
    "rrn":      re.compile(r"\d{6}[-\s]?[1-4]\d{6}"),
    # API 키 흔한 형태 (sk-..., AIza... 등)
    "api_key":  re.compile(r"(sk|pk|AIza)[A-Za-z0-9_\-]{16,}"),
}

def mask_pii(text: str) -> str:
    for label, pattern in PII_PATTERNS.items():
        # 찾은 부분을 [EMAIL], [PHONE_KR] 같은 표시로 바꾼다
        text = pattern.sub(f"[{label.upper()}]", text)
    return text
```
> **재사용 팁**: 이 `mask_pii`는 Phase 4(실시간 안전장치)에서 사용자 입력/AI 출력에도 그대로 씁니다. 그래서 나중엔 이 함수를 `backend/app/services/pii.py`로 옮겨 두면 양쪽에서 import 할 수 있습니다.

### 4-4. 언어·길이 필터
한국어 문서만 원하는데 영어/스팸이 섞였거나, 너무 짧아서 쓸모없는 문서를 거릅니다.
```python
def is_useful(text: str, min_len: int = 200) -> bool:
    if len(text) < min_len:          # 200자 미만은 버림
        return False
    # 한글 비율이 30% 이상인지 (한국어 문서만 원할 때)
    hangul = len(re.findall(r"[가-힣]", text))
    return hangul / max(1, len(text)) > 0.3
```

### 4-5. 중복 제거 — 왜, 어떻게 (MinHash 개념)
같은 내용이 여러 번 들어가면 검색 결과가 똑같은 걸로 도배되고 비용만 늡니다.
- **완전히 똑같은** 문서: 텍스트를 해시(지문)로 만들어 같은 지문이면 버립니다. 간단.
- **거의 비슷한**(한두 단어만 다른) 문서: 이건 해시로는 못 잡습니다. **MinHash + LSH**라는 기법을 씁니다.
  - 아이디어: 문서를 단어 집합으로 보고 "겹치는 정도(자카드 유사도)"를 빠르게 추정해서, 80% 이상 겹치면 중복으로 봅니다.
```bash
uv add datasketch    # MinHash 라이브러리
```
```python
from datasketch import MinHash, MinHashLSH

def deduplicate(docs: list[dict], threshold: float = 0.8) -> list[dict]:
    lsh = MinHashLSH(threshold=threshold, num_perm=128)
    kept = []
    for d in docs:
        m = MinHash(num_perm=128)
        for word in set(d["clean"].split()):   # 문서의 단어 집합
            m.update(word.encode("utf-8"))
        if not lsh.query(m):                    # 비슷한 게 아직 없으면
            lsh.insert(d["id"], m)              # 등록하고
            kept.append(d)                      # 살린다
        # 비슷한 게 이미 있으면 → 중복이므로 버린다
    return kept
```

### 4-6. 정제 전체 묶기 — `pipeline/clean.py`
```python
import json
from pathlib import Path

BRONZE = Path("data/bronze")
SILVER = Path("data/silver")

def clean_all() -> list[dict]:
    SILVER.mkdir(parents=True, exist_ok=True)
    docs = []
    for f in BRONZE.glob("*.json"):
        raw_doc = json.loads(f.read_text(encoding="utf-8"))
        # 1~4단계 적용
        text = normalize_text(raw_doc["raw"])
        text = drop_boilerplate(text)
        text = mask_pii(text)
        if not is_useful(text):
            continue
        raw_doc["clean"] = text
        docs.append(raw_doc)

    # 5단계: 중복 제거
    docs = deduplicate(docs)

    # silver에 저장
    for d in docs:
        (SILVER / f"{d['id']}.json").write_text(
            json.dumps(d, ensure_ascii=False), encoding="utf-8"
        )
    print(f"정제 완료: {len(docs)}개 문서 살아남음")
    return docs
```

---

## 5. 청킹 — 검색하기 좋은 크기로 자르기

### 5-1. 왜 자르나요?
문서 한 편이 통째로 너무 길면 두 가지 문제가 생깁니다.
1. 검색 정확도 저하: "질문과 관련된 한 문단"이 아니라 "관련 없는 부분까지 섞인 긴 글"이 잡힘.
2. AI 입력 한도 초과: AI에 넣을 수 있는 글 길이(토큰)에는 한계가 있음.

그래서 **적당한 크기(chunk)로 잘라서** 저장합니다. "검색의 최소 단위"를 만드는 작업입니다.

### 5-2. 토큰이 뭔가요?
**토큰(token)** = AI가 글을 세는 단위. 대략 영어는 단어 비슷, 한국어는 글자 1~2개가 1토큰쯤 됩니다. "512 토큰"이면 대략 한국어로 한두 문단 정도예요.

### 5-3. 크기와 오버랩
- **크기(size)**: 한 청크의 길이. 보통 300~800 토큰. 우리는 **512**로 시작.
- **오버랩(overlap)**: 청크끼리 앞뒤를 조금 겹치게 자릅니다(예: 80 토큰). 왜냐면 딱 잘린 경계에 중요한 문장이 걸치면 검색에서 놓치기 때문입니다. 겹쳐두면 안전합니다.

### 5-4. 코드 — `pipeline/chunk.py`
```python
def chunk_text(text: str, size: int = 512, overlap: int = 80) -> list[str]:
    """단어 기준으로 size 길이, overlap 만큼 겹치게 자른다."""
    words = text.split()          # 공백 기준 단어 분리(토큰 근사치)
    step = size - overlap         # 한 번에 앞으로 나아가는 칸 수
    chunks = []
    for i in range(0, len(words), step):
        piece = " ".join(words[i:i + size])
        if piece.strip():
            chunks.append(piece)
    return chunks

def to_gold(doc: dict) -> list[dict]:
    """문서 하나 → 청크 여러 개(메타데이터 포함)."""
    result = []
    for idx, chunk in enumerate(chunk_text(doc["clean"])):
        result.append({
            "id": f"{doc['id']}-{idx}",     # 문서ID-청크번호 (고유)
            "text": chunk,                  # 검색·표시할 본문
            "source_url": doc["url"],       # 출처 (나중에 citation에 사용)
            "chunk_index": idx,
        })
    return result
```
> 더 똑똑한 청킹: 문단·제목 경계에서 먼저 자르고 size로 보정하면 검색 품질이 올라갑니다. 코드 블록은 통째로 유지하세요. 입문 단계에선 위 단순 버전으로 충분합니다.

---

## 6. 임베딩 — 글을 "의미 좌표"로 바꾸기

### 6-1. 임베딩이 뭔가요?
**임베딩(embedding)** = 글을 **숫자 벡터(좌표)**로 바꾸는 것. 핵심은 **"의미가 비슷한 글은 좌표도 가깝게"** 나온다는 점입니다.
- "강아지" → `[0.21, -0.05, 0.88, ...]` (예: 768개 숫자)
- "반려견" → `[0.20, -0.04, 0.85, ...]` ← "강아지"와 좌표가 거의 같음
- "자동차" → `[-0.7, 0.3, 0.1, ...]` ← 멀리 떨어짐

이 좌표들을 벡터 DB에 넣어두면, 나중에 "질문의 좌표"와 가까운 글을 찾는 것만으로 의미 검색이 됩니다.

### 6-2. 어떤 임베딩 모델을 쓰나요?
우리는 이미 Gemini를 쓰고 있으니 **Gemini의 `text-embedding-004`**를 씁니다(무료 한도 넉넉, `GOOGLE_API_KEY` 재사용). 이 모델은 **768차원** 벡터를 만듭니다 → Qdrant 컬렉션도 768로 맞춰야 합니다(7번).

### 6-3. 코드 — `pipeline/embed.py`
```python
from google import genai
from app.core.config import settings

client = genai.Client(api_key=settings.GOOGLE_API_KEY)

def embed_texts(texts: list[str]) -> list[list[float]]:
    """여러 문장을 한 번에 임베딩한다. 반환: 각 문장의 768차원 벡터 리스트."""
    res = client.models.embed_content(
        model="text-embedding-004",
        contents=texts,
    )
    return [e.values for e in res.embeddings]
```
> 팁: 수천 개를 한 번에 보내면 에러가 납니다. 100개씩 잘라서(batch) 보내세요. 같은 문장을 또 임베딩하지 않도록 결과를 캐시해 두면 비용이 절약됩니다(Phase 4에서 다룸).

---

## 7. 적재 — 벡터 DB에 넣기

### 7-1. 컬렉션 만들기 (한 번만)
처음 한 번 `milkyway_docs` 컬렉션을 만듭니다. 차원은 768(임베딩 모델과 일치), 거리는 Cosine.
```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from app.core.config import settings

COLLECTION = "milkyway_docs"
client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY, prefer_grpc=False)

def ensure_collection(dim: int = 768) -> None:
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            COLLECTION,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )
        print(f"컬렉션 '{COLLECTION}' 생성 (차원 {dim}, 거리 Cosine)")
```
> **Cosine을 쓰는 이유**: 코사인 거리는 벡터의 "방향"만 봅니다. 문서 길이에 둔감해서 텍스트 검색에 잘 맞습니다. (Phase 1에서 검색할 때도 같은 Cosine을 써야 일관됩니다. 적재 거리와 검색 거리가 다르면 결과가 엉킵니다.)

### 7-2. 데이터 넣기 (upsert) — `pipeline/load.py`
**upsert** = "있으면 갱신, 없으면 삽입". id가 같으면 덮어써서 중복이 안 생깁니다.
```python
def upsert_chunks(golds: list[dict], vectors: list[list[float]]) -> None:
    points = [
        PointStruct(
            id=g["id"],                 # "문서ID-청크번호" → 재실행해도 같은 자리
            vector=vec,                 # 768차원 좌표
            payload={                   # 검색 후 사람에게 보여줄 부가정보
                "text": g["text"],
                "source_url": g["source_url"],
                "chunk_index": g["chunk_index"],
            },
        )
        for g, vec in zip(golds, vectors)
    ]
    client.upsert(COLLECTION, points)
    print(f"{len(points)}개 청크 적재 완료")
```

---

## 8. 전체 실행 — `pipeline/run.py`

지금까지 만든 ①~⑤를 순서대로 묶는 메인 파일입니다.
```python
import asyncio
from pathlib import Path
from pipeline.crawl import crawl
from pipeline.clean import clean_all
from pipeline.chunk import to_gold
from pipeline.embed import embed_texts
from pipeline.load import ensure_collection, upsert_chunks

def read_urls(path: str) -> list[str]:
    return [line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]

async def main(urls_file: str = "urls.txt"):
    # ① 크롤링
    await crawl(read_urls(urls_file))
    # ② 정제
    docs = clean_all()
    # ③ 청킹
    golds = [g for d in docs for g in to_gold(d)]
    print(f"총 청크 수: {len(golds)}")
    # ④ 임베딩 (100개씩 나눠서)
    ensure_collection(768)
    for i in range(0, len(golds), 100):
        batch = golds[i:i + 100]
        vectors = embed_texts([g["text"] for g in batch])
        # ⑤ 적재
        upsert_chunks(batch, vectors)

if __name__ == "__main__":
    asyncio.run(main())
```
실행:
```bash
cd backend
# urls.txt 파일에 크롤링할 주소를 한 줄에 하나씩 적어두고:
uv run python -m pipeline.run
```

---

## 9. 자주 나는 에러 & 해결 (Troubleshooting)

| 증상 | 원인 | 해결 |
|---|---|---|
| 한글이 `\uXXXX`로 깨져 저장됨 | `json.dumps` 기본값 | `ensure_ascii=False` 추가 |
| `trafilatura.extract`가 `None` | JS로 그려지는 페이지 | Playwright 버전 사용 |
| Qdrant 연결 타임아웃 | gRPC 사용/방화벽 | `prefer_grpc=False`, URL 끝 `:6333` 확인 |
| `Wrong vector size` 에러 | 컬렉션 차원 ≠ 임베딩 차원 | 둘 다 768로 통일 |
| 임베딩 호출 시 429 | 무료 한도 초과(분당 제한) | batch 크기 줄이고 `asyncio.sleep` 추가 |
| 같은 글이 검색에 여러 번 | 중복 제거 안 됨 | `deduplicate` 실행 확인, id를 결정적으로 |

---

## 10. 완료 체크리스트
- [ ] `data/bronze/`에 크롤링 원본 `.json`이 생겼고, 본문(`raw`)이 들어있다
- [ ] `data/silver/`에 정제본이 생겼고, PII가 `[EMAIL]` 등으로 가려졌다
- [ ] Qdrant 연결 테스트(`check_qdrant.py`)가 "연결 성공"을 출력한다
- [ ] `milkyway_docs` 컬렉션이 차원 768·거리 Cosine으로 만들어졌다
- [ ] 적재 후 `client.count("milkyway_docs")`가 청크 수와 일치한다
- [ ] 파이프라인을 두 번 돌려도 포인트 수가 늘지 않는다(멱등성 = id가 결정적이라는 증거)

## 다음 단계
이제 DB에 검색 가능한 임베딩이 쌓였습니다.
→ [Phase 1 — RAG 코어](./phase-1-rag-core.md): 이걸 실제로 검색해서, 출처가 달린 답변을 만들어 봅니다.
