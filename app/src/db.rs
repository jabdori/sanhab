//! SurrealDB 연결. 배포 환경(lounge)이 웹소켓을 지원하지 않으므로 HTTP 엔진만 쓴다.
use anyhow::{Context, Result, bail};
use serde_json::{Value as Json, json};
use surrealdb::Surreal;
use surrealdb::engine::remote::http::{Client, Http};
use surrealdb::opt::auth::Root;
use surrealdb::types::Value;

pub type Db = Surreal<Client>;

fn env(k: &str, d: &str) -> String {
    std::env::var(k).unwrap_or_else(|_| d.into())
}
pub fn ns() -> String { env("SURREAL_NS", "axw") }
pub fn dbname() -> String { env("SURREAL_DB", "w07") }

/// root 세션: 서버 내부 전용(스키마·시드·조회). 사용자 권한이 필요한 쓰기는 `as_user`로.
pub async fn connect() -> Result<Db> {
    // 루트도 토큰으로 인증한다. 패스워드로 로그인한 클라이언트를 복제해 쓰면(axum의 State가 요청마다 복제한다) 요청마다 5초씩 밀렸다.
    // ponytail: 루트 토큰은 유효 시간이 있다 — `refresh_root`가 50분마다 새 토큰으로 바꾼다
    let db = Surreal::new::<Http>(env("SURREAL_ADDR", "localhost:18000")).await?;
    db.authenticate(root_token().await?).await?;
    let (ns, name) = (ns(), dbname());
    // 식별자는 바인딩 불가 → 형식 검증 후 삽입
    if !ns.chars().chain(name.chars()).all(|c| c.is_ascii_alphanumeric() || c == '_') {
        bail!("SURREAL_NS/SURREAL_DB 형식 오류");
    }
    db.query(format!("DEFINE NAMESPACE IF NOT EXISTS {ns};")).await?.check()?;
    db.use_ns(&ns).await?;
    db.query(format!("DEFINE DATABASE IF NOT EXISTS {name};")).await?.check()?;
    db.use_db(&name).await?;
    Ok(db)
}

async fn root_token() -> Result<String> {
    let t = Surreal::new::<Http>(env("SURREAL_ADDR", "localhost:18000")).await?;
    let j = t.signin(Root { username: env("SURREAL_USER", "root"), password: env("SURREAL_PASS", "root") }).await?;
    Ok(j.access.into_insecure_token())
}

/// 루트 토큰을 주기적으로 새로 받는다(서버가 오래 떠 있어도 끊기지 않게)
/// clone()은 새 세션이라 같은 클라이언트(Arc)를 받아야 그 세션의 토큰이 바뀐다
pub async fn refresh_root(db: std::sync::Arc<Db>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(50 * 60)).await;
        if let Ok(t) = root_token().await {
            db.authenticate(t).await.ok();
        }
    }
}

/// 레코드 사용자 로그인. clone()은 새 세션이므로 root 세션은 그대로 남는다.
/// 역할 사용자의 로그인. SDK의 `signin`은 같은 클라이언트를 같이 쓰는 다른 요청(일꾼의 AI 로그인 등)과 겹치면 첫 번에 20초 넘게 멈추고
/// 작은 파드에서는 끝나지 않았다(배포에서 접속이 504). DB의 `/signin`에 직접 보내면 0.05초다. 토큰은 그대로 `as_user`에 쓴다.
pub async fn signin(_db: &Db, user: &str, pass: &str) -> Result<String> {
    let r = reqwest::Client::new()
        .post(format!("http://{}/signin", env("SURREAL_ADDR", "localhost:18000")))
        .header("Accept", "application/json")
        .json(&json!({ "ns": ns(), "db": dbname(), "ac": "staff", "user": user, "pass": pass }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .context("로그인 실패")?;
    if !r.status().is_success() {
        bail!("로그인 실패 {}", r.status());
    }
    let b: Json = r.json().await.context("로그인 실패")?;
    b["token"].as_str().map(String::from).context("로그인 실패")
}

/// 토큰으로 인증된 별도 세션 — 이 세션의 쿼리에는 DB PERMISSIONS가 적용된다.
/// 토큰마다 한 번 인증한 세션을 받아 두고 다시 쓴다. SDK의 `authenticate`는 HTTP 엔진에서 한 번에 5초(처음은 30초 넘게) 걸려
/// 요청마다 부르면 배포의 작은 파드에서 모든 화면이 시간 초과가 됐다. 인증된 세션의 쿼리는 몇 ms다.
/// ponytail: 받아 둔 세션은 토큰이 바뀔 때(초기화) 비운다. 토큰이 쌓이는 것은 초기화마다 네 개라 그대로 둔다
static SESSIONS: std::sync::Mutex<Option<std::collections::HashMap<String, Db>>> = std::sync::Mutex::new(None);

pub fn forget_sessions() {
    *SESSIONS.lock().unwrap() = None;
}

pub async fn as_user(db: &Db, token: &str) -> Result<Db> {
    if let Some(s) = SESSIONS.lock().unwrap().as_ref().and_then(|m| m.get(token)) {
        return Ok(s.clone());
    }
    let _ = db;
    // 루트 클라이언트의 복제(clone)로 인증하면 그 세션의 쿼리가 매번 5초씩 걸렸다 — 토큰마다 따로 연결한다
    let s = Surreal::new::<Http>(env("SURREAL_ADDR", "localhost:18000")).await?;
    s.authenticate(token.to_string()).await.context("토큰 무효")?;
    s.use_ns(ns()).use_db(dbname()).await?;
    SESSIONS.lock().unwrap().get_or_insert_with(Default::default).insert(token.to_string(), s.clone());
    Ok(s)
}

/// 쿼리 실행 → 문장별 결과를 JSON으로. 한 문장이라도 실패하면 Err.
pub async fn q(db: &Db, sql: &str, vars: Json) -> Result<Vec<Json>> {
    let mut r = db.query(sql).bind(vars).await?.check()?;
    (0..r.num_statements()).map(|i| Ok(r.take::<Value>(i)?.into_json_value())).collect()
}
/// 마지막 문장 결과
pub async fn q1(db: &Db, sql: &str, vars: Json) -> Result<Json> {
    Ok(q(db, sql, vars).await?.pop().unwrap_or(Json::Null))
}
