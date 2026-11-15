//! 17 보고: AI가 정황을 조사해 쓴 보고(D4, D22, D24)와 내부 감시의 채택·불채택(선 29).
//! AI는 DB를 읽기만 하고 쓸 수 있는 것은 보고뿐이다 — AI의 접속 계정(`staff:ai`, 역할 AI)의 권한을 DB가 강제한다(app/db/17-보고.surql).
//! 사실은 기록을 가리키기만 한다: AI는 가리킬 기록(`ref`)과 값 자리({dealer} …)만 있는 문장 틀을 주고, 값은 보일 때 코드가 그 기록에서 읽는다(`fn::evidence`, 근거 표와 같은 값).
//! 없는 기록을 가리켰거나 틀이 맞지 않으면 보고는 오류가 되고 내부 감시에 올라가지 않는다(채택할 수 없다). AI가 응답하지 않으면 대기로 남고 다른 조치는 그대로 된다.
//! 모델은 환경변수 `OPENAI_MODEL`(기본 `gpt-6.1-terra`). 이름이 `fixture`로 시작하면 OpenAI를 부르지 않고 고정한 응답을 쓴다(자동 검사용).
use crate::check::Check;
use crate::db::{Db, as_user, q, q1, signin};
use crate::orig::sha;
use crate::{Body, Me, R, attempt, err, refuse};
use aisdk::core::utils::step_count_is;
use aisdk::core::{LanguageModelRequest, Tool};
use aisdk::core::tools::ToolExecute;
use aisdk::providers::openai::OpenAI;
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const SCHEMA: &str = include_str!("../../db/17-보고.surql");
pub const MODEL: &str = "gpt-6.1-terra";
/// 대기인 보고를 자동으로 다시 시도하는 간격(초). 내부 감시가 조사를 누르면 간격을 보지 않는다
const RETRY: u64 = 60;
/// AI가 한 번 읽어 올 수 있는 글자 수
const CUT: usize = 6000;
/// 가리킬 수 있는 기록: `fn::evidence`가 값을 읽어 주는 종류
const CITE: [&str; 7] = ["deposit", "payout", "rep", "addr", "acct", "recon", "incident"];
/// 문장 틀의 값 자리
const SLOTS: [&str; 7] = ["dealer", "node", "amount", "item", "at", "ym", "value"];

/// AI 호출의 수(자동 검사가 "같은 입력에는 다시 부르지 않는다"를 셀 때 쓴다)
static CALLS: AtomicUsize = AtomicUsize::new(0);
/// 한 번에 하나만 쓴다(같은 입력의 보고가 둘 생기지 않게)
static BUSY: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
/// 자동 검사가 모델을 갈아 끼우는 자리
pub(super) static USE: Mutex<Option<String>> = Mutex::new(None);

pub(super) fn model() -> String {
    USE.lock().unwrap().clone().or_else(|| std::env::var("OPENAI_MODEL").ok().filter(|m| !m.is_empty())).unwrap_or_else(|| MODEL.into())
}
/// AI 접속 계정의 패스워드. DB 접속 패스워드에서 정해지므로 따로 둘 것이 없다(접속 경로는 서버뿐이다)
pub fn ai_pass() -> String {
    sha(&format!("ai:{}", std::env::var("SURREAL_PASS").unwrap_or_else(|_| "root".into())))
}
/// AI의 토큰은 받아 두고 다시 쓴다(일꾼이 몇 초마다 부른다 — 부를 때마다 로그인·인증하면 세션이 쌓이고 느리다).
/// 다시 적재해 토큰이 무효가 되면 인증이 실패하므로 그때 새로 받는다
static AI_TOKEN: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
pub(super) async fn ai_session(db: &Db) -> Result<Db> {
    let held = AI_TOKEN.lock().unwrap().clone();
    if let Some(t) = held {
        if let Ok(s) = as_user(db, &t).await {
            return Ok(s);
        }
    }
    let t = signin(db, "ai", &ai_pass()).await?;
    *AI_TOKEN.lock().unwrap() = Some(t.clone());
    as_user(db, &t).await
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/signals/{id}/report", get(detail)).route("/investigate", post(investigate)).route("/adopt", post(adopt))
}

