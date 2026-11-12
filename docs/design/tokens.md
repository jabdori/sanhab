# 디자인 기준 (디자인 하네스)

조용하고 밀도 있는 업무 도구(`docs/service-plan.md` S5·S6·U6·U8~U10). 바탕은 **astryx**(`@astryxdesign/core`, 테마 `theme-neutral`)이고 글꼴은 Pretendard다.
색·글자 크기·간격·모서리·그림자는 모두 astryx의 토큰이다. 이 문서는 그 위에서 **우리가 정하는 것만** 적는다. 부품의 props는 `npx astryx component <Name>`, 토큰은 `npx astryx docs tokens`(app/web에서 `node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs --dense …`).

## 어디에 있나
- `app/web/src/theme.ts`: 앱의 테마 `sanhab` — neutral을 `extends`로 이어받고 부품의 모양만 바꾼다(`defineTheme`의 `components`). 지금은 secondary 버튼과 토글 버튼을 흰 바탕 + 테두리로, destructive는 진한 적색 채움, Token은 채움 없는 테두리, Link는 본문 색 · 중간 굵기 · 옅은 밑줄. 부품의 모양을 바꿀 일이 생기면 여기에 더한다(CSS로 덮지 않는다).
- `app/web/src/theme.css`: CSS 층 순서, astryx·테마·Tailwind 다리, Pretendard, 자리의 폭, 빈 영역 접기, 근거 강조. **새 값은 여기에만** 둔다.
- 부품 안에서는 astryx 부품의 props(`variant`, `type`, `level` …)와 Tailwind 다리의 이름만 쓴다. 쓸 수 있는 이름: 색 `text-primary|secondary|disabled`, `bg-surface|body|muted|card`, `border-border`, 상태 `text-success|warning|error`, 간격 `p-*`·`gap-*`(4의 배수: 1=4px … 8=32px), 글자 `text-sm|base|lg`, `font-medium|semibold`, 모서리 `rounded-sm|md|lg|full`.
- `#색`, 숫자가 든 직접 값(`w-[360px]`), `style=`은 `npm run lint`가 막는다. Tailwind의 기본 팔레트(`bg-red-500`)는 들이지 않아 아예 없다.
- theme.css 아래쪽의 "옛 이름"(`text-text-sub`, `bg-good-bg`, `h-head` …)은 아직 옮기지 않은 화면을 위한 것이다. **새 코드는 쓰지 않는다.**

## 글자의 위계
위계는 크기·굵기·색으로 만든다. 이름표의 낱말을 늘려 위계를 만들지 않는다(`copy.md`).

| 등급 | 부품 | 크기 / 굵기 | 쓰임 |
|---|---|---|---|
| 화면 제목 | `ui/Title` (`Heading level={1}`) | 24 / 600 | 상세의 대상 이름. 한 화면에 하나. 옆에 귀속월(보조 색, 17)과 상태 표지 |
| 영역 제목 | `ui/Region` (`Heading level={3}`, 문서 구조는 h2) | 17 / 600 | 구성·관계·규정·정황·가설, 오른쪽의 조치·사유·보고·경위·이력 |
| 숫자 | `ui/Figures`의 값 (`Text type="large"`) | 17 / 600, 고정폭 | 판단의 재료(합산·한도·승인권자). 이름표는 그 위에 보조 |
| 본문 | `Text` (props 없음) | 14 / 400 | 문장, 값, 표의 칸 |
| 강조 | `Text weight="medium|semibold"` | 14 / 500·600 | 표의 이름 열, 결정의 낱말 |
| 보조 | `Text type="supporting"` 또는 `color="secondary"` | 12 / 400 · 14 회색 | 이름표, 식별자(D-011), 날짜·사람 |

- 본문을 회색으로 낮추거나 작게 줄이지 않는다. 낮출 것은 **보조**뿐이다(astryx layout/structure).
- 금액·계좌·날짜는 고정폭 숫자(`hasTabularNumbers` 또는 `tabular-nums`). 금액은 오른쪽 정렬, 천 단위 쉼표, "원"은 붙이지 않는다.

## 영역
영역은 **테두리 없이 간격으로** 나뉜다. 카드(Card)는 접속 화면처럼 홀로 떠 있는 것에만 쓴다(영역마다 카드를 씌우지 않는다).

