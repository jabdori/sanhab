# 부품 목록 (디자인 하네스)

**화면은 astryx 템플릿 코드에서 출발한다(2026-11-14 결정).** `npx astryx template <id> <경로>`로 받은 코드의 구조 · 부품 · 스타일(StyleX 포함)을 그대로 두고, 데이터 · 낱말(`labels.ts`) · 조치만 우리 것으로 바꾼다. 템플릿을 참고해 처음부터 다시 짜지 않는다.
- 템플릿에서 온 파일은 첫 줄에 `// astryx template: <id>`(블록이면 `// astryx block: <Block>`)를 단다. `style=` · 직접 값은 어느 파일에서나 lint가 막는다(astryx 규칙). 날 요소 · className · `.css` 가져오기는 `npm --prefix app/web run doctor`(astryx doctor의 "Source uses Astryx well")가 센다.
- 템플릿에서 바꾼 것은 아래 "템플릿에서 벗어난 곳"에 이유와 함께 적는다. 목록에 없는 차이는 판정에서 어김이다. 이유는 유저와 합의한 것만.
- 대응하는 템플릿이 없는 화면만 직접 짜고, 그 이유를 "화면 ↔ 템플릿" 표에 적는다.
- 앱이 갖는 부품은 astryx와 템플릿에 같은 일을 하는 것이 없을 때만 둔다.

## 앱 부품
| 부품 | 하는 일 | 왜 앱이 갖나 |
|---|---|---|
| `ui/Region` | 제목 달린 영역: `Section`(위 구분선) + `Heading 2` + 옆 표지 + 오른쪽 영역 조치. 카드가 아니다 | work-item-detail의 SectionHeader를 한 번만 옮겨 둔 것 |
| `ui/Source` | 출처 표지(아래) | A05 §6의 출처 구분 — 우리 고유 기능. 안은 `Link`·`Icon`·`Popover`·`MetadataList` |
| `ui/Confirm` | 확인 창: 버튼 → 입력이 없으면 `AlertDialog`(AlertDialogAsyncAction 블록 — 제목 · 설명 한 줄 `이름표 값 / 이름표 값` · 취소/실행), 입력(사유 · 값)이 있으면 `Dialog` form(DialogFormDialog 블록 — 제목 · `MetadataList` · 입력 · 취소/실행). 실행 중엔 실행 버튼이 도는 표지 | 조치마다 같은 꼴을 지키려고 |
| `ui/Reason` | 사유: 분류 `Selector` + 메모 `TextInput` | 조치마다 같은 규칙(`ready`)을 쓰려고 |
| `ui/Mark` | `State`: 머리 · 요약의 상태 `Badge`(detail-page). `StateDot`: 목록 줄의 상태 `StatusDot` + 글자(table-grouped). `RowDot`: 줄 맨 앞의 주의 점. `Mark`: 표시 — 정황은 warning `Badge`, 나머지는 기본 색 `Token`. 기본 상태(대기 · 일치 · 접수)는 어디서나 그리지 않는다 | 자리마다 템플릿의 꼴을 한 곳에서 |
| `ui/Pending` | 읽는 중(`Skeleton`) · 실패(`EmptyState` `오류` + 서버의 말, 404는 `없음`). `page`면 기록 화면 틀의 자리 | `useLoad`의 상태를 화면마다 같은 꼴로 |
| `ui/Tour` | 안내: 밝힌 자리(구멍) + `Popover`(anchorRef, 바깥 눌러 닫기 없음) · 진행 `Pagination dots` | astryx에 둘러보기 부품이 없다 — 구멍만 직접 그린다 |
| `ui/Compare` | 두 열 비교 `Table`(다른 줄만 굵게) | 당시/현재 · 현재/가설 · 현재/모의가 같은 꼴 |
| `ui/Relation`, `16`의 경위 그림 | 관계 · 경위 그림(SVG) | astryx에 그림 부품이 없다 |
| `ui/Record` | 기록 화면의 틀: `RecordPage`(detail-page 머리 — 목록 펴기 · ← 메뉴 · `Pagination compact`(n/전체 ‹ ›) / 제목 / 메타 줄(상태 Badge · 표시 · 사람, 사이 점) / 조치(좁으면 메타 아래 한 줄) / 탭 줄(탭이 하나여도) + 요약 칸 단추) · `Tiles`(숫자 묶음, Section + MetadataList) · `Act`(확인 창 + 사유) | 모든 기록 화면이 같은 꼴이 되게. detail-page 템플릿을 한 번만 옮겨 둔 것 |
| `ui/Line` | 결정 한 줄(Stack + Text) | 요약의 결정 · 보고의 결정이 같은 꼴 |

