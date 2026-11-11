//! 01 바탕: 시스템의 시계와 역할. 접속(`/api/enter`)과 초기화(`/api/reset`)는 main.rs에 있다.
use crate::check::{Check, roles};
use crate::db::{Db, as_user, q, q1};
use crate::{Me, R, demo_pass, orig};
use anyhow::{Result, ensure};
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::json;

pub const SCHEMA: &str = include_str!("../../db/01-바탕.surql");
/// (계정, 역할). 화면의 역할 순서
pub const ROLES: [(&str, &str); 4] = [("support", "영업지원"), ("exec", "영업임원"), ("audit", "내부 감시"), ("acct", "회계·자금")];

pub fn routes() -> Router<Db> {
    Router::new().route("/state", get(state))
}

/// 띠가 보여 주는 것: 지금 역할과 시스템의 오늘
async fn state(Extension(me): Extension<Me>) -> R {
    let today = q1(&me.db, "RETURN time::format(fn::today(), '%Y-%m-%d');", json!({})).await?;
    Ok(Json(json!({ "role": me.role, "today": today })))
}

pub async fn seed(db: &Db) -> Result<()> {
    q(db, "CREATE meta:v SET today = d'2026-07-01T00:00:00Z';
        FOR $r IN $roles { CREATE type::record('staff', $r[0]) SET role = $r[1], pass = crypto::argon2::generate($pass); };",
        json!({ "roles": ROLES, "pass": demo_pass() })).await?;
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    // 원본 CSV 읽기
    ensure!(orig::csv(orig::AGENCY.1).len() == 50 && orig::csv(orig::REBATE.1).len() == 240 && orig::csv(orig::DEPOSIT.1).len() == 32, "원본 행 수");
    ensure!(orig::POLICY.1.contains("판매장려금") && orig::sha(orig::POLICY.1).len() == 64);

    // 접속 패스워드 없이는 어떤 자료 요청도 거절된다
    for (bearer, method, path) in [(None, "GET", "/api/state"), (Some("x.y.z"), "GET", "/api/state"), (None, "POST", "/api/reset"), (None, "GET", "/api/none")] {
        let (code, _) = c.call(bearer, method, path, None).await?;
        ensure!(code == 401, "{method} {path} 토큰 {bearer:?} → {code}");
    }
    let (code, _) = c.call(None, "POST", "/api/enter", Some(json!({ "pass": format!("{}x", demo_pass()) }))).await?;
    ensure!(code == 401, "틀린 패스워드 → {code}");

    // 패스워드를 넣으면 네 역할을 고를 수 있다. 띠: 역할, 날짜 2026-07-01
    let (code, r) = c.call(None, "POST", "/api/enter", Some(json!({ "pass": demo_pass() }))).await?;
    ensure!(code == 200);
    let names: Vec<&str> = r["roles"].as_array().into_iter().flatten().filter_map(|x| x["role"].as_str()).collect();
    ensure!(names == ["영업지원", "영업임원", "내부 감시", "회계·자금"], "역할 {names:?}");
    for role in names {
        ensure!(c.get(role, "/api/state").await? == json!({ "role": role, "today": "2026-07-01" }), "{role}의 띠");
    }

    // 역할의 세션은 시계와 역할을 고칠 수 없다(권한은 DB가 강제, 거절은 빈 결과)
    let s = as_user(&c.db, c.token("영업임원")).await?;
    q(&s, "UPDATE meta:v SET today = d'2030-01-01T00:00:00Z'; UPDATE staff SET role = '영업임원';", json!({})).await.ok();
    ensure!(c.get("영업임원", "/api/state").await?["today"] == "2026-07-01", "역할이 시계를 고침");
    ensure!(c.get("영업지원", "/api/state").await?["role"] == "영업지원", "역할이 역할을 고침");

    // 초기화는 DB를 원본 상태로 되돌린다
    q(&c.db, "UPDATE meta:v SET today = d'2026-07-15T00:00:00Z';", json!({})).await?;
    ensure!(c.get("회계·자금", "/api/state").await?["today"] == "2026-07-15");
    let (code, r) = c.post("회계·자금", "/api/reset", json!({})).await?;
    ensure!(code == 200, "초기화 → {code}");
    let fresh = roles(&r);
    ensure!(fresh.len() == 4, "초기화 뒤 역할 {}", fresh.len());
    let (code, r) = c.call(fresh.get("내부 감시").map(String::as_str), "GET", "/api/state", None).await?;
    ensure!(code == 200 && r == json!({ "role": "내부 감시", "today": "2026-07-01" }), "초기화 뒤 {code} {r}");

    // 화면과 Pretendard가 실행 파일에 들어 있고 바깥 서버를 부르지 않는다
    let (code, html) = c.call(None, "GET", "/", None).await?;
    ensure!(code == 200 && html.as_str().is_some_and(|h| h.contains("id=\"root\"") && !h.contains("=\"http")), "화면");
    let (code, css) = c.call(None, "GET", "/assets/app.css", None).await?;
    ensure!(code == 200 && css.as_str().is_some_and(|x| x.contains("url(/assets/PretendardVariable.woff2)") && !x.contains("url(http") && !x.contains("@import")), "색 파일");
    let (code, _) = c.call(None, "GET", "/assets/PretendardVariable.woff2", None).await?;
    ensure!(code == 200, "Pretendard → {code}");
    Ok(())
}

#[cfg(test)]
mod tests {
    /// AXHub 배포 조건(2026-11-11 실제 배포로 확인): 포트 선언, DB 사용자, 매니페스트
    #[test]
    fn deploy_constraints() {
        let compose = include_str!("../../../compose.yaml");
        for must in ["dockerfile: app/db.Dockerfile", "start surrealkv:///data/db?versioned=true", "- \"8000\"", "- \"3000:3000\"", "SURREAL_ADDR: db:8000", "surreal-data:/data"] {
            assert!(compose.contains(must), "compose.yaml: {must}");
        }
        let db = include_str!("../../db.Dockerfile");
        assert!(db.contains("FROM surrealdb/surrealdb:v4.0.1") && db.contains("USER root"));
        let axhub = include_str!("../../../axhub.yaml");
        for must in ["deploy_method: compose", "compose_file: compose.yaml", "entry_service: app", "SURREAL_USER", "SURREAL_PASS", "DEMO_PASS", "OPENAI_API_KEY", "UPSTAGE_API_KEY"] {
            assert!(axhub.contains(must), "axhub.yaml: {must}");
        }
        let app = include_str!("../../Dockerfile");
        for must in ["EXPOSE 3000", "ENV PORT=3000", "distroless/cc-debian13:nonroot", "HEALTHCHECK"] {
            assert!(app.contains(must), "app/Dockerfile: {must}");
        }
    }
}
