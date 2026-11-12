//! 20 소명: 서류가 접수된 소명을 내부 감시가 인정·불인정·보완으로 정한다(D12, D13, D31, D41, 선 17·18·19). 셋 다 사유가 필수다.
//! 인정이면 소명한 대리점의 해당 식별자 선에 소명으로 제외가 붙고(효력은 서류가 입증하는 기간 — DB의 `fn::span`), 그 소명의 정황이 해소된다(DB의 이벤트 `t20_verdict`).
//! 처리기는 그 뒤에 그룹·심사·재검토를 다시 계산한다(`recalc` → `remark` → `detect`). 불인정은 관련자가 유지되고, 보완이면 영업지원에 발송 작업이 다시 생기며 그동안 관련자로 계속 본다.
//! 인정·불인정이면 승인권자가 보류해 둔 심사의 작업이 담당으로 돌아온다(05의 규약). 보완은 아직 결과가 아니므로 돌아오지 않는다.
use super::t03_related::ITEMS;
use super::t17_report::USE;
use super::t19_docs::{READ, SAMPLES, sweep_with};
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, attempt, err, refuse};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/20-소명.surql");

pub fn routes() -> Router<Db> {
    Router::new().route("/clarifies/{id}/verdict", get(detail)).route("/verdict", post(decide))
}

/// 선의 테이블 → 식별자의 종류(`ITEMS`의 자리: rep 0, addr 1, acct 2)
fn item(tb: &str) -> &'static str {
    ITEMS[["rep", "addr", "acct"].iter().position(|t| *t == tb).unwrap_or(0)]
}

/// 결과를 정하는 화면의 값. 없는 소명은 404.
/// `can`(지금 역할이 정할 수 있는지)과 `actions`(조치와 사유의 분류), `span`(인정하면 효력이 미치는 기간 — 가장 나중 서류의 정리. 없으면 null = 제한 없음),
/// `lines`(인정하면 제외될 선), `excluded`(이 소명이 이미 제외한 선과 그 기간), `unknown`(가장 나중 서류에서 서류만으로 가를 수 없는 항목: 누락, 호실까지 같아 추가 확인)
async fn detail(State(db): State<Db>, Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&db, "
        LET $c = type::record('clarify', $id);
        LET $s = fn::span($c);
        RETURN IF $c.id = NONE THEN NONE ELSE {
            span: IF $s THEN $s.map(|$d| time::format($d, '%Y-%m-%d')) END,
            lines: fn::excusable($c).map(|$i| { tb: meta::tb($i), value: $i.out.value ?? $i.out.name }),
            excluded: (SELECT meta::tb(id) AS tb, out.value ?? out.name AS value,
                IF ex_from THEN time::format(ex_from, '%Y-%m-%d') END AS since, IF ex_to THEN time::format(ex_to, '%Y-%m-%d') END AS until FROM rep, addr, acct WHERE excused = $c),
        } END;", json!({ "id": id })).await.map_err(|_| err(StatusCode::NOT_FOUND, "없음"))?;
    if r.is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    let can = q1(&me.db, "RETURN fn::decidable(type::record('clarify', $id));", json!({ "id": id })).await? == true;
    let docs = super::t19_docs::list(State(db), Extension(me), Path(id.clone())).await?.0;
    let mut unknown = vec![];
    for r in docs["docs"].as_array().and_then(|d| d.last()).and_then(|d| d["rows"].as_array()).into_iter().flatten() {
        match (r["item"].as_str(), r["result"].as_str()) {
            (Some(i), Some("누락")) => unknown.push(json!([i, "누락"])),
            (Some("호실"), Some("일치")) => unknown.push(json!(["호실", "추가 확인"])),
            _ => {}
        }
    }
    let lines: Vec<J> = r["lines"].as_array().into_iter().flatten().map(|l| json!({ "item": item(l["tb"].as_str().unwrap_or_default()), "value": l["value"] })).collect();
    let excluded: Vec<J> = r["excluded"].as_array().into_iter().flatten().map(|l| json!({ "item": item(l["tb"].as_str().unwrap_or_default()), "value": l["value"], "since": l["since"], "until": l["until"] })).collect();
    let actions: Vec<J> = if can { ["인정", "불인정", "보완"].iter().map(|k| json!({ "kind": k, "classes": classes(k) })).collect() } else { vec![] };
    Ok(Json(json!({ "id": id, "can": can, "role": "내부 감시", "actions": actions, "span": r["span"], "lines": lines, "excluded": excluded, "unknown": unknown })))
}