## 버튼 등급
- **조치 묶음마다 주 버튼(primary)은 하나**: 흐름을 앞으로 보내는 조치(승인, 추인, 종결, 요청, 인정, 발송, 지급, 회신, 재상신, 변경, 접수). 목록은 `ui/grade.ts`, 버튼은 `<Button variant={grade(kind)} …>`.
- 나머지 조치는 secondary(보류, 반려, 거부, 이견, 기각, 불인정, 보완 …).
- **destructive는 기록을 지우는 시연 조작(초기화)에만.** 반려·불인정·거부·기각은 사유와 함께 남는 결정이고 되돌리는 길(재상신·보완·이견·재접수)이 있어 붉게 칠하지 않는다. 붉은 버튼이 판단을 한쪽으로 미는 것도 막는다.
- **예외: 보고의 채택·불채택은 둘 다 secondary**(같은 무게, `docs/research-ux.md`). AI의 의견을 받아들이는 쪽으로 기울이지 않는다.
- 권한이 없으면 버튼 대신 `승인권자 영업임원`(이름표는 보조, 값은 굵게). 비활성 버튼을 늘어놓지 않는다.
- 확인 창의 실행 버튼은 여는 버튼과 같은 등급. 취소는 블록대로 — AlertDialog는 ghost, Dialog form은 secondary.


## 출처 표지
근거: `01_참가자_배포용/A05.html` §6(원본 사실·추가 가정·합성 관측값·계산 결과를 구분 표시, 추가 행에 식별자·적용 시점·원본 연결·생성 이유, 모의 회신은 가상 입력).

| 출처 | 화면 | 설명 칸 |
|---|---|---|
| 원본 | **표지 없음.** 출처 열에 조용한 행 번호(`55행`, 보조 색) | 원본 파일의 그 행: 경로·행, 머리글과 값, 해시 |
| 계산 | 계산기 아이콘 + `계산`(보조 색 Link) | 이름표와 값으로 쓴 계산식(`합산  귀속월 지급의 합, 반려 제외`) |
| 가정 | 전구 아이콘 + `가정`(보조 색 Link) | MetadataList: 번호(D51) · 내용(스펙의 그 줄) · 적용 시점(기준일 `2026-07-01 ~`) · 위치(문서와 행) · 이유(결정 제목 + 본문, 160자를 넘으면 접힘, 글머리는 목록으로 — Markdown) · 쓰임 |
| 합성 | 겹친 사각 아이콘 + `합성`(보조 색 Link) | 가정과 같다(D58 시연 호실) |
| AI | 반짝임 아이콘 + `AI`(보조 색 Link) | 실행 기록(모델 · 날짜 · 조회) |
| 모의 | 비커 아이콘 + `모의`(보조 색 Link) | **시연 서랍에서 만든 값에만**(모의 회신, 시연 서류, 넘긴 날짜): 종류 · 대상 · 넣은 값 · 누가 언제 · 이유(시연) |

