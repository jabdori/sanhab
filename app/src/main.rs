//! W07 SanHab — axum 서버. 화면(app/web의 빌드 결과)과 /api를 한 실행 파일로 낸다.
//! 티켓의 기능은 `tickets/`에 있고 여기는 접속, 초기화, 화면 파일만 다룬다. lounge가 웹소켓을 지원하지 않으므로 화면은 HTTP로만 부른다.
mod check;
mod db;
mod orig;
mod tickets;

use anyhow::Context;
use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use db::{Db, as_user, q, q1};
use serde_json::{Value as J, json};

/// 화면 파일. 이름이 고정이라(vite.config.ts) 그대로 포함한다. 빌드: `npm --prefix app/web run build`
const INDEX: &str = include_str!("../web/dist/index.html");
const JS: &str = include_str!("../web/dist/assets/app.js");
const CSS: &str = include_str!("../web/dist/assets/app.css");
const FONT: &[u8] = include_bytes!("../web/dist/assets/PretendardVariable.woff2");

pub struct ApiError(pub StatusCode, pub J);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response { (self.0, Json(self.1)).into_response() }
}
impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self { ApiError(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": format!("{e:#}") })) }
}
pub fn err(code: StatusCode, msg: &str) -> ApiError { ApiError(code, json!({ "error": msg })) }
/// 조치의 거절. 낱말은 넷뿐이다: 권한(그 역할이 할 수 없다, 403) · 사유(사유가 규칙에 맞지 않다) · 상태(그 상태에서는 할 수 없다) · 대상(없거나 꼴이 틀리다) — 뒤의 셋은 400.
/// 처리기는 쓰기 전에 낱말을 정하고(대상 → 권한 → 상태 → 사유 순으로 따진다), DB의 권한 규칙은 마지막 방어선으로 남긴다. DB의 문구는 내보내지 않는다
pub fn refuse(word: &str) -> ApiError { err(if word == "권한" { StatusCode::FORBIDDEN } else { StatusCode::BAD_REQUEST }, word) }
/// 조치의 쓰기. `word`는 거절의 낱말을 돌려주는 쿼리(걸리는 것이 없으면 NONE), `write`는 역할의 세션으로 기록을 만드는 쿼리다. 둘 다 `vars`를 받는다.
/// 낱말이 있으면 그것으로 거절하고, 없으면 쓴다. 쓰지 못했으면(같은 대상에 다른 조치가 동시에 와서 쓰기 충돌이 났거나 DB의 권한 규칙에 걸려 빈 결과)
/// 낱말을 다시 따진다 — 이긴 쪽이 끝났으면 상태가 나오고, 아직이면 다시 써 본다. 끝까지 까닭 없이 쓰지 못하면 권한. DB의 문구는 내보내지 않는다
pub async fn attempt(db: &Db, word: &str, write: &str, vars: J) -> Result<J, ApiError> {
    for _ in 0..8 {
        if let Some(w) = q1(db, word, vars.clone()).await.map_err(|_| refuse("대상"))?.as_str() {
            return Err(refuse(w));
        }
        if let Ok(made) = q1(db, write, vars.clone()).await && made.as_array().is_none_or(|a| !a.is_empty()) {
            return Ok(made);
        }
    }
    Err(refuse("권한"))
}
/// 요청의 본문(JSON). 조치의 처리기는 axum의 `Json` 대신 이것으로 받는다(맨 끝 인자): JSON이 아니거나 비었거나 `Content-Type`이 없어도 axum의 문장이 아니라 400 `대상`이 나간다
pub struct Body(pub J);
impl<S: Send + Sync> axum::extract::FromRequest<S> for Body {
    type Rejection = ApiError;
    async fn from_request(req: Request, s: &S) -> Result<Self, ApiError> {
        let b = axum::body::Bytes::from_request(req, s).await.map_err(|_| refuse("대상"))?;
        serde_json::from_slice(&b).map(Body).map_err(|_| refuse("대상"))
    }
}
/// 처리기의 반환형
pub type R = Result<Json<J>, ApiError>;

/// 요청한 사람. `db`는 그 역할의 세션이라 DB의 PERMISSIONS가 적용된다. 조치는 반드시 이 세션으로 실행한다.
#[derive(Clone)]
pub struct Me {
    pub db: Db,
    pub role: String,
}

pub fn demo_pass() -> String { std::env::var("DEMO_PASS").unwrap_or_else(|_| "demo".into()) }

/// /api 전체의 문. 토큰은 DB가 검증한다. 접속(`/api/enter`)만 이 문 밖에 있다.
async fn gate(State(db): State<std::sync::Arc<Db>>, mut req: Request, next: Next) -> Result<Response, ApiError> {
    let deny = || err(StatusCode::UNAUTHORIZED, "접속");
    let token = req.headers().get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")).ok_or_else(deny)?;
    let me = match as_user(&db, token).await {
        Ok(s) => q1(&s, "RETURN $auth.role;", json!({})).await.ok().and_then(|r| r.as_str().map(String::from)).map(|role| Me { db: s, role }),
        Err(_) => None,
    };
    let Some(me) = me else {
        // 다른 프로세스(배포 중 함께 뜬 앱)가 다시 적재하면 받아 둔 토큰이 무효가 된다 — 그 토큰이면 받아 둔 토큰과 세션을 비워 다음 접속이 새로 받게 한다
        let mut g = TOKENS.lock().unwrap();
        if g.as_ref().is_some_and(|(t, _)| t.to_string().contains(token)) {
            *g = None;
            db::forget_sessions();
        }
        return Err(deny());
    };
    req.extensions_mut().insert(me);
    Ok(next.run(req).await)
}

/// 네 역할의 토큰. 접속 패스워드는 DB가 맞춰 본다
async fn sign_all(db: &Db, pass: &str) -> anyhow::Result<J> {
    let mut roles = vec![];
    for (user, role) in tickets::ROLES {
        let t = tokio::time::timeout(std::time::Duration::from_secs(30), db::signin(db, user, pass)).await.map_err(|_| anyhow::anyhow!("{user} 로그인 30초 초과"))??;
        roles.push(json!({ "role": role, "token": t }));
    }
    Ok(json!({ "roles": roles }))
}

/// 발급해 둔 토큰(접속마다 네 번 로그인하면 argon2 대조가 작은 파드에서 수십 초 걸린다). 초기화 때 새로 채운다.
/// ponytail: 토큰 하나를 접속한 모두가 같이 쓴다(시연용 공용 패스워드라 사람마다 나눌 것이 없다). 유효 12시간이라 11시간이 지나면 다시 받는다
static TOKENS: std::sync::Mutex<Option<(J, std::time::Instant)>> = std::sync::Mutex::new(None);

async fn tokens(db: &Db, fresh: bool) -> anyhow::Result<J> {
    if !fresh {
        if let Some((t, at)) = TOKENS.lock().unwrap().clone() {
            if at.elapsed() < std::time::Duration::from_secs(11 * 3600) {
                return Ok(t);
            }
        }
    }
    let t = sign_all(db, &demo_pass()).await?;
    // 받은 토큰의 세션도 미리 인증해 둔다(첫 화면이 기다리지 않게)
    for r in t["roles"].as_array().into_iter().flatten() {
        db::as_user(db, r["token"].as_str().unwrap_or("")).await?;
    }
    *TOKENS.lock().unwrap() = Some((t.clone(), std::time::Instant::now()));
    Ok(t)
}

async fn enter(State(db): State<std::sync::Arc<Db>>, Body(b): Body) -> R {
    use subtle_eq::eq;
    if !eq(b["pass"].as_str().unwrap_or("").as_bytes(), demo_pass().as_bytes()) {
        return Err(err(StatusCode::UNAUTHORIZED, "접속"));
    }
    Ok(Json(tokens(&db, false).await.map_err(|_| err(StatusCode::UNAUTHORIZED, "접속"))?))
}

/// 길이와 상관없이 끝까지 견주는 비교(패스워드 대조의 시간으로 값을 알아내지 못하게)
mod subtle_eq {
    pub fn eq(a: &[u8], b: &[u8]) -> bool {
        let mut d = a.len() ^ b.len();
        for i in 0..a.len().max(b.len()) {
            d |= (*a.get(i).unwrap_or(&0) ^ *b.get(i).unwrap_or(&0)) as usize;
        }
        d == 0
    }
}

/// 초기화: DB를 원본 상태로 되돌린다. 토큰이 새로 발급되므로 접속과 같은 응답을 준다.
async fn reset(State(db): State<std::sync::Arc<Db>>) -> R {
    boot(&db, true).await?;
    Ok(Json(tokens(&db, true).await?))
}

/// 스키마와 원본 적재. 볼륨이 사라져도(크레딧 소진) 원본에서 같은 상태로 다시 만든다.
/// 스키마가 그대로이면 건드리지 않는다(다시 배포해도 데이터가 남는다).
pub async fn boot(db: &Db, force: bool) -> anyhow::Result<bool> {
    let ver = orig::sha(&tickets::SCHEMAS.concat());
    if !force && q1(db, "RETURN meta:v.schema;", json!({})).await.is_ok_and(|v| v == ver.as_str()) {
        return Ok(false);
    }
    let name = db::dbname();
    // 둘 이상이 동시에 뜨면(배포에서 컨테이너가 바뀌거나 다시 시작될 때) 한 곳만 적재한다. 다른 곳이 적재 중이면 끝나기를 기다린다.
    // 잠금은 적재가 지우는 데이터베이스 밖(`boot`)에 둔다. 3분이 지난 잠금은 멈춘 것으로 보고 치운다
    let me = format!("{:?}", std::time::SystemTime::now());
    let lock = format!("USE DB boot; DEFINE TABLE IF NOT EXISTS lock SCHEMALESS; DELETE lock:boot WHERE at < time::now() - 3m; CREATE lock:boot SET by = $me, at = time::now(); USE DB {name};");
    let unlock = format!("USE DB boot; DELETE lock:boot WHERE by = $me; USE DB {name};");
    let mut waited = false;
    while q(db, &lock, json!({ "me": me })).await.is_err() {
        waited = true;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
    if waited && !force && q1(db, "RETURN meta:v.schema;", json!({})).await.is_ok_and(|v| v == ver.as_str()) {
        q(db, &unlock, json!({ "me": me })).await.ok();
        return Ok(false);
    }
    let r = seed_all(db, &name, &ver).await;
    q(db, &unlock, json!({ "me": me })).await.ok();
    r.map(|_| true)
}

async fn seed_all(db: &Db, name: &str, ver: &str) -> anyhow::Result<()> {
    // 대화(D61)는 업무 데이터가 아니라 다시 적재해도 남는다: 지우기 전에 노드와 선을 받아 두었다가 적재 뒤에 되살린다(기록의 id는 원본에서 그대로라 선이 이어진다)
    let kept = q(db, "SELECT * FROM session; SELECT * FROM about; SELECT * FROM reads;", json!({})).await.unwrap_or_default();
    q(db, &format!("REMOVE DATABASE IF EXISTS {name}; DEFINE DATABASE {name};"), json!({})).await?;
    for s in tickets::SCHEMAS {
        q(db, s, json!({})).await?;
    }
    tickets::seed(db).await?;
    if let [s, a, r] = kept.as_slice() {
        if s.as_array().is_some_and(|x| !x.is_empty()) {
            // 받아 둔 JSON에서 id·시각은 글자다 — 기록 id와 날짜로 되돌려 넣는다
            q(
                db,
                "FOR $x IN $s { UPSERT type::record($x.id) SET role = $x.role, title = $x.title, target = $x.target, target_name = $x.target_name, messages = $x.messages, created = <datetime> $x.created, updated = <datetime> $x.updated };
                 FOR $x IN $a { RELATE (type::record($x.in))->about->(type::record($x.out)) };
                 FOR $x IN $r { RELATE (type::record($x.in))->reads->(type::record($x.out)) };",
                json!({ "s": s, "a": a, "r": r }),
            )
            .await?;
        }
    }
    db::forget_sessions();
    *TOKENS.lock().unwrap() = None; // 다시 적재하면 접속 역할이 새로 만들어져 받아 둔 토큰이 무효가 된다
    q(db, "UPDATE meta:v SET schema = $ver;", json!({ "ver": ver })).await?;
    Ok(())
}

/// 같은 루트 클라이언트를 요청마다 복제(clone)하면 SDK가 복제마다 새 세션을 만들어 쿼리 하나에 몇 초씩 걸렸다 — Arc로 나눠 쓴다
pub fn app(db: std::sync::Arc<Db>) -> Router {
    let api = tickets::routes()
        .route("/reset", post(reset))
        .fallback(|| async { err(StatusCode::NOT_FOUND, "없음") })
        .layer(middleware::from_fn_with_state(db.clone(), gate))
        .route("/enter", post(enter));
    let file = |kind: &'static str, body: &'static [u8]| get(move || async move { ([(header::CONTENT_TYPE, kind), (header::CACHE_CONTROL, "no-cache")], body) });
    Router::new()
        .route("/", file("text/html; charset=utf-8", INDEX.as_bytes()))
        .route("/assets/app.js", file("text/javascript; charset=utf-8", JS.as_bytes()))
        .route("/assets/app.css", file("text/css; charset=utf-8", CSS.as_bytes()))
        .route("/assets/PretendardVariable.woff2", file("font/woff2", FONT))
        .route("/healthz", get(|State(db): State<std::sync::Arc<Db>>| async move { Json(json!({ "ok": db.health().await.is_ok() })) }))
        .nest("/api", api)
        .with_state(db)
}

async fn connect_retry() -> anyhow::Result<Db> {
    let mut last = None;
    for _ in 0..60 {
        match db::connect().await {
            Ok(d) => return Ok(d),
            Err(e) => { last = Some(e); tokio::time::sleep(std::time::Duration::from_secs(1)).await; }
        }
    }
    Err(last.unwrap()).context("DB 연결 실패")
}

/// distroless 이미지용 헬스체크(curl 없음): 자기 자신의 /healthz에 HTTP/1.0 요청
fn healthcheck(port: &str) -> std::process::ExitCode {
    use std::io::{Read, Write};
    let ok = std::net::TcpStream::connect(format!("127.0.0.1:{port}")).ok().and_then(|mut s| {
        s.write_all(b"GET /healthz HTTP/1.0\r\n\r\n").ok()?;
        let mut b = String::new();
        s.read_to_string(&mut b).ok()?;
        Some(b.starts_with("HTTP/1.0 200") || b.starts_with("HTTP/1.1 200"))
    });
    if ok == Some(true) { std::process::ExitCode::SUCCESS } else { std::process::ExitCode::FAILURE }
}

/// 하위 명령: `serve`(기본) · `check [티켓]`(자동 검사, DB를 초기화한다) · `health`
#[tokio::main]
async fn main() -> anyhow::Result<std::process::ExitCode> {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    let mut args = std::env::args().skip(1);
    let cmd = args.next().unwrap_or_else(|| "serve".into());
    if cmd == "health" {
        return Ok(healthcheck(&port));
    }
    let db = connect_retry().await?;
    if cmd == "check" {
        let mut c = check::Check::start(db).await?;
        let r = tickets::check(&mut c, args.next().as_deref()).await;
        // 검사는 DB를 바꾼다. 통과하든 실패하든 원본 상태로 돌려놓아, 같은 DB로 앱을 띄워도 원본이 보이게 한다
        c.reset().await?;
        r?;
        println!("check OK");
    } else {
        println!("boot seeded: {}", boot(&db, false).await?);
        // 첫 접속이 기다리지 않게 토큰을 미리 받아 둔다
        {
            let d = db.clone();
            tokio::spawn(async move {
                let t0 = std::time::Instant::now();
                match tokio::time::timeout(std::time::Duration::from_secs(600), tokens(&d, true)).await {
                    Ok(Ok(_)) => println!("tokens ready {:.1}s", t0.elapsed().as_secs_f32()),
                    Ok(Err(e)) => println!("tokens failed {:.1}s: {e:#}", t0.elapsed().as_secs_f32()),
                    Err(_) => println!("tokens timeout 600s"),
                }
            });
        }
        // 일꾼은 따로 연결한다: 같은 클라이언트를 쓰면 일꾼의 요청 뒤에 화면의 요청이 줄을 서서 작은 파드에서 몇 초씩 밀렸다
        let worker = std::sync::Arc::new(connect_retry().await?);
        tokio::spawn(db::refresh_root(worker.clone()));
        tokio::spawn(tickets::ai_worker(worker));
        let db = std::sync::Arc::new(db);
        tokio::spawn(db::refresh_root(db.clone()));
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
        println!("listening :{port}");
        axum::serve(listener, app(db)).with_graceful_shutdown(async { tokio::signal::ctrl_c().await.ok(); }).await?;
    }
    Ok(std::process::ExitCode::SUCCESS)
}
