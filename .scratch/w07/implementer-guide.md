# 구현 안내 (모든 티켓 공통)

티켓 하나를 맡은 에이전트가 먼저 읽는 문서. 내용을 여기에 옮겨 적지 않고 가리키기만 한다.

## 읽을 것
- 맡은 티켓: `.scratch/w07/issues/NN-*.md` (완료 조건이 곧 할 일이다)
- 낱말: `GLOSSARY.md` — 화면, 문서, 코드의 이름표가 모두 이 낱말을 쓴다. `_Avoid_`의 말은 쓰지 않는다
- 스펙: `docs/graph-spec.md` (결정 D1~, 노드, 선 1~30, 상태, 작업)
- 시나리오와 숫자: `docs/user-scenarios.md`
- 화면: `docs/service-plan.md`(S·U 결정), `docs/ux-plan.md`(배치), `docs/design/`(tokens, components, copy, sources, review)
- AI 연결의 검증 코드: `docs/spike/`
- SurrealDB 4의 동작과 함정: `/Users/code/.claude/projects/-Users-code-Desktop-axwar-samilpwc/memory/surrealdb4-verified.md`
- AXHub 배포 조건: `/Users/code/.claude/projects/-Users-code-Desktop-axwar-samilpwc/memory/axhub-deploy-constraints.md`
- 원본 데이터: `01_참가자_배포용/04_원본데이터/` (고치지 않는다)
- 앞 티켓이 정한 규약: 이 문서의 맨 아래 "규약"

## 지킬 것
- 통합 브랜치는 `w07`. 자기 작업 트리가 `w07`의 끝에서 시작했는지 먼저 확인하고, 아니면 그 위로 옮긴다. 끝내기 전에 `w07`의 끝을 자기 브랜치에 합친다.
- **`git push` 금지.** 올리면 AXHub 배포가 시작되고 요금이 나간다. 배포는 27번 티켓에서만 한다.
- `.claude`, `.codex`, `.agents` 폴더와 루트 `.gitignore`는 건드리지 않는다.
- 비밀 값: `.env`는 `/Users/code/Desktop/axwar-samilpwc/.env`에만 있다(작업 트리에는 없다). `set -a; . /Users/code/Desktop/axwar-samilpwc/.env; set +a`로 읽고, **값을 출력하지 않는다**(echo, printenv, 로그, 커밋 모두 금지).
- Rust 빌드 산출물은 **작업 트리마다 따로** 둔다(`CARGO_TARGET_DIR`을 잡지 않는다 → `<작업 트리>/app/target`). 여럿이 한 폴더를 같이 쓰면 마지막에 빌드한 쪽의 실행 파일이 남아, 다른 작업 트리의 앱이 띄워질 수 있다. 처음 빌드를 빨리 하려면 `cp -cR /Users/code/Desktop/axwar-samilpwc/app/target <작업 트리>/app/target`으로 복제해서 시작한다(APFS 복제라 바로 끝나고 디스크를 더 쓰지 않는다). 디스크가 한 번 가득 찼으므로, 티켓이 끝나면 자기 작업 트리의 `app/target`과 `app/web/node_modules`를 지운다.
- 시험용 DB는 자기 것을 띄운다(다른 에이전트와 섞이지 않게). 포트는 18100 + 티켓 번호:
  `docker run -d --rm --name w07-t<NN> -p <포트>:8000 surrealdb/surrealdb:v4.0.1 start --user root --pass root 'surrealkv:///tmp/db?versioned=true'`. 끝나면 지운다.