- 부품: `<Source kind={…} file row tip of rows side>{설명}</Source>`. 계산의 설명은 `rows`(이름표와 값의 줄, MetadataList로 그린다). `dl`·`grid`를 손으로 짜지 않는다. 줄로 쓸 수 없는 글(조항 원문)만 children. 머물거나 초점을 주면 **한 줄**(`가정 D51 · 근접`), 누르면 **설명 칸**.
- 가정·합성의 내용은 `GET /api/rules`의 `assumes`·`synths`(결정 번호·제목·스펙의 줄·행·본문 `body`·쓰임) 한 곳에서 온다. 화면에는 **값 → 결정 번호** 대응만 둔다(`ui/Source.tsx`의 `DECISION`: 기한 D32, 지연 D30, 근접 D51, 서류 D17, 호실 D58). 새 가정을 쓰면 거기에 한 줄을 더하고 `<Source kind={L.가정} of={L.낱말} />`.
- 서버의 출처 `시연`은 사람이 앱에서 한 조치(변경·승인·요청)와 시연 서랍의 조작을 가르지 못한다. 그래서 화면이 가른다: **제품 안의 조치로 생긴 값은 표지가 없다**(누가 언제는 이력에), 시연 서랍에서 온 값(08 회신, 19 시연 서류)만 `kind={값.source}`로 넘겨 `모의`로 보인다. 시연으로 넣은 값(D58의 호실)은 `kind={L.합성} of={L.호실}`. 서버는 바꾸지 않는다.
- 원본의 조용한 글자는 언제나 행 번호다: csv는 `row`(`7행`), 문서의 여러 행은 `place`(`41–45행`). 표의 출처 열이나 숫자 줄의 값 옆에 둔다(값의 칸 안에 섞지 않는다).
- 표 전체가 같은 출처면(규정의 가정 목록) 줄마다 표지를 달지 않고 `quiet place={번호}`로 번호가 설명 칸을 연다. 한 결정에 줄이 여럿이면 `line`(스펙의 행)으로 그 줄을 고른다.
- 설명 칸의 글(조항 원문 등 마크다운)은 children에 문자열로 주면 그려진다(Markdown). 가리킬 값이 없으면 표지를 달지 않는다(기한 없음 옆의 가정 등).
- 앱에서 사람이 내린 결정(승인·반려 …)은 제품의 동작이라 표지를 달지 않는다. 누가 언제는 이력에 있다.
- AI(보고·대화)가 읽는 도구 결과에서 출처 `시연`은 `화면 입력`으로 바뀌어 건너가고, 지시문이 그 뜻(사람이 화면에서 한 조치)을 적는다(t17 `human`·`SOURCE`). DB와 화면의 값은 그대로다.
- 표의 출처 열, 숫자 줄의 끝, 영역 제목 옆(`Region aside`)에 둔다. 값 안에 섞지 않는다.
- 표지는 상태 Badge(채운 알약)와 다른 꼴이다: 종류 아이콘 + 보조 색 글자의 Link. 규칙 버전(`한도 v1`)도 알약이 아니라 글자다. 일치의 종류(대표자 · 주소 · 계좌)는 기본 색 Token이다(색 없음, tokens.md의 색 표).

## 시연 서랍
- 메뉴 바닥의 `시연`(접히면 아이콘)을 누르면 서랍(Drawer, `hasScrim={false}`)이 뜬다. 뒤 화면을 막지 않는다 — 시연 조작을 하며 화면의 변화를 같이 본다.
- 담는 것: 날짜 넘기기, 초기화(destructive, 확인 창), 옛 조각의 시연 조각 — 소명의 시연 서류(19), 지급의 모의 회신(08).
- 제품 화면에는 이 조작의 단추를 두지 않는다. 그 조작으로 생긴 값에는 출처 표지 `모의`만 남는다.

