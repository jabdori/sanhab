//! 23 모의: 한도를 바꿔 보면 승인권자가 달라지는 심사를 세어 보인다(시나리오 8). 출처는 가정이다.
//! 저장하지 않는다: 심사의 상태·승인권자·작업은 그대로이고, 모든 심사(굳은 심사 포함 — 과거 건에는 모의만 허용, 스펙 D14 위)의 합산을
//! 넣어 본 한도와 04의 `approver`로 견줄 뿐이다. 합산·구성은 새로 계산하지 않고 저장된 값을 쓴다(한도만 바뀌므로 같은 값이다).
use crate::check::Check;
use crate::db::{Db, q1};
use crate::{Body, Me, R, refuse};
use anyhow::{Result, ensure};
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = "";

/// 넣을 수 있는 한도의 끝(너무 큰 값은 꼴이 틀린 것)
const MAX: i64 = 1_000_000_000;
/// 모의를 하는 역할과 승인권자의 낱말(화면은 역할의 이름을 적지 않고 여기서 받는다)
const WHO: [&str; 2] = ["영업임원", "내부 감시"];
const APPROVERS: [&str; 2] = ["영업지원", "영업임원"];

pub fn routes() -> Router<Db> {
    Router::new().route("/mock", get(info).post(mock))
}

/// `GET /api/mock` → `{ can, approvers[영업지원, 영업임원] }`: 지금 역할이 모의를 할 수 있는지
async fn info(Extension(me): Extension<Me>) -> R {
    Ok(Json(json!({ "can": WHO.contains(&me.role.as_str()), "approvers": APPROVERS })))
}