- 앱을 띄울 때의 포트는 3100 + 티켓 번호.
- 만드는 방식: Skill 도구로 `mattpocock-skills:tdd`를 불러 그 방식으로 만든다. 완료 조건의 숫자를 검사하는 자동 검사를 먼저 쓴다.
- 최소로 만든다. 티켓의 완료 조건에 없는 기능, 설정, 추상화를 더하지 않는다. 표준 라이브러리와 이미 있는 의존성을 먼저 쓴다.
- 계산(관련자, 그룹, 합산, 승인권자, 재검토, 정황 탐지)은 코드가 한다. AI는 이 값을 만들지도 고치지도 않는다.
- 사람의 조치는 그 사람의 역할 권한으로 실행되고, 권한은 DB가 강제한다.
- 화면의 낱말은 한 파일에만 둔다. 부품 안에 글자를 직접 적지 않는다. 색·크기도 한 파일의 이름만 쓴다.
- 가운데(사실)에는 AI가 쓴 글을 넣지 않는다. 오른쪽(판단)은 조치 → 사유 → 보고 → 경위 → 이력 순서를 지킨다.
- **브라우저 창을 띄우지 않는다.** Playwright MCP 도구(`mcp__plugin_playwright_*`)는 창이 유저의 화면 앞으로 올라오므로 쓰지 않는다. 화면을 직접 봐야 하면 `agent-browser`를 창 없이(headless, `--headed` 금지) 쓴다.
- 화면 검수는 스스로 하지 않는다. 별도 에이전트가 한다. 끝낼 때 검수하는 쪽이 앱을 띄울 수 있도록 **띄우는 명령과 포트, 따라갈 시나리오 단계**를 보고에 적는다.
- 스펙으로 정해지지 않는 선택이 나오면: **계산, 권한, 상태, 누가 무엇을 할 수 있는지**에 관한 것이면 정하지 말고 멈춰서 선택지를 보고한다. 낱말·배치·모양의 작은 선택은 문서의 규칙 안에서 정하고 보고에 적는다.
- 프로세스를 내릴 때 `pkill -f`처럼 넓게 종료하지 않는다. 자기가 띄운 PID와 컨테이너 이름으로만 내린다.
- 커밋은 자기 브랜치에만 한다. 커밋 메시지는 한국어, 티켓 번호로 시작한다.

## 끝낼 때 보고할 것 (짧게)
- 브랜치 이름과 마지막 커밋
- 완료 조건별 결과(자동 검사의 이름과 통과 여부)
- 앱을 띄우는 명령, 포트, 검수할 시나리오 단계
- 정하지 못해 남긴 선택, 다음 티켓이 알아야 할 것(→ 아래 "규약"에 한 줄씩 더하고 커밋)

