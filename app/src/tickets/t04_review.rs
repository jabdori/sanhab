//! 04 심사: 귀속월의 지급을 그룹별 심사로 묶고(합산·한도·승인권자), 작업과 심사 상세를 내놓고, 결정을 받는다.
//! 계산은 `recalc()` 한 곳에 있다: 굳지 않은 심사를 03의 그룹과 규칙 버전으로 다시 만든다. 새 사건을 넣는 티켓은 끝에 이것을 부른다(D23).
//! 결정은 역할의 세션으로 `decision`을 만드는 것이고, 누가 할 수 있는지는 DB(`fn::can`)가 정한다.
use super::t03_related::{ITEMS, Link, groups, links, matches};
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, attempt, err, orig, refuse};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::Deserialize;
use serde_json::{Value as J, json};
use std::collections::{BTreeMap, BTreeSet};

pub const SCHEMA: &str = include_str!("../../db/04-심사.surql");

/// 귀속월(`YYYY-MM`)의 첫날과 끝날
pub fn period(ym: &str) -> (String, String) {
    let (y, m): (u32, u32) = (ym[..4].parse().unwrap_or(0), ym[5..].parse().unwrap_or(1));
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let days = match m { 2 if leap => 29, 2 => 28, 4 | 6 | 9 | 11 => 30, _ => 31 };
    (format!("{ym}-01"), format!("{ym}-{days}"))
}

/// 규칙 버전. 시행 기간은 `YYYY-MM-DD`, 없으면 열려 있다
#[derive(Clone, Debug, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub value: i64,
    pub since: Option<String>,
    pub until: Option<String>,
}

/// 귀속월에 적용할 규칙 버전들: 시행일이 그 귀속월의 끝날 이전이고, 다음 버전의 시행일이 그 뒤인 것(D14: 시행일이 속한 귀속월분부터)
pub fn pick<'a>(rules: &'a [Rule], ym: &str) -> Vec<&'a Rule> {
    let last = period(ym).1;
    rules.iter().filter(|r| r.since.as_deref().is_none_or(|s| s <= last.as_str()) && r.until.as_deref().is_none_or(|u| u > last.as_str())).collect()
}

/// 승인권자: 합산이 한도 이하이면 영업지원, 넘으면 영업임원(모의(23)도 이 비교를 그대로 쓴다)
pub fn approver(total: i64, limit: i64) -> &'static str {
    if total <= limit { "영업지원" } else { "영업임원" }
}

/// 지급 한 건. `open`은 아직 굳은 심사에 들지 않은 미지급(심사를 기다리는 것)
#[derive(Clone, Debug, Deserialize)]
pub struct Pay {
    pub id: String,
    pub dealer: String,
    pub ym: String,
    pub amount: i64,
    pub status: String,
    pub open: bool,
}

/// 한 귀속월의 심사들: 기다리는 지급이 있는 그룹마다 하나. 구성은 그룹 전체(지급이 없는 곳도 든다, D21),
/// 합산은 구성원의 그 귀속월 지급에서 반려만 뺀 합(D7, D19), 승인권자는 합산이 한도 이하이면 영업지원, 넘으면 영업임원.
/// id는 `귀속월-기다리는 지급이 있는 첫 대리점`(굳은 심사와 겹치면 `recalc`가 번호를 붙인다)
pub fn plan(ym: &str, groups: &[Vec<String>], pays: &[Pay], limit: i64) -> Vec<J> {
    // 그 귀속월에 지급이 있는데 어느 그룹에도 없는 대리점(유효한 식별자 선이 하나도 없는 곳)은 자기만 든 그룹이다(D2, D21)
    let mut groups = groups.to_vec();
    for p in pays.iter().filter(|p| p.ym == ym) {
        if !groups.iter().any(|g| g.contains(&p.dealer)) {
            groups.push(vec![p.dealer.clone()]);
        }
    }
    groups.iter().filter_map(|g| {
        let ps: Vec<&Pay> = pays.iter().filter(|p| p.ym == ym && p.status != "반려" && g.contains(&p.dealer)).collect();
        let first = ps.iter().filter(|p| p.open).map(|p| p.dealer.as_str()).min()?;
        let total: i64 = ps.iter().map(|p| p.amount).sum();
        Some(json!({
            "id": format!("{ym}-{first}"), "ym": ym, "members": g, "payouts": ps.iter().map(|p| &p.id).collect::<Vec<_>>(),
            "total": total, "limit": limit, "approver": approver(total, limit),
        }))
    }).collect()
}