/// 보고의 입력: 정황의 종류, 이름, 대리점, 근거 기록과 그 값. 같으면 저장된 보고를 쓴다. 없는 정황이면 None
pub(super) async fn basis(db: &Db, id: &str) -> Result<Option<J>> {
    let mut b = q1(db, "
        LET $s = type::record('signal', $id);
        RETURN IF count(SELECT id FROM $s) = 0 THEN NONE ELSE {
            kind: $s.kind, name: $s.name, dealers: $s.dealers.map(|$d| { id: record::id($d), name: $d.name }),
            evidence: ($s.evidence ?? []).map(|$e| fn::evidence($e)),
        } END;", json!({ "id": id })).await?;
    if b.is_null() {
        return Ok(None);
    }
    // 근거 표의 순서(11): 회수·지급이 날짜순으로 먼저, 그다음 식별자 선이 대리점순
    let text = |v: &J| v.as_str().unwrap_or_default().to_string();
    if let Some(ev) = b["evidence"].as_array_mut() {
        ev.sort_by_key(|e| (e["at"].is_null() && e["ym"].is_null(), text(&e["at"]), text(&e["ym"]), text(&e["dealer"]["id"])));
    }
    Ok(Some(b))
}

// ---- 문장 틀: 값은 코드가 채운다 ----

/// 틀을 훑는다: 값 자리가 아닌 {…}가 있거나 닫히지 않았거나, 값 자리 밖에 숫자가 있으면 거짓
fn plain(text: &str) -> bool {
    let mut rest = text;
    while let Some(i) = rest.find('{') {
        if rest[..i].chars().any(|c| c.is_ascii_digit()) { return false; }
        let Some(j) = rest[i..].find('}') else { return false };
        if !SLOTS.contains(&&rest[i + 1..i + j]) { return false; }
        rest = &rest[i + j + 1..];
    }
    !text.is_empty() && !rest.chars().any(|c| c.is_ascii_digit())
}
pub(crate) fn comma(n: i64) -> String {
    let s = n.abs().to_string();
    let g = s.as_bytes().rchunks(3).rev().map(|c| std::str::from_utf8(c).unwrap_or_default()).collect::<Vec<_>>().join(",");
    if n < 0 { format!("-{g}") } else { g }
}
/// 틀의 값 자리를 그 기록(`fn::evidence`의 값)에서 읽어 채운다. 그 기록에 없는 값은 `없음`
fn fill(text: &str, ev: &J) -> String {
    parts(text, ev).into_iter().map(|(t, _)| t).collect()
}
/// `fill`을 조각으로: (글, 코드가 채운 값인가). 화면은 값 조각을 줄바꿈 없이 보인다
fn parts(text: &str, ev: &J) -> Vec<(String, bool)> {
    let get = |k: &str| match k {
        "dealer" | "node" => ev[k]["name"].as_str().map(String::from),
        "amount" => ev[k].as_i64().map(comma),
        _ => ev[k].as_str().map(String::from),
    };
    let (mut out, mut rest) = (vec![], text);
    while let Some(i) = rest.find('{') {
        let Some(j) = rest[i..].find('}') else { break };
        out.push((rest[..i].to_string(), false));
        out.push((get(&rest[i + 1..i + j]).unwrap_or_else(|| "없음".into()), true));
        rest = &rest[i + j + 1..];
    }
    out.push((rest.to_string(), false));
    out
}

/// 변경(사건)을 가리킨 사실의 틀은 코드가 정한다: 사건의 값 자리는 item = 변경, value = 바뀐 항목이라 AI의 틀이 `변경 변경 … 값 주소` 같은 기계 문장이 되었다
const CHANGE: &str = "{dealer} {value} 변경 {at} 신고";
fn said(f: &J) -> &str {
    if f["ref"].as_str().is_some_and(|r| r.starts_with("incident:")) { CHANGE } else { f["text"].as_str().unwrap_or_default() }
}

/// 식별자 기록(rep · addr · acct)을 가리킨 사실의 구조: 종류(대표자 · 주소 · 계좌), 대리점, 값. 화면이 대리점끼리 비교 표로 묶는다. 다른 기록이면 null
fn ident(f: &J) -> J {
    let (r, c) = (f["ref"].as_str().unwrap_or_default(), &f["cited"]);
    if !["rep:", "addr:", "acct:"].iter().any(|t| r.starts_with(t)) { return J::Null }
    json!({ "item": c["item"], "dealer": c["dealer"], "value": c["node"]["name"] })
}

/// AI의 답(글)에서 JSON을 꺼내 꼴을 본다. 틀린 곳이 있으면 오류의 낱말: 꼴(JSON이나 칸이 틀림) · 값(문장 틀이 틀림) · 기록(없는 기록을 가리킴)
pub(super) struct Shape { facts: Vec<(String, String)>, guess: Vec<String>, unknown: Vec<String>, action: String, opinion: String, counter: String }
pub(super) fn shape(raw: &str) -> Result<Shape, &'static str> {
    let (a, b) = (raw.find('{').ok_or("꼴")?, raw.rfind('}').ok_or("꼴")?);
    let v: J = serde_json::from_str(&raw[a..=b]).map_err(|_| "꼴")?;
    let list = |k: &str| v[k].as_array().map(|l| l.iter().map(|x| x.as_str().map(String::from)).collect::<Option<Vec<_>>>()).ok_or("꼴")?.ok_or("꼴");
    let facts: Vec<(String, String)> = v["facts"].as_array().ok_or("꼴")?.iter()
        .map(|f| Some((f["ref"].as_str()?.to_string(), f["text"].as_str()?.to_string()))).collect::<Option<_>>().ok_or("꼴")?;
    let (action, opinion) = (v["opinion"]["action"].as_str().ok_or("꼴")?, v["opinion"]["text"].as_str().ok_or("꼴")?);
    if facts.is_empty() || facts.len() > 8 || !["요청", "기각"].contains(&action) || opinion.is_empty() {
        return Err("꼴");
    }
    if !facts.iter().all(|(_, t)| plain(t)) {
        return Err("값");
    }
    Ok(Shape { facts, guess: list("guess")?, unknown: list("unknown")?, action: action.into(), opinion: opinion.into(), counter: v["counter"].as_str().unwrap_or("").into() })
}
/// 가리킨 기록이 실제로 있는지 코드가 본다. 있으면 그 기록의 id(저장하는 꼴)
async fn exists(db: &Db, r: &str) -> Option<String> {
    let id = q1(db, "RETURN IF record::tb(type::record($r)) INSIDE $tables AND type::record($r).id != NONE THEN <string> type::record($r) END;", json!({ "r": r, "tables": CITE })).await.ok()?;
    id.as_str().map(String::from)
}

// ---- AI ----

