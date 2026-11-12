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
    let db = Surreal::new::<Http>(env("SURREAL_ADDR", "localhost:18000")).await?;
    db.signin(Root { username: env("SURREAL_USER", "root"), password: env("SURREAL_PASS", "root") }).await?;
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
pub async fn as_user(db: &Db, token: &str) -> Result<Db> {
    let s = db.clone();
    s.authenticate(token.to_string()).await.context("토큰 무효")?;
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
