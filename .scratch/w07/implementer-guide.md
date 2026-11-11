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
- **자동 검사**: `check(c)`는 화면과 같은 길로 검사한다 — `c.get(역할, 경로)`, `c.post(역할, 경로, 본문) → (상태 코드, 본문)`, `c.call(토큰, …)`. `c.db`(root)는 준비에만 쓴다. 티켓의 검사 앞에서 DB가 초기화되고, 마지막 검사가 끝난 뒤에도(실패해도, 한 티켓만 돌려도) 한 번 더 초기화되어 원본 상태로 남는다. 그래서 검사는 `c.db`로 바꾼 것을 되돌리지 않아도 된다. 완료 조건의 숫자를 여기에 적는다. DB가 필요 없는 것은 같은 파일의 `#[cfg(test)]`.
- **검사 명령**(작업 트리의 `app/`에서, `CARGO_TARGET_DIR`은 잡지 않는다): `npm --prefix web ci && npm --prefix web run build`(화면 규약 검사 + 타입 검사 + 빌드. **`cargo`보다 먼저** — 실행 파일이 `web/dist`를 포함한다) → `cargo test` → `SURREAL_ADDR=localhost:<18100+NN> cargo run -- check`(전체) 또는 `cargo run -- check tNN`(그 티켓만).
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
- **공통 부품**: `ui/Relation.tsx`(`Relation` 관계 그림 — `left`(대상 대리점, 둥근 모양) · `mid`(사람·주소·계좌, 각진 모양) · `right`(이웃 대리점) · `lines`([대리점 id, 식별자 id]). 점은 `{ id, name }`. SVG로 직접 그리고 라이브러리는 없다. 같은 내용의 표는 쓰는 쪽이 함께 둔다). `ui/Source.tsx`에 `side`(`right`·`top`, 말풍선이 열리는 쪽. 없으면 아래)를 더했다. 심사는 `left`에 구성원 한 곳, `right`에 나머지를 넣으면 `ux-plan.md`의 그림이 된다.
- **대리점 상세의 "관계"**: `fact`에 `kind: L.대리점`, `order: 200`으로 끼웠다(등록과 지급 사이).
- **표**: `Table`의 칸은 줄을 바꾸지 않고, 좁으면 그 표만 가로로 민다(`tokens.md`). 출처 표지는 원본의 행을 받은 뒤에 열린다.

