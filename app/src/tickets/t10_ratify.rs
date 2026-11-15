//! 10 추인: 재검토가 된 과거의 승인을 영업임원이 추인하고 내부 감시가 종결한다(종결하지 않으면 이견을 남긴다).
//! 작업의 단위는 현재 계산의 그룹 × 귀속월이다(D50): `bundle()`이 09의 현재 계산을 그대로 받아 재검토인 과거의 승인을 묶음(`ratify`)으로 만들고 추인 작업을 건다.
//! 추인·종결·이견은 04의 조치(`act`) 세 줄이라 권한·사유·거절의 낱말·이력은 04·05의 것을 그대로 쓴다. 한 건에 내려진 결정을 묶음의 나머지에 남기는 것은 DB의 이벤트다.
use super::t09_again::Now;
use crate::check::Check;
use crate::db::{Db, q, q1};
use crate::{Me, R, err};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};
use std::collections::BTreeMap;

pub const SCHEMA: &str = include_str!("../../db/10-추인.surql");

/// 추인 전인 묶음을 지금의 재검토에 맞춘다. 09의 `remark()`가 표시를 맞춘 뒤에 부른다(현재 계산 `now`를 그대로 받고 다시 계산하지 않는다).
/// 묶음은 (귀속월, 현재의 구성)마다 하나이고 그 안의 심사는 재검토이면서 아직 추인되지 않은 과거의 승인이다. id는 `귀속월-현재 구성의 첫 대리점`
/// (같은 자리에 이미 추인된 묶음이 있으면 `…-2`). 재검토가 풀려 심사가 하나도 남지 않은 묶음은 추인 작업과 함께 지운다. 추인된 묶음은 건드리지 않는다
pub async fn bundle(db: &Db, now: &BTreeMap<String, Now>) -> Result<()> {
    let r = q1(db, "RETURN {
        done: array::flatten((SELECT VALUE reviews FROM ratify WHERE fixed != NONE)).map(|$r| record::id($r)),
        kept: (SELECT VALUE record::id(id) FROM ratify WHERE fixed != NONE),
        names: object::from_entries((SELECT VALUE [record::id(id), name] FROM dealer)),
    };", json!({})).await?;
    let has = |list: &J, id: &str| list.as_array().is_some_and(|l| l.iter().any(|x| x == id));
    let mut open: BTreeMap<(&str, &Vec<String>), Vec<&String>> = BTreeMap::new();
    for (id, n) in now.iter().filter(|(id, n)| n.again && !has(&r["done"], id)) {
        open.entry((n.ym.as_str(), &n.members)).or_default().push(id);
    }
    let plans: Vec<J> = open.iter().map(|((ym, members), reviews)| {
        let n = &now[reviews[0]];
        let base = format!("{ym}-{}", members[0]);
        let taken = r["kept"].as_array().into_iter().flatten().filter_map(J::as_str).filter(|k| *k == base || k.starts_with(&format!("{base}-"))).count();
        let first = r["names"][&members[0]].as_str().unwrap_or_default();
        json!({
            "id": if taken > 0 { format!("{base}-{}", taken + 1) } else { base },
            "ym": ym, "members": members, "reviews": reviews, "total": n.total, "limit": n.limit, "approver": n.approver,
            "name": if members.len() > 1 { format!("{first} 외 {}", members.len() - 1) } else { first.to_string() },
        })
    }).collect();
    q(db, "
        BEGIN;
        LET $keep = $plans.map(|$p| type::record('ratify', $p.id));
        DELETE task WHERE kind = '추인' AND state != '완료' AND target NOTINSIDE $keep;
        DELETE ratify WHERE fixed = NONE AND id NOTINSIDE $keep;
        FOR $p IN $plans {
            LET $b = type::record('ratify', $p.id);
            UPSERT $b MERGE {
                ym: $p.ym, name: $p.name, total: $p.total, limit: $p.limit, approver: $p.approver, source: '계산',
                members: $p.members.map(|$d| type::record('dealer', $d)),
                reviews: $p.reviews.map(|$d| type::record('review', $d)),
            };
            UPSERT type::record('task', string::concat('추인-', $p.id)) MERGE { kind: '추인', view: '추인', target: $b, role: '영업임원', source: '계산' };
        };
        COMMIT;", json!({ "plans": plans })).await?;
    Ok(())
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/ratifies/{id}", get(detail)).route("/reviews/{id}/ratify", get(of_review))
}

/// 과거의 심사 한 건이 든 묶음(`{ id, name, ym }`). 한 건 화면이 묶음으로 가는 길을 보인다. 묶음에 들지 않았으면 404
async fn of_review(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "RETURN (SELECT record::id(id) AS id, name, ym FROM ratify WHERE reviews CONTAINS type::record('review', $id) ORDER BY id LIMIT 1)[0];", json!({ "id": id })).await.map_err(|_| err(StatusCode::NOT_FOUND, "없음"))?;
    if r.is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    Ok(Json(r))
}

