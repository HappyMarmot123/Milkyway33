# 에러 처리 Feat. Axios with TanStack Query 정리

## 한 줄 요약

Axios는 서버 에러 응답을 프론트엔드에서 쓰기 쉬운 에러 객체로 바꾸고, TanStack Query는 그 에러 객체를 `error` 상태로 관리한다.

## 글의 배경

프로젝트에서 API 요청 도구로 Axios를 사용하고, 서버 상태 관리를 위해 TanStack Query를 도입했다. 화면과 API 요청이 늘어나면 컴포넌트마다 `error.response.data.code` 같은 서버 응답 구조를 직접 파싱하는 방식은 반복이 많아진다.

그래서 공통 에러 처리를 다음처럼 나눈다.

- Axios: 서버 에러 응답을 정규화한다.
- TanStack Query: 정규화된 에러를 상태로 관리한다.
- Component: 에러 상태를 바탕으로 Toast, Modal, Form Error 같은 UI를 결정한다.

## Axios와 TanStack Query의 역할 분리

| 도구           | 담당 역할                                                               |
| -------------- | ----------------------------------------------------------------------- |
| Axios          | HTTP 요청 수행, 공통 header 설정, 요청/응답 interceptor 처리            |
| TanStack Query | 서버 상태 캐싱, loading/error 상태 관리, retry/refetch, invalidate 처리 |

두 도구를 함께 사용할 때 핵심은 에러 처리 책임을 한 곳에 몰아넣지 않는 것이다. Axios는 네트워크 요청 계층에서 서버 응답을 다루고, TanStack Query는 비동기 요청의 상태를 React 컴포넌트에 전달한다.

## 전체 흐름

```text
Backend Error Response
-> Axios Response Interceptor
-> Error Code 추출
-> Frontend Error 객체로 정규화
-> TanStack Query error 상태로 전달
-> Component UI 처리
```

이 구조를 쓰면 컴포넌트는 백엔드 에러 응답의 상세 구조를 몰라도 된다. 컴포넌트는 TanStack Query가 넘겨준 `error` 객체만 보고 필요한 UI 처리를 하면 된다.

## 백엔드 에러 응답 포맷

원문에서 사용하는 서버 에러 응답은 다음 구조다.

```json
{
  "success": false,
  "code": "PHOTO_CARD_NOT_FOUND",
  "message": "Photo card not found"
}
```

| 필드      | 의미                                   |
| --------- | -------------------------------------- |
| `success` | 요청 성공 여부                         |
| `code`    | 프론트엔드에서 에러를 식별하기 위한 값 |
| `message` | 개발 및 디버깅용 메시지                |

중요한 포인트는 사용자에게 보여줄 문구를 서버의 `message`에 직접 의존하지 않는다는 점이다. 프론트엔드는 `code`를 기준으로 사용자 메시지를 매핑한다.

예를 들어 서버가 `INSUFFICIENT_POINT`라는 코드를 내려주면, 프론트엔드는 이 코드를 보고 `"포인트가 부족합니다."` 같은 사용자 친화적인 메시지로 변환한다.

## Axios Interceptor에서 에러 정규화

각 컴포넌트에서 매번 서버 에러 구조에 접근하면 중복이 생긴다. 이를 막기 위해 Axios response interceptor에서 에러 객체를 한 번 가공한다.

핵심 로직은 다음과 같다.

```js
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = error.response?.data?.code;

    error.code = code;
    error.userMessage = getErrorMessage(code);

    return Promise.reject(error);
  },
);
```

이렇게 처리하면 API를 사용하는 쪽에서는 `error.response.data.code`가 아니라 `error.code`, `error.userMessage`처럼 프론트엔드에 맞게 정리된 값을 사용할 수 있다.

## TanStack Query에서 에러 상태 다루기

TanStack Query는 `queryFn`이나 `mutationFn`에서 에러가 발생하거나 rejected promise가 반환되면 이를 `error` 상태로 관리한다.

Axios는 HTTP 실패 응답을 rejected promise로 처리한다. 따라서 interceptor에서 에러를 가공한 뒤 `Promise.reject(error)`로 넘기면, TanStack Query는 그 에러 객체를 그대로 `error`에 담는다.

Query 예시:

```js
const { data, error, isError } = useQuery({
  queryKey: ["photoCards"],
  queryFn: getPhotoCards,
});

if (isError) {
  console.log(error.userMessage);
}
```

Mutation 예시:

```js
const mutation = useMutation({
  mutationFn: createPhotoCard,
  onError: (error) => {
    console.log(error.userMessage);
  },
});
```

이후 컴포넌트는 `error.userMessage`를 사용해 Toast, Modal, Form Error 등 화면에 맞는 방식을 선택하면 된다.

## 핵심 설계 포인트

### 1. 서버 메시지를 그대로 노출하지 않는다

서버의 `message`는 개발자 디버깅용으로 보고, 사용자에게 보여줄 메시지는 프론트엔드에서 `code` 기준으로 매핑한다. 이렇게 하면 문구 수정, 다국어 처리, UX 톤 조정이 쉬워진다.

### 2. 에러 응답 파싱은 Axios 계층에서 끝낸다

컴포넌트마다 서버 응답 구조를 알게 만들면 결합도가 높아진다. Axios interceptor에서 공통 변환을 수행하면 컴포넌트는 정규화된 에러만 다루면 된다.

### 3. TanStack Query에는 정규화된 에러를 전달한다

TanStack Query는 에러를 직접 가공하는 계층이라기보다, 비동기 요청의 상태를 관리하는 계층이다. 따라서 Axios에서 가공한 에러를 rejected promise로 넘기고, Query에서는 이를 `error` 상태로 받는 방식이 자연스럽다.

### 4. UI 처리는 컴포넌트의 책임으로 남긴다

같은 에러라도 화면에 따라 Toast, Modal, inline form message 등 표현 방식이 달라질 수 있다. 공통 계층에서는 에러의 의미를 정리하고, 실제 표현 방식은 컴포넌트가 선택한다.

## 역할별 정리

| 계층           | 해야 할 일                                           | 하지 않는 편이 좋은 일                    |
| -------------- | ---------------------------------------------------- | ----------------------------------------- |
| Backend        | 에러 코드와 디버깅 메시지 제공                       | 사용자 문구 UX까지 모두 책임지기          |
| Axios          | 에러 코드 추출, 사용자 메시지 매핑, 에러 객체 정규화 | 화면별 UI 처리                            |
| TanStack Query | loading/error 상태 관리, retry/refetch 처리          | 서버 응답 구조 직접 파싱                  |
| Component      | error 상태를 바탕으로 UI 표시                        | 매번 `error.response.data` 구조 직접 접근 |

## 최종 정리

이 글의 핵심은 에러 처리 책임을 계층별로 분리하는 것이다.

- Axios는 HTTP 요청 계층에서 서버 에러를 프론트엔드용 에러 객체로 정리한다.
- TanStack Query는 `queryFn`/`mutationFn`의 성공, 로딩, 실패 상태를 관리한다.
- 컴포넌트는 정규화된 `error` 객체를 받아 화면에 맞는 방식으로 보여준다.

결론적으로, Axios interceptor는 에러를 가공하는 계층이고 TanStack Query는 에러 상태를 관리하는 계층이다.
