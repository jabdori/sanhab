//! 13 변경: 영업지원이 대리점의 식별자 변경(항목, 새 값, 변경일)을 넣는다. 입력은 사건으로 남고(`incident`), DB의 이벤트가 선 1~3을 바꾼다(이전 값은 변경일 전날까지 유효로 남는다).
//! 그 뒤 코드가 심사(04 `recalc`) → 재검토와 추인 묶음(09 `remark`) → 정황(11 `detect`)을 다시 계산한다. 인지일은 시스템의 오늘, 경로는 신고, 출처는 시연이다(D15, D30).
use super::t04_review::{compute, recalc};
use super::t09_again::remark;
use super::t11_signal::detect;
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, attempt, refuse};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/13-변경.surql");

/// 새 값의 최대 길이(글자). 넘으면 대상
const MAX: usize = 200;

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/change", get(can).post(change)).route("/dealers/{id}/changes", get(changes))
}

/// 대리점 상세의 이력: 그 대리점에 들어온 변경(사건)을 일어난 순서대로
async fn changes(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "SELECT kind, role, time::format(at, '%Y-%m-%d') AS at, item, value, time::format(since, '%Y-%m-%d') AS since, source, stamp FROM incident
        WHERE dealer = type::record('dealer', $id) ORDER BY stamp;", json!({ "id": id })).await?;
    Ok(Json(r))
}

/// `YYYY-MM-DD`의 꼴인지(없는 날짜는 DB의 변환이 거절한다)
fn day(s: &str) -> bool {
    s.len() == 10 && s.chars().enumerate().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() })
}

/// 화면의 조치가 읽는 것: 지금 역할이 변경을 넣을 수 있는지(`can`)
async fn can(Extension(me): Extension<Me>) -> R {
    Ok(Json(json!({ "can": q1(&me.db, "RETURN fn::changeable();", json!({})).await? })))
}

/// 변경: `{ id(대리점), item(대표자·주소·계좌), value, since(변경일) }`. 거절의 낱말은 대상(없는 대리점·항목, 틀린 꼴, 오늘보다 뒤의 변경일) → 권한(영업지원만) →
/// 상태(지금 값과 같거나, 변경일이 지금 값의 변경일보다 뒤가 아님). 쓴 뒤에 심사·재검토·정황을 다시 계산한다
async fn change(State(db): State<std::sync::Arc<Db>>, Extension(me): Extension<Me>, Body(b): Body) -> R {
    let text = |k: &str| b[k].as_str().map(str::trim).filter(|v| !v.is_empty());
    let (Some(id), Some(item), Some(value), Some(since)) = (text("id"), text("item"), text("value").filter(|v| v.chars().count() <= MAX), text("since").filter(|s| day(s))) else {
        return Err(refuse("대상"));
    };
    let made = attempt(&me.db, "
        LET $d = type::record('dealer', $id);
        LET $day = <datetime> ($since + 'T00:00:00Z');
        RETURN IF $d.id = NONE OR $item NOTINSIDE ['대표자', '주소', '계좌'] OR $day > fn::today() THEN '대상'
            ELSE IF !fn::changeable() THEN '권한'
            ELSE {
                LET $now = fn::current($d, $item);
                RETURN IF $value INSIDE $now.value OR array::len($now[WHERE since >= $day]) > 0 THEN '상태' END;
            } END;",
        "CREATE incident SET kind = '변경', dealer = type::record('dealer', $id), item = $item, value = $value, since = <datetime> ($since + 'T00:00:00Z') RETURN VALUE record::id(id);",
        json!({ "id": id, "item": item, "value": value, "since": since }),
    ).await?;
    regroup(&db).await?;
    attach(&db, made[0].as_str().unwrap_or_default()).await?;
    Ok(Json(json!({ "id": made[0] })))
}