## 규약 (앞 티켓이 정한 것 — 티켓이 끝날 때 더한다)
01 바탕이 정한 것. 티켓 NN은 아래의 자기 파일만 만들고, 여럿이 같이 쓰는 파일에는 한 줄만 더한다.
- **서버의 티켓 파일**: `app/src/tickets/tNN_이름.rs` 하나가 `SCHEMA`(= `include_str!("../../db/NN-이름.surql")`), `routes() -> Router<Db>`, `seed(&Db)`, `check(&Check)` 넷을 내놓는다. `app/src/tickets.rs`의 `tickets! { … }`에 `tNN_이름,` 한 줄을 번호 순서 자리에 더한다(스키마와 적재는 이 순서로 실행된다). 본보기: `t01_base.rs`.
- **스키마**: `app/db/NN-이름.surql`. 다른 티켓의 스키마 파일은 고치지 않고, 앞 티켓의 테이블에 더할 것은 자기 파일에서 `DEFINE FIELD`·`DEFINE EVENT`로 더한다. 스키마 글자가 바뀌면 부팅 때 저절로 다시 적재되고, 그대로이면 DB를 건드리지 않는다.
- **초기화와 적재**: 초기화는 DB를 지우고 모든 스키마 → 모든 `seed()`를 다시 실행한다. 원본에서 만들어지는 것은 전부 `seed()`에 둔다(볼륨이 사라져도 같은 상태가 된다). 원본 파일은 `app/src/orig.rs`에 상수 한 줄 + `app/Dockerfile`의 `COPY` 한 줄로 더하고 `orig::csv()`로 읽는다.
- **시계**: 시스템의 오늘은 `meta:v.today`. SurrealQL에서는 `fn::today()`를 쓰고 `time::now()`로 업무 날짜를 찍지 않는다. 화면에는 `GET /api/state` → `{ role, today: "2026-07-01" }`.
- **주고받는 방식**: `/api` 아래 JSON. 조회는 GET, 조치는 POST. `routes()`의 경로는 `/api` 아래에 붙고 전부 접속한 역할만 통과한다(문은 `main.rs`의 `gate`, 토큰 없으면 401). 처리기는 `Extension<Me>`로 `me.role`과 `me.db`(그 역할의 DB 세션)를 받는다. **조치는 반드시 `me.db`로 실행**해 테이블의 `PERMISSIONS`(`$auth.role`)가 권한을 강제하게 한다. 거절은 오류가 아니라 빈 결과이므로 빈 결과면 403을 돌려준다. 계산용 조회만 `State<Db>`(root)를 쓴다. 반환형은 `R`, 오류는 `err(StatusCode, "낱말")`. 사용자 입력은 쿼리 글자에 넣지 않고 바인딩한다.
- **역할**: 이름은 `영업지원`, `영업임원`, `내부 감시`, `회계·자금`(DB의 `$auth.role`, 화면, 검사 모두 이 글자). 계정은 `staff:support|exec|audit|acct`. `POST /api/enter { pass }`와 `POST /api/reset`은 `{ roles: [{ role, token }] }`을 돌려준다(초기화하면 토큰이 새로 나온다).
- **실시간**: 웹소켓을 쓰지 않는다. 화면은 조치 뒤와 역할을 바꿀 때 다시 읽는다(`useData`). 주기적으로 읽어야 하는 티켓은 자기 조각 안에서 한다.
- **자동 검사**: `check(c)`는 화면과 같은 길로 검사한다 — `c.get(역할, 경로)`, `c.post(역할, 경로, 본문) → (상태 코드, 본문)`, `c.call(토큰, …)`. `c.db`(root)는 준비에만 쓴다. 티켓의 검사 앞에서 DB가 초기화된다. 완료 조건의 숫자를 여기에 적는다. DB가 필요 없는 것은 같은 파일의 `#[cfg(test)]`.
- **검사 명령**(작업 트리의 `app/`에서, `CARGO_TARGET_DIR`을 잡고): `npm --prefix web ci && npm --prefix web run build`(화면 규약 검사 + 타입 검사 + 빌드. **`cargo`보다 먼저** — 실행 파일이 `web/dist`를 포함한다) → `cargo test` → `SURREAL_ADDR=localhost:<18100+NN> cargo run -- check`(전체) 또는 `cargo run -- check tNN`(그 티켓만).
- **로컬에서 띄우기**: 시험용 DB를 띄운 뒤 `SURREAL_ADDR=localhost:<18100+NN> PORT=<3100+NN> cargo run` → `http://localhost:<3100+NN>`, 접속 패스워드는 `DEMO_PASS`(없으면 `demo`). 화면만 고칠 때는 `API=http://localhost:<3100+NN> npm --prefix web run dev`. compose 전체는 `app/README.md`.
- **화면의 폴더**: `app/web/src/tickets/NN-이름/index.tsx`가 `Piece[]`를 default로 내놓으면 저절로 모인다(등록하는 파일 없음, `pieces.tsx`). 조각은 자리(`slot`)에 끼운다: `list`(목록, `menu`로 메뉴를 고른다) / `fact`(가운데) / `action`·`reason`·`report`·`trail`·`history`(오른쪽, 순서 고정) / `chat`(대화). `kind`는 열어 둔 대상의 종류와 맞을 때만 보이게 한다. 조각이 없는 자리는 `없음`이 된다. AI가 쓴 글은 `fact`에 끼우지 않는다.
- **화면의 상태**(`state.ts`): `roleAtom`, `menuAtom`, `targetAtom`(`{ kind, id }` — 목록에서 줄을 고르면 넣는다. 목록 조각이 있고 대상이 없으면 목록이 넓게 쓴다), `api(경로, 본문?)`(본문이 있으면 POST), `useData(경로)`(역할이 바뀌거나 조치가 끝나면 다시 읽는다). 자기 티켓만의 상태는 자기 폴더에 atom으로 둔다.
- **낱말 파일**: `app/web/src/labels.ts`. 부품에서는 `L.낱말`, `L['두 낱말']`로만 쓴다(`copy.md`의 표는 이미 들어 있다). 없는 낱말은 `GLOSSARY.md`에 먼저 더하고 목록 맨 아래에 한 줄로 더한다. 서버가 주는 값(역할 이름, 원본의 값)은 그대로 보여 준다.
- **색 파일**: `app/web/src/theme.css`(`tokens.md`의 값 전부). 부품은 Tailwind의 이름만 쓴다: 색 `bg-surface`·`text-text-sub`·`border-line`·`text-action`, 상태 `bg-good-bg text-good`(wait·good·hold·bad·again), 글자 `text-title|figure|body|table|label`, 폭 `w-menu|list|right|chat`, 높이 `h-band|row|head`, 모서리 `rounded-box|pill`, 그림자 `shadow-float`. `w-[360px]` 같은 직접 값, `#색`, `style=`은 `npm run lint`가 막는다.
- **공통 부품**: `app/web/src/ui/`(`Pill` 상태 표지, `Empty` 없음, `styles.ts`의 `button`·`label`·`floating`). `components.md`의 부품을 새로 만들면 `ui/부품이름.tsx` 한 파일로 두고 여기에 한 줄 더한다. 동작이 있는 부품은 `@base-ui/react/<부품>`에서 가져온다(사용법: `app/web/node_modules/@base-ui/react/docs/react/components/*.md`).
- **같이 쓰는 파일**: `app/src/tickets.rs`와 `app/web/src/labels.ts`는 합칠 때 양쪽 줄이 모두 남는다(`app/.gitattributes`의 `merge=union`). 줄을 **더하기만** 하고 있는 줄은 고치지 않는다. `main.rs`, `App.tsx`, `Band.tsx`, `state.ts`, `pieces.tsx`, `theme.css`는 그 티켓의 완료 조건이 요구할 때만 고친다(예: 21번의 띠 날짜).
- **배포 구성**: `compose.yaml`, `axhub.yaml`, `app/db.Dockerfile`은 그대로 둔다(`cargo test`의 `deploy_constraints`가 지킨다). 화면 파일 이름은 `app.js`, `app.css`, `PretendardVariable.woff2`로 고정이다(`vite.config.ts` ↔ `main.rs`). 화면에 파일을 더 실으려면 `main.rs`에 경로를 더한다.