/// 결과의 분류(DB의 `fn::verdict_classes`와 같다 — 화면이 목록을 받는 자리)
fn classes(kind: &str) -> Vec<&'static str> {
    match kind {
        "인정" => vec!["입증", "기타"],
        "불인정" => vec!["일치", "서류", "기타"],
        _ => vec!["누락", "서류", "기타"],
    }
}

/// 결과를 정한다: `{ id(소명), kind 인정·불인정·보완, reason }`. 쓰기 전에 거절의 낱말을 정한다(`refuse`: 대상 → 권한 → 상태 → 사유).
/// 없는 소명·없는 결과·틀린 꼴은 대상, 내부 감시가 아니면 권한, 서류가 접수된 상태가 아니면 상태, 사유(분류는 필수, 기타이면 메모)가 규칙에 맞지 않으면 사유.
/// 만들어지면 DB의 이벤트가 소명·선·정황·작업을 바꾸고, 이어서 처리기가 그룹·심사·재검토를 다시 계산한다
async fn decide(State(db): State<Db>, Extension(me): Extension<Me>, Body(b): Body) -> R {
    let (Some(id), Some(kind)) = (b["id"].as_str().filter(|i| !i.is_empty()), b["kind"].as_str()) else { return Err(refuse("대상")) };
    let mut vars = json!({ "id": id, "kind": kind });
    if b["reason"].is_object() {
        vars["reason"] = b["reason"].clone();
    }
    attempt(&me.db, "
        LET $c = type::record('clarify', $id);
        RETURN IF $c.id = NONE OR $kind NOTINSIDE ['인정', '불인정', '보완'] THEN '대상'
            ELSE IF $auth.role != '내부 감시' THEN '권한'
            ELSE IF !fn::decidable($c) THEN '상태'
            ELSE IF !fn::reason(true, fn::verdict_classes($kind), $reason) THEN '사유' END;",
        "RETURN (CREATE verdict SET clarify = type::record('clarify', $id), kind = $kind, reason = $reason);", vars).await?;
    settle(&db, id, kind).await.map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "오류"))?;
    Ok(Json(json!({ "id": id })))
}