04 심사가 정한 것. 05·07·09·22가 이 위에서 동시에 진행되므로, 아래의 자리에 **자기 파일에서 더하기만** 한다(04의 파일은 고치지 않는다).
- **테이블**(`app/db/04-심사.surql`): `clause`(조항: `title`, `doc` → `origin`, `first`·`last` 행, `text`) · `rule`(규칙 버전: `name` 한도·합산, `ver`, `value`, `clause`, 시행 기간 `since`·`until`) · `review`(심사: `ym`, `name`, `members`, `payouts`, `rules`, `total`, `limit`, `approver`, `status`, `marks`, `fixed`) · `act`(조치) · `decision`(결정: `review`, `kind`, `by`, `role`, `at`, `reason`, `source`) · `task`(작업: `kind`, `view`, `target`, `role`, `also`, `state`). 선 7~13·23·24는 선 테이블이 아니라 기록을 가리키는 필드다(스키마의 주석에 선 번호). 역할이 쓸 수 있는 것은 `decision`의 생성뿐이고 나머지는 코드(root)와 이벤트만 쓴다.
- **계산은 한 곳**(`t04_review.rs`): `recalc(db)`가 굳지 않은(`fixed` 없음) 심사를 03의 그룹과 규칙 버전으로 다시 만든다(구성·합산·한도·승인권자·심사 작업의 담당). 심사는 "아직 굳은 심사에 들지 않은 미지급 지급"이 있는 (그룹, 귀속월)마다 하나이고 id는 `귀속월-그 지급이 있는 첫 대리점`(`2026-06-D-011`)이다. **굳은 심사는 `recalc`가 절대 고치지 않는다**: 같은 대리점·귀속월의 굳은 심사가 이미 있으면 새 심사의 id는 `2026-06-D-011-2`, `-3`으로 번호가 붙는다(굳은 심사가 다시 쓰이려 하면 오류). 그 귀속월에 유효한 식별자 선이 하나도 없는 대리점은 자기만 든 그룹으로 심사가 만들어진다. 합산은 구성원의 그 귀속월 지급에서 원본 상태가 반려인 것만 뺀 합이라, 이미 굳은 심사의 지급도 새 심사의 합산에 든다. **선(13·20)이나 규칙(22), 지급을 바꾸는 티켓은 끝에 `super::t04_review::recalc(db).await?`를 부른다.** 그룹이 바뀌어 없어진 대기 심사는 작업과 함께 지워진다(그 심사에 붙은 결정을 어떻게 할지는 13번이 정한다). 순수 함수 `plan()`·`pick()`·`period()`는 가설(12)과 모의(22)가 그대로 쓸 수 있다.
- **굳히기**: 승인 결정이 만들어지면 이벤트 `t04_apply`가 `review.fixed`에 결정의 날짜를 찍는다. 그 뒤로 `recalc`는 그 심사를 건드리지 않는다. "당시"는 굳은 `review`의 값이고 "현재"는 `plan()`으로 다시 계산해 옆에 붙인다(09).
- **과거의 심사를 넣기(09)**: root로 `review`를 만들 때 `fixed`를 채우면 같은 구조에 들어간다. `decision`을 root로 만들면 `role`·`at`·`source`에 준 값이 그대로 남는다(역할의 세션에서는 DB가 `by`·`role`·`at`·`source = '시연'`으로 덮어쓴다). `kind = '승인'`이면 이벤트가 `fixed = at`으로 맞춘다. 이력은 `source`가 원본이면 `사유 없음(원본)`으로 보인다.
- **조치를 더하기(05 보류, 06 반려, 10 추인 …)**: 자기 `seed()`에서 `act`에 한 줄을 만든다 — ``CREATE act:`보류` SET states = ['대기'], to = '보류', who = '승인권자', reason = true;``. `states`는 심사가 이 상태일 때만, `to`는 결정 뒤의 상태(없으면 그대로), `who`는 역할 이름 또는 `'승인권자'`, `mark`는 심사에 이 표시가 있을 때만(추인: `'재검토'`), `reason`은 사유의 분류가 필수인지다. 그러면 권한(`fn::can` — `decision`의 생성 권한과 화면의 조치가 같이 쓴다), 조치 버튼, `POST /api/decide`, 이력이 그대로 따라온다. 이미 있는 조치를 넓힐 때(보류된 심사의 승인)는 그 줄을 `UPDATE`한다. 더 좁은 조건은 자기 이벤트에서 `THROW`한다.
- **사유(05)**: 결정의 `reason`은 `{ class 분류, memo 메모 }`. 화면은 `tickets/04-심사/review.ts`의 `reasonAtom`에 넣으면 조치 버튼이 함께 보내고 결정 뒤 비운다. `act.reason`이 참인 조치는 분류가 비면 버튼이 눌리지 않고 DB도 거절한다. 사유 칸은 `{ slot: 'reason', kind: L.심사 }` 조각으로 끼운다. 분류의 목록과 "기타면 메모 필수"는 05가 정한다. 정황이 걸린 건의 승인에 사유가 필수인 것(D41)은 정황(11)이 생긴 뒤의 일이다.
- **결정에 뒤따를 일을 걸기(07 지급 작업 등)**: 자기 스키마에서 `DEFINE EVENT tNN_이름 ON decision WHEN $event = 'CREATE' AND $after.kind = '승인' THEN { … }`. 이벤트는 역할의 결정으로도 root 권한으로 실행된다(실측). 심사는 `$after.review`.
- **작업을 더하기**: `CREATE task SET kind = '지급', view = '지급', target = <기록>, role = '회계·자금', also = [관여한 역할], source = '계산'`. `role`의 역할에게 "담당", `also`의 역할에게 "진행"으로 보인다(`state`가 대기·진행일 때). 끝나면 `state = '완료'`. `view`는 줄을 고르면 열리는 화면의 낱말(`targetAtom.kind`)이고 id는 `target`의 id다. 목록의 대상·귀속월·합산·표시는 **대상 기록의 `name`·`ym`·`total`·`marks`**에서 읽으므로, 심사가 아닌 대상을 가리키는 작업은 그 테이블에 이 필드를 둔다(없으면 빈칸). 심사 작업은 승인되면 `완료`가 되고, 보류·반려 뒤의 작업은 그 조치를 만드는 티켓이 정한다.
- **심사의 표시를 더하기(09 재검토, 11 정황 …)**: `UPDATE review SET marks += '재검토'`. 목록의 "표시" 열과 상세의 제목 줄에 덧표시로 보인다. 아이콘은 `ui/Mark.tsx`의 `icons`에 한 줄. **`marks`에 `'정황'`이 있는 심사는 여러 개를 골라 승인하는 데서 빠진다**(목록의 `pick`과 `POST /api/decide`가 같이 본다) — 11번은 표시만 붙이면 된다.
- **조회와 조치의 경로**: `GET /api/tasks` → `{ mine[], going[] }`(줄: `id, kind, view, target, name, ym, total, marks, role, pick`. 정황이 걸린 줄이 위, 그다음 합산이 큰 순) · `GET /api/reviews/{id}` → `{ review, members[{ id, name, match[], pays[] }], relation{ left, mid, right, lines }, rules[], actions[{ kind, reason }], history[] }` (`pays`는 그 구성원의 그 귀속월 지급 전부 — 금액의 합이 합산과 같다) · `POST /api/decide { ids[], kind, reason? }`(권한이 없으면 403. 여럿이면 승인만 되고, 정황이 없고 승인권자가 영업지원인 심사가 아니면 400. 전부 되거나 전부 안 된다).
- **심사 상세에 조각을 끼우기**: 값은 `useReview()`(`tickets/04-심사/review.ts`)로 읽는다(조각마다 따로 부르지 않고 조치 뒤에 저절로 다시 읽힌다). 가운데의 04 조각은 `order` -40(제목·숫자 줄) · -30(구성) · -20(관계) · -10(규정)이다. 조각 사이의 간격은 02와 같이 조각이 `mb-4`로 낸다. `{ slot: 'fact', kind: L.심사 }`로 끼운 조각은 `order`를 적지 않으면 규정 아래에 놓이고(11의 정황 줄, 12의 가설), 사이에 끼우려면 그 사이의 값을 적는다(09의 당시/현재: -35). 서버의 값이 더 필요하면 자기 경로를 따로 둔다.
- **규칙 버전(22)**: 새 버전은 `rule`에 `since`를 넣어 만들고 앞 버전의 `until`을 같은 날로 닫은 뒤 `recalc`를 부른다. 귀속월의 끝날에 시행 중인 버전이 적용된다(D14). 굳은 심사는 그때의 `rules`·`limit` 그대로다. 합산 규칙의 `value`(일치 수 2)는 기록이고, 03의 계산은 이 값을 읽지 않는다(2로 고정).
- **공통 부품**: `ui/Mark.tsx`(`Mark` 덧표시 — 아이콘 + 글자, 색 없음) · `ui/Figures.tsx`(`Figures` 숫자 줄 — `items`([이름표, 값]), children에 출처 표지. 항목은 쪼개지지 않고 항목 단위로 줄을 넘는다. 정황·지급·규정의 숫자 줄도 이것을 쓴다). 출처가 계산인 표지의 말풍선은 이름표와 값의 `dl`로 쓴다(낱말 항목은 03과 같은 것).

