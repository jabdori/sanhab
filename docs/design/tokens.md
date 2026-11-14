# 디자인 기준 (디자인 하네스)

**astryx 테마와 부품의 기본값을 따른다.** 우리 덮어쓰기 테마·CSS 규칙을 두지 않는다. 예외는 아래 "예외" 표에 근거와 함께만 둔다.
본보기는 astryx 템플릿이다(components.md의 "화면 ↔ 템플릿"). 부품의 props는 `npx astryx component <Name> --dense`, 레이아웃은 `npx astryx docs layout/<structure|scaffold|side-panels|responsive>`, 검토는 `npx astryx docs is-my-code-good`(app/web에서 `node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs …`).

## 테마
- `@astryxdesign/theme-neutral`을 **덮어쓰기 없이** 쓴다(미리 빌드한 `/built` + `theme.css`). `main.tsx`의 `<Theme theme={neutralTheme}>`와 `theme.css`의 `@import` 두 줄이 전부다.
- neutral인 까닭: 본보기 템플릿이 모두 neutral로 그려졌고, 흰 면 하나 · 검정 글자 · 검정 주 버튼이라 색이 의미에만 남는다.

## 면
- **흰 면 하나.** 본문 바탕은 흰색이다. 영역은 `Section`과 `Divider`, 표의 줄(row)로 나눈다. 바탕색을 바꿔 영역을 나누지 않는다.
- **Card는 숫자 타일(KPI)과 홀로 뜬 것(접속 카드, 대화 속 조치 카드)에만.** 영역마다 Card를 씌우지 않는다(astryx `layout/structure`의 Card soup 금지).
- 회색 면은 표의 **묶음 머리**(table-grouped의 group header)와 astryx 부품이 스스로 쓰는 곳(SegmentedControl, 메뉴의 고른 줄 등)뿐이다.

## 색 — 의미가 있을 때만
| 쓰는 곳 | 부품 | 색 |
|---|---|---|
| 줄의 주의 단계 | `StatusDot` | 정황이 걸림 → warning, 반려 · 재심사 → error, 그 밖 neutral |
| 상태 | `Badge` | 완료 쪽(승인 · 완료 · 인정 …) → success, 멈춤(보류 · 보완 · 재심사 · 미응답) → warning, 아님(반려 · 불일치 · 실패 · 오류 …) → error, 나머지(대기 · 접수 · 요청 …) → neutral |
| 정황 표시 | `Badge` warning + 깃발 아이콘 | 주의가 필요한 유일한 표시 |
| 그 밖의 표시(재검토 · 추인 · 종결 …) · 일치(종류와 비교 결과 모두) · 분류 | `Token` · `Badge` 기본 색 | **색 없음**. 비교가 어긋난 것(불일치 · 누락)만 error |
| 출처 표지 | 아이콘 + 보조 색 글자(`Link`) | 색 없음 |
| 규칙 버전 | 글자 | 색 없음 |
| 주 버튼 | `Button variant="primary"` | 테마의 검정, 조치 묶음마다 하나 |

- **기본 상태는 표지 없이**(astryx Badge: "Skip the badge for the default state; only highlight exceptions"): 대기 · 일치 · 접수(정황·소명의 출발 상태)는 Badge를 그리지 않는다(`ui/status.ts`의 `DEFAULT`, 그리는 곳은 `ui/Mark`의 `State` 하나). 상태 칸이 모두 기본 상태면 칸째 두지 않는다.
  - 예외: **결과 자체인 곳**(대사 영역의 `일치`)은 표지 대신 글자로 보인다 — 숨기면 시나리오의 결론이 화면에서 사라진다.
- 표시의 색: 주의(warning)는 `정황` 하나다. `가설`·재검토·추인 등은 색 없는 아이콘 Token.
- 한도 초과(합산 막대·`+초과` 표지)는 오류(error)다 — 승인권자가 바뀌는 사실이라 의미가 있는 색이다(`meter`·`fail`).
- 정황이 걸린 심사에 큰 경고 띠(Banner)를 두지 않는다: 머리 칩 `⚑ 정황`과 확인 창의 사유 필수로 충분하다(템플릿도 상세 머리에 경고 띠가 없다).
- 낱말 → 색의 대응은 `ui/status.ts` 한 곳에만 둔다. 다른 파일은 색 이름(`color="red"`, `variant="warning"` …)을 쓰지 않는다(`npm run lint`가 막는다).
- 나머지 글자는 검정(primary)과 보조(secondary) 둘뿐이다.

## 예외
| 예외 | 어디 | 근거 |
|---|---|---|
| 글꼴 Pretendard | `theme.css`의 `[data-astryx-theme]` | 테마의 글꼴에 한글 자형이 없다 |
| 근거 강조(노란 바탕 1.2초) | `theme.css`의 `.mark` | 보고의 사실(↗)이 가리킨 표의 줄을 보이는 기능. astryx Table에 줄 강조 상태가 없다 |

## 쓰는 법
- 위계는 부품으로 만든다: 화면 제목 `Heading 1`, 영역 제목 `Heading 2`(`ui/Region` = `Section` + 위 구분선), 보조는 `Text type="supporting"`·`color="secondary"`.
- 날짜는 `YYYY-MM-DD` 글자 한 꼴(고정폭 숫자). 금액은 오른쪽 정렬 · 천 단위 쉼표 · "원" 없음.
- 레이아웃은 `Layout`·`LayoutHeader`·`LayoutContent`·`LayoutPanel`과 `VStack`·`HStack`·`Grid`·`Section`·`Divider`. raw `div`·`span`으로 짜지 않는다.
- `#색`, 숫자가 든 직접 값(`w-[360px]`), `style=`은 `npm run lint`가 막는다. 예외: 템플릿에서 온 파일(첫 줄 `// astryx template: <id>`)은 템플릿의 스타일을 그대로 쓴다(components.md). 구조의 폭(대화 칸 380, 접속 카드 360)은 부품 props의 숫자로 둔다(astryx scaffold: 구조의 폭만 px).
- 비활성 · 표 여백 · 빈 영역은 astryx 부품의 기본 동작 그대로다. CSS로 덮지 않는다.

## 자리의 폭 (기준 1440 × 900, 최소 1280)
| 자리 | 폭 |
|---|---|
| 메뉴(SideNav) | 테마 기본. 1366 이하에서는 아이콘 줄로 접힌 채 시작(단추로 펼침) |
| 본문 | 나머지 |
| 오른쪽(AI 보고 + 대화) | 380(320–560 폭 조절), 언제나 열림 |
| 시연 서랍 | 360(Drawer, 뒤를 막지 않음) |