/// 결과 뒤의 계산. 인정이면 선이 제외되었으므로 그룹·심사·재검토·정황을 다시 맞춘다(승인권자가 올라가는 심사는 `recalc` 끝의 `raise`가 맞춘다).
/// 인정·불인정이면 보류된 심사(그 정황의 대리점이 든 것)의 작업을 담당으로 되돌린다
async fn settle(db: &Db, id: &str, kind: &str) -> Result<()> {
    if kind == "인정" {
        super::t04_review::recalc(db).await?;
        super::t09_again::remark(db).await?;
        super::t11_signal::detect(db).await?;
    }
    if kind != "보완" {
        q(db, "
            LET $ds = type::record('clarify', $id).signal.dealers;
            UPDATE task SET state = '대기' WHERE kind = '심사' AND state = '진행' AND target.status = '보류' AND target.members ANYINSIDE $ds;", json!({ "id": id })).await?;
    }
    Ok(())
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let (png1, png2, png3) = (SAMPLES[0], SAMPLES[1], SAMPLES[2]);
    let none = || { *USE.lock().unwrap() = None; *READ.lock().unwrap() = None; };
    *READ.lock().unwrap() = Some("fixture".into());
    *USE.lock().unwrap() = Some("fixture".into());
    let up = async |id: &str, s: (&str, &str, &[u8], &str)| -> Result<u16> {
        let res = reqwest::Client::new().post(format!("{}/api/clarifies/{id}/docs?name={}", c.base(), s.0)).bearer_auth(c.token(support)).header("content-type", "image/png").body(s.2.to_vec()).send().await?;
        Ok(res.status().as_u16())
    };
    // 판독·정리를 채운다(고정 응답). 서류가 여럿이면 앞의 것부터 한 번씩
    let fill = async || -> Result<()> {
        for _ in 0..2 {
            q(&c.db, "UPDATE doc SET read_tried = NONE, tidy_tried = NONE;", json!({})).await?;
            sweep_with(&c.db, None, None).await?;
        }
        Ok(())
    };
    // 소명 하나를 연다: 기타 정황(대상, 상대 대리점) → 요청 → 발송. 소명의 id
    let open = async |tag: &str, a: &str, b: &str| -> Result<String> {
        q(&c.db, &format!("RETURN fn::signal('기타', 't20-{tag}', 't20-{tag}', [dealer:`{a}`, dealer:`{b}`], [], '계산');"), json!({})).await?;
        ensure!(c.post(audit, "/api/rule", json!({ "id": format!("기타-t20-{tag}"), "kind": "요청" })).await?.0 == 200, "요청 {tag}");
        let id = q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM clarify WHERE signal = type::record('signal', $s))[0];", json!({ "s": format!("기타-t20-{tag}") })).await?.as_str().unwrap_or_default().to_string();
        ensure!(c.post(support, "/api/send", json!({ "id": id })).await?.0 == 200, "발송 {tag}");
        Ok(id)
    };
    let verdict = async |role: &str, id: &str, kind: &str, reason: J| -> Result<String> {
        let (code, r) = c.post(role, "/api/verdict", json!({ "id": id, "kind": kind, "reason": reason })).await?;
        ensure!(code == 200 || r == json!({ "error": r["error"] }), "거절의 꼴 {code} {r}");
        Ok(r["error"].as_str().unwrap_or("").to_string())
    };
    let review = async |id: &str| c.get(audit, &format!("/api/reviews/{id}")).await;
    let tasks = async |role: &str, which: &str, kind: &str| -> Result<Vec<J>> { Ok(rows(&c.get(role, "/api/tasks").await?[which]).into_iter().filter(|m| m["kind"] == kind).collect()) };
    let state = async |id: &str| -> Result<J> { Ok(c.get(audit, &format!("/api/clarifies/{id}")).await?["clarify"]["state"].clone()) };

    let shape = async || -> Result<J> {
        let r = review("2026-06-D-011").await?;
        Ok(json!([r["review"]["total"], r["review"]["approver"], r["members"].as_array().map(|m| m.len()), q1(&c.db, "RETURN count(SELECT id FROM rep WHERE excluded) + count(SELECT id FROM addr WHERE excluded) + count(SELECT id FROM acct WHERE excluded);", json!({})).await?]))
    };
    // 원본 상태: 박상현 그룹(금강상사11·성일상사24·대륙상사37)의 6월 합산 3,888,097. 승인권자는 영업임원이고 성일상사24는 따로 심사가 없다
    let before = shape().await?;
    ensure!(before == json!([3_888_097, "영업임원", 3, 0]), "원본의 6월 {before}");
    ensure!(c.call(Some(c.token(audit)), "GET", "/api/reviews/2026-06-D-024", None).await?.0 == 404, "원본에는 성일상사24의 심사가 없다");
    let months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
    let orig = [4_870_186, 4_540_341, 4_055_114, 4_267_112, 4_505_596];
    let bundle = async |ym: &str| c.get(exec, &format!("/api/ratifies/{ym}-D-011")).await;
    for (ym, t) in months.iter().zip(orig) {
        let b = bundle(ym).await?;
        ensure!(b["ratify"]["total"] == t && rows(&b["reviews"]).len() == 3 && b["ratify"]["marks"] == json!(["재검토"]), "{ym}의 원본 묶음 {b}");
    }
    let marked = || q1(&c.db, "RETURN count(SELECT id FROM review WHERE ym INSIDE ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'] AND marks CONTAINS '재검토');", json!({}));
    ensure!(marked().await? == 15, "원본의 재검토");

    // ---- 서류 세 장의 보고(미확인): 호실이 다르면 없고, 호실까지 같으면 추가 확인, 호실이 빠졌으면 누락 ----
    let x = open("a", "D-024", "D-011").await?;
    let two = open("b", "D-024", "D-011").await?;
    let three = open("c", "D-024", "D-011").await?;
    ensure!(up(&x, png1).await? == 200 && up(&two, png2).await? == 200 && up(&three, png3).await? == 200, "접수");
    fill().await?;
    let v = async |id: &str| c.get(audit, &format!("/api/clarifies/{id}/verdict")).await;
    let (a, b, d) = (v(&x).await?, v(&two).await?, v(&three).await?);
    ensure!(a["unknown"] == json!([]) && b["unknown"] == json!([["호실", "추가 확인"]]) && d["unknown"] == json!([["호실", "누락"]]), "미확인 {} {} {}", a["unknown"], b["unknown"], d["unknown"]);
    let docs2 = c.get(audit, &format!("/api/clarifies/{two}/docs")).await?;
    ensure!(docs2["docs"][0]["counts"] == json!({ "누락": 0, "불일치": 0 }) && rows(&docs2["docs"][0]["rows"]).iter().filter(|r| r["result"] == "일치").count() == 3, "호실까지 같은 서류 {}", docs2["docs"][0]["rows"]);
    // 인정하면 제외될 선과 효력 기간: 주소 한 줄, 서류의 기간(시연 1·2는 2026-01-01~2027-12-31)
    ensure!(a["lines"] == json!([{ "item": "주소", "value": "성남시 상공로 128" }]) && a["span"] == json!(["2026-01-01", "2027-12-31"]) && a["excluded"] == json!([]), "제외될 선 {a}");
    ensure!(a["can"] == true && a["actions"].as_array().is_some_and(|x| x.len() == 3) && c.get(support, &format!("/api/clarifies/{x}/verdict")).await?["can"] == false, "조치는 내부 감시에게만");
    ensure!(c.call(Some(c.token(audit)), "GET", "/api/clarifies/x/verdict", None).await?.0 == 404, "없는 소명");

    // ---- 거절: 대상 → 권한 → 상태 → 사유. 아무것도 남지 않는다 ----
    let (code, r) = c.post(exec, "/api/verdict", json!({ "id": x, "kind": "인정", "reason": { "class": "입증" } })).await?;
    ensure!((code, r) == (403, json!({ "error": "권한" })), "영업임원의 결과");
    for role in [support, acct] {
        ensure!(verdict(role, &x, "인정", json!({ "class": "입증" })).await? == "권한", "{role}의 결과");
    }
    ensure!(verdict(audit, "x", "인정", json!({ "class": "입증" })).await? == "대상" && verdict(audit, &x, "승인", json!({ "class": "입증" })).await? == "대상", "대상");
    ensure!(c.raw(audit, "/api/verdict", "글", None).await? == (400, json!({ "error": "대상" })) && c.post(audit, "/api/verdict", json!({ "id": 5, "kind": "인정" })).await?.1 == json!({ "error": "대상" }), "꼴이 틀린 본문");
    for (kind, reason) in [("인정", J::Null), ("인정", json!({ "class": "누락" })), ("인정", json!({ "class": "기타" })), ("불인정", json!({ "class": "기타", "memo": " " })), ("보완", json!({ "memo": "메모만" })), ("보완", json!({ "class": "입증" }))] {
        ensure!(verdict(audit, &x, kind, reason.clone()).await? == "사유", "사유 {kind} {reason}");
    }
    let pending = open("d", "D-024", "D-011").await?;
    ensure!(verdict(audit, &pending, "인정", json!({ "class": "입증" })).await? == "상태" && state(&pending).await? == "요청", "서류가 접수되기 전의 결과");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM verdict);", json!({})).await? == 0 && state(&x).await? == "접수" && shape().await? == before, "거절된 결과가 남음");
    // 동시에 둘이 정하면 하나만 되고 진 쪽은 상태다(소명 하나에 결과는 한 번)
    let race = open("e", "D-024", "D-011").await?;
    ensure!(up(&race, png2).await? == 200, "접수 e");
    let (r1, r2) = tokio::join!(c.post(audit, "/api/verdict", json!({ "id": race, "kind": "불인정", "reason": { "class": "일치" } })), c.post(audit, "/api/verdict", json!({ "id": race, "kind": "인정", "reason": { "class": "입증" } })));
    let mut got = [r1?, r2?];
    got.sort_by_key(|g| g.0);
    ensure!(got[0].0 == 200 && got[1] == (400, json!({ "error": "상태" })) && q1(&c.db, "RETURN count(SELECT id FROM verdict);", json!({})).await? == 1, "동시에 정한 결과 {got:?}");
    // 되돌린다(아래의 확인은 이 소명이 없던 때의 값이다)
    q(&c.db, "DELETE verdict; UPDATE rep, addr, acct SET excluded = false, ex_from = NONE, ex_to = NONE, excused = NONE WHERE excused != NONE; UPDATE clarify SET state = '접수';", json!({})).await?;
    super::t04_review::recalc(&c.db).await?;
    super::t09_again::remark(&c.db).await?;
    // DB를 직접 써도: 다른 역할은 결과를 만들지 못하고 선을 고치지 못한다
    for role in [support, exec, acct] {
        let s = as_user(&c.db, c.token(role)).await?;
        q(&s, "CREATE verdict SET clarify = type::record('clarify', $id), kind = '인정', reason = { class: '입증' }; UPDATE addr SET excluded = true; UPDATE signal SET state = '해소';", json!({ "id": x })).await.ok();
    }
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM verdict);", json!({})).await? == 0 && shape().await? == before && state(&x).await? == "접수", "직접 쓴 뒤");

    // ---- 보완: 발송 작업이 다시 생기고 그동안 관련자로 계속 본다. 보류한 심사의 작업은 담당으로 돌아오지 않는다 ----
    let hold = c.post(exec, "/api/decide", json!({ "ids": ["2026-06-D-011"], "kind": "보류", "reason": { "class": "소명" } })).await?;
    ensure!(hold.0 == 200, "보류 {hold:?}");
    ensure!(tasks(exec, "going", "심사").await?.iter().any(|t| t["target"] == "2026-06-D-011") && tasks(exec, "mine", "심사").await?.iter().all(|t| t["target"] != "2026-06-D-011"), "보류한 심사는 진행");
    ensure!(tasks(support, "mine", "발송").await?.is_empty() && tasks(audit, "mine", "소명").await?.len() == 3, "보완 전의 작업");
    ensure!(verdict(audit, &three, "보완", json!({ "class": "누락", "memo": "호실이 빠졌다" })).await? == "", "보완");
    let d = c.get(support, &format!("/api/clarifies/{three}")).await?;
    ensure!(d["clarify"]["state"] == "보완" && d["sent"].is_null() && d["due"].is_null() && d["body"].is_null() && d["can"] == true, "보완 뒤의 소명 {d}");
    ensure!(d["docs"] == json!([["주소", "임대차계약서"], ["주소", "사업자등록증"], ["대표자", "생년월일을 확인할 수 있는 서류"]]), "다시 받을 서류 {}", d["docs"]);
    ensure!(tasks(support, "mine", "발송").await?.iter().filter(|t| t["target"] == three.as_str()).count() == 1 && tasks(audit, "mine", "소명").await?.iter().all(|t| t["target"] != three.as_str()), "보완 뒤의 작업");
    ensure!(shape().await? == before && c.get(audit, &format!("/api/clarifies/{three}/verdict")).await?["can"] == false, "보완하는 동안 관련자로 계속 본다");
    ensure!(tasks(exec, "going", "심사").await?.iter().any(|t| t["target"] == "2026-06-D-011"), "보완은 결과가 아니라 보류한 작업이 돌아오지 않는다");
    let kinds: Vec<String> = rows(&d["history"]).iter().map(|h| h["kind"].as_str().unwrap_or("").to_string()).collect();
    ensure!(kinds == ["요청", "발송", "보완"] && d["history"][2]["reason"] == json!({ "class": "누락", "memo": "호실이 빠졌다" }) && d["history"][2]["role"] == audit, "이력 {}", d["history"]);
    // 서류는 다시 발송한 뒤에 받는다. 같은 시도를 두 번 발송하지 못한다
    ensure!(up(&three, png1).await? == 400, "발송 전의 접수");
    ensure!(c.post(support, "/api/send", json!({ "id": three })).await?.0 == 200 && c.post(support, "/api/send", json!({ "id": three })).await? == (400, json!({ "error": "상태" })), "다시 발송");
    ensure!(tasks(support, "mine", "발송").await?.is_empty() && q1(&c.db, "RETURN count(SELECT id FROM dispatch WHERE clarify = type::record('clarify', $id));", json!({ "id": three })).await? == 2, "발송 표시는 시도마다");
    ensure!(up(&three, png1).await? == 200 && state(&three).await? == "접수" && tasks(audit, "mine", "소명").await?.iter().any(|t| t["target"] == three.as_str()), "보완한 서류");
    fill().await?;
    ensure!(c.get(audit, &format!("/api/clarifies/{three}/docs")).await?["docs"].as_array().is_some_and(|d| d.len() == 2), "서류는 두 장");
    ensure!(v(&three).await?["unknown"] == json!([]), "가장 나중 서류의 미확인");
    // ---- 불인정: 관련자가 유지된다. 정황은 그대로이고 보류한 심사의 작업이 담당으로 돌아온다 ----
    ensure!(verdict(audit, &three, "불인정", json!({ "class": "일치", "memo": "호실이 같다" })).await? == "", "불인정");
    ensure!(state(&three).await? == "불인정" && shape().await? == before, "불인정 뒤의 관련자");
    ensure!(c.get(audit, "/api/signals/기타-t20-c").await?["signal"]["state"] == "요청", "불인정은 정황을 풀지 않는다");
    ensure!(tasks(exec, "mine", "심사").await?.iter().any(|t| t["target"] == "2026-06-D-011") && tasks(audit, "mine", "소명").await?.iter().all(|t| t["target"] != three.as_str()), "불인정 뒤의 작업");
    ensure!(verdict(audit, &three, "인정", json!({ "class": "입증" })).await? == "상태", "결과는 한 번");
    // 직접 써도: 누가·언제·출처·효력 기간은 DB가 채운다(보낸 값은 쓰이지 않는다)
    let s = as_user(&c.db, c.token(audit)).await?;
    q(&s, "CREATE verdict SET clarify = type::record('clarify', $id), kind = '불인정', reason = { class: '일치' }, by = staff:exec, role = '영업임원', at = d'2020-01-01T00:00:00Z', source = '원본', since = d'2020-01-01T00:00:00Z', until = d'2020-02-01T00:00:00Z';", json!({ "id": two })).await?;
    let w = q1(&c.db, "RETURN (SELECT <string> by AS by, role, time::format(at, '%Y-%m-%d') AS at, source, time::format(since, '%Y-%m-%d') AS since, time::format(until, '%Y-%m-%d') AS until FROM verdict WHERE clarify = type::record('clarify', $id))[0];", json!({ "id": two })).await?;
    ensure!(w == json!({ "by": "staff:audit", "role": audit, "at": "2026-07-01", "source": "시연", "since": "2026-01-01", "until": "2027-12-31" }) && state(&two).await? == "불인정", "DB가 채운 값 {w}");

    // ---- 인정(시연 1): 성일상사24의 주소 소명(금강상사11과 호실이 다르다) ----
    // 1월 묶음을 먼저 추인해 둔다: 추인 뒤의 묶음은 재검토가 풀려도 그대로다(10)
    ensure!(c.post(exec, "/api/decide", json!({ "ids": ["2026-01-D-011"], "kind": "추인", "reason": { "class": "정상" } })).await?.0 == 200, "1월의 추인");
    q(&c.db, "UPDATE task SET state = '진행' WHERE kind = '심사' AND target = review:`2026-06-D-011`;", json!({})).await?;
    ensure!(verdict(audit, &x, "인정", json!({ "class": "입증", "memo": "호실이 다르다" })).await? == "", "인정");
    ensure!(state(&x).await? == "인정" && c.get(audit, "/api/signals/기타-t20-a").await?["signal"]["state"] == "해소", "인정한 소명과 정황");
    // 그 대리점의 주소 선 하나에만 소명으로 제외가 붙는다(효력은 서류가 입증하는 기간)
    let lines = q1(&c.db, "RETURN (SELECT record::id(in) AS d, meta::tb(id) AS tb, time::format(ex_from, '%Y-%m-%d') AS f, time::format(ex_to, '%Y-%m-%d') AS t, record::id(excused) = $x AS by FROM rep, addr, acct WHERE excluded);", json!({ "x": x })).await?;
    ensure!(lines == json!([{ "d": "D-024", "tb": "addr", "f": "2026-01-01", "t": "2027-12-31", "by": true }]), "제외된 선 {lines}");
    let d = v(&x).await?;
    ensure!(d["lines"] == json!([]) && d["excluded"] == json!([{ "item": "주소", "value": "성남시 상공로 128", "since": "2026-01-01", "until": "2027-12-31" }]) && d["can"] == false, "인정 뒤의 화면 {d}");
    // 6월 심사가 갈라진다: {금강상사11, 대륙상사37} 합산 2,699,051과 성일상사24 1,189,046
    let a = review("2026-06-D-011").await?;
    ensure!(a["review"]["total"] == 2_699_051 && a["review"]["approver"] == "영업임원" && rows(&a["members"]).iter().map(|m| m["id"].as_str().unwrap_or("")).eq(["D-011", "D-037"]), "금강상사11·대륙상사37의 6월 {a}");
    let b = review("2026-06-D-024").await?;
    ensure!(b["review"]["total"] == 1_189_046 && b["review"]["approver"] == "영업지원" && rows(&b["members"]).len() == 1 && b["review"]["name"] == "성일상사24", "성일상사24의 6월 {b}");
    // 그 뒤에도 계좌 정황의 가설에서 성일상사24의 승인권자가 올라가므로 심사는 영업임원의 담당이다(12)
    ensure!(b["review"]["holder"] == "영업임원" && b["review"]["marks"] == json!(["정황"]), "성일상사24의 승인권자 {}", b["review"]);
    ensure!(tasks(exec, "mine", "심사").await?.iter().any(|t| t["target"] == "2026-06-D-024" && t["total"] == 1_189_046) && tasks(support, "mine", "심사").await?.iter().all(|t| t["target"] != "2026-06-D-024"), "성일상사24의 작업은 영업임원의 담당");
    ensure!(tasks(exec, "mine", "심사").await?.iter().any(|t| t["target"] == "2026-06-D-011"), "보류한 심사의 작업이 담당으로 돌아온다");
    // 영업지원은 성일상사24의 심사를 전결하지 못한다. 영업임원은 사유를 달아 승인할 수 있다(정황이 걸린 건)
    ensure!(c.post(support, "/api/decide", json!({ "ids": ["2026-06-D-024"], "kind": "승인", "reason": { "class": "정상" } })).await?.0 == 403, "영업지원의 승인");
    // 1~5월의 재검토가 다시 계산된다: 성일상사24의 다섯 건이 풀리고(15건 → 10건), 추인 전의 2~5월 묶음은 두 건·두 곳의 합산이 된다. 추인된 1월은 그때 그대로다
    ensure!(marked().await? == 10, "재검토 {}", marked().await?);
    ensure!(review("2026-01-D-024").await?["review"]["marks"] == json!(["추인"]), "추인된 1월의 성일상사24: 재검토 표시만 풀린다");
    let left = [3_516_691, 3_061_435, 2_638_344, 2_972_016, 3_389_716];
    let jan = bundle("2026-01").await?;
    ensure!(jan["ratify"]["total"] == 4_870_186 && rows(&jan["reviews"]).len() == 3 && jan["ratify"]["marks"] == json!(["재검토", "추인"]), "추인된 1월 {jan}");
    for (ym, t) in months.iter().zip(left).skip(1) {
        let b = bundle(ym).await?;
        ensure!(b["ratify"]["total"] == t && b["ratify"]["name"] == "금강상사11 외 1" && rows(&b["reviews"]).iter().map(|r| r["id"].as_str().unwrap_or("").to_string()).eq([format!("{ym}-D-011"), format!("{ym}-D-037")]), "{ym}의 묶음 {b}");
        ensure!(review(&format!("{ym}-D-024")).await?["review"]["marks"] == json!([]), "{ym}의 성일상사24는 재검토가 풀린다");
        ensure!(tasks(exec, "mine", "추인").await?.iter().filter(|x| x["ym"] == *ym).map(|x| x["total"].clone()).eq([json!(t)]), "{ym}의 추인 작업");
    }
    // 성일상사24는 대표자만 일치하므로 그룹에서 빠지고, 그 대표자 일치는 동명 정황으로 접수된다(11)
    ensure!(c.get(audit, "/api/dealers/D-024/related").await?["group"] == json!([{ "id": "D-024", "name": "성일상사24" }]), "성일상사24의 그룹");
    ensure!(c.get(audit, "/api/signals/동명-박상현").await?["signal"]["state"] == "접수", "동명 정황");
    let h = c.get(audit, &format!("/api/clarifies/{x}")).await?["history"].clone();
    ensure!(rows(&h).iter().map(|h| h["kind"].as_str().unwrap_or("")).eq(["요청", "발송", "인정"]) && h[2]["reason"] == json!({ "class": "입증", "memo": "호실이 다르다" }), "인정의 이력 {h}");

    // ---- 효력 기간: 서류가 입증하는 기간 밖의 귀속월은 그대로다 ----
    let restore = async || -> Result<()> {
        q(&c.db, "UPDATE rep, addr, acct SET excluded = false, ex_from = NONE, ex_to = NONE, excused = NONE WHERE excused != NONE;", json!({})).await?;
        super::t04_review::recalc(&c.db).await?;
        super::t09_again::remark(&c.db).await?;
        super::t11_signal::detect(&c.db).await
    };
    // 서류의 정리 값 가운데 기간을 바꾼다(None이면 찾지 못한 항목으로 둔다)
    let period = async |id: &str, value: Option<&str>| -> Result<()> {
        let mut t = q1(&c.db, "RETURN (SELECT VALUE tidy FROM doc WHERE clarify = type::record('clarify', $id) ORDER BY stamp DESC)[0];", json!({ "id": id })).await?;
        for e in t.as_array_mut().into_iter().flatten().filter(|e| e["item"] == "기간") {
            match value {
                Some(v) => e["value"] = json!(v),
                None => { e.as_object_mut().map(|o| o.remove("value")); e["words"] = json!([]); }
            }
        }
        q(&c.db, "UPDATE doc SET tidy = $t WHERE clarify = type::record('clarify', $id);", json!({ "id": id, "t": t })).await?;
        Ok(())
    };
    restore().await?;
    ensure!(shape().await? == before && marked().await? == 15 && rows(&bundle("2026-02").await?["reviews"]).len() == 3, "되돌린 뒤 {} {}", shape().await?, marked().await?);
    let p = open("p", "D-024", "D-011").await?;
    ensure!(up(&p, png1).await? == 200, "접수 p");
    fill().await?;
    period(&p, Some("2026-03-01~2026-04-30")).await?;
    ensure!(v(&p).await?["span"] == json!(["2026-03-01", "2026-04-30"]), "서류의 기간");
    ensure!(verdict(audit, &p, "인정", json!({ "class": "입증" })).await? == "", "기간이 있는 인정");
    ensure!(shape().await? == json!([3_888_097, "영업임원", 3, 1]), "기간 밖의 6월은 그대로 {}", shape().await?);
    ensure!(marked().await? == 13, "3·4월만 풀린다 {}", marked().await?);
    for (ym, t, n) in [("2026-02", 4_540_341, 3), ("2026-03", 2_638_344, 2), ("2026-04", 2_972_016, 2), ("2026-05", 4_505_596, 3)] {
        let b = bundle(ym).await?;
        ensure!(b["ratify"]["total"] == t && rows(&b["reviews"]).len() == n, "{ym}의 묶음 {b}");
    }
    ensure!(c.call(Some(c.token(audit)), "GET", "/api/reviews/2026-06-D-024", None).await?.0 == 404, "6월의 성일상사24는 따로 심사되지 않는다");
    // 기간이 없는 서류의 인정은 선의 전체 기간에 미친다(기본값)
    restore().await?;
    let n = open("n", "D-024", "D-011").await?;
    ensure!(up(&n, png1).await? == 200, "접수 n");
    fill().await?;
    period(&n, None).await?;
    ensure!(v(&n).await?["span"].is_null(), "기간 없음");
    ensure!(verdict(audit, &n, "인정", json!({ "class": "입증" })).await? == "", "기간이 없는 인정");
    let l = q1(&c.db, "RETURN (SELECT ex_from, ex_to FROM addr WHERE excluded);", json!({})).await?;
    ensure!(l == json!([{ "ex_from": null, "ex_to": null }]) && shape().await? == json!([2_699_051, "영업임원", 2, 1]), "기간이 없으면 제한 없음 {l} {}", shape().await?);
    ensure!(review("2026-06-D-024").await?["review"]["total"] == 1_189_046, "6월의 성일상사24");
    restore().await?;
    ensure!(shape().await? == before, "끝");
    none();
    Ok(())
}