const SYSTEM: &str = "너는 판매장려금 심사에서 내부 감시를 돕는 조사 담당 AI다. 주어진 정황을 조사해 보고를 JSON 하나로만 답한다(다른 글, 코드 울타리 없이).
DB는 read_db 도구로 읽는다(SurrealQL의 SELECT와 RETURN만. 쓰기는 되지 않는다). 테이블: dealer(name) · rep/addr/acct(대리점 → 사람/주소/계좌 선. 속성 since, via) · deposit(date, amount. ->deposit_of->dealer, ->deposit_into->account) · payout(ym, amount. ->payout_of->dealer) · review · signal · ruling · recon. id에 -가 있으면 `D-024`처럼 백틱으로 감싼다.
규칙:
- facts(사실): 기록을 가리키기만 한다. 항목마다 ref(기록의 id: 정황의 근거 목록이나 도구 결과에 나온 id 그대로. deposit, payout, rep, addr, acct, recon, incident 기록만)와 text(문장의 틀)를 준다. 금액, 이름, 날짜, 계좌는 직접 쓰지 말고 {dealer} {node} {amount} {item} {at} {ym} {value} 자리 표시로만 쓴다(그 기록이 가진 값만 채워진다). 틀의 나머지 글에는 숫자를 쓰지 않는다. 값은 무엇이 올지 모르므로 값 자리 바로 뒤에 은/는, 이/가, 을/를, 과/와 같은 조사를 붙이지 않는다(\"{dealer}의 {at} 회수\", \"계좌 {node}\"처럼 조사가 필요 없게 쓴다). 사실은 1~6개.
- guess(추정): 사실에서 이끌어 낸 짐작. 문자열 목록.
- unknown(미확인): 기록으로 확인되지 않아 사람이 확인해야 할 것. 문자열 목록.
- opinion(의견): action(요청 또는 기각)과 text. 요청은 대리점에 소명을 청하는 것, 기각은 정황이 아니라고 보는 것이다.
- counter(반론): 그 의견에 가장 강한 반대. 문자열.
- 확신을 숫자나 퍼센트로 쓰지 않는다. 합산, 승인권자, 관련자 여부, 심사의 결정은 코드와 사람이 정한다. 너는 만들지도 고치지도 않는다.
- 한국어로 쓴다.
출력: {\"facts\":[{\"ref\":\"deposit:...\",\"text\":\"...\"}],\"guess\":[\"...\"],\"unknown\":[\"...\"],\"opinion\":{\"action\":\"요청\",\"text\":\"...\"},\"counter\":\"...\"}";

#[derive(serde::Deserialize, schemars::JsonSchema)]
#[allow(dead_code)] // 입력의 꼴은 모델에게 보이는 스키마로만 쓰인다
struct ReadInput {
    /// SurrealQL의 SELECT 또는 RETURN 문
    query: String,
}

/// DB의 출처 `시연`은 사람이 화면에서 한 조치(변경 신고·결정·요청 …)로 생긴 기록이다. AI가 이것을 "시연 기록"으로 부르지 않게
/// 도구의 결과에서 그 값을 `화면 입력`으로 바꿔 건넨다(지시문 SOURCE가 뜻을 적는다). DB와 화면의 값은 그대로다
pub(super) const HUMAN: &str = "화면 입력";
fn human(v: &mut J) {
    match v {
        J::Object(o) => {
            for (k, x) in o.iter_mut() {
                if k == "source" && x == "시연" {
                    *x = json!(HUMAN);
                } else {
                    human(x);
                }
            }
        }
        J::Array(a) => a.iter_mut().for_each(human),
        _ => {}
    }
}

/// 지시문에 덧붙이는 출처의 뜻(보고·대화가 같이 쓴다)
pub(super) const SOURCE: &str = "기록의 source 칸: 원본은 원본 데이터의 값, 화면 입력은 사람이 이 화면에서 한 조치(식별자 변경 신고, 결정, 요청 등)로 생긴 기록, 계산은 코드가 계산한 값이다. 화면 입력인 기록은 사람이 한 일로 쓴다(변경은 \"○○상사 주소 변경 2026-06-20 신고\"처럼 대리점 · 바뀐 항목 · 변경일로).";

/// DB를 읽는 도구가 하는 일. AI의 세션으로 실행하므로 쓰기는 DB가 거절한다. 쓰는 글자가 보이면 보내지도 않는다
pub(super) async fn read_db(ai: &Db, sql: &str) -> String {
    let up = sql.to_uppercase();
    if ["CREATE", "UPDATE", "DELETE", "RELATE", "INSERT", "UPSERT", "DEFINE", "REMOVE", "ALTER"].iter().any(|w| up.contains(w)) {
        return "읽기만 된다".into();
    }
    match q(ai, sql, json!({})).await {
        Ok(v) => {
            let mut v = json!(v);
            human(&mut v);
            v.to_string().chars().take(CUT).collect()
        }
        Err(e) => format!("오류: {e}"),
    }
}

/// DB를 읽는 도구(`read_db`). 보고와 대화가 같이 쓴다. `seen`은 도구가 한 번 읽을 때마다 그 결과 글을 받는다(읽은 횟수, 조회한 기록 목록)
pub(super) fn read_tool(ai: &Db, seen: Arc<dyn Fn(&str) + Send + Sync>) -> Result<Tool, &'static str> {
    Tool::builder()
        .name("read_db")
        .description("DB를 읽는다. SurrealQL의 SELECT 또는 RETURN 문 하나를 받아 결과를 JSON 글로 돌려준다")
        .input_schema(schemars::schema_for!(ReadInput))
        .execute(ToolExecute::from_async({
            let ai = ai.clone();
            move |_, input: J| {
                let (ai, seen) = (ai.clone(), seen.clone());
                async move {
                    let out = read_db(&ai, input["query"].as_str().unwrap_or("")).await;
                    seen(&out);
                    Ok(out)
                }
            }
        }))
        .build()
        .map_err(|_| "응답")
}

/// AI의 답(글)과 DB를 읽은 횟수. 오류의 낱말: 키(OpenAI 접속 키가 없다) · 응답(응답이 없거나 늦다)
pub(super) async fn ask(model: &str, key: Option<&str>, ai: &Db, basis: &J, today: &str) -> Result<(String, usize), &'static str> {
    if model.starts_with("fixture") {
        return canned(model, basis).map(|s| (s, 0)).ok_or("응답");
    }
    if key.is_none_or(str::is_empty) {
        return Err("키");
    }
    let reads = Arc::new(AtomicUsize::new(0));
    let tool = read_tool(ai, { let reads = reads.clone(); Arc::new(move |_| { reads.fetch_add(1, Ordering::Relaxed); }) })?;
    let prompt = format!("오늘은 {today}이다. 아래 정황을 조사해 보고를 쓴다.\n{}", serde_json::to_string_pretty(basis).unwrap_or_default());
    let mut req = LanguageModelRequest::builder()
        .model(OpenAI::<aisdk::core::DynamicModel>::model_name(model))
        .system(format!("{SYSTEM}\n{SOURCE}"))
        .prompt(prompt)
        .with_tool(tool)
        .stop_when(step_count_is(8))
        .build();
    let res = tokio::time::timeout(Duration::from_secs(120), req.generate_text()).await.map_err(|_| "응답")?.map_err(|_| "응답")?;
    Ok((res.text().ok_or("응답")?, reads.load(Ordering::Relaxed)))
}

/// 자동 검사용으로 고정한 응답. `fixture`는 근거 기록을 가리키는 정상 보고, 나머지는 어긋난 응답(`fixture-gap` 없는 기록, `fixture-digit` 문장 틀에 숫자,
/// `fixture-kind` 의견의 조치가 틀림)이고 `fixture-down`은 응답이 없다
fn canned(model: &str, b: &J) -> Option<String> {
    let ev = b["evidence"].as_array()?;
    let tpl = |e: &J| match e["item"].as_str() {
        Some("회수") => "{dealer}의 {at} 회수가 {node}에 들어갔다",
        Some("지급") => "{dealer}의 {ym} 지급 {amount}",
        Some("대사") => "{dealer}의 {ym} 대사 불일치 {value}",
        Some("변경") => "{dealer}의 {at} {item} {value} 변경 {node}",
        _ => "{dealer}의 {item} 등록 {node}",
    };
    // 앞의 셋에 더해 변경(사건)이 근거에 있으면 그것도 가리킨다(재접수의 새 근거)
    let mut facts: Vec<J> = ev.iter().enumerate().filter(|(i, e)| *i < 3 || e["item"] == "변경").map(|(_, e)| e).map(|e| json!({ "ref": e["id"], "text": tpl(e) })).collect();
    let mut opinion = json!({ "action": "요청", "text": "근거가 서로 이어져 있어 대리점에 소명을 청해 볼 만하다" });
    match model {
        "fixture" => {}
        "fixture-gap" => facts.push(json!({ "ref": "payout:`RB-없음`", "text": "{dealer}의 {ym} 지급" })),
        "fixture-digit" => facts = vec![json!({ "ref": ev.first()?["id"], "text": "회수 3건이 같은 계좌로 들어갔다" })],
        "fixture-kind" => opinion["action"] = json!("승인"),
        _ => return None,
    }
    Some(json!({ "facts": facts, "guess": ["두 대리점이 같은 계좌를 쓰는 사이일 수 있다"], "unknown": ["계좌 예금주"], "opinion": opinion, "counter": "계좌를 잠시 빌려 쓴 것일 수 있다" }).to_string())
}

// ---- 보고를 만든다 ----

