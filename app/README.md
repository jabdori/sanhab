# W07 판매장려금 관련자 통제 — 앱

## 실행
```sh
cp .env.example .env                    # 루트에서
docker compose -p axw up -d --build     # http://localhost:3000
docker compose -p axw exec app /w07 check   # 시나리오 자기검증(DB를 원본 기준 재적재)
```
로컬 개발(Rust ≥1.97): DB만 `docker run -p 18000:8000 surrealdb/surrealdb:v4.0.1 start --user root --pass root 'surrealkv:///data/db?versioned=true'` 후 `cargo run`(기본 `localhost:18000`, root/root). 하위 명령: `serve`(기본) · `seed` · `check` · `health`. 단위 테스트는 `cargo test`.

## 구조
| 파일 | 역할 |
|---|---|
| `db/schema.surql` | 스키마 v1 — 문서→조항→규칙@버전, 원본, 이중시간 관계 그래프, 판정/Work/인과(`caused`), DB 권한 |
| `db/seed.surql` | 원본 → 그래프 변환 로직(SurrealQL 한 곳) |
| `src/seed.rs` | 원본 CSV·규정을 가공 없이 바인딩해 `seed.surql` 실행. `meta:v.schema_version` 불일치·부재 시 DB 재생성 후 적재. 원본은 바이너리에 포함, sha256을 `meta:v.sources`에 기록 |
| `src/db.rs` | HTTP 엔진 연결, 요청별 사용자 세션, 레코드 ID 허용 목록 |
| `src/main.rs` | axum HTTP API + 정적 UI. 승인은 사용자 토큰으로 실행(DB가 권한 강제) |
| `src/check.rs` | 정상 / 그룹합산 / 정보부족 / 조건변경 / 소명정정 / 역추적 assert |

## AXHub 배포 제약 → 대응
| 제약 | 대응 |
|---|---|
| lounge 웹소켓 미지원 | Rust SDK는 HTTP 엔진만 사용(WS 기능 제외), LIVE SELECT 미사용. 브라우저는 `/api/feed` 3초 폴링(CHANGEFEED versionstamp 커서, u128로 파싱, 브라우저에는 문자열로 전달) |
| 공개 이미지는 이름:태그 | `surrealdb/surrealdb:v4.0.1` 고정 태그(SDK `=4.0.1`과 일치) |
| named volume: 재배포·재시작 유지, 크레딧 소진 일시정지 시 소실 | 모든 판정 상태는 원본에서 결정적으로 재생성 → 부팅 시 빈 DB면 자동 재적재. 잃는 것은 시연 중 조작분뿐(초기화 버튼과 동일 상태) |
| 크레딧 1만, 심사 기간 절전 없음 | 2컨테이너(distroless 단일 바이너리 69MB + SurrealDB). 마감 전 불필요한 재배포 반복 금지 |

## 제출 zip
```sh
zip -r 참가자명_W07.zip . -x '.claude/*' '.codex/*' '.agents/*' '.env' 'app/target/*' '*.DS_Store'
```