## 빈 자리
- 내용 없는 영역(몸통이 `없음`뿐이고 영역 조치가 없음)은 그리지 않는다(`ui/Region`). 탭 몸통처럼 자리를 지켜야 하는 곳만 `EmptyState` 작은 꼴(`ui/Empty`).
- 대화 칸이 비면 제안 카드(`ClickableCard` Grid, ai-chat-landing 꼴). 누르면 입력창에 글을 넣는다(템플릿의 applySuggestion — 바로 보내지 않는다).
- 날짜는 `YYYY-MM-DD` 하나로 쓴다(서버 값 그대로, 고정폭 숫자). 사람은 아이콘으로. 예외: 대화의 AI 표지는 반짝이 아이콘(아래 "벗어난 곳").

## 화면 ↔ 템플릿
템플릿은 `npx astryx template <id> <경로>`로 받아 앱 코드의 출발점으로 쓴다. 앱은 StyleX(`@stylexjs/babel-plugin`)를 빌드에 들인다.

## 템플릿에서 벗어난 곳
| 화면 | 템플릿 | 바꾼 것 | 이유(합의) |
|---|---|---|---|
| 앱 틀 | shell-side-nav · AppShellSideNavOnly | 오른쪽 끝에 대화 칸(table-grouped의 상세 칸 꼴: 선 없는 `ResizeHandle` + `LayoutPanel hasDivider resizable role=complementary`), 늘 열림 | 대화는 본문을 돕는 보조 칸(2026-11-14 합의: 본문이 주인공) |
| 앱 틀 | shell-side-nav | 메뉴 머리 아래 역할 고르기(topContent, 접히면 아이콘 단추), 메뉴는 아이콘 줄로 접힌 채 시작, 바닥 묶음은 날짜 · 도움말 · 시연(날짜를 누르면 시연 서랍), 메뉴 폭 조절 없음 | 역할 전환(S2) · 본문 폭(2026-11-14 합의) |
| 앱 틀 | shell-side-nav | main 표지는 틀이 아니라 각 화면(목록 · 기록)의 `LayoutContent role="main"` | 화면마다 템플릿이 main을 갖는다 — 겹치지 않게 |
| 대화 | ai-chat | 결과물(artifact) 칸 없음, 머리(제목 · 대화 목록 · 새 대화) | 대화 칸 폭(360)에 대화 열만. 지난 대화의 입구는 머리의 목록 하나(D61, 2026-11-14) |
| 대화 | ai-chat | 날짜 구분선 · 말의 시각(보낸 순간 · 답을 마친 순간, 말의 metadata.at — 옛 말은 시각 없이) · 대화 목록의 시각은 **실제 시각**(시연의 오늘이 아니다) | 대화는 실제로 언제 묻고 답했는지 남기는 기록(D62, 2026-11-14 합의) |
| 대화 | ai-chat | 머리 제목 아래 지금 대화의 제목(첫 질문) | 지난 대화를 고를 때 어느 대화인지(2026-11-14 합의) |
| 대화 | ai-chat-landing | 인사(아이콘 + 한 줄)와 큰 제목 없음. 연 기록이 있으면 제안 카드만, 없으면 빈 칸 | 같은 화면에 이미 보이는 이름의 되풀이(2026-11-15 합의, D67). 지금 화면은 입력창의 문맥 카드가 보인다 |
| 대화 | ai-chat | 입력창 문맥 칸 첫 줄에 지금 보는 화면 카드(종류 아이콘 · 이름 · 종류 · 빼기) | 대화는 역할마다 하나라 화면을 오간다 — 어느 화면에 대한 말인지 늘 보이게(2026-11-15 합의, D67) |
| 대화 | ai-chat | 도구 호출 줄(ChatToolCalls)을 답의 글 앞에, 부르는 순간 진행 → 완료 | AI가 무엇을 읽는지 보이게. 이름만 보이고 조회문은 숨긴다(2026-11-15 합의, D67 · review.md 2-1) |
| 대화 | ai-chat | 입력창 아래 `보고`(보고로 남기기) 아이콘 | 대화를 보고로 남기는 길(D61) |
| 빈 대화 | ai-chat-landing | 입력창은 가운데가 아니라 칸 아래, 제안은 카드 셋(ASK) · 분류 고르기 없음 | 대화 칸 안의 빈 상태라 입력창 자리를 바꾸지 않는다 |
| 대화 목록 | 없음 | Dialog + `기록` / `전체` + List | 대응 템플릿 없음(2026-11-14 합의) |
| 작업 목록 | table-grouped | 검색은 PowerSearch 대신 바로 걸러지는 검색칸, 상세 칸(inspector) 없음 · 줄을 누르면 기록 화면 | 판정 합의(2026-11-13), 2026-11-14 합의 A |
| 작업 목록 | table-grouped | 머리 오른쪽에 만들기 단추 대신 `전체 · 담당 · 진행`, 일괄 승인 줄(묶음 머리와 줄 앞 체크) | 이전 합의(작업 화면) |
| 기록 | detail-page | 머리 왼쪽 위에 목록 펴기 · ← 메뉴 · `Pagination compact`(n/전체 ‹ ›, 읽는 글은 `2/37`로 바꿈 — main.tsx) | 이전 합의(목록 사이드바, 앞 · 뒤) |
| 기록 | detail-page | 좁은 화면의 조치는 메타 아래 한 줄이지만 단추마다 꽉 채우지 않는다 | 조치는 화면마다 한 부품(`actions`)으로 들어와 단추를 나눌 수 없다 |
| 확인 창 | AlertDialog | 설명은 `rows`를 `이름표 값 / 이름표 값` 한 줄로 | AlertDialog의 설명은 글 하나다(목록을 넣을 수 없다) |
| 안내 | (없음) Popover · Pagination | 밝힌 자리의 구멍(둘레 어둡게 · 강조색 링)은 직접 그린 요소 하나(자리 · 모양을 코드에서 잰다), 카드의 꼬리 없음 | 구멍은 안내의 합의(2026-11-15 이전, 링은 화면 안쪽). astryx에 spotlight가 없다 |
| 기록 | detail-page | 오른쪽 칸은 요약 하나. 좁은 기준은 1024가 아니라 1440(대화 칸 360이 있어서)이고, 좁으면 요약을 본문 맨 위로(전체 화면 창 대신 — 그래서 좁으면 요약 칸 단추가 없다) | 2026-11-14 합의(D63) |
| 기록(심사 · 정황 · 소명) | detail-page | AI 보고는 다룬 사실 영역 바로 아래 떠 있는 카드(elevation med) | D63 |
| 기록 | detail-page | 숫자 묶음은 제목 없는 Section + MetadataList | 템플릿에 없는 지표(합산 · 한도 …)를 InvoiceCard 꼴로 |
| 기록(규정) | detail-page | 조항이 하나면 돌아가기 줄 없음 | 메뉴가 바로 그 조항을 연다(이전 합의) |
| 정황 · 소명 | work-item-detail | detail-page 틀을 같이 쓴다 | 모든 기록을 한 틀로(2026-11-14 합의) |
| 규정 | documentation-design | detail-page 틀을 같이 쓴다(모의 단추 · 내용/가정 탭 · 요약 칸) | 모든 기록을 한 틀로(2026-11-14 합의) |
| 대화 | ai-chat · ai-chat-landing | 입력창 위 문맥 칸(ChatComposerDrawer: 연 기록 · @로 붙인 기록 · 서류) | 문맥 카드(이전 합의). 같은 부품을 ai-chat-landing이 첨부 칸으로 쓴다 |
| 대화 | ai-chat | `@`는 단추 하나(입력에 @를 넣어 찾기를 연다), 모드 · 설정 메뉴와 받아쓰기 단추 없음 | 대화 열의 기준은 ai-chat(Mention 단추 하나). 모드 · 설정 · 받아쓰기는 우리에게 없는 기능 |
| 대화 | ai-chat | `@`로 고른 기록은 입력 속 토큰이 아니라 문맥 칸의 카드(입력에는 남기지 않는다) | 붙인 기록은 말 한 줄이 아니라 이 말의 문맥이다 — 지금 화면 카드와 같은 자리에서 빼고 넣고, 보낸 말 위에 그대로 남는다(문맥 카드 합의, D67) |
| 대화 | ai-chat | `/` 명령 없음 | 조치는 말로 지시하면 AI가 조치 카드를 낸다(U13). 따로 외울 명령이 없다 |
| 대화 | ai-chat | AI 표지는 Avatar가 아니라 반짝이 아이콘(헤더 · AI 보고 카드와 같은 것), 답의 첫 줄(도구 줄) 가운데 | 글자 "A" 원형이 이상하다는 유저 지적(2026-11-15 합의) |
| 대화 | ai-chat | 말풍선 안에 화면 부품(A2UI v0.8 표면): 앱의 부품 목록 Column → VStack · Text → Text · Facts → MetadataList · Table → Table(ui/Compare 꼴) · Records → List(누르면 그 기록). 단추 · 조치 없음 | AI가 값이 여럿인 답을 표 · 목록으로 보이게(2026-11-15 유저 결정, service-plan U17). 실행 단추는 조치 카드에만 |
| 대화 | ai-chat | 서류 붙이기 단추 뒤에 숨은 `<input type="file">`(doctor 지적 1건) | astryx에 단추로 여는 파일 고르기가 없다(FileInput은 늘 보이는 칸). 붙여넣기 · 끌어놓기는 ChatComposerInput의 onFiles |
| 빈 대화 | ai-chat-landing | 제목 display-3, 카드 Grid 최소 폭 200, 바깥은 Section | 대화 칸 폭(360) |
| 작업 목록 | table-grouped | 묶음 기준 고르기(View Options) · 줄 끝 `···` 메뉴 없음 · 숫자 묶음 없음 | 묶음 기준은 종류 하나(2026-11-14 합의) |
| 대리점 목록 | table-page | 머리의 내려받기(Download PDF) · 범위 고르기(SegmentedControl) · 합계 줄(TotalRow) · 정렬 · 칸별 걸러내기 없음. 사실 묶음은 대리점 수 · 걸러진 수 | 대리점 목록에는 금액 · 범위가 없다 |
| 접속 | login-card | 구분선 · 외부 로그인 · 가입 · 약관 · 카드 머리 보조 문구 없음. 두 번째 단계(역할 고르기)를 같은 카드에서 보조 단추 줄로 | 시연 접속(패스워드 하나 → 역할) |

