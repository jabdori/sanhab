# 디자인 기준 (디자인 하네스)

**astryx 테마와 부품의 기본값을 따른다.** 우리 덮어쓰기 테마·CSS 규칙을 두지 않는다. 예외는 아래 "예외" 표에 근거와 함께만 둔다.
부품의 props는 `npx astryx component <Name> --dense`, 레이아웃은 `npx astryx docs layout/<scaffold|structure|side-panels|…>`, 검토는 `npx astryx docs is-my-code-good`(app/web에서 `node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs …`).

## 테마
- astryx가 배포하는 테마 하나를 **덮어쓰기 없이** 쓴다: `@astryxdesign/theme-stone`(미리 빌드한 `/built`와 `theme.css`). `main.tsx`의 `<Theme theme={stoneTheme}>`와 `theme.css`의 `@import`가 그 두 곳이다.
- 고른 근거: neutral · butter · chocolate · matcha · stone · gothic · y2k를 같은 화면(작업 · 심사 기록)에 적용해 견줬다. stone은 바탕(body) · muted · 카드 · 테두리의 단계가 갈려 면과 경계가 보이고, 중립 배지가 회색이라 상태 색(경고·오류)이 뜻을 가진다. 글자 크기가 콘솔 밀도에 맞는다.
- 테마를 바꿀 때는 이 두 줄만 바꾼다.

## 예외
| 예외 | 어디 | 근거 |
|---|---|---|
| 글꼴 Pretendard | `theme.css`의 `[data-astryx-theme]` | 테마의 글꼴(Figtree · Montserrat)에 한글 자형이 없다 |
| 근거 강조(노란 바탕 1.2초) | `theme.css`의 `.mark` | 보고의 사실(↗)이 가리킨 표의 줄을 보이는 기능. astryx Table에 줄 강조 상태가 없다 |

## 쓰는 법
- 위계·경계·강조는 **부품과 면**으로 만든다: 화면 제목 `Heading 1`, 영역 제목 `Heading 2`(영역은 `Card` — `ui/Region`), 숫자는 `Card` 타일, 보조는 `Text type="supporting"`·`color="secondary"`.
- 상태는 `Badge` 변형, 표시(정황 · 재검토 …)는 색과 아이콘이 있는 `Token`, 주의 단계는 `StatusDot`, 날짜는 `Timestamp`, 사람(역할)은 `Avatar`, 비율은 `ProgressBar`, 경고는 `Banner`, 빈 자리는 `EmptyState`. 낱말 → 변형의 대응은 `ui/status.ts` 한 곳.
- 비활성 · 표 여백 · 빈 영역은 astryx 부품의 기본 동작 그대로다. CSS로 덮지 않는다.
- 레이아웃은 `Layout`·`LayoutHeader`·`LayoutContent`·`LayoutPanel`과 `VStack`·`HStack`·`Grid`. raw `div`·`span`으로 짜지 않는다. 바탕을 가를 때만 Tailwind 다리의 `bg-body`를 쓴다(테마의 토큰).
- `#색`, 숫자가 든 직접 값(`w-[360px]`), `style=`은 `npm run lint`가 막는다. 구조의 폭(대화 칸 380, 접속 카드 360)은 부품 props의 숫자로 둔다(astryx scaffold: 구조의 폭만 px).
- 금액·계좌·날짜는 고정폭 숫자(`hasTabularNumbers`). 금액은 오른쪽 정렬, 천 단위 쉼표, "원"은 붙이지 않는다.

## 자리의 폭 (기준 1440 × 900, 최소 1280)
| 자리 | 폭 |
|---|---|
| 메뉴(SideNav) | 테마 기본. 1366 이하에서는 아이콘 줄로 접힌 채 시작(단추로 펼침) |
| 본문 | 나머지 |
| 오른쪽(AI 보고 + 대화) | 380(320–560 폭 조절), 언제나 열림 |
| 시연 서랍 | 360(Drawer) |