/// 선이 바뀐 뒤의 다시 계산: 심사(04 `recalc`) → 재검토와 추인 묶음(09 `remark`) → 정황(11 `detect`).
/// D56: 결정(보류·반려·재상신)이 붙은 굳지 않은 심사의 그룹이 바뀌면(없어지거나 다른 심사에 합쳐지거나 구성이 달라지면) 그 기록은 지우지 않고
/// 그 지급이 든 새 심사의 이력으로 옮겨(`moved`, 옛 심사의 이름 `was`) 보이고, 새 심사는 대기로 다시 시작하며(심사 작업도 대기) 남은 재상신 작업은 닫는다.
/// 선을 바꾸는 다른 티켓(20 소명 …)도 `recalc` 대신 이것을 부르면 같은 규칙이 따른다
pub async fn regroup(db: &Db) -> Result<()> {
    let plan = compute(db, &[]).await?;
    let open = q1(db, "SELECT record::id(id) AS id, name, members.map(|$d| record::id($d)) AS members, payouts.map(|$p| record::id($p)) AS payouts FROM review
        WHERE fixed = NONE AND (count(SELECT id FROM decision WHERE review = $parent.id AND was = NONE) > 0 OR count(SELECT id FROM resubmit WHERE review = $parent.id AND was = NONE) > 0);", json!({})).await?;
    let mut moves = vec![];
    for r in open.as_array().into_iter().flatten() {
        let mine = |p: &&J| p["payouts"].as_array().is_some_and(|ps| ps.iter().any(|x| r["payouts"].as_array().is_some_and(|o| o.contains(x))));
        // 옛 심사의 지급이 든 새 심사(갈라졌으면 합산이 큰 쪽). 같은 id에 구성도 같으면 그대로다
        let Some(p) = plan.iter().filter(mine).max_by_key(|p| p["total"].as_i64()) else { continue };
        if p["id"] != r["id"] || p["members"] != r["members"] {
            moves.push(json!({ "old": r["id"], "name": r["name"], "new": p["id"] }));
        }
    }
    q(db, "FOR $m IN $moves {
            LET $o = type::record('review', $m.old);
            LET $n = type::record('review', $m.new);
            UPDATE decision SET was = $m.name, moved = $n WHERE review = $o AND was = NONE;
            UPDATE resubmit SET was = $m.name, moved = $n WHERE review = $o AND was = NONE;
            -- 재상신 작업은 닫고 새 심사를 가리키게 둔다(06의 t06_gone이 지우지 않게)
            UPDATE task SET state = '완료', target = $n WHERE target = $o AND kind = '재상신';
        };", json!({ "moves": moves })).await?;
    recalc(db).await?;
    q(db, "FOR $m IN $moves {
            LET $n = type::record('review', $m.new);
            UPDATE $n SET status = '대기' WHERE status != '대기';
            UPDATE task SET state = '대기' WHERE target = $n AND kind = '심사' AND state != '대기';
        };", json!({ "moves": moves })).await?;
    remark(db).await?;
    detect(db).await
}

/// D57: 변경으로 두 곳이 새로 일치하게 되면, 이미 있는 동명 정황(접수·요청)에 그 변경(사건)과 새 일치의 선을 근거로 붙인다(닫지 않는다).
/// 정황의 상태는 그대로다. 기각된 정황이 새 근거로 다시 올라오는 것은 15의 일이다 — 15는 아래의 상태 조건에 기각을 더하고 `fn::signal`의 갈래를 덮는다
async fn attach(db: &Db, incident: &str) -> Result<()> {
    q(db, "
        LET $i = type::record('incident', $id);
        LET $line = (SELECT VALUE id FROM rep, addr, acct WHERE incident = $i)[0];
        FOR $s IN (SELECT id, kind, dealers FROM signal WHERE kind = '동명' AND state INSIDE ['접수', '요청'] AND dealers CONTAINS $i.dealer) {
            LET $same = (SELECT VALUE id FROM rep, addr, acct WHERE out = $line.out AND in INSIDE $s.dealers AND in != $i.dealer AND !excluded AND since <= fn::today() AND (until = NONE OR until > $i.since));
            IF array::len($same) > 0 {
                fn::signal($s.kind, string::replace(record::id($s.id), string::concat($s.kind, '-'), ''), '', $s.dealers, array::concat([$i, $line], $same), '계산');
            };
        };", json!({ "id": incident })).await?;
    Ok(())
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &mut Check) -> Result<()> {
    main_flow(c).await?;
    merged(c).await
}

async fn main_flow(c: &Check) -> Result<()> {
    let (support, exec, acct) = ("영업지원", "영업임원", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let again = async |id: &str| c.get(support, &format!("/api/reviews/{id}/again")).await;
    let list = c.get(support, "/api/dealers").await?;
    let addr41 = list[40]["address"][0].as_str().unwrap_or_default().to_string();
    ensure!(list[40]["id"] == "D-041" && addr41 == "고양시 중앙로 128", "금강상사41의 주소 {}", list[40]);
    let change = |id: &str, item: &str, value: &str, since: &str| json!({ "id": id, "item": item, "value": value, "since": since });

    // 거절: 영업지원만(권한), 틀린 꼴·없는 날짜·오늘(2026-07-01)보다 뒤의 변경일·없는 대리점이나 항목은 대상, 지금 값과 같거나 지금 값보다 앞선 변경일은 상태
    let me13 = change("D-034", "주소", &addr41, "2026-02-01");
    for r in [exec, acct, "내부 감시"] {
        ensure!(c.post(r, "/api/change", me13.clone()).await? == (403, json!({ "error": "권한" })), "{r}의 변경");
    }
    for (body, word) in [
        (change("D-034", "주소", &addr41, "2026-2-1"), "대상"),
        (change("D-034", "주소", &addr41, "2026-02-30"), "대상"),
        (change("D-034", "주소", &addr41, "2026-07-02"), "대상"),
        (change("D-999", "주소", &addr41, "2026-02-01"), "대상"),
        (change("D-034", "전화", &addr41, "2026-02-01"), "대상"),
        (change("D-034", "주소", " ", "2026-02-01"), "대상"),
        (change("D-034", "주소", &"가".repeat(201), "2026-02-01"), "대상"),
        (json!({ "id": "D-034" }), "대상"),
        (change("D-034", "주소", "대전시 중앙로 260", "2026-02-01"), "상태"),
        (change("D-034", "주소", &addr41, "2021-08-13"), "상태"),
    ] {
        ensure!(c.post(support, "/api/change", body.clone()).await? == (400, json!({ "error": word })), "{body} → {word}");
    }
    ensure!(c.raw(support, "/api/change", "x", Some("application/json")).await?.0 == 400, "JSON이 아닌 본문");
    // 역할의 세션으로 사건이나 선을 직접 만들지 못한다(권한은 DB가 강제)
    let s = as_user(&c.db, c.token(exec)).await?;
    q(&s, "CREATE incident SET kind = '변경', dealer = dealer:`D-034`, item = '주소', value = 'x', since = d'2026-02-01T00:00:00Z';", json!({})).await.ok();
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM incident);", json!({})).await? == 0, "거절된 변경이 남음");

    ensure!(c.get(support, "/api/change").await? == json!({ "can": true }) && c.get(exec, "/api/change").await? == json!({ "can": false }), "조치의 can");

    // 17 보고: 동명 정황의 보고를 변경 전에 써 둔다(고정 응답). 변경으로 근거가 붙으면 입력이 달라져 새 보고 대상이 된다(stale)
    let audit = "내부 감시";
    *super::t17_report::USE.lock().unwrap() = Some("fixture".into());
    let made17 = super::t17_report::make(&c.db, "동명-박준호", true).await;
    *super::t17_report::USE.lock().unwrap() = None;
    made17?;
    let stale = async || Ok::<_, anyhow::Error>(c.get(audit, "/api/signals/동명-박준호/report").await?["report"]["stale"].clone());
    ensure!(stale().await? == false, "변경 전의 보고");

    // 시나리오 4의 1: 한라인상사34가 2월 1일부터 금강상사41의 주소를 쓴다(7월 1일 신고)
    let (code, made) = c.post(support, "/api/change", me13.clone()).await?;
    ensure!(code == 200, "변경 {code} {made}");
    // 입력은 사건으로 남는다: 누가, 인지일(오늘), 경로 신고, 출처 시연. 새 선이 그 사건을 가리킨다
    let inc = q1(&c.db, "RETURN (SELECT kind, record::id(dealer) AS dealer, item, value, time::format(since, '%Y-%m-%d') AS since, time::format(known, '%Y-%m-%d') AS known, via, role, by != NONE AS by, source,
        count(SELECT id FROM addr WHERE incident = $parent.id) AS lines FROM type::record('incident', $id))[0];", json!({ "id": made["id"] })).await?;
    ensure!(inc == json!({ "kind": "변경", "dealer": "D-034", "item": "주소", "value": addr41, "since": "2026-02-01", "known": "2026-07-01", "via": "신고", "role": support, "by": true, "source": "시연", "lines": 1 }), "사건 {inc}");

    // 이전 값은 지워지지 않고 변경일 전날까지 유효하다(until = 변경일). 목록에는 지금 값만
    let reg: Vec<J> = rows(&c.get(support, "/api/dealers/D-034").await?["registered"]).into_iter().filter(|r| r["item"] == "주소").collect();
    ensure!(reg.len() == 2, "주소의 등록 {reg:?}");
    ensure!(reg[0]["value"] == "대전시 중앙로 260" && reg[0]["since"] == "2021-08-13" && reg[0]["until"] == "2026-02-01" && reg[0]["via"] == "원본" && reg[0]["source"] == "원본", "이전 값 {}", reg[0]);
    ensure!(reg[1]["value"] == addr41.as_str() && reg[1]["since"] == "2026-02-01" && reg[1]["until"].is_null() && reg[1]["known"] == "2026-07-01" && reg[1]["via"] == "신고" && reg[1]["source"] == "시연", "새 값 {}", reg[1]);
    ensure!(c.get(support, "/api/dealers").await?[33]["address"] == json!([addr41]), "목록의 지금 값");
    ensure!(reg[0]["last"] == "2026-01-31" && reg[1]["last"].is_null(), "이전 값의 마지막 날");
    // 대리점 상세의 이력: 변경 · 영업지원 · 2026-07-01 / 주소 고양시 중앙로 128 · 변경일 2026-02-01
    let h = c.get(exec, "/api/dealers/D-034/changes").await?;
    ensure!(rows(&h).len() == 1 && h[0]["kind"] == "변경" && h[0]["role"] == support && h[0]["at"] == "2026-07-01" && h[0]["item"] == "주소" && h[0]["value"] == addr41.as_str() && h[0]["since"] == "2026-02-01", "대리점의 이력 {h}");
    ensure!(c.get(exec, "/api/dealers/D-041/changes").await? == json!([]), "변경 없는 대리점의 이력");

    // 두 곳이 2월부터 관련자다(대표자·주소)
    let rel = c.get(support, "/api/dealers/D-034/related").await?;
    let near41 = rows(&rel["near"]).into_iter().find(|n| n["id"] == "D-041");
    ensure!(near41.is_some_and(|n| n["match"] == json!(["대표자", "주소"]) && n["related"] == true), "관련자 {rel}");

    // 2월(2,218,474)과 3월(2,007,205)이 재검토, 4월(1,600,007)·5월(1,851,017)은 그대로, 1월은 변경 전이라 단독 그대로.
    // 인지일 2026-07-01이 승인(지급일)보다 뒤라 당시에는 알 수 없었던 건(late)이다
    for (ym, total, on) in [("2026-02", 2_218_474, true), ("2026-03", 2_007_205, true), ("2026-04", 1_600_007, false), ("2026-05", 1_851_017, false)] {
        for d in ["D-034", "D-041"] {
            let id = format!("{ym}-{d}");
            let a = again(&id).await?;
            ensure!(a["again"] == on && a["now"]["total"] == total && rows(&a["now"]["members"]).len() == 2 && a["known"] == "2026-07-01" && a["late"] == true, "{id} {a}");
            let marks = c.get(support, &format!("/api/reviews/{id}")).await?["review"]["marks"].clone();
            ensure!(marks.as_array().is_some_and(|m| m.contains(&json!("재검토")) == on), "{id}의 표시 {marks}");
        }
    }
    let a = again("2026-01-D-034").await?;
    ensure!(a["again"] == false && a["now"]["total"] == 1_231_077 && rows(&a["now"]["members"]).len() == 1 && a["known"].is_null() && a["late"] == false, "1월 {a}");

    // 10 추인: 2·3월이 영업임원의 추인 작업에 새 묶음으로 올라온다
    let mine = rows(&c.get(exec, "/api/tasks").await?["mine"]);
    for ym in ["2026-02", "2026-03"] {
        let t = mine.iter().find(|t| t["kind"] == "추인" && t["target"] == format!("{ym}-D-034").as_str());
        ensure!(t.is_some_and(|t| t["name"] == "한라인상사34 외 1" && t["ym"] == ym), "{ym}의 추인 작업 {mine:?}");
    }
    ensure!(!mine.iter().any(|t| t["kind"] == "추인" && t["target"].as_str().is_some_and(|x| x.starts_with("2026-04-D-034") || x.starts_with("2026-01-D-034"))), "4월·1월의 추인 작업");

    // 6월의 대기 심사는 한 심사로 합쳐진다: 합산 2,255,709, 승인권자 영업임원. 금강상사41의 심사는 없어진다
    let r = c.get(exec, "/api/reviews/2026-06-D-034").await?;
    ensure!(r["review"]["total"] == 2_255_709 && r["review"]["approver"] == exec && r["review"]["status"] == "대기" && rows(&r["members"]).len() == 2 && r["review"]["name"] == "한라인상사34 외 1", "6월의 심사 {}", r["review"]);
    ensure!(c.call(Some(c.token(exec)), "GET", "/api/reviews/2026-06-D-041", None).await?.0 == 404, "금강상사41의 6월 심사");
    ensure!(mine.iter().any(|t| t["kind"] == "심사" && t["target"] == "2026-06-D-034"), "영업임원의 심사 작업");
    // D57: 동명(박준호) 정황은 닫히지 않고(접수 그대로, 합쳐진 심사에 정황 표시), 변경(사건)과 새 일치(두 곳의 주소 선)가 근거로 붙는다
    let sig = c.get(audit, "/api/signals/동명-박준호").await?;
    ensure!(sig["signal"]["state"] == "접수" && rows(&r["review"]["marks"]).contains(&json!("정황")), "동명 정황 {} {}", sig["signal"], r["review"]["marks"]);
    let ev = rows(&sig["evidence"]);
    let inc = format!("incident:{}", made["id"].as_str().unwrap_or_default());
    let change_row = ev.iter().find(|e| e["id"] == inc.as_str());
    ensure!(change_row.is_some_and(|e| e["item"] == "변경" && e["dealer"]["id"] == "D-034" && e["at"] == "2026-02-01" && e["node"]["name"] == addr41.as_str() && e["value"] == "주소" && e["source"] == "시연"), "근거의 변경 {ev:?}");
    let addrs: Vec<&J> = ev.iter().filter(|e| e["item"] == "주소" && e["node"]["name"] == addr41.as_str()).collect();
    ensure!(addrs.len() == 2 && ev.iter().filter(|e| e["item"] == "대표자").count() == 2, "근거의 새 일치 {ev:?}");
    // 17: 근거가 달라져 보고는 다시 써야 한다(이전 보고는 남는다). 12: 동명은 가설이 더하는 선이 없어 그룹과 승인권자가 현재 그대로다
    ensure!(stale().await? == true, "변경 뒤의 보고");
    let h = c.get(audit, "/api/signals/동명-박준호/hypo").await?;
    ensure!(h["approver"][0] == h["approver"][1] && h["group"][0] == h["group"][1], "동명의 가설 {h}");

    // 시나리오 4 → 5(정황의 길): 동명 정황에 주소 근거가 붙었으므로 내부 감시가 요청하면 요청서의 서류 목록이 대표자 + 주소(임대차계약서·사업자등록증)다.
    // 영업지원이 발송하고 호실이 빠진 임대차계약서(시연 3)가 접수되면 비교에 호실 누락, 인정하면 제외될 선은 한라인상사34의 주소 선 하나다
    ensure!(c.post(audit, "/api/rule", json!({ "id": "동명-박준호", "kind": "요청" })).await?.0 == 200, "동명 정황의 요청");
    let cid = c.get(audit, "/api/signals/동명-박준호/clarifies").await?[0]["id"].as_str().unwrap_or_default().to_string();
    let d = c.get(support, &format!("/api/clarifies/{cid}")).await?;
    ensure!(d["kinds"] == json!(["주소", "대표자"]) && d["docs"] == json!([["주소", "임대차계약서"], ["주소", "사업자등록증"], ["대표자", "생년월일을 확인할 수 있는 서류"]]), "요청서의 서류 {} {}", d["kinds"], d["docs"]);
    ensure!(c.post(support, "/api/send", json!({ "id": cid })).await?.0 == 200, "발송");
    let s3 = super::t19_docs::SAMPLES[2];
    let res = reqwest::Client::new().post(format!("{}/api/clarifies/{cid}/docs?name={}", c.base(), s3.0)).bearer_auth(c.token(support)).header("content-type", "image/png").body(s3.2.to_vec()).send().await?;
    ensure!(res.status() == 200, "서류 접수 {}", res.status());
    *super::t19_docs::READ.lock().unwrap() = Some("fixture".into());
    *super::t17_report::USE.lock().unwrap() = Some("fixture".into());
    let filled = async {
        for _ in 0..2 {
            q(&c.db, "UPDATE doc SET read_tried = NONE, tidy_tried = NONE;", json!({})).await?;
            super::t19_docs::sweep_with(&c.db, None, None).await?;
        }
        Ok::<_, anyhow::Error>(())
    }.await;
    *super::t19_docs::READ.lock().unwrap() = None;
    *super::t17_report::USE.lock().unwrap() = None;
    filled?;
    let v = c.get(audit, &format!("/api/clarifies/{cid}/verdict")).await?;
    let items: Vec<&J> = v["lines"].as_array().into_iter().flatten().map(|l| &l["item"]).collect();
    ensure!(c.get(audit, &format!("/api/clarifies/{cid}")).await?["clarify"]["state"] == "접수" && v["unknown"] == json!([["호실", "누락"]]) && items == [&json!("주소")], "접수한 서류의 비교 {v}");

    // 20 소명: 한라인상사34가 금강상사41과의 주소 일치를 소명하고(서류 접수) 내부 감시가 인정하면, 그 주소 선이 빠져 다시 관련자가 아니게 된다.
    // 2·3월의 재검토가 풀리고 6월 심사는 두 곳으로 갈라져 각각 영업지원의 것이 된다
    let res = reqwest::Client::new().post(format!("{}/api/dealers/D-034/clarify?other=D-041&kind=주소&name={}", c.base(), super::t19_docs::SAMPLES[0].0))
        .bearer_auth(c.token(support)).header("content-type", "image/png").body(super::t19_docs::SAMPLES[0].2.to_vec()).send().await?;
    ensure!(res.status() == 200, "소명 접수 {}", res.status());
    let cl = res.json::<J>().await?["id"].as_str().unwrap_or_default().to_string();
    let (code, v) = c.post(audit, "/api/verdict", json!({ "id": cl, "kind": "인정", "reason": { "class": "입증" } })).await?;
    ensure!(code == 200, "인정 {code} {v}");
    let near = |rel: &J| rows(&rel["near"]).into_iter().find(|n| n["id"] == "D-041").map(|n| n["related"].clone());
    ensure!(near(&c.get(support, "/api/dealers/D-034/related").await?) == Some(json!(false)), "인정 뒤의 관계");
    for id in ["2026-02-D-034", "2026-03-D-041"] {
        ensure!(again(id).await?["again"] == false, "인정 뒤 {id}");
    }
    for (id, total) in [("2026-06-D-034", 1_353_657), ("2026-06-D-041", 902_052)] {
        let r = c.get(exec, &format!("/api/reviews/{id}")).await?["review"].clone();
        ensure!(r["total"] == total && r["approver"] == support && r["status"] == "대기", "인정 뒤 {id} {r}");
    }
    // D31: 한라인상사34의 식별자가 다시 바뀌면(계좌의 신고) 인정은 효력을 잃고 주소 선이 다시 계산에 든다 — 2·3월이 다시 재검토
    ensure!(c.post(support, "/api/change", change("D-034", "계좌", "시연 300-00-000034", "2026-07-01")).await?.0 == 200, "인정 뒤의 변경");
    ensure!(near(&c.get(support, "/api/dealers/D-034/related").await?) == Some(json!(true)) && again("2026-02-D-034").await?["again"] == true, "다시 바뀐 뒤의 관계");

    // 11 계좌 정황은 회수 날짜에 유효한 등록만 본다: 금강상사11·대륙상사37이 2026-01-01부터 다른 계좌를 쓰면(회수는 3~4월) 성일상사24의 회수는 계좌 정황이 아니다
    // (한 곳씩 바꾸는 사이에는 남은 곳의 등록으로 정황이 잡히므로, 둘 다 바꾼 뒤 정황을 지우고 다시 찾는다)
    for (d, v) in [("D-011", "시연 100-00-000011"), ("D-037", "시연 100-00-000037")] {
        ensure!(c.post(support, "/api/change", change(d, "계좌", v, "2026-01-01")).await?.0 == 200, "{d}의 계좌 변경");
    }
    q(&c.db, "DELETE task WHERE target INSIDE [signal:`계좌-D-024`, signal:`계좌-D-011`]; DELETE signal:`계좌-D-024`, signal:`계좌-D-011`;", json!({})).await?;
    detect(&c.db).await?;
    ensure!(q1(&c.db, "RETURN [signal:`계좌-D-024`.id, signal:`계좌-D-011`.id];", json!({})).await? == json!([null, null]), "변경 전의 등록으로 잡은 계좌 정황");

    // 08 대사: 지급한 뒤에 계좌가 바뀌면 지급한 날의 계좌로 맞춰 본다(D49). 대성상사1의 6월분을 승인·지급(7월 1일)하고, 7월 2일부터 계좌가 바뀐다
    ensure!(c.post(support, "/api/decide", json!({ "ids": ["2026-06-D-001"], "kind": "승인" })).await?.0 == 200, "대성상사1의 승인");
    let pay = rows(&c.get(acct, "/api/pays").await?["rows"]).into_iter().find(|p| p["name"] == "대성상사1").and_then(|p| p["id"].as_str().map(String::from)).unwrap_or_default();
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200, "지급");
    q(&c.db, "UPDATE meta:v SET today = d'2026-07-02T00:00:00Z';", json!({})).await?;
    ensure!(c.post(support, "/api/change", change("D-001", "계좌", "시연 200-00-000001", "2026-07-02")).await?.0 == 200, "대성상사1의 계좌 변경");
    let old = "기업 198-22-851114";
    let p = c.get(acct, &format!("/api/pays/{pay}")).await?;
    ensure!(p["accounts"].as_array().is_some_and(|a| a.len() == 1 && a[0]["value"] == old), "지급 상세의 계좌 {}", p["accounts"]);
    ensure!(c.get(acct, &format!("/api/pays/{pay}/recon")).await?["want"]["accounts"] == json!([old]), "대사의 계좌");
    ensure!(c.get(support, "/api/dealers").await?[0]["account"] == json!(["시연 200-00-000001"]), "목록의 새 계좌");
    let (code, _) = c.post(acct, "/api/reply", json!({ "id": pay, "amount": p["pay"]["amount"], "account": old, "result": "성공" })).await?;
    ensure!(code == 200 && c.get(acct, &format!("/api/pays/{pay}/recon")).await?["recon"]["verdict"] == "일치", "지급한 날의 계좌로 일치");
    Ok(())
}

/// D56: 합쳐지는 6월 심사에 결정이 붙어 있으면(금강상사41 쪽 / 한라인상사34 쪽의 보류·반려, 반려 뒤 재상신) 어느 경우든
/// 합쳐진 심사는 대기로 다시 시작하고(영업임원의 담당), 옛 결정은 지워지지 않고 합쳐진 심사의 이력에 옛 심사의 이름과 함께 보이며, 남은 재상신 작업은 닫힌다
async fn merged(c: &mut Check) -> Result<()> {
    let (support, exec) = ("영업지원", "영업임원");
    let change = json!({ "id": "D-034", "item": "주소", "value": "고양시 중앙로 128", "since": "2026-02-01" });
    for (on, kind, back, was) in [
        ("2026-06-D-041", "보류", false, "금강상사41"),
        ("2026-06-D-034", "보류", false, "한라인상사34"),
        ("2026-06-D-041", "반려", false, "금강상사41"),
        ("2026-06-D-034", "반려", false, "한라인상사34"),
        ("2026-06-D-041", "반려", true, "금강상사41"),
    ] {
        c.reset().await?;
        let case = format!("{on} {kind}{}", if back { " 재상신" } else { "" });
        let why = json!({ "class": "정황" });
        ensure!(c.post(support, "/api/decide", json!({ "ids": [on], "kind": kind, "reason": why })).await?.0 == 200, "{case}: 결정");
        let mut lines = vec![kind];
        if back {
            ensure!(c.post(support, "/api/resubmit", json!({ "id": on, "reason": { "class": "서류" } })).await?.0 == 200, "{case}: 재상신");
            lines.push("재상신");
        }
        ensure!(c.post(support, "/api/change", change.clone()).await?.0 == 200, "{case}: 변경");
        let id = "2026-06-D-034";
        let r = c.get(exec, &format!("/api/reviews/{id}")).await?;
        ensure!(r["review"]["status"] == "대기" && r["review"]["approver"] == exec && r["review"]["total"] == 2_255_709 && r["history"] == json!([]), "{case}: 합쳐진 심사 {}", r["review"]);
        ensure!(c.call(Some(c.token(exec)), "GET", "/api/reviews/2026-06-D-041", None).await?.0 == 404, "{case}: 금강상사41의 심사");
        let l = c.get(exec, &format!("/api/reviews/{id}/resubmit")).await?["lines"].clone();
        let got: Vec<(&str, &str)> = l.as_array().into_iter().flatten().filter_map(|x| Some((x["kind"].as_str()?, x["was"].as_str()?))).collect();
        ensure!(got == lines.iter().map(|k| (*k, was)).collect::<Vec<_>>() && l[0]["reason"] == why && l[0]["role"] == support, "{case}: 이력 {l}");
        let t = c.get(exec, "/api/tasks").await?;
        ensure!(t["mine"].as_array().is_some_and(|m| m.iter().any(|x| x["kind"] == "심사" && x["target"] == id)), "{case}: 영업임원의 담당 {t}");
        let s = c.get(support, "/api/tasks").await?;
        ensure!(!["mine", "going"].iter().any(|k| s[k].as_array().is_some_and(|m| m.iter().any(|x| x["kind"] == "재상신"))), "{case}: 재상신 작업 {s}");
        // 영업임원은 처음부터 판단한다: 승인할 수 있다(정황이 걸려 사유 필수)
        ensure!(c.post(exec, "/api/decide", json!({ "ids": [id], "kind": "승인", "reason": { "class": "정상" } })).await?.0 == 200, "{case}: 영업임원의 승인");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn day() {
        assert!(super::day("2026-02-01"));
        for s in ["2026-2-01", "20260201", "2026/02/01", "2026-02-1x", ""] {
            assert!(!super::day(s), "{s}");
        }
    }
}