| 화면 | 템플릿 | 따르는 것 | 파일 |
|---|---|---|---|
| 틀 | shell-side-nav / AppShellSideNavOnly(+ table-grouped의 폭 조절 칸) | 메뉴(SideNavHeading + SideNavSection 둘: 메뉴 · 바닥) · 흰 본문 · 오른쪽 대화 칸 | `App.tsx` |
| 접속 | login-card | 가운데 카드 하나 | `Enter.tsx` |
| 작업 | **table-grouped**(+ dashboard-alert-rail의 숫자 타일) | 머리(제목 · 분할 단추) → 숫자 타일 → 검색 → 묶음 머리(접힘 · 건수)가 있는 Table, 줄은 StatusDot · 이름 · 열 · 상태 | `pages/Work.tsx` |
| 대리점 · 규정 목록 | table-page / table-grouped | 흰 면의 Table, 줄 전체가 눌림 | `pages/Dealers.tsx`, `pages/Rules.tsx` |
| 기록(심사 · 정황 · 소명 · 지급 · 추인 · 대리점 · 규정) | **detail-page**(+ work-item-detail 머리) | 머리의 돌아가기 줄 · 제목 · 메타 줄(상태 Badge · 표시 · 사람) · 조치 · 탭 줄, 본문은 Section(`ui/Region`)이 gap 4로 쌓이고, 오른쪽 칸은 요약 | `ui/Record.tsx`, `ui/Region.tsx`, `pages/Review.tsx` 외 |
| 오른쪽 | ai-chat · ai-chat-landing | 대화 칸 하나(입력창 상시). AI 보고는 기록 화면 안, 다룬 사실 영역 바로 아래 카드(D63) | `tickets/24-대화`, `ui/AiCard.tsx` |
| 시연 서랍 | DrawerScrim 블록(hasScrim={false}) | 뒤를 막지 않음 | `Demo.tsx` |
| 확인 창 · 도움말 | AlertDialogAsyncAction · DialogFormDialog · DialogScrollingContent 블록 | 확인(입력 없음 / 있음), 도움말(머리 · 몸통 · 바닥의 `안내`) | `ui/Confirm.tsx`, `ui/Help.tsx` |
| 안내 | Popover · Pagination(dots) | 밝힌 자리 옆의 Popover, 진행 점 | `ui/Tour.tsx` |

