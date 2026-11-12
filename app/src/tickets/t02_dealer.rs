//! 02 대리점: 원본을 그래프로 적재하고(스펙의 노드와 선 1~6) 대리점의 목록과 상세(등록, 지급)를 내놓는다.
//! 관련자·그룹은 여기서 계산하지 않는다(03번). 같은 값의 사람·주소·계좌는 노드 하나다.
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Me, R, err, orig};
use anyhow::{Result, ensure};
use axum::extract::{Path, Query};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};
use std::collections::HashMap;

pub const SCHEMA: &str = include_str!("../../db/02-대리점.surql");
/// 그래프에 적재하는 원본 파일
const FILES: [(&str, &str); 3] = [orig::AGENCY, orig::REBATE, orig::DEPOSIT];

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/dealers", get(list)).route("/dealers/{id}", get(detail)).route("/origin", get(origin))
}

/// 대리점 목록: 지금 등록된 대표자·주소·계좌
async fn list(Extension(me): Extension<Me>) -> R {
    // 지금 값: 오늘 유효한 선(13의 `fn::current`). 바뀌기 전의 값은 상세의 등록에 남는다
    let sql = "SELECT record::id(id) AS id, name, fn::current(id, '대표자').value AS rep, fn::current(id, '주소').value AS address, fn::current(id, '계좌').value AS account FROM dealer ORDER BY id;";
    Ok(Json(q1(&me.db, sql, json!({})).await?))
}

/// 대리점 상세: 등록(식별자와 변경일·다음 값으로 바뀐 날(`until`, 13)·인지일·경로)과 귀속월별 지급. 인지일이 없으면(null) 미상이다.
/// 지급의 `status`는 원본의 값, `state`·`state_source`는 이 앱이 준 지급의 상태와 그 출처(07. 없으면 아직 손대지 않은 지급),
/// `review`는 그 지급의 심사(09. 과거의 결정이거나 승인된 것. 심사를 기다리는 지급에는 없다)
async fn detail(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    // 선의 공통 열. $item은 화면의 이름표, 값은 가리키는 노드에서 꺼낸다
    let edge = |item: &str, table: &str, value: &str| {
        format!(
            "(SELECT '{item}' AS item, {value}, source, file.path AS file, row, time::format(since, '%Y-%m-%d') AS since, \
             IF until THEN time::format(until, '%Y-%m-%d') END AS until, IF known THEN time::format(known, '%Y-%m-%d') END AS known, via, excluded FROM {table} WHERE in = $d ORDER BY since)"
        )
    };
    let sql = format!(
        "LET $d = type::record('dealer', $id);
        RETURN {{
            dealer: (SELECT record::id(id) AS id, name, source, file.path AS file, row FROM $d)[0],
            registered: array::concat({}, {}, {}),
            payouts: (SELECT ym, amount, status, state, state_source, IF review THEN {{ id: record::id(review), name: review.name, marks: review.marks }} END AS review, source, file.path AS file, row FROM payout WHERE ->payout_of->dealer CONTAINS $d ORDER BY ym)
        }};",
        edge("대표자", "rep", "out.name AS value, out.same AS same"),
        edge("주소", "addr", "out.value AS value"),
        edge("계좌", "acct", "out.value AS value"),
    );
    let r = q1(&me.db, &sql, json!({ "id": id })).await?;
    if r["dealer"].is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    Ok(Json(r))
}

/// 출처 표지가 여는 것: 원본 파일의 한 행(머리글과 값 그대로)과 적재할 때 기록한 내용 해시
async fn origin(Extension(me): Extension<Me>, Query(p): Query<HashMap<String, String>>) -> R {
    let none = || err(StatusCode::NOT_FOUND, "없음");
    let file = p.get("file").ok_or_else(none)?;
    let row: usize = p.get("row").and_then(|r| r.parse().ok()).filter(|r| *r > 1).ok_or_else(none)?;
    let text = FILES.iter().find(|f| f.0 == file).ok_or_else(none)?.1;
    let line = text.lines().nth(row - 1).ok_or_else(none)?;
    let sha = q1(&me.db, "RETURN type::record('origin', $file).sha;", json!({ "file": file })).await?;
    let cells: Vec<[&str; 2]> = text.lines().next().unwrap_or_default().split('|').zip(line.split('|')).map(|(k, v)| [k, v]).collect();
    Ok(Json(json!({ "file": file, "row": row, "sha": sha, "cells": cells })))
}

