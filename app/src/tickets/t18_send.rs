//! 18 발송: 내부 감시가 정황에 요청을 내리면 소명이 요청 상태로 열리고(이벤트 `t18_request`) 영업지원의 발송 작업이 생긴다. 영업지원이 요청서를 발송으로 표시하면 기한이 붙는다.
//! 요청서 = 서류 목록(일치 종류로 정해진다. 가정, D17 — 이 파일의 `DOCS` 한 곳) + 글(AI가 초안을 쓰고 영업지원이 고친다. AI가 멈춰 있으면 글 없이 목록만으로 발송한다).
//! 발송은 표시일 뿐 실제로 보내지 않는다(모의 처리). 기한의 길이는 DB의 `fn::term()` 한 곳(가정, D32)이다.
//! 소명이 끝나기 전에는 식별자 선을 건드리지 않으므로 03의 계산은 그 대리점을 관련자로 계속 본다.
use super::t03_related::{ITEMS, links, matches};
use super::t17_report::{USE, model};
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, attempt, err, refuse};
use aisdk::core::LanguageModelRequest;
use aisdk::providers::openai::OpenAI;
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};
use std::collections::BTreeSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

pub const SCHEMA: &str = include_str!("../../db/18-발송.surql");

/// 요청서의 서류 목록(가정, D17 — 규정에 없는 목록): 일치 종류 → 서류. 순서가 요청서의 순서다. 출처는 가정
pub const DOCS: [(&str, &[&str]); 3] = [
    ("주소", &["임대차계약서", "사업자등록증"]),
    ("계좌", &["통장 사본", "예금주 확인서"]),
    ("대표자", &["생년월일을 확인할 수 있는 서류"]),
];
/// 초안을 다시 시도하는 간격(초). AI가 멈춰 있으면 이 간격으로만 다시 부른다
const RETRY: u64 = 60;
/// 요청서 글의 최대 길이(글자)
const CUT: usize = 2000;
/// AI 호출의 수(자동 검사가 "같은 소명에는 다시 부르지 않는다"를 셀 때 쓴다)
static CALLS: AtomicUsize = AtomicUsize::new(0);

pub fn routes() -> Router<Db> {
    Router::new().route("/clarifies/{id}", get(detail)).route("/signals/{id}/clarifies", get(of_signal)).route("/send", post(send))
}

// ---- 서류 목록 ----

/// 서류 목록: 일치 종류마다 `DOCS`의 서류를 `[종류, 서류]`로. 목록의 순서는 `DOCS`의 순서
fn docs_of(kinds: &BTreeSet<&str>) -> Vec<[String; 2]> {
    DOCS.iter().filter(|d| kinds.contains(d.0)).flat_map(|d| d.1.iter().map(|n| [d.0.to_string(), n.to_string()])).collect()
}

/// 그 소명의 일치 종류. 계좌 정황은 계좌, 동명 정황은 대표자(그 정황이 가리키는 일치 — 회수가 들어간 계좌는 등록된 선이 아니라 계산에서 나오지 않는다).
/// 그 밖의 정황(지연, 대사, 추인 …)은 대상(첫 대리점)과 나머지 대리점이 03의 계산으로 일치하는 종류. 대리점이 하나뿐이면 없다
async fn kinds(db: &Db, signal_kind: &str, dealers: &[String]) -> Result<BTreeSet<&'static str>> {
    match signal_kind {
        "계좌" => return Ok(BTreeSet::from(["계좌"])),
        "동명" => return Ok(BTreeSet::from(["대표자"])),
        _ => {}
    }
    let ls = links(db, None).await?;
    let mut set = BTreeSet::new();
    if let Some((first, rest)) = dealers.split_first() {
        for other in rest {
            set.extend(matches(&ls, first, other).into_iter().map(|i| ITEMS[i]));
        }
    }
    Ok(set)
}

