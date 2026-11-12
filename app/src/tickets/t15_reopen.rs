//! 15 재접수: 늦은 인지는 지연 정황으로 접수되고(D30), 기각된 정황에 새 근거가 붙으면 다시 접수된다. 모두 DB의 함수와 이벤트가 한다(`db/15-재접수.surql`):
//! `fn::delay()`(기준, 가정), `fn::fresh(정황)`(마지막 결정 뒤에 붙은 근거), `fn::signal`(기각 + 새 근거 → 접수, 정황 작업 대기).
//! 13의 `attach`가 상태 조건에 기각을 포함해 동명 정황에 변경의 근거를 붙이면 여기서 다시 올라온다.
use crate::check::Check;
use crate::db::{Db, q1};
use anyhow::{Result, ensure};
use axum::Router;
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/15-재접수.surql");

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new()
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

/// 시나리오 4의 준비(기각)와 1~4: 기각해 둔 동명 정황이 주소 변경으로 다시 올라오고, 지연 정황이 잡힌다
pub async fn check(c: &mut Check) -> Result<()> {
    let (support, audit, exec) = ("영업지원", "내부 감시", "영업임원");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let name = "동명-박준호";
    let sig = async |id: &str| c.get(audit, &format!("/api/signals/{id}")).await;
    let task = async |id: &str| q1(&c.db, "RETURN type::record('task', $id).state;", json!({ "id": id })).await;

    // 준비: 내부 감시가 두 대리점의 동명 정황을 근거 부족으로 기각해 둔다(사유 필수). 17의 보고도 써 둔다
    let bad = c.post(audit, "/api/rule", json!({ "id": name, "kind": "기각" })).await?;
    ensure!(bad == (400, json!({ "error": "사유" })), "사유 없는 기각 {bad:?}");
    let reason = json!({ "class": "부족", "memo": "대표자 이름뿐" });
    ensure!(c.post(audit, "/api/rule", json!({ "id": name, "kind": "기각", "reason": reason })).await?.0 == 200, "기각");
    *super::t17_report::USE.lock().unwrap() = Some("fixture".into());
    let made = super::t17_report::make(&c.db, name, true).await;
    *super::t17_report::USE.lock().unwrap() = None;
    made?;
    ensure!(sig(name).await?["signal"]["state"] == "기각" && task(name).await? == "완료", "기각한 정황");
    // 근거가 그대로이면 다시 찾아도 기각된 채다(새 근거 없음)
    super::t11_signal::detect(&c.db).await?;
    let d = sig(name).await?;
    ensure!(d["signal"]["state"] == "기각" && d["fresh"] == json!([]) && task(name).await? == "완료", "다시 찾은 뒤 {}", d["signal"]);
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM signal WHERE kind = '지연');", json!({})).await? == 0, "변경 전의 지연");

    // 1: 한라인상사34가 2월 1일부터 금강상사41의 주소를 쓴다고 7월 1일에 신고한다
    let addr41 = c.get(support, "/api/dealers").await?[40]["address"][0].as_str().unwrap_or_default().to_string();
    let (code, made) = c.post(support, "/api/change", json!({ "id": "D-034", "item": "주소", "value": addr41, "since": "2026-02-01" })).await?;
    ensure!(code == 200, "변경 {code} {made}");
    let inc = format!("incident:{}", made["id"].as_str().unwrap_or_default());

    // 4: 기각했던 정황이 새 근거와 함께 다시 접수된다. 새 줄은 변경(사건)과 새로 생긴 일치(두 곳의 주소 선)이고 처음의 대표자 두 줄은 새가 아니다
    let d = sig(name).await?;
    ensure!(d["signal"]["state"] == "접수" && task(name).await? == "대기", "재접수 {}", d["signal"]);
    let ev = rows(&d["evidence"]);
    let fresh = rows(&d["fresh"]);
    let item = |id: &J| ev.iter().find(|e| e["id"] == *id).map(|e| e["item"].clone());
    ensure!(fresh.len() == 3 && fresh.contains(&json!(inc)) && fresh.iter().all(|f| item(f).is_some_and(|i| i == "변경" || i == "주소")), "새 근거 {fresh:?}");
    ensure!(ev.len() == 5 && ev.iter().filter(|e| e["item"] == "대표자").all(|e| !fresh.contains(&e["id"])), "근거 {ev:?}");
    // 이력에 이전 기각(역할, 날짜, 사유)이 남아 있다
    let h = rows(&d["history"]);
    ensure!(h.len() == 1 && h[0]["kind"] == "기각" && h[0]["role"] == audit && h[0]["at"] == "2026-07-01" && h[0]["reason"] == reason, "이전 기각 {h:?}");
    // 내부 감시의 담당에 정황 작업이 다시 올라온다
    let mine = rows(&c.get(audit, "/api/tasks").await?["mine"]);
    ensure!(mine.iter().any(|t| t["kind"] == "정황" && t["target"] == name), "정황 작업 {mine:?}");
    // 12: 열린 정황이라 합쳐진 6월 심사에 정황 표시가 다시 붙고 승인에는 사유가 필수다(17: 근거가 달라져 보고는 새로 만들 대상이다)
    let r = c.get(exec, "/api/reviews/2026-06-D-034").await?;
    ensure!(rows(&r["review"]["marks"]).contains(&json!("정황")), "정황 표시 {}", r["review"]["marks"]);
    ensure!(c.post(exec, "/api/decide", json!({ "ids": ["2026-06-D-034"], "kind": "승인" })).await? == (400, json!({ "error": "사유" })), "사유 없는 승인");
    ensure!(c.get(audit, &format!("/api/signals/{name}/report")).await?["report"]["stale"] == true, "보고");
    // 새 보고: 고정 응답이 새 근거(변경)도 가리킨다
    *super::t17_report::USE.lock().unwrap() = Some("fixture".into());
    let again = super::t17_report::make(&c.db, name, true).await;
    *super::t17_report::USE.lock().unwrap() = None;
    let st = again?;
    ensure!(st == "검토", "새 보고 {st} {}", q1(&c.db, "RETURN (SELECT state, error FROM report WHERE target = type::record('signal', $id) ORDER BY born DESC LIMIT 1)[0];", json!({ "id": name })).await?);
    let rep = c.get(audit, &format!("/api/signals/{name}/report")).await?["report"].clone();
    ensure!(rep["stale"] == false && rows(&rep["facts"]).iter().any(|f| f["ref"] == inc.as_str()), "새 보고의 사실 {rep}");

    // 지연: 변경일 2026-02-01, 인지일 2026-07-01(150일)이라 기준(fn::delay)보다 늦다. 근거는 그 변경 하나
    let late = sig("지연-D-034").await?;
    ensure!(late["signal"]["name"] == "지연 · 한라인상사34" && late["signal"]["state"] == "접수" && late["signal"]["source"] == "가정" && late["delay"] == 30, "지연 정황 {late}");
    let e = &late["evidence"][0];
    ensure!(e["at"] == "2026-02-01" && e["known"] == "2026-07-01" && e["days"] == 150, "지연의 근거 줄 {e}");
    ensure!(rows(&late["evidence"]).len() == 1 && late["evidence"][0]["id"] == inc.as_str() && task("지연-D-034").await? == "대기", "지연의 근거 {}", late["evidence"]);
    // 기준 안의 변경(변경일 6월 20일, 11일)은 지연이 아니다
    ensure!(c.post(support, "/api/change", json!({ "id": "D-001", "item": "주소", "value": "시연 주소", "since": "2026-06-20" })).await?.0 == 200, "기준 안의 변경");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM signal WHERE kind = '지연');", json!({})).await? == 1, "기준 안의 지연");

    // 다시 결정할 수 있다: 이번에도 사유가 필수이고, 기각하면 새 근거가 비고 앞의 기각과 함께 이력이 둘이다
    ensure!(c.post(audit, "/api/rule", json!({ "id": name, "kind": "기각" })).await?.0 == 400, "다시 기각의 사유");
    ensure!(c.post(audit, "/api/rule", json!({ "id": name, "kind": "기각", "reason": { "class": "정상" } })).await?.0 == 200, "다시 기각");
    super::t11_signal::detect(&c.db).await?;
    let d = sig(name).await?;
    ensure!(d["signal"]["state"] == "기각" && d["fresh"] == json!([]) && rows(&d["history"]).len() == 2 && task(name).await? == "완료", "다시 기각한 뒤 {}", d["signal"]);
    Ok(())
}