| 자리 | 바탕 | 나누는 것 |
|---|---|---|
| 띠(TopNav) · 메뉴(SideNav) | 흰색 | 아래·오른쪽 선 |
| 목록 | 흰색 | 오른쪽 선. 안쪽 여백 24 |
| 가운데 머리(제목 + 숫자 줄) | 흰색 | 아래 선. 스크롤해도 위에 남는다 |
| 가운데 몸통(사실의 영역들) | 흰색 | 영역 사이 간격 32. 영역 안은 제목–내용 12 |
| 오른쪽(판단) | `bg-body`(옅은 회색) | 다섯 칸 사이 선. 칸의 여백 24 |

- 가운데(사실)는 흰색, 오른쪽(판단)은 회색이다. 자리의 바탕이 사실과 판단을 가른다.
- 표는 영역의 양옆 끝까지 줄을 긋는다(astryx Table의 bleed). 위아래로는 넘치지 않는다(theme.css).

## 상태 표지 → Badge 변형
| 갈래 | Badge `variant` | 화면 표기 |
|---|---|---|
| 대기 `wait` | `neutral` | 대기, 접수, 요청, 기각, 검토, 이체 |
| 좋음 `good` | `success` | 승인, 인정, 일치, 완료, 채택, 해소 |
| 멈춤 `hold` | `warning` | 보류, 보완, 미응답 |
| 아님 `bad` | `error` | 반려, 불인정, 불일치, 실패, 누락, 오류, 불채택, 거절의 낱말(권한, 사유, 상태, 대상) |
| 다시 `again` | `purple` | 재심사 |

- 부품은 `ui/Pill`(`<Pill tone="good">`). 색은 이 다섯뿐이고 항상 글자가 함께 있다.
- 덧표시(재검토, 정황, 추인, 거부, 종결, 정산)는 색 없는 아이콘 + 글자(`ui/Mark`). 출처 표지는 채움 없는 테두리 Token(`ui/Source`). 상태 표지(채운 알약)와 모양으로 갈린다. 셋은 모양이 다르다.
- 누를 수 있는 것: 주 버튼은 테마의 강조색(검정 채움), secondary는 흰 바탕 + 테두리, 이동(대상 열기)은 `Link`(옅은 밑줄, theme.ts). 따로 색을 정하지 않는다.
- 누를 수 없는 버튼(isDisabled)은 반투명 0.35(theme.css). 회색 칸 위에서도 누를 수 있는 것과 한눈에 갈린다.
- 근거 강조: 노란 바탕(`--color-background-yellow`)이 1.2초 동안 사라진다(theme.css `.mark`). 어두운 화면은 만들지 않는다.

## 간격
- 4의 배수만(astryx spacing). 묶을 때 좁게(4·8·12), 가를 때 넓게(24·32). 모든 간격을 같은 값으로 두지 않는다.
- 한 자리의 왼쪽 글자선은 하나다: 자리의 여백 24, 그 안의 표는 칸이 여백을 맡는다.
- 표의 칸은 줄을 바꾸지 않는다. 자리가 좁으면 그 표만 가로로 민다. 표의 밀도는 `compact` 하나.
- 숫자 줄의 항목(이름표 + 값)은 쪼개지지 않는다. 폭이 모자라면 항목 단위로 다음 줄로 넘어간다.

## 자리의 폭 (기준 1440 × 900, 최소 1280)
| 자리 | 폭 | theme.css |
|---|---|---|
| 띠 | astryx TopNav 높이 | |
| 메뉴 | 112 | `--spacing-menu` |
| 목록 | 상세가 닫혔을 때 나머지 전부, 열렸을 때 360, 소명·대화를 펼치면 40(접힘) | `--spacing-list` |
| 가운데(사실) | 나머지 | |
| 오른쪽(판단) | 360 | `--spacing-right` |
| 대화 | 접힘 40, 펼침 380 | `--spacing-chat`, `--spacing-chat-open` |
| 시연 서랍 | 360(겹쳐 뜬다) | |

## 움직임
- 강조는 1.2초 뒤 사라진다. 그 밖의 움직임은 astryx 부품의 것(서랍·창·말풍선)뿐이다.