/// 그 정황의 보고를 만든다(없으면). 같은 입력에는 저장된 보고를 쓰고 AI를 다시 부르지 않는다. 돌려주는 것은 보고의 상태.
/// 대기(AI가 응답하지 않았다)는 간격(`RETRY`)이 지나야 자동으로 다시 시도하고, 오류는 내부 감시가 조사를 눌러야(`manual`) 다시 쓴다.
/// AI의 쓰기는 모두 AI의 세션으로 한다(DB의 권한이 보고 말고는 막는다)
pub async fn make(db: &Db, id: &str, manual: bool) -> Result<String> {
    let _one = BUSY.lock().await;
    let Some(b) = basis(db, id).await? else { anyhow::bail!("없는 정황") };
    let (input, model, ai) = (sha(&b.to_string()), model(), ai_session(db).await?);
    let prev = q1(db, &format!("
        RETURN (SELECT <string> id AS id, state, (time::now() - tried) > {RETRY}s AS old FROM report WHERE target = type::record('signal', $id) AND input = $input ORDER BY born DESC LIMIT 1)[0];"),
        json!({ "id": id, "input": input })).await?;
    let text = |k: &str| prev[k].as_str().map(String::from);
    let rid = match (text("state").as_deref(), manual) {
        (Some(s @ ("검토" | "채택" | "불채택")), _) | (Some(s @ "오류"), false) => return Ok(s.into()),
        (Some("대기"), false) if prev["old"] != true => return Ok("대기".into()),
        (Some("대기"), _) => text("id").unwrap_or_default(),
        _ => q1(&ai, "RETURN (CREATE report SET target = type::record('signal', $id), input = $input, model = $model)[0].id;", json!({ "id": id, "input": input, "model": model })).await?.as_str().unwrap_or_default().into(),
    };
    ensure!(!rid.is_empty(), "보고를 만들지 못했다");
    let key = std::env::var("OPENAI_API_KEY").ok();
    let today = q1(db, "RETURN time::format(fn::today(), '%Y-%m-%d');", json!({})).await?;
    CALLS.fetch_add(1, Ordering::Relaxed);
    let (raw, reads) = match ask(&model, key.as_deref(), &ai, &b, today.as_str().unwrap_or_default()).await {
        Ok(r) => r,
        Err(_) => {
            // 응답이 없다: 대기로 남는다(시도한 때만 남기고 다음 간격에 다시 시도한다)
            q(&ai, "UPDATE type::record($rid) SET model = $model;", json!({ "rid": rid, "model": model })).await?;
            return Ok("대기".into());
        }
    };
    let made = verify(db, &raw).await;
    settle(&ai, &rid, &model, reads, made).await
}

pub(super) type Made = (Shape, Vec<J>);
/// AI의 답을 본다: 꼴과 문장 틀(shape), 가리킨 기록이 실제로 있는지. 틀린 곳은 오류의 낱말
pub(super) async fn verify(db: &Db, raw: &str) -> Result<Made, &'static str> {
    let s = shape(raw)?;
    let mut facts = vec![];
    for (r, t) in &s.facts {
        facts.push(exists(db, r).await.map(|r| json!({ "ref": r, "text": t })).ok_or("기록"));
    }
    facts.into_iter().collect::<Result<Vec<_>, _>>().map(|f| (s, f))
}
/// 본 결과를 AI의 세션으로 보고(`rid`, 대기)에 올린다. 검토로 올리려다 DB가 막으면(빈 결과) 오류로 남긴다. 돌려주는 것은 보고의 상태
pub(super) async fn settle(ai: &Db, rid: &str, model: &str, reads: usize, made: Result<Made, &'static str>) -> Result<String> {
    let vars = |extra: J| { let mut v = json!({ "rid": rid, "model": model, "reads": reads }); v.as_object_mut().unwrap().extend(extra.as_object().cloned().unwrap_or_default()); v };
    let up = match &made {
        Ok((s, facts)) => q1(ai, "
            RETURN (UPDATE type::record($rid) SET state = '검토', facts = $facts.map(|$f| { ref: type::record($f.ref), text: $f.text }), guess = $guess, unknown = $unknown,
                opinion = { action: $action, text: $opinion }, counter = IF string::len($counter) > 0 THEN $counter END, reads = $reads, model = $model, error = NONE);",
            vars(json!({ "facts": facts, "guess": s.guess, "unknown": s.unknown, "action": s.action, "opinion": s.opinion, "counter": s.counter }))).await.ok().filter(|r| r.as_array().is_some_and(|a| !a.is_empty())),
        Err(_) => None,
    };
    if up.is_some() {
        return Ok("검토".into());
    }
    let word = made.err().unwrap_or("기록");
    q(ai, "UPDATE type::record($rid) SET state = '오류', error = $error, reads = $reads, model = $model;", vars(json!({ "error": word }))).await?;
    Ok("오류".into())
}