05 승인권자가 정한 것.
- **보류**(D8, D48): `act:보류`(대기인 심사를 그 심사의 승인권자가, 상태는 보류, 사유 필수). 굳지 않으므로 `recalc`가 계속 다시 계산하고 금액은 합산에 남는다. 보류된 심사는 승인권자가 언제든 승인할 수 있고(`act:승인`의 `states`에 보류) 그 승인에는 사유가 필수다(`need = ['보류']`). **06 반려는 `states = ['대기', '보류']`로 만든다.**
- **보류한 심사의 작업**: 이벤트 `t05_hold`가 `state = '진행'`으로 바꾼다. `/api/tasks`(04)는 내 담당이라도 `state`가 진행인 줄을 `going`에 놓는다(줄에 `state`가 더해졌다). **소명 결과가 나오면 20번이 ``UPDATE task SET state = '대기' WHERE target = <심사> AND kind = '심사'``로 담당에 되돌린다.** 승인되면 04가 완료로 끝낸다.
- **사유의 규칙은 DB가 강제한다**(`app/db/05-승인권자.surql`): `act`에 `classes`(그 조치에 고를 수 있는 분류. 비어 있으면 가리지 않는다) · `over`(심사의 상태가 열쇠이면 `classes` 대신 쓰는 목록: `{ '보류': [...] }`) · `need`(심사의 상태나 표시가 이 가운데 하나이면 사유 필수)를 더했다. `fn::must(조치, 심사)`는 필수인지, `fn::classes(조치, 심사)`는 고를 수 있는 분류, `fn::reason(필수, 분류 목록, 사유)`는 필수이면 분류가 있어야 하고 · 분류는 목록 안의 것이어야 하고 · 기타이면 메모가 있어야 참이다. `decision`의 생성 권한에 이것을 더했으므로(`DEFINE TABLE OVERWRITE decision`) 어기면 `POST /api/decide`가 403이다.
- **심사 상세의 `actions`**(04의 응답을 바꿨다): `[{ kind, reason, classes }]` — `reason`은 `act.reason`이 아니라 그 심사에서의 `fn::must`, `classes`는 `fn::classes`.
- **조치를 더하는 티켓(06 반려, 10 추인)**: `act`의 줄에 `reason`과 함께 `classes = ['…', '…', '기타']`를 적는다. 분류의 낱말은 `GLOSSARY.md`의 "분류"와 `copy.md`의 표에 먼저 더한다(명사 한 단어, 끝은 기타). 그러면 사유 칸의 목록, 버튼의 눌림, DB의 검사가 따라온다.
- **정황이 걸린 심사의 승인(11)**: ``UPDATE act:`승인` SET need += '정황';`` 한 줄이면 `marks`에 정황이 있는 심사의 승인에만 사유가 필수가 된다.
- **심사가 아닌 대상의 결정(10 종결, 11 기각, 17 불채택, 20 인정·불인정·보완)**: 자기 테이블의 생성 권한에서 `fn::reason(<필수인지>, <분류 목록>, reason)`을 부른다(결정의 사유는 같은 모양 `{ class, memo }`). 화면은 `ui/Reason.tsx`를 쓴다.
- **공통 부품**: `ui/Reason.tsx`(`Reason` 사유 — `groups`(조치마다 `{ of, classes }`. 하나면 조치 이름을 적지 않는다) · `value`·`onChange`(`Draft { of, class, memo }`, 빈 값은 `blank`). `ready(조치, 필수, d)`는 그 조치의 버튼을 누를 수 있는지(사유를 안 썼으면 필수가 아닐 때만, 썼으면 그 조치의 분류이고 기타이면 메모까지), `sent(d)`는 결정에 실어 보낼 모양이다).
- **심사 화면의 사유**: 쓰고 있는 사유는 `reasonAtom`(`tickets/04-심사/review.ts`, `Draft`)에 있다. 사유 칸(`tickets/05-승인권자`)이 채우고, 04의 조치 버튼이 `ready`로 눌림을 정하고 `sent`로 보낸다. 서버가 거절하면 버튼 옆에 서버의 낱말이 적색 표지로 보인다.
- **거절의 낱말은 넷이고 정하는 곳은 한 군데다**: `crate::refuse(낱말)`(`main.rs`) — `권한`(그 역할이 할 수 없다, 403) · `사유`(사유가 규칙에 맞지 않다) · `상태`(그 상태에서는 할 수 없다) · `대상`(없거나 꼴이 틀리다), 뒤의 셋은 400이고 본문은 `{ error: 낱말 }`뿐이다. 조치의 처리기는 **쓰기 전에** 대상 → 권한 → 상태 → 사유 순으로 따져 낱말을 돌려주고, DB의 권한 규칙은 그대로 둔다(마지막 방어선. 거기서 걸리면 권한). DB의 문구는 내보내지 않는다(`.map_err(|_| refuse("대상"))`). **본문을 받는 처리기는 axum의 `Json` 대신 `crate::Body(b): Body`로 받는다**(맨 끝 인자. JSON이 아닌 본문·빈 본문·`Content-Type` 없는 요청이 400 `대상`이 된다. 검사는 `c.raw(역할, 경로, 본문 글자, Content-Type)`). 심사의 결정은 `fn::refusal(조치, 심사, 사유)`(05의 스키마)가 낱말을 정하므로 `act`에 줄을 더하는 티켓은 따로 할 일이 없다. 자기 조치를 만드는 티켓은 07의 `pay()`처럼 자기 처리기에서 따진다. 화면은 서버의 낱말을 그대로 적색 표지로 보이고, 다음 조치를 누르거나 다른 대상을 열면 지운다(본보기: 04의 `Action`).
- **조치 버튼의 순서**: `act.seq`(작은 것이 앞. 승인 1, 보류 2, **06 반려는 3**, 적지 않으면 9). 심사 상세의 `actions`는 이 순서로 오고 `seq`가 실려 있다.
- **선택 칸**(`/api/tasks`의 `pick`): 담당에 있고, 대기이고, 정황이 없고, 승인권자가 영업지원이고, 승인에 사유가 필수가 아닌 줄에만 있다. 보류된 줄에는 없다.
- **이력의 줄**: 분류까지 한 줄, 메모는 그 아래에 따로(04의 `Line`).
- **선 30**: `decision.prev`(같은 심사의 바로 앞 결정). 역할의 결정은 DB가 채운다(보류를 푼 승인 → 그 보류, 10의 추인 → 과거의 승인, 06의 재상신 뒤 결정 → 반려). root로 넣는 과거의 결정은 값을 주면 그대로, 안 주면 같은 방식으로 채워진다.
- **화면 규약 검사**: `lint.mjs`가 다른 티켓의 폴더에서 가져오는 경로(`from '../04-심사/review'`)의 한글을 낱말로 보지 않게 했다.

