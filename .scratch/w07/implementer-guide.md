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
- Rust 빌드 산출물은 작업 트리마다 따로 두지 않는다: `export CARGO_TARGET_DIR=/Users/code/Desktop/axwar-samilpwc/app/target` (디스크가 한 번 가득 찼다. 여러 에이전트가 동시에 빌드하면 잠금으로 차례를 기다린다).
- 시험용 DB는 자기 것을 띄운다(다른 에이전트와 섞이지 않게). 포트는 18100 + 티켓 번호:
  `docker run -d --rm --name w07-t<NN> -p <포트>:8000 surrealdb/surrealdb:v4.0.1 start --user root --pass root 'surrealkv:///tmp/db?versioned=true'`. 끝나면 지운다.
- 앱을 띄울 때의 포트는 3100 + 티켓 번호.
- 만드는 방식: Skill 도구로 `mattpocock-skills:tdd`를 불러 그 방식으로 만든다. 완료 조건의 숫자를 검사하는 자동 검사를 먼저 쓴다.
- 최소로 만든다. 티켓의 완료 조건에 없는 기능, 설정, 추상화를 더하지 않는다. 표준 라이브러리와 이미 있는 의존성을 먼저 쓴다.
- 계산(관련자, 그룹, 합산, 승인권자, 재검토, 정황 탐지)은 코드가 한다. AI는 이 값을 만들지도 고치지도 않는다.
- 사람의 조치는 그 사람의 역할 권한으로 실행되고, 권한은 DB가 강제한다.
- 화면의 낱말은 한 파일에만 둔다. 부품 안에 글자를 직접 적지 않는다. 색·크기도 한 파일의 이름만 쓴다.
- 가운데(사실)에는 AI가 쓴 글을 넣지 않는다. 오른쪽(판단)은 조치 → 사유 → 보고 → 경위 → 이력 순서를 지킨다.
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
(아직 없음)
