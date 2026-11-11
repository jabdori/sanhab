//! 09 재검토: 원본의 1~5월 승인 196건과 반려 4건을 과거의 결정으로 싣고(당시 구성 = 단독, 굳은 심사), 현재 계산을 옆에 붙인다.
//! 계산은 `current()` 한 곳에 있다: 굳은 승인을 그 귀속월의 식별자 선(03)과 그 귀속월에 시행 중인 규칙 버전(04)으로 다시 본다.
//! 재검토는 상태가 아니라 표시다: `remark()`가 심사의 `marks`에 '재검토'를 붙이거나 뗄 뿐이고 과거의 기록은 고치지 않는다.
use super::t03_related::{groups, links};
use super::t04_review::{Pay, Rule, period, pick, plan};
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{R, err};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value as J, json};
use std::collections::{BTreeMap, BTreeSet};

pub const SCHEMA: &str = include_str!("../../db/09-재검토.surql");
pub const MARK: &str = "재검토";

/// 굳은 승인 하나를 현재 사실로 다시 본 것. `again`이 재검토다
#[derive(Clone, Debug)]
pub struct Now {
    pub ym: String,
    pub members: Vec<String>,
    pub total: i64,
    pub limit: i64,
    pub approver: String,
    pub rules: Vec<String>,
    pub again: bool,
}