07 지급이 정한 것.
- **지급 작업의 대상은 원본의 지급(`payout`) 그대로다**(`app/db/07-지급.surql`). 원본의 값은 `payout.status`(승인·미지급·반려)에 그대로 두고, 이 시스템의 **지급의 상태는 `payout.state`**(없음 → 대기 / 재심사 / 완료)에 따로 둔다. `state`가 없는 지급은 아직 승인된 심사에 들지 않은 것이다. 함께 붙는 필드: `state_source`(그 상태를 만든 것의 출처 — 사람의 조치면 시연. **`state`를 바꾸는 티켓(14)은 이것도 함께 넣는다**), `review`(이 지급을 승인한 심사), `name`·`total`(04의 작업 목록이 읽는 대상 이름과 금액).
- **지급 작업이 생기는 때**: 승인 결정마다 이벤트 `t07_task`가 그 심사의 `payouts` 가운데 `status = '미지급'`이고 `state`가 없는 지급마다 `state = '대기'`로 하고 작업(`kind`·`view` = 지급, `target` = 그 지급, `role` = 회계·자금, `also` = 영업지원과 승인한 역할)을 만든다. 한 지급에 작업은 하나다(뒤에 합쳐진 심사가 같은 지급을 합산에 넣어 승인돼도 다시 만들지 않는다).
- **지급으로 표시**: 회계·자금이 `remit`(지급 표시: `payout`, `by`, `role`, `at`, `source`)을 만드는 것이다. 권한은 `fn::payable(지급)`(역할이 회계·자금이고 `state = '대기'`) 하나가 정하고, 화면의 조치도 이것을 읽는다. 이벤트 `t07_done`이 `state = '완료'`, 지급 작업 `완료`로 만든다. 지급 하나에 `remit`은 하나뿐이다(UNIQUE).
- **지급 뒤에 뒤따를 일을 걸기(08 대사 작업)**: 자기 스키마에서 `DEFINE EVENT t08_이름 ON remit WHEN $event = 'CREATE' THEN { … }`. 지급은 `$after.payout`, 그 심사는 `$after.payout.review`. 대사 작업의 `target`을 그 지급으로, `view`를 `지급`으로 하면 목록에서 같은 지급 상세가 열린다.
- **재심사로 돌리기(14)**: `UPDATE <지급> SET state = '재심사'`만 하면 조치가 사라지고 DB도 지급을 거절한다(지급 작업은 그대로 담당에 남는다). 올바른 승인 뒤에 `state = '대기'`로 돌리면 다시 지급할 수 있다. 다시 승인된 심사를 가리키게 하려면 `review`도 함께 바꾼다(`t07_task`는 `state`가 이미 있는 지급을 건드리지 않는다).
- **조회와 조치의 경로**: `GET /api/pays` → `{ mine(지금 역할이 회계·자금인지), counts{ 대기, 재심사, 완료 }, rows[{ id, name, ym, amount, state }] }` · `GET /api/pays/{id}` → `{ pay{ id, name, dealer, ym, amount, state, review{ id, name }, source, file, row }, accounts[{ value, source, file, row }], can, history[{ role, at, source }] }`(지급 작업이 없는 지급은 404) · `POST /api/pay { id }`(권한이 없으면 403).
- **지급 상세에 조각을 끼우기**: 값은 `usePay()`(`tickets/07-지급/pay.ts`)로 읽는다. 가운데의 07 조각은 `order` -40(제목·숫자 줄: 금액, 계좌, 심사) 하나이고, `{ slot: 'fact', kind: L.지급 }`로 끼운 조각은 `order`를 적지 않으면 그 아래에 놓인다(08의 "대사"). 오른쪽 조치에 더할 것(08의 은행 회신 입력)은 `{ slot: 'action', kind: L.지급 }` 조각으로 끼우면 07의 조치 줄 아래에 놓인다 — 07의 조치 줄은 지급할 수 있으면 버튼, 지급 뒤에는 남긴 지급 표시 한 줄, 재심사이거나 담당이 아니면 `없음`이다. 서버의 값이 더 필요하면 자기 경로를 따로 둔다.
- **목록 위의 수**: `대기 n  재심사 n  완료 n`은 회계·자금에게만 보이고, 하나를 누르면 그 상태의 지급이 펼쳐진다(완료된 지급을 다시 여는 길). 지급 상세의 "심사"를 누르면 그 지급을 승인한 심사가 열린다(승인된 심사를 여는 길).
- **대리점 상세의 지급 줄**(02의 조각을 07이 고쳤다): `state`가 있는 지급은 그 상태와 `state_source`를 출처 표지로 보이고(표지는 여전히 원본의 행을 연다), 없는 지급은 원본의 값과 출처 원본이다. `GET /api/dealers/{id}`의 `payouts[]`에 `state`·`state_source`가 더해졌다.
- **지급의 확인 창과 틀린 요청**: 지급은 되돌릴 수 없어 확인 창을 거친다. `POST /api/pay`는 본문의 꼴이 틀리면 400 `대상`이고 DB의 문구를 내보내지 않는다. 상세 응답의 `role`은 담당하는 역할(대기인 지급을 담당이 아닌 역할이 열면 조치 자리에 `담당 회계·자금`).
- **계좌**: 지급 상세의 계좌는 그 대리점의 `acct` 선 가운데 오늘 유효한 것(`since` ≤ 오늘, `until` 없음 또는 오늘 뒤. `excluded`는 가리지 않는다)이다. 승인 뒤에 계좌가 바뀐 지급을 어느 계좌로 볼지는 13·08이 정한다.