02 대리점이 정한 것.
- **그래프의 테이블**(`app/db/02-대리점.surql`): 노드 `dealer`(id = 원본의 `D-001`, `registered` = 등록일) · `person`(`name`, `same` = 동일인 여부) · `address`·`account`(`value`) · `payout`(지급: `ym`, `amount`, 원본 그대로의 `status`·`approver`·`paid`) · `deposit`(회수) · `origin`(원본 파일: `path`, `sha`). 선 1~6은 `rep`·`addr`·`acct`(dealer → person·address·account), `deposit_of`·`deposit_into`, `payout_of`. 레코드 id에 `-`나 한글이 있으면 backtick(``dealer:`D-034` ``, ``person:`박상현` ``), 값으로 만들 때는 `type::record('dealer', $id)`.
- **같은 값은 노드 하나**: 사람·주소·계좌의 id가 곧 값이다. 두 대리점이 관련자인지는 `rep`·`addr`·`acct`로 같은 노드를 몇 개 함께 가리키는지로 계산한다(저장하지 않는다). 사람을 나눌 때(동명이인 인정)는 새 id의 `person`을 만들고 `rep` 선을 옮긴다.
- **선 1~3의 필드**: `since`(변경일) · `until`(다음 값으로 바뀐 날, 없으면 지금도 유효) · `known`(인지일, 없으면 미상) · `via`(경로: 신고·회수·소명·원본) · `excluded`(소명으로 제외됨). 원본에서 온 선은 `since` = 등록일, `known` 없음, `via` = 원본. 02의 목록·상세는 `until`·`excluded`를 가리지 않고 전부 보여 주므로, 값을 바꾸는 티켓(13)이 "지금 값"의 조건을 정한다.
- **출처**: 모든 테이블에 `source`(원본·계산·가정·AI·시연). 원본에서 온 기록은 `file`(record<origin>)과 `row`(행 번호, 머리글이 1)를 함께 가진다. 새 테이블에도 `source`를 둔다.
- **권한**: 02의 테이블은 모든 역할이 읽기만 한다. 쓰는 조치를 만드는 티켓이 자기 스키마 파일에서 `DEFINE TABLE OVERWRITE … PERMISSIONS`로 그 조치의 권한만 연다.
- **조회 경로**: `GET /api/dealers`(목록) · `GET /api/dealers/{id}`(`{ dealer, registered[], payouts[] }`, 날짜는 `YYYY-MM-DD`, 인지일 미상은 `null`) · `GET /api/origin?file=<경로>&row=<행>`(원본의 한 행 `cells`와 `sha`). 지급의 `status`는 원본 값(승인·미지급·반려) 그대로이고, D19의 해석(미지급 → 대기)은 심사 티켓이 한다.
- **공통 부품**: `ui/Table.tsx`(`Table` — `head`, `rows`, `right`(오른쪽 정렬 열), `current`(열어 둔 줄), 줄이 없으면 `없음`. `num()`은 금액 표기) · `ui/Title.tsx`(`Title` 제목 줄 — `name`, `sub`, children에 상태 표지·덧표시) · `ui/Source.tsx`(`Source` 출처 표지 — `kind`와 원본이면 `file`·`row`, 그 밖의 출처는 children에 열릴 내용).
- **대리점 화면의 조각**: 목록은 `list`(메뉴 대리점), 상세는 `fact`에 `kind: L.대리점`으로 끼운다. 가운데의 `order`는 제목 줄과 등록 100, 지급 300이다. 관계(03)는 200, 지급 아래에 놓일 것(정황, 소명)은 400부터 쓴다. `order`를 적지 않으면 티켓 순번(작은 수)이 되어 제목 줄 위에 놓이므로 대리점 상세에 끼우는 조각은 반드시 적는다. 조각 사이의 간격은 조각이 `mb-4`로 낸다.

