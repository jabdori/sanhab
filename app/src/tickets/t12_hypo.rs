//! 12 가설: 정황이 사실이라고 놓았을 때 일치, 그룹, 승인권자가 어떻게 달라지는지(D3, D29). 출처는 가정이다.
//! 새로 계산하지 않는다: 03의 `links`에 정황이 가리키는 선을 더해 `matches`·`groups`·04의 `compute`를 다시 부른다.
//! 가설은 합산과 저장된 승인권자에 들어가지 않는다. 승인권자가 올라가는 심사만 영업임원의 담당으로 간다(가정, `raise`).
use super::t03_related::{ITEMS, Link, groups, links, matches};
use super::t04_review::compute;
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{R, err};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value as J, json};
use std::collections::BTreeSet;

pub const SCHEMA: &str = include_str!("../../db/12-가설.surql");

/// 정황과, 그 정황이 사실일 때 더할 선. 계좌 정황은 근거의 회수마다 (회수의 대리점, 그 계좌)이고, 동명과 근접은 더할 선이 없다
async fn extra(db: &Db, id: &str) -> Result<Option<(J, Vec<Link>)>> {
    let r = q1(db, "
        LET $s = type::record('signal', $id);
        RETURN IF $s.id = NONE THEN NONE ELSE {
            signal: (SELECT record::id(id) AS id, kind, name, state, dealers.map(|$d| { id: record::id($d), name: $d.name }) AS dealers FROM $s)[0],
            deposits: (SELECT record::id((->deposit_of->dealer)[0]) AS dealer, (->deposit_of->dealer)[0].name AS name, <string> (->deposit_into->account)[0] AS node, (->deposit_into->account)[0].value AS value FROM deposit WHERE id INSIDE $s.evidence),
        } END;", json!({ "id": id })).await?;
    if r.is_null() {
        return Ok(None);
    }
    let text = |v: &J| v.as_str().unwrap_or_default().to_string();
    let add: BTreeSet<(String, String, String, String)> = r["deposits"].as_array().into_iter().flatten().map(|d| (text(&d["dealer"]), text(&d["name"]), text(&d["node"]), text(&d["value"]))).collect();
    let add = add.into_iter().map(|(dealer, name, node, value)| Link { dealer, name, item: 2, node, value }).collect();
    Ok(Some((r["signal"].clone(), add)))
}

/// 가설의 결과. `match`는 대상(정황의 첫 대리점)과 나머지 대리점의 일치(현재, 가설), `group`은 대상의 그룹의 크기,
/// `approver`는 그 대리점들이 든 굳지 않은 심사 가운데 가장 높은 승인권자, `reviews`는 그 심사마다의 값, `up`은 승인권자가 올라가는 심사가 있다는 것
async fn analyze(db: &Db, id: &str) -> Result<Option<J>> {
    let Some((sig, add)) = extra(db, id).await? else { return Ok(None) };
    let now = links(db, None).await?;
    let hyp = [now.clone(), add.clone()].concat();
    let dealers: Vec<(String, String)> = sig["dealers"].as_array().into_iter().flatten().map(|d| (d["id"].as_str().unwrap_or_default().to_string(), d["name"].as_str().unwrap_or_default().to_string())).collect();
    let Some(target) = dealers.first().map(|d| d.0.clone()) else { return Ok(None) };
    let names = |v: Vec<usize>| v.into_iter().map(|i| ITEMS[i]).collect::<Vec<_>>();
    let size = |ls: &[Link]| groups(ls).iter().find(|g| g.contains(&target)).map_or(1, Vec::len);
    let rank = |a: &str| (a == "영업임원") as u8;
    let top = |it: Vec<&str>| if it.is_empty() { "없음".to_string() } else if it.contains(&"영업임원") { "영업임원".into() } else { "영업지원".into() };
    // 더할 선이 없으면 가설은 현재와 같다(계산을 다시 하지 않는다)
    let after = if add.is_empty() { vec![] } else { compute(db, &add).await? };
    let open = q1(db, "
        SELECT record::id(id) AS id, ym, approver, total, members.map(|$m| record::id($m)) AS members FROM review
        WHERE fixed = NONE AND members ANYINSIDE $ds.map(|$d| type::record('dealer', $d)) ORDER BY id;", json!({ "ds": dealers.iter().map(|d| &d.0).collect::<Vec<_>>() })).await?;
    let reviews: Vec<J> = open.as_array().into_iter().flatten().filter_map(|r| {
        let first = &r["members"][0];
        let p = if add.is_empty() { r } else { after.iter().find(|p| p["ym"] == r["ym"] && p["members"].as_array().is_some_and(|m| m.contains(first)))? };
        Some(json!({ "id": r["id"], "group": [r["members"].as_array().map_or(0, Vec::len), p["members"].as_array().map_or(0, Vec::len)], "approver": [r["approver"], p["approver"]], "total": [r["total"], p["total"]] }))
    }).collect();
    let pick = |i: usize| top(reviews.iter().filter_map(|r| r["approver"][i].as_str()).collect());
    Ok(Some(json!({
        "id": sig["id"], "name": sig["name"], "source": "가정", "target": dealers[0].1,
        "adds": add.iter().map(|l| ITEMS[l.item]).collect::<BTreeSet<_>>(),
        "match": dealers[1..].iter().map(|(d, name)| json!({ "id": d, "dealer": name, "cur": names(matches(&now, &target, d)), "hyp": names(matches(&hyp, &target, d)) })).collect::<Vec<_>>(),
        "group": [size(&now), size(&hyp)],
        "approver": [pick(0), pick(1)],
        "up": reviews.iter().any(|r| rank(r["approver"][0].as_str().unwrap_or("")) < rank(r["approver"][1].as_str().unwrap_or(""))),
        "reviews": reviews,
    })))
}

/// 가설에서 승인권자가 올라가는 심사를 영업임원의 담당으로 맞춘다(가정. 영업지원이 승인할 수 없다). 열린 정황(접수·요청)만 보고, 굳은 심사는 건드리지 않는다.
/// 저장된 합산과 승인권자는 바꾸지 않는다. `recalc`와 `detect`, 정황의 결정이 끝에 부른다
// ponytail: 열린 정황마다 가설의 계산을 다시 한다. 정황이 수백 건이 되면 더할 선이 같은 정황끼리 묶어 한 번에 계산한다
pub async fn raise(db: &Db) -> Result<()> {
    let open = q1(db, "SELECT VALUE record::id(id) FROM signal WHERE state INSIDE ['접수', '요청'] ORDER BY id;", json!({})).await?;
    let (mut sigs, mut reviews) = (BTreeSet::new(), BTreeSet::new());
    for id in open.as_array().into_iter().flatten().filter_map(J::as_str) {
        if extra(db, id).await?.is_none_or(|(_, add)| add.is_empty()) {
            continue;
        }
        if let Some(a) = analyze(db, id).await? {
            for r in a["reviews"].as_array().into_iter().flatten().filter(|r| r["approver"][0] == "영업지원" && r["approver"][1] == "영업임원") {
                sigs.insert(id.to_string());
                reviews.insert(r["id"].as_str().unwrap_or_default().to_string());
            }
        }
    }
    q(db, "
        UPDATE review SET raised = record::id(id) INSIDE $reviews WHERE fixed = NONE;
        UPDATE signal SET raised = record::id(id) INSIDE $sigs WHERE state INSIDE ['접수', '요청'];
        UPDATE task SET role = fn::holder(target) WHERE kind = '심사' AND target.fixed = NONE AND state != '완료';",
        json!({ "reviews": reviews, "sigs": sigs })).await?;
    Ok(())
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/signals/{id}/hypo", get(of_signal)).route("/reviews/{id}/hypo", get(of_review))
}

/// 정황의 가설: `analyze`의 결과에서 심사마다의 값을 뺀 것
async fn of_signal(State(db): State<std::sync::Arc<Db>>, Path(id): Path<String>) -> R {
    let Some(mut a) = analyze(&db, &id).await? else { return Err(err(StatusCode::NOT_FOUND, "없음")) };
    a.as_object_mut().map(|o| o.remove("reviews"));
    Ok(Json(a))
}

/// 심사의 가설: 그 심사의 구성원에 걸린 열린 정황마다, 그 심사의 그룹과 승인권자로 본 가설. 굳은 심사는 비어 있다
async fn of_review(State(db): State<std::sync::Arc<Db>>, Path(id): Path<String>) -> R {
    let ids = q1(&db, "
        LET $r = type::record('review', $id);
        RETURN IF $r.fixed = NONE THEN (SELECT VALUE record::id(id) FROM signal WHERE state INSIDE ['접수', '요청'] AND dealers ANYINSIDE ($r.members ?? []) ORDER BY id) ELSE [] END;", json!({ "id": id })).await?;
    let mut out = vec![];
    for s in ids.as_array().into_iter().flatten().filter_map(J::as_str) {
        let Some(mut a) = analyze(&db, s).await? else { continue };
        let Some(r) = a["reviews"].as_array().and_then(|rs| rs.iter().find(|r| r["id"] == id.as_str())).cloned() else { continue };
        // 일치 줄의 이름은 그 심사의 구성원이 아닌 쪽이다(대상이 구성원이면 상대, 아니면 대상)
        let mem = q1(&db, "RETURN type::record('review', $id).members.map(|$m| record::id($m));", json!({ "id": id })).await?;
        let inside = |d: &J| mem.as_array().is_some_and(|m| m.contains(d));
        let target = a["target"].clone();
        let tid = dealers_id(&db, s).await?;
        if let Some(rows) = a["match"].as_array_mut() {
            for m in rows.iter_mut() {
                if !inside(&tid) && inside(&m["id"]) {
                    m["dealer"] = target.clone();
                }
            }
        }
        a["group"] = r["group"].clone();
        a["approver"] = r["approver"].clone();
        a["up"] = json!(r["approver"][0] == "영업지원" && r["approver"][1] == "영업임원");
        a.as_object_mut().map(|o| o.remove("reviews"));
        out.push(a);
    }
    Ok(Json(json!(out)))
}

async fn dealers_id(db: &Db, sig: &str) -> Result<J> {
    q1(db, "RETURN record::id(type::record('signal', $id).dealers[0]);", json!({ "id": sig })).await
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit) = ("영업지원", "영업임원", "내부 감시");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let hypo = async |path: &str| c.get(support, path).await;
    let (bank, name, near) = ("계좌-D-024", "동명-박준호", "근접-D-011");
    let (group, r34, plain) = ("2026-06-D-011", "2026-06-D-034", "2026-06-D-001");

    // 계좌 정황: 성일상사24의 회수가 들어간 계좌가 금강상사11·대륙상사37의 계좌와 같다고 놓으면 일치에 계좌가 더해진다.
    // 세 곳은 이미 한 그룹이라 그룹도 승인권자(영업임원)도 그대로다. 출처는 가정
    let d = hypo(&format!("/api/signals/{bank}/hypo")).await?;
    ensure!(d == json!({ "id": bank, "name": "계좌 · 성일상사24", "source": "가정", "adds": ["계좌"],
        "target": "성일상사24", "match": [{ "id": "D-011", "dealer": "금강상사11", "cur": ["대표자", "주소"], "hyp": ["대표자", "주소", "계좌"] }, { "id": "D-037", "dealer": "대륙상사37", "cur": ["대표자"], "hyp": ["대표자", "계좌"] }],
        "group": [3, 3], "approver": [exec, exec], "up": false }), "계좌 정황의 가설 {d}");
    // 동명과 근접: 더할 선이 없어 가설이 현재와 같다
    let d = hypo(&format!("/api/signals/{name}/hypo")).await?;
    ensure!(d["adds"] == json!([]) && d["match"] == json!([{ "id": "D-041", "dealer": "금강상사41", "cur": ["대표자"], "hyp": ["대표자"] }]) && d["group"] == json!([1, 1]) && d["approver"] == json!([support, support]) && d["up"] == false, "동명 정황의 가설 {d}");
    let d = hypo(&format!("/api/signals/{near}/hypo")).await?;
    ensure!(d["match"] == json!([]) && d["group"] == json!([3, 3]) && d["approver"] == json!([exec, exec]) && d["up"] == false, "근접 정황의 가설 {d}");
    ensure!(c.call(Some(c.token(support)), "GET", "/api/signals/없음/hypo", None).await?.0 == 404, "없는 정황");
    // 심사 상세의 가설: 그 심사의 그룹과 승인권자로 본다. 정황이 없는 심사와 지난 심사에는 없다
    let d = hypo(&format!("/api/reviews/{group}/hypo")).await?;
    ensure!(rows(&d).iter().map(|h| h["id"].clone()).collect::<Vec<_>>() == [json!(bank), json!(near)] && rows(&d).iter().all(|h| h["group"] == json!([3, 3]) && h["approver"] == json!([exec, exec]) && h["up"] == false), "심사의 가설 {d}");
    ensure!(hypo(&format!("/api/reviews/{r34}/hypo")).await?[0]["approver"] == json!([support, support]) && hypo(&format!("/api/reviews/{plain}/hypo")).await? == json!([]) && hypo("/api/reviews/2026-01-D-011/hypo").await? == json!([]), "가설이 없는 심사");
    // 일치 줄의 이름은 그 심사에 없는 쪽이다: 한라인상사34의 심사에서는 금강상사41, 금강상사41의 심사에서는 한라인상사34
    let (a, b) = (hypo(&format!("/api/reviews/{r34}/hypo")).await?, hypo("/api/reviews/2026-06-D-041/hypo").await?);
    ensure!(a[0]["match"][0]["dealer"] == "금강상사41" && b[0]["match"][0]["dealer"] == "한라인상사34", "상대 쪽 이름 {a} {b}");
    // 승인권자가 올라가는 정황은 원본에 없다: 의견은 그대로 열려 있고, 심사는 원래의 담당에 있다
    let raised = async || q1(&c.db, "RETURN [count(SELECT id FROM review WHERE raised), count(SELECT id FROM signal WHERE raised)];", json!({})).await;
    ensure!(raised().await? == json!([0, 0]), "원본에 올라가는 심사");

    // 본보기: 대성상사1(988,932)과 대륙상사6(1,261,524)은 대표자가 같고(관련자는 아니다), 대성상사1의 회수가 대륙상사6의 계좌로 들어갔다고 하자.
    // 정황이 사실이면 두 곳이 한 그룹이 되어 합산 2,250,456이 한도(2,000,000)를 넘는다. 이름은 전용이다(`계좌-본보기`)
    let (d1, d6) = ("2026-06-D-001", "2026-06-D-006");
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
    let sample = "계좌-본보기";
    let d = hypo(&format!("/api/signals/{sample}/hypo")).await?;
    ensure!(d["match"] == json!([{ "id": "D-006", "dealer": "대륙상사6", "cur": ["대표자"], "hyp": ["대표자", "계좌"] }]) && d["group"] == json!([1, 2]) && d["approver"] == json!([support, exec]) && d["up"] == true, "본보기의 가설 {d}");
    for id in [d1, d6] {
        let h = hypo(&format!("/api/reviews/{id}/hypo")).await?;
        ensure!(h[0]["id"] == sample && h[0]["group"] == json!([1, 2]) && h[0]["approver"] == json!([support, exec]) && h[0]["up"] == true, "{id}의 가설 {h}");
    }
    // 가설은 합산과 승인권자에 들어가지 않는다: 저장된 값 그대로다. 담당만 영업임원으로 간다
    let rv = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}")).await;
    let d = rv(support, d1).await?;
    ensure!(d["review"]["total"] == 988_932 && d["review"]["approver"] == support && d["review"]["holder"] == exec && rows(&d["members"]).len() == 1, "저장된 값 {}", d["review"]);
    ensure!(raised().await? == json!([2, 1]), "올라간 심사와 정황");
    // 영업지원은 승인할 수 없고 영업임원의 담당으로 간다. 정황이 걸린 심사라 사유는 필수이고 선택 칸은 없다
    ensure!(d["actions"] == json!([]) && rows(&rv(exec, d1).await?["actions"]).iter().any(|a| a["kind"] == "승인" && a["reason"] == true), "조치 {}", d["actions"]);
    let task = async |role: &str, key: &str| Ok::<_, anyhow::Error>(rows(&c.get(role, "/api/tasks").await?[key]).into_iter().find(|t| t["target"] == d1));
    let (mine, going) = (task(exec, "mine").await?.unwrap_or_default(), task(support, "going").await?.unwrap_or_default());
    ensure!(mine["role"] == exec && mine["pick"] == false && going["role"] == exec && task(support, "mine").await?.is_none(), "작업의 담당 {mine} {going}");
    let approve = async |role: &str, ids: &[&str], reason: J| c.post(role, "/api/decide", json!({ "ids": ids, "kind": "승인", "reason": reason })).await;
    for kind in ["승인", "보류", "반려"] {
        let (code, r) = c.post(support, "/api/decide", json!({ "ids": [d1], "kind": kind, "reason": { "class": "기타", "memo": "시험" } })).await?;
        ensure!(code == 403 && r == json!({ "error": "권한" }), "영업지원의 {kind} {code} {r}");
    }
    ensure!(approve(exec, &[d1], J::Null).await? == (400, json!({ "error": "사유" })), "사유 없는 승인");
    // 승인권자가 올라가지 않는 심사는 영업지원이 그대로 한다
    ensure!(c.post(support, "/api/decide", json!({ "ids": ["2026-06-D-002"], "kind": "승인" })).await?.0 == 200, "올라가지 않은 심사");
    // 의견은 내부 감시가 조치를 내린 뒤에야 열린다(17). 올라가지 않는 정황은 그대로 열려 있다
    let opened = async |id: &str| Ok::<_, anyhow::Error>(c.get(audit, &format!("/api/signals/{id}/report")).await?["opened"].clone());
    ensure!(opened(sample).await? == false && opened(bank).await? == true, "의견이 열리는 때");
    // 정황이 기각되면 가설이 닫히고 심사는 원래의 담당으로 돌아온다. 다시 찾아도 기각된 채다
    let (code, r) = c.post(audit, "/api/rule", json!({ "id": sample, "kind": "기각", "reason": { "class": "부족" } })).await?;
    ensure!(code == 200, "기각 {r}");
    let d = rv(support, d1).await?;
    ensure!(raised().await? == json!([0, 1]) && d["review"]["holder"] == support && rows(&d["actions"]).iter().any(|a| a["kind"] == "승인") && opened(sample).await? == true, "기각 뒤 {}", d["review"]);
    ensure!(task(support, "mine").await?.is_some() && task(exec, "mine").await?.is_none(), "기각 뒤의 담당");
    // 선택 칸의 정황 표시는 11이 떼고, 대륙상사6의 심사도 돌아온다
    ensure!(rv(support, d6).await?["review"]["holder"] == support, "대륙상사6의 심사");
    // 직접 DB에 써도 영업지원은 올라간 심사를 승인할 수 없다는 것은 권한 규칙(fn::can)이 정한다: 다시 올려 보고 DB로 쓴다
    q(&c.db, "UPDATE review:`2026-06-D-006` SET raised = true; UPDATE task SET role = '영업임원' WHERE target = review:`2026-06-D-006`;", json!({})).await?;
    let s = as_user(&c.db, c.token(support)).await?;
    q(&s, "CREATE decision SET review = review:`2026-06-D-006`, kind = '승인', reason = { class: '정상' };", json!({})).await.ok();
    ensure!(rv(exec, d6).await?["review"]["status"] == "대기" && rows(&rv(exec, d6).await?["history"]).is_empty(), "DB가 거절해야 한다");
    Ok(())
}
