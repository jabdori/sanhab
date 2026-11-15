# 디자인 기준 (디자인 하네스)

**astryx 테마와 부품의 기본값을 따른다.** 우리 덮어쓰기 테마·CSS 규칙을 두지 않는다. 예외는 아래 "예외" 표에 근거와 함께만 둔다.
본보기는 astryx 템플릿이다(components.md의 "화면 ↔ 템플릿"). 부품의 props는 `npx astryx component <Name> --dense`, 레이아웃은 `npx astryx docs layout/<structure|scaffold|side-panels|responsive>`, 검토는 `npx astryx docs is-my-code-good`(app/web에서 `node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs …`).

## 테마
- `@astryxdesign/theme-neutral`을 물려받은 `themes/sanhab.ts`(`main.tsx`의 `<Theme theme={sanhabTheme}>`). 흰 면 · 회색 글자 · 부품의 모양은 neutral 그대로이고, **강조 토큰 다섯 개**(`--color-accent` · `-accent-muted` · `--color-text-accent` · `--color-icon-accent` · `--color-on-accent`)만 neutral 팔레트의 blue(남색)로 바꾼다(유저 결정 2026-11-15, service-plan U9 "누를 수 있는 것은 남색").
- 까닭: neutral의 강조색은 검정(#1b1b1b)이라 주 버튼 · 링크 · 진행 막대 · 진행 중 점 · AI 표지가 모두 무채색이 되어 화면이 와이어프레임처럼 보였다. 색 값은 팔레트에서 고르고 지어내지 않는다.

## 면
- **흰 면 하나.** 본문 바탕은 흰색이다. 영역은 `Section`과 `Divider`, 표의 줄(row)로 나눈다. 바탕색을 바꿔 영역을 나누지 않는다.
- **Card는 숫자 타일(KPI)과 홀로 뜬 것(접속 카드, 대화 속 조치 카드)에만.** 영역마다 Card를 씌우지 않는다(astryx `layout/structure`의 Card soup 금지).
- 회색 면은 표의 **묶음 머리**(table-grouped의 group header)와 astryx 부품이 스스로 쓰는 곳(SegmentedControl, 메뉴의 고른 줄 등)뿐이다.

## 색 — 템플릿의 수준으로
본보기 템플릿(work-item-detail · table-grouped · ai-chat-landing · dashboard-progress · dashboard-alert-rail · incident-console)이 쓰는 만큼 쓴다: 상태 점 · 상태 Badge · 범주 라벨의 색 · 아이콘 색 · 완료 표지 · 진척 막대 · 눌리는 줄의 hover. 낱말 → 색의 대응은 `ui/status.ts` 한 곳(표지는 `ui/Mark`).

| 쓰는 곳 | 부품 | 색 |
|---|---|---|
| 상태 | `Badge`(머리 · 요약 · 표의 상태 칸), `StatusDot`(목록 줄) | 완료 쪽(승인 · 완료 · 인정 · 채택 · 해소 · 정산 · 추인 · 성공) → success, **진행 중**(요청 · 검토 · 진행 · 이체 — 사람 · AI · 은행이 움직이는 중) → 남색(StatusDot `accent`, Badge `blue`), 멈춤(보류 · 보완 · 재심사 · 미응답) → warning, 아님(반려 · 불채택 · 불인정 · 불일치 · 실패 · 오류 · 누락 · 거부) → error, 기본 상태(대기 · 일치 · 접수)는 표지 없음 |
| 줄의 주의 단계 | `StatusDot`(table-grouped 첫 칸) | 정황이 걸림 → warning, 반려 · 재심사 → error, 진행 중 → accent, 그 밖 neutral |
| 표시(범주) | 정황은 `Badge` warning + 깃발, 나머지는 `Token` 색(work-item-detail의 라벨 Token) | 재심사 · 재검토 → purple, 추인 → green, 가설 → orange, 종결 · 정산 · 거부 · 새 · 이탈 · 예시 → 기본 |
| 기록 종류 | `Icon color`(ai-chat-landing의 색 아이콘) — `ui/Mark`의 `Kind` | 심사 blue(문서 돋보기) · 정황 orange(깃발) · 소명 cyan(말풍선) · 지급 teal(지폐) · 추인 green(배지 체크) · 대리점 purple(상점) · 규정 gray(책). 작업 목록 묶음 머리 · 대리점/규정 목록 제목 · 기록 머리 메타 줄 맨 앞(아이콘 + 종류) |
| 결과 자리의 완료 | `Icon CheckCircle color=success`(dashboard-progress) — `ui/Mark`의 `Done` | 대사 결과 `일치`(영역 제목 옆 아이콘 + 글자, 표의 비교 칸 아이콘), 서류 비교 `일치`(아이콘) |
| 진척 | `ProgressBar` | 합산 대비 한도 → accent(남색), 넘으면 error(`meter`) |
| 출처 표지 · 규칙 버전 · 일치 종류(대표자 · 주소 · 계좌) | 아이콘 + 보조 글자, `Token` 기본 | 색 없음 |
| 주 버튼 · 링크 · AI 표지 | `Button primary` · `Link` · `Icon accent` | 테마의 강조색(남색). 주 버튼은 조치 묶음마다 하나 |

- **지킬 것**: AI가 쓴 글(보고의 사실 · 추정 · 미확인 · 의견 · 반론)에는 판단을 기울이는 색을 칠하지 않는다 — 글자는 기본 · 보조뿐. 채택 · 불채택 두 단추는 같은 등급(secondary). 결정 뒤의 `채택` · `불채택` Badge는 사람의 결정이라 상태 색을 따른다.
- **효과**: 눌리는 줄은 표의 `hasHover`(table-grouped), 눌리는 카드는 `ClickableCard`(hover · press가 부품에 있다). 떠 있는 카드(AI 보고)는 `elevation="med"`, 경위의 지금 칸은 `low`. 그 밖에는 그림자를 두지 않는다.
- **기본 상태는 표지 없이**(astryx Badge: "Skip the badge for the default state; only highlight exceptions"): 대기 · 일치 · 접수는 Badge를 그리지 않는다(`DEFAULT`). 상태 칸이 모두 기본 상태면 칸째 두지 않는다.
  - 예외: **결과 자체인 곳**(대사 영역의 `일치`)은 완료 표지(`Done`)로 보인다 — 숨기면 시나리오의 결론이 화면에서 사라진다.
- 한도 초과(합산 막대 · `+초과` 표지)는 오류(error)다 — 승인권자가 바뀌는 사실이다(`meter` · `fail`).
- 정황이 걸린 심사에 큰 경고 띠(Banner)를 두지 않는다: 머리 칩 `⚑ 정황`과 확인 창의 사유 필수로 충분하다(템플릿도 상세 머리에 경고 띠가 없다).
- 다른 파일은 색 이름(`color="red"`, `variant="warning"` …)을 쓰지 않고 `ui/status.ts`가 낸 값(`badge` · `tone` · `dot` · `mark` · `kind` · `done` · `fail` · `caution` · `meter`)을 넘긴다(`npm run lint`가 막는다). 테마의 강조색 `accent`는 낱말의 대응이 아니라 막지 않는다.
- 글자는 검정(primary)과 보조(secondary), 링크 · 강조 아이콘의 남색뿐이다.

## 예외
| 예외 | 어디 | 근거 |
|---|---|---|
| 글꼴 Pretendard | `theme.css`의 `[data-astryx-theme]` | 테마의 글꼴에 한글 자형이 없다 |
| 한글 어절 줄바꿈(`word-break: keep-all`, `overflow-wrap: anywhere`) | `theme.css`의 `body` | 한 글자만 다음 줄로 넘어가지 않게, 긴 숫자 · 경로는 넘치지 않게. 화면마다 className을 달지 않으려고 전역 한 곳에 |
| 강조색 남색(테마 확장) | `themes/sanhab.ts` | neutral의 강조색이 검정이라 화면이 와이어프레임처럼 보였다(유저 결정 2026-11-15). neutral을 extends하고 강조 토큰 다섯 개만 팔레트 blue로 |
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
| 메뉴(SideNav) | 테마 기본. 모든 폭에서 아이콘 줄로 접힌 채 시작(단추로 펼침) |
| 본문 | 나머지 |
| 오른쪽(AI 보고 + 대화) | 380(320–560 폭 조절), 언제나 열림 |
| 시연 서랍 | 360(Drawer, 뒤를 막지 않음) |