/// 소명 한 건(root로 읽는다): 없으면 None. 서류 목록(`docs`)은 발송했으면 그때 남긴 것, 아니면 지금 계산한 것
async fn row(db: &Db, id: &str) -> Result<Option<(J, BTreeSet<&'static str>, Vec<[String; 2]>)>> {
    let c = q1(db, "
        LET $c = type::record('clarify', $id);
        RETURN (SELECT record::id(id) AS id, name, state, source, record::id(dealer) AS dealer, dealer.name AS dealer_name,
            IF signal THEN record::id(signal) END AS signal, signal.kind AS signal_kind, signal.name AS signal_name, signal.state AS signal_state,
            (pair ?? signal.dealers).map(|$d| record::id($d)) AS dealers, kind AS own_kind, docs, body, draft, draft_model,
            IF sent THEN time::format(sent, '%Y-%m-%d') END AS sent, IF due THEN time::format(due, '%Y-%m-%d') END AS due FROM $c)[0];", json!({ "id": id })).await?;
    if c.is_null() {
        return Ok(None);
    }
    let ds: Vec<String> = c["dealers"].as_array().into_iter().flatten().filter_map(|d| d.as_str().map(String::from)).collect();
    // 대리점이 먼저 낸 소명(20, D59)은 그 일치 종류 하나다
    let ks = match c["own_kind"].as_str().and_then(|k| ITEMS.iter().find(|i| **i == k)) {
        Some(k) => BTreeSet::from([*k]),
        None => kinds(db, c["signal_kind"].as_str().unwrap_or_default(), &ds).await?,
    };
    let docs = if c["sent"].is_null() {
        docs_of(&ks)
    } else {
        c["docs"].as_array().into_iter().flatten().filter_map(|d| Some([d[0].as_str()?.to_string(), d[1].as_str()?.to_string()])).collect()
    };
    Ok(Some((c, ks, docs)))
}

// ---- 요청서 초안(AI) ----

const SYSTEM: &str = "너는 판매장려금 심사에서 영업지원을 돕는 AI다. 내부 감시가 어느 대리점에 소명을 요청하기로 했다. 대리점에 보낼 요청서의 글 초안을 쓴다.
- 정중한 한국어로 두세 문장. 소명을 청하는 이유를 쓰되 의심한다거나 잘못이라고 단정하는 표현은 쓰지 않는다.
- 대리점 이름은 {dealer}로만 적는다(다른 {…}는 쓰지 않는다).
- 숫자(날짜, 금액, 기한, 건수)는 어디에도 쓰지 않는다. 서류 목록과 기한은 코드가 따로 붙인다.
- 요청할 서류가 없으면 서류를 말하지 않고 설명을 청한다.
- 글만 답한다(제목, 목록, 코드 울타리 없이).";

/// 초안의 꼴: 비어 있지 않고, 너무 길지 않고, 숫자가 없고, 값 자리는 {dealer}뿐이다
fn plain(t: &str) -> bool {
    let rest = t.replace("{dealer}", "");
    !t.trim().is_empty() && t.chars().count() <= CUT && !t.chars().any(|c| c.is_ascii_digit()) && !rest.contains(['{', '}'])
}
/// 값 자리를 코드가 채운다
fn fill(t: &str, dealer: &str) -> String {
    t.replace("{dealer}", dealer)
}

/// AI의 초안. 모델 이름이 `fixture`로 시작하면 OpenAI를 부르지 않고 고정한 글(`fixture-digit`은 숫자가 든 글, `fixture-down`은 응답 없음). 키가 없거나 응답이 없으면 None
async fn ask(model: &str, key: Option<&str>, name: &str, docs: &[[String; 2]]) -> Option<String> {
    if let Some(m) = model.strip_prefix("fixture") {
        return match m {
            "-down" => None,
            "-digit" => Some("{dealer} 귀하, 3일 안에 서류를 내 주십시오.".into()),
            _ if docs.is_empty() => Some("{dealer} 귀하, 확인이 필요한 사항이 있어 설명을 요청드립니다. 살펴본 뒤 결과를 알려 드리겠습니다.".into()),
            _ => Some("{dealer} 귀하, 확인이 필요한 사항이 있어 아래 서류의 제출을 요청드립니다. 서류를 살펴본 뒤 결과를 알려 드리겠습니다.".into()),
        };
    }
    if key.is_none_or(str::is_empty) {
        return None;
    }
    let list = docs.iter().map(|d| format!("{} {}", d[0], d[1])).collect::<Vec<_>>().join(", ");
    let mut req = LanguageModelRequest::builder()
        .model(OpenAI::<aisdk::core::DynamicModel>::model_name(model))
        .system(SYSTEM)
        .prompt(format!("대리점: {name}\n요청할 서류: {}", if list.is_empty() { "없음".into() } else { list }))
        .build();
    tokio::time::timeout(Duration::from_secs(120), req.generate_text()).await.ok()?.ok()?.text()
}

/// 그 소명의 초안을 쓴다. 시도한 때를 먼저 남기고(간격 동안 다시 부르지 않는다), 꼴이 맞는 글만 남긴다. 남겼으면 true
pub async fn draft(db: &Db, id: &str, key: Option<&str>) -> Result<bool> {
    let Some((c, _, docs)) = row(db, id).await? else { return Ok(false) };
    q(db, "UPDATE type::record('clarify', $id) SET draft_tried = time::now();", json!({ "id": id })).await?;
    CALLS.fetch_add(1, Ordering::Relaxed);
    let model = model();
    let Some(text) = ask(&model, key, c["dealer_name"].as_str().unwrap_or_default(), &docs).await.map(|t| t.trim().to_string()).filter(|t| plain(t)) else { return Ok(false) };
    q(db, "UPDATE type::record('clarify', $id) SET draft = $text, draft_model = $model;", json!({ "id": id, "text": text, "model": model })).await?;
    Ok(true)
}

/// 발송 전이고 초안이 없는 소명의 초안을 쓴다(앱이 도는 동안 몇 초마다 17의 일꾼이 부른다). AI가 멈춰 있으면 `RETRY` 간격으로만 다시 시도하고, 그동안에도 발송은 된다
pub async fn sweep(db: &Db) -> Result<()> {
    sweep_with(db, std::env::var("OPENAI_API_KEY").ok().as_deref()).await
}
/// `sweep`의 키를 인자로 뗀 것(자동 검사는 환경과 상관없이 키 없음을 탄다)
async fn sweep_with(db: &Db, key: Option<&str>) -> Result<()> {
    let ids = q1(db, &format!("
        RETURN (SELECT VALUE record::id(id) FROM clarify WHERE sent = NONE AND pair = NONE AND draft = NONE AND state = '요청' AND (draft_tried = NONE OR (time::now() - draft_tried) > {RETRY}s) ORDER BY id);"), json!({})).await?;
    for id in ids.as_array().into_iter().flatten().filter_map(|i| i.as_str()) {
        draft(db, id, key).await.ok();
    }
    Ok(())
}

// ---- 조회와 조치 ----

/// 소명 상세. 가운데: 소명(`clarify`: 이름, 상태, 대리점, 정황), 일치 종류(`kinds`)와 서류 목록(`docs`: `[종류, 서류]`. 발송했으면 그때의 것), 발송한 날(`sent`)과 기한(`due`), 발송한 요청서의 글(`body`).
/// 오른쪽: 요청서 초안(`draft`: 값 자리를 채운 글과 모델. 없으면 AI가 아직 쓰지 못했다), 지금 역할이 발송할 수 있는지(`can`), 담당하는 역할(`role`), 이력(`history`: 요청, 발송). 없는 소명은 404
async fn detail(State(db): State<Db>, Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let Some((c, ks, docs)) = row(&db, &id).await.map_err(|_| err(StatusCode::NOT_FOUND, "없음"))? else { return Err(err(StatusCode::NOT_FOUND, "없음")) };
    let r = q1(&me.db, "
        LET $c = type::record('clarify', $id);
        RETURN {
            can: fn::sendable($c),
            history: array::concat(
                (SELECT kind, role, time::format(at, '%Y-%m-%d') AS at, reason, source, <string> stamp AS stamp FROM ruling WHERE id = type::record('ruling', $id)),
                (SELECT '발송' AS kind, role, time::format(at, '%Y-%m-%d') AS at, NONE AS reason, source, <string> stamp AS stamp FROM dispatch WHERE clarify = $c),
                (SELECT kind, role, time::format(at, '%Y-%m-%d') AS at, reason, source, <string> stamp AS stamp FROM verdict WHERE clarify = $c),
                IF $c.pair != NONE THEN (SELECT '접수' AS kind, role, time::format(at, '%Y-%m-%d') AS at, NONE AS reason, source, <string> stamp AS stamp FROM doc WHERE clarify = $c ORDER BY stamp LIMIT 1) ELSE [] END),   -- 20(D59): 대리점이 먼저 낸 소명은 처음 서류를 받은 것이 접수   -- 20: 소명의 결과(인정·불인정·보완)
        };", json!({ "id": id })).await?;
    // 일어난 순서(보완 뒤에 다시 발송하면 줄이 섞이므로 시각으로 맞춘다)
    let mut r = r;
    if let Some(h) = r["history"].as_array_mut() {
        h.sort_by(|a, b| a["stamp"].as_str().cmp(&b["stamp"].as_str()));
    }
    let dealer = c["dealer_name"].as_str().unwrap_or_default();
    let draft = c["draft"].as_str().filter(|_| c["sent"].is_null()).map(|t| json!({ "text": fill(t, dealer), "model": c["draft_model"], "source": "AI" }));
    Ok(Json(json!({
        "clarify": { "id": c["id"], "name": c["name"], "state": c["state"], "source": c["source"],
            "dealer": { "id": c["dealer"], "name": c["dealer_name"] },
            "signal": if c["signal"].is_null() { J::Null } else { json!({ "id": c["signal"], "kind": c["signal_kind"], "name": c["signal_name"], "state": c["signal_state"] }) } },
        "kinds": DOCS.iter().map(|d| d.0).filter(|k| ks.contains(k)).collect::<Vec<_>>(),
        "docs": docs, "body": c["body"], "sent": c["sent"], "due": c["due"], "draft": draft,
        "role": if c["state"] == "접수" { "내부 감시" } else { "영업지원" }, "can": r["can"], "history": r["history"],
    })))
}

/// 그 정황에서 열린 소명들(정황 상세가 소명으로 가는 길)
async fn of_signal(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "RETURN (SELECT record::id(id) AS id, name, state FROM clarify WHERE signal = type::record('signal', $id) ORDER BY id);", json!({ "id": id })).await?;
    Ok(Json(r))
}

/// 발송으로 표시: `{ id, body? }`. 쓰기 전에 거절의 낱말을 정해 돌려주고(`refuse`: 대상 → 권한 → 상태), 역할의 세션으로 `dispatch`를 만든다. 서류 목록은 코드가 정한다(보낸 값은 받지 않는다).
/// 서류 목록이 비고(일치 종류가 없는 정황) 글도 없으면 보낼 것이 없어 대상이다. DB의 권한 규칙은 마지막 방어선이다
async fn send(State(db): State<Db>, Extension(me): Extension<Me>, Body(b): Body) -> R {
    let bad = || refuse("대상");
    let id = b["id"].as_str().filter(|i| !i.is_empty()).ok_or_else(bad)?;
    let text = match &b["body"] {
        J::Null => None,
        J::String(t) => Some(t.trim().to_string()).filter(|t| !t.is_empty()),
        _ => return Err(bad()),
    };
    if text.as_ref().is_some_and(|t| t.chars().count() > CUT) {
        return Err(bad());
    }
    let (_, _, docs) = row(&db, id).await.map_err(|_| bad())?.ok_or_else(bad)?;
    let mut vars = json!({ "id": id, "docs": docs, "empty": docs.is_empty() && text.is_none() });
    if let Some(t) = &text {
        vars["body"] = json!(t);
    }
    let made = attempt(&me.db, "
        LET $c = type::record('clarify', $id);
        RETURN IF $c.id = NONE THEN '대상' ELSE IF $auth.role != '영업지원' THEN '권한' ELSE IF !fn::sendable($c) THEN '상태' ELSE IF $empty THEN '대상' END;",
        "CREATE dispatch SET clarify = type::record('clarify', $id), body = $body, docs = $docs RETURN VALUE record::id(clarify);", vars).await?;
    Ok(Json(json!({ "id": made[0] })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docs_follow_the_kinds() {
        let all = BTreeSet::from(["대표자", "계좌", "주소"]);
        let names: Vec<_> = docs_of(&all).into_iter().map(|d| d[1].clone()).collect();
        assert_eq!(names, ["임대차계약서", "사업자등록증", "통장 사본", "예금주 확인서", "생년월일을 확인할 수 있는 서류"]);
        assert_eq!(docs_of(&BTreeSet::from(["계좌"])), [["계좌", "통장 사본"], ["계좌", "예금주 확인서"]].map(|d| d.map(String::from)));
        assert!(docs_of(&BTreeSet::new()).is_empty());
    }

    #[test]
    fn draft_must_be_plain() {
        assert!(plain("{dealer} 귀하, 서류를 부탁드립니다."));
        assert!(!plain("3일 안에 내 주십시오."));
        assert!(!plain("{amount} 귀하"));
        assert!(!plain("  "));
        assert_eq!(fill("{dealer} 귀하", "성일상사24"), "성일상사24 귀하");
    }
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let tasks = async |role: &str, kind: &str| -> Result<Vec<J>> {
        let t = c.get(role, "/api/tasks").await?;
        Ok(rows(&t[kind]).into_iter().filter(|m| m["kind"] == "발송").collect())
    };
    let rule = async |id: &str, kind: &str| c.post(audit, "/api/rule", if kind == "기각" { json!({ "id": id, "kind": kind, "reason": { "class": "정상" } }) } else { json!({ "id": id, "kind": kind }) }).await;
    let send = async |role: &str, id: &str, body: J| c.post(role, "/api/send", body.as_object().cloned().map_or(json!({ "id": id }), |mut o| { o.insert("id".into(), json!(id)); J::Object(o) })).await;
    let count = || q1(&c.db, "RETURN [count(SELECT id FROM clarify), count(SELECT id FROM dispatch), count(SELECT id FROM task WHERE kind = '발송')];", json!({}));
    let ids = async |signal: &str| q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM clarify WHERE signal = type::record('signal', $s));", json!({ "s": signal })).await;
    let (bank, name, near) = ("계좌-D-024", "동명-박준호", "근접-D-011");
    let draft_calls = || CALLS.load(Ordering::Relaxed);
    let none = || *USE.lock().unwrap() = None;

    // 요청 전: 소명도 발송 작업도 없다
    ensure!(count().await? == json!([0, 0, 0]) && tasks(support, "mine").await?.is_empty(), "요청 전");
    // 관련자의 계산은 소명이 생겨도 바뀌지 않는다: 요청 전의 그룹과 6월의 심사를 기억해 둔다
    let shape = async || -> Result<J> {
        let r = c.get(audit, "/api/dealers/D-024/related").await?;
        let rv = c.get(audit, "/api/reviews/2026-06-D-011").await?;
        Ok(json!([r["group"], r["near"], rv["review"]["total"], rv["review"]["approver"], rv["members"].as_array().map(|m| m.len()),
            q1(&c.db, "RETURN count(SELECT id FROM rep WHERE excluded = true) + count(SELECT id FROM addr WHERE excluded = true) + count(SELECT id FROM acct WHERE excluded = true);", json!({})).await?]))
    };
    let before = shape().await?;
    ensure!(before[0].as_array().is_some_and(|g| g.len() == 3) && before[5] == 0, "요청 전의 그룹 {before}");

    // 기각은 소명을 만들지 않는다. 영업지원은 요청할 수 없다
    ensure!(rule(name, "기각").await?.0 == 200 && count().await? == json!([0, 0, 0]), "기각");
    ensure!(c.post(support, "/api/rule", json!({ "id": bank, "kind": "요청" })).await?.0 == 403 && count().await? == json!([0, 0, 0]), "영업지원의 요청");

    // 요청: 소명 1(상태 요청, 서류 목록과 기한 없음), 영업지원의 담당에 발송 작업 1. 내부 감시는 진행, 영업임원·회계는 보지 못한다
    ensure!(rule(bank, "요청").await?.0 == 200 && count().await? == json!([1, 0, 1]), "요청");
    let cid = ids(bank).await?[0].as_str().unwrap_or_default().to_string();
    let t = tasks(support, "mine").await?;
    ensure!(t.len() == 1 && t[0]["view"] == "소명" && t[0]["target"] == cid.as_str() && t[0]["name"] == "계좌 · 성일상사24" && t[0]["role"] == support, "발송 작업 {t:?}");
    ensure!(tasks(audit, "going").await?.len() == 1 && tasks(audit, "mine").await?.is_empty() && tasks(exec, "mine").await?.is_empty() && tasks(acct, "going").await?.is_empty(), "다른 역할의 작업");
    let d = c.get(support, &format!("/api/clarifies/{cid}")).await?;
    ensure!(d["clarify"] == json!({ "id": cid, "name": "계좌 · 성일상사24", "state": "요청", "source": "계산", "dealer": { "id": "D-024", "name": "성일상사24" },
        "signal": { "id": bank, "kind": "계좌", "name": "계좌 · 성일상사24", "state": "요청" } }), "소명 {}", d["clarify"]);
    ensure!(d["sent"].is_null() && d["due"].is_null() && d["body"].is_null() && d["draft"].is_null() && d["can"] == true && d["role"] == support, "발송 전 {d}");
    // 서류 목록: 계좌 정황은 계좌의 서류(통장 사본, 예금주 확인서)
    ensure!(d["kinds"] == json!(["계좌"]) && d["docs"] == json!([["계좌", "통장 사본"], ["계좌", "예금주 확인서"]]), "서류 목록 {} {}", d["kinds"], d["docs"]);
    // 정황 상세에서 소명으로 가는 길
    ensure!(c.get(audit, &format!("/api/signals/{bank}/clarifies")).await? == json!([{ "id": cid, "name": "계좌 · 성일상사24", "state": "요청" }]), "정황의 소명");
    ensure!(c.call(Some(c.token(support)), "GET", "/api/clarifies/x", None).await?.0 == 404, "없는 소명");
    // 조치는 영업지원에게만 보인다
    for role in [exec, audit, acct] {
        ensure!(c.get(role, &format!("/api/clarifies/{cid}")).await?["can"] == false, "{role}에게 조치가 보임");
    }

    // 요청서 초안(AI): 자동 검사는 OpenAI를 부르지 않는다. 응답이 없으면 초안 없이 시도한 때만 남고, 간격 안에는 다시 부르지 않는다
    let base = draft_calls();
    *USE.lock().unwrap() = Some("fixture-down".into());
    sweep_with(&c.db, None).await?;
    sweep_with(&c.db, None).await?;
    ensure!(draft_calls() == base + 1 && c.get(support, &format!("/api/clarifies/{cid}")).await?["draft"].is_null(), "응답 없음 {}", draft_calls() - base);
    // 키가 없을 때(기본 모델)도 같다: 간격이 지나면 다시 시도하지만 초안은 없다
    none();
    q(&c.db, "UPDATE clarify SET draft_tried = NONE;", json!({})).await?;
    sweep_with(&c.db, None).await?;
    ensure!(draft_calls() == base + 2 && q1(&c.db, "RETURN (SELECT VALUE draft FROM clarify)[0];", json!({})).await?.is_null(), "키 없음");
    // 숫자가 든 글은 남기지 않는다
    *USE.lock().unwrap() = Some("fixture-digit".into());
    q(&c.db, "UPDATE clarify SET draft_tried = NONE;", json!({})).await?;
    sweep_with(&c.db, None).await?;
    ensure!(draft_calls() == base + 3 && q1(&c.db, "RETURN (SELECT VALUE draft FROM clarify)[0];", json!({})).await?.is_null(), "숫자가 든 초안");

    // AI가 멈춰 있어도 목록만으로 발송할 수 있다(글 없이). 다른 역할은 발송할 수 없고, 꼴이 틀린 요청은 대상이다
    ensure!(draft_calls() == base + 3, "발송이 AI를 부름");
    for role in [exec, audit, acct] {
        ensure!(send(role, &cid, json!({})).await? == (403, json!({ "error": "권한" })), "{role}의 발송");
    }
    ensure!(send(support, "x", json!({})).await? == (400, json!({ "error": "대상" })), "없는 소명");
    for body in [json!({ "id": 5 }), json!({ "id": "" }), json!([]), json!({ "id": cid, "body": 5 }), json!({ "id": cid, "body": ["x"] }), json!({ "id": cid, "body": "가".repeat(CUT + 1) })] {
        let (code, r) = c.post(support, "/api/send", body.clone()).await?;
        ensure!(code == 400 && r == json!({ "error": "대상" }), "틀린 본문 {body} → {code} {r}");
    }
    ensure!(count().await? == json!([1, 0, 1]), "거절된 발송이 남음");
    // DB를 직접 써도 마찬가지다: 영업지원은 소명을 고치지 못하고, 다른 역할은 발송 표시를 만들지 못하며, 기한은 보낸 값이 아니라 DB가 채운다
    for role in [exec, audit, acct] {
        let s = as_user(&c.db, c.token(role)).await?;
        q(&s, "CREATE dispatch SET clarify = type::record('clarify', $id), docs = [['계좌', 'x']], due = d'2030-01-01T00:00:00Z';", json!({ "id": cid })).await.ok();
    }
    let s = as_user(&c.db, c.token(support)).await?;
    for sql in ["UPDATE clarify SET state = '인정', sent = d'2020-01-01T00:00:00Z';", "DELETE clarify; DELETE task;", "UPDATE task SET state = '완료';"] {
        q(&s, sql, json!({})).await.ok();
    }
    ensure!(count().await? == json!([1, 0, 1]) && c.get(support, &format!("/api/clarifies/{cid}")).await?["clarify"]["state"] == "요청", "직접 쓴 뒤");
    let today = c.get(support, "/api/state").await?["today"].clone();
    ensure!(today == "2026-07-01", "오늘 {today}");

    // 발송: 글 없이. 서류 목록이 남고 기한은 14일 뒤, 작업은 끝나며 상태는 요청 그대로다. 남의 이름·기한을 적어 보내도 DB가 채운 값이 남는다
    ensure!(send(support, &cid, json!({ "docs": [["주소", "x"]], "due": "2030-01-01", "by": "staff:exec" })).await?.0 == 200, "발송");
    let d = c.get(support, &format!("/api/clarifies/{cid}")).await?;
    ensure!(d["sent"] == "2026-07-01" && d["due"] == "2026-07-15" && d["body"].is_null() && d["clarify"]["state"] == "요청" && d["can"] == false, "발송 뒤 {d}");
    ensure!(d["docs"] == json!([["계좌", "통장 사본"], ["계좌", "예금주 확인서"]]), "발송한 목록 {}", d["docs"]);
    ensure!(d["history"].as_array().is_some_and(|h| h.len() == 2) && d["history"][0]["kind"] == "요청" && d["history"][0]["role"] == audit && d["history"][1]["kind"] == "발송" && d["history"][1]["role"] == support && d["history"][1]["at"] == "2026-07-01", "이력 {}", d["history"]);
    ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM dispatch)[0] = staff:support;", json!({})).await? == true, "발송한 직원");
    ensure!(tasks(support, "mine").await?.is_empty() && tasks(support, "going").await?.is_empty() && count().await? == json!([1, 1, 1]), "발송 뒤의 작업");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE state FROM task WHERE kind = '발송')[0];", json!({})).await? == "완료", "작업 상태");
    // 한 번뿐이다: 다시 발송하면 상태
    ensure!(send(support, &cid, json!({})).await? == (400, json!({ "error": "상태" })), "다시 발송");
    // 소명이 끝나기 전에는 관련자로 계속 본다: 그룹, 일치, 6월 심사의 구성·합산·승인권자가 그대로이고 제외된 선이 없다(D32)
    ensure!(shape().await? == before, "발송 뒤의 관련자 {} / {before}", shape().await?);

    // 초안이 있는 소명: 요청 → 초안(값 자리는 코드가 채운다) → 영업지원이 고쳐서 발송. 초안은 한 번만 쓴다. 발송한 뒤에는 초안이 아니라 보낸 글이 남는다
    ensure!(rule(near, "요청").await?.0 == 200, "근접의 요청");
    let near_id = ids(near).await?[0].as_str().unwrap_or_default().to_string();
    // 일치 종류가 없는 정황(근접): 서류 목록이 비어 있다. 글도 없으면 보낼 것이 없다
    let d = c.get(support, &format!("/api/clarifies/{near_id}")).await?;
    ensure!(d["kinds"] == json!([]) && d["docs"] == json!([]), "근접의 서류 {d}");
    ensure!(send(support, &near_id, json!({})).await? == (400, json!({ "error": "대상" })) && send(support, &near_id, json!({ "body": "  " })).await? == (400, json!({ "error": "대상" })), "보낼 것 없음");
    *USE.lock().unwrap() = Some("fixture".into());
    let base = draft_calls();
    sweep_with(&c.db, None).await?;
    sweep_with(&c.db, None).await?;
    ensure!(draft_calls() == base + 1, "초안은 한 번만 쓴다 {}", draft_calls() - base);
    let d = c.get(support, &format!("/api/clarifies/{near_id}")).await?;
    let text = d["draft"]["text"].as_str().unwrap_or_default().to_string();
    ensure!(text.starts_with("금강상사11 귀하") && !text.contains('{') && d["draft"]["model"] == "fixture" && d["draft"]["source"] == "AI", "초안 {}", d["draft"]);
    ensure!(!text.contains("서류"), "서류가 없는 소명의 초안이 서류를 말함");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE draft FROM clarify WHERE id = type::record('clarify', $id))[0];", json!({ "id": near_id })).await?.as_str().is_some_and(|t| t.starts_with("{dealer}")), "저장된 초안은 값 자리");
    // 이미 발송한 소명은 초안을 다시 쓰지 않는다
    ensure!(q1(&c.db, "RETURN (SELECT VALUE draft FROM clarify WHERE id = type::record('clarify', $id))[0];", json!({ "id": cid })).await?.is_null(), "발송한 소명의 초안");
    // 동시에 셋을 보내면 하나만 되고 진 쪽은 상태다
    let mine = "금강상사11 귀하, 고친 글입니다.";
    let all = tokio::join!(send(support, &near_id, json!({ "body": mine })), send(support, &near_id, json!({ "body": mine })), send(support, &near_id, json!({ "body": mine })));
    let mut got = [all.0?, all.1?, all.2?];
    got.sort_by_key(|g| g.0);
    ensure!(got[0].0 == 200 && got[1] == (400, json!({ "error": "상태" })) && got[1] == got[2], "동시에 보낸 발송 {got:?}");
    ensure!(count().await? == json!([2, 2, 2]), "동시 발송 뒤");
    let d = c.get(support, &format!("/api/clarifies/{near_id}")).await?;
    ensure!(d["body"] == mine && d["draft"].is_null() && d["docs"] == json!([]) && d["due"] == "2026-07-15", "보낸 글 {d}");
    none();
    ensure!(shape().await? == before, "두 번째 발송 뒤의 관련자");

    // 그 밖의 정황(여기서는 기타)은 대상과 나머지 대리점의 일치로 정한다: 성일상사24와 금강상사11은 주소·대표자가 같다(D17의 순서: 주소, 대표자). 동명은 대표자뿐이다
    q(&c.db, "RETURN fn::signal('기타', 't18', 't18', [dealer:`D-024`, dealer:`D-011`], [], '계산');", json!({})).await?;
    ensure!(rule("기타-t18", "요청").await?.0 == 200, "기타의 요청");
    let other = ids("기타-t18").await?[0].as_str().unwrap_or_default().to_string();
    let d = c.get(support, &format!("/api/clarifies/{other}")).await?;
    ensure!(d["kinds"] == json!(["주소", "대표자"]) && d["docs"] == json!([["주소", "임대차계약서"], ["주소", "사업자등록증"], ["대표자", "생년월일을 확인할 수 있는 서류"]]), "기타의 서류 {} {}", d["kinds"], d["docs"]);
    ensure!(rule(name, "요청").await?.0 == 400, "기각된 정황의 요청");
    Ok(())
}
