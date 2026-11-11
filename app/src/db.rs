//! SurrealDB 연결. 배포 환경(lounge)이 웹소켓을 지원하지 않으므로 HTTP 엔진만 쓴다.
use anyhow::{Context, Result, bail};
use serde_json::{Value as Json, json};
use surrealdb::Surreal;
use surrealdb::engine::remote::http::{Client, Http};
use surrealdb::opt::auth::{Record, Root};
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
pub async fn signin(db: &Db, user: &str, pass: &str) -> Result<String> {
    let s = db.clone();
    let t = s
        .signin(Record { namespace: ns(), database: dbname(), access: "staff".into(), params: json!({ "user": user, "pass": pass }) })
        .await
        .context("로그인 실패")?;
    Ok(t.access.into_insecure_token())
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

/// 외부 입력 레코드 ID("decision:`RB-00054`" 등) → (table, key). 테이블은 화이트리스트.
pub fn rid(s: &str) -> Result<(String, String)> {
    const TABLES: &[&str] = &["decision", "work", "agency", "related", "approval", "rebate", "deposit", "vindication", "clause", "rule"];
    let (tb, key) = s.split_once(':').context("bad id")?;
    let key = key.trim_matches(|c| c == '`' || c == '⟨' || c == '⟩');
    if !TABLES.contains(&tb) || key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        bail!("bad id");
    }
    Ok((tb.into(), key.into()))
}

#[cfg(test)]
mod tests {
    #[test]
    fn rid_whitelist() {
        assert_eq!(super::rid("decision:`RB-00054`").unwrap(), ("decision".into(), "RB-00054".into()));
        assert!(super::rid("staff:exec").is_err());
        assert!(super::rid("decision:x;REMOVE").is_err());
    }
}