/// 굳지 않은 심사를 지금의 선과 규칙으로 다시 만든다(구성·합산·승인권자·규칙 버전, 심사 작업의 담당). 굳은 심사는 건드리지 않는다.
/// 그룹이 바뀌어 없어진 심사는 그 작업과 함께 지운다. 상태와 표시는 남는다
pub async fn recalc(db: &Db) -> Result<()> {
    // 14: 승인권자가 올라간 지급 전의 승인은 먼저 재심사로 돌린다(재심사인 지급은 다시 심사를 기다리는 것이 된다)
    super::t14_redo::rework(db).await?;
    let all = compute(db, &[]).await?;
    q(db, "
        BEGIN;
        LET $keep = $plan.map(|$p| type::record('review', $p.id));
        DELETE task WHERE kind = '심사' AND target.fixed = NONE AND target NOTINSIDE $keep;
        DELETE review WHERE fixed = NONE AND id NOTINSIDE $keep;
        FOR $p IN $plan {
            LET $r = type::record('review', $p.id);
            IF $r.fixed != NONE { THROW '굳은 심사를 다시 쓰려 함' };
            UPSERT $r MERGE {
                ym: $p.ym, name: $p.name, total: $p.total, limit: $p.limit, approver: $p.approver, source: '계산',
                members: $p.members.map(|$d| type::record('dealer', $d)),
                payouts: $p.payouts.map(|$d| type::record('payout', $d)),
                rules: $p.rules.map(|$d| type::record('rule', $d)),
            };
            -- 심사 작업: 담당은 승인권자, 접수한 영업지원은 담당이 아니어도 진행에서 본다
            UPSERT type::record('task', $p.id) MERGE { kind: '심사', view: '심사', target: $r, role: $p.approver, also: ['영업지원'], source: '계산' };
        };
        COMMIT;", json!({ "plan": all })).await?;
    // 가설에서 승인권자가 올라가는 심사의 담당을 맞춘다(12). 저장한 승인권자는 건드리지 않는다
    super::t12_hypo::raise(db).await
}

/// 굳지 않은 심사로 만들 계획들(저장하지 않는다). `extra`는 지금의 선에 더해서 계산할 선이고, 가설(12)이 같은 계산을 그대로 쓴다
pub async fn compute(db: &Db, extra: &[Link]) -> Result<Vec<J>> {
    let r = q1(db, "
        LET $taken = array::flatten((SELECT VALUE payouts FROM review WHERE fixed != NONE));
        RETURN {
            pays: (SELECT record::id(id) AS id, record::id((->payout_of->dealer)[0]) AS dealer, ym, amount, status, status = '미지급' AND (id NOTINSIDE $taken OR state = '재심사') AS open FROM payout),
            rules: (SELECT record::id(id) AS id, name, value, IF since THEN time::format(since, '%Y-%m-%d') END AS since, IF until THEN time::format(until, '%Y-%m-%d') END AS until FROM rule),
            names: (SELECT record::id(id) AS id, name FROM dealer),
            fixed: (SELECT VALUE record::id(id) FROM review WHERE fixed != NONE),
        };", json!({})).await?;
    let pays: Vec<Pay> = serde_json::from_value(r["pays"].clone())?;
    let rules: Vec<Rule> = serde_json::from_value(r["rules"].clone())?;
    let name = |d: &J| r["names"].as_array().into_iter().flatten().find(|n| n["id"] == *d).map_or(String::new(), |n| n["name"].as_str().unwrap_or("").to_string());
    let mut all = vec![];
    for ym in pays.iter().filter(|p| p.open).map(|p| p.ym.as_str()).collect::<BTreeSet<_>>() {
        let (from, to) = period(ym);
        let used = pick(&rules, ym);
        let limit = used.iter().find(|u| u.name == "한도").map(|u| u.value).ok_or_else(|| anyhow::anyhow!("{ym}에 시행 중인 한도가 없다"))?;
        for mut p in plan(ym, &groups(&[links(db, Some((&from, &to))).await?, extra.to_vec()].concat()), &pays, limit) {
            // 굳은 심사는 다시 쓰지 않는다: 같은 대리점·귀속월의 굳은 심사가 있으면 새 심사는 `…-2`, `…-3`이 된다
            let base = p["id"].as_str().unwrap_or_default().to_string();
            let taken = r["fixed"].as_array().into_iter().flatten().filter_map(J::as_str).filter(|f| *f == base || f.starts_with(&format!("{base}-"))).count();
            if taken > 0 {
                p["id"] = json!(format!("{base}-{}", taken + 1));
            }
            let n = p["members"].as_array().map_or(0, Vec::len);
            p["name"] = json!(if n > 1 { format!("{} 외 {}", name(&p["members"][0]), n - 1) } else { name(&p["members"][0]) });
            p["rules"] = json!(used.iter().map(|u| &u.id).collect::<Vec<_>>());
            all.push(p);
        }
    }
    Ok(all)
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/tasks", get(tasks)).route("/reviews/{id}", get(detail)).route("/decide", post(decide))
}

/// 작업 목록: 담당(`mine`, 지금 내 역할이 처리할 것)과 진행(`going`, 내 역할이 관여했고 다른 역할의 차례인 것 + 내 담당이지만 `state`가 진행인 것 — 보류한 심사, D48).
/// 대상의 이름·귀속월·합산·표시는 대상 기록의 `name`·`ym`·`total`·`marks`에서 읽는다. 정황이 걸린 줄이 위, 그다음은 합산이 큰 순.
/// `pick`은 여러 개를 골라 한 번에 승인할 수 있는 줄: 담당에 있고, 대기이고, 정황이 없고, 승인권자가 영업지원이고, 승인에 사유가 필수가 아닌 심사(보류된 줄은 아니다)
async fn tasks(Extension(me): Extension<Me>) -> R {
    let r = q1(&me.db, "
        SELECT record::id(id) AS id, kind, view, record::id(target) AS target, target.name AS name, target.ym AS ym, target.total AS total, target.marks ?? [] AS marks, role, state,
            -- 지급 작업이면 그 지급의 상태(대기·재심사·이체·완료 — 지급 상세의 제목과 같은 값. 작업의 상태와 다르다)
            IF record::tb(target) = 'payout' THEN target.state END AS pay,
            IF kind = '심사' THEN state = '대기' AND target.status = '대기' AND target.approver = '영업지원' AND '정황' NOTINSIDE target.marks AND fn::can('승인', target) AND !fn::must('승인', target) ELSE false END AS pick
        FROM task WHERE state INSIDE ['대기', '진행'] AND (role = $auth.role OR also CONTAINS $auth.role);", json!({})).await?;
    let mut rows: Vec<J> = r.as_array().cloned().unwrap_or_default();
    rows.sort_by_key(|t| (!t["marks"].as_array().is_some_and(|m| m.contains(&json!("정황"))), -t["total"].as_i64().unwrap_or(0), t["id"].as_str().map(String::from)));
    let (mine, going): (Vec<J>, Vec<J>) = rows.into_iter().partition(|t| t["role"] == me.role.as_str() && t["state"] != "진행");
    Ok(Json(json!({ "mine": mine, "going": going })))
}

/// 심사 상세. 가운데: 제목과 숫자 줄(`review`), 구성(`members`: 그 귀속월의 지급 전부(`pays`)와 다른 구성원과 일치하는 식별자), 관계(`relation`), 규정(`rules`).
/// 오른쪽: 지금 역할이 할 수 있는 조치(`actions`), 이력(`history`. 그룹이 바뀌기 전의 옛 심사의 결정(13, D56의 `was`)은 빼고 06의 이력에만 보인다). 일치와 관계는 그 귀속월의 선으로 계산한다
async fn detail(State(db): State<std::sync::Arc<Db>>, Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let mut r = q1(&me.db, "
        LET $r = type::record('review', $id);
        RETURN {
            review: (SELECT record::id(id) AS id, name, ym, status, marks, total, limit, approver, fn::holder(id) AS holder, IF fixed THEN time::format(fixed, '%Y-%m-%d') END AS fixed, source, file.path AS file, row, members.map(|$d| { id: record::id($d), name: $d.name }) AS members FROM $r)[0],
            payouts: (SELECT record::id((->payout_of->dealer)[0]) AS dealer, amount, source, file.path AS file, row FROM payout WHERE id INSIDE $r.payouts),
            rules: (SELECT name, ver, value, record::id(clause) AS clause, clause.title AS title, clause.doc.path AS file, clause.first AS first, clause.last AS last, clause.text AS text, clause.source AS source FROM rule WHERE id INSIDE $r.rules ORDER BY name),
            actions: (SELECT record::id(id) AS kind, fn::must(record::id(id), $r) AS reason, fn::classes(record::id(id), $r) AS classes, seq FROM act WHERE fn::can(record::id(id), $r) ORDER BY seq, kind),
            history: (SELECT kind, role, IF at THEN time::format(at, '%Y-%m-%d') END AS at, reason, source, stamp FROM decision WHERE review = $r AND was = NONE ORDER BY stamp),
        };", json!({ "id": id })).await?;
    if r["review"].is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    let dots: Vec<J> = r["review"].as_object_mut().and_then(|o| o.remove("members")).and_then(|m| m.as_array().cloned()).unwrap_or_default();
    let ids: Vec<String> = dots.iter().filter_map(|d| d["id"].as_str().map(String::from)).collect();
    let (from, to) = period(r["review"]["ym"].as_str().unwrap_or("0000-01"));
    let all = links(&db, Some((&from, &to))).await?;
    let mine: Vec<_> = all.iter().filter(|l| ids.contains(&l.dealer)).collect();
    let dot = |d: &String| dots.iter().find(|x| x["id"] == d.as_str()).cloned().unwrap_or_default();
    let members: Vec<J> = ids.iter().map(|d| {
        let same: BTreeSet<usize> = ids.iter().filter(|o| *o != d).flat_map(|o| matches(&all, d, o)).collect();
        let pays: Vec<&J> = r["payouts"].as_array().into_iter().flatten().filter(|p| p["dealer"] == d.as_str()).collect();
        let mut m = dot(d);
        m["match"] = json!(same.iter().map(|i| ITEMS[*i]).collect::<Vec<_>>());
        m["pays"] = json!(pays);
        m
    }).collect();
    // 그림: 구성원 둘 이상이 함께 가리키는 사람·주소·계좌만. 첫 구성원이 왼쪽, 나머지가 오른쪽
    let shared = |node: &str| mine.iter().filter(|l| l.node == node).count() > 1;
    let mid: BTreeMap<&str, J> = mine.iter().filter(|l| shared(&l.node)).map(|l| (l.node.as_str(), json!({ "id": l.node, "name": l.value }))).collect();
    r["relation"] = json!({
        "left": ids.iter().take(1).map(dot).collect::<Vec<_>>(),
        "mid": mid.into_values().collect::<Vec<_>>(),
        "right": ids.iter().skip(1).map(dot).collect::<Vec<_>>(),
        "lines": mine.iter().filter(|l| shared(&l.node)).map(|l| json!([l.dealer, l.node])).collect::<Vec<_>>(),
    });
    r["members"] = json!(members);
    r.as_object_mut().map(|o| o.remove("payouts"));
    Ok(Json(r))
}

/// 결정: `{ ids, kind, reason? }`. 쓰기 전에 거절의 낱말을 정해 돌려주고(`refuse`: 권한 403, 사유·상태·대상 400), 역할의 세션으로 결정을 만든다.
/// DB의 권한 규칙은 마지막 방어선이다. 여럿이면 전부 되거나 전부 안 된다.
/// 여러 개를 한 번에 하는 것은 승인뿐이고, 대기이고 정황이 없고 승인권자가 영업지원이고 사유가 필수가 아닌 심사만 된다(U4)
async fn decide(Extension(me): Extension<Me>, Body(b): Body) -> R {
    let mut ids: Vec<&str> = b["ids"].as_array().into_iter().flatten().filter_map(J::as_str).collect();
    ids.sort_unstable();
    ids.dedup();
    let (Some(kind), false) = (b["kind"].as_str(), ids.is_empty()) else {
        return Err(refuse("대상"));
    };
    let mut vars = json!({ "ids": ids, "kind": kind });
    if b["reason"].is_object() {
        vars["reason"] = b["reason"].clone();
    }
    // 낱말: 심사마다의 거절 낱말 가운데 첫 번째, 없으면 여러 개를 고른 것이 규칙에 맞는지(대상).
    // 쓰기: DB의 거절은 오류가 아니라 빈 결과다. 하나라도 만들어지지 않으면 전부 되돌린다
    attempt(&me.db, "
        RETURN $ids.map(|$i| fn::refusal($kind, type::record('review', $i), $reason)).filter(|$w| $w != NONE)[0]
            ?? IF array::len($ids) > 1 AND ($kind != '승인' OR count(SELECT id FROM $ids.map(|$i| type::record('review', $i)) WHERE status = '대기' AND approver = '영업지원' AND '정황' NOTINSIDE marks AND !fn::must('승인', id)) != array::len($ids)) THEN '대상' END;", "
        BEGIN;
        LET $made = INSERT INTO decision $ids.map(|$i| { review: type::record('review', $i), kind: $kind, reason: $reason });
        IF array::len($made) != array::len($ids) { THROW '권한' };
        COMMIT;", vars).await?;
    Ok(Json(json!({ "ids": ids })))
}

pub async fn seed(db: &Db) -> Result<()> {
    // 조항: 규정 문서의 "판매장려금 지급 한도" 대목(제목 줄부터 그 대목의 끝까지). 규칙은 그 대목을 옮긴 것
    let title = "판매장려금 지급 한도";
    let lines: Vec<&str> = orig::POLICY.1.lines().collect();
    let first = lines.iter().position(|l| l.trim_start_matches('#').trim() == title && l.starts_with('#')).ok_or_else(|| anyhow::anyhow!("조항 없음"))?;
    let last = lines[first + 1..].iter().position(|l| l.starts_with('#')).map_or(lines.len(), |n| first + 1 + n);
    let last = lines[..last].iter().rposition(|l| !l.trim().is_empty()).unwrap_or(first);
    q(db, "
        LET $doc = type::record('origin', $path);
        CREATE $doc SET path = $path, sha = $sha;
        CREATE clause:`지급한도` SET title = $title, doc = $doc, first = $first, last = $last, text = $text, source = '원본';
        -- 시행일은 규정 문서에 없다(미상). 한도는 '월 지급액 2백만원 이하', 합산은 '2개 이상 일치'
        CREATE rule:`한도-v1` SET name = '한도', ver = 1, value = 2000000, clause = clause:`지급한도`, source = '원본';
        CREATE rule:`합산-v1` SET name = '합산', ver = 1, value = 2, clause = clause:`지급한도`, source = '원본';
        -- 승인: 대기인 심사를 그 심사의 승인권자가. 정황이 없는 건의 사유는 선택(D41)
        CREATE act:`승인` SET states = ['대기'], to = '승인', who = '승인권자';",
        json!({ "path": orig::POLICY.0, "sha": orig::sha(orig::POLICY.1), "title": title, "first": first + 1, "last": last + 1, "text": lines[first..=last].join("\n") }),
    ).await?;
    recalc(db).await
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec) = ("영업지원", "영업임원");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let review = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}")).await;
    let approve = async |role: &str, ids: &[&str]| c.post(role, "/api/decide", json!({ "ids": ids, "kind": "승인" })).await;
    let (one, group) = ("2026-06-D-001", "2026-06-D-011");
    // 상세의 조치에 그 종류가 있으면 사유가 필수인지, 없으면 None. 뒤 티켓이 조치를 더해도 깨지지 않게 목록 전체를 견주지 않는다
    let can = |d: &J, kind: &str| d["actions"].as_array().into_iter().flatten().find(|a| a["kind"] == kind).map(|a| a["reason"] == true);

    // 미지급인 6월 지급 40건 → 심사 38개(그룹 하나에 3건, 나머지는 단독). 작업: 영업지원 담당 37 · 진행 1, 영업임원 담당 1
    let t = c.get(support, "/api/tasks").await?;
    let (mine, going) = (rows(&t["mine"]), rows(&t["going"]));
    ensure!(mine.len() == 37 && going.len() == 1, "영업지원의 작업 {} {}", mine.len(), going.len());
    ensure!(mine.iter().all(|m| m["kind"] == "심사" && m["view"] == "심사" && m["ym"] == "2026-06" && m["role"] == support), "담당의 줄");
    // 정황이 걸린 줄(11)이 위, 그 안에서는 합산이 큰 순. 선택 칸은 정황이 없는 줄에만 있다
    let flag = |m: &J| rows(&m["marks"]).contains(&json!("정황"));
    ensure!(mine.iter().map(|m| (flag(m), m["total"].as_i64().unwrap_or(0))).is_sorted_by(|a, b| a >= b), "정황이 걸린 줄이 위, 합산이 큰 순");
    ensure!(mine.iter().all(|m| m["pick"] == !flag(m)), "선택 칸");
    let row = mine.iter().find(|m| m["target"] == one).cloned().unwrap_or_default();
    ensure!(row["name"] == "대성상사1" && row["total"] == 988_932 && row["marks"] == json!([]), "대성상사1의 줄 {row}");
    ensure!(going[0]["target"] == group && going[0]["name"] == "금강상사11 외 2" && going[0]["total"] == 3_888_097 && going[0]["role"] == exec && going[0]["pick"] == false, "박상현 그룹의 줄 {}", going[0]);
    let t = c.get(exec, "/api/tasks").await?;
    // 심사 작업만 본다(영업임원의 담당에는 뒤 티켓의 작업도 있다: 10의 추인)
    let own: Vec<J> = rows(&t["mine"]).into_iter().filter(|m| m["kind"] == "심사").collect();
    ensure!(own.len() == 1 && own[0]["target"] == group && own[0]["pick"] == false && rows(&t["going"]).is_empty(), "영업임원의 작업 {t}");
    for role in ["내부 감시", "회계·자금"] {
        let t = c.get(role, "/api/tasks").await?;
        ensure!(!rows(&t["mine"]).iter().chain(&rows(&t["going"])).any(|m| m["kind"] == "심사"), "{role}의 작업");
    }
    let n = q1(&c.db, "RETURN [count(SELECT id FROM review WHERE ym = '2026-06'), count(SELECT id FROM review WHERE ym = '2026-06' AND array::len(members) = 3), math::sum(SELECT VALUE array::len(payouts) FROM review WHERE ym = '2026-06'), count(SELECT id FROM payout WHERE status = '미지급')];", json!({})).await?;
    ensure!(n == json!([38, 1, 40, 40]), "심사 수 {n}");

    // 대성상사1: 관련자 없음. 합산 988,932, 한도 2,000,000(규칙에서), 승인권자 영업지원
    let d = review(support, one).await?;
    ensure!(d["review"] == json!({ "id": one, "name": "대성상사1", "ym": "2026-06", "status": "대기", "marks": [], "total": 988_932, "limit": 2_000_000, "approver": support, "holder": support, "fixed": null, "source": "계산", "file": null, "row": null }), "대성상사1의 심사 {}", d["review"]);
    ensure!(d["members"] == json!([{ "id": "D-001", "name": "대성상사1", "match": [], "pays": [{ "dealer": "D-001", "amount": 988_932, "source": "원본", "file": "01_corevia/sales/sales_rebate_payment_cv.csv", "row": 7 }] }]), "구성 {}", d["members"]);
    ensure!(d["relation"]["right"] == json!([]) && d["relation"]["mid"] == json!([]) && d["relation"]["lines"] == json!([]), "단독의 관계 {}", d["relation"]);
    ensure!(can(&d, "승인") == Some(false) && d["history"] == json!([]), "조치 {}", d["actions"]);
    // 규정: 심사 → 규칙 버전 → 조항 → 문서(선 11, 8, 7). 조항은 규정 문서의 41~45행
    let clause = |name: &str, value: i64| json!({ "name": name, "ver": 1, "value": value, "clause": "지급한도", "title": "판매장려금 지급 한도", "file": "00_common/approval_authority_policy.md", "first": 41, "last": 45, "text": d["rules"][0]["text"], "source": "원본" });
    ensure!(d["rules"] == json!([clause("한도", 2_000_000), clause("합산", 2)]), "규정 {}", d["rules"]);
    let text = d["rules"][0]["text"].as_str().unwrap_or("");
    ensure!(text.starts_with("## 판매장려금 지급 한도") && text.contains("2백만원 이하") && text.ends_with("관련자 그룹 여부를 확인한다."), "조항의 원문 {text}");
    let doc = q1(&c.db, "RETURN rule:`한도-v1`.clause.doc.sha;", json!({})).await?;
    ensure!(doc == orig::sha(orig::POLICY.1).as_str(), "문서의 해시");

    // 박상현 그룹: 1,373,515 + 1,189,046 + 1,325,536 = 3,888,097 > 한도 → 승인권자 영업임원. 영업지원에게는 조치가 없다
    let d = review(support, group).await?;
    ensure!(d["review"]["total"] == 3_888_097 && d["review"]["limit"] == 2_000_000 && d["review"]["approver"] == exec && d["review"]["name"] == "금강상사11 외 2", "그룹의 심사 {}", d["review"]);
    let got: Vec<J> = rows(&d["members"]).iter().map(|m| json!([m["name"], m["pays"][0]["amount"], m["match"]])).collect();
    ensure!(json!(got) == json!([["금강상사11", 1_373_515, ["대표자", "주소", "계좌"]], ["성일상사24", 1_189_046, ["대표자", "주소"]], ["대륙상사37", 1_325_536, ["대표자", "계좌"]]]), "그룹의 구성 {got:?}");
    let names = |v: &J| rows(v).iter().filter_map(|x| x["name"].as_str().map(String::from)).collect::<Vec<_>>();
    ensure!(names(&d["relation"]["left"]) == ["금강상사11"] && names(&d["relation"]["right"]) == ["성일상사24", "대륙상사37"], "그림의 대리점");
    let mut mid = names(&d["relation"]["mid"]);
    mid.sort();
    ensure!(mid == ["국민 412-27-556310", "박상현", "성남시 상공로 128"] && rows(&d["relation"]["lines"]).len() == 7, "그림의 식별자 {mid:?}");
    ensure!(can(&d, "승인").is_none(), "영업지원에게 그룹의 승인이 보임");
    // 박상현 그룹에는 정황이 걸려 있어(11) 승인에 사유가 필수다
    ensure!(can(&review(exec, group).await?, "승인") == Some(true) && can(&review(exec, one).await?, "승인").is_none(), "영업임원의 조치");

    // 권한은 DB가 강제한다: 승인권자가 아닌 역할의 요청은 거절되고 아무것도 바뀌지 않는다
    ensure!(approve(support, &[group]).await?.0 == 403, "영업지원이 한도를 넘는 심사를 승인");
    for role in [exec, "내부 감시", "회계·자금"] {
        ensure!(approve(role, &[one]).await?.0 == 403, "{role}이 영업지원의 심사를 승인");
    }
    // 화면을 거치지 않고 DB에 직접 써도 마찬가지다: 심사·작업·조치·규칙을 고칠 수 없고, 남의 이름으로 결정을 만들 수 없다
    let s = as_user(&c.db, c.token(support)).await?;
    let before = review(exec, group).await?;
    for sql in [
        "CREATE decision SET review = review:`2026-06-D-011`, kind = '승인';",
        "UPDATE review:`2026-06-D-011` SET approver = '영업지원';",
        "UPDATE review SET status = '승인', fixed = time::now(), total = 0;",
        "UPDATE act:`승인` SET who = '영업지원'; CREATE act:`통과` SET states = ['대기'], to = '승인', who = '영업지원';",
        "UPDATE rule SET value = 9000000000; UPDATE task SET role = '영업지원'; DELETE task; DELETE review;",
    ] {
        q(&s, sql, json!({})).await.ok();
    }
    ensure!(approve(support, &[group]).await?.0 == 403 && review(exec, group).await? == before, "직접 쓴 뒤");
    let n = q1(&c.db, "RETURN [count(SELECT id FROM review WHERE status = '대기' AND fixed = NONE), count(SELECT id FROM task WHERE state = '대기' AND kind = '심사'), count(SELECT id FROM decision WHERE source != '원본'), [act:`승인`.who, act:`통과`.id], rule:`한도-v1`.value, review:`2026-06-D-011`.approver];", json!({})).await?;
    ensure!(n == json!([38, 38, 0, ["승인권자", null], 2_000_000, exec]), "직접 쓴 뒤의 상태 {n}");

    // 영업지원이 대성상사1의 심사를 승인: 상태 승인, 굳은 날, 이력에 사람과 날짜. 남의 이름을 적어 보내도 DB가 채운 값이 남는다
    q(&s, "CREATE decision SET review = review:`2026-06-D-001`, kind = '승인', role = '영업임원', by = staff:exec, at = d'2020-01-01T00:00:00Z', source = '원본';", json!({})).await?;
    let d = review(support, one).await?;
    ensure!(d["review"]["status"] == "승인" && d["review"]["fixed"] == "2026-07-01" && can(&d, "승인").is_none(), "승인 뒤 {}", d["review"]);
    let mut h = d["history"].clone();
    h[0].as_object_mut().map(|o| o.remove("stamp"));
    ensure!(h == json!([{ "kind": "승인", "role": support, "at": "2026-07-01", "reason": null, "source": "시연" }]), "이력 {h}");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM decision WHERE source != '원본')[0] = staff:support;", json!({})).await? == true, "결정한 직원");
    ensure!(approve(support, &[one]).await? == (400, json!({ "error": "상태" })), "승인된 심사를 다시 승인");
    let t = c.get(support, "/api/tasks").await?;
    ensure!(rows(&t["mine"]).len() == 36 && !rows(&t["mine"]).iter().any(|m| m["target"] == one), "승인 뒤 담당");

    // 여러 개를 한 번에: 정황이 없고 승인권자가 영업지원인 심사만. 하나라도 아니면 전부 안 된다
    let (a, b, flagged) = ("2026-06-D-004", "2026-06-D-008", "2026-06-D-041");
    ensure!(approve(support, &[a, group]).await? == (403, json!({ "error": "권한" })) && review(support, a).await?["review"]["status"] == "대기", "임원의 심사를 섞은 선택");
    // 금강상사41의 심사에는 정황이 걸려 있다(11: 동명). 선택 칸이 없고, 섞어 보내면 사유가 없어 거절된다
    let t = c.get(support, "/api/tasks").await?;
    let row = rows(&t["mine"]).into_iter().find(|m| m["target"] == flagged).unwrap_or_default();
    ensure!(flag(&t["mine"][0]) && row["pick"] == false && row["marks"] == json!(["정황"]), "정황이 걸린 줄 {row}");
    ensure!(approve(support, &[a, flagged]).await? == (400, json!({ "error": "사유" })) && review(support, a).await?["review"]["status"] == "대기", "정황이 걸린 심사를 섞은 선택");
    ensure!(approve(support, &[a, one]).await?.0 == 400 && review(support, a).await?["review"]["status"] == "대기", "이미 승인된 심사를 섞은 선택");
    ensure!(approve(exec, &[a, b]).await?.0 == 403, "영업임원의 선택");
    let (code, r) = approve(support, &[a, b, a]).await?;
    ensure!(code == 200 && r["ids"] == json!([a, b]), "선택 승인 {code} {r}");
    for id in [a, b] {
        let d = review(support, id).await?;
        ensure!(d["review"]["status"] == "승인" && rows(&d["history"]).len() == 1, "선택 승인 뒤 {id}");
    }
    // 정황이 걸린 심사도 하나씩은 승인권자가 승인한다(정황은 지급을 막지 않는다, D8). 사유는 필수다(D41)
    ensure!(approve(support, &[flagged]).await? == (400, json!({ "error": "사유" })), "정황이 걸린 심사를 사유 없이 승인");
    ensure!(c.post(support, "/api/decide", json!({ "ids": [flagged], "kind": "승인", "reason": { "class": "경미" } })).await?.0 == 200, "정황이 걸린 심사의 승인");
    ensure!(rows(&c.get(support, "/api/tasks").await?["mine"]).len() == 33, "담당 33");

    // 굳히기: 승인 뒤에 그룹과 규칙이 바뀌어도 승인된 심사는 그때의 구성·합산·승인권자·규칙 버전 그대로이고, 대기인 심사는 따라 바뀐다.
    // 대륙상사2와 한라인상사3이 대성상사1의 주소·계좌를 함께 쓰게 되고(6월 1일), 한도 v2(1,500,000)가 6월 15일에 시행된다면
    let before = review(support, one).await?;
    q(&c.db, "
        FOR $d IN [dealer:`D-002`, dealer:`D-003`] {
            LET $e = { since: d'2026-06-01T00:00:00Z', via: '신고', source: '시연' };
            RELATE $d->addr->(SELECT VALUE out FROM addr WHERE in = dealer:`D-001`) CONTENT $e;
            RELATE $d->acct->(SELECT VALUE out FROM acct WHERE in = dealer:`D-001`) CONTENT $e;
        };
        UPDATE rule:`한도-v1` SET until = d'2026-06-15T00:00:00Z';
        CREATE rule:`한도-v2` SET name = '한도', ver = 2, value = 1500000, clause = clause:`지급한도`, since = d'2026-06-15T00:00:00Z', source = '시연';", json!({})).await?;
    recalc(&c.db).await?;
    // 지급 전이면 승인권자가 올라간 승인은 효력을 잃는다(D33. 14): 표시 재심사가 붙을 뿐 구성·합산·승인권자·규칙·결정은 그때 그대로다
    let (mut now, mut then) = (review(support, one).await?, before.clone());
    ensure!(now["review"]["marks"] == json!(["재심사"]) && then["review"]["marks"] == json!([]), "재심사 표시 {}", now["review"]["marks"]);
    for d in [&mut now, &mut then] {
        d["review"]["marks"] = json!([]);
    }
    ensure!(now == then, "굳은 심사가 바뀜");
    // 대기인 쪽(굳은 심사 `…-D-001`이 있어 번호가 붙는다): 세 곳이 한 심사(988,932 + 799,699 + 655,149 = 2,443,780), 승인권자 영업임원, 한도 v2. 한라인상사3의 심사는 없어진다
    let d = review(support, "2026-06-D-001-2").await?;
    ensure!(d["review"]["name"] == "대성상사1 외 2" && d["review"]["total"] == 2_443_780 && d["review"]["limit"] == 1_500_000 && d["review"]["approver"] == exec && d["review"]["status"] == "대기", "따라 바뀐 심사 {}", d["review"]);
    ensure!(d["rules"][0]["ver"] == 2 && d["rules"][1]["name"] == "합산" && rows(&d["rules"]).len() == 2, "따라 바뀐 규칙 {}", d["rules"]);
    ensure!(c.call(Some(c.token(support)), "GET", "/api/reviews/2026-06-D-003", None).await?.0 == 404, "없어진 심사");
    let t = c.get(exec, "/api/tasks").await?;
    ensure!(rows(&t["mine"]).iter().any(|m| m["target"] == "2026-06-D-001-2") && approve(support, &["2026-06-D-001-2"]).await?.0 == 403, "따라 바뀐 작업");
    // 한도 1,500,000을 넘게 된 다른 대기 심사도 영업임원으로 간다(가장 큰 금강상사11… 을 뺀 단독 가운데 1,537,170인 D-018)
    ensure!(review(support, "2026-06-D-018").await?["review"]["approver"] == exec, "새 한도");

    // 뒤 티켓이 끼우는 자리 ①: 조치를 더한다(act 한 줄). 사유가 필수인 조치는 사유 없이 거절된다.
    // 본보기는 이 검사만의 이름을 쓰고 "있다 / 없다"로만 본다(뒤 티켓이 보류·반려·추인·지급을 실제로 더해도 부딪히지 않게)
    q(&c.db, "CREATE act:`본보기멈춤` SET states = ['대기'], to = '보류', who = '승인권자', reason = true;
        CREATE act:`본보기확인` SET states = ['승인'], who = '영업임원', mark = '본보기표시', reason = true;", json!({})).await?;
    let stop = "본보기멈춤";
    ensure!(can(&review(exec, group).await?, stop) == Some(true) && can(&review(exec, group).await?, "승인").is_some(), "더한 조치");
    ensure!(can(&review(support, group).await?, stop).is_none(), "영업지원에게 더한 조치가 보임");
    ensure!(c.post(exec, "/api/decide", json!({ "ids": [group], "kind": stop })).await? == (400, json!({ "error": "사유" })), "사유 없는 조치");
    ensure!(c.post(support, "/api/decide", json!({ "ids": [group], "kind": stop, "reason": { "class": "기타", "memo": "소명 대기" } })).await?.0 == 403, "영업지원의 조치");
    ensure!(c.post(exec, "/api/decide", json!({ "ids": [group], "kind": stop, "reason": { "class": "기타", "memo": "소명 대기" } })).await?.0 == 200, "더한 조치의 결정");
    let d = review(exec, group).await?;
    let made = rows(&d["history"]).into_iter().find(|h| h["kind"] == stop).unwrap_or_default();
    ensure!(d["review"]["status"] == "보류" && d["review"]["fixed"].is_null() && made["reason"] == json!({ "class": "기타", "memo": "소명 대기" }) && made["role"] == exec && can(&d, stop).is_none(), "결정 뒤 {}", d["review"]);
    // 승인이 아닌 결정은 심사 작업을 끝내지 않는다(끝내는 것은 그 조치를 만드는 티켓의 일). 표시가 있어야 되는 조치는 표시가 붙으면 보인다
    ensure!(rows(&c.get(exec, "/api/tasks").await?["mine"]).iter().any(|m| m["target"] == group), "결정 뒤 작업");
    ensure!(can(&review(exec, one).await?, "본보기확인").is_none(), "표시 없는 조치");
    q(&c.db, "UPDATE review:`2026-06-D-001` SET marks += '본보기표시';", json!({})).await?;
    ensure!(can(&review(exec, one).await?, "본보기확인") == Some(true) && can(&review(support, one).await?, "본보기확인").is_none(), "표시가 붙은 조치");

    // 뒤 티켓이 끼우는 자리 ②: 승인에 뒤따를 일을 건다(DEFINE EVENT ON decision). 역할의 승인으로도 실행된다
    q(&c.db, "DEFINE EVENT check_after ON decision WHEN $event = 'CREATE' AND $after.kind = '승인' THEN {
        CREATE task SET kind = '본보기', view = '본보기', target = $after.review, role = '회계·자금', also = [$after.role], source = '계산';
    };", json!({})).await?;
    ensure!(approve(support, &["2026-06-D-007"]).await?.0 == 200, "승인");
    let mine = |m: &J| m["kind"] == "본보기" && m["target"] == "2026-06-D-007" && m["total"] == 1_389_435;
    ensure!(rows(&c.get("회계·자금", "/api/tasks").await?["mine"]).iter().any(mine), "뒤따른 작업");
    ensure!(rows(&c.get(support, "/api/tasks").await?["going"]).iter().any(mine), "영업지원의 진행");

    // 유효한 식별자 선이 하나도 없는 대리점도 자기만 든 그룹으로 심사가 남는다(한라인상사34의 세 선이 모두 제외됐다면)
    q(&c.db, "UPDATE rep, addr, acct SET excluded = true WHERE in = dealer:`D-034`;", json!({})).await?;
    recalc(&c.db).await?;
    let d = review(support, "2026-06-D-034").await?;
    ensure!(d["review"]["total"] == 1_353_657 && d["review"]["status"] == "대기" && d["members"][0]["name"] == "한라인상사34" && d["members"][0]["pays"][0]["amount"] == 1_353_657, "선이 없는 대리점의 심사 {d}");
    ensure!(rows(&c.get(support, "/api/tasks").await?["mine"]).iter().any(|m| m["target"] == "2026-06-D-034") && can(&d, "승인").is_some(), "선이 없는 대리점의 작업");

    // 굳은 심사는 다시 계산해도 그대로다: 승인된 대성상사1에 같은 귀속월의 새 미지급이 생기면 굳은 심사와 겹치지 않는 새 심사가 만들어진다
    let fixed = review(support, one).await?;
    q(&c.db, "CREATE payout:`RB-추가` SET ym = '2026-06', sales = 0, amount = 100000, status = '미지급', source = '시연';
        RELATE payout:`RB-추가`->payout_of->dealer:`D-001` SET source = '시연';", json!({})).await?;
    recalc(&c.db).await?;
    recalc(&c.db).await?;
    ensure!(review(support, one).await? == fixed, "굳은 심사가 다시 쓰임");
    let d = review(exec, "2026-06-D-001-2").await?;
    ensure!(d["review"]["status"] == "대기" && d["review"]["fixed"].is_null() && d["review"]["total"] == 2_543_780, "굳은 심사 옆의 새 심사 {}", d["review"]);
    ensure!(rows(&c.get(exec, "/api/tasks").await?["mine"]).iter().any(|m| m["target"] == "2026-06-D-001-2"), "새 심사의 작업");
    // 구성 표는 구성원의 지급을 모두 보여 금액의 합이 합산과 같다(대성상사1은 두 건)
    let amounts: Vec<i64> = rows(&d["members"]).iter().flat_map(|m| rows(&m["pays"])).filter_map(|p| p["amount"].as_i64()).collect();
    ensure!(rows(&d["members"][0]["pays"]).len() == 2 && amounts.len() == 4 && amounts.iter().sum::<i64>() == 2_543_780, "구성의 금액 {amounts:?}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pay(dealer: &str, ym: &str, amount: i64, status: &str, open: bool) -> Pay {
        Pay { id: format!("{dealer}-{ym}"), dealer: dealer.into(), ym: ym.into(), amount, status: status.into(), open }
    }
    fn g(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn 합산은_귀속월의_지급에서_반려만_빼고_한도_이하이면_영업지원_넘으면_영업임원() {
        let pays = [
            pay("A", "2026-06", 1_200_000, "미지급", true), pay("B", "2026-06", 800_000, "미지급", true), // 합 2,000,000 = 한도
            pay("C", "2026-06", 2_000_001, "미지급", true),
            pay("D", "2026-06", 1_500_000, "미지급", true), pay("E", "2026-06", 900_000, "반려", false), // 반려는 뺀다
            pay("F", "2026-06", 100_000, "승인", false), // 기다리는 지급이 없으면 심사도 없다
            pay("A", "2026-05", 9_000_000, "미지급", true), // 다른 귀속월
        ];
        let groups = [g(&["A", "B", "N"]), g(&["D", "E"]), g(&["F"])]; // C는 유효한 선이 없어 어느 그룹에도 없다 → 자기만 든 그룹
        let p = plan("2026-06", &groups, &pays, 2_000_000);
        let got: Vec<_> = p.iter().map(|x| (x["id"].as_str().unwrap(), x["total"].as_i64().unwrap(), x["approver"].as_str().unwrap(), x["members"].as_array().unwrap().len(), x["payouts"].as_array().unwrap().len())).collect();
        assert_eq!(got, [("2026-06-A", 2_000_000, "영업지원", 3, 2), ("2026-06-D", 1_500_000, "영업지원", 2, 1), ("2026-06-C", 2_000_001, "영업임원", 1, 1)]);
    }

    #[test]
    fn 이미_굳은_심사의_지급도_합산에는_든다() {
        // A는 승인되어 굳었고(open 아님) 그 뒤 B와 한 그룹이 됐다: B의 심사는 A의 금액까지 더한다
        let pays = [pay("A", "2026-06", 1_300_000, "미지급", false), pay("B", "2026-06", 900_000, "미지급", true)];
        let p = plan("2026-06", &[g(&["A", "B"])], &pays, 2_000_000);
        assert_eq!((p[0]["id"].as_str(), p[0]["total"].as_i64(), p[0]["approver"].as_str()), (Some("2026-06-B"), Some(2_200_000), Some("영업임원")));
    }

    #[test]
    fn 규칙_버전은_시행일이_속한_귀속월부터_적용한다() {
        let rule = |id: &str, value: i64, since: Option<&str>, until: Option<&str>| Rule { id: id.into(), name: "한도".into(), value, since: since.map(Into::into), until: until.map(Into::into) };
        let rules = [rule("v1", 2_000_000, None, Some("2026-06-15")), rule("v2", 1_500_000, Some("2026-06-15"), None)];
        let ids = |ym: &str| pick(&rules, ym).iter().map(|r| r.id.as_str()).collect::<Vec<_>>();
        assert_eq!(ids("2026-05"), ["v1"]);
        assert_eq!(ids("2026-06"), ["v2"]);
        assert_eq!(ids("2026-07"), ["v2"]);
        assert_eq!(period("2026-06"), ("2026-06-01".into(), "2026-06-30".into()));
        assert_eq!(period("2028-02").1, "2028-02-29");
        assert_eq!(period("2026-02").1, "2026-02-28");
    }
}
