//! 16 경위: 어떤 지급·심사·추인 작업이든 무엇 때문에 생겼는지를 처음의 사건까지 거슬러 보인다(D37, 선 25).
//! 원인 선은 따로 저장하지 않고 이미 있는 기록을 거슬러 읽어 잇는다(기본값. 저장하면 선을 바꾸는 모든 티켓이 함께 써야 한다):
//!   지급: 앞선 승인(14 `redo.was`) → 변경(`redo.cause`, 13의 `incident`) → 재심사 지급 → 다시 승인한 심사(`redo.back` 또는 합쳐진 새 심사)
//!   추인: 변경(그 구성원의 승인 뒤에 들어온 가장 늦은 변경. 14와 같은 규칙) → 재검토인 과거의 승인(10 `ratify.reviews`) → 추인 작업 → 결정(추인·거부·종결·이견)
//!   심사: 그 심사가 든 지급의 경위, 없으면 그 심사가 든 추인의 경위, 둘 다 아니면 구성원의 가장 늦은 변경 → 그 심사(굳지 않은 심사만). 그것도 없으면 없음(404)
//! 응답: `{ for([종류, id] — 화면이 지금 대상의 것인지 본다), now(지금 대상의 칸), nodes[{ key, kind, name, at(null이면 미상), who{ role, reason }|null, go{ kind, id } }](원인 쪽부터 사슬의 순서), edges[[원인, 결과]] }`.
use crate::check::Check;
use crate::db::{Db, q1};
use crate::{R, err};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/16-경위.surql");

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/trail/{kind}/{id}", get(trail))
}

/// 원인인 변경의 값(`$c`가 incident의 id)
const CAUSE: &str = "IF $c THEN { id: record::id($c), dealer: record::id($c.dealer), name: $c.dealer.name, item: $c.item, role: $c.role, at: time::format($c.at, '%Y-%m-%d') } END";

fn node(key: String, kind: &str, name: String, at: J, who: J, go: (&str, String)) -> J {
    json!({ "key": key, "kind": kind, "name": name, "at": at, "who": who, "go": { "kind": go.0, "id": go.1 } })
}

fn s(v: &J) -> String {
    v.as_str().unwrap_or_default().to_string()
}

/// 변경 칸. 없으면 None
fn incident(c: &J) -> Option<J> {
    (!c.is_null()).then(|| node(format!("i:{}", s(&c["id"])), "변경", format!("{} {}", s(&c["name"]), s(&c["item"])), c["at"].clone(), json!({ "role": c["role"] }), ("대리점", s(&c["dealer"]))))
}

/// 사슬을 잇는다: 앞 칸들을 차례로 한 줄로 이을 때 쓴다
fn chain(keys: &[&str]) -> Vec<J> {
    keys.windows(2).map(|w| json!([w[0], w[1]])).collect()
}

