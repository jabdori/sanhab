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
async fn gate(State(db): State<Db>, mut req: Request, next: Next) -> Result<Response, ApiError> {
    let deny = || err(StatusCode::UNAUTHORIZED, "접속");
    let token = req.headers().get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer ")).ok_or_else(deny)?;
    let s = as_user(&db, token).await.map_err(|_| deny())?;
    let role = q1(&s, "RETURN $auth.role;", json!({})).await.ok().and_then(|r| r.as_str().map(String::from)).ok_or_else(deny)?;
    req.extensions_mut().insert(Me { db: s, role });
    Ok(next.run(req).await)
}

/// 네 역할의 토큰. 접속 패스워드는 DB가 맞춰 본다
async fn sign_all(db: &Db, pass: &str) -> anyhow::Result<J> {
    let mut roles = vec![];
    for (user, role) in tickets::ROLES {
        roles.push(json!({ "role": role, "token": db::signin(db, user, pass).await? }));
    }
    Ok(json!({ "roles": roles }))
}

async fn enter(State(db): State<Db>, Json(b): Json<J>) -> R {
    let r = sign_all(&db, b["pass"].as_str().unwrap_or("")).await.map_err(|_| err(StatusCode::UNAUTHORIZED, "접속"))?;
    Ok(Json(r))
}

/// 초기화: DB를 원본 상태로 되돌린다. 토큰이 새로 발급되므로 접속과 같은 응답을 준다.
async fn reset(State(db): State<Db>) -> R {
    boot(&db, true).await?;
    Ok(Json(sign_all(&db, &demo_pass()).await?))
}

/// 스키마와 원본 적재. 볼륨이 사라져도(크레딧 소진) 원본에서 같은 상태로 다시 만든다.
/// 스키마가 그대로이면 건드리지 않는다(다시 배포해도 데이터가 남는다).
pub async fn boot(db: &Db, force: bool) -> anyhow::Result<bool> {
    let ver = orig::sha(&tickets::SCHEMAS.concat());
    if !force && q1(db, "RETURN meta:v.schema;", json!({})).await.is_ok_and(|v| v == ver.as_str()) {
        return Ok(false);
    }
    let name = db::dbname();
    q(db, &format!("REMOVE DATABASE IF EXISTS {name}; DEFINE DATABASE {name};"), json!({})).await?;
    for s in tickets::SCHEMAS {
        q(db, s, json!({})).await?;
    }
    tickets::seed(db).await?;
    q(db, "UPDATE meta:v SET schema = $ver;", json!({ "ver": ver })).await?;
    Ok(true)
}

pub fn app(db: Db) -> Router {
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
        .route("/healthz", get(|State(db): State<Db>| async move { Json(json!({ "ok": db.health().await.is_ok() })) }))
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
        let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
        println!("listening :{port}");
        axum::serve(listener, app(db)).with_graceful_shutdown(async { tokio::signal::ctrl_c().await.ok(); }).await?;
    }
    Ok(std::process::ExitCode::SUCCESS)
}
