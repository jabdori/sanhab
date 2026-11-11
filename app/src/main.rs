//! W07 판매장려금 관련자 통제 — axum 백엔드.
//! 판단 로직은 DB(schema.surql의 fn::check/reconcile, PERMISSIONS, EVENT)에 있고 여기는 얇은 HTTP 계층이다.
//! 실시간은 웹소켓 대신 CHANGEFEED 폴링(/api/feed) — lounge가 WS 미지원.
mod check;
mod db;
mod seed;

use anyhow::Context;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use db::{Db, as_user, q, q1, rid};
use serde_json::{Value as J, json};
use std::collections::HashMap;

const INDEX: &str = include_str!("../public/index.html");
const FEED_TABLES: [&str; 4] = ["decision", "work", "approval", "related"];

struct ApiError(StatusCode, J);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response { (self.0, Json(self.1)).into_response() }
}
impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        let code = if e.to_string() == "bad id" { StatusCode::BAD_REQUEST } else { StatusCode::INTERNAL_SERVER_ERROR };
        ApiError(code, json!({ "error": format!("{e:#}") }))
    }
}
fn err(code: StatusCode, msg: &str) -> ApiError { ApiError(code, json!({ "error": msg })) }
type R = Result<Json<J>, ApiError>;
type P = Query<HashMap<String, String>>;

fn token(h: &HeaderMap) -> Option<&str> {
    h.get("authorization")?.to_str().ok()?.strip_prefix("Bearer ")
}
/// 로그인 사용자 세션. 토큰은 DB가 검증($auth 조회 실패 = 401).
async fn user(db: &Db, h: &HeaderMap) -> Result<Db, ApiError> {
    let t = token(h).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "로그인 필요"))?;
    let s = as_user(db, t).await.map_err(|_| err(StatusCode::UNAUTHORIZED, "토큰 무효"))?;
    match q1(&s, "SELECT id, role FROM $auth;", json!({})).await {
        Ok(J::Array(a)) if !a.is_empty() => Ok(s),
        _ => Err(err(StatusCode::UNAUTHORIZED, "로그인 필요")),
    }
}
/// ?id= 를 검증된 (tb, key) 바인딩으로 — 사용자 입력은 쿼리 문자열에 절대 삽입하지 않는다.
fn id_vars(p: &HashMap<String, String>) -> Result<J, ApiError> {
    let (tb, key) = rid(p.get("id").map(String::as_str).unwrap_or(""))?;
    Ok(json!({ "tb": tb, "key": key }))
}
fn id_of(v: &J) -> Result<J, ApiError> {
    let (tb, key) = rid(v.as_str().unwrap_or(""))?;
    Ok(json!({ "tb": tb, "key": key }))
}

async fn health(State(db): State<Db>) -> Json<J> { Json(json!({ "ok": db.health().await.is_ok() })) }

/// 배포 환경에서 바깥 서비스(OpenAI, 업스테이지)를 호출할 수 있는지 확인한다. 응답 코드만 돌려주고 키와 본문은 내보내지 않는다.
async fn diag() -> Json<J> {
    let c = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().unwrap();
    let mut out = serde_json::Map::new();
    for (name, url, var) in [
        ("openai", "https://api.openai.com/v1/models", "OPENAI_API_KEY"),
        ("upstage", "https://api.upstage.ai/v1/models", "UPSTAGE_API_KEY"),
    ] {
        let key = std::env::var(var).unwrap_or_default();
        let r = match c.get(url).bearer_auth(&key).send().await {
            Ok(r) => json!({ "reached": true, "status": r.status().as_u16(), "key_set": !key.is_empty() }),
            Err(e) => json!({ "reached": false, "error": e.without_url().to_string(), "key_set": !key.is_empty() }),
        };
        out.insert(name.into(), r);
    }
    Json(J::Object(out))
}

