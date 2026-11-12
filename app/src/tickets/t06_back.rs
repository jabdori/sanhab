//! 06 반려: 반려(조치 한 줄)와 재상신. 승인권자가 반려하면 영업지원에 재상신 작업이 생기고(이벤트 `t06_task`), 영업지원이 재상신하면 심사가 대기로 돌아간다(D42).
//! 재상신은 역할의 세션으로 `resubmit`을 만드는 것이고, 누가 할 수 있는지는 DB(`fn::resubmittable`)가 정한다. 사유가 필수다(D55). 결정이 아니므로 재상신 뒤의 결정은 그 반려 결정에 이어진다(선 30).
use crate::check::Check;
use crate::db::{Db, q, q1};
use crate::{Body, Me, R, refuse};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/06-반려.surql");

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/reviews/{id}/resubmit", get(state)).route("/resubmit", post(resubmit))
}

/// 지금 역할이 그 심사를 재상신할 수 있는지(`can`), 재상신의 사유에 고를 수 있는 분류(`classes`)와 이력(`lines`: 결정과 재상신을 일어난 순서대로. 줄의 꼴은 04의 `history`와 같다. 13(D56): 그룹이 바뀌어 옮겨 온 옛 심사의 줄도 들고, 그 줄에는 옛 심사의 이름 `was`가 있다)
async fn state(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "
        LET $r = type::record('review', $id);
        LET $all = array::concat(
            (SELECT kind, role, IF at THEN time::format(at, '%Y-%m-%d') END AS at, reason, source, stamp, was FROM decision WHERE review = $r OR moved = $r),
            (SELECT '재상신' AS kind, role, time::format(at, '%Y-%m-%d') AS at, reason, source, stamp, was FROM resubmit WHERE review = $r OR moved = $r));
        RETURN { can: fn::resubmittable($r), classes: fn::resubmit_classes(), lines: (SELECT * FROM $all ORDER BY stamp) };", json!({ "id": id })).await?;
    Ok(Json(r))
}

