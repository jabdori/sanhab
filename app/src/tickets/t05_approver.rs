//! 05 승인권자: 보류(조치 한 줄)와 사유의 규칙. 승인권자의 계산과 권한은 04에 있다.
//! 사유는 `{ class 분류, memo 메모 }`이고 규칙은 DB(`fn::reason`)가 강제한다: 필수이면 분류가 있어야 하고, 분류는 그 조치의 목록 안에서, 기타이면 메모까지.
//! 뒤 티켓은 조치를 만들 때 `reason`(필수) · `classes`(분류의 목록) · `over`(심사의 상태에 따라 바뀌는 목록) · `need`(심사가 이 상태·표시이면 필수)를 함께 적는다.
use crate::check::Check;
use crate::db::{Db, q, q1};
use anyhow::{Result, ensure};
use axum::Router;
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/05-승인권자.surql");

/// 05가 더하는 경로는 없다. 사유의 필수 여부와 분류는 심사 상세(04)의 `actions`에 실려 간다
pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new()
}

pub async fn seed(db: &Db) -> Result<()> {
    // 보류: 대기인 심사를 그 심사의 승인권자가(D8의 5). 사유 필수(D41).
    // 승인: 보류된 심사도 승인권자가 언제든 승인할 수 있고 그때는 사유가 필수다(D48). 대기인 심사의 승인은 사유가 선택이다
    q(db, "
        UPDATE act:`승인` SET seq = 1, states = ['대기', '보류'], need = ['보류'], classes = ['정상', '경미', '기타'], over = { '보류': ['예외', '소명', '기타'] };
        CREATE act:`보류` SET seq = 2, states = ['대기'], to = '보류', who = '승인권자', reason = true, classes = ['소명', '정황', '서류', '기타'];", json!({})).await?;
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec) = ("영업지원", "영업임원");
    let (one, group) = ("2026-06-D-001", "2026-06-D-011");
    let review = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}")).await;
    // 조치의 결과: 되면 "", 거절되면 그 낱말(권한은 403, 사유·상태·대상은 400이고 본문은 낱말뿐이다)
    let decide = async |role: &str, id: &str, kind: &str, reason: J| {
        let (code, r) = c.post(role, "/api/decide", json!({ "ids": [id], "kind": kind, "reason": reason })).await?;
        let word = r["error"].as_str().unwrap_or("").to_string();
        ensure!(if code == 200 { word.is_empty() } else { r == json!({ "error": word }) && code == if word == "권한" { 403 } else { 400 } && ["권한", "사유", "상태", "대상"].contains(&word.as_str()) }, "거절의 꼴 {code} {r}");
        Ok(word)
    };
    let count = async || q1(&c.db, "RETURN [count(SELECT id FROM decision WHERE source != '원본'), count(SELECT id FROM task WHERE kind = '지급')];", json!({})).await;
    let (hold, pass) = (json!(["소명", "정황", "서류", "기타"]), json!(["정상", "경미", "기타"]));

    // 박상현 그룹의 6월 심사: 합산 3,888,097 · 한도 2,000,000 · 승인권자 영업임원. 일치 열에 대표자·주소·계좌 / 대표자·주소 / 대표자·계좌
    let d = review(support, group).await?;
    ensure!(d["review"]["total"] == 3_888_097 && d["review"]["limit"] == 2_000_000 && d["review"]["approver"] == exec && d["review"]["status"] == "대기", "그룹의 심사 {}", d["review"]);
    let got: Vec<&J> = d["members"].as_array().into_iter().flatten().map(|m| &m["match"]).collect();
    ensure!(json!(got) == json!([["대표자", "주소", "계좌"], ["대표자", "주소"], ["대표자", "계좌"]]), "일치 {got:?}");

    // 영업지원에게는 조치가 없고(화면은 `승인권자 영업임원`), 요청을 직접 보내도 거절된다
    ensure!(d["actions"] == json!([]) && d["history"] == json!([]), "영업지원의 조치 {}", d["actions"]);
    for (kind, reason) in [("승인", J::Null), ("보류", json!({ "class": "소명" })), ("보류", json!({ "class": "기타", "memo": "소명 대기" }))] {
        ensure!(decide(support, group, kind, reason).await? == "권한", "영업지원의 {kind}");
    }

    // 영업임원은 승인 또는 보류를 고른다. 보류는 사유 필수. 이 심사에는 정황이 걸려 있어(11) 승인도 사유 필수다. 분류는 조치마다 따로
    let r = review(exec, group).await?["actions"].clone();
    // 버튼의 순서는 조치의 seq: 승인, 보류
    ensure!(r[0] == json!({ "kind": "승인", "reason": true, "classes": pass, "seq": 1 }) && r[1] == json!({ "kind": "보류", "reason": true, "classes": hold, "seq": 2 }), "영업임원의 조치 {r}");

    // 사유의 규칙은 DB가 강제한다: 분류가 없는 보류, 목록에 없는 분류, 메모가 빈 기타는 거절되고 아무것도 바뀌지 않는다
    for (kind, reason) in [
        ("보류", J::Null), ("보류", json!({})), ("보류", json!({ "memo": "소명 대기" })), ("보류", json!({ "class": "" })),
        ("보류", json!({ "class": "정상" })), ("보류", json!({ "class": "기타" })), ("보류", json!({ "class": "기타", "memo": "  " })),
        ("승인", json!({ "class": "서류" })), ("승인", json!({ "class": "예외" })), ("승인", json!({ "class": "기타" })),
    ] {
        ensure!(decide(exec, group, kind, reason.clone()).await? == "사유", "{kind} {reason}");
    }
    ensure!(review(exec, group).await?["review"]["status"] == "대기" && count().await? == json!([0, 0]), "거절 뒤");

    // 없는 심사·없는 조치는 대상. 권한이 없으면 사유나 상태가 틀려도 권한이다
    ensure!(decide(exec, "2026-06-D-999", "보류", json!({ "class": "소명" })).await? == "대상" && decide(exec, group, "통과", J::Null).await? == "대상", "없는 대상");
    ensure!(c.post(exec, "/api/decide", json!({ "ids": "x" })).await? == (400, json!({ "error": "대상" })), "틀린 꼴");
    // JSON이 아닌 본문, 빈 본문, Content-Type 없는 요청도 400 `대상`이고(서버의 문장이 나가지 않는다) 아무것도 바뀌지 않는다. 본문을 받는 다른 경로도 같다
    let good = r#"{"ids":["2026-06-D-011"],"kind":"승인"}"#;
    for (path, body, kind) in [("/api/decide", "승인", Some("application/json")), ("/api/decide", "", Some("application/json")), ("/api/decide", "{", None), ("/api/decide", "ids=x", Some("text/plain")), ("/api/pay", "", None), ("/api/enter", "x", None)] {
        ensure!(c.raw(exec, path, body, kind).await? == (400, json!({ "error": "대상" })), "틀린 본문 {path} {body:?}");
    }
    // 꼴이 맞는 JSON은 Content-Type이 없어도 읽는다
    ensure!(c.raw(support, "/api/decide", good, None).await? == (403, json!({ "error": "권한" })), "Content-Type 없는 JSON");
    ensure!(review(exec, group).await?["review"]["status"] == "대기" && count().await? == json!([0, 0]), "틀린 본문 뒤");

    // 보류: 상태 보류, 굳지 않는다. 사유는 결정한 사람·날짜와 함께 남는다(선 13)
    ensure!(decide(exec, group, "보류", json!({ "class": "기타", "memo": "소명 대기" })).await? == "", "보류");
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "보류" && d["review"]["fixed"].is_null(), "보류 뒤 {}", d["review"]);
    let mut h = d["history"].clone();
    h[0].as_object_mut().map(|o| o.remove("stamp"));
    ensure!(h == json!([{ "kind": "보류", "role": exec, "at": "2026-07-01", "reason": { "class": "기타", "memo": "소명 대기" }, "source": "시연" }]), "이력 {h}");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM decision WHERE source != '원본')[0] = staff:exec;", json!({})).await? == true, "결정한 직원");
    // 보류는 지급 작업을 만들지 않고, 다시 계산해도 금액은 6월 합산에 그대로 남는다
    super::t04_review::recalc(&c.db).await?;
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "보류" && d["review"]["total"] == 3_888_097 && d["members"].as_array().is_some_and(|m| m.iter().all(|x| x["pays"][0]["amount"].is_i64())), "보류 뒤의 합산 {}", d["review"]);
    ensure!(count().await? == json!([1, 0]) && c.get("회계·자금", "/api/tasks").await? == json!({ "mine": [], "going": [] }), "보류 뒤의 지급 작업");

    // 보류한 동안 그 심사의 작업은 승인권자의 진행에 놓인다(D48). 영업지원에게는 그대로 진행이고, 진행에서도 열어서 조치할 수 있다
    let has = |t: &J, k: &str| t[k].as_array().is_some_and(|l| l.iter().any(|x| x["target"] == group));
    let (te, ts) = (c.get(exec, "/api/tasks").await?, c.get(support, "/api/tasks").await?);
    ensure!(has(&te, "going") && !has(&te, "mine") && has(&ts, "going") && !has(&ts, "mine"), "보류 뒤의 목록 {}", te["mine"]);
    // 보류된 심사는 승인권자가 언제든 승인할 수 있고, 그 승인에는 사유가 필수다(D48). 승인하면 굳고 작업이 끝난다
    // 분류는 예외(소명 결과 전) · 소명(결과를 본 뒤) · 기타뿐이고, 대기인 심사의 분류(정상)는 고를 수 없다
    ensure!(review(exec, group).await?["actions"][0] == json!({ "kind": "승인", "reason": true, "classes": ["예외", "소명", "기타"], "seq": 1 }), "보류된 심사의 조치");
    ensure!(review(support, group).await?["actions"] == json!([]), "보류된 심사의 영업지원");
    for reason in [J::Null, json!({ "class": "정상" }), json!({ "class": "서류" }), json!({ "class": "기타" })] {
        ensure!(decide(exec, group, "승인", reason.clone()).await? == "사유", "보류된 심사의 승인 {reason}");
    }
    ensure!(decide(support, group, "승인", json!({ "class": "예외" })).await? == "권한" && decide(exec, group, "보류", json!({ "class": "소명" })).await? == "상태", "보류된 심사의 다른 조치");
    ensure!(decide(exec, group, "승인", json!({ "class": "예외", "memo": "지급 기일" })).await? == "", "보류된 심사의 승인");
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "승인" && d["review"]["fixed"] == "2026-07-01" && d["review"]["total"] == 3_888_097 && d["actions"] == json!([]), "보류를 푼 뒤 {}", d["review"]);
    ensure!(d["history"][1]["kind"] == "승인" && d["history"][1]["reason"] == json!({ "class": "예외", "memo": "지급 기일" }) && d["history"].as_array().is_some_and(|h| h.len() == 2), "보류를 푼 이력 {}", d["history"]);
    // 승인 결정은 그 보류 결정에 이어진다(선 30). 처음 결정에는 앞이 없다
    let link = q1(&c.db, "LET $d = (SELECT id, kind, prev, stamp FROM decision WHERE review = review:`2026-06-D-011` ORDER BY stamp); RETURN [$d[0].prev, $d[1].prev = $d[0].id, $d[0].kind];", json!({})).await?;
    ensure!(link == json!([null, true, "보류"]), "결정의 이어짐 {link}");
    ensure!(q1(&c.db, "RETURN task:`2026-06-D-011`.state;", json!({})).await? == "완료" && !has(&c.get(exec, "/api/tasks").await?, "going"), "보류를 푼 뒤의 작업");

    // 정황이 없는 심사의 승인에는 사유가 없어도 되고, 적으면 남는다. 영업지원도 자기가 승인권자인 심사는 보류할 수 있다
    ensure!(decide(support, one, "승인", J::Null).await? == "" && review(support, one).await?["history"][0]["reason"].is_null(), "사유 없는 승인");
    ensure!(decide(support, "2026-06-D-004", "승인", json!({ "class": "정상" })).await? == "", "사유를 적은 승인");
    ensure!(review(support, "2026-06-D-004").await?["history"][0]["reason"] == json!({ "class": "정상" }), "승인의 사유");
    ensure!(decide(support, "2026-06-D-008", "보류", J::Null).await? == "사유" && decide(support, "2026-06-D-008", "보류", json!({ "class": "서류" })).await? == "", "영업지원의 보류");
    // 영업지원이 보류한 줄은 진행에 놓이고 선택 칸이 없다(여러 개 승인은 담당의 대기인 줄만). 섞어 보내도 거절된다
    let t = c.get(support, "/api/tasks").await?;
    let row = t["going"].as_array().into_iter().flatten().find(|x| x["target"] == "2026-06-D-008").cloned().unwrap_or_default();
    ensure!(row["pick"] == false && row["state"] == "진행" && t["mine"].as_array().is_some_and(|l| l.iter().all(|x| x["pick"] == !x["marks"].as_array().is_some_and(|m| m.contains(&json!("정황"))) && x["target"] != "2026-06-D-008")), "보류한 줄의 선택 칸 {row}");
    ensure!(c.post(support, "/api/decide", json!({ "ids": ["2026-06-D-007", "2026-06-D-008"], "kind": "승인" })).await? == (400, json!({ "error": "사유" })), "보류한 줄을 섞은 선택");
    ensure!(review(support, "2026-06-D-007").await?["review"]["status"] == "대기", "섞은 선택 뒤");
    // 영업임원의 승인: 한도가 1,500,000이 되어 영업임원에게 온 심사(D-018, 1,537,170)를 사유 없이 승인한다
    q(&c.db, "UPDATE rule:`한도-v1` SET value = 1500000;", json!({})).await?;
    super::t04_review::recalc(&c.db).await?;
    let big = "2026-06-D-018";
    ensure!(decide(support, big, "승인", J::Null).await? == "권한" && decide(exec, big, "승인", J::Null).await? == "", "영업임원의 승인");
    let d = review(exec, big).await?;
    ensure!(d["review"]["status"] == "승인" && d["review"]["fixed"] == "2026-07-01" && d["review"]["approver"] == exec, "승인 뒤 {}", d["review"]);

    // 11번이 켠 조건(승인의 need에 '정황'): 정황이 걸린 심사(금강상사41 — 동명)의 승인에만 사유가 필수다
    let (flagged, plain) = ("2026-06-D-041", "2026-06-D-007");
    let must = async |id: &str| Ok::<_, anyhow::Error>(review(support, id).await?["actions"][0]["reason"].clone());
    ensure!(must(flagged).await? == true && must(plain).await? == false, "정황이 걸린 심사의 사유");
    ensure!(decide(support, flagged, "승인", J::Null).await? == "사유" && decide(support, flagged, "승인", json!({ "class": "경미" })).await? == "", "정황이 걸린 심사의 승인");
    ensure!(decide(support, plain, "승인", J::Null).await? == "", "정황이 없는 심사의 승인");

    // 같은 심사에 승인 셋을 동시에 보내면 하나만 되고, 진 쪽의 낱말은 언제나 상태다(이미 승인된 심사). 남은 대기 심사 여럿으로 되풀이해 본다
    let left: Vec<String> = serde_json::from_value(q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM review WHERE status = '대기' AND approver = '영업지원' AND '정황' NOTINSIDE marks LIMIT 10);", json!({})).await?)?;
    ensure!(left.len() >= 8, "남은 대기 심사 {}", left.len());
    for id in &left {
        let all = tokio::join!(decide(support, id, "승인", J::Null), decide(support, id, "승인", J::Null), decide(support, id, "승인", J::Null));
        let mut got = [all.0?, all.1?, all.2?];
        got.sort();
        ensure!(got == ["", "상태", "상태"] && review(support, id).await?["history"].as_array().is_some_and(|h| h.len() == 1), "동시에 보낸 승인 {id} {got:?}");
    }
    Ok(())
}