03 관련자가 정한 것.
- **계산은 한 곳**(`app/src/tickets/t03_related.rs`, 저장하는 것 없음): `links(db, period) -> Vec<Link>`가 계산에 쓸 식별자 선을 읽고, `matches(&links, a, b)`(일치하는 식별자의 종류, 둘 이상이면 관련자)와 `groups(&links)`(전이적으로 이은 그룹. 모든 대리점이 한 그룹에 들고 관련자가 없으면 혼자, 비대상 대리점 포함)가 그 선만으로 계산한다. 뒤 티켓은 `super::t03_related::{links, matches, groups, Link, ITEMS}`를 쓴다. `Link { dealer, name, item, node, value }`에서 `item`은 `ITEMS`(대표자·주소·계좌)의 자리, `node`는 가리키는 노드의 id 글자다. 일치는 같은 `node`인지로 본다(나뉜 동명이인은 다른 노드라 일치가 아니다).
- **기간**: `period`는 `Some((첫날, 끝날))`(`YYYY-MM-DD`), `None`이면 시스템의 오늘 하루. 선의 유효 기간(`since` ≤ 끝날, `until` 없음 또는 `until` > 첫날)이 그 기간과 **하루라도 겹치면** 읽는다. 원본 상태에서는 어느 기간이든 결과가 같다. 귀속월 안에서 값이 바뀐 달을 어떻게 볼지는 13번이 확정한다(스펙에 없는 선택이라 03의 보고에 적었다).
- **소명으로 제외**: `excluded = true`인 선은 `links()`가 읽지 않는다. 20번은 선의 `excluded`만 바꾸면 된다.
- **가설**(12번): `links()`의 결과에 `Link`를 더하거나 빼서 `groups()`·`matches()`를 다시 부른다. 두 함수는 DB를 읽지 않는다.
- **조회 경로**: `GET /api/dealers/{id}/related` → `{ id, idents[{ id, item, value }], near[{ id, name, match[], related }], lines[[대리점 id, 식별자 id]], group[{ id, name }], source: "계산" }`. `near`는 식별자를 하나라도 함께 가리키는 대리점(관련자가 아닌 곳도 `related: false`로 들어 있다), `group`은 자기를 포함한다. 지금(오늘) 기준이다.
- **공통 부품**: `ui/Relation.tsx`(`Relation` 관계 그림 — `left`(대상 대리점, 둥근 모양) · `mid`(사람·주소·계좌, 각진 모양) · `right`(이웃 대리점) · `lines`([대리점 id, 식별자 id]). 점은 `{ id, name }`. SVG로 직접 그리고 라이브러리는 없다. 같은 내용의 표는 쓰는 쪽이 함께 둔다). 심사는 `left`에 구성원 한 곳, `right`에 나머지를 넣으면 `ux-plan.md`의 그림이 된다.
- **대리점 상세의 "관계"**: `fact`에 `kind: L.대리점`, `order: 200`으로 끼웠다(등록과 지급 사이).
- **표**: `Table`의 칸은 줄을 바꾸지 않고, 좁으면 그 표만 가로로 민다(`tokens.md`). 출처 표지는 원본의 행을 받은 뒤에 열린다.