08 대사가 정한 것(판정은 D49, 지급의 상태는 D54).
- **지급의 상태는 대기 → 이체 → 완료다(D54. 07의 규약에서 "지급하면 완료"라고 적힌 곳은 모두 이체로 읽는다)**: `remit`이 만들어지면 07의 `t07_done`이 `state = '이체'`로 하고, 회신이 성공이면 08의 `t08_match`가 `'완료'`로, 실패이면 `'대기'`로 돌린다. `GET /api/pays`의 `counts`는 `{ 대기, 재심사, 이체, 완료 }`. 이체의 색은 대기와 같다(`tokens.md`). 14가 재심사로 돌릴 수 있는 것은 여전히 대기인 지급이다(이체·완료는 이미 은행에 보낸 것).
- **테이블**(`app/db/08-대사.surql`): `reply`(회신: `payout`, `amount`, `account`, `result` 성공·실패, `by`, `role`, `at`, `source` 시연 — 역할이 쓰는 것은 이것뿐) · `recon`(대사 — 성공한 회신을 맞춰 본 결과: `payout`, `reply`, `review`(그 지급을 승인한 심사), `amount`·`accounts`(맞춰 본 승인된 금액과 등록된 계좌, 그때 값으로 굳힘), `diff`(맞지 않은 항목: 금액·계좌), `verdict` 일치·불일치, `at`, `source` 계산. 지급 하나에 하나).
- **대사 작업이 생기는 때**: `remit`이 만들어질 때마다 이벤트 `t08_task`가 작업(`kind` = 대사, `view` = 지급, `target` = 그 지급, `role` = 회계·자금, `also` = 그 지급의 지급 작업과 같은 역할)을 만든다. 회신이 들어오면 결과가 무엇이든 `완료`가 된다.
- **회신과 판정**: 회계·자금이 `reply`를 만든다. 권한은 `fn::repliable(지급)`(역할이 회계·자금이고 `state = '이체'` — 회신이 들어오면 상태가 옮겨 가므로 지급 시도 하나에 한 번) 하나가 정하고 화면의 조치도 이것을 읽는다. 이벤트 `t08_match`가 뒤를 잇는다 — 결과가 성공이면 `recon`을 만든다(금액이 `payout.amount`와 같고 계좌가 `fn::paid_accounts(지급)` 가운데 하나이면 일치, 아니면 불일치. 어느 쪽이든 지급은 `완료`가 된다). **결과가 실패이면 `recon`을 만들지 않고 지급을 `state = '대기'`로 돌리고 그 지급의 지급 작업을 다시 `대기`로 연다.**
- **07의 "지급 하나에 `remit` 하나"를 풀었다**(`REMOVE INDEX remit_once`): 실패한 뒤 다시 지급하면 `remit`이 하나 더 생긴다. 같은 시도를 두 번 표시하지 못하게 하는 것은 `fn::payable`의 `state = '대기'`가 맡는다. 07의 이력에는 지급 표시가 시도마다 한 줄씩 보인다.
- **등록된 계좌**: `fn::paid_accounts(지급)` = 그 지급을 한 날(이체·완료이면 마지막 `remit.at`, 지급 전이거나 실패해 대기로 돌아왔으면 오늘) 그 대리점에 유효한 `acct`의 값. **07의 지급 상세(`GET /api/pays/{id}`의 `accounts`)도 같은 날로 보게 고쳤다** — 완료된 지급은 뒤에 계좌가 바뀌어도(13) 지급한 날의 계좌를 보인다.
- **07에서 고친 것 하나 더**: 회신이 실패해 대기로 돌아온 지급을 담당이 아닌 역할이 열면 조치 자리에 지난 지급 표시가 아니라 `담당 회계·자금`이 보인다(`07-지급/index.tsx`의 `Action`).
- **정산 표시**: 그 심사가 승인한 지급(`payout.review = 심사`)이 모두 일치이면 `review.marks`에 `'정산'`이 붙는다(같은 이벤트). 아이콘은 `ui/Mark.tsx`.
- **불일치를 정황으로 잇기(11)**: 자기 스키마에서 `DEFINE EVENT t11_이름 ON recon WHEN $event = 'CREATE' AND $after.verdict = '불일치' THEN { … }`. 지급은 `$after.payout`, 심사는 `$after.review`, 무엇이 달랐는지는 `$after.diff`, 회신의 값은 `$after.reply.amount`·`account`, 맞춰 본 값은 `$after.amount`·`accounts`. 이미 남은 불일치는 `SELECT … FROM recon WHERE verdict = '불일치'`. 실패한 회신은 불일치가 아니므로 여기에 오지 않는다.
- **조회와 조치의 경로**: `GET /api/pays/{id}/recon` → `{ id, name, state, role, can, want{ amount, accounts[] }, reply{ amount, account, result, role, at, source }?, recon{ diff[], verdict, source }?, history[{ amount, account, result, role, at, source }] }`(지급 작업이 없는 지급은 404. `reply`는 지금 지급 시도의 회신 — 다시 지급하면 비워진다. `history`는 실패한 것까지 전부) · `POST /api/reply { id, amount, account, result }`(`crate::refuse`와 `Body`를 쓴다. 금액은 1 이상. 본문의 꼴이 틀리거나 없는 지급이면 400 `대상`, 회계·자금이 아니면 403 `권한`, 지급 전이거나 이미 회신한 시도이면 400 `상태`). 응답의 `lines[{ kind 지급·회신, result?, role, at, source }]`는 이력 — 지급 표시와 회신을 일어난 순서대로.
- **지급 상세의 조각**: 가운데에 "대사" 표(`order` 없음 → 07의 제목·숫자 줄 아래. 열은 승인 / 회신 / 비교, 줄은 지급 시도마다 금액·계좌 두 줄(시도가 둘 이상이면 앞에 번호)과 맨 아래의 출처 한 줄. 비교의 값은 일치 / 불일치 / 실패), 오른쪽 조치에 회신 입력(07의 조치 줄 아래. 승인된 값이 미리 들어 있고 고쳐서 보낸다), 이력은 08의 조각 하나가 지급 표시와 회신을 일어난 순서대로 보인다(`지급 · 사람 · 날짜` / `회신 · 결과 · 사람 · 날짜`. **07의 이력 조각은 뺐다** — 지급 상세의 이력에 줄을 더할 티켓은 `GET /api/pays/{id}/recon`의 `lines`에 더한다). 회신은 확인 창을 거친다. 회신 입력은 `state`가 이체일 때만 보인다.