/// 묶음 상세. 가운데: 현재 계산(`ratify`: 이름·귀속월·표시·합산·한도·승인권자, `members`: 현재의 구성)과 그 달의 재검토인 과거의 승인(`reviews`: 당시의 금액·승인권자, 원본의 지급일과 행).
/// 오른쪽: 지금 역할이 할 수 있는 조치(`actions` — 04의 심사 상세와 같은 꼴. 결정은 `POST /api/decide`에 `target`의 심사 하나를 보내면 묶음 전체에 남는다),
/// 담당하는 역할(`role`), 이력(`history`: 묶음에 내려진 추인·종결·이견)
async fn detail(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "
        LET $b = type::record('ratify', $id);
        LET $r = $b.reviews[0];
        RETURN IF $b.name = NONE THEN {} ELSE {
            ratify: (SELECT record::id(id) AS id, name, ym, marks, total, limit, approver, source FROM $b)[0],
            members: $b.members.map(|$d| { id: record::id($d), name: $d.name }),
            reviews: $b.reviews.map(|$x| {
                id: record::id($x), name: $x.name, members: array::len($x.members), total: $x.total, approver: $x.approver, marks: $x.marks,
                paid: IF $x.payouts[0].paid THEN time::format($x.payouts[0].paid, '%Y-%m-%d') END,
                source: $x.source, file: $x.file.path, row: $x.row,
            }),
            target: record::id($r),
            role: IF $b.fixed = NONE THEN '영업임원' ELSE IF $b.marks CONTAINSNOT '종결' THEN '내부 감시' END,
            actions: (SELECT record::id(id) AS kind, fn::must(record::id(id), $r) AS reason, fn::classes(record::id(id), $r) AS classes, seq FROM act WHERE fn::can(record::id(id), $r) ORDER BY seq, kind),
            history: (SELECT kind, role, IF at THEN time::format(at, '%Y-%m-%d') END AS at, reason, source, stamp FROM decision WHERE review = $r AND kind INSIDE ['추인', '거부', '종결', '이견'] ORDER BY stamp),
        } END;", json!({ "id": id })).await.map_err(|_| err(StatusCode::NOT_FOUND, "없음"))?;
    if r["ratify"].is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    Ok(Json(r))
}

