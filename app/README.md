# SanHab (W07) — 앱

규약(폴더, 주고받는 방식, 검사, 띄우기)은 `.scratch/w07/implementer-guide.md`의 "규약"에 있다.

```sh
cp .env.example .env                        # 루트에서
docker compose -p axw up -d --build         # http://localhost:3000
docker compose -p axw exec app /w07 check   # 자동 검사(DB를 초기화한다)
```

| 곳 | 내용 |
|---|---|
| `src/main.rs` | 접속, 초기화, 화면 파일, /api의 문 |
| `src/tickets.rs`, `src/tickets/` | 티켓마다 한 파일: 스키마, 경로, 적재, 검사 |
| `src/check.rs` | 자동 검사의 도구(실제 서버를 HTTP로 부른다) |
| `src/db.rs`, `src/orig.rs` | DB 연결과 역할 세션, 원본 자료 |
| `db/` | 티켓마다 스키마 한 파일 |
| `web/` | 화면(React 19, Base UI, Tailwind CSS 4, jotai). 빌드 결과가 실행 파일에 포함된다 |

AXHub 조건: 웹소켓 없음(HTTP만), db는 포트 선언과 root 실행, 볼륨이 사라지면 부팅 때 원본에서 다시 적재.