09 재검토가 정한 것.
- **과거의 결정**(`app/db/09-재검토.surql`, `t09_again.rs`의 `seed`): 원본의 승인 196건·반려 4건마다 04의 구조 그대로 굳은 심사 하나와 결정 하나다. 심사의 id는 `귀속월-대리점`(`2026-01-D-011`), 구성은 그 대리점 단독, `total`은 그 지급의 금액, `approver`와 결정의 `role`은 원본의 값(영업지원), `source`는 원본이고 `file`·`row`는 그 지급의 행이다. 원본에 없는 것은 비운다: `rules = []`, `limit` 없음(화면은 `미상`), 결정의 `reason` 없음, 결정의 날짜(`at`) 없음(승인도 반려도. 화면은 `미상`). 원본의 지급일은 승인한 날이 아니므로 가운데에 `지급일`이라는 이름표로 따로 보인다(출처 원본).
- **승인 시점의 상한**: 과거의 승인의 `review.fixed`는 원본의 지급일이다(화면에 승인일로 보이지 않는다). 승인은 지급보다 늦을 수 없으므로 13이 "변경일과 인지일 사이의 승인인가"를 따질 때 이 값을 승인 시점의 상한으로 쓴다. 과거의 반려의 `fixed`는 적재한 날이며 다시 계산하지 않게 하는 표시일 뿐이다. 과거의 지급은 `payout.review`가 그 심사를 가리킨다(`state`는 없다 — 지급 작업이 생기지 않는다).
- **과거의 결정에도 `decision`의 이벤트가 실행된다.** 결정에 뒤따를 일을 거는 티켓(06 재상신 작업 등)은 원본의 결정을 빼려면 `$after.source != '원본'`을 조건에 넣는다. 심사나 결정을 세는 검사는 자기 것만 센다(`ym = '2026-06'`, `source != '원본'`).
- **계산은 한 곳**(`t09_again.rs`): `current(db) -> BTreeMap<심사 id, Now>`가 굳은 승인(`fixed` 있음, 상태 승인) 전부를 다시 본다. 구성은 그 귀속월에 하루라도 유효한 식별자 선의 그룹(03의 `links(period)` — 변경일 전의 귀속월은 바뀌지 않는다), 합산은 그 구성의 그 귀속월 지급에서 반려만 뺀 합(04의 `plan`), 한도는 그 귀속월에 시행 중인 규칙 버전(04의 `pick`)이다. `Now { ym, members, total, limit, approver, rules, again }`. **재검토(`again`)는 당시의 승인권자가 영업지원이고 현재의 승인권자가 영업임원인 것**이다(이 시스템에서 영업임원이 승인한 심사는 한도를 넘어도 재검토가 아니다). 현재 계산은 저장하지 않는다.
- **표시를 다시 맞추기**: `super::t09_again::remark(db).await?`가 `marks`에 `'재검토'`를 붙이고, 풀린 것은 뗀다(다른 표시와 과거의 기록은 건드리지 않는다). **선(13·20)·규칙(22)·지급을 바꾸는 티켓은 `recalc` 뒤에 이것을 부른다.** 13은 선의 `since`·`until`·`known`만 넣고 부르면 변경일부터의 귀속월만 재검토가 되고, 20은 선의 `excluded`만 바꾸고 부르면 풀린다(둘 다 09의 검사에 본보기가 있다). 승인 뒤 지급 전인 심사(D33)도 조건이 맞으면 표시가 붙는다 — 그 건을 재심사로 돌리는 것은 14의 일이다.
- **재검토에 일을 걸기(10 추인)**: 표시가 붙는 순간은 `DEFINE EVENT t10_이름 ON review WHEN $event = 'UPDATE' AND $after.marks CONTAINS '재검토' AND $before.marks CONTAINSNOT '재검토' THEN { … }`로 잡는다(09의 `seed`도 심사를 만든 뒤 `UPDATE`로 표시를 붙이므로 원본의 15건에도 실행된다). 풀리는 순간은 반대 조건이다. 조치는 04의 방법대로 `act`에 `mark = '재검토'`인 줄을 더한다.
- **조회 경로**: `GET /api/reviews/{id}/again` → `{ id, again, then{ members(수), total, approver }, now{ members[{ id, name }], total, limit, approver, rules[{ name, ver }] }, known, paid[{ at, source, file, row }], source: "계산" }`(`paid`는 원본에 지급일이 있는 지급). 굳은 승인이 아니면 404. `known`은 현재의 구성원 둘 이상이 함께 가리키는 식별자의 선 가운데 인지일이 있는 것의 가장 늦은 날이고, 모두 미상이면 `null`이다(13이 "당시에는 알 수 없었던 건"을 가릴 때 굳은 날 `review.fixed`와 견준다. 이 규칙을 바꾸려면 13이 확정한다). `GET /api/reviews/{id}`의 `review`에 `file`·`row`가 더해졌고 `limit`와 이력의 `at`은 `null`일 수 있다. `GET /api/dealers/{id}`의 `payouts[]`에 `review{ id, name, marks }`(없으면 `null`)가 더해졌다.
- **과거의 심사를 여는 길**: 대리점 상세의 지급 줄 "심사" 열(02의 조각을 09가 고쳤다). `payout.review`가 있는 지급(과거의 결정, 승인된 것)에 심사의 이름과 표시가 보이고 누르면 그 심사가 열린다. 작업 목록에는 과거의 심사가 없다.
- **지급일과 당시 / 현재**: `tickets/09-재검토/index.tsx`가 `{ slot: 'fact', kind: L.심사, order: -35 }`로 끼운다. 지급일은 원본에 지급일이 있는 승인된 심사에, 당시 / 현재는 표시에 재검토가 있는 심사에만 보인다.
- **공통 부품**: `ui/Compare.tsx`(`Compare` 두 열 비교 — `head`([당시, 현재]), `rows`([이름표, 값, 값?]). 값은 글자이고 두 값이 다른 줄만 굵다. 한쪽에만 값이 있는 줄은 굵게 하지 않는다. 12의 현재 / 가설, 22의 현재 / 모의도 이것을 쓴다).
- **화면 규약 검사**: `lint.mjs`가 다른 티켓의 폴더에서 가져오는 경로(`from '../04-심사/review'`)를 낱말로 보지 않게 했다(05와 같은 수정).