pub async fn seed(db: &Db) -> Result<()> {
    // 추인·거부: 재검토 표시가 있는 승인을 영업임원이, 둘 다 사유 필수(D41, D52). 한 번 추인하거나 거부한 심사는 다시 하지 못한다.
    // 종결: 추인된 심사를 내부 감시가, 사유 선택. 이견: 종결하지 않고 사유를 남긴다(D25), 사유 필수. 종결된 뒤에는 둘 다 없다.
    // 네 조치 모두 심사의 상태를 옮기지 않는다(`to` 없음)
    q(db, "
        CREATE act:`추인` SET seq = 4, states = ['승인'], who = '영업임원', mark = '재검토', without = ['추인', '거부'], reason = true, classes = ['정상', '미인지', '기타'];
        CREATE act:`거부` SET seq = 5, states = ['승인'], who = '영업임원', mark = '재검토', without = ['추인', '거부'], reason = true, classes = ['정황', '기타'];
        CREATE act:`종결` SET seq = 6, states = ['승인'], who = '내부 감시', mark = '추인', without = ['종결'], classes = ['정상', '기타'];
        CREATE act:`이견` SET seq = 7, states = ['승인'], who = '내부 감시', mark = '추인', without = ['종결'], reason = true, classes = ['소명', '근거', '기타'];", json!({})).await?;
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit) = ("영업지원", "영업임원", "내부 감시");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    // 그 역할의 작업 가운데 그 종류의 줄
    let tasks = async |role: &str, part: &str, kind: &str| -> Result<Vec<J>> { Ok(rows(&c.get(role, "/api/tasks").await?[part]).into_iter().filter(|t| t["kind"] == kind).collect()) };
    let bundle = async |role: &str, id: &str| c.get(role, &format!("/api/ratifies/{id}")).await;
    let review = async |id: &str| c.get(support, &format!("/api/reviews/{id}")).await;
    // 결정의 결과: 되면 "", 거절되면 그 낱말
    let decide = async |role: &str, id: &str, kind: &str, reason: J| -> Result<String> {
        let (code, r) = c.post(role, "/api/decide", json!({ "ids": [id], "kind": kind, "reason": reason })).await?;
        ensure!(code == 200 || r == json!({ "error": r["error"] }), "거절의 꼴 {code} {r}");
        Ok(r["error"].as_str().unwrap_or("").to_string())
    };
    let kinds = |d: &J| rows(&d["actions"]).iter().map(|a| a["kind"].as_str().unwrap_or("").to_string()).collect::<Vec<_>>();
    let group = ["D-011", "D-024", "D-037"];
    let months = [("2026-01", 4_870_186), ("2026-02", 4_540_341), ("2026-03", 4_055_114), ("2026-04", 4_267_112), ("2026-05", 4_505_596)];

    // 재검토 15건은 영업임원의 담당에 추인 작업 5건으로 올라온다(D50: 그룹 × 귀속월). 금액은 현재 계산의 합산
    let mine = tasks(exec, "mine", "추인").await?;
    // 5단계: 추인은 영업임원 · 내부 감시만 읽는다
    c.sees("SELECT id FROM ratify", [false, true, true, false]).await?;
    let one = q1(&c.db, "RETURN record::id((SELECT VALUE id FROM ratify LIMIT 1)[0]);", json!({})).await?;
    for (role, code) in [(support, 404), ("회계·자금", 404), (exec, 200)] {
        ensure!(c.call(Some(c.token(role)), "GET", &format!("/api/ratifies/{}", one.as_str().unwrap_or_default()), None).await?.0 == code, "{role}의 추인 상세");
    }
    for (ym, total) in months {
        let id = format!("{ym}-D-011");
        let t = mine.iter().find(|t| t["target"] == id.as_str()).cloned().unwrap_or_default();
        ensure!(t["name"] == "금강상사11 외 2" && t["ym"] == ym && t["total"] == total && t["marks"] == json!(["재검토"]) && t["view"] == "추인" && t["role"] == exec && t["pick"] == false, "{ym}의 추인 작업 {t}");
        // 작업을 열면 그 달의 재검토인 과거의 승인 세 건이 보인다. 당시의 값은 그대로(단독, 영업지원)
        let b = bundle(exec, &id).await?;
        ensure!(b["ratify"] == json!({ "id": id, "name": "금강상사11 외 2", "ym": ym, "marks": ["재검토"], "total": total, "limit": 2_000_000, "approver": exec, "source": "계산" }), "{ym}의 묶음 {}", b["ratify"]);
        let ids: Vec<String> = group.iter().map(|d| format!("{ym}-{d}")).collect();
        ensure!(rows(&b["reviews"]).iter().map(|r| r["id"].as_str().unwrap_or("")).eq(ids.iter().map(String::as_str)) && rows(&b["reviews"]).iter().all(|r| r["approver"] == support && r["marks"] == json!(["재검토"]) && r["source"] == "원본" && r["paid"].is_string()), "{ym}의 승인들 {}", b["reviews"]);
        ensure!(rows(&b["members"]).len() == 3 && b["target"] == ids[0].as_str() && b["role"] == exec && b["history"] == json!([]), "{ym}의 구성 {b}");
    }
    ensure!(mine.iter().filter(|t| group.iter().any(|d| t["target"].as_str().is_some_and(|i| i.ends_with(d)))).count() == 5, "박상현 그룹의 추인 작업 {mine:?}");
    ensure!(tasks(audit, "mine", "종결").await?.is_empty() && tasks(support, "mine", "추인").await?.is_empty(), "추인 전의 다른 역할");
    let first = bundle(exec, "2026-01-D-011").await?;
    ensure!(rows(&first["reviews"]).iter().map(|r| r["total"].as_i64().unwrap_or(0)).collect::<Vec<_>>() == [1_867_253, 1_353_495, 1_649_438] && first["reviews"][0]["paid"] == "2026-02-04" && first["reviews"][0]["row"] == 50, "1월의 당시 금액 {}", first["reviews"]);

    // 한 건 화면이 묶음으로 가는 길. 묶음에 들지 않은 심사에는 없다. 직접 보낸 요청으로 한 건에 추인하면 묶음 전체에 남는다(화면만 버튼을 감춘다)
    ensure!(c.get(exec, "/api/reviews/2026-01-D-024/ratify").await? == json!({ "id": "2026-01-D-011", "name": "금강상사11 외 2", "ym": "2026-01" }), "한 건의 묶음");
    ensure!(c.call(Some(c.token(exec)), "GET", "/api/reviews/2026-06-D-001/ratify", None).await?.0 == 404, "묶음에 들지 않은 심사");

    // 조치: 영업임원에게만 추인(사유 필수). 작업에서 연 화면과 대리점 상세에서 연 과거의 심사가 같은 조치를 보인다
    let act = json!([{ "kind": "추인", "reason": true, "classes": ["정상", "미인지", "기타"], "seq": 4 }, { "kind": "거부", "reason": true, "classes": ["정황", "기타"], "seq": 5 }]);
    ensure!(first["actions"] == act && c.get(exec, "/api/reviews/2026-01-D-024").await?["actions"] == act, "영업임원의 조치 {}", first["actions"]);
    for role in [support, audit, "회계·자금"] {
        // 5단계: 영업지원 · 회계·자금은 추인을 읽지 못한다(404)
        let seen = if role == audit { bundle(role, "2026-01-D-011").await?["actions"] == json!([]) } else { c.call(Some(c.token(role)), "GET", "/api/ratifies/2026-01-D-011", None).await?.0 == 404 };
        ensure!(seen && decide(role, "2026-01-D-011", "추인", json!({ "class": "정상" })).await? == "권한", "{role}의 추인");
    }
    // 사유 없이는 추인되지 않는다. 재검토가 아닌 승인은 추인할 수 없고, 추인 전에는 종결할 수 없다
    for reason in [J::Null, json!({ "class": "경미" }), json!({ "class": "기타" })] {
        ensure!(decide(exec, "2026-01-D-011", "추인", reason.clone()).await? == "사유", "추인의 사유 {reason}");
    }
    ensure!(decide(exec, "2026-01-D-001", "추인", json!({ "class": "정상" })).await? == "상태" && decide(audit, "2026-01-D-011", "종결", J::Null).await? == "상태", "재검토가 아닌 추인, 추인 전의 종결");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM decision WHERE source != '원본');", json!({})).await? == 0, "거절 뒤");

    // 추인 한 번이 그 달의 승인 세 건 모두에 남는다. 어느 심사에 내려도 같다(성일상사24의 심사로 보낸다)
    let snap = "RETURN [(SELECT * OMIT marks FROM review WHERE ym = '2026-01' ORDER BY id), (SELECT * FROM decision WHERE source = '원본' AND review.ym = '2026-01' ORDER BY id)];";
    let before = q1(&c.db, snap, json!({})).await?;
    ensure!(decide(exec, "2026-01-D-024", "추인", json!({ "class": "미인지", "memo": "당시 구성 미확인" })).await? == "", "추인");
    let made = q1(&c.db, "RETURN (SELECT record::id(review) AS review, kind, role, by, time::format(at, '%Y-%m-%d') AS at, reason, source, prev.kind AS prev, prev.source AS from, prev.review = review AS same FROM decision WHERE kind = '추인' ORDER BY review);", json!({})).await?;
    let line = |d: &str| json!({ "review": format!("2026-01-{d}"), "kind": "추인", "role": exec, "by": made[0]["by"], "at": "2026-07-01", "reason": { "class": "미인지", "memo": "당시 구성 미확인" }, "source": "시연", "prev": "승인", "from": "원본", "same": true });
    // 추인은 그 심사의 과거의 승인에 이어진다(선 30). 결정한 직원은 영업임원이다
    ensure!(made == json!(group.map(line)) && q1(&c.db, "RETURN (SELECT VALUE by FROM decision WHERE kind = '추인')[0] = staff:exec;", json!({})).await? == true, "추인의 결정 {made}");
    // 과거의 승인 기록은 바뀌지 않는다: 원본의 결정도, 심사의 상태·구성·합산·승인권자·굳은 날도 그대로이고 표시만 더해진다
    ensure!(q1(&c.db, snap, json!({})).await? == before && before[0].as_array().is_some_and(|l| l.len() == 40) && before[1].as_array().is_some_and(|l| l.len() == 40), "과거의 기록이 바뀜");
    for d in group {
        let r = review(&format!("2026-01-{d}")).await?;
        ensure!(r["review"]["status"] == "승인" && r["review"]["marks"] == json!(["재검토", "추인"]) && rows(&r["history"]).len() == 2 && r["history"][0]["source"] == "원본" && r["history"][1]["kind"] == "추인" && r["history"][1]["reason"]["memo"] == "당시 구성 미확인", "{d}의 추인 뒤 {r}");
    }
    // 대리점 상세의 지급 줄에도 같은 표시가 보인다
    ensure!(c.get(support, "/api/dealers/D-037").await?["payouts"][0]["review"]["marks"] == json!(["재검토", "추인"]), "지급 줄의 표시");
    // 추인 작업은 끝나고(다른 달의 네 건은 그대로) 내부 감시의 담당에 종결 작업 하나가 생긴다. 영업임원에게는 진행으로 보인다
    let left = tasks(exec, "mine", "추인").await?;
    ensure!(left.iter().all(|t| t["target"] != "2026-01-D-011") && months[1..].iter().all(|(ym, _)| left.iter().any(|t| t["target"] == format!("{ym}-D-011").as_str())), "추인 뒤의 추인 작업 {left:?}");
    let close = tasks(audit, "mine", "종결").await?;
    ensure!(close.len() == 1 && close[0]["target"] == "2026-01-D-011" && close[0]["view"] == "추인" && close[0]["name"] == "금강상사11 외 2" && close[0]["total"] == 4_870_186 && close[0]["marks"] == json!(["재검토", "추인"]), "종결 작업 {close:?}");
    ensure!(tasks(exec, "going", "종결").await?.len() == 1, "영업임원의 진행");
    // 추인된 묶음: 다시 추인할 수 없고, 영업임원에게는 조치가 없다. 이력에 추인 한 줄
    let b = bundle(exec, "2026-01-D-011").await?;
    ensure!(b["actions"] == json!([]) && b["role"] == audit && b["ratify"]["marks"] == json!(["재검토", "추인"]) && rows(&b["history"]).len() == 1 && b["history"][0]["kind"] == "추인" && b["history"][0]["role"] == exec, "추인된 묶음 {b}");
    ensure!(decide(exec, "2026-01-D-037", "추인", json!({ "class": "정상" })).await? == "상태" && decide(exec, "2026-01-D-037", "거부", json!({ "class": "정황" })).await? == "상태", "다시 추인");

    // 내부 감시: 종결(사유 선택) 또는 이견(사유 필수). 승인을 뒤집는 조치는 없다
    let b = bundle(audit, "2026-01-D-011").await?;
    ensure!(b["actions"] == json!([{ "kind": "종결", "reason": false, "classes": ["정상", "기타"], "seq": 6 }, { "kind": "이견", "reason": true, "classes": ["소명", "근거", "기타"], "seq": 7 }]), "내부 감시의 조치 {}", b["actions"]);
    for kind in ["승인", "보류", "반려", "추인", "거부"] {
        ensure!(decide(audit, "2026-01-D-011", kind, json!({ "class": "기타", "memo": "뒤집기" })).await? != "", "내부 감시의 {kind}");
    }
    ensure!(decide(exec, "2026-01-D-011", "종결", J::Null).await? == "권한" && decide(support, "2026-01-D-011", "이견", json!({ "class": "소명" })).await? == "권한", "다른 역할의 종결");
    // 이견: 사유가 없으면 거절. 남기면 세 건 모두에 남고 종결 표시는 붙지 않으며 종결 작업은 진행에 놓인다. 뒤에는 종결만 남는다
    ensure!(decide(audit, "2026-01-D-011", "이견", J::Null).await? == "사유" && decide(audit, "2026-01-D-011", "이견", json!({ "class": "근거", "memo": "사유 보완" })).await? == "", "이견");
    let b = bundle(audit, "2026-01-D-011").await?;
    ensure!(b["ratify"]["marks"] == json!(["재검토", "추인"]) && kinds(&b) == ["종결"] && rows(&b["history"]).len() == 2 && b["history"][1]["reason"] == json!({ "class": "근거", "memo": "사유 보완" }), "이견 뒤 {b}");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM decision WHERE kind = '이견');", json!({})).await? == 3 && review("2026-01-D-037").await?["review"]["status"] == "승인", "이견의 결정");
    ensure!(tasks(audit, "mine", "종결").await?.len() == 1 && tasks(audit, "going", "종결").await?.is_empty() && tasks(exec, "going", "종결").await?.len() == 1, "이견 뒤의 종결 작업");
    // 이견 뒤 이견은 상태로 거절(서버도 막는다. 화면은 단추를 숨긴다)
    ensure!(decide(audit, "2026-01-D-011", "이견", json!({ "class": "소명" })).await? == "상태" && q1(&c.db, "RETURN count(SELECT id FROM decision WHERE kind = '이견');", json!({})).await? == 3, "이견 뒤 이견");
    // 종결: 사유 없이도 된다. 세 건 모두에 종결 표시가 붙고 종결 작업이 끝난다. 그 뒤에는 조치가 없다
    ensure!(decide(audit, "2026-01-D-037", "종결", J::Null).await? == "", "종결");
    for d in group {
        let r = review(&format!("2026-01-{d}")).await?;
        ensure!(r["review"]["status"] == "승인" && r["review"]["marks"] == json!(["재검토", "추인", "종결"]) && rows(&r["history"]).iter().map(|h| h["kind"].as_str().unwrap_or("")).eq(["승인", "추인", "이견", "종결"]), "{d}의 종결 뒤 {r}");
    }
    let b = bundle(audit, "2026-01-D-011").await?;
    ensure!(b["ratify"]["marks"] == json!(["재검토", "추인", "종결"]) && b["actions"] == json!([]) && b["role"].is_null() && rows(&b["history"]).len() == 3, "종결된 묶음 {b}");
    ensure!(tasks(audit, "mine", "종결").await?.is_empty() && tasks(audit, "going", "종결").await?.is_empty() && tasks(exec, "going", "종결").await?.is_empty(), "종결 뒤의 작업");
    ensure!(decide(audit, "2026-01-D-011", "종결", J::Null).await? == "상태" && decide(audit, "2026-01-D-011", "이견", json!({ "class": "소명" })).await? == "상태", "종결 뒤의 조치");
    // 종결된 묶음은 표시를 다시 맞춰도 그대로다
    super::t09_again::remark(&c.db).await?;
    ensure!(bundle(audit, "2026-01-D-011").await? == b && tasks(exec, "mine", "추인").await?.len() == left.len(), "다시 맞춘 뒤");

    // 뒤 티켓이 끼우는 자리 ①(20 소명): 추인 전인 재검토가 풀리면 묶음이 따라 바뀐다. 성일상사24의 주소가 제외되면
    // 2월의 묶음은 금강상사11·대륙상사37 두 건(합산 3,061,435)이 되고, 풀린 성일상사24의 승인은 묶음에서 빠진다
    q(&c.db, "UPDATE addr SET excluded = true WHERE in = dealer:`D-024`;", json!({})).await?;
    super::t09_again::remark(&c.db).await?;
    let b = bundle(exec, "2026-02-D-011").await?;
    ensure!(b["ratify"]["name"] == "금강상사11 외 1" && b["ratify"]["total"] == 3_061_435 && rows(&b["reviews"]).iter().map(|r| r["id"].as_str().unwrap_or("")).eq(["2026-02-D-011", "2026-02-D-037"]), "일부가 풀린 묶음 {b}");
    let t = tasks(exec, "mine", "추인").await?;
    ensure!(t.iter().filter(|t| t["target"] == "2026-02-D-011").count() == 1 && t.iter().any(|t| t["target"] == "2026-02-D-011" && t["total"] == 3_061_435 && t["name"] == "금강상사11 외 1"), "일부가 풀린 작업 {t:?}");
    // 남은 두 건만 추인된다. 풀린 심사는 추인할 수 없다
    ensure!(decide(exec, "2026-02-D-024", "추인", json!({ "class": "정상" })).await? == "상태" && decide(exec, "2026-02-D-037", "추인", json!({ "class": "정상" })).await? == "", "남은 두 건의 추인");
    let n = q1(&c.db, "RETURN [count(SELECT id FROM decision WHERE kind = '추인' AND review.ym = '2026-02'), review:`2026-02-D-024`.marks, review:`2026-02-D-011`.marks];", json!({})).await?;
    ensure!(n == json!([2, [], ["재검토", "추인"]]), "남은 두 건의 결정 {n}");
    // 이미 추인·종결된 1월은 구성이 바뀌어도 그때의 값 그대로다
    ensure!(bundle(exec, "2026-01-D-011").await?["ratify"]["total"] == 4_870_186, "추인된 묶음이 바뀜");
    // 되돌리면: 추인 전인 3~5월은 다시 세 건이 되고, 2월은 추인되지 않은 성일상사24의 승인만 든 새 묶음(`…-2`)이 생긴다. 추인된 두 건은 다시 묶이지 않는다
    q(&c.db, "UPDATE addr SET excluded = false WHERE in = dealer:`D-024`;", json!({})).await?;
    super::t09_again::remark(&c.db).await?;
    ensure!(rows(&bundle(exec, "2026-03-D-011").await?["reviews"]).len() == 3, "되돌린 묶음");
    let b = bundle(exec, "2026-02-D-011-2").await?;
    ensure!(b["ratify"]["total"] == 4_540_341 && b["ratify"]["marks"] == json!(["재검토"]) && rows(&b["reviews"]).iter().map(|r| r["id"].as_str().unwrap_or("")).eq(["2026-02-D-024"]) && kinds(&b) == ["추인", "거부"], "뒤에 재검토가 된 한 건 {b}");
    ensure!(rows(&bundle(exec, "2026-02-D-011").await?["reviews"]).len() == 2 && tasks(exec, "mine", "추인").await?.iter().any(|t| t["target"] == "2026-02-D-011-2"), "추인된 묶음과 새 작업");

    // 뒤 티켓이 끼우는 자리 ②(13 변경): 새로 재검토가 된 승인에도 추인 작업이 생긴다. 한라인상사34가 2월 1일부터 금강상사41의 주소를 쓰면 2월·3월에 한 건씩
    q(&c.db, "
        UPDATE addr SET until = d'2026-02-01T00:00:00Z' WHERE in = dealer:`D-034`;
        RELATE dealer:`D-034`->addr->(SELECT VALUE out FROM addr WHERE in = dealer:`D-041`) SET since = d'2026-02-01T00:00:00Z', known = d'2026-07-01T00:00:00Z', via = '신고', source = '시연';", json!({})).await?;
    super::t09_again::remark(&c.db).await?;
    let t = tasks(exec, "mine", "추인").await?;
    let new: Vec<&J> = t.iter().filter(|t| t["name"].as_str().is_some_and(|n| n.starts_with("한라인상사34"))).collect();
    ensure!(new.len() == 2 && new.iter().any(|t| t["ym"] == "2026-02" && t["total"] == 2_218_474) && new.iter().any(|t| t["ym"] == "2026-03" && t["total"] == 2_007_205), "변경으로 생긴 추인 작업 {new:?}");
    let b = bundle(exec, new[0]["target"].as_str().unwrap_or("")).await?;
    ensure!(rows(&b["reviews"]).len() == 2 && rows(&b["members"]).len() == 2, "변경으로 생긴 묶음 {b}");
    // 추인 전에 모두 풀리면(신고가 제외되면) 묶음과 추인 작업이 없어진다
    q(&c.db, "UPDATE addr SET excluded = true WHERE in = dealer:`D-034` AND via = '신고';", json!({})).await?;
    super::t09_again::remark(&c.db).await?;
    ensure!(!tasks(exec, "mine", "추인").await?.iter().any(|t| t["name"].as_str().is_some_and(|n| n.starts_with("한라인상사34"))), "풀린 추인 작업");
    ensure!(c.call(Some(c.token(exec)), "GET", &format!("/api/ratifies/{}", new[0]["target"].as_str().unwrap_or("")), None).await?.0 == 404 && c.call(Some(c.token(exec)), "GET", "/api/ratifies/x", None).await?.0 == 404, "없어진 묶음");

    // 거부(D52): 사유 필수. 세 건 모두에 남고, 과거의 승인은 그대로(상태 승인)이고 재검토 표시만 남으며 추인 작업이 끝난다. 종결 작업은 생기지 않는다
    ensure!(decide(exec, "2026-04-D-011", "거부", J::Null).await? == "사유" && decide(exec, "2026-04-D-011", "거부", json!({ "class": "미인지" })).await? == "사유" && decide(support, "2026-04-D-011", "거부", json!({ "class": "정황" })).await? == "권한", "거부의 사유와 권한");
    let closing = tasks(audit, "mine", "종결").await?.len();
    ensure!(decide(exec, "2026-04-D-037", "거부", json!({ "class": "정황", "memo": "거래 확인" })).await? == "", "거부");
    for d in group {
        let r = review(&format!("2026-04-{d}")).await?;
        ensure!(r["review"]["status"] == "승인" && r["review"]["marks"] == json!(["재검토", "거부"]) && rows(&r["history"]).iter().map(|h| h["kind"].as_str().unwrap_or("")).eq(["승인", "거부"]) && r["history"][1]["reason"] == json!({ "class": "정황", "memo": "거래 확인" }) && r["history"][1]["role"] == exec, "{d}의 거부 뒤 {r}");
    }
    let b = bundle(exec, "2026-04-D-011").await?;
    ensure!(b["actions"] == json!([]) && b["ratify"]["marks"] == json!(["재검토", "거부"]) && b["role"] == audit && rows(&b["history"]).len() == 1 && b["history"][0]["kind"] == "거부" && c.get(support, "/api/dealers/D-024").await?["payouts"][3]["review"]["marks"] == json!(["재검토", "거부"]) && bundle(audit, "2026-04-D-011").await?["actions"] == json!([]), "거부된 묶음 {b}");
    ensure!(!tasks(exec, "mine", "추인").await?.iter().any(|t| t["target"] == "2026-04-D-011") && tasks(audit, "mine", "종결").await?.len() == closing, "거부 뒤의 작업");
    // 거부한 뒤에는 다시 추인하거나 거부할 수 없고, 표시를 다시 맞춰도 추인 작업이 되살아나지 않는다
    ensure!(decide(exec, "2026-04-D-011", "추인", json!({ "class": "정상" })).await? == "상태" && decide(exec, "2026-04-D-024", "거부", json!({ "class": "정황" })).await? == "상태", "거부 뒤의 추인");
    super::t09_again::remark(&c.db).await?;
    ensure!(!tasks(exec, "mine", "추인").await?.iter().any(|t| t["ym"] == "2026-04" && t["name"] == "금강상사11 외 2") && bundle(exec, "2026-04-D-011").await? == b, "거부 뒤에 다시 맞춤");
    // D53의 자리: 거부된 묶음을 `fn::ratify_close`로 닫으면 세 건과 묶음에 종결 표시가 붙는다. 추인 없이 종결된 것이 이력에 드러난다
    // 거부되지 않은 묶음(추인 전인 3월)은 닫히지 않는다
    q(&c.db, "LET $f = { role: '내부 감시', at: fn::today(), reason: { class: '부족' }, source: '시연' }; fn::ratify_close(ratify:`2026-03-D-011`, $f);", json!({})).await?;
    // D52: 거부된 묶음은 추인 정황으로 접수되어 내부 감시의 담당에 올라간다. D53: 내부 감시가 그 정황을 기각하면 묶음이 종결된다(다시 기각해도 한 번만)
    let s = c.get(audit, "/api/signals/추인-묶음-2026-04-D-011").await?;
    ensure!(s["signal"]["kind"] == "추인" && s["signal"]["state"] == "접수", "거부 뒤의 추인 정황 {}", s["signal"]);
    ensure!(c.post(audit, "/api/rule", json!({ "id": "추인-묶음-2026-04-D-011", "kind": "기각", "reason": { "class": "부족" } })).await?.0 == 200, "추인 정황의 기각");
    ensure!(bundle(exec, "2026-03-D-011").await?["ratify"]["marks"] == json!(["재검토"]) && q1(&c.db, "RETURN count(SELECT id FROM decision WHERE kind = '종결' AND review.ym = '2026-04');", json!({})).await? == 3, "닫는 함수");
    let b = bundle(audit, "2026-04-D-011").await?;
    ensure!(b["ratify"]["marks"] == json!(["재검토", "거부", "종결"]) && b["role"].is_null() && rows(&b["history"]).iter().map(|h| h["kind"].as_str().unwrap_or("")).eq(["거부", "종결"]) && review("2026-04-D-024").await?["review"]["marks"] == json!(["재검토", "거부", "종결"]) && rows(&b["history"])[1]["reason"] == json!({ "class": "부족" }), "거부 뒤의 종결 {b}");

    // 역할은 묶음과 작업을 직접 고치지 못한다
    let s = crate::db::as_user(&c.db, c.token(exec)).await?;
    q(&s, "UPDATE ratify SET marks = ['종결'], total = 0; DELETE ratify; UPDATE task SET state = '완료' WHERE kind = '추인';", json!({})).await.ok();
    ensure!(bundle(exec, "2026-03-D-011").await?["ratify"]["total"] == 4_055_114 && tasks(exec, "mine", "추인").await?.iter().any(|t| t["target"] == "2026-03-D-011"), "역할이 묶음을 고침");
    Ok(())
}