async fn pay(db: &Db, id: &str) -> Result<Option<(Vec<J>, Vec<J>, String)>> {
    let r = q1(db, &format!("
        LET $p = (SELECT * FROM payout WHERE id = type::record('payout', $id))[0];
        LET $r = (SELECT * FROM redo WHERE payout = $p.id ORDER BY stamp DESC LIMIT 1)[0];
        LET $was = $r.was ?? $p.review;
        LET $new = IF $r != NONE THEN $r.back ?? (SELECT VALUE id FROM review WHERE payouts CONTAINS $p.id AND id != $was AND fixed = NONE ORDER BY id DESC LIMIT 1)[0] END;
        LET $c = $r.cause;
        RETURN IF $p = NONE OR $was = NONE THEN NONE ELSE {{
            pay: {{ id: record::id($p.id), name: $p.name, ym: $p.ym, at: IF $r != NONE THEN time::format($r.at, '%Y-%m-%d') ELSE (SELECT VALUE time::format(at, '%Y-%m-%d') FROM remit WHERE payout = $p.id ORDER BY stamp DESC LIMIT 1)[0] END, redo: $r != NONE }},
            was: {{ id: record::id($was), name: $was.name, ym: $was.ym,
                ok: (SELECT role, reason, IF at THEN time::format(at, '%Y-%m-%d') END AS at FROM decision WHERE review = $was AND kind = '승인' AND was = NONE ORDER BY stamp DESC LIMIT 1)[0] }},
            cause: {CAUSE},
            new: IF $new THEN {{ id: record::id($new), name: $new.name, ym: $new.ym }} END,
        }} END;"), json!({ "id": id })).await?;
    if r.is_null() {
        return Ok(None);
    }
    let was = &r["was"];
    let mut nodes = vec![node(format!("r:{}", s(&was["id"])), "승인", format!("{} {}", s(&was["name"]), s(&was["ym"])), was["ok"]["at"].clone(), json!({ "role": was["ok"]["role"], "reason": was["ok"]["reason"] }), ("심사", s(&was["id"])))];
    let mut keys = vec![nodes[0]["key"].as_str().unwrap_or("").to_string()];
    if let Some(i) = incident(&r["cause"]) {
        keys.push(s(&i["key"]));
        nodes.push(i);
    }
    let p = &r["pay"];
    let pkey = format!("p:{}", s(&p["id"]));
    keys.push(pkey.clone());
    nodes.push(node(pkey.clone(), if p["redo"] == true { "재심사" } else { "지급" }, format!("{} {}", s(&p["name"]), s(&p["ym"])), p["at"].clone(), J::Null, ("지급", s(&p["id"]))));
    if !r["new"].is_null() {
        let n = &r["new"];
        keys.push(format!("r:{}", s(&n["id"])));
        nodes.push(node(keys[keys.len() - 1].clone(), "심사", format!("{} {}", s(&n["name"]), s(&n["ym"])), J::Null, J::Null, ("심사", s(&n["id"]))));
    }
    let edges = chain(&keys.iter().map(String::as_str).collect::<Vec<_>>());
    Ok(Some((nodes, edges, pkey)))
}

async fn ratify(db: &Db, id: &str) -> Result<Option<(Vec<J>, Vec<J>, String)>> {
    let r = q1(db, &format!("
        LET $b = (SELECT * FROM ratify WHERE id = type::record('ratify', $id))[0];
        LET $c = (SELECT id, stamp FROM incident WHERE dealer INSIDE $b.members AND at >= (SELECT VALUE fixed FROM review WHERE id INSIDE $b.reviews ORDER BY fixed LIMIT 1)[0] ORDER BY stamp DESC LIMIT 1)[0].id;
        RETURN IF $b = NONE THEN NONE ELSE {{
            b: {{ id: record::id($b.id), name: $b.name, ym: $b.ym }},
            cause: {CAUSE},
            reviews: $b.reviews.map(|$r| {{ id: record::id($r), name: $r.name, ym: $r.ym }}),
            decisions: (SELECT kind, role, reason, IF at THEN time::format(at, '%Y-%m-%d') END AS at FROM decision WHERE review = $b.reviews[0] AND kind INSIDE ['추인', '거부', '종결', '이견'] ORDER BY stamp),
        }} END;"), json!({ "id": id })).await?;
    if r.is_null() {
        return Ok(None);
    }
    // 재검토와 작업이 생긴 날은 원인인 변경이 들어온 날이다(원인이 없는 원본의 재검토는 미상)
    let at = r["cause"]["at"].clone();
    let mut nodes = vec![];
    let mut edges = vec![];
    let cause = incident(&r["cause"]);
    if let Some(i) = &cause {
        nodes.push(i.clone());
    }
    let b = &r["b"];
    let bkey = format!("b:{}", s(&b["id"]));
    for v in r["reviews"].as_array().cloned().unwrap_or_default() {
        let key = format!("r:{}", s(&v["id"]));
        nodes.push(node(key.clone(), "재검토", format!("{} {}", s(&v["name"]), s(&v["ym"])), at.clone(), J::Null, ("심사", s(&v["id"]))));
        if let Some(i) = &cause {
            edges.push(json!([i["key"], key]));
        }
        edges.push(json!([key, bkey]));
    }
    nodes.push(node(bkey.clone(), "작업", format!("{} {}", s(&b["name"]), s(&b["ym"])), at, J::Null, ("추인", s(&b["id"]))));
    let mut last = bkey.clone();
    for (n, d) in r["decisions"].as_array().cloned().unwrap_or_default().iter().enumerate() {
        let key = format!("d:{}:{n}", s(&b["id"]));
        nodes.push(node(key.clone(), &s(&d["kind"]), format!("{} {}", s(&b["name"]), s(&b["ym"])), d["at"].clone(), json!({ "role": d["role"], "reason": d["reason"] }), ("추인", s(&b["id"]))));
        edges.push(json!([last, key]));
        last = key;
    }
    Ok(Some((nodes, edges, bkey)))
}

/// 지급도 추인도 없는 굳지 않은 심사(대기·보류): 그 구성원의 가장 늦은 변경 → 그 심사. 변경으로 그룹이 바뀌어 새로 생긴 심사(한라인상사34 외 1의 6월)가 이것이다.
/// 변경이 없으면 거슬러 오를 것이 없다(없음)
async fn changed(db: &Db, id: &str) -> Result<Option<(Vec<J>, Vec<J>, String)>> {
    let r = q1(db, &format!("
        LET $v = (SELECT * FROM review WHERE id = type::record('review', $id))[0];
        LET $c = IF $v.fixed = NONE THEN (SELECT VALUE id FROM incident WHERE dealer INSIDE $v.members ORDER BY stamp DESC LIMIT 1)[0] END;
        RETURN IF $v = NONE THEN NONE ELSE {{ me: {{ id: record::id($v.id), name: $v.name, ym: $v.ym }}, cause: {CAUSE} }} END;"), json!({ "id": id })).await?;
    let Some(i) = incident(&r["cause"]) else { return Ok(None) };
    let me = &r["me"];
    let key = format!("r:{}", s(&me["id"]));
    let edges = vec![json!([i["key"], key])];
    let nodes = vec![i, node(key.clone(), "심사", format!("{} {}", s(&me["name"]), s(&me["ym"])), J::Null, J::Null, ("심사", s(&me["id"])))];
    Ok(Some((nodes, edges, key)))
}

async fn trail(Extension(me): Extension<crate::Me>, Path((kind, id)): Path<(String, String)>) -> R {
    let db = &me.db;
    let path = kind.clone();
    let (mut found, mut now) = match kind.as_str() {
        "pay" => (pay(db, &id).await?, None),
        "ratify" => (ratify(db, &id).await?, None),
        // 심사: 그 심사가 든 지급(재심사의 앞선 승인·다시 승인한 심사 포함)의 경위, 없으면 그 심사가 든 추인의 경위. 지금 대상은 그 심사의 칸
        "review" => {
            let r = q1(db, "
                LET $v = (SELECT * FROM review WHERE id = type::record('review', $id))[0];
                RETURN IF $v = NONE THEN NONE ELSE {
                    pays: array::distinct((SELECT VALUE record::id(payout) FROM redo WHERE was = $v.id OR back = $v.id OR payout INSIDE $v.payouts ORDER BY stamp DESC)),
                    ratify: (SELECT VALUE record::id(id) FROM ratify WHERE reviews CONTAINS $v.id LIMIT 1)[0],
                    paid: (SELECT VALUE record::id(id) FROM payout WHERE review = $v.id LIMIT 1)[0],
                } END;", json!({ "id": id })).await?;
            // 재심사 기록이 없는 보통의 승인 심사는 그 심사가 승인한 지급의 경위(승인 → 지급)로 연다. 추인 묶음에 든 과거의 승인은 추인이 먼저다
            // 합쳐진 심사는 구성원마다 지급이 재심사가 되므로 그 사슬을 모두 합친다(칸 · 선은 중복 없이)
            let f = if let Some(ps) = r["pays"].as_array().filter(|a| !a.is_empty()) {
                let mut all: Option<(Vec<J>, Vec<J>, String)> = None;
                for p in ps.iter().filter_map(J::as_str) {
                    if let Some((n, e, k)) = pay(db, p).await? {
                        let (an, ae, _) = all.get_or_insert((vec![], vec![], k));
                        an.extend(n.into_iter().filter(|x| !an.iter().any(|y| y["key"] == x["key"])).collect::<Vec<_>>());
                        ae.extend(e.into_iter().filter(|x| !ae.contains(x)).collect::<Vec<_>>());
                    }
                }
                all
            } else if let Some(b) = r["ratify"].as_str() { ratify(db, b).await? } else if let Some(p) = r["paid"].as_str() { pay(db, p).await? } else { changed(db, &id).await? };
            (f, Some(format!("r:{id}")))
        }
        _ => (None, None),
    };
    // 사슬이 한 칸뿐이면 거슬러 오를 것이 없다
    let Some((nodes, edges, key)) = found.take().filter(|(n, _, _)| n.len() > 1) else {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    };
    let now = now.take().filter(|k| nodes.iter().any(|n| n["key"] == *k)).unwrap_or(key);
    Ok(Json(json!({ "for": [path, id], "now": now, "nodes": nodes, "edges": edges })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &mut Check) -> Result<()> {
    let (support, exec, acct, audit) = ("영업지원", "영업임원", "회계·자금", "내부 감시");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let kinds = |t: &J| rows(&t["nodes"]).iter().map(|n| s(&n["kind"])).collect::<Vec<_>>();
    let edges = |t: &J| rows(&t["edges"]).iter().map(|e| (s(&e[0]), s(&e[1]))).collect::<Vec<_>>();
    let node = |t: &J, kind: &str| rows(&t["nodes"]).into_iter().find(|n| n["kind"] == kind).unwrap_or_default();
    let missing = async |c: &Check, path: &str| -> Result<bool> { Ok(c.call(Some(c.token(exec)), "GET", path, None).await?.0 == 404) };
    let r34 = "2026-06-D-034";
    let merged = "2026-06-D-034-2";

    // 원본 상태: 사건이 없다. 재검토인 과거의 승인 → 추인 작업 두 칸뿐이고 날짜는 미상이다
    let mine: Vec<J> = rows(&c.get(exec, "/api/tasks").await?["mine"]).into_iter().filter(|t| t["kind"] == "추인").collect();
    ensure!(mine.len() == 5, "추인 작업 {}건", mine.len());
    let old = s(&mine.iter().find(|t| s(&t["target"]).starts_with("2026-01")).cloned().unwrap_or_default()["target"]);
    let t = c.get(exec, &format!("/api/trail/ratify/{old}")).await?;
    // 화면(16-경위/index.tsx의 Trail)이 읽는 칸 전체: for, now, nodes[key kind name at who go{kind id}], edges[[a, b]]
    ensure!(t["for"] == json!(["ratify", old]) && t["now"].is_string() && rows(&t["nodes"]).iter().all(|n| ["key", "kind", "name", "at", "who", "go"].iter().all(|k| n.get(*k).is_some()) && n["go"]["kind"].is_string() && n["go"]["id"].is_string()) && rows(&t["edges"]).iter().all(|e| e[0].is_string() && e[1].is_string()), "응답의 꼴 {t}");
    ensure!(kinds(&t) == ["재검토", "재검토", "재검토", "작업"] && t["now"] == format!("b:{old}").as_str() && rows(&t["nodes"]).iter().all(|n| n["at"].is_null()), "원본의 추인 경위 {t}");
    ensure!(edges(&t).len() == 3 && edges(&t).iter().all(|(_, to)| *to == format!("b:{old}")), "원본의 선");
    // 원본의 승인(날짜 없음)이 든 심사의 경위도 열린다 — 날짜가 없는 결정을 날짜로 바꾸다 500이 나던 것
    let o = c.call(Some(c.token(exec)), "GET", "/api/trail/review/2026-01-D-004", None).await?;
    ensure!(o.0 == 200 || o.0 == 404, "날짜 없는 원본 승인의 심사 경위 {o:?}");
    // 없는 대상, 거슬러 오를 것이 없는 대상, 모르는 종류는 없음
    ensure!(missing(c, "/api/trail/pay/없음").await? && missing(c, "/api/trail/ratify/없음").await? && missing(c, "/api/trail/review/없음").await? && missing(c, "/api/trail/x/1").await?, "없는 대상");
    let w = c.call(Some(c.token(exec)), "GET", &format!("/api/trail/review/{r34}"), None).await?;
    ensure!(w.0 == 404, "대기 심사에는 경위가 없다 {w:?}");

    // 시나리오 4의 준비: 영업지원이 한라인상사34의 6월분을 승인한다. 지급은 승인 → 지급 두 칸
    ensure!(c.post(support, "/api/decide", json!({ "ids": [r34], "kind": "승인", "reason": { "class": "경미" } })).await?.0 == 200, "승인");
    let pays = rows(&c.get(acct, "/api/pays").await?["rows"]);
    let pay = s(&pays.iter().find(|p| p["name"] == "한라인상사34").cloned().unwrap_or_default()["id"]);
    let t = c.get(acct, &format!("/api/trail/pay/{pay}")).await?;
    ensure!(kinds(&t) == ["승인", "지급"] && edges(&t).len() == 1 && s(&node(&t, "승인")["who"]["role"]) == support, "승인 뒤의 지급 경위 {t}");
    // 승인한 보통의 심사(재심사 기록 없음)도 그 지급의 경위로 열리고, 지금 칸은 그 승인이다
    let u = c.get(exec, &format!("/api/trail/review/{r34}")).await?;
    ensure!(u["nodes"] == t["nodes"] && u["now"] == format!("r:{r34}").as_str(), "보통 승인 심사의 경위 {u}");

    // 1~3: 주소 변경(변경일 2월 1일, 인지일 7월 1일). 지급의 경위는 승인 → 변경 → 재심사 → 새 심사
    ensure!(c.post(support, "/api/change", json!({ "id": "D-034", "item": "주소", "value": "고양시 중앙로 128", "since": "2026-02-01" })).await?.0 == 200, "변경");
    let t = c.get(acct, &format!("/api/trail/pay/{pay}")).await?;
    let (ok, inc, redo, next) = (node(&t, "승인"), node(&t, "변경"), node(&t, "재심사"), node(&t, "심사"));
    // 합쳐진 새 심사(영업임원의 담당에서 기다린다)가 결과 쪽 끝에 이어진다
    ensure!(kinds(&t) == ["승인", "변경", "재심사", "심사"] && t["now"] == redo["key"] && next["go"]["id"] == merged && next["at"].is_null(), "지급의 경위 {t}");
    ensure!(edges(&t) == [(s(&ok["key"]), s(&inc["key"])), (s(&inc["key"]), s(&redo["key"])), (s(&redo["key"]), s(&next["key"]))], "지급의 선 {t}");
    ensure!(ok["who"] == json!({ "role": support, "reason": { "class": "경미" } }) && s(&ok["name"]) == "한라인상사34 2026-06", "결정의 사람과 사유 {ok}");
    ensure!(inc["name"] == "한라인상사34 주소" && inc["at"] == "2026-07-01" && inc["who"] == json!({ "role": support }) && inc["go"] == json!({ "kind": "대리점", "id": "D-034" }), "변경의 칸 {inc}");
    ensure!(redo["go"] == json!({ "kind": "지급", "id": pay }) && redo["name"] == "한라인상사34 2026-06", "재심사의 칸 {redo}");
    // 앞선 승인에서도 같은 사슬이고, 지금 대상은 그 승인의 칸이다
    let t = c.get(exec, &format!("/api/trail/review/{r34}")).await?;
    ensure!(kinds(&t) == ["승인", "변경", "재심사", "심사"] && t["now"] == format!("r:{r34}").as_str(), "앞선 승인의 경위 {t}");

    // 4: 영업임원이 합쳐진 심사를 승인해도 사슬은 같고 지급은 다시 대기가 된다(재심사의 칸은 그대로 남는다)
    ensure!(c.post(exec, "/api/decide", json!({ "ids": [merged], "kind": "승인", "reason": { "class": "정상" } })).await?.0 == 200, "재승인");
    let t = c.get(acct, &format!("/api/trail/pay/{pay}")).await?;
    ensure!(kinds(&t) == ["승인", "변경", "재심사", "심사"] && edges(&t).len() == 3 && node(&t, "심사")["go"]["id"] == merged, "재승인 뒤의 경위 {t}");
    ensure!(c.get(exec, &format!("/api/trail/review/{merged}")).await?["now"] == format!("r:{merged}").as_str(), "다시 승인한 심사");

    // 추인 작업의 경위: 변경 → 재검토 → 작업. 2월의 재검토 두 건(한라인상사34 · 금강상사41)이 한 작업으로 모인다
    let mine: Vec<J> = rows(&c.get(exec, "/api/tasks").await?["mine"]).into_iter().filter(|t| t["kind"] == "추인").collect();
    let feb = s(&mine.iter().find(|t| s(&t["target"]).starts_with("2026-02-D-034")).cloned().unwrap_or_default()["target"]);
    let t = c.get(exec, &format!("/api/trail/ratify/{feb}")).await?;
    let work = format!("b:{feb}");
    ensure!(kinds(&t) == ["변경", "재검토", "재검토", "작업"] && t["now"] == work.as_str(), "추인 작업의 경위 {t}");
    let inc = node(&t, "변경");
    ensure!(inc["name"] == "한라인상사34 주소" && inc["at"] == "2026-07-01", "추인의 원인 {inc}");
    let es = edges(&t);
    ensure!(es.len() == 4 && es.iter().filter(|(a, _)| *a == s(&inc["key"])).count() == 2 && es.iter().filter(|(_, b)| *b == work).count() == 2, "추인의 선 {es:?}");
    ensure!(rows(&t["nodes"]).iter().filter(|n| n["kind"] == "재검토").all(|n| n["at"] == "2026-07-01" && n["go"]["kind"] == "심사"), "재검토의 칸");
    // 과거의 승인(한 건)에서 열어도 같은 사슬이고 지금 대상은 그 재검토의 칸이다
    let first = s(&rows(&t["nodes"]).iter().find(|n| n["kind"] == "재검토").cloned().unwrap_or_default()["go"]["id"]);
    let u = c.get(support, &format!("/api/trail/review/{first}")).await?;
    ensure!(u["nodes"] == t["nodes"] && u["now"] == format!("r:{first}").as_str(), "재검토에서 연 경위 {u}");

    // 영업임원이 추인하면 결정의 칸이 사람과 사유를 달고 이어진다. 내부 감시의 종결이 그 뒤에 이어진다
    let target = s(&c.get(exec, &format!("/api/ratifies/{feb}")).await?["target"]);
    ensure!(c.post(exec, "/api/decide", json!({ "ids": [target], "kind": "추인", "reason": { "class": "미인지", "memo": "당시에는 알 수 없었다" } })).await?.0 == 200, "추인");
    ensure!(c.post(audit, "/api/decide", json!({ "ids": [target], "kind": "종결", "reason": { "class": "정상" } })).await?.0 == 200, "종결");
    let t = c.get(audit, &format!("/api/trail/ratify/{feb}")).await?;
    ensure!(kinds(&t) == ["변경", "재검토", "재검토", "작업", "추인", "종결"] && edges(&t).len() == 6, "결정까지의 경위 {t}");
    ensure!(node(&t, "추인")["who"] == json!({ "role": exec, "reason": { "class": "미인지", "memo": "당시에는 알 수 없었다" } }) && node(&t, "종결")["who"]["role"] == audit && t["now"] == work.as_str(), "결정의 사람과 사유 {t}");
    // 승인하지 않은 채 변경이 들어와 합쳐진 대기 심사: 변경 → 그 심사(시나리오 4의 8. 지급도 추인도 없다)
    c.reset().await?;
    ensure!(c.post(support, "/api/change", json!({ "id": "D-034", "item": "주소", "value": "고양시 중앙로 128", "since": "2026-02-01" })).await?.0 == 200, "변경");
    let t = c.get(exec, &format!("/api/trail/review/{r34}")).await?;
    ensure!(kinds(&t) == ["변경", "심사"] && t["now"] == format!("r:{r34}").as_str() && node(&t, "변경")["name"] == "한라인상사34 주소", "변경으로 합쳐진 심사의 경위 {t}");
    // 재심사된 적 없는 지급은 지급 표시(remit)를 한 날이 지급 칸의 날짜다. 표시 전에는 미상
    c.reset().await?;
    ensure!(c.post(support, "/api/decide", json!({ "ids": [r34], "kind": "승인", "reason": { "class": "경미" } })).await?.0 == 200, "승인");
    let pay = s(&rows(&c.get(acct, "/api/pays").await?["rows"]).iter().find(|p| p["name"] == "한라인상사34").cloned().unwrap_or_default()["id"]);
    ensure!(node(&c.get(acct, &format!("/api/trail/pay/{pay}")).await?, "지급")["at"].is_null(), "지급 전의 날짜");
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200, "지급");
    ensure!(node(&c.get(acct, &format!("/api/trail/pay/{pay}")).await?, "지급")["at"] == "2026-07-01", "지급한 날");
    Ok(())
}