pub async fn seed(db: &Db) -> Result<()> {
    let files: Vec<J> = FILES.iter().map(|f| json!({ "path": f.0, "sha": orig::sha(f.1) })).collect();
    q(db, "
        FOR $f IN $files { CREATE type::record('origin', $f.path) CONTENT $f; };
        LET $src = '원본';
        FOR $a IN $dealers {
            LET $d = type::record('dealer', $a.agency_id);
            LET $file = type::record('origin', $dealer_file);
            LET $day = <datetime> ($a.registered_date + 'T00:00:00Z');
            CREATE $d SET name = $a.agency_name, biz_no = $a.business_reg_no, eligible = $a.rebate_eligible = 'True', registered = $day, source = $src, file = $file, row = $a.row;
            LET $p = type::record('person', $a.representative_name);
            LET $ad = type::record('address', $a.address);
            LET $ac = type::record('account', $a.bank_account_no);
            UPSERT $p SET name = $a.representative_name, same = '미상', source = $src;
            UPSERT $ad SET value = $a.address, source = $src;
            UPSERT $ac SET value = $a.bank_account_no, source = $src;
            -- 원본에서 온 식별자: 변경일은 등록일, 인지일은 미상(없음), 경로는 원본
            LET $e = { since: $day, via: '원본', source: $src, file: $file, row: $a.row };
            RELATE $d->rep->$p CONTENT $e;
            RELATE $d->addr->$ad CONTENT $e;
            RELATE $d->acct->$ac CONTENT $e;
        };
        FOR $r IN $payouts {
            LET $p = type::record('payout', $r.rebate_id);
            CREATE $p SET ym = $r.period_ym, sales = <int> $r.sales_performance_krw, amount = <int> $r.rebate_amount_krw, status = $r.approval_status, approver = $r.approver,
                paid = IF $r.payment_date THEN <datetime> ($r.payment_date + 'T00:00:00Z') END, source = $src, file = type::record('origin', $payout_file), row = $r.row;
            RELATE $p->payout_of->(type::record('dealer', $r.agency_id)) SET source = $src;
        };
        FOR $c IN $deposits {
            LET $x = type::record('deposit', $c.deposit_id);
            LET $ac = type::record('account', $c.bank_account_no);
            CREATE $x SET date = <datetime> ($c.deposit_date + 'T00:00:00Z'), amount = <int> $c.amount_krw, ar = $c.matched_ar_id, source = $src, file = type::record('origin', $deposit_file), row = $c.row;
            UPSERT $ac SET value = $c.bank_account_no, source = $src;
            RELATE $x->deposit_of->(type::record('dealer', $c.agency_id)) SET source = $src;
            RELATE $x->deposit_into->$ac SET source = $src;
        };",
        json!({
            "files": files,
            "dealers": orig::csv(orig::AGENCY.1), "dealer_file": orig::AGENCY.0,
            "payouts": orig::csv(orig::REBATE.1), "payout_file": orig::REBATE.0,
            "deposits": orig::csv(orig::DEPOSIT.1), "deposit_file": orig::DEPOSIT.0,
        }),
    ).await?;
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let role = "영업지원";

    // 그래프의 모양(03번이 이 위에서 관련자를 계산한다): 대리점 50, 지급 240, 회수 32. 사람은 이름마다 하나(47), 주소 49, 계좌 49
    let n = q(&c.db, "
        RETURN [count(SELECT id FROM dealer), count(SELECT id FROM payout), count(SELECT id FROM deposit), count(SELECT id FROM person), count(SELECT id FROM address), count(SELECT id FROM account)];
        RETURN [count(SELECT id FROM rep), count(SELECT id FROM addr), count(SELECT id FROM acct), count(SELECT id FROM deposit_of), count(SELECT id FROM deposit_into), count(SELECT id FROM payout_of)];
        RETURN (SELECT status, count() AS n FROM payout GROUP BY status ORDER BY status);
        RETURN (SELECT VALUE same FROM person GROUP BY same);
        -- 같은 값은 같은 노드: 박상현을 대표자로 둔 대리점, 성일상사24의 회수가 들어간 계좌를 등록한 대리점
        RETURN (SELECT VALUE record::id(id) FROM person:`박상현`<-rep<-dealer ORDER BY id);
        RETURN array::sort(array::distinct((SELECT VALUE record::id(id) FROM dealer:`D-024`<-deposit_of<-deposit->deposit_into->account<-acct<-dealer)));
        -- 출처가 없는 기록, 원본의 선 가운데 변경일이 등록일이 아니거나 인지일이 있거나 경로가 원본이 아닌 것
        RETURN array::flatten(['dealer', 'person', 'address', 'account', 'payout', 'deposit', 'rep', 'addr', 'acct', 'deposit_of', 'deposit_into', 'payout_of'].map(|$t| (SELECT VALUE id FROM type::table($t) WHERE source != '원본')));
        RETURN array::flatten(['rep', 'addr', 'acct'].map(|$t| (SELECT VALUE id FROM type::table($t) WHERE since != in.registered OR known != NONE OR until != NONE OR via != '원본' OR excluded OR file = NONE OR row = NONE)));
        RETURN (SELECT VALUE id FROM dealer, payout, deposit WHERE file = NONE OR row = NONE);
    ", json!({})).await?;
    ensure!(n[0] == json!([50, 240, 32, 47, 49, 49]), "노드 수 {}", n[0]);
    ensure!(n[1] == json!([50, 50, 50, 32, 32, 240]), "선 수 {}", n[1]);
    ensure!(n[2] == json!([{ "status": "미지급", "n": 40 }, { "status": "반려", "n": 4 }, { "status": "승인", "n": 196 }]), "지급의 원본 상태 {}", n[2]);
    ensure!(n[3] == json!(["미상"]), "동일인 여부 {}", n[3]);
    ensure!(n[4] == json!(["D-011", "D-024", "D-037"]), "박상현 {}", n[4]);
    ensure!(n[5] == json!(["D-011", "D-037"]), "성일상사24의 회수가 들어간 계좌 {}", n[5]);
    ensure!(n[6] == json!([]), "출처 없는 기록 {}", n[6]);
    ensure!(n[7] == json!([]), "원본의 선 {}", n[7]);
    ensure!(n[8] == json!([]), "원본 행 없는 기록 {}", n[8]);

    // 목록: 50곳
    let list = c.get(role, "/api/dealers").await?;
    ensure!(list.as_array().is_some_and(|l| l.len() == 50), "목록");
    ensure!(list[33] == json!({ "id": "D-034", "name": "한라인상사34", "rep": ["박준호"], "address": ["대전시 중앙로 260"], "account": ["신한 971-13-131178"] }), "목록의 한 줄 {}", list[33]);

    // 상세: 등록(대표자·주소·계좌와 변경일·인지일·경로)과 귀속월별 지급
    let d = c.get(role, "/api/dealers/D-034").await?;
    ensure!(d["dealer"]["name"] == "한라인상사34");
    let file = "01_corevia/master/m_agency_cv.csv";
    let reg = |item: &str, value: &str| json!({ "item": item, "value": value, "source": "원본", "file": file, "row": 35, "since": "2021-08-13", "until": null, "known": null, "via": "원본", "excluded": false });
    let mut rep = reg("대표자", "박준호");
    rep["same"] = json!("미상");
    ensure!(d["registered"] == json!([rep, reg("주소", "대전시 중앙로 260"), reg("계좌", "신한 971-13-131178")]), "등록 {}", d["registered"]);
    let pay: Vec<(&str, i64, &str)> = d["payouts"].as_array().into_iter().flatten().filter_map(|p| Some((p["ym"].as_str()?, p["amount"].as_i64()?, p["status"].as_str()?))).collect();
    ensure!(
        pay == [("2026-01", 1231077, "승인"), ("2026-02", 1150157, "승인"), ("2026-03", 1134038, "승인"), ("2026-04", 740156, "승인"), ("2026-05", 1041976, "승인"), ("2026-06", 1353657, "미지급")],
        "지급 {pay:?}"
    );
    ensure!(d["payouts"][5]["source"] == "원본" && d["payouts"][5]["file"] == "01_corevia/sales/sales_rebate_payment_cv.csv" && d["payouts"][5]["row"] == 169, "지급의 출처 {}", d["payouts"][5]);

    // 스펙의 숫자: 박상현 그룹 세 곳의 1월분 합 4,870,186 (합산 자체는 뒤 티켓의 일이고 여기서는 적재가 맞는지만 본다)
    let mut jan = 0;
    for id in ["D-011", "D-024", "D-037"] {
        jan += c.get(role, &format!("/api/dealers/{id}")).await?["payouts"][0]["amount"].as_i64().unwrap_or(0);
    }
    ensure!(jan == 4_870_186, "1월분 합 {jan}");

    // 출처 표지를 누르면 원본 파일과 행이 열린다. 내용 해시는 `shasum -a 256`으로 따로 구한 값
    let o = c.get(role, "/api/origin?file=01_corevia/master/m_agency_cv.csv&row=35").await?;
    ensure!(o["row"] == 35 && o["cells"][0] == json!(["agency_id", "D-034"]) && o["cells"][2] == json!(["representative_name", "박준호"]) && o["cells"][7] == json!(["registered_date", "2021-08-13"]), "원본 행 {o}");
    ensure!(o["sha"] == "10b959e3d1f13987c5da1d6cc81172de881f43b6f94e2d72267aa1e8a3f7bcc7", "마스터의 해시 {}", o["sha"]);
    let o = c.get(role, "/api/origin?file=01_corevia/sales/sales_rebate_payment_cv.csv&row=169").await?;
    ensure!(o["cells"][0] == json!(["rebate_id", "RB-00168"]) && o["cells"][6] == json!(["approver", "NONE"]), "지급의 원본 행 {o}");
    ensure!(o["sha"] == "820a4e96e2ae06b361a9b39d3de428af1c43c0a659c41e2dbd25a9b41c490ac5");
    let o = c.get(role, "/api/origin?file=01_corevia/financials/fin_collection_history_cv.csv&row=2").await?;
    ensure!(o["sha"] == "65831ca36482ce21fa59ff7883ba64c15755280745fbf6bdc83562f7898be4fa" && o["cells"][0] == json!(["deposit_id", "DP-00001"]));
    for path in ["/api/dealers/D-999", "/api/origin?file=00_common/approval_authority_policy.md&row=2", "/api/origin?file=01_corevia/master/m_agency_cv.csv&row=52", "/api/origin?file=01_corevia/master/m_agency_cv.csv&row=1"] {
        let (code, _) = c.call(Some(c.token(role)), "GET", path, None).await?;
        ensure!(code == 404, "{path} → {code}");
    }

    // 모든 역할이 같은 것을 읽고, 어느 역할도 원본에서 온 기록을 고치지 못한다(권한은 DB가 강제)
    for (_, r) in crate::tickets::ROLES {
        ensure!(c.get(r, "/api/dealers/D-034").await? == d, "{r}의 상세");
        let s = as_user(&c.db, c.token(r)).await?;
        q(&s, "UPDATE dealer:`D-034` SET name = 'x'; UPDATE rep SET via = '신고'; DELETE payout; CREATE person:x SET name = 'x', same = 'x', source = 'x';", json!({})).await.ok();
    }
    ensure!(c.get(role, "/api/dealers/D-034").await? == d && c.get(role, "/api/dealers").await? == list, "역할이 원본 기록을 고침");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM person);", json!({})).await? == 47, "역할이 사람을 만듦");
    Ok(())
}
