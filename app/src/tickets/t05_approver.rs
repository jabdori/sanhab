//! 05 승인권자: 보류(조치 한 줄)와 사유의 규칙. 승인권자의 계산과 권한은 04에 있다.
//! 사유는 `{ class 분류, memo 메모 }`이고 규칙은 DB(`fn::reason`)가 강제한다: 필수이면 분류가 있어야 하고, 분류는 그 조치의 목록 안에서, 기타이면 메모까지.
//! 뒤 티켓은 조치를 만들 때 `reason`(필수) · `classes`(분류의 목록) · `need`(이 표시가 있으면 필수)를 함께 적는다.
use crate::check::Check;
use crate::db::{Db, q, q1};
use crate::{Me, R};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/05-승인권자.surql");

pub fn routes() -> Router<Db> {
    Router::new().route("/reviews/{id}/reasons", get(reasons))
}

/// 사유 칸이 쓰는 것: 지금 역할이 그 심사에 할 수 있는 조치마다 사유가 필수인지(`must`)와 고를 수 있는 분류(`classes`)
async fn reasons(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    Ok(Json(q1(&me.db, "
        LET $r = type::record('review', $id);
        RETURN SELECT record::id(id) AS kind, fn::must(record::id(id), $r) AS must, classes FROM act WHERE fn::can(record::id(id), $r) ORDER BY kind;", json!({ "id": id })).await?))
}

pub async fn seed(db: &Db) -> Result<()> {
    // 보류: 대기인 심사를 그 심사의 승인권자가(D8의 5). 사유 필수(D41). 승인의 사유는 선택이고 분류만 둔다
    q(db, "
        UPDATE act:`승인` SET classes = ['정상', '경미', '기일', '기타'];
        CREATE act:`보류` SET states = ['대기'], to = '보류', who = '승인권자', reason = true, classes = ['소명', '정황', '서류', '기타'];", json!({})).await?;
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec) = ("영업지원", "영업임원");
    let (one, group) = ("2026-06-D-001", "2026-06-D-011");
    let review = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}")).await;
    let decide = async |role: &str, id: &str, kind: &str, reason: J| Ok::<_, anyhow::Error>(c.post(role, "/api/decide", json!({ "ids": [id], "kind": kind, "reason": reason })).await?.0);
    let count = async || q1(&c.db, "RETURN [count(SELECT id FROM decision), count(SELECT id FROM task WHERE kind = '지급')];", json!({})).await;
    let (hold, pass) = (json!(["소명", "정황", "서류", "기타"]), json!(["정상", "경미", "기일", "기타"]));

    // 박상현 그룹의 6월 심사: 합산 3,888,097 · 한도 2,000,000 · 승인권자 영업임원. 일치 열에 대표자·주소·계좌 / 대표자·주소 / 대표자·계좌
    let d = review(support, group).await?;
    ensure!(d["review"]["total"] == 3_888_097 && d["review"]["limit"] == 2_000_000 && d["review"]["approver"] == exec && d["review"]["status"] == "대기", "그룹의 심사 {}", d["review"]);
    let got: Vec<&J> = d["members"].as_array().into_iter().flatten().map(|m| &m["match"]).collect();
    ensure!(json!(got) == json!([["대표자", "주소", "계좌"], ["대표자", "주소"], ["대표자", "계좌"]]), "일치 {got:?}");

    // 영업지원에게는 조치가 없고(화면은 `승인권자 영업임원`), 요청을 직접 보내도 거절된다
    ensure!(d["actions"] == json!([]) && d["history"] == json!([]), "영업지원의 조치 {}", d["actions"]);
    ensure!(c.get(support, &format!("/api/reviews/{group}/reasons")).await? == json!([]), "영업지원의 사유 칸");
    for (kind, reason) in [("승인", J::Null), ("보류", json!({ "class": "소명" })), ("보류", json!({ "class": "기타", "memo": "소명 대기" }))] {
        ensure!(decide(support, group, kind, reason).await? == 403, "영업지원의 {kind}");
    }

    // 영업임원은 승인 또는 보류를 고른다. 보류는 사유 필수, 승인은 선택. 분류는 조치마다 따로
    ensure!(review(exec, group).await?["actions"] == json!([{ "kind": "보류", "reason": true }, { "kind": "승인", "reason": false }]), "영업임원의 조치");
    let r = c.get(exec, &format!("/api/reviews/{group}/reasons")).await?;
    ensure!(r == json!([{ "kind": "보류", "must": true, "classes": hold }, { "kind": "승인", "must": false, "classes": pass }]), "사유 칸 {r}");

    // 사유의 규칙은 DB가 강제한다: 분류가 없는 보류, 목록에 없는 분류, 메모가 빈 기타는 거절되고 아무것도 바뀌지 않는다
    for (kind, reason) in [
        ("보류", J::Null), ("보류", json!({})), ("보류", json!({ "memo": "소명 대기" })), ("보류", json!({ "class": "" })),
        ("보류", json!({ "class": "정상" })), ("보류", json!({ "class": "기타" })), ("보류", json!({ "class": "기타", "memo": "  " })),
        ("승인", json!({ "class": "소명" })), ("승인", json!({ "class": "기타" })),
    ] {
        ensure!(decide(exec, group, kind, reason.clone()).await? == 403, "{kind} {reason}");
    }
    ensure!(review(exec, group).await?["review"]["status"] == "대기" && count().await? == json!([0, 0]), "거절 뒤");

    // 보류: 상태 보류, 굳지 않는다. 사유는 결정한 사람·날짜와 함께 남는다(선 13)
    ensure!(decide(exec, group, "보류", json!({ "class": "기타", "memo": "소명 대기" })).await? == 200, "보류");
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "보류" && d["review"]["fixed"].is_null(), "보류 뒤 {}", d["review"]);
    let mut h = d["history"].clone();
    h[0].as_object_mut().map(|o| o.remove("stamp"));
    ensure!(h == json!([{ "kind": "보류", "role": exec, "at": "2026-07-01", "reason": { "class": "기타", "memo": "소명 대기" }, "source": "시연" }]), "이력 {h}");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM decision)[0] = staff:exec;", json!({})).await? == true, "결정한 직원");
    // 보류는 지급 작업을 만들지 않고, 다시 계산해도 금액은 6월 합산에 그대로 남는다
    super::t04_review::recalc(&c.db).await?;
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "보류" && d["review"]["total"] == 3_888_097 && d["members"].as_array().is_some_and(|m| m.iter().all(|x| x["pay"]["amount"].is_i64())), "보류 뒤의 합산 {}", d["review"]);
    ensure!(count().await? == json!([1, 0]) && c.get("회계·자금", "/api/tasks").await?["mine"] == json!([]), "보류 뒤의 지급 작업");

    // 정황이 없는 심사의 승인에는 사유가 없어도 되고, 적으면 남는다. 영업지원도 자기가 승인권자인 심사는 보류할 수 있다
    ensure!(decide(support, one, "승인", J::Null).await? == 200 && review(support, one).await?["history"][0]["reason"].is_null(), "사유 없는 승인");
    ensure!(decide(support, "2026-06-D-004", "승인", json!({ "class": "정상" })).await? == 200, "사유를 적은 승인");
    ensure!(review(support, "2026-06-D-004").await?["history"][0]["reason"] == json!({ "class": "정상" }), "승인의 사유");
    ensure!(decide(support, "2026-06-D-008", "보류", J::Null).await? == 403 && decide(support, "2026-06-D-008", "보류", json!({ "class": "서류" })).await? == 200, "영업지원의 보류");
    // 영업임원의 승인: 한도가 1,500,000이 되어 영업임원에게 온 심사(D-018, 1,537,170)를 사유 없이 승인한다
    q(&c.db, "UPDATE rule:`한도-v1` SET value = 1500000;", json!({})).await?;
    super::t04_review::recalc(&c.db).await?;
    let big = "2026-06-D-018";
    ensure!(decide(support, big, "승인", J::Null).await? == 403 && decide(exec, big, "승인", J::Null).await? == 200, "영업임원의 승인");
    let d = review(exec, big).await?;
    ensure!(d["review"]["status"] == "승인" && d["review"]["fixed"] == "2026-07-01" && d["review"]["approver"] == exec, "승인 뒤 {}", d["review"]);

    // 11번이 켤 조건: 승인에 need = ['정황']을 두면 정황이 걸린 심사의 승인에만 사유가 필수가 된다
    let (flagged, plain) = ("2026-06-D-006", "2026-06-D-007");
    q(&c.db, "UPDATE act:`승인` SET need = ['정황']; UPDATE review:`2026-06-D-006` SET marks += '정황';", json!({})).await?;
    let must = async |id: &str| Ok::<_, anyhow::Error>(c.get(support, &format!("/api/reviews/{id}/reasons")).await?[1]["must"].clone());
    ensure!(must(flagged).await? == true && must(plain).await? == false, "정황이 걸린 심사의 사유");
    ensure!(decide(support, flagged, "승인", J::Null).await? == 403 && decide(support, flagged, "승인", json!({ "class": "경미" })).await? == 200, "정황이 걸린 심사의 승인");
    ensure!(decide(support, plain, "승인", J::Null).await? == 200, "정황이 없는 심사의 승인");
    Ok(())
}