/// `POST /api/mock { limit }` → `{ source, limit, total, changed, now[영업지원, 영업임원], mock[…], rows[{ id, name, ym, total, status, approver[현재, 모의] }] }`.
/// `rows`는 승인권자가 달라지는 심사뿐이다. 한도가 1 이상 10억 이하의 정수가 아니면 400 대상, 영업임원·내부 감시가 아니면 403 권한
async fn mock(Extension(me): Extension<Me>, Body(b): Body) -> R {
    let Some(limit) = b["limit"].as_i64().filter(|l| (1..=MAX).contains(l)) else { return Err(refuse("대상")) };
    if !WHO.contains(&me.role.as_str()) {
        return Err(refuse("권한"));
    }
    let all = q1(&me.db, "SELECT record::id(id) AS id, name, ym, total, status, approver FROM review ORDER BY ym, id;", json!({})).await?;
    let all = all.as_array().cloned().unwrap_or_default();
    let (mut now, mut mock, mut rows) = ([0; 2], [0; 2], vec![]);
    let slot = |a: &str| (a == APPROVERS[1]) as usize;
    for r in &all {
        let (cur, new) = (r["approver"].as_str().unwrap_or_default(), super::t04_review::approver(r["total"].as_i64().unwrap_or(0), limit));
        now[slot(cur)] += 1;
        mock[slot(new)] += 1;
        if cur != new {
            rows.push(json!({ "id": r["id"], "name": r["name"], "ym": r["ym"], "total": r["total"], "status": r["status"], "approver": [cur, new] }));
        }
    }
    Ok(Json(json!({ "source": "가정", "limit": limit, "total": all.len(), "changed": rows.len(), "now": now, "mock": mock, "rows": rows })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (exec, audit, support) = ("영업임원", "내부 감시", "영업지원");
    ensure!(c.get(exec, "/api/mock").await? == json!({ "can": true, "approvers": [support, exec] }) && c.get(audit, "/api/mock").await?["can"] == true && c.get(support, "/api/mock").await?["can"] == false, "모의할 수 있는 역할");
    let mock = async |role: &str, limit: J| c.post(role, "/api/mock", json!({ "limit": limit })).await;
    // 심사·작업·결정의 모습: 모의 전후로 같아야 한다
    let snap = async || q1(&c.db, "RETURN [(SELECT id, status, approver, total, limit, rules, marks FROM review ORDER BY id), (SELECT id, role, state, target FROM task ORDER BY id), count(SELECT id FROM decision)];", json!({})).await;
    let before = snap().await?;

    // 원본 그대로의 한도(2,000,000)로 넣으면 달라지는 것이 없다
    let (code, d) = mock(exec, json!(2_000_000)).await?;
    ensure!(code == 200 && d["changed"] == 0 && d["rows"] == json!([]) && d["now"] == d["mock"] && d["source"] == "가정", "현재와 같은 한도 {d}");
    let all = d["total"].as_i64().unwrap_or(0);
    // 한도를 바꾸면 합산이 새 한도를 넘는지가 달라지는 심사만 바뀐다. 아래의 수와 목록은 원본의 지급 CSV(귀속월 · 대리점 · 반려 제외 합)에서 직접 센 값이다.
    // 심사는 전체 238개(굳은 197+4개와 대기 37+1개)이고 지금 영업임원은 1개(2026-06-D-011, 합산 3,888,097)
    ensure!(all == 238 && d["now"] == json!([237, 1]), "전체 {d}");
    // 150만: 합산이 1,500,000 초과 2,000,000 이하인 13개가 영업지원에서 영업임원으로
    let (code, d) = mock(audit, json!(1_500_000)).await?;
    let want = ["2026-01-D-011", "2026-01-D-016", "2026-01-D-037", "2026-01-D-043", "2026-02-D-037", "2026-04-D-006", "2026-04-D-009", "2026-04-D-011", "2026-04-D-016", "2026-05-D-006", "2026-05-D-011", "2026-05-D-037", "2026-06-D-018"];
    ensure!(code == 200 && d["changed"] == 13 && d["total"] == all && ids(&d) == want && d["now"] == json!([237, 1]) && d["mock"] == json!([224, 14]), "한도 150만 {d}");
    ensure!(d["rows"].as_array().is_some_and(|r| r.iter().all(|x| x["approver"] == json!([support, exec]))), "방향 {d}");
    // 100만: 105개. 250만: 달라지는 것이 없다(2백만 초과 3,888,097 사이에 합산이 없다)
    let (_, d) = mock(exec, json!(1_000_000)).await?;
    ensure!(d["changed"] == 105 && d["mock"] == json!([132, 106]), "한도 100만 {d}");
    let (_, d) = mock(exec, json!(2_500_000)).await?;
    ensure!(d["changed"] == 0 && d["rows"] == json!([]), "한도 250만 {d}");
    // 400만: 영업임원이던 그룹 심사가 영업지원으로
    let (_, d) = mock(exec, json!(4_000_000)).await?;
    ensure!(d["changed"] == 1 && ids(&d) == ["2026-06-D-011"] && d["rows"][0]["approver"] == json!([exec, support]) && d["mock"] == json!([238, 0]), "한도 400만 {d}");
    // 경계: 합산이 한도와 같으면 영업지원이다(넘어야 영업임원)
    let (_, d) = mock(exec, json!(988_932)).await?;
    ensure!(!ids(&d).contains(&"2026-06-D-001".to_string()), "경계 {d}");
    let (_, d) = mock(exec, json!(988_931)).await?;
    ensure!(ids(&d).contains(&"2026-06-D-001".to_string()), "경계 {d}");
    // 모의는 심사의 상태, 승인권자, 작업을 바꾸지 않는다
    ensure!(snap().await? == before, "모의가 저장했다");
    ensure!(c.get(support, "/api/reviews/2026-06-D-011").await?["review"]["approver"] == exec, "저장된 승인권자");
    // 꼴이 틀린 값은 400 대상, 다른 역할은 403 권한
    for bad in [json!(0), json!(-1), json!("abc"), json!("1500000"), json!(1.5), json!(1_000_000_001_i64), json!(null)] {
        ensure!(mock(exec, bad.clone()).await? == (400, json!({ "error": "대상" })), "꼴 {bad}");
    }
    for (body, kind) in [("{", Some("application/json")), ("", Some("application/json"))] {
        let r = c.raw(exec, "/api/mock", body, kind).await?;
        ensure!(r == (400, json!({ "error": "대상" })), "JSON이 아닌 본문 {body} {r:?}");
    }
    for role in [support, "회계·자금"] {
        ensure!(mock(role, json!(1_500_000)).await? == (403, json!({ "error": "권한" })), "{role}");
    }
    Ok(())
}

fn ids(d: &J) -> Vec<String> {
    d["rows"].as_array().into_iter().flatten().filter_map(|r| r["id"].as_str().map(String::from)).collect()
}
