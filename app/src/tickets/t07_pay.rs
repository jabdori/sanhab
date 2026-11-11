//! 07 지급: 승인된 심사의 지급마다 회계·자금의 지급 작업이 생기고(이벤트 `t07_task`), 회계·자금이 지급으로 표시하면 이체가 된다(D54. 완료는 08의 회신이 성공일 때).
//! 지급으로 표시하는 것은 역할의 세션으로 `remit`을 만드는 것이고, 누가 할 수 있는지는 DB(`fn::payable`)가 정한다. 은행 연동은 없다(모의 처리).
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, attempt, err, refuse};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/07-지급.surql");

pub fn routes() -> Router<Db> {
    Router::new().route("/pays", get(list)).route("/pays/{id}", get(detail)).route("/pay", post(pay))
}

/// 지급 작업이 생긴 지급 전부와 상태별 수. `mine`은 지금 역할이 지급을 담당하는지(목록 위의 수를 보일지)
async fn list(Extension(me): Extension<Me>) -> R {
    let r = q1(&me.db, "
        LET $rows = (SELECT record::id(id) AS id, name, ym, amount, state FROM payout WHERE state != NONE ORDER BY ym DESC, amount DESC, id);
        RETURN { mine: $auth.role = '회계·자금', rows: $rows, counts: object::from_entries(['대기', '재심사', '이체', '완료'].map(|$s| [$s, array::len($rows[WHERE state = $s])])) };", json!({})).await?;
    Ok(Json(r))
}

/// 지급 상세. 가운데: 대리점·귀속월·금액(`pay`), 등록된 계좌(`accounts` — 이체·완료인 지급은 지급한 날의 것, 그 밖에는 오늘의 것. 08의 대사가 같은 날로 맞춰 본다), 이 지급을 승인한 심사(`pay.review`).
/// 오른쪽: 담당하는 역할(`role`), 지금 역할이 지급으로 표시할 수 있는지(`can`), 이력(`history`). 지급 작업이 아직 없는 지급은 404
async fn detail(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "
        LET $p = type::record('payout', $id);
        LET $d = (SELECT VALUE out FROM payout_of WHERE in = $p)[0];
        LET $at = IF $p.state IN ['이체', '완료'] THEN (SELECT at, stamp FROM remit WHERE payout = $p ORDER BY stamp DESC LIMIT 1)[0].at END ?? fn::today();
        RETURN {
            pay: (SELECT record::id(id) AS id, name, record::id($d) AS dealer, ym, amount, state, { id: record::id(review), name: review.name } AS review, source, file.path AS file, row FROM $p WHERE state != NONE)[0],
            accounts: (SELECT out.value AS value, source, file.path AS file, row FROM acct WHERE in = $d AND since <= $at AND (until = NONE OR until > $at) ORDER BY since),
            role: '회계·자금',
            can: fn::payable($p),
            history: (SELECT role, time::format(at, '%Y-%m-%d') AS at, source FROM remit WHERE payout = $p ORDER BY stamp),
        };", json!({ "id": id })).await?;
    if r["pay"].is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    Ok(Json(r))
}

/// 지급으로 표시: `{ id }`. 쓰기 전에 거절의 낱말을 정해 돌려주고(`refuse`: 대상 → 권한 → 상태), 역할의 세션으로 `remit`을 만든다. DB의 권한 규칙은 마지막 방어선이다
async fn pay(Extension(me): Extension<Me>, Body(b): Body) -> R {
    // 본문의 꼴이 틀리면 대상. DB의 문구는 밖으로 내보내지 않는다
    let bad = || refuse("대상");
    let id = b["id"].as_str().filter(|i| !i.is_empty()).ok_or_else(bad)?;
    let made = attempt(&me.db, "
        LET $p = type::record('payout', $id);
        RETURN IF $p.id = NONE THEN '대상' ELSE IF $auth.role != '회계·자금' THEN '권한' ELSE IF !fn::payable($p) THEN '상태' END;",
        "CREATE remit SET payout = type::record('payout', $id) RETURN VALUE record::id(payout);", json!({ "id": id })).await?;
    Ok(Json(json!({ "id": made[0] })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, acct) = ("영업지원", "영업임원", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    // 승인에는 사유를 적는다(박상현 그룹에는 정황이 걸려 있어 사유가 필수다 — 11)
    let approve = async |role: &str, id: &str| c.post(role, "/api/decide", json!({ "ids": [id], "kind": "승인", "reason": { "class": "경미" } })).await;
    let pay = async |role: &str, id: &str| c.post(role, "/api/pay", json!({ "id": id })).await;
    let pays = async |role: &str, kind: &str| -> Result<Vec<J>> {
        let t = c.get(role, "/api/tasks").await?;
        Ok(rows(&t[kind]).into_iter().filter(|m| m["kind"] == "지급").collect())
    };
    let counts = async || -> Result<J> { Ok(c.get(acct, "/api/pays").await?["counts"].clone()) };
    let (one, group) = ("2026-06-D-001", "2026-06-D-011");

    // 승인 전: 지급 작업도 지급의 상태도 없다
    ensure!(c.get(acct, "/api/tasks").await? == json!({ "mine": [], "going": [] }), "승인 전의 작업");
    ensure!(c.get(acct, "/api/pays").await? == json!({ "mine": true, "rows": [], "counts": { "대기": 0, "재심사": 0, "이체": 0, "완료": 0 } }), "승인 전의 지급");

    // 영업지원이 대성상사1의 심사를 승인 → 회계·자금의 담당에 지급 작업 1(988,932). 영업지원은 진행에서 본다
    ensure!(approve(support, one).await?.0 == 200, "승인");
    let mine = pays(acct, "mine").await?;
    ensure!(mine.len() == 1 && mine[0]["view"] == "지급" && mine[0]["name"] == "대성상사1" && mine[0]["ym"] == "2026-06" && mine[0]["total"] == 988_932 && mine[0]["role"] == acct && mine[0]["pick"] == false, "지급 작업 {mine:?}");
    let id = mine[0]["target"].as_str().unwrap_or("").to_string();
    ensure!(pays(support, "going").await?.len() == 1 && pays(exec, "going").await?.is_empty() && pays(support, "mine").await?.is_empty(), "다른 역할의 작업");

    // 지급 상세: 대리점, 귀속월, 금액, 계좌(대리점에 지금 등록된 것), 이 지급을 승인한 심사
    let account = rows(&c.get(acct, "/api/dealers/D-001").await?["registered"]).into_iter().find(|r| r["item"] == "계좌").unwrap_or_default();
    let d = c.get(acct, &format!("/api/pays/{id}")).await?;
    ensure!(d["pay"] == json!({ "id": id, "name": "대성상사1", "dealer": "D-001", "ym": "2026-06", "amount": 988_932, "state": "대기", "review": { "id": one, "name": "대성상사1" },
        "source": "원본", "file": "01_corevia/sales/sales_rebate_payment_cv.csv", "row": 7 }), "지급 상세 {}", d["pay"]);
    ensure!(account["value"].is_string() && d["accounts"] == json!([{ "value": account["value"], "source": "원본", "file": "01_corevia/master/m_agency_cv.csv", "row": 2 }]), "계좌 {}", d["accounts"]);
    ensure!(d["can"] == true && d["role"] == acct && d["history"] == json!([]), "조치 {d}");
    // 대리점 상세의 지급 줄: 이 앱이 상태를 준 6월분은 그 상태와 출처(시연), 손대지 않은 1~5월분은 원본의 값뿐. 원본의 값과 행은 그대로다
    let line = async || -> Result<Vec<J>> { Ok(rows(&c.get(acct, "/api/dealers/D-001").await?["payouts"])) };
    let l = line().await?;
    ensure!(l.len() == 6 && l[..5].iter().all(|p| p["status"] == "승인" && p["state"].is_null()), "손대지 않은 지급 {l:?}");
    ensure!(l[5]["state"] == "대기" && l[5]["state_source"] == "시연" && l[5]["status"] == "미지급" && l[5]["source"] == "원본" && l[5]["row"] == 7, "대리점 상세의 6월 줄 {}", l[5]);
    ensure!(c.get(support, &format!("/api/pays/{id}")).await?["can"] == false, "영업지원에게 조치가 보임");

    // 영업임원이 박상현 그룹의 심사를 승인 → 그 심사의 지급 3건마다 작업. 담당 4건(금액이 큰 순), 승인한 영업임원은 진행에서 3건을 본다
    ensure!(approve(exec, group).await?.0 == 200, "그룹의 승인");
    let mine = pays(acct, "mine").await?;
    let got: Vec<J> = mine.iter().map(|m| json!([m["name"], m["total"]])).collect();
    ensure!(json!(got) == json!([["금강상사11", 1_373_515], ["대륙상사37", 1_325_536], ["성일상사24", 1_189_046], ["대성상사1", 988_932]]), "담당 {got:?}");
    ensure!(pays(exec, "going").await?.len() == 3 && pays(support, "going").await?.len() == 4, "진행");
    ensure!(counts().await? == json!({ "대기": 4, "재심사": 0, "이체": 0, "완료": 0 }), "대기 4");
    let big = mine[0]["target"].as_str().unwrap_or("").to_string();
    ensure!(c.get(acct, &format!("/api/pays/{big}")).await?["pay"]["review"] == json!({ "id": group, "name": "금강상사11 외 2" }), "그룹의 지급이 가리키는 심사");
    // 원본의 값은 그대로다: 미지급 40건
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM payout WHERE status = '미지급');", json!({})).await? == 40, "원본의 상태가 바뀜");
    // 승인된 심사에 들지 않은 지급은 지급 상세가 없다
    ensure!(c.call(Some(c.token(acct)), "GET", "/api/pays/RB-00168", None).await?.0 == 404 && c.call(Some(c.token(acct)), "GET", "/api/pays/x", None).await?.0 == 404, "지급 작업이 없는 지급");

    // 다른 역할은 지급할 수 없다. 화면을 거치지 않고 DB에 직접 써도 마찬가지다(회계·자금도 지급 표시 말고는 쓰지 못한다)
    for role in [support, exec, "내부 감시"] {
        ensure!(pay(role, &id).await? == (403, json!({ "error": "권한" })), "{role}이 지급");
        let s = as_user(&c.db, c.token(role)).await?;
        q(&s, "CREATE remit SET payout = type::record('payout', $id); UPDATE payout SET state = '완료';", json!({ "id": id })).await.ok();
        q(&s, "INSERT INTO remit (SELECT id AS payout FROM payout WHERE state = '대기');", json!({})).await.ok();
    }
    let s = as_user(&c.db, c.token(acct)).await?;
    for sql in ["UPDATE payout SET state = '완료', amount = 1;", "UPDATE task SET state = '완료';", "CREATE remit SET payout = payout:`RB-00168`;", "DELETE task; DELETE payout;"] {
        q(&s, sql, json!({})).await.ok();
    }
    ensure!(pay(acct, "RB-00168").await? == (400, json!({ "error": "상태" })) && pay(acct, "x").await? == (400, json!({ "error": "대상" })), "승인되지 않은 지급을 지급");
    ensure!(counts().await? == json!({ "대기": 4, "재심사": 0, "이체": 0, "완료": 0 }) && pays(acct, "mine").await?.len() == 4 && c.get(acct, &format!("/api/pays/{id}")).await? == d, "직접 쓴 뒤");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM remit);", json!({})).await? == 0, "지급 표시가 만들어짐");

    // 회계·자금이 지급을 누르면: 상태 이체(완료는 회신이 성공일 때 — 08), 이력에 사람과 날짜, 작업이 끝난다. 남의 이름을 적어 보내도 DB가 채운 값이 남는다
    q(&s, "CREATE remit SET payout = type::record('payout', $id), role = '영업임원', by = staff:exec, at = d'2020-01-01T00:00:00Z', source = '원본';", json!({ "id": id })).await?;
    let d = c.get(acct, &format!("/api/pays/{id}")).await?;
    ensure!(d["pay"]["state"] == "이체" && d["can"] == false && d["history"] == json!([{ "role": acct, "at": "2026-07-01", "source": "시연" }]), "지급 뒤 {d}");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM remit)[0] = staff:acct;", json!({})).await? == true, "지급한 직원");
    ensure!(counts().await? == json!({ "대기": 3, "재심사": 0, "이체": 1, "완료": 0 }), "대기 3 이체 1");
    ensure!(pays(acct, "mine").await?.len() == 3 && pays(support, "going").await?.len() == 3, "지급 뒤의 작업");
    ensure!(pay(acct, &id).await? == (400, json!({ "error": "상태" })), "이체인 지급을 다시 지급");
    let l = line().await?;
    ensure!(l[5]["state"] == "이체" && l[5]["state_source"] == "시연" && l[5]["status"] == "미지급", "지급 뒤 대리점 상세의 6월 줄 {}", l[5]);
    // 본문의 꼴이 틀린 요청은 400이고 DB의 문구가 나가지 않는다
    for body in [json!({}), json!({ "id": 5 }), json!({ "id": "" }), json!([]), json!({ "id": ["x"] })] {
        let (code, r) = c.post(acct, "/api/pay", body.clone()).await?;
        ensure!(code == 400 && r == json!({ "error": "대상" }), "틀린 본문 {body} → {code} {r}");
    }
    // 화면의 길로도 된다. 같은 지급에 셋을 동시에 보내면 하나만 되고 진 쪽은 상태다(이미 지급으로 표시된 지급)
    let all = tokio::join!(pay(acct, &big), pay(acct, &big), pay(acct, &big));
    let mut got = [all.0?, all.1?, all.2?];
    got.sort_by_key(|g| g.0);
    let (code, r) = got[0].clone();
    ensure!(got[1] == (400, json!({ "error": "상태" })) && got[1] == got[2] && q1(&c.db, "RETURN count(SELECT id FROM remit WHERE payout = type::record('payout', $id));", json!({ "id": big })).await? == 1, "동시에 보낸 지급 {got:?}");
    ensure!(code == 200 && r["id"] == big.as_str() && counts().await? == json!({ "대기": 2, "재심사": 0, "이체": 2, "완료": 0 }), "지급 {code} {r}");

    // 뒤 티켓이 끼우는 자리(14): 지급의 상태를 재심사로 바꾸면 조치가 사라지고 지급할 수 없다. 대기로 돌리면 다시 된다
    let again = pays(acct, "mine").await?[0]["target"].as_str().unwrap_or("").to_string();
    q(&c.db, "UPDATE type::record('payout', $id) SET state = '재심사';", json!({ "id": again })).await?;
    let d = c.get(acct, &format!("/api/pays/{again}")).await?;
    ensure!(d["pay"]["state"] == "재심사" && d["can"] == false && pay(acct, &again).await?.0 == 400, "재심사인 지급 {d}");
    ensure!(counts().await? == json!({ "대기": 1, "재심사": 1, "이체": 2, "완료": 0 }) && pays(acct, "mine").await?.len() == 2, "재심사 1");

    // 한 지급에 작업은 하나: 뒤에 대성상사1과 한 그룹이 된 두 곳의 심사는 대성상사1의 지급까지 합산하지만(04), 승인되어도 그 지급의 작업을 다시 만들지 않는다
    q(&c.db, "
        FOR $d IN [dealer:`D-002`, dealer:`D-003`] {
            LET $e = { since: d'2026-06-01T00:00:00Z', via: '신고', source: '시연' };
            RELATE $d->addr->(SELECT VALUE out FROM addr WHERE in = dealer:`D-001`) CONTENT $e;
            RELATE $d->acct->(SELECT VALUE out FROM acct WHERE in = dealer:`D-001`) CONTENT $e;
        };", json!({})).await?;
    super::t04_review::recalc(&c.db).await?;
    ensure!(c.get(exec, "/api/reviews/2026-06-D-002").await?["review"]["total"] == 2_443_780 && approve(exec, "2026-06-D-002").await?.0 == 200, "합쳐진 심사의 승인");
    let got: Vec<J> = c.get(acct, "/api/pays").await?["rows"].as_array().into_iter().flatten().map(|p| json!([p["name"], p["amount"], p["state"]])).collect();
    ensure!(json!(got) == json!([["금강상사11", 1_373_515, "이체"], ["대륙상사37", 1_325_536, "재심사"], ["성일상사24", 1_189_046, "대기"], ["대성상사1", 988_932, "이체"], ["대륙상사2", 799_699, "대기"], ["한라인상사3", 655_149, "대기"]]), "지급 목록 {got:?}");
    ensure!(c.get(acct, &format!("/api/pays/{id}")).await?["pay"]["review"]["id"] == one, "먼저 승인한 심사가 바뀜");
    ensure!(q1(&c.db, "RETURN [count(SELECT id FROM task WHERE kind = '지급'), count(SELECT id FROM task WHERE kind = '지급' AND state = '완료')];", json!({})).await? == json!([6, 2]), "지급 작업의 수");
    Ok(())
}