/// 재상신: `{ id, reason }`. 쓰기 전에 거절의 낱말을 정해 돌려주고(`refuse`: 대상 → 권한 → 상태 → 사유), 역할의 세션으로 `resubmit`을 만든다. DB의 권한 규칙은 마지막 방어선이다
async fn resubmit(Extension(me): Extension<Me>, Body(b): Body) -> R {
    let bad = || refuse("대상");
    let id = b["id"].as_str().filter(|i| !i.is_empty()).ok_or_else(bad)?;
    let mut vars = json!({ "id": id });
    if b["reason"].is_object() {
        vars["reason"] = b["reason"].clone();
    }
    let word = async || q1(&me.db, "
        LET $r = type::record('review', $id);
        RETURN IF $r.id = NONE THEN '대상' ELSE IF $auth.role != '영업지원' THEN '권한' ELSE IF !fn::resubmittable($r) THEN '상태'
            ELSE IF !fn::reason(true, fn::resubmit_classes(), $reason) THEN '사유' END;", vars.clone()).await.map_err(|_| bad());
    if let Some(w) = word().await?.as_str() {
        return Err(refuse(w));
    }
    let made = q1(&me.db, "CREATE resubmit SET review = type::record('review', $id), reason = $reason RETURN VALUE record::id(review);", vars.clone()).await;
    if made.as_ref().ok().and_then(J::as_array).is_none_or(Vec::is_empty) {
        // 그 사이에 다른 재상신이 먼저 됐으면(동시에 보낸 재상신) 다시 따진 낱말(상태)을 돌려준다
        return Err(refuse(word().await?.as_str().unwrap_or("권한")));
    }
    Ok(Json(json!({ "id": id })))
}

pub async fn seed(db: &Db) -> Result<()> {
    // 반려: 대기이거나 보류된 심사를 그 심사의 승인권자가(D8의 5, D48). 사유 필수(D41). 굳지 않는다
    q(db, "CREATE act:`반려` SET seq = 3, states = ['대기', '보류'], to = '반려', who = '승인권자', reason = true, classes = ['서류', '금액', '정황', '기타'];", json!({})).await?;
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, acct) = ("영업지원", "영업임원", "회계·자금");
    let (one, group) = ("2026-06-D-001", "2026-06-D-011");
    let review = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}")).await;
    let state = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}/resubmit")).await;
    // 조치의 결과: 되면 "", 거절되면 그 낱말(권한은 403, 나머지는 400이고 본문은 낱말뿐이다)
    let word = |(code, r): (u16, J)| -> Result<String> {
        let w = r["error"].as_str().unwrap_or("").to_string();
        ensure!(if code == 200 { w.is_empty() } else { r == json!({ "error": w }) && code == if w == "권한" { 403 } else { 400 } }, "거절의 꼴 {code} {r}");
        Ok(w)
    };
    let decide = async |role: &str, id: &str, kind: &str, reason: J| word(c.post(role, "/api/decide", json!({ "ids": [id], "kind": kind, "reason": reason })).await?);
    let fix = json!({ "class": "서류", "memo": "계약서 첨부" });
    let again = async |role: &str, id: &str| word(c.post(role, "/api/resubmit", json!({ "id": id, "reason": &fix })).await?);
    // 그 역할의 목록(mine·going)에서 그 심사를 가리키는 줄의 종류들
    let kinds = async |role: &str, list: &str, id: &str| -> Result<Vec<String>> {
        let t = c.get(role, "/api/tasks").await?;
        Ok(t[list].as_array().into_iter().flatten().filter(|x| x["target"] == id).filter_map(|x| x["kind"].as_str().map(String::from)).collect())
    };
    let pays = async || q1(&c.db, "RETURN count(SELECT id FROM task WHERE kind = '지급' AND target.review = review:`2026-06-D-011`);", json!({})).await;
    let names = |d: &J| d["lines"].as_array().into_iter().flatten().filter_map(|l| l["kind"].as_str().map(String::from)).collect::<Vec<_>>();

    // 영업임원의 조치: 승인, 보류, 반려 순. 반려는 사유 필수이고 분류는 서류·금액·정황·기타
    let a = review(exec, group).await?["actions"].clone();
    ensure!(a[2] == json!({ "kind": "반려", "reason": true, "classes": ["서류", "금액", "정황", "기타"], "seq": 3 }) && a[0]["kind"] == "승인" && a[1]["kind"] == "보류", "영업임원의 조치 {a}");
    // 반려에는 사유의 분류가 필수다: 없거나, 목록에 없는 분류이거나, 메모가 빈 기타는 거절된다. 승인권자가 아니면 권한
    for reason in [J::Null, json!({ "memo": "서류 누락" }), json!({ "class": "정상" }), json!({ "class": "기타" })] {
        ensure!(decide(exec, group, "반려", reason.clone()).await? == "사유", "반려 {reason}");
    }
    ensure!(decide(support, group, "반려", json!({ "class": "서류" })).await? == "권한" && review(exec, group).await?["review"]["status"] == "대기", "영업지원의 반려");

    // 반려: 상태 반려, 굳지 않는다. 합산 3,888,097과 승인권자 영업임원은 그대로이고 다시 계산해도 같다. 지급 작업은 생기지 않는다
    let why = json!({ "class": "서류", "memo": "계약서 누락" });
    ensure!(decide(exec, group, "반려", why.clone()).await? == "", "반려");
    super::t04_review::recalc(&c.db).await?;
    let d = review(support, group).await?;
    ensure!(d["review"]["status"] == "반려" && d["review"]["fixed"].is_null() && d["review"]["total"] == 3_888_097 && d["review"]["approver"] == exec, "반려 뒤 {}", d["review"]);
    ensure!(pays().await? == 0, "반려 뒤의 지급 작업");
    // 영업지원의 담당에 재상신 작업이 생기고(대상은 그 심사), 반려한 영업임원은 진행에서 본다. 심사 작업은 어느 목록에도 없다
    let t = c.get(support, "/api/tasks").await?;
    let row = t["mine"].as_array().into_iter().flatten().find(|x| x["target"] == group).cloned().unwrap_or_default();
    ensure!(row["kind"] == "재상신" && row["view"] == "심사" && row["name"] == "금강상사11 외 2" && row["total"] == 3_888_097 && row["role"] == support && row["pick"] == false, "재상신 작업 {row}");
    ensure!(kinds(support, "mine", group).await? == ["재상신"] && kinds(support, "going", group).await?.is_empty(), "영업지원의 목록");
    ensure!(kinds(exec, "going", group).await? == ["재상신"] && kinds(exec, "mine", group).await?.is_empty(), "영업임원의 목록");
    // 그 작업을 열면(심사 상세) 반려 사유가 보인다. 영업지원에게 재상신이 열려 있고, 반려한 쪽에는 조치가 없다
    ensure!(d["history"][0]["kind"] == "반려" && d["history"][0]["reason"] == why && d["history"][0]["role"] == exec && d["actions"] == json!([]), "반려 사유 {}", d["history"]);
    ensure!(state(support, group).await?["can"] == true && state(exec, group).await?["can"] == false && review(exec, group).await?["actions"] == json!([]), "재상신할 수 있는 역할");

    // 재상신은 영업지원만. 없는 심사·틀린 꼴은 대상
    ensure!(again(exec, group).await? == "권한" && again(acct, group).await? == "권한" && again(support, "2026-06-D-999").await? == "대상", "재상신의 거절");
    ensure!(c.post(support, "/api/resubmit", json!({ "id": 1 })).await? == (400, json!({ "error": "대상" })) && c.raw(support, "/api/resubmit", "", None).await? == (400, json!({ "error": "대상" })), "틀린 본문");
    ensure!(again(support, one).await? == "상태", "반려되지 않은 심사의 재상신");
    // 재상신에도 사유의 분류가 필수다(D55): 없거나, 재상신의 분류(서류·금액·소명·기타)가 아니거나, 메모가 빈 기타는 거절되고 심사는 반려 그대로다
    let s = state(support, group).await?;
    ensure!(s["classes"] == json!(["서류", "금액", "소명", "기타"]), "재상신의 분류 {s}");
    for reason in [J::Null, json!({}), json!({ "memo": "첨부" }), json!({ "class": "정황" }), json!({ "class": "기타", "memo": " " })] {
        ensure!(word(c.post(support, "/api/resubmit", json!({ "id": group, "reason": reason })).await?)? == "사유", "재상신 {reason}");
    }
    ensure!(review(support, group).await?["review"]["status"] == "반려" && kinds(support, "mine", group).await? == ["재상신"], "거절된 재상신 뒤");
    // 재상신: 심사가 대기로 돌아가고 영업임원의 담당에 다시 나타난다. 합산과 승인권자는 그대로다. 재상신 작업은 끝난다
    ensure!(again(support, group).await? == "", "재상신");
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "대기" && d["review"]["fixed"].is_null() && d["review"]["total"] == 3_888_097 && d["review"]["approver"] == exec && d["actions"].as_array().is_some_and(|a| a.len() == 3), "재상신 뒤 {}", d["review"]);
    ensure!(kinds(exec, "mine", group).await? == ["심사"] && kinds(exec, "going", group).await?.is_empty(), "재상신 뒤 영업임원의 목록");
    ensure!(kinds(support, "mine", group).await?.is_empty() && kinds(support, "going", group).await? == ["심사"], "재상신 뒤 영업지원의 목록");
    ensure!(again(support, group).await? == "상태" && state(support, group).await?["can"] == false, "대기인 심사의 재상신");
    // 반려 기록과 사유는 남는다. 이력은 결정과 재상신을 일어난 순서대로
    let s = state(exec, group).await?;
    ensure!(names(&s) == ["반려", "재상신"] && s["lines"][0]["reason"] == why && s["lines"][1]["role"] == support && s["lines"][1]["reason"] == fix && s["lines"][1]["at"] == "2026-07-01" && s["lines"][1]["source"] == "시연", "이력 {}", s["lines"]);

    // 다시 반려 → 다시 재상신 → 승인. 결정은 바로 앞의 결정에 이어진다(선 30): 둘째 반려 → 첫 반려, 재상신 뒤의 승인 → 둘째 반려
    ensure!(decide(exec, group, "반려", json!({ "class": "금액" })).await? == "" && kinds(support, "mine", group).await? == ["재상신"], "둘째 반려");
    ensure!(again(support, group).await? == "" && decide(exec, group, "승인", json!({ "class": "경미" })).await? == "", "재상신 뒤의 승인");
    let link = q1(&c.db, "LET $d = (SELECT id, kind, prev, stamp FROM decision WHERE review = review:`2026-06-D-011` ORDER BY stamp);
        RETURN [$d.kind, $d[0].prev, $d[1].prev = $d[0].id, $d[2].prev = $d[1].id];", json!({})).await?;
    ensure!(link == json!([["반려", "반려", "승인"], null, true, true]), "결정의 이어짐 {link}");
    let d = review(exec, group).await?;
    ensure!(names(&state(exec, group).await?) == ["반려", "재상신", "반려", "재상신", "승인"] && d["history"].as_array().is_some_and(|h| h.len() == 3), "이력의 순서");
    ensure!(d["review"]["status"] == "승인" && d["review"]["fixed"] == "2026-07-01" && d["review"]["total"] == 3_888_097 && kinds(support, "mine", group).await?.is_empty() && kinds(exec, "mine", group).await?.is_empty(), "승인 뒤 {}", d["review"]);
    // 승인 뒤에는 지급으로 이어진다: 지급 작업 3건 → 지급으로 표시하면 이체 → 성공한 회신에 완료(D54)
    ensure!(pays().await? == 3, "승인 뒤의 지급 작업");
    let t = c.get(acct, "/api/tasks").await?;
    let p = t["mine"][0]["target"].as_str().unwrap_or("").to_string();
    let want = c.get(acct, &format!("/api/pays/{p}/recon")).await?["want"].clone();
    ensure!(c.post(acct, "/api/pay", json!({ "id": p })).await?.0 == 200 && c.get(acct, &format!("/api/pays/{p}")).await?["pay"]["state"] == "이체", "지급");
    ensure!(c.post(acct, "/api/reply", json!({ "id": p, "amount": want["amount"], "account": want["accounts"][0], "result": "성공" })).await?.0 == 200, "회신");
    ensure!(c.get(acct, &format!("/api/pays/{p}")).await?["pay"]["state"] == "완료", "회신 뒤의 지급");

    // 영업지원도 자기가 승인권자인 심사는 반려한다. 재상신도 자기 담당이고, 돌아온 심사에는 선택 칸이 다시 있다(05의 조건 그대로)
    ensure!(decide(support, one, "반려", json!({ "class": "기타", "memo": "매출 확인" })).await? == "" && kinds(support, "mine", one).await? == ["재상신"], "영업지원의 반려");
    ensure!(again(support, one).await? == "", "영업지원의 재상신");
    let t = c.get(support, "/api/tasks").await?;
    let row = t["mine"].as_array().into_iter().flatten().find(|x| x["target"] == one).cloned().unwrap_or_default();
    ensure!(row["kind"] == "심사" && row["pick"] == true && row["total"] == 988_932, "돌아온 줄 {row}");
    ensure!(c.post(support, "/api/decide", json!({ "ids": [one, "2026-06-D-004"], "kind": "승인" })).await?.0 == 200, "돌아온 심사를 섞은 선택 승인");
    // 보류된 심사도 승인권자가 반려할 수 있다(D48). 진행에 있던 심사 작업이 닫히고 재상신 작업이 생긴다
    let held = "2026-06-D-008";
    ensure!(decide(support, held, "보류", json!({ "class": "서류" })).await? == "" && decide(support, held, "반려", json!({ "class": "정황" })).await? == "", "보류된 심사의 반려");
    ensure!(review(support, held).await?["review"]["status"] == "반려" && kinds(support, "mine", held).await? == ["재상신"] && kinds(support, "going", held).await?.is_empty(), "보류된 심사의 반려 뒤");

    // 같은 심사에 재상신 둘을 동시에 보내면 하나만 되고, 진 쪽의 낱말은 상태다
    let both = tokio::join!(again(support, held), again(support, held));
    let mut got = [both.0?, both.1?];
    got.sort();
    ensure!(got == ["", "상태"] && names(&state(support, held).await?) == ["보류", "반려", "재상신"], "동시에 보낸 재상신 {got:?}");

    // 원본의 과거 반려(09): 재상신 작업이 생기지 않았고 재상신할 수도 없다
    let old = q1(&c.db, "RETURN { ids: (SELECT VALUE record::id(id) FROM review WHERE source = '원본' AND status = '반려'), tasks: count(SELECT id FROM task WHERE kind = '재상신' AND target.source = '원본') };", json!({})).await?;
    ensure!(old["ids"].as_array().is_some_and(|i| !i.is_empty()) && old["tasks"] == 0, "원본의 반려 {old}");
    let id = old["ids"][0].as_str().unwrap_or("");
    ensure!(state(support, id).await?["can"] == false && again(support, id).await? == "상태" && review(support, id).await?["review"]["status"] == "반려", "원본의 반려를 재상신");
    Ok(())
}
