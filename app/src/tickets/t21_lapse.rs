//! 21 미응답: 띠에서 시스템의 오늘을 앞으로 넘긴다(모의, D43). 기한이 지난 요청 상태의 소명은 미응답이 되고 내부 감시의 담당에 미응답 작업이 생긴다(D32).
//! 누가 넘길 수 있는지는 스펙에 없어 접속한 모든 역할이 넘긴다(초기화와 같다, 띠는 시연자의 것). 아무것도 자동으로 멈추지 않는다.
use crate::check::Check;
use crate::db::{Db, q1};
use crate::{Body, R, refuse};
use anyhow::{Result, ensure};
use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde_json::json;

pub const SCHEMA: &str = include_str!("../../db/21-미응답.surql");
/// 한 번에 넘길 수 있는 날수의 끝(가정)
const MAX: i64 = 365;

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/advance", post(advance))
}

/// `{ days }` → `{ today, lapsed[소명 id] }`. 1 이상 `MAX` 이하의 정수가 아니면 400 `대상`
async fn advance(State(db): State<std::sync::Arc<Db>>, Body(b): Body) -> R {
    let days = b["days"].as_i64().filter(|d| (1..=MAX).contains(d)).ok_or_else(|| refuse("대상"))?;
    let r = q1(&db, "fn::advance($days); LET $lapsed = fn::lapse(); RETURN { today: time::format(fn::today(), '%Y-%m-%d'), lapsed: $lapsed };", json!({ "days": days })).await?;
    Ok(Json(r))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let rule = async |id: &str| c.post(audit, "/api/rule", json!({ "id": id, "kind": "요청" })).await;
    let adv = async |role: &str, d: serde_json::Value| c.post(role, "/api/advance", json!({ "days": d })).await;
    let n = |sql: &'static str| q1(&c.db, sql, json!({}));
    let tasks = async |role: &str, list: &str| -> Result<Vec<serde_json::Value>> {
        Ok(c.get(role, "/api/tasks").await?[list].as_array().cloned().unwrap_or_default().into_iter().filter(|t| t["kind"] == "미응답").collect())
    };
    // 지급·심사·관련자의 모양: 날짜를 넘겨도 바뀌지 않아야 하는 것(아무것도 자동으로 멈추지 않는다)
    let shape = async || -> Result<serde_json::Value> {
        let r = c.get(audit, "/api/dealers/D-024/related").await?;
        let rv = c.get(audit, "/api/reviews/2026-06-D-011").await?;
        Ok(json!([r["group"], r["near"], rv["review"]["total"], rv["review"]["approver"], rv["review"]["status"],
            n("RETURN [array::group((SELECT VALUE status FROM review)), array::group((SELECT VALUE state FROM payout)), count(SELECT id FROM rep WHERE excluded = true) + count(SELECT id FROM addr WHERE excluded = true) + count(SELECT id FROM acct WHERE excluded = true)];").await?]))
    };

    // 요청해서 발송한 소명(기한 2026-07-15)과 발송하지 않은 소명(기한 없음)
    ensure!(rule("계좌-D-024").await?.0 == 200 && rule("동명-박준호").await?.0 == 200, "요청");
    let ids = n("RETURN (SELECT VALUE record::id(id) FROM clarify ORDER BY name);").await?;
    let one = async |s: &str| -> Result<String> {
        Ok(q1(&c.db, "RETURN record::id((SELECT VALUE id FROM clarify WHERE signal = type::record('signal', $s))[0]);", json!({ "s": s })).await?.as_str().unwrap_or_default().to_string())
    };
    let (sent, unsent) = (one("계좌-D-024").await?, one("동명-박준호").await?);
    ensure!(ids.as_array().is_some_and(|a| a.len() == 2), "소명 {ids}");
    ensure!(c.post(support, "/api/send", json!({ "id": &sent })).await?.0 == 200, "발송");
    let before = shape().await?;
    ensure!(tasks(audit, "mine").await?.is_empty(), "미리 생긴 미응답 작업");

    // 거절: 뒤로는 못 가고(0, 음수), 정수 1~365가 아니면 대상. 접속하지 않으면 401. 거절된 것은 날짜를 바꾸지 않는다
    for bad in [json!(0), json!(-3), json!(1.5), json!("14"), json!(366), json!(null)] {
        ensure!(adv(support, bad.clone()).await? == (400, json!({ "error": "대상" })), "틀린 날수 {bad}");
    }
    ensure!(c.call(None, "POST", "/api/advance", Some(json!({ "days": 1 }))).await?.0 == 401, "접속 없이");
    ensure!(c.get(support, "/api/state").await?["today"] == "2026-07-01", "거절된 뒤의 날짜");

    // 기한까지는 미응답이 아니다: 14일을 넘겨 2026-07-15가 되어도 기한의 마지막 날이다
    let (code, r) = adv(exec, json!(14)).await?;
    ensure!(code == 200 && r == json!({ "today": "2026-07-15", "lapsed": [] }), "14일 {code} {r}");
    ensure!(c.get(acct, "/api/state").await?["today"] == "2026-07-15" && tasks(audit, "mine").await?.is_empty(), "기한의 마지막 날");
    ensure!(c.get(support, &format!("/api/clarifies/{sent}")).await?["clarify"]["state"] == "요청", "기한 안의 상태");

    // 기한이 지나면: 발송한 소명만 미응답이 되고 내부 감시의 담당에 미응답 작업이 하나 생긴다(영업지원은 진행). 발송하지 않은 소명은 그대로
    let (code, r) = adv(audit, json!(1)).await?;
    ensure!(code == 200 && r == json!({ "today": "2026-07-16", "lapsed": [sent] }), "기한 뒤 {code} {r}");
    let t = tasks(audit, "mine").await?;
    ensure!(t.len() == 1 && t[0]["view"] == "소명" && t[0]["target"] == sent && t[0]["name"] == "계좌 · 성일상사24" && t[0]["role"] == audit && t[0]["state"] == "대기", "미응답 작업 {t:?}");
    ensure!(tasks(support, "going").await?.len() == 1 && tasks(support, "mine").await?.is_empty() && tasks(exec, "mine").await?.is_empty() && tasks(acct, "going").await?.is_empty(), "다른 역할의 작업");
    let d = c.get(support, &format!("/api/clarifies/{sent}")).await?;
    ensure!(d["clarify"]["state"] == "미응답" && d["due"] == "2026-07-15" && d["can"] == false, "미응답 소명 {d}");
    ensure!(c.get(support, &format!("/api/clarifies/{unsent}")).await?["clarify"]["state"] == "요청", "발송 전 소명");
    // 넘긴 뒤의 입력은 그 날짜로 기록된다(발송하지 않았던 소명을 지금 발송하면 오늘부터 14일)
    ensure!(c.post(support, "/api/send", json!({ "id": &unsent })).await?.0 == 200, "늦은 발송");
    let d = c.get(support, &format!("/api/clarifies/{unsent}")).await?;
    ensure!(d["sent"] == "2026-07-16" && d["due"] == "2026-07-30" && d["history"][1]["at"] == "2026-07-16", "넘긴 뒤의 기록 {d}");
    // 다시 넘겨도 이미 미응답인 소명은 건드리지 않고 작업도 하나뿐이다
    let (_, r) = adv(support, json!(1)).await?;
    ensure!(r == json!({ "today": "2026-07-17", "lapsed": [] }) && n("RETURN count(SELECT id FROM task WHERE kind = '미응답');").await? == 1, "다시 넘김 {r}");

    // 아무것도 자동으로 멈추지 않는다: 관련자의 구성·합산·승인권자·지급과 심사의 상태가 그대로이고 제외된 선이 없다(미응답인 동안에도 관련자로 계속 본다)
    ensure!(shape().await? == before, "미응답 뒤의 모양 {} / {before}", shape().await?);

    // 두 번째 소명도 기한(2026-07-30)이 지나면 미응답이 된다. 한 번에 넘긴 날수가 커도 같다
    let (_, r) = adv(acct, json!(14)).await?;
    ensure!(r == json!({ "today": "2026-07-31", "lapsed": [unsent] }) && tasks(audit, "mine").await?.len() == 2, "두 번째 {r}");
    ensure!(shape().await? == before, "두 번째 미응답 뒤의 모양");

    // 초기화하면 날짜와 소명, 미응답 작업이 모두 원본으로 돌아간다
    let (code, r) = c.post(acct, "/api/reset", json!({})).await?;
    ensure!(code == 200, "초기화 → {code}");
    let fresh = crate::check::roles(&r);
    let (code, r) = c.call(fresh.get(audit).map(String::as_str), "GET", "/api/state", None).await?;
    ensure!(code == 200 && r["today"] == "2026-07-01", "초기화 뒤의 날짜 {r}");
    ensure!(n("RETURN [count(SELECT id FROM clarify), count(SELECT id FROM task WHERE kind = '미응답')];").await? == json!([0, 0]), "초기화 뒤의 소명과 작업");
    Ok(())
}