10 추인이 정한 것(D50, D52, D53).
- **묶음**(`app/db/10-추인.surql`의 `ratify`): 추인·종결 작업의 대상은 과거의 승인이 아니라 현재 계산의 그룹 × 귀속월이다(D50). 한 묶음은 그 (귀속월, 현재의 구성)에서 재검토이면서 영업임원이 아직 결정하지 않은 과거의 승인들(`reviews`)과 현재 계산의 값(`name` 금강상사11 외 2 · `members` · `total` · `limit` · `approver`), 표시(`marks`: 재검토 → 추인 또는 거부 → 종결)를 가진다. id는 `귀속월-현재 구성의 첫 대리점`(`2026-01-D-011`. 같은 자리에 결정된 묶음이 이미 있으면 `…-2`). 영업임원이 추인하거나 거부하면 `fixed`가 찍히고 그때의 값으로 남는다(다시 계산하지 않는다).
- **끼우는 방법은 하나다 — 09의 `remark(db)`를 부르면 된다.** `remark`가 표시를 맞춘 뒤 끝에서 `t10_ratify::bundle(db, &now)`를 부른다(09의 현재 계산을 그대로 받고 다시 계산하지 않는다). 13(변경)·20(소명)·22(규정)은 지금처럼 `recalc` 뒤에 `remark`만 부르면 추인 작업이 따라온다: 새로 재검토가 된 승인은 그 달의 묶음과 추인 작업이 생기고, 결정 전에 풀린 승인은 묶음에서 빠지며(금액·이름도 남은 구성으로 바뀐다), 하나도 남지 않은 묶음은 추인 작업과 함께 지워진다(D52). 이미 추인·거부된 심사는 다시 묶이지 않고, 결정된 묶음과 같은 달에 뒤늦게 재검토가 된 승인은 새 묶음(`…-2`)으로 따로 올라온다. 추인 뒤 종결 전에 재검토가 풀려도 추인 기록·표시·종결 작업은 그대로다(D52). 본보기는 10의 검사에 있다(자리 ①·②).
- **조치는 `act` 네 줄이다**: `추인`(seq 4, 영업임원 · 표시 재검토 · 사유 필수 · 정상/미인지/기타) · `거부`(seq 5, 영업임원 · 표시 재검토 · 사유 필수 · 정황/기타) · `종결`(seq 6, 내부 감시 · 표시 추인 · 사유 선택 · 정상/기타) · `이견`(seq 7, 내부 감시 · 표시 추인 · 사유 필수 · 소명/근거/기타). 넷 다 승인 상태의 심사에만 있고 심사의 상태를 옮기지 않는다(승인을 뒤집지 않는다). 권한·사유·거절의 낱말·이력은 04·05의 것 그대로이고 경로도 `POST /api/decide`다.
- **`act.without`**(10이 더했다): 심사에 이 표시 가운데 하나가 있으면 그 조치를 할 수 없다(추인·거부: `['추인', '거부']`, 종결·이견: `['종결']`). `fn::can`을 10의 스키마에서 `OVERWRITE`했다(04의 조건에 이 줄 하나를 더한 것). `fn::can`을 또 바꾸는 티켓은 이 줄을 남기고, **`fn::can` 안에서 `decision`을 조회하지 않는다**(그렇게 했더니 05의 "동시에 보낸 승인" 검사에서 진 쪽의 낱말이 상태가 아니라 권한으로 흔들렸다).
- **한 건에 내려진 결정은 묶음 전체에 남는다**(이벤트 `t10_spread`): 추인·거부·종결·이견이 묶음의 심사 하나에 만들어지면 같은 묶음의 나머지 심사에도 같은 결정(같은 사람·날짜·사유)이 만들어진다. 그래서 작업에서 연 화면에서 눌러도, 대리점 상세에서 연 과거의 심사에서 눌러도(04의 조치 버튼) 결과가 같다. 추인은 심사마다 그 과거의 승인에 이어진다(`decision.prev`, 선 30). 심사에는 표시 `추인`·`거부`·`종결`이 더해질 뿐이고(`재검토`는 09가 붙이고 뗀다) 과거의 기록은 바뀌지 않는다.
- **작업**: 추인 작업(`task:추인-<묶음 id>`, `kind`·`view` = 추인, `target` = 묶음, 담당 영업임원)은 추인하거나 거부하면 완료다. 추인이면 그때 종결 작업(`kind` = 종결, `view` = 추인, 같은 대상, 담당 내부 감시, `also` = 추인한 역할)이 생긴다. 이견이면 종결 작업이 `진행`이 되고(내부 감시와 영업임원의 진행. 열어서 종결할 수 있다) 종결되면 완료다. **추가 소명 요청을 만드는 티켓(17~20)은 소명 결과가 나오면 ``UPDATE task SET state = '대기' WHERE kind = '종결' AND target = <묶음>``으로 담당에 되돌린다.**
- **거부 뒤의 추인 정황(D52)과 그 기각(D53)은 아직 잇지 않았다 — 11(정황)이 w07에 들어온 뒤에 두 이벤트를 붙인다**(11의 `signal`·`fn::signal`·`ruling`이 있어야 한다. `signal.kind`의 ASSERT와 `GLOSSARY.md`의 정황의 종류에 `추인`을 더한다):
  1. ``DEFINE EVENT … ON ratify WHEN $event = 'UPDATE' AND $after.marks CONTAINS '거부' AND $before.marks CONTAINSNOT '거부' THEN { fn::signal('추인', record::id($after.id), string::concat($after.name, ' ', $after.ym), $after.members, $after.reviews, '계산'); };``(거부된 묶음마다 한 번 실행된다)
  2. ``DEFINE EVENT … ON ruling WHEN $event = 'CREATE' AND $after.kind = '기각' AND $after.signal.kind = '추인' THEN { fn::ratify_close(type::record('ratify', <정황 id에서 꺼낸 묶음 id>), $after); };`` — `fn::ratify_close(묶음, 기각의 기록)`(10의 스키마)은 거부된 묶음의 심사 하나에 종결 결정(기각의 사유·사람·날짜)을 남기고, `t10_spread`가 세 건·묶음에 퍼뜨려 종결 표시를 붙인다. 거부되지 않았거나 이미 종결된 묶음에는 아무 일도 하지 않는다. 이력은 `거부 · 영업임원` 다음 `종결 · 내부 감시 · <기각의 사유>`가 되어 추인 없이 종결된 것이 드러난다(10의 검사 "D53의 자리").