/// 굳은 승인(심사 id)마다의 현재 계산. 구성은 그 귀속월에 하루라도 유효한 식별자 선의 그룹(D30, D47 — 변경일 전의 귀속월은 바뀌지 않는다),
/// 합산은 그 구성의 그 귀속월 지급에서 반려만 뺀 합, 한도는 그 귀속월에 시행 중인 규칙 버전(D14).
/// 재검토: 당시의 승인권자가 영업지원인데 현재 계산의 승인권자는 영업임원인 것(합쳐져 한도를 넘은 것, D11)
// ponytail: 한 건을 볼 때도 굳은 승인 전부를 다시 계산한다(귀속월마다 조회 한 번). 귀속월이 수백 개가 되면 귀속월을 받아 좁힌다
pub async fn current(db: &Db) -> Result<BTreeMap<String, Now>> {
    let r = q1(db, "
        RETURN {
            reviews: (SELECT record::id(id) AS id, ym, members.map(|$d| record::id($d)) AS members, approver FROM review WHERE fixed != NONE AND status = '승인'),
            pays: (SELECT record::id(id) AS id, record::id((->payout_of->dealer)[0]) AS dealer, ym, amount, status, true AS open FROM payout),
            rules: (SELECT record::id(id) AS id, name, value, IF since THEN time::format(since, '%Y-%m-%d') END AS since, IF until THEN time::format(until, '%Y-%m-%d') END AS until FROM rule),
        };", json!({})).await?;
    let pays: Vec<Pay> = serde_json::from_value(r["pays"].clone())?;
    let rules: Vec<Rule> = serde_json::from_value(r["rules"].clone())?;
    let reviews = r["reviews"].as_array().cloned().unwrap_or_default();
    let mut out = BTreeMap::new();
    for ym in reviews.iter().filter_map(|x| x["ym"].as_str()).collect::<BTreeSet<_>>() {
        let (from, to) = period(ym);
        let used = pick(&rules, ym);
        let limit = used.iter().find(|u| u.name == "한도").map(|u| u.value).ok_or_else(|| anyhow::anyhow!("{ym}에 시행 중인 한도가 없다"))?;
        // 04의 계산 그대로: 지급을 모두 "기다리는 것"으로 주면 그 귀속월의 그룹마다 구성·합산·승인권자가 나온다(선이 없는 대리점도 자기만 든 그룹)
        let plans = plan(ym, &groups(&links(db, Some((&from, &to))).await?), &pays, limit);
        for x in reviews.iter().filter(|x| x["ym"] == ym) {
            // 당시의 구성원이 든 현재의 그룹. 갈라졌으면 합산이 가장 큰 쪽을 본다
            let Some(p) = plans.iter().filter(|p| p["members"].as_array().is_some_and(|m| m.iter().any(|d| x["members"].as_array().is_some_and(|o| o.contains(d))))).max_by_key(|p| p["total"].as_i64()) else {
                continue;
            };
            let approver = p["approver"].as_str().unwrap_or_default().to_string();
            out.insert(x["id"].as_str().unwrap_or_default().to_string(), Now {
                ym: ym.to_string(),
                members: serde_json::from_value(p["members"].clone())?,
                total: p["total"].as_i64().unwrap_or(0),
                limit,
                again: x["approver"] == "영업지원" && approver == "영업임원",
                approver,
                rules: used.iter().map(|u| u.id.clone()).collect(),
            });
        }
    }
    Ok(out)
}

/// 재검토 표시를 지금의 계산에 맞춘다(붙이고, 풀린 것은 뗀다). 선·규칙·지급을 바꾸는 티켓은 `recalc` 뒤에 이것을 부른다
pub async fn remark(db: &Db) -> Result<()> {
    let now = current(db).await?;
    let on: Vec<&String> = now.iter().filter(|(_, n)| n.again).map(|(id, _)| id).collect();
    q(db, "
        LET $on = $ids.map(|$i| type::record('review', $i));
        UPDATE review SET marks += $mark WHERE id INSIDE $on AND marks CONTAINSNOT $mark;
        UPDATE review SET marks -= $mark WHERE id NOTINSIDE $on AND marks CONTAINS $mark;", json!({ "ids": on, "mark": MARK })).await?;
    Ok(())
}

pub fn routes() -> Router<Db> {
    Router::new().route("/reviews/{id}/again", get(again))
}

/// 당시 / 현재: 굳은 승인의 당시 값(`then`: 구성원 수, 합산, 승인권자)과 현재 계산(`now`: 구성원, 합산, 한도, 승인권자, 규칙 버전).
/// `known`은 현재의 구성을 만든 식별자 선의 인지일 가운데 가장 늦은 날(모두 미상이면 null). 굳은 승인이 아니면 404
async fn again(State(db): State<Db>, Path(id): Path<String>) -> R {
    let Some(n) = current(&db).await?.remove(&id) else {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    };
    // 현재의 구성원 둘 이상이 함께 가리키는 식별자(그 귀속월의 선)
    let (from, to) = period(&n.ym);
    let mut by: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for l in links(&db, Some((&from, &to))).await?.into_iter().filter(|l| n.members.contains(&l.dealer)) {
        by.entry(l.node).or_default().insert(l.dealer);
    }
    let nodes: Vec<String> = by.into_iter().filter(|(_, d)| d.len() > 1).map(|(node, _)| node).collect();
    let r = q1(&db, "
        LET $r = type::record('review', $id);
        LET $m = $members.map(|$d| type::record('dealer', $d));
        LET $k = (SELECT VALUE known FROM rep, addr, acct WHERE in INSIDE $m AND <string> out INSIDE $nodes AND !excluded AND known != NONE);
        RETURN {
            then: { members: array::len($r.members), total: $r.total, approver: $r.approver },
            members: (SELECT record::id(id) AS id, name FROM $m),
            rules: (SELECT name, ver FROM $rules.map(|$x| type::record('rule', $x)) ORDER BY name),
            known: IF array::len($k) > 0 THEN time::format(time::max($k), '%Y-%m-%d') END,
        };", json!({ "id": id, "members": n.members, "nodes": nodes, "rules": n.rules })).await?;
    Ok(Json(json!({
        "id": id, "again": n.again, "then": r["then"], "known": r["known"], "source": "계산",
        "now": { "members": r["members"], "total": n.total, "limit": n.limit, "approver": n.approver, "rules": r["rules"] },
    })))
}

pub async fn seed(db: &Db) -> Result<()> {
    // 원본의 승인·반려마다 심사 하나(당시 구성 = 그 대리점 단독)와 결정 하나. 승인권자는 원본의 값(영업지원팀 → 역할 영업지원), 사유는 없다.
    // 원본에는 승인한 날이 따로 없어 결정의 날짜는 지급일이고, 반려는 날짜가 없다(미상).
    // 반려의 `fixed`는 적재한 날(시스템의 오늘)이다: 다시 계산하지 않게 하는 표시일 뿐 화면에 보이지 않는다
    q(db, "
        FOR $p IN (SELECT id, ym, amount, status, approver, paid, file, row, (->payout_of->dealer)[0] AS dealer FROM payout WHERE status INSIDE ['승인', '반려']) {
            LET $r = type::record('review', string::concat($p.ym, '-', record::id($p.dealer)));
            LET $who = string::replace($p.approver, '팀', '');
            CREATE $r SET ym = $p.ym, name = $p.dealer.name, members = [$p.dealer], payouts = [$p.id], rules = [], total = $p.amount,
                approver = $who, status = $p.status, fixed = $p.paid ?? fn::today(), source = '원본', file = $p.file, row = $p.row;
            UPDATE $p.id SET review = $r;
            CREATE decision SET review = $r, kind = $p.status, role = $who, at = $p.paid, source = '원본', file = $p.file, row = $p.row;
        };", json!({})).await?;
    remark(db).await
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec) = ("영업지원", "영업임원");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let review = async |id: &str| c.get(support, &format!("/api/reviews/{id}")).await;
    let again = async |id: &str| c.get(support, &format!("/api/reviews/{id}/again")).await;
    let code = async |path: &str| -> Result<u16> { Ok(c.call(Some(c.token(support)), "GET", path, None).await?.0) };
    // 재검토 표시가 붙은 심사의 [수, 당시 합산의 합]
    let marked = async || q1(&c.db, "LET $m = (SELECT VALUE total FROM review WHERE marks CONTAINS '재검토'); RETURN [array::len($m), math::sum($m)];", json!({})).await;

    // 과거의 결정: 승인 196, 반려 4. 모두 영업지원, 사유 없음, 출처 원본. 심사는 한 건씩(당시 구성 = 단독)이고 굳어 있으며 규칙 버전의 기록은 없다
    let n = q1(&c.db, "RETURN [
        count(SELECT id FROM decision WHERE kind = '승인'), count(SELECT id FROM decision WHERE kind = '반려'),
        count(SELECT id FROM decision WHERE role != '영업지원' OR reason != NONE OR source != '원본' OR by != NONE OR file = NONE OR row = NONE),
        count(SELECT id FROM review WHERE status = '승인' AND fixed != NONE), count(SELECT id FROM review WHERE status = '반려' AND fixed != NONE),
        count(SELECT id FROM review WHERE fixed != NONE AND (array::len(members) != 1 OR array::len(payouts) != 1 OR rules != [] OR limit != NONE OR approver != '영업지원' OR source != '원본' OR total != payouts[0].amount)),
        count(SELECT id FROM decision WHERE kind = '승인' AND at != review.payouts[0].paid), count(SELECT id FROM decision WHERE kind = '반려' AND at != NONE),
    ];", json!({})).await?;
    ensure!(n == json!([196, 4, 0, 196, 4, 0, 0, 0]), "과거의 결정 {n}");
    // 원본의 식별자는 인지일이 미상이다
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM rep, addr, acct WHERE known != NONE);", json!({})).await? == 0, "인지일");
    // 작업 목록에는 과거의 심사가 없다(6월의 심사 38개뿐)
    let t = c.get(support, "/api/tasks").await?;
    ensure!(rows(&t["mine"]).len() + rows(&t["going"]).len() == 38 && rows(&t["mine"]).iter().chain(&rows(&t["going"])).all(|m| m["ym"] == "2026-06"), "작업 목록");

    // 박상현 그룹의 1~5월이 재검토다: 15건, 당시 합산의 합 22,238,349(D46). 다른 대리점의 과거 승인에는 없다
    ensure!(marked().await? == json!([15, 22_238_349]), "재검토 {}", marked().await?);
    let others = q1(&c.db, "RETURN count(SELECT id FROM review WHERE marks != [] AND members[0] NOTINSIDE [dealer:`D-011`, dealer:`D-024`, dealer:`D-037`]);", json!({})).await?;
    ensure!(others == 0, "다른 대리점의 표시 {others}");
    let group = json!([{ "id": "D-011", "name": "금강상사11" }, { "id": "D-024", "name": "성일상사24" }, { "id": "D-037", "name": "대륙상사37" }]);
    let (mut count, mut sum) = (0, 0);
    for (ym, total) in [("2026-01", 4_870_186), ("2026-02", 4_540_341), ("2026-03", 4_055_114), ("2026-04", 4_267_112), ("2026-05", 4_505_596)] {
        for d in ["D-011", "D-024", "D-037"] {
            let id = format!("{ym}-{d}");
            // 재검토는 표시다: 상태는 승인 그대로, 당시의 구성(단독)·합산·승인권자도 그대로
            let r = review(&id).await?;
            ensure!(r["review"]["status"] == "승인" && r["review"]["marks"] == json!(["재검토"]) && r["review"]["approver"] == support && r["review"]["limit"].is_null() && r["review"]["source"] == "원본", "{id}의 심사 {}", r["review"]);
            ensure!(rows(&r["members"]).len() == 1 && r["members"][0]["id"] == d && r["members"][0]["pays"][0]["amount"] == r["review"]["total"] && r["rules"] == json!([]) && r["actions"] == json!([]), "{id}의 당시 구성 {}", r["members"]);
            let a = again(&id).await?;
            ensure!(a["id"] == id.as_str() && a["again"] == true && a["then"] == json!({ "members": 1, "total": r["review"]["total"], "approver": support }) && a["known"].is_null() && a["source"] == "계산", "{id}의 당시 {a}");
            ensure!(a["now"] == json!({ "members": group, "total": total, "limit": 2_000_000, "approver": exec, "rules": [{ "name": "한도", "ver": 1 }, { "name": "합산", "ver": 1 }] }), "{id}의 현재 {}", a["now"]);
            count += 1;
            sum += r["review"]["total"].as_i64().unwrap_or(0);
        }
    }
    ensure!(count == 15 && sum == 22_238_349, "해당 지급 {count}건 {sum}");
    // 과거의 승인 한 건: 원본의 행(지급일 2026-02-04), 사유 없음, 출처 원본
    let first = review("2026-01-D-011").await?;
    ensure!(first["review"]["total"] == 1_867_253 && first["review"]["fixed"] == "2026-02-04" && first["review"]["file"] == "01_corevia/sales/sales_rebate_payment_cv.csv" && first["review"]["row"] == 50, "금강상사11의 1월 {}", first["review"]);
    let mut h = first["history"].clone();
    h[0].as_object_mut().map(|o| o.remove("stamp"));
    ensure!(h == json!([{ "kind": "승인", "role": support, "at": "2026-02-04", "reason": null, "source": "원본" }]), "이력 {h}");
    // 재검토가 아닌 과거의 승인: 현재도 단독, 같은 합산. 과거의 반려: 날짜 미상, 현재 계산을 붙이지 않는다. 대기인 심사에도 없다
    let a = again("2026-01-D-001").await?;
    ensure!(a["again"] == false && a["then"] == json!({ "members": 1, "total": 925_709, "approver": support }) && a["now"]["total"] == 925_709 && a["now"]["approver"] == support && a["now"]["members"] == json!([{ "id": "D-001", "name": "대성상사1" }]), "대성상사1의 1월 {a}");
    let r = review("2026-05-D-017").await?;
    ensure!(r["review"]["status"] == "반려" && r["review"]["total"] == 953_532 && r["review"]["marks"] == json!([]) && r["history"][0]["kind"] == "반려" && r["history"][0]["at"].is_null() && r["history"][0]["source"] == "원본", "과거의 반려 {r}");
    for path in ["/api/reviews/2026-05-D-017/again", "/api/reviews/2026-06-D-001/again", "/api/reviews/x/again", "/api/reviews/%27%3B%20DELETE%20review/again"] {
        ensure!(code(path).await? == 404, "{path}");
    }
    // 과거의 심사를 여는 길: 대리점 상세의 지급 줄이 그 지급의 심사를 가리킨다. 심사를 기다리는 6월분에는 없다
    let p = c.get(support, "/api/dealers/D-011").await?["payouts"].clone();
    ensure!(p[0]["review"] == json!({ "id": "2026-01-D-011", "name": "금강상사11", "marks": ["재검토"] }) && p[0]["status"] == "승인" && p[5]["review"].is_null(), "대리점 상세의 지급 줄 {p}");
    ensure!(c.get(support, "/api/dealers/D-001").await?["payouts"][0]["review"] == json!({ "id": "2026-01-D-001", "name": "대성상사1", "marks": [] }), "표시 없는 지급 줄");

    // 역할은 표시도 과거의 기록도 고치지 못한다
    let s = as_user(&c.db, c.token(exec)).await?;
    q(&s, "UPDATE review SET marks = [], total = 0; DELETE decision; UPDATE decision SET role = '영업임원';", json!({})).await.ok();
    ensure!(marked().await? == json!([15, 22_238_349]) && review("2026-01-D-011").await? == first, "역할이 표시나 심사를 고침");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM decision WHERE role = '영업지원' AND source = '원본');", json!({})).await? == 200, "역할이 결정을 고침");

    // 이 시스템에서 영업임원이 승인한 6월의 그룹은 한도를 넘어도 재검토가 아니다(승인권자가 맞다)
    ensure!(c.post(exec, "/api/decide", json!({ "ids": ["2026-06-D-011"], "kind": "승인" })).await?.0 == 200, "그룹의 승인");
    remark(&c.db).await?;
    let a = again("2026-06-D-011").await?;
    ensure!(a["again"] == false && a["now"]["total"] == 3_888_097 && a["then"] == json!({ "members": 3, "total": 3_888_097, "approver": exec }) && review("2026-06-D-011").await?["review"]["marks"] == json!([]), "임원이 승인한 그룹 {a}");

    // 뒤 티켓이 끼우는 자리 ①(20 소명): 선이 제외되면 다시 계산해 표시가 풀린다. 성일상사24의 주소가 제외되면 금강상사11과는 대표자만 일치 → 그룹은 두 곳
    q(&c.db, "UPDATE addr SET excluded = true WHERE in = dealer:`D-024`;", json!({})).await?;
    remark(&c.db).await?;
    ensure!(marked().await? == json!([10, 22_238_349 - 6_660_147]), "풀린 뒤 {}", marked().await?);
    let a = again("2026-01-D-024").await?;
    ensure!(a["again"] == false && a["now"]["total"] == 1_353_495 && rows(&a["now"]["members"]).len() == 1 && review("2026-01-D-024").await?["review"]["marks"] == json!([]), "풀린 심사 {a}");
    let a = again("2026-01-D-011").await?;
    ensure!(a["again"] == true && a["now"]["total"] == 3_516_691 && rows(&a["now"]["members"]).len() == 2 && a["then"]["total"] == 1_867_253, "남은 심사 {a}");
    // 뒤 티켓이 끼우는 자리 ③(10 추인): 표시가 붙는 순간에 일을 건다. 되돌리면 성일상사24의 다섯 달에 다시 붙는다
    q(&c.db, "DEFINE EVENT check_again ON review WHEN $event = 'UPDATE' AND $after.marks CONTAINS '재검토' AND $before.marks CONTAINSNOT '재검토' THEN {
        CREATE task SET kind = '본보기다시', view = '심사', target = $after.id, role = '영업임원', source = '계산';
    };
    UPDATE addr SET excluded = false WHERE in = dealer:`D-024`;", json!({})).await?;
    remark(&c.db).await?;
    remark(&c.db).await?;
    ensure!(marked().await? == json!([15, 22_238_349]), "되돌린 뒤");
    let mine: Vec<J> = rows(&c.get(exec, "/api/tasks").await?["mine"]).into_iter().filter(|m| m["kind"] == "본보기다시").collect();
    ensure!(mine.len() == 5 && mine.iter().all(|m| m["name"] == "성일상사24" && m["marks"] == json!(["재검토"])), "표시에 건 일 {mine:?}");

    // 뒤 티켓이 끼우는 자리 ②(13 변경): 변경일부터의 귀속월만 다시 본다. 한라인상사34가 2월 1일부터 금강상사41의 주소를 쓴다(인지일 7월 1일)면
    // 2월(2,218,474)과 3월(2,007,205)이 재검토, 4월(1,600,007)·5월(1,851,017)은 한도 이하, 1월은 변경 전이라 단독 그대로
    q(&c.db, "
        UPDATE addr SET until = d'2026-02-01T00:00:00Z' WHERE in = dealer:`D-034`;
        RELATE dealer:`D-034`->addr->(SELECT VALUE out FROM addr WHERE in = dealer:`D-041`) SET since = d'2026-02-01T00:00:00Z', known = d'2026-07-01T00:00:00Z', via = '신고', source = '시연';", json!({})).await?;
    remark(&c.db).await?;
    ensure!(marked().await? == json!([19, 22_238_349 + 1_150_157 + 1_068_317 + 1_134_038 + 873_167]), "변경 뒤 {}", marked().await?);
    for (id, total, on) in [("2026-02-D-034", 2_218_474, true), ("2026-03-D-041", 2_007_205, true), ("2026-04-D-034", 1_600_007, false), ("2026-05-D-041", 1_851_017, false)] {
        let a = again(id).await?;
        ensure!(a["again"] == on && a["now"]["total"] == total && rows(&a["now"]["members"]).len() == 2 && a["known"] == "2026-07-01" && a["then"]["members"] == 1, "{id} {a}");
    }
    let a = again("2026-01-D-034").await?;
    ensure!(a["again"] == false && a["now"]["total"] == 1_231_077 && rows(&a["now"]["members"]).len() == 1 && a["known"].is_null(), "변경 전의 1월 {a}");

    // 규칙 버전은 귀속월의 것으로 본다(D14): 한도 1,500,000이 6월 15일에 시행돼도 4월의 1,822,391(대성… D-006 단독)은 그대로다
    q(&c.db, "UPDATE rule:`한도-v1` SET until = d'2026-06-15T00:00:00Z';
        CREATE rule:`한도-v2` SET name = '한도', ver = 2, value = 1500000, clause = clause:`지급한도`, since = d'2026-06-15T00:00:00Z', source = '시연';", json!({})).await?;
    remark(&c.db).await?;
    let a = again("2026-04-D-006").await?;
    ensure!(marked().await?[0] == 19 && a["again"] == false && a["now"]["total"] == 1_822_391 && a["now"]["limit"] == 2_000_000 && a["now"]["rules"][0] == json!({ "name": "한도", "ver": 1 }), "새 한도 뒤의 4월 {a}");

    // 유효한 식별자 선이 하나도 없는 대리점도 자기만 든 그룹이다
    q(&c.db, "UPDATE rep, addr, acct SET excluded = true WHERE in = dealer:`D-001`;", json!({})).await?;
    remark(&c.db).await?;
    let a = again("2026-01-D-001").await?;
    ensure!(a["again"] == false && a["now"]["total"] == 925_709 && a["now"]["members"] == json!([{ "id": "D-001", "name": "대성상사1" }]) && marked().await?[0] == 19, "선이 없는 대리점 {a}");
    Ok(())
}