## 상태 대응 (최소)
`ui/status.ts`: `badge`(상태 → neutral · success · warning · error), `dot`(줄의 주의 단계), `mark`(표시의 아이콘, 정황만 주의). 대응이 이 넷 밖으로 늘면 tokens.md의 색 표부터 고친다. 그리는 부품은 `ui/Mark` 하나: 머리는 `State`(Badge), 목록 줄은 `StateDot` · `RowDot`(StatusDot).

## 오른쪽 = 대화 칸
- 오른쪽 끝은 대화 칸 하나(360, 320–560 폭 조절, 언제나 열림). 기록 화면의 AI 보고는 칸 위가 아니라 기록 본문, 다룬 사실 영역 바로 아래 카드다(`ui/AiCard`, D63).
- 기록 화면의 오른쪽 칸(대화 칸 안쪽)은 요약 하나다(`ui/Record`).

## 반응 계약(astryx docs layout/responsive)
| 폭 | 메뉴 | 본문 | 오른쪽(AI 보고 + 대화) |
|---|---|---|---|
| 모든 폭 | 아이콘 줄로 접힌 채 시작(역할은 아이콘 단추, 펼침 단추로 편다 — 역할을 고르면 다시 접힌다) | 나머지 | 대화 360(폭 조절) |
| 1440 미만 | 같음 | 기록: 요약은 본문 맨 위 Section(여러 열), 조치는 메타 아래 한 줄 | 같음 |

## 아이콘 단추와 글자 단추
- **조치는 글자 단추**(승인 · 반려 · 보류 · 요청 · 접수 · 지급 · 실행 · 확인 창의 버튼): 결과가 남는 일이라 무엇을 누르는지 글자로 분명해야 한다. 주 버튼은 하나.
- **보조 기능과 도구는 IconButton + `tooltip`**: 자주 누르지 않거나 화면의 틀을 바꾸는 것 — 목록 펴기(QueueList), 보조 칸 펴기(ViewColumns), 앞 · 뒤(Chevron), 지난 대화(Clock → 목록 창, `기록` / `전체` — 지난 대화의 입구는 이것 하나), 새 대화(PencilSquare), 보고로 남기기(DocumentCheck), 붙임(PaperClip), 서류(DocumentArrowUp), 시연(Beaker). `label`과 `tooltip`은 같은 명사(목록 · 대화 목록 · 새 대화 …).
- **고를 것이 많은 기록 목록은 선택 칸이 아니라 아이콘 → 창(Dialog) 안의 List**: 지난 대화처럼 "가끔 찾아 들어가는 기록"은 줄마다 제목 · 다룬 기록 · 시각을 보여야 해서 선택 칸이 좁다. 지금 연 것은 `isSelected`.