/// 접수된 정황 가운데 보고가 없는 것의 보고를 만든다(정황이 접수되면 보고가 만들어진다). 한 정황이 실패해도 나머지는 만든다
pub async fn sweep(db: &Db) -> Result<()> {
    let ids = q1(db, "RETURN (SELECT VALUE record::id(id) FROM signal WHERE state = '접수' ORDER BY id);", json!({})).await?;
    for id in ids.as_array().into_iter().flatten().filter_map(|i| i.as_str()) {
        make(db, id, false).await.ok();
    }
    Ok(())
}
/// 앱이 도는 동안 몇 초마다 `sweep`을 부른다
pub async fn work(db: std::sync::Arc<Db>) {
    loop {
        sweep(&db).await.ok();
        super::t18_send::sweep(&db).await.ok();
        super::t19_docs::sweep(&db).await.ok();
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

// ---- 조회와 조치 ----

/// 정황의 보고(가장 새것). `report`는 없으면 null. 사실의 값은 코드가 가리킨 기록에서 읽어 채우고(`facts[].text`, 식별자 기록이면 그 구조 `facts[].id`),
/// 오류인 보고와 대기인 보고에는 내용이 없다. 조치 뒤에야 의견이 열리는 정황(`fn::gated`)에서는 조치 전에 의견과 반론을 보내지 않는다(`opened`).
/// `run`은 지금 역할이 조사를 누를 수 있는지(내부 감시이고 보고가 없거나 입력이 달라졌거나 대기·오류), `actions`는 채택·불채택, `decision`은 남은 결정
async fn detail(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let Some(b) = basis(&me.db, &id).await? else { return Err(err(StatusCode::NOT_FOUND, "없음")) };
    let mut r = q1(&me.db, "
        LET $s = type::record('signal', $id);
        LET $r = fn::report_of($s);
        -- 결정 때 조치가 없었으면(acted 비어 있음) 그 뒤의 조치를 읽을 때 채운다. 결정 기록은 고치지 않는다
        LET $late = (SELECT kind, stamp FROM ruling WHERE signal = $s ORDER BY stamp DESC LIMIT 1)[0].kind;
        RETURN {
            report: IF $r != NONE THEN (SELECT record::id(id) AS id, state, model, reads, input, error, time::format(at, '%Y-%m-%d') AS at, guess, unknown, opinion, counter,
                facts.map(|$f| { ref: <string> $f.ref, text: $f.text, cited: fn::evidence($f.ref) }) AS facts FROM $r)[0] END,
            decision: IF $r != NONE THEN (SELECT kind, role, time::format(at, '%Y-%m-%d') AS at, reason, source, opinion, acted ?? $late AS acted,
                IF (acted ?? $late) = NONE THEN NONE ELSE (acted ?? $late) = opinion END AS same, stamp FROM adoption WHERE report = $r ORDER BY stamp DESC LIMIT 1)[0] END,
            actions: IF $r != NONE AND fn::adoptable($r) THEN ['채택', '불채택'].map(|$k| { kind: $k, reason: $k = '불채택', classes: fn::adoption_classes($k) }) ELSE [] END,
            trail: (SELECT kind, role, time::format(at, '%Y-%m-%d') AS at, reason, source, stamp FROM adoption WHERE report.target = $s ORDER BY stamp),
            opened: fn::opened($s),
            earlier: (SELECT record::id(id) AS id, state, time::format(at, '%Y-%m-%d') AS at FROM report WHERE target = $s AND id != $r ORDER BY born DESC),
        };", json!({ "id": id })).await?;
    let (opened, audit) = (r["opened"] == true, me.role == "내부 감시");
    let report = r["report"].take();
    let mut run = audit;
    r["report"] = if report.is_null() { report } else {
        let mut x = report;
        let state = x["state"].as_str().unwrap_or_default().to_string();
        // 대화로 남긴 보고(24)의 입력은 `chat:정황 입력의 해시:대화의 해시`라서 앞 해시만 본다
        let want = sha(&b.to_string());
        let stale = x["input"] != want.as_str() && !x["input"].as_str().is_some_and(|i| i.starts_with(&format!("chat:{want}:")));
        run = audit && (stale || ["대기", "오류"].contains(&state.as_str()));
        x.as_object_mut().map(|o| o.remove("input"));
        if ["대기", "오류"].contains(&state.as_str()) {
            x["facts"] = json!([]);
            x["guess"] = json!([]);
            x["unknown"] = json!([]);
            x["opinion"] = J::Null;
            x["counter"] = J::Null;
        }
        if !opened {
            x["opinion"] = J::Null;
            x["counter"] = J::Null;
        }
        let facts: Vec<J> = x["facts"].as_array().into_iter().flatten().map(|f| { let t = said(f); json!({ "ref": f["ref"], "text": fill(t, &f["cited"]), "parts": parts(t, &f["cited"]), "id": ident(f) }) }).collect();
        x["facts"] = json!(facts);
        x["stale"] = json!(stale);
        x
    };
    r["run"] = json!(run);
    r["role"] = json!("내부 감시");
    Ok(Json(r))
}

/// 조사: 내부 감시가 요청하면 AI가 정황을 조사한다(D23). 같은 입력의 보고가 이미 올라와 있으면 그것을 쓴다. 끝나야(AI가 응답하거나 대기로 남아야) 돌아온다. `{ id }` → `{ state }`
async fn investigate(Extension(me): Extension<Me>, State(db): State<std::sync::Arc<Db>>, Body(b): Body) -> R {
    let Some(id) = b["id"].as_str().filter(|i| !i.is_empty()) else { return Err(refuse("대상")) };
    if basis(&db, id).await.map_err(|_| refuse("대상"))?.is_none() {
        return Err(refuse("대상"));
    }
    if me.role != "내부 감시" {
        return Err(refuse("권한"));
    }
    let state = make(&db, id, true).await.map_err(|_| refuse("대상"))?;
    Ok(Json(json!({ "state": state })))
}

/// 채택 또는 불채택: `{ id(보고), kind, reason? }`. 내부 감시가 올라와 있는(검토) 가장 새 보고에만 할 수 있고(오류·대기는 상태), 의견이 열려 있어야 한다.
/// 불채택은 사유가 필수다(D41). AI의 의견과 내부 감시의 조치가 같은지는 DB가 채운다
async fn adopt(Extension(me): Extension<Me>, Body(b): Body) -> R {
    let (Some(id), Some(kind)) = (b["id"].as_str().filter(|i| !i.is_empty()), b["kind"].as_str()) else { return Err(refuse("대상")) };
    let mut vars = json!({ "id": id, "kind": kind });
    if b["reason"].is_object() {
        vars["reason"] = b["reason"].clone();
    }
    attempt(&me.db, "
        LET $r = type::record('report', $id);
        RETURN IF $r.id = NONE OR $kind NOTINSIDE ['채택', '불채택'] THEN '대상'
            ELSE IF $auth.role != '내부 감시' THEN '권한'
            ELSE IF !fn::adoptable($r) THEN '상태'
            ELSE IF !fn::reason($kind = '불채택', fn::adoption_classes($kind), $reason) THEN '사유' END;",
        "RETURN (CREATE adoption SET report = type::record('report', $id), kind = $kind, reason = $reason);", vars).await?;
    Ok(Json(json!({ "id": id })))
}

pub async fn seed(db: &Db) -> Result<()> {
    q(db, "CREATE staff:ai SET role = 'AI', pass = crypto::argon2::generate($pass);", json!({ "pass": ai_pass() })).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn templates() {
        assert!(plain("{dealer}의 {at} 회수가 {node}에 들어갔다"));
        assert!(!plain("회수 3건") && !plain("{amount}원 {foo}") && !plain("{dealer") && !plain("") && !plain("{dealer}의 지급 100"));
        let ev = json!({ "dealer": { "name": "성일상사24" }, "amount": 11356215, "at": "2026-03-13", "node": null });
        assert_eq!(fill("{dealer} {at} {amount} {node}", &ev), "성일상사24 2026-03-13 11,356,215 없음");
        assert_eq!((comma(0), comma(999), comma(1000), comma(-1234567)), ("0".into(), "999".into(), "1,000".into(), "-1,234,567".into()));
    }

    #[test]
    fn shapes() {
        let ok = r#"```json
        {"facts":[{"ref":"deposit:a","text":"{dealer}의 {at}"}],"guess":[],"unknown":["x"],"opinion":{"action":"기각","text":"y"},"counter":"z"}
        ```"#;
        assert_eq!(shape(ok).map(|s| (s.action, s.unknown)).ok(), Some(("기각".into(), vec!["x".into()])));
        assert_eq!(shape("답이 없다").err(), Some("꼴"));
        assert_eq!(shape(&ok.replace("기각", "승인")).err(), Some("꼴"));
        assert_eq!(shape(&ok.replace("{dealer}의 {at}", "3건")).err(), Some("값"));
        assert_eq!(shape(&ok.replace(r#""facts":[{"ref":"deposit:a","text":"{dealer}의 {at}"}]"#, r#""facts":[]"#)).err(), Some("꼴"));
    }
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let (bank, name, near) = ("계좌-D-024", "동명-박준호", "근접-D-011");
    let report = async |role: &str, id: &str| c.get(role, &format!("/api/signals/{id}/report")).await;
    let base = CALLS.load(Ordering::Relaxed);
    let calls = || CALLS.load(Ordering::Relaxed) - base;
    let word = |code: u16, r: &J| -> Result<String> {
        let w = r["error"].as_str().unwrap_or("").to_string();
        ensure!(if code == 200 { w.is_empty() } else { *r == json!({ "error": w }) && code == if w == "권한" { 403 } else { 400 } && ["권한", "사유", "상태", "대상"].contains(&w.as_str()) }, "거절의 꼴 {code} {r}");
        Ok(w)
    };
    let investigate = async |role: &str, id: &str| { let (code, r) = c.post(role, "/api/investigate", json!({ "id": id })).await?; Ok::<_, anyhow::Error>((word(code, &r)?, r["state"].as_str().unwrap_or("").to_string())) };
    let adopt = async |role: &str, id: &str, kind: &str, reason: J| { let (code, r) = c.post(role, "/api/adopt", json!({ "id": id, "kind": kind, "reason": reason })).await?; word(code, &r) };
    let rid = |d: &J| d["report"]["id"].as_str().unwrap_or_default().trim_start_matches("report:").to_string();
    let ai = ai_session(&c.db).await?;
    let none = || { *USE.lock().unwrap() = None; };
    *USE.lock().unwrap() = Some("fixture".into());
    // 검사가 실패해도 다음 티켓의 검사가 이 모델을 물려받지 않게 한다
    let res = async {
        // 접속은 네 역할뿐이다(AI의 접속 계정은 화면에 나오지 않는다)
        ensure!(c.get(audit, "/api/state").await?["role"] == audit && q1(&c.db, "RETURN (SELECT VALUE role FROM staff WHERE role = 'AI');", json!({})).await? == json!(["AI"]), "AI의 계정");
        let (code, r) = c.call(None, "POST", "/api/enter", Some(json!({ "pass": crate::demo_pass() }))).await?;
        ensure!(code == 200 && rows(&r["roles"]).len() == 4, "접속의 역할 {r}");

        // 보고가 아직 없다: 모든 역할에게 비어 있고, 조사는 내부 감시에게만 보인다
        let d = report(audit, bank).await?;
        ensure!(d["report"].is_null() && d["run"] == true && d["actions"] == json!([]) && d["opened"] == true, "만들기 전 {d}");
        let r404 = c.call(Some(c.token(audit)), "GET", "/api/signals/없음/report", None).await?;
        ensure!(report(support, bank).await?["run"] == false && r404.0 == 404, "만들기 전의 다른 역할 {r404:?}");
        // 조사의 거절: 없는 정황은 대상, 내부 감시가 아니면 권한, 틀린 본문은 대상. AI는 불리지 않았다
        ensure!(investigate(audit, "없음").await?.0 == "대상" && investigate(support, bank).await?.0 == "권한" && investigate(exec, "없음").await?.0 == "대상", "조사의 거절");
        ensure!(c.raw(audit, "/api/investigate", "{", Some("application/json")).await? == (400, json!({ "error": "대상" })) && calls() == 0, "틀린 본문");

        // 조사: 근거 기록을 가리킨 보고가 올라오고(검토), 사실의 값은 코드가 그 기록에서 읽는다. 가운데의 근거 표와 같은 값이다
        let got = investigate(audit, bank).await?;
        ensure!(got == ("".into(), "검토".into()) && calls() == 1, "조사 {got:?} {}", calls());
        let d = report(audit, bank).await?;
        let s = d["report"].clone();
        let ev = c.get(audit, &format!("/api/signals/{bank}")).await?["evidence"].clone();
        ensure!(s["state"] == "검토" && s["model"] == "fixture" && s["at"] == "2026-07-01" && s["stale"] == false && d["run"] == false, "보고 {s}");
        let bare = |f: &J| json!(rows(f).iter().map(|x| json!({ "ref": x["ref"], "text": x["text"] })).collect::<Vec<_>>());
        ensure!(s["facts"][0]["parts"] == json!([["", false], ["성일상사24", true], ["의 ", false], ["2026-03-13", true], [" 회수가 ", false], ["국민 412-27-556310", true], ["에 들어갔다", false]]), "값 조각 {}", s["facts"][0]);
        ensure!(bare(&s["facts"]) == json!([
            { "ref": ev[0]["id"], "text": "성일상사24의 2026-03-13 회수가 국민 412-27-556310에 들어갔다" },
            { "ref": ev[1]["id"], "text": "성일상사24의 2026-04-13 회수가 국민 412-27-556310에 들어갔다" },
            { "ref": ev[2]["id"], "text": "금강상사11의 계좌 등록 국민 412-27-556310" },
        ]), "사실 {}", s["facts"]);
        ensure!(s["facts"][0]["id"].is_null() && s["facts"][2]["id"]["item"] == "계좌" && s["facts"][2]["id"]["dealer"]["name"] == "금강상사11" && s["facts"][2]["id"]["value"] == "국민 412-27-556310", "식별자 구조 {}", s["facts"]);
        ensure!(s["guess"].as_array().is_some_and(|g| g.len() == 1) && s["unknown"] == json!(["계좌 예금주"]) && s["opinion"]["action"] == "요청" && s["counter"].is_string() && s.get("input").is_none(), "추정·미확인·의견 {s}");
        ensure!(d["actions"] == json!([{ "kind": "채택", "reason": false, "classes": ["기타"] }, { "kind": "불채택", "reason": true, "classes": ["추정", "의견", "기타"] }]) && d["decision"].is_null(), "조치 {}", d["actions"]);
        // 지급 정황의 사실 값(금액은 쉼표)
        ensure!(investigate(audit, near).await?.1 == "검토" && report(audit, near).await?["report"]["facts"][0]["text"] == "금강상사11의 2026-01 지급 1,867,253", "지급의 사실");
        // 같은 입력에는 저장된 보고를 쓰고 AI를 다시 부르지 않는다(조사를 다시 눌러도, 자동 조사가 돌아도). 새로 부른 것은 아직 보고가 없는 정황 하나뿐이다
        ensure!(investigate(audit, bank).await?.1 == "검토" && calls() == 2, "다시 조사");
        sweep(&c.db).await?;
        ensure!(calls() == 3 && q1(&c.db, "RETURN count(SELECT id FROM report);", json!({})).await? == 3, "자동 조사 {}", calls());
        sweep(&c.db).await?;
        ensure!(calls() == 3, "자동 조사는 한 번");
        // 모든 역할이 같은 보고를 읽는다. 쓰는 것은 AI뿐이다
        ensure!(report(exec, bank).await?["report"] == s, "다른 역할이 읽은 보고");

        // 채택·불채택: 내부 감시만. 정황의 조치와 따로 남고, 같은 보고의 두 번째 결정은 상태다
        let id = rid(&d);
        for role in [support, exec, acct] {
            ensure!(adopt(role, &id, "채택", J::Null).await? == "권한" && report(role, bank).await?["actions"] == json!([]), "{role}의 채택");
        }
        ensure!(adopt(audit, "없음", "채택", J::Null).await? == "대상" && adopt(audit, &id, "승인", J::Null).await? == "대상", "없는 대상");
        for reason in [J::Null, json!({}), json!({ "class": "정상" }), json!({ "class": "기타" }), json!({ "class": "기타", "memo": " " })] {
            ensure!(adopt(audit, &id, "불채택", reason.clone()).await? == "사유", "불채택 {reason}");
        }
        ensure!(adopt(audit, &id, "채택", json!({ "class": "추정" })).await? == "사유", "채택의 분류");
        ensure!(report(audit, bank).await?["report"]["state"] == "검토" && q1(&c.db, "RETURN count(SELECT id FROM adoption);", json!({})).await? == 0, "거절 뒤");
        // 요청한 뒤 채택: 의견(요청)과 조치(요청)가 같다. 채택 사유는 선택
        ensure!(c.post(audit, "/api/rule", json!({ "id": bank, "kind": "요청" })).await?.0 == 200, "요청");
        ensure!(adopt(audit, &id, "채택", J::Null).await? == "", "채택");
        let d = report(audit, bank).await?;
        let mut dec = d["decision"].clone();
        dec.as_object_mut().map(|o| o.remove("stamp"));
        ensure!(d["report"]["state"] == "채택" && d["actions"] == json!([]) && d["run"] == false
            && dec == json!({ "kind": "채택", "role": audit, "at": "2026-07-01", "reason": null, "source": "시연", "opinion": "요청", "acted": "요청", "same": true }), "채택 뒤 {d}");
        ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM adoption)[0] = staff:audit;", json!({})).await? == true, "결정한 직원");
        ensure!(d["trail"].as_array().is_some_and(|t| t.len() == 1 && t[0]["kind"] == "채택" && t[0]["role"] == audit && t[0]["at"] == "2026-07-01" && t[0]["stamp"].is_string()), "이력에 오를 결정 {}", d["trail"]);
        ensure!(adopt(audit, &id, "채택", J::Null).await? == "상태" && adopt(audit, &id, "불채택", json!({ "class": "추정" })).await? == "상태", "두 번째 결정");
        // 의견과 다른 조치(기각)를 내린 뒤 불채택: 사유가 필수이고 같지 않음이 남는다
        ensure!(c.post(audit, "/api/rule", json!({ "id": near, "kind": "기각", "reason": { "class": "정상" } })).await?.0 == 200, "기각");
        let nid = rid(&report(audit, near).await?);
        ensure!(adopt(audit, &nid, "불채택", json!({ "class": "의견", "memo": "지급이 연달아 한도 아래인 것만으로는 부족" })).await? == "", "불채택");
        let d = report(audit, near).await?;
        ensure!(d["report"]["state"] == "불채택" && d["decision"]["reason"] == json!({ "class": "의견", "memo": "지급이 연달아 한도 아래인 것만으로는 부족" })
            && d["decision"]["opinion"] == "요청" && d["decision"]["acted"] == "기각" && d["decision"]["same"] == false, "불채택 뒤 {d}");
        // 조치가 아직 없을 때의 채택은 같은지가 비어 있다(동명의 보고)
        ensure!(investigate(audit, name).await?.1 == "검토", "동명의 조사");
        let d = report(audit, name).await?;
        ensure!(adopt(audit, &rid(&d), "채택", J::Null).await? == "" && report(audit, name).await?["decision"]["same"].is_null() && report(audit, name).await?["decision"]["acted"].is_null(), "조치 없는 채택");
        // 채택·불채택은 계산에 쓰이지 않는다: 정황의 상태와 심사의 합산은 그대로다
        ensure!(c.get(audit, &format!("/api/signals/{name}")).await?["signal"]["state"] == "접수" && c.get(support, "/api/reviews/2026-06-D-011").await?["review"]["total"] == 3_888_097, "채택은 계산에 쓰이지 않는다");

        // 새 근거가 오면 입력이 달라져 새 보고가 만들어지고 이전 보고는 기록으로 남는다(조치 전의 정황은 자동 조사가 쓴다)
        let more = q1(&c.db, "RETURN (SELECT VALUE id FROM deposit ORDER BY id LIMIT 1)[0];", json!({})).await?;
        q(&c.db, "RETURN fn::signal('동명', '박준호', '박준호', [dealer:`D-034`], [type::record($e)], '계산');", json!({ "e": more })).await?;
        ensure!(report(audit, name).await?["report"]["stale"] == true && report(audit, name).await?["run"] == true, "입력이 달라짐");
        sweep(&c.db).await?;
        let d = report(audit, name).await?;
        ensure!(calls() == 4 && d["report"]["state"] == "검토" && d["report"]["stale"] == false && d["earlier"].as_array().is_some_and(|e| e.len() == 1 && e[0]["state"] == "채택") && d["decision"].is_null(), "새 보고 {d}");

        // 오류: 없는 기록을 가리킨 보고는 올라가지 않는다. 문장 틀에 숫자가 있거나 의견의 조치가 틀려도 같다
        let root = &c.db;
        let sample = async |kind: &str| q1(root, "RETURN (CREATE type::record('signal', $kind) SET kind = '기타', name = $kind, dealers = [], evidence = (SELECT VALUE id FROM deposit ORDER BY id LIMIT 2), source = '시연', state = '요청')[0].id;", json!({ "kind": format!("기타-{kind}") })).await;
        for (model, why) in [("fixture-gap", "기록"), ("fixture-digit", "값"), ("fixture-kind", "꼴")] {
            *USE.lock().unwrap() = Some(model.into());
            let id = sample(model).await?;
            let id = id.as_str().unwrap_or_default().trim_start_matches("signal:").trim_matches('`').to_string();
            ensure!(investigate(audit, &id).await? == ("".into(), "오류".into()), "{model}");
            let d = report(audit, &id).await?;
            ensure!(d["report"]["state"] == "오류" && d["report"]["facts"] == json!([]) && d["report"]["opinion"].is_null() && d["actions"] == json!([]) && d["run"] == true, "{model}의 보고 {d}");
            ensure!(q1(root, "RETURN (SELECT VALUE error FROM report WHERE state = '오류' ORDER BY born DESC LIMIT 1)[0];", json!({})).await? == why, "{model}의 까닭");
            ensure!(adopt(audit, &rid(&d), "채택", J::Null).await? == "상태" && adopt(audit, &rid(&d), "불채택", json!({ "class": "기타", "memo": "x" })).await? == "상태", "{model}의 채택");
        }
        // DB도 막는다: AI의 세션으로 없는 기록을 가리킨 보고를 검토로 올릴 수 없다
        let sid = sample("gap2").await?;
        let made = q1(&ai, "RETURN (CREATE report SET target = type::record($t), input = 'x', model = 'x')[0].id;", json!({ "t": sid })).await?;
        let up = q1(&ai, "RETURN UPDATE type::record($r) SET state = '검토', facts = [{ ref: payout:`RB-없음`, text: 'x' }], opinion = { action: '요청', text: 'x' };", json!({ "r": made })).await?;
        ensure!(rows(&up).is_empty() && q1(root, "RETURN (SELECT VALUE state FROM report WHERE input = 'x')[0];", json!({})).await? == "대기", "없는 기록을 가리킨 보고 {up}");

        // AI가 응답하지 않으면 보고는 대기로 남고, 정황의 조치와 심사의 승인은 그대로 된다. 다시 시도는 간격 뒤이고, 조사를 누르면 같은 보고가 채워진다
        *USE.lock().unwrap() = Some("fixture-down".into());
        let down = sample("down").await?;
        let down = down.as_str().unwrap_or_default().trim_start_matches("signal:").trim_matches('`').to_string();
        let before = calls();
        ensure!(investigate(audit, &down).await? == ("".into(), "대기".into()) && calls() == before + 1, "응답 없음");
        let d = report(audit, &down).await?;
        ensure!(d["report"]["state"] == "대기" && d["report"]["facts"] == json!([]) && d["actions"] == json!([]) && d["run"] == true, "대기 {d}");
        ensure!(adopt(audit, &rid(&d), "채택", J::Null).await? == "상태", "대기의 채택");
        ensure!(make(&c.db, &down, false).await? == "대기" && calls() == before + 1, "간격 안에서는 다시 부르지 않는다");
        ensure!(c.post(support, "/api/decide", json!({ "ids": ["2026-06-D-001"], "kind": "승인" })).await?.0 == 200, "대기인 동안의 승인");
        // 정황의 조치(내부 감시의 요청·기각)도 그대로 된다. 정황은 접수여야 하므로 새 정황으로
        q(&c.db, "UPDATE type::record($s) SET state = '접수';", json!({ "s": format!("signal:`기타-down`") })).await?;
        ensure!(c.post(audit, "/api/rule", json!({ "id": "기타-down", "kind": "기각", "reason": { "class": "부족" } })).await?.0 == 200 && report(audit, "기타-down").await?["report"]["state"] == "대기", "대기인 동안의 기각");
        *USE.lock().unwrap() = Some("fixture".into());
        ensure!(make(&c.db, &down, false).await? == "대기" && calls() == before + 1, "간격 안");
        ensure!(investigate(audit, &down).await?.1 == "검토" && report(audit, &down).await?["report"]["state"] == "검토" && report(audit, &down).await?["earlier"] == json!([]), "조사를 누르면 같은 보고가 채워진다");
        // 결정을 먼저 하고 조치를 뒤에 해도 결정의 조치·같은지가 읽을 때 채워진다(결정 기록은 그대로)
        let late = sample("late").await?.as_str().unwrap_or_default().trim_start_matches("signal:").trim_matches('`').to_string();
        q(&c.db, "UPDATE type::record('signal', $s) SET state = '접수';", json!({ "s": late })).await?;
        ensure!(investigate(audit, &late).await?.1 == "검토" && adopt(audit, &rid(&report(audit, &late).await?), "채택", J::Null).await? == "" && c.post(audit, "/api/rule", json!({ "id": late, "kind": "기각", "reason": { "class": "부족" } })).await?.0 == 200, "결정 뒤 조치");
        let d = report(audit, &late).await?["decision"].clone();
        ensure!(d["acted"] == "기각" && d["same"] == json!(d["opinion"] == "기각") && q1(&c.db, "RETURN (SELECT VALUE acted FROM adoption ORDER BY stamp DESC LIMIT 1)[0];", json!({})).await?.is_null(), "결정 뒤 조치의 결정 {d}");
        // 키가 없으면 OpenAI를 부르지 않고 응답이 없는 것과 같다
        ensure!(ask("gpt-6.1-terra", None, &ai, &basis(&c.db, bank).await?.unwrap_or_default(), "2026-07-01").await.err() == Some("키") && ask("gpt-6.1-terra", Some(""), &ai, &J::Null, "").await.err() == Some("키"), "키 없음");

        // 조치 뒤에야 의견이 열리는 정황(12가 `fn::gated`를 덮어쓴다): 조치 전에는 의견과 반론을 보내지도 않고 채택·불채택도 할 수 없다. 조치를 하면 열린다
        q(&c.db, "DEFINE FUNCTION OVERWRITE fn::gated($s: record) -> bool { RETURN $s.kind = '동명'; };", json!({})).await?;
        let d = report(audit, name).await?;
        ensure!(d["opened"] == false && d["report"]["opinion"].is_null() && d["report"]["counter"].is_null() && d["report"]["state"] == "검토" && d["report"]["facts"].as_array().is_some_and(|f| !f.is_empty()) && d["actions"] == json!([]), "조치 전 {d}");
        ensure!(adopt(audit, &rid(&d), "채택", J::Null).await? == "상태", "조치 전의 채택");
        ensure!(c.post(audit, "/api/rule", json!({ "id": name, "kind": "요청" })).await?.0 == 200, "조치");
        let d = report(audit, name).await?;
        ensure!(d["opened"] == true && d["report"]["opinion"]["action"] == "요청" && rows(&d["actions"]).len() == 2, "조치 뒤 {d}");
        ensure!(adopt(audit, &rid(&d), "채택", J::Null).await? == "", "조치 뒤의 채택");
        q(&c.db, "DEFINE FUNCTION OVERWRITE fn::gated($s: record) -> bool { RETURN false; };", json!({})).await?;

        // AI는 읽기만 한다: 모든 것을 읽을 수 있고(다른 사람의 접속 정보는 제외) 보고 말고는 쓰지 못한다. 대기가 아닌 보고를 만들거나 결정을 남기지도 못한다
        let n = q1(root, "RETURN [count(SELECT id FROM deposit), count(SELECT id FROM review)];", json!({})).await?;
        ensure!(n[0] == 32 && q1(&ai, "RETURN [count(SELECT id FROM deposit), count(SELECT id FROM review), count(SELECT id FROM staff)];", json!({})).await? == json!([n[0], n[1], 1]), "AI가 읽는 것");
        let snap = || q1(root, "RETURN [count(SELECT id FROM decision), count(SELECT id FROM ruling), count(SELECT id FROM signal), count(SELECT id FROM task), count(SELECT id FROM adoption), count(SELECT id FROM remit), count(SELECT id FROM reply),
            count(SELECT id FROM report), count(SELECT id FROM staff), array::join((SELECT VALUE status FROM review ORDER BY id), ','), array::join((SELECT VALUE state FROM task ORDER BY id), ','), array::join((SELECT VALUE state FROM signal ORDER BY id), ','),
            array::join((SELECT VALUE state FROM report ORDER BY id), ','), <string> meta:v.today, array::join((SELECT VALUE who FROM act ORDER BY id), ',')];", json!({}));
        let before = snap().await?;
        for sql in [
            "CREATE decision SET review = review:`2026-06-D-001`, kind = '승인', role = '영업지원', source = '원본';", "UPDATE review SET status = '승인';", "DELETE review;",
            "DELETE signal;", "CREATE signal:`기타-ai` SET kind = '기타', name = 'x', dealers = [], evidence = [], source = '시연';", "UPDATE signal SET state = '해소';",
            "UPDATE task SET state = '완료';", "DELETE task;", "CREATE ruling SET signal = signal:`동명-박준호`, kind = '기각', reason = { class: '부족' };",
            "CREATE adoption SET report = (SELECT VALUE id FROM report WHERE state = '검토')[0], kind = '채택';", "CREATE remit SET payout = payout:`RB-00006`;",
            "CREATE reply SET payout = payout:`RB-00006`, amount = 1, account = 'x', result = '성공';", "UPDATE staff SET role = '내부 감시';", "UPDATE act SET who = 'AI';",
            "UPDATE meta:v SET today = d'2030-01-01T00:00:00Z';", "CREATE report SET target = signal:`동명-박준호`, input = 'y', model = 'x', state = '채택';",
            "UPDATE report SET state = '채택';", "DELETE report;", "UPDATE deposit SET amount = 1;", "DELETE deposit;", "DEFINE TABLE hack;", "REMOVE TABLE report;",
        ] {
            q(&ai, sql, json!({})).await.ok();
        }
        ensure!(snap().await? == before, "AI가 쓴 것이 있다 {before} → {}", snap().await?);
        ensure!(q1(root, "RETURN count(SELECT id FROM deposit);", json!({})).await? == 32, "원본");
        // 도구: 읽기는 되고, 쓰는 글자는 보내지도 않는다. 한 번에 읽는 양에는 한도가 있다
        ensure!(read_db(&ai, "RETURN count(SELECT id FROM deposit);").await.contains("32") && read_db(&ai, "CREATE signal:`기타-t` SET kind = '기타';").await == "읽기만 된다", "도구");
        // 사람이 화면에서 한 조치의 출처(시연)는 화면 입력으로 건넨다
        let got = read_db(&ai, "RETURN [{ source: '시연', item: '주소' }, { source: '원본' }];").await;
        ensure!(got.contains(HUMAN) && got.contains("원본") && !got.contains("시연"), "화면 입력 {got}");
        ensure!(read_db(&ai, "SELECT * FROM deposit_of, deposit_into, payout_of, deposit;").await.chars().count() <= CUT && read_db(&ai, "SELECT FROM").await.starts_with("오류"), "도구의 한도");
        Ok(())
    }.await;
    none();
    res
}