async fn login(State(db): State<Db>, Json(b): Json<J>) -> R {
    let t = db::signin(&db, b["user"].as_str().unwrap_or(""), b["pass"].as_str().unwrap_or(""))
        .await
        .map_err(|_| err(StatusCode::UNAUTHORIZED, "로그인 실패"))?;
    Ok(Json(json!({ "token": t })))
}

async fn decisions(State(db): State<Db>) -> R {
    Ok(Json(q1(&db, "SELECT id, agency, agency.name AS agency_name, period, amount, acceptance, knowledge, decided_level, decided_at, group_total, required_level
        FROM decision WHERE acceptance != 'accepted' OR knowledge != NONE ORDER BY period DESC, agency;", json!({})).await?))
}

async fn works(State(db): State<Db>) -> R {
    Ok(Json(q1(&db, "SELECT *, target.agency.name ?? target.name AS target_name FROM work ORDER BY created_at DESC;", json!({})).await?))
}

async fn check_decision(State(db): State<Db>, Query(p): P) -> R {
    Ok(Json(q1(&db, "fn::check(type::record($tb, $key), time::now());", id_vars(&p)?).await?))
}

/// 승인은 사용자 세션으로 실행 → DB PERMISSIONS가 권한을 강제. 거부는 오류가 아니라 빈 결과(OK+[]).
async fn approve(State(db): State<Db>, h: HeaderMap, Query(p): P) -> R {
    let v = id_vars(&p)?;
    let s = user(&db, &h).await?;
    let made = q1(&s, "CREATE approval SET decision = type::record($tb, $key);", v.clone()).await?;
    if made.as_array().is_some_and(|a| !a.is_empty()) {
        return Ok(Json(json!({ "approval": made[0] })));
    }
    let check = q1(&db, "fn::check(type::record($tb, $key), time::now());", v).await?;
    Err(ApiError(StatusCode::FORBIDDEN, json!({ "error": "승인 권한 없음 또는 근거 미충족", "check": check })))
}

async fn change_ident(State(db): State<Db>, h: HeaderMap, Json(b): Json<J>) -> R {
    user(&db, &h).await?;
    if !["rep", "address", "account"].contains(&b["kind"].as_str().unwrap_or("")) {
        return Err(err(StatusCode::BAD_REQUEST, "kind"));
    }
    let mut v = id_of(&b["agency"])?;
    v["kind"] = b["kind"].clone();
    v["value"] = json!(b["value"].as_str().unwrap_or_default());
    v["vf"] = b["valid_from"].clone();
    v["rec"] = b["recorded_at"].clone();
    v["note"] = json!(b["note"].as_str().unwrap_or("시연 조건 변경"));
    q(&db, "fn::change_ident(type::record($tb, $key), $kind, $value, <datetime>$vf, <datetime>$rec, { kind: 'assumption', note: $note });", v).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn vindication(State(db): State<Db>, h: HeaderMap, Json(b): Json<J>) -> R {
    user(&db, &h).await?;
    if !["not_related", "correct_valid_from"].contains(&b["effect"].as_str().unwrap_or("")) {
        return Err(err(StatusCode::BAD_REQUEST, "effect"));
    }
    let mut v = id_of(&b["edge"])?;
    v["effect"] = b["effect"].clone();
    v["evidence"] = json!(b["evidence"].as_str().unwrap_or_default());
    v["vf"] = b["valid_from"].clone();
    Ok(Json(q1(&db, "CREATE vindication CONTENT { edge: type::record($tb, $key), effect: $effect, evidence: $evidence,
        valid_from: IF $vf { <datetime>$vf } };", v).await?))
}

async fn settle(State(db): State<Db>, h: HeaderMap, Query(p): P) -> R {
    user(&db, &h).await?;
    Ok(Json(q1(&db, "UPDATE type::record($tb, $key) SET state = 'settled';", id_vars(&p)?).await?))
}

/// 인과 추적: 정방향(무엇을 일으켰나) / 역방향(왜 생겼나)
async fn trace(State(db): State<Db>, Query(p): P) -> R {
    let r = q(&db, "LET $r = type::record($tb, $key);
        LET $down = (SELECT VALUE @.{..+collect}(->caused->?) FROM ONLY $r) ?? [];
        LET $up = (SELECT VALUE @.{..+collect}(<-caused<-?) FROM ONLY $r) ?? [];
        LET $nodes = array::union([$r], array::union($down, $up));
        RETURN { id: $r, effects: $down, causes: $up,
          edges: (SELECT in, out, rule, note, at FROM caused WHERE in IN $nodes OR out IN $nodes) };", id_vars(&p)?).await?;
    Ok(Json(r.into_iter().last().unwrap_or(J::Null)))
}

/// 폴링 피드. since = versionstamp(10진 문자열, 2^53 초과라 JS 숫자로 다루면 깨짐). 없으면 최근 5초.
async fn feed(State(db): State<Db>, Query(p): P) -> R {
    let since: Option<u128> = p.get("since").and_then(|s| s.parse().ok());
    // SINCE는 리터럴만 받으므로 첫 폴링 시각은 DB가 만든 datetime을 다시 리터럴로
    let from = match since {
        Some(n) => n.to_string(),
        None => format!("d'{}'", q1(&db, "RETURN time::now() - 5s;", json!({})).await?.as_str().unwrap_or_default()),
    };
    let sql: String = FEED_TABLES.iter().map(|t| format!("SHOW CHANGES FOR TABLE {t} SINCE {from} LIMIT 200;\n")).collect();
    let res = q(&db, &sql, json!({})).await?;
    let mut out: Vec<(u128, J)> = vec![];
    for (i, r) in res.into_iter().enumerate() {
        for mut c in r.as_array().cloned().unwrap_or_default() {
            let vs = c["versionstamp"].as_u64().map(u128::from).or_else(|| c["versionstamp"].as_str().and_then(|s| s.parse().ok())).unwrap_or(0);
            if since.is_some_and(|s| vs <= s) { continue; } // SINCE는 포함 범위
            c["versionstamp"] = json!(vs.to_string());
            c["table"] = json!(FEED_TABLES[i]);
            out.push((vs, c));
        }
    }
    out.sort_by_key(|(vs, _)| *vs);
    let cursor = out.last().map(|(vs, _)| vs.to_string()).or(since.map(|s| s.to_string()));
    Ok(Json(json!({ "cursor": cursor, "changes": out.into_iter().map(|(_, c)| c).collect::<Vec<_>>() })))
}

async fn reset(State(db): State<Db>, h: HeaderMap) -> R {
    user(&db, &h).await?;
    Ok(Json(json!({ "seeded": seed::boot(&db, true).await? })))
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

#[tokio::main]
async fn main() -> anyhow::Result<std::process::ExitCode> {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".into());
    let cmd = std::env::args().nth(1).unwrap_or_else(|| "serve".into());
    if cmd == "health" {
        return Ok(healthcheck(&port));
    }
    let db = connect_retry().await?;
    match cmd.as_str() {
        "seed" => println!("seeded: {}", seed::boot(&db, true).await?),
        "check" => check::run(&db).await?,
        _ => {
            println!("boot seeded: {}", seed::boot(&db, false).await?);
            let app = Router::new()
                .route("/", get(|| async { Html(INDEX) }))
                .route("/healthz", get(health))
                .route("/api/diag", get(diag))
                .route("/api/login", post(login))
                .route("/api/decisions", get(decisions))
                .route("/api/works", get(works))
                .route("/api/check", get(check_decision))
                .route("/api/approve", post(approve))
                .route("/api/change-ident", post(change_ident))
                .route("/api/vindication", post(vindication))
                .route("/api/work/settle", post(settle))
                .route("/api/trace", get(trace))
                .route("/api/feed", get(feed))
                .route("/api/reset", post(reset))
                .with_state(db);
            let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
            println!("listening :{port}");
            axum::serve(listener, app).with_graceful_shutdown(async { tokio::signal::ctrl_c().await.ok(); }).await?;
        }
    }
    Ok(std::process::ExitCode::SUCCESS)
}
