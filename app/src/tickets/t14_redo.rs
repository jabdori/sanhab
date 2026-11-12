//! 14 재심사: 승인은 났지만 지급 전(대기)인 건의 승인권자가 규정으로 올라가면(D33) 지급이 재심사가 되고 앞선 승인은 효력을 잃는다.
//! `rework()` 한 곳이 판단한다(04 `recalc`와 13 `regroup`이 먼저 부른다). 판단은 09의 재검토(`Now.again`)를 그대로 쓴다 — 정황의 가설(12)은 따지지 않는다.
//! 다시 대기가 되는 것은 DB의 이벤트(`t14_back`)다: 올바른 승인권자의 승인이 나면.
use super::t09_again::current;
use crate::check::Check;
use crate::db::{Db, q, q1};
use crate::{R, err};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/14-재심사.surql");

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/pays/{id}/redo", get(detail))
}

/// 재심사 판단: 재검토인 승인(당시 영업지원, 현재 영업임원)에 든 대기 지급을 재심사로 돌리고 기록을 남긴다.
/// 그 승인에 이체·완료인 지급이 없으면 승인 전체가 효력을 잃는다(심사의 표시 `재심사` → 09의 재검토 계산에서 빠지고 추인 묶음(10)에도 들지 않는다).
/// 이체·완료인 지급이 있으면 그 지급은 재검토로 남아야 하므로 승인은 그대로다
pub async fn rework(db: &Db) -> Result<()> {
    if q1(db, "RETURN count(SELECT id FROM payout WHERE state = '대기');", json!({})).await? == 0 {
        return Ok(());
    }
    let list: Vec<J> = current(db).await?.into_iter().filter(|(_, n)| n.again).map(|(id, n)| json!({ "id": id, "members": n.members })).collect();
    q(db, "
        FOR $x IN $list {
            LET $r = type::record('review', $x.id);
            LET $ps = SELECT VALUE id FROM payout WHERE review = $r AND state = '대기';
            IF array::len($ps) > 0 {
                LET $cause = (SELECT id, stamp FROM incident WHERE dealer INSIDE $x.members.map(|$d| type::record('dealer', $d)) AND at >= $r.fixed ORDER BY stamp DESC LIMIT 1)[0].id;
                FOR $p IN $ps { CREATE redo SET payout = $p, was = $r, cause = $cause, at = fn::today(), source = '계산'; };
                UPDATE $ps SET state = '재심사', state_source = '계산';
                IF count(SELECT id FROM payout WHERE review = $r AND state INSIDE ['이체', '완료']) = 0 { UPDATE $r SET marks += '재심사' WHERE marks CONTAINSNOT '재심사'; };
            };
        };", json!({ "list": list })).await?;
    Ok(())
}

/// 지급의 재심사: `{ redo: { payout, was(앞선 승인), cause(원인인 변경, 없으면 null), at, back(다시 승인한 심사, 아직이면 null) } }`.
/// 재심사가 된 적 없는 지급은 404. 지금 재심사인지는 지급 상세(07)의 `state`가 말한다
async fn detail(Extension(me): Extension<crate::Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "
        LET $r = (SELECT * FROM redo WHERE payout = type::record('payout', $id) ORDER BY stamp DESC LIMIT 1)[0];
        RETURN IF $r = NONE THEN NONE ELSE {
            payout: $id,
            was: { id: record::id($r.was), name: $r.was.name },
            cause: IF $r.cause THEN { role: $r.cause.role, at: time::format($r.cause.at, '%Y-%m-%d'), item: $r.cause.item, value: $r.cause.value, since: time::format($r.cause.since, '%Y-%m-%d'), dealer: $r.cause.dealer.name } END,
            at: time::format($r.at, '%Y-%m-%d'),
            back: IF $r.back THEN { id: record::id($r.back), name: $r.back.name } END,
        } END;", json!({ "id": id })).await?;
    if r.is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    Ok(Json(json!({ "redo": r })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &mut Check) -> Result<()> {
    let (support, exec, acct) = ("영업지원", "영업임원", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let has = |m: &J, x: &str| m.as_array().is_some_and(|a| a.contains(&json!(x)));
    let addr41 = "고양시 중앙로 128";
    let change = json!({ "id": "D-034", "item": "주소", "value": addr41, "since": "2026-02-01" });
    let approve = async |c: &Check, role: &str, id: &str, reason: J| c.post(role, "/api/decide", json!({ "ids": [id], "kind": "승인", "reason": reason })).await;
    // 그 대리점의 6월 지급: (id, 상태, 금액)
    let pay_of = async |c: &Check, name: &str| -> Result<(String, String, i64)> {
        let p = rows(&c.get(acct, "/api/pays").await?["rows"]).into_iter().find(|p| p["name"] == name).unwrap_or_default();
        Ok((p["id"].as_str().unwrap_or_default().to_string(), p["state"].as_str().unwrap_or_default().to_string(), p["amount"].as_i64().unwrap_or(0)))
    };
    let counts = async |c: &Check| -> Result<J> { Ok(c.get(acct, "/api/pays").await?["counts"].clone()) };
    let redos = async |c: &Check| q1(&c.db, "RETURN count(SELECT id FROM redo);", json!({})).await;
    let r34 = "2026-06-D-034";

    // 시나리오 4의 준비: 영업지원이 한라인상사34의 6월분(1,353,657)을 승인해 지급이 대기. 회계·자금이 지급할 수 있다
    ensure!(approve(c, support, r34, json!({ "class": "경미" })).await?.0 == 200, "승인");
    let (pay, state, amount) = pay_of(c, "한라인상사34").await?;
    ensure!(state == "대기" && amount == 1_353_657, "승인 뒤의 지급 {state} {amount}");
    ensure!(c.get(acct, &format!("/api/pays/{pay}")).await?["can"] == true && c.get(acct, &format!("/api/pays/{pay}/redo")).await.is_err(), "승인 뒤의 조치");
    // 변경 전에는 재심사가 아니다
    ensure!(counts(c).await? == json!({ "대기": 1, "재심사": 0, "이체": 0, "완료": 0 }) && redos(c).await? == 0, "변경 전의 수");

    // 1~3: 주소 변경(변경일 2월 1일) → 그 지급이 재심사. 조치가 사라지고(지급하면 상태), 목록 위의 수·지급 상세·대리점 상세가 같은 낱말
    ensure!(c.post(support, "/api/change", change.clone()).await?.0 == 200, "변경");
    ensure!(counts(c).await? == json!({ "대기": 0, "재심사": 1, "이체": 0, "완료": 0 }), "재심사의 수");
    let d = c.get(acct, &format!("/api/pays/{pay}")).await?;
    ensure!(d["pay"]["state"] == "재심사" && d["can"] == false && d["pay"]["review"]["id"] == r34, "지급 상세 {d}");
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await? == (400, json!({ "error": "상태" })), "재심사인 지급의 지급");
    let line = rows(&c.get(acct, "/api/dealers/D-034").await?["payouts"]).into_iter().find(|p| p["ym"] == "2026-06").unwrap_or_default();
    ensure!(line["state"] == "재심사" && line["state_source"] == "계산" && line["status"] == "미지급", "대리점 상세의 지급 줄 {line}");
    // 사유: 변경이 원인이다(경위 16이 지급 → 앞선 승인 → 변경으로 거슬러 오른다)
    let r = c.get(acct, &format!("/api/pays/{pay}/redo")).await?;
    ensure!(r == json!({ "redo": { "payout": pay, "was": { "id": r34, "name": "한라인상사34" }, "at": "2026-07-01", "back": null,
        "cause": { "role": support, "at": "2026-07-01", "item": "주소", "value": addr41, "since": "2026-02-01", "dealer": "한라인상사34" } } }), "재심사의 기록 {r}");
    // 앞선 승인은 기록으로 남되 효력을 잃는다: 승인 결정과 이력은 그대로, 표시는 재심사(재검토가 아니다). 추인 묶음에 들지 않는다. 2·3월은 그대로 재검토
    let old = c.get(support, &format!("/api/reviews/{r34}")).await?;
    ensure!(old["review"]["status"] == "승인" && has(&old["review"]["marks"], "재심사") && !has(&old["review"]["marks"], "재검토") && old["history"][0]["kind"] == "승인" && old["history"][0]["role"] == support, "앞선 승인 {}", old["review"]);
    ensure!(c.call(Some(c.token(support)), "GET", &format!("/api/reviews/{r34}/again"), None).await?.0 == 404, "앞선 승인의 재검토");
    let mine = rows(&c.get(exec, "/api/tasks").await?["mine"]);
    let bundled = |ym: &str| mine.iter().any(|t| t["kind"] == "추인" && t["target"].as_str().is_some_and(|x| x.starts_with(&format!("{ym}-D-034"))));
    ensure!(!bundled("2026-06") && bundled("2026-02") && bundled("2026-03"), "추인 작업 {mine:?}");
    // 합쳐진 심사: 번호가 붙은 새 심사(굳은 심사는 고치지 않는다)가 영업임원의 담당에 대기. 옛 금강상사41의 심사는 없어진다
    let merged = "2026-06-D-034-2";
    let m = c.get(exec, &format!("/api/reviews/{merged}")).await?;
    ensure!(m["review"]["name"] == "한라인상사34 외 1" && m["review"]["total"] == 2_255_709 && m["review"]["approver"] == exec && m["review"]["status"] == "대기" && rows(&m["members"]).len() == 2, "합쳐진 심사 {}", m["review"]);
    ensure!(mine.iter().any(|t| t["kind"] == "심사" && t["target"] == merged && t["name"] == "한라인상사34 외 1" && t["total"] == 2_255_709), "영업임원의 심사 작업");
    ensure!(c.call(Some(c.token(exec)), "GET", "/api/reviews/2026-06-D-041", None).await?.0 == 404, "금강상사41의 옛 심사");
    ensure!(c.post(support, "/api/decide", json!({ "ids": [merged], "kind": "승인", "reason": { "class": "정상" } })).await?.0 == 403, "영업지원의 승인");

    // 4: 영업임원이 승인하면 지급이 다시 대기. 새 심사를 가리키고 지급 작업은 그대로 하나다. 함께 합쳐진 금강상사41의 지급도 대기
    let (code, r) = approve(c, exec, merged, json!({ "class": "정상" })).await?;
    ensure!(code == 200, "영업임원의 승인 {r}");
    ensure!(counts(c).await? == json!({ "대기": 2, "재심사": 0, "이체": 0, "완료": 0 }), "승인 뒤의 수");
    let d = c.get(acct, &format!("/api/pays/{pay}")).await?;
    ensure!(d["pay"]["state"] == "대기" && d["can"] == true && d["pay"]["review"]["id"] == merged, "다시 대기 {d}");
    ensure!(c.get(acct, &format!("/api/pays/{pay}/redo")).await?["redo"]["back"] == json!({ "id": merged, "name": "한라인상사34 외 1" }), "다시 승인한 심사");
    let tasks = q1(&c.db, "RETURN count(SELECT id FROM task WHERE kind = '지급' AND target = type::record('payout', $id));", json!({ "id": pay })).await?;
    ensure!(tasks == 1, "지급 작업 {tasks}");
    // 재승인한 영업임원도 그 지급 작업을 진행에서 본다
    let going = rows(&c.get(exec, "/api/tasks").await?["going"]);
    ensure!(going.iter().any(|t| t["kind"] == "지급" && t["target"] == pay.as_str()), "영업임원의 진행 {going:?}");
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200 && pay_of(c, "한라인상사34").await?.1 == "이체", "다시 승인한 뒤의 지급");

    // 이미 이체·완료인 지급은 재심사가 아니다(재검토가 될 뿐이다): 앞선 승인은 효력을 잃지 않고 6월도 추인 묶음에 오른다
    for done in [false, true] {
        c.reset().await?;
        ensure!(approve(c, support, r34, json!({ "class": "경미" })).await?.0 == 200, "승인");
        let (pay, _, amount) = pay_of(c, "한라인상사34").await?;
        ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200, "지급");
        if done {
            ensure!(c.post(acct, "/api/reply", json!({ "id": pay, "amount": amount, "account": c.get(acct, &format!("/api/pays/{pay}")).await?["accounts"][0]["value"], "result": "성공" })).await?.0 == 200, "회신");
        }
        ensure!(c.post(support, "/api/change", change.clone()).await?.0 == 200, "변경");
        let want = if done { "완료" } else { "이체" };
        ensure!(pay_of(c, "한라인상사34").await?.1 == want && redos(c).await? == 0, "{want}인 지급");
        let old = c.get(support, &format!("/api/reviews/{r34}")).await?["review"].clone();
        ensure!(has(&old["marks"], "재검토") && !has(&old["marks"], "재심사"), "{want}인 지급의 승인 {old}");
        ensure!(c.get(support, &format!("/api/reviews/{r34}/again")).await?["again"] == true, "재검토");
        let mine = rows(&c.get(exec, "/api/tasks").await?["mine"]);
        ensure!(mine.iter().any(|t| t["kind"] == "추인" && t["target"] == r34), "{want}인 지급의 추인 작업");
    }

    // 이체 뒤에 변경이 들어오면 그때는 재심사가 아니지만(위), 은행의 회신이 실패해 대기로 돌아오면 그 자리에서 재심사다(올바른 승인 없이 다시 지급하지 못한다)
    c.reset().await?;
    ensure!(approve(c, support, r34, json!({ "class": "경미" })).await?.0 == 200, "승인");
    let (pay, _, amount) = pay_of(c, "한라인상사34").await?;
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200 && c.post(support, "/api/change", change.clone()).await?.0 == 200, "이체와 변경");
    let account = c.get(acct, &format!("/api/pays/{pay}")).await?["accounts"][0]["value"].clone();
    ensure!(c.post(acct, "/api/reply", json!({ "id": pay, "amount": amount, "account": account, "result": "실패" })).await?.0 == 200, "실패 회신");
    let d = c.get(acct, &format!("/api/pays/{pay}")).await?;
    ensure!(d["pay"]["state"] == "재심사" && d["can"] == false && redos(c).await? == 1, "실패 회신 뒤 {d}");
    ensure!(c.get(acct, &format!("/api/pays/{pay}/redo")).await?["redo"]["cause"]["item"] == "주소", "실패 회신 뒤의 원인");
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await? == (400, json!({ "error": "상태" })), "승인 없는 재지급");
    ensure!(c.get(exec, "/api/reviews/2026-06-D-034-2").await?["review"]["status"] == "대기", "합쳐진 심사");
    let mine = rows(&c.get(exec, "/api/tasks").await?["mine"]);
    ensure!(!mine.iter().any(|t| t["kind"] == "추인" && t["target"] == r34), "추인 작업이 남음");

    // 정황만으로는 재심사가 되지 않는다(12의 본보기: 가설에서 승인권자가 올라가도): 대륙상사6의 승인은 그대로이고 지급은 대기
    c.reset().await?;
    ensure!(approve(c, support, "2026-06-D-006", json!({ "class": "경미" })).await?.0 == 200, "대륙상사6의 승인");
    q(&c.db, "
        LET $e = { since: d'2026-01-01T00:00:00Z', via: '신고', source: '시연' };
        LET $p = (SELECT VALUE out FROM rep WHERE in = dealer:`D-006`)[0];
        LET $a = (SELECT VALUE out FROM acct WHERE in = dealer:`D-006`)[0];
        RELATE dealer:`D-001`->rep->$p CONTENT $e;
        CREATE deposit:`본보기` SET date = d'2026-05-01T00:00:00Z', amount = 1000, source = '시연';
        RELATE deposit:`본보기`->deposit_of->dealer:`D-001` SET source = '시연';
        RELATE deposit:`본보기`->deposit_into->$a SET source = '시연';
        fn::signal('계좌', '본보기', '대성상사1', [dealer:`D-001`, dealer:`D-006`], [deposit:`본보기`], '시연');", json!({})).await?;
    super::t04_review::recalc(&c.db).await?;
    ensure!(c.get(support, "/api/signals/계좌-본보기/hypo").await?["up"] == true, "가설에서 올라간다");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM review WHERE raised);", json!({})).await? == 1, "올라간 심사");
    ensure!(pay_of(c, "대륙상사6").await?.1 == "대기" && redos(c).await? == 0, "정황만으로 재심사");
    ensure!(!has(&c.get(support, "/api/reviews/2026-06-D-006").await?["review"]["marks"], "재심사"), "정황만으로 승인이 효력을 잃음");
    Ok(())
}