- **조회 경로**: `GET /api/ratifies/{id}` → `{ ratify{ id, name, ym, marks, total, limit, approver, source }, members[{ id, name }], reviews[{ id, name, total, approver, marks, paid, source, file, row }], target(결정을 보낼 심사 id), role(지금 차례인 역할: 결정 전 영업임원, 그 뒤 내부 감시, 종결됐으면 null), actions[{ kind, reason, classes, seq }], history[] }`(없으면 404). 화면은 `tickets/10-추인`(`kind: L.추인`): 가운데 -40(제목·숫자 줄) · -30(당시 / 현재, 과거의 승인 표), 오른쪽 조치·사유·이력.
- **작업을 세는 검사**: 영업임원의 담당에는 원본 상태에서 추인 작업 5건이 있다. 작업 목록을 보는 검사는 자기 종류(`kind`)의 줄만 센다(04의 검사 두 곳을 그렇게 고쳤다).
- **04의 `Line`**(이력의 한 줄)을 `export`했다: `import { Line } from '../04-심사'`.
- **14(재심사)가 알아야 할 것**: 이 시스템에서 영업지원이 승인한 6월 심사가 뒤에 재검토가 되면(D33의 건) 지금은 그것도 추인 묶음에 든다. 지급 전인 건을 재심사로 돌리고 추인에서 빼려면 14가 `bundle()`의 조건(`n.again`이고 결정된 묶음에 없는 것)에 "지급 전이 아닌 것"을 더한다.
- **만들지 않은 것**: 추가 소명 요청(D52: 소명의 일), 의견이 갈린 건의 CEO 보고(D34).

22 규정이 정한 것.
- **조회 경로**: `GET /api/rules`(모든 역할, 같은 내용) → `{ clauses[{ id, title, file, sha, first, last, text, source }], rules[{ id, name, ver, value, clause, since, until, prev{ name, ver } | null, source }], assumes[{ id(결정 번호), title, text, file, row, used[{ view, kind, id }], source: "가정" }] }`. 조항·규칙은 04의 테이블을 읽기만 한다. `GET /api/reviews/{id}`의 `rules[]`에 `clause`(조항의 id)가 더해졌다.
- **이전 버전(선 27)**: `rule.prev`(`app/db/22-규정.surql`). **새 규칙 버전을 만드는 쪽(23)이 앞 버전을 넣는다**(`prev = rule:\`한도-v1\``, 04가 적은 `since`·앞 버전의 `until`과 함께. 모의용 버전도 현재 버전에 잇는다). 화면은 `이전` 열에 `한도 v1`로, 시행은 `시행일 – 다음 버전의 시행일`로 보인다(시행일이 없으면 미상). 버전이 둘일 때의 본보기는 22의 검사에 있다(`rule:\`한도-t22\``).
- **가정의 목록은 저장하지 않는다.** `t22_rules.rs`가 `docs/graph-spec.md`를 실행 파일에 넣고, **가정**으로 굵게 표시된 줄마다 그 줄이 속한 결정(`### Dn. 제목`)의 번호·제목·줄의 글자·행을 모은다. D46의 "숫자가 기대는 가정" 표의 줄도 모은다(근거가 "가정 아님"인 줄과, 근거가 이미 모은 결정 번호뿐인 줄(D7)은 뺀다). 스펙에 **가정**을 더하거나 빼면 목록이 따라 바뀐다(수를 코드에 적지 않는다. 단위 검사는 모은 수 = 스펙의 표시 수를 본다). 새 가정의 쓰임은 `USED`에 더한다. 이미지에 스펙을 싣느라 `.dockerignore`와 `app/Dockerfile`에 한 줄씩 더했다.
- **가정이 쓰인 곳에 자기 화면을 잇기**: `t22_rules.rs`의 `USED`가 결정 번호마다 쓰인 화면의 낱말을 가진다(지금 심사·재검토·정황·소명·추인·대사). `WAYS`에 줄이 있는 낱말만 누를 수 있고(지금 심사·재검토·대사 — 대사는 가장 최근에 회신을 맞춰 본 지급이 열린다), 없는 낱말은 글자로만 보인다. **자기 화면을 만든 티켓(11 정황, 20 소명, 10 추인)은 `WAYS`에 `("낱말", "열 대상의 kind", "그 가정이 쓰인 기록 하나의 id를 돌려주는 SurrealQL 식")` 한 줄을 더한다.** 식이 NONE이면(그런 기록이 아직 없으면) 글자로만 보인다. 누르면 메뉴 "작업"에서 `{ kind, id }`가 열린다. 새 가정이 다른 화면에서 쓰이면 `USED`에 낱말을 더한다.
- **규정 화면에 조각을 끼우기(23 모의)**: 대상은 `{ kind: L.규정, id: 조항의 id }`이고 메뉴 "규정"에 들어오면 첫 조항이 저절로 열린다. 가운데의 22 조각은 `order` -10 하나(조항 · 규칙 · 가정 · AI)이고, `{ slot: 'fact', kind: L.규정 }`으로 끼운 조각은 `order`를 적지 않으면 그 아래에 놓인다. 오른쪽은 `{ slot: 'action', kind: L.규정 }`. 다른 화면에서 조항으로 오려면 `setMenu(L.규정)`과 `setTarget({ kind: L.규정, id })`를 함께 부른다(04의 규정 줄이 그렇게 한다).
- **낱말**: `GLOSSARY.md`에 시행 · 이전 · 쓰임 · 조사 · 요청서 · 정리 · 설명 · 결정을 더했다. AI가 하지 않는 일은 `결정 없음`으로 적는다(판정은 심사의 `_Avoid_`라 화면에 쓰지 않는다).
