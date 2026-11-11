//! 13 변경: 영업지원이 대리점의 식별자 변경(항목, 새 값, 변경일)을 넣는다. 입력은 사건으로 남고(`incident`), DB의 이벤트가 선 1~3을 바꾼다(이전 값은 변경일 전날까지 유효로 남는다).
//! 그 뒤 코드가 심사(04 `recalc`) → 재검토와 추인 묶음(09 `remark`) → 정황(11 `detect`)을 다시 계산한다. 인지일은 시스템의 오늘, 경로는 신고, 출처는 시연이다(D15, D30).
use super::t04_review::recalc;
use super::t09_again::remark;
use super::t11_signal::detect;
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, attempt, refuse};
use anyhow::{Result, ensure};
use axum::extract::State;
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/13-변경.surql");

pub fn routes() -> Router<Db> {
    Router::new().route("/change", get(can).post(change))
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
async fn change(State(db): State<Db>, Extension(me): Extension<Me>, Body(b): Body) -> R {
    let text = |k: &str| b[k].as_str().map(str::trim).filter(|v| !v.is_empty());
    let (Some(id), Some(item), Some(value), Some(since)) = (text("id"), text("item"), text("value"), text("since").filter(|s| day(s))) else {
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
    recalc(&db).await?;
    remark(&db).await?;
    detect(&db).await?;
    Ok(Json(json!({ "id": made[0] })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
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
    // 11 정황: 동명(박준호)은 같은 그룹이 되어 새로 잡히지 않지만, 이미 접수된 정황은 그대로 열려 있어 합쳐진 심사에 정황 표시가 남는다(어떻게 할지는 유저의 결정을 기다린다)
    let sig = q1(&c.db, "RETURN signal:`동명-박준호`.state;", json!({})).await?;
    ensure!(sig == "접수" && rows(&r["review"]["marks"]).contains(&json!("정황")), "동명 정황 {sig} {}", r["review"]["marks"]);

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
