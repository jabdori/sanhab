//! 24 대화: 오른쪽 끝의 대화. 사람이 묻고 AI가 DB를 읽어 답한다(D22, U13, U14).
//! 대화는 임시다 — 서버는 말을 저장하지 않는다(화면이 대화 전체를 매번 보낸다). 남기려면 "보고"를 눌러 17의 검증(꼴 · 문장 틀 · 가리킨 기록의 존재)을 거쳐 보고로 저장한다.
//! 답은 AI SDK의 UI 메시지 스트림(SSE)으로 조각조각 보낸다(`docs/spike/ai-stream.rs`: 내장 변환기를 쓰지 않고 직접 낸다). 웹소켓은 쓰지 않는다.
//! AI는 17의 읽기 전용 계정(`ai_session`)의 `read_db`만 쓴다. 답 아래의 조회한 기록 목록은 AI가 쓰지 않고, 도구가 돌려준 결과에서 코드가 찾아 붙인다(`data-reads`).
//! 자동 검사는 OpenAI를 부르지 않는다: 모델 이름이 `fixture`로 시작하면 고정한 답을 쓰고(`fixture-down` 응답 없음, `fixture-slow` 느리게 흐름), 키는 인자로 받는다.
use super::t17_report::{USE, ai_session, ask, basis, model, read_db, read_tool, settle, verify};
use crate::check::Check;
use crate::db::{Db, q1};
use crate::orig::sha;
use crate::{ApiError, Me, R, err, refuse, Body};
use aisdk::core::utils::step_count_is;
use aisdk::core::language_model::LanguageModelResponseContentType;
use aisdk::core::{AssistantMessage, LanguageModelRequest, LanguageModelStreamChunkType, Message, SystemMessage, UserMessage};
use aisdk::providers::openai::OpenAI;
use anyhow::{Result, ensure};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use futures::{Stream, StreamExt};
use serde_json::{Value as J, json};
use std::collections::{BTreeSet, HashMap};
use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const SCHEMA: &str = include_str!("../../db/24-대화.surql");

/// 한 번에 받는 대화의 길이(말의 수, 말 하나의 글자 수), 붙일 수 있는 기록의 수, 답을 기다리는 시간(초)
const TURNS: usize = 20;
const CHARS: usize = 4000;
const ATTACH: usize = 5;
const WAIT: u64 = 120;
/// 한 답에서 도구를 부르는 단계의 수
const STEPS: usize = 10;
/// 조회한 기록으로 알려 줄 수 있는 테이블(도구 결과에서 `테이블:id` 꼴을 찾는다)과 그 수
const TABLES: [&str; 22] = [
    "dealer", "person", "address", "account", "payout", "deposit", "review", "signal", "ruling", "recon", "clarify",
    "doc", "verdict", "report", "rule", "clause", "task", "decision", "ratify", "dispatch", "adoption", "act",
];
const LISTED: usize = 30;
/// 기록(`$r`)의 사람이 읽는 이름. 화면의 제목 줄과 같다. 이름이 없는 기록(작업 · 결정 …)은 NONE
const NAME: &str = "(SELECT VALUE IF record::tb(id) = 'review' THEN name + ' · ' + ym
    ELSE IF record::tb(id) = 'payout' THEN (->payout_of->dealer)[0].name + ' · ' + ym
    ELSE IF record::tb(id) = 'deposit' THEN (->deposit_of->dealer)[0].name
    ELSE IF record::tb(id) = 'rule' THEN name + ' v' + <string> ver
    ELSE IF record::tb(id) = 'clause' THEN title
    ELSE IF record::tb(id) IN ['address', 'account'] THEN value ELSE name END FROM $r)[0]";

pub const SYSTEM: &str = "너는 판매장려금 심사 화면의 대화 도우미다. 사용자가 묻는 것을 DB를 읽어 설명한다.
DB는 read_db 도구로만 읽는다(SurrealQL의 SELECT와 RETURN만. 쓰기는 되지 않는다). 테이블: dealer(name) · person · address · account · rep/addr/acct(대리점 → 사람/주소/계좌 선) · deposit(회수) · payout(지급: ym, amount, status) · review(심사) · signal(정황) · clarify(소명) · rule(규칙) · clause(조항) · recon(대사) · task(작업). 칸을 모르면 SELECT * FROM 테이블 LIMIT 2로 먼저 본다. id에 -가 있으면 `D-024`처럼 백틱으로 감싼다.
규칙:
- 사실과 규정(조항과 규칙의 값)만 답한다. 읽은 값을 그대로 전한다.
- 승인, 반려, 보류, 요청, 기각, 추인 같은 조치를 해도 되는지 해야 하는지 묻는 말에는 판정 의견을 내지 않는다. 그 판단에 관련된 사실과 규정을 보여 주고 결정은 사람이 한다고 밝힌다.
- 합산, 승인권자, 관련자 여부, 재검토 여부는 DB에 계산되어 있는 값을 읽어 전한다. 직접 계산하거나 고치지 않는다.
- 조치를 실행하지 못하고 기록을 만들거나 바꾸지 못한다.
- 도구는 꼭 필요한 만큼만 부르고(대개 서너 번) 그 안에 답한다. 읽지 않은 값은 말하지 않는다. 모르면 모른다고 한다. 확신을 숫자나 퍼센트로 쓰지 않는다.
- 답에는 테이블 이름과 id를 쓰지 않고 이름(대리점 이름, 귀속월 …)으로 적는다. id는 도구를 부를 때만 쓴다.
- 한국어로 짧게 쓴다. 마크다운(표, 굵은 글씨, 제목)은 쓰지 않고 줄글이나 줄마다 `-`로 쓴다.";

/// 화면의 기록: 대상의 종류(화면의 낱말)와 id
#[derive(Clone)]
struct Rec { kind: String, id: String }

fn rec(v: &J) -> Option<Rec> {
    let (k, i) = (v["kind"].as_str()?, v["id"].as_str()?);
    (!k.is_empty() && !i.is_empty() && k.chars().count() <= 40 && i.chars().count() <= 200).then(|| Rec { kind: k.into(), id: i.into() })
}
/// 화면의 대상 종류가 가리키는 테이블
fn table_of(kind: &str) -> Option<&'static str> {
    Some(match kind { "심사" => "review", "정황" => "signal", "소명" => "clarify", "대리점" => "dealer", "지급" => "payout", "규정" => "clause", _ => return None })
}

/// 요청의 본문: (대화, 문맥, 붙인 기록). 틀리면 400 `대상`
struct Ask { talk: Vec<(String, String)>, target: Option<Rec>, attach: Vec<Rec> }
/// `asking`이면 마지막이 사람의 말이어야 한다(답을 청하는 요청). 보고로 남길 때는 AI의 답으로 끝난다
fn parse(b: &J, asking: bool) -> Result<Ask, ApiError> {
    let bad = || refuse("대상");
    let list = b["messages"].as_array().filter(|m| !m.is_empty() && m.len() <= TURNS).ok_or_else(bad)?;
    let mut talk = vec![];
    for m in list {
        let role = m["role"].as_str().filter(|r| ["user", "assistant"].contains(r)).ok_or_else(bad)?;
        let text: String = m["parts"].as_array().ok_or_else(bad)?.iter().filter(|p| p["type"] == "text").filter_map(|p| p["text"].as_str()).collect();
        if text.chars().count() > CHARS { return Err(bad()); }
        if !text.trim().is_empty() { talk.push((role.to_string(), text)); }
    }
    if talk.last().is_none_or(|(r, _)| asking && r != "user") { return Err(bad()); }
    let target = match &b["target"] { J::Null => None, t => Some(rec(t).ok_or_else(bad)?) };
    let attach = match b["attach"].as_array() {
        None => vec![],
        Some(a) if a.len() <= ATTACH => a.iter().map(|r| rec(r).ok_or_else(bad)).collect::<Result<_, _>>()?,
        Some(_) => return Err(bad()),
    };
    Ok(Ask { talk, target, attach })
}

/// 모델에게 알리는 문맥: 역할, 지금 열어 둔 대상(끄면 없다), 붙인 기록
fn context(role: &str, a: &Ask, names: &HashMap<String, String>) -> String {
    let one = |r: &Rec| format!("{} {} (테이블 {}, id {})", r.kind, names.get(&format!("{}/{}", r.kind, r.id)).unwrap_or(&r.id), table_of(&r.kind).unwrap_or_default(), r.id);
    let mut s = format!("{SYSTEM}\n사용자의 역할은 {role}이다.");
    match &a.target { Some(t) => s += &format!("\n사용자가 지금 열어 둔 대상: {}. 묻는 말에 대상이 따로 없으면 이것을 가리킨다.", one(t)), None => s += "\n사용자가 열어 둔 대상은 없다." }
    if !a.attach.is_empty() { s += &format!("\n사용자가 붙인 기록: {}.", a.attach.iter().map(one).collect::<Vec<_>>().join(", ")); }
    s
}

/// 대화를 모델에 보낼 말로. 지시(system)는 말 목록 맨 앞에 둔다(말 목록을 주면 `.system()`은 쓰이지 않는다)
fn messages(system: String, talk: &[(String, String)]) -> Vec<Message> {
    std::iter::once(Message::System(SystemMessage::new(system))).chain(talk.iter().map(|(r, t)| if r == "user" { Message::User(UserMessage::new(t.clone())) } else { Message::Assistant(AssistantMessage::new(LanguageModelResponseContentType::Text(t.clone()), None)) })).collect()
}

/// 도구가 돌려준 글에서 `테이블:id` 꼴의 기록을 모은다(id는 `…`나 ⟨…⟩로 감싸이거나 글자·숫자·밑줄)
fn cited(text: &str, out: &mut BTreeSet<String>) {
    for t in TABLES {
        let key = format!("{t}:");
        for (i, _) in text.match_indices(&key) {
            if text[..i].chars().next_back().is_some_and(|c| c.is_alphanumeric() || c == '_') { continue; }
            let rest = &text[i + key.len()..];
            let end = match rest.chars().next() {
                Some(o @ ('`' | '⟨')) => {
                    let (close, from) = (if o == '`' { '`' } else { '⟩' }, o.len_utf8());
                    rest[from..].find(close).map(|n| from + n + close.len_utf8())
                }
                Some(c) if c.is_alphanumeric() || c == '_' => Some(rest.find(|c: char| !(c.is_alphanumeric() || c == '_')).unwrap_or(rest.len())),
                _ => None,
            };
            if let Some(e) = end { out.insert(format!("{key}{}", &rest[..e])); }
        }
    }
}

/// UI 메시지 스트림의 이벤트(JSON)를 흘린다. 끝에는 조회한 기록 목록(`data-reads`)이 붙는다. 실패는 `error` 이벤트(낱말: 대기 — AI가 응답하지 않는다. 키가 없는 것도 같다)
fn talk(model: String, key: Option<String>, ai: Db, system: String, talk: Vec<(String, String)>) -> impl Stream<Item = J> {
    async_stream::stream! {
        yield json!({ "type": "start", "messageId": "msg-1" });
        let seen = Arc::new(Mutex::new(BTreeSet::new()));
        let mut n = 0;
        let mut open = false;
        let mut word: Option<&str> = None;
        if model.starts_with("fixture") {
            let say = canned(&model, &ai, &system, &talk, &seen).await;
            match say {
                None => word = Some("대기"),
                Some((text, pause)) => for piece in text.split_inclusive(' ') {
                    if !open { n += 1; open = true; yield json!({ "type": "text-start", "id": format!("t{n}") }); }
                    yield json!({ "type": "text-delta", "id": format!("t{n}"), "delta": piece });
                    tokio::time::sleep(Duration::from_millis(pause)).await;
                },
            }
        } else if key.as_deref().is_none_or(str::is_empty) {
            word = Some("대기");
        } else {
            let tool = read_tool(&ai, { let seen = seen.clone(); Arc::new(move |out: &str| cited(out, &mut seen.lock().unwrap())) });
            let started = match tool {
                Ok(tool) => LanguageModelRequest::builder()
                    .model(OpenAI::<aisdk::core::DynamicModel>::model_name(&model)).messages(messages(system, &talk))
                    .with_tool(tool).stop_when(step_count_is(STEPS)).build().stream_text().await.ok(),
                Err(_) => None,
            };
            match started {
                None => word = Some("대기"),
                Some(resp) => {
                    let mut inner = resp.stream;
                    let end = tokio::time::Instant::now() + Duration::from_secs(WAIT);
                    loop {
                        let Ok(c) = tokio::time::timeout_at(end, inner.next()).await else { word = Some("대기"); break };
                        let Some(c) = c else { break };
                        match c {
                            LanguageModelStreamChunkType::TextDelta(t) => {
                                if !open { n += 1; open = true; yield json!({ "type": "text-start", "id": format!("t{n}") }); }
                                yield json!({ "type": "text-delta", "id": format!("t{n}"), "delta": t });
                            }
                            LanguageModelStreamChunkType::TextEnd => if open { open = false; yield json!({ "type": "text-end", "id": format!("t{n}") }); },
                            LanguageModelStreamChunkType::Failed(_) => { word = Some("대기"); break }
                            _ => {}
                        }
                    }
                }
            }
        }
        if open { yield json!({ "type": "text-end", "id": format!("t{n}") }); }
        // 글 없이 끝났으면(단계를 다 쓰고도 답하지 못함) 응답이 없는 것과 같다
        if n == 0 && word.is_none() { word = Some("대기"); }
        if let Some(w) = word { yield json!({ "type": "error", "errorText": w }); }
        let ids: Vec<String> = seen.lock().unwrap().iter().take(LISTED).cloned().collect();
        let listed = reads_names(&ai, &ids).await;
        if !listed.is_empty() { yield json!({ "type": "data-reads", "data": { "names": listed } }); }
        yield json!({ "type": "finish" });
    }
}

/// 고정한 답(자동 검사용): DB를 한 번 읽고(AI의 세션) 읽은 것과 받은 문맥을 풀어 쓴다. 판정 의견은 내지 않는다. (글, 조각 사이의 쉼 밀리초). `fixture-down`은 없음
async fn canned(model: &str, ai: &Db, system: &str, talk: &[(String, String)], seen: &Arc<Mutex<BTreeSet<String>>>) -> Option<(String, u64)> {
    let pause = match model { "fixture" => 5, "fixture-slow" => 600, _ => return None };
    let ask = talk.last().map(|(_, t)| t.as_str()).unwrap_or_default();
    // 문맥의 이름만 되풀이한다(테이블과 id는 모델용이다)
    let ctx: Vec<String> = system.lines().filter(|l| l.starts_with("사용자가 지금") || l.starts_with("사용자가 열어") || l.starts_with("사용자가 붙인")).map(|l| {
        let mut l = l.to_string();
        while let (Some(a), Some(b)) = (l.find(" (테이블"), l.find(')')) { if b < a { break } l.replace_range(a..=b, ""); }
        l
    }).collect();
    let out = read_db(ai, "SELECT id, name FROM dealer ORDER BY id LIMIT 2;").await;
    cited(&out, &mut seen.lock().unwrap());
    let names: Vec<String> = serde_json::from_str::<J>(&out).ok()?[0].as_array()?.iter().filter_map(|d| d["name"].as_str().map(String::from)).collect();
    let judge = ["해도", "해야", "승인", "반려", "기각"].iter().any(|w| ask.contains(w));
    let text = if judge { format!("판정 의견은 내지 않는다. 사실과 규정을 보여 준다: {}. 결정은 사람이 한다.", names.join(", ")) } else { format!("조회한 기록: {}.", names.join(", ")) };
    let text = format!("{text} {}", ctx.join(" "));
    Some((text, pause))
}

pub fn routes() -> Router<Arc<Db>> {
    Router::new().route("/chat", post(chat)).route("/chat/report", post(keep)).route("/chat/names", get(names))
}

/// 문맥 칩의 이름: `?items=[{ kind, id }]` → `{ names: [이름|null] }`. 화면이 제목 줄에 보이는 이름과 같다(정황 · 대리점 · 소명은 name, 심사는 `이름 · 귀속월`, 지급은 `대리점 · 귀속월`, 조항은 title).
/// 모르는 종류나 없는 기록은 null(화면은 id를 보인다). 읽기 한 번이다
async fn names(State(db): State<Arc<Db>>, Query(q): Query<HashMap<String, String>>) -> R {
    let items: Vec<J> = serde_json::from_str::<Vec<J>>(q.get("items").map_or("[]", String::as_str)).map_err(|_| refuse("대상"))?;
    let recs: Vec<Rec> = items.iter().map(rec).collect::<Option<_>>().filter(|r: &Vec<Rec>| r.len() <= ATTACH + 1).ok_or_else(|| refuse("대상"))?;
    Ok(Json(json!({ "names": names_of(&db, &recs).await.map_err(|_| refuse("대상"))? })))
}
/// 화면의 기록들의 이름(모르는 종류나 없는 기록은 None)
async fn names_of(db: &Db, recs: &[Rec]) -> Result<Vec<Option<String>>> {
    let items: Vec<J> = recs.iter().map(|r| json!({ "tb": table_of(&r.kind).unwrap_or("meta"), "id": r.id })).collect();
    let v = q1(db, &format!("RETURN $items.map(|$i| type::record($i.tb, $i.id)).map(|$r| {NAME});"), json!({ "items": items })).await?;
    Ok(v.as_array().into_iter().flatten().zip(recs).map(|(n, r)| n.as_str().filter(|_| table_of(&r.kind).is_some()).map(String::from)).collect())
}
/// 조회한 기록(`테이블:id`)의 이름들. 이름이 없는 기록은 빼고 같은 이름은 한 번만
async fn reads_names(db: &Db, ids: &[String]) -> Vec<String> {
    let v = q1(db, &format!("RETURN $ids.map(|$s| type::record($s)).map(|$r| {NAME});"), json!({ "ids": ids })).await.unwrap_or_default();
    let mut out: Vec<String> = vec![];
    for n in v.as_array().into_iter().flatten().filter_map(|n| n.as_str()) {
        if !out.iter().any(|o| o == n) { out.push(n.into()); }
    }
    out
}

/// 답을 조각으로 흘린다. 프록시가 모아 두지 않게 하는 머리글을 둔다(AXHub는 웹소켓이 없어 이 응답 본문이 길이다)
async fn chat(Extension(me): Extension<Me>, State(db): State<Arc<Db>>, Body(b): Body) -> Result<Response, ApiError> {
    let a = parse(&b, true)?;
    let ai = ai_session(&db).await.map_err(|_| err(StatusCode::SERVICE_UNAVAILABLE, "대기"))?;
    // 문맥과 붙임은 있는 기록이어야 한다
    let recs: Vec<Rec> = a.target.iter().chain(&a.attach).cloned().collect();
    let got = names_of(&db, &recs).await.map_err(|_| refuse("대상"))?;
    if got.iter().any(Option::is_none) { return Err(refuse("대상")); }
    let names: HashMap<String, String> = recs.iter().zip(got).map(|(r, n)| (format!("{}/{}", r.kind, r.id), n.unwrap_or_default())).collect();
    let events = talk(model(), std::env::var("OPENAI_API_KEY").ok(), ai, context(&me.role, &a, &names), a.talk)
        .chain(futures::stream::once(async { json!("[DONE]") }))
        .map(|v| Ok::<_, Infallible>(Event::default().data(v.as_str().map_or_else(|| v.to_string(), String::from))));
    Ok((
        [("x-vercel-ai-ui-message-stream", "v1"), ("cache-control", "no-cache, no-transform"), ("x-accel-buffering", "no")],
        Sse::new(events).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))),
    ).into_response())
}

/// 보고로 남기기: `{ messages, target, attach }`. 대상은 정황이다(열어 둔 정황, 없으면 붙인 정황). AI가 대화를 17의 보고 꼴로 정리하고, 17의 검증을 통과해야만 저장한다
/// (꼴 · 값 · 기록이 틀리면 400 `오류`, AI가 응답하지 않으면 503 `대기`. 어느 쪽이든 아무것도 저장하지 않는다). 모든 역할이 남길 수 있고 채택은 내부 감시가 한다.
/// 같은 정황의 보고로 17의 보고 칸에 가장 새것으로 올라온다 → `{ id, state }`
async fn keep(State(db): State<Arc<Db>>, Body(b): Body) -> R {
    let a = parse(&b, false).and_then(|a| if a.talk.iter().any(|(r, _)| r == "assistant") { Ok(a) } else { Err(refuse("대상")) })?;
    let signal = a.target.iter().chain(&a.attach).find(|r| r.kind == "정황").ok_or_else(|| refuse("대상"))?;
    let Some(base) = basis(&db, &signal.id).await.map_err(|_| refuse("대상"))? else { return Err(refuse("대상")) };
    let (input, model, ai) = (sha(&base.to_string()), model(), ai_session(&db).await.map_err(|_| err(StatusCode::SERVICE_UNAVAILABLE, "대기"))?);
    let mut given = base;
    given["conversation"] = json!(a.talk.iter().map(|(r, t)| json!({ "role": r, "text": t })).collect::<Vec<_>>());
    given["note"] = json!("conversation은 사람과 AI가 나눈 대화다. 그 내용 가운데 기록으로 확인되는 것만 사실로 쓴다");
    let today = q1(&db, "RETURN time::format(fn::today(), '%Y-%m-%d');", json!({})).await?;
    let key = std::env::var("OPENAI_API_KEY").ok();
    let (raw, reads) = ask(&model, key.as_deref(), &ai, &given, today.as_str().unwrap_or_default()).await.map_err(|_| err(StatusCode::SERVICE_UNAVAILABLE, "대기"))?;
    let made = verify(&db, &raw).await.map_err(|w| refuse_with(w))?;
    let rid = q1(&ai, "RETURN (CREATE report SET target = type::record('signal', $id), input = $input, model = $model)[0].id;", json!({ "id": signal.id, "input": input, "model": model })).await?;
    let rid = rid.as_str().unwrap_or_default();
    let state = settle(&ai, rid, &model, reads, Ok(made)).await?;
    let id = q1(&db, "RETURN record::id(type::record($r));", json!({ "r": rid })).await?;
    Ok(Json(json!({ "id": id, "state": state })))
}
/// 17의 검증을 어긴 응답은 낱말 하나로 `오류`다(보고의 상태와 같은 뜻)
fn refuse_with(_word: &str) -> ApiError { err(StatusCode::BAD_REQUEST, "오류") }

pub async fn seed(_db: &Db) -> Result<()> { Ok(()) }

/// SSE 본문 → 이벤트(JSON)와 끝 표시([DONE])를 가렸는가
fn events(sse: &str) -> (Vec<J>, bool) {
    let data: Vec<&str> = sse.lines().filter_map(|l| l.strip_prefix("data:")).map(str::trim).collect();
    (data.iter().filter(|d| **d != "[DONE]").filter_map(|d| serde_json::from_str(d).ok()).collect(), data.last() == Some(&"[DONE]"))
}
fn said(ev: &[J]) -> String { ev.iter().filter(|e| e["type"] == "text-delta").filter_map(|e| e["delta"].as_str()).collect() }

pub async fn check(c: &Check) -> Result<()> {
    let (support, audit) = ("영업지원", "내부 감시");
    let word = |code: u16, r: &J| -> Result<String> { Ok(if code == 200 { String::new() } else { ensure!(r.get("error").is_some(), "거절의 꼴 {code} {r}"); r["error"].as_str().unwrap_or("").to_string() }) };
    let say = |t: &str| json!({ "role": "user", "id": "u", "parts": [{ "type": "text", "text": t }] });
    let bot = |t: &str| json!({ "role": "assistant", "id": "a", "parts": [{ "type": "text", "text": t }] });
    let counts = async || q1(&c.db, "RETURN [count(SELECT id FROM report), count(SELECT id FROM adoption), count(SELECT id FROM ruling), count(SELECT id FROM act), count(SELECT id FROM task), count(SELECT id FROM decision)];", json!({})).await;
    let http = reqwest::Client::new();
    let stream = async |role: &str, body: J| -> Result<(u16, reqwest::header::HeaderMap, String)> {
        let res = http.post(format!("{}/api/chat", c.base())).bearer_auth(c.token(role)).json(&body).send().await?;
        let (code, head) = (res.status().as_u16(), res.headers().clone());
        Ok((code, head, res.text().await?))
    };
    let was = USE.lock().unwrap().clone();
    let set = |m: &str| { *USE.lock().unwrap() = Some(m.into()); };
    set("fixture");
    // 검사가 실패해도 다음 티켓의 검사가 이 모델을 물려받지 않게 한다
    let res = async {
        let before = counts().await?;
        // 문: 접속 없이는 닫혀 있고, 틀린 본문(비었거나 마지막이 AI의 말이거나 JSON이 아님)은 400 `대상`이다
        ensure!(c.call(None, "POST", "/api/chat", Some(json!({ "messages": [say("안녕")] }))).await?.0 == 401, "접속 없는 대화");
        for bad in [json!({}), json!({ "messages": [] }), json!({ "messages": [bot("x")] }), json!({ "messages": [say("a")], "target": { "kind": "대리점" } })] {
            let (code, r) = c.post(audit, "/api/chat", bad.clone()).await?;
            ensure!(code == 400 && r == json!({ "error": "대상" }), "틀린 본문 {bad} → {code} {r}");
        }
        // 문맥과 붙임이 없는 기록이거나 모르는 종류이면 400 `대상`
        for bad in [json!({ "target": { "kind": "정황", "id": "없음" } }), json!({ "attach": [{ "kind": "대리점", "id": "D-011" }, { "kind": "모름", "id": "x" }] })] {
            let mut body = json!({ "messages": [say("안녕")] });
            body.as_object_mut().unwrap().extend(bad.as_object().cloned().unwrap());
            let (code, r) = c.post(audit, "/api/chat", body.clone()).await?;
            ensure!(code == 400 && r == json!({ "error": "대상" }), "없는 문맥 {body} → {code} {r}");
        }
        ensure!(c.raw(audit, "/api/chat", "{", Some("application/json")).await? == (400, json!({ "error": "대상" })), "JSON이 아닌 본문");

        // 답은 조각조각 흐르고(글자 조각 둘 이상, 머리글), 끝에 조회한 기록 목록이 붙는다. 그 기록은 모두 DB에 있다
        let (code, head, body) = stream(audit, json!({ "messages": [say("대리점을 알려 줘")], "target": { "kind": "대리점", "id": "D-011" } })).await?;
        let (ev, done) = events(&body);
        let text = said(&ev);
        ensure!(code == 200 && head["x-vercel-ai-ui-message-stream"] == "v1" && head["x-accel-buffering"] == "no" && head["content-type"].to_str()?.starts_with("text/event-stream"), "머리글 {code} {head:?}");
        ensure!(ev[0]["type"] == "start" && ev.iter().filter(|e| e["type"] == "text-delta").count() >= 3 && done && ev.iter().any(|e| e["type"] == "text-end") && ev.last().is_some_and(|e| e["type"] == "finish"), "흐름 {body}");
        ensure!(text.contains("조회한 기록: ") && text.contains("대리점 금강상사11"), "문맥이 따라왔다 {text}");
        let reads = ev.iter().find(|e| e["type"] == "data-reads").map(|e| e["data"].clone()).unwrap_or_default();
        // 조회한 기록은 이름으로 보이고(테이블 · id가 없다) 그 이름은 모두 DB의 대리점 이름이다
        ensure!(reads["names"] == json!(["대성상사1", "대륙상사2"]) && reads.get("ids").is_none() && !text.contains("테이블") && !text.contains("D-0"), "조회한 기록 {reads} {text}");

        // 문맥은 끌 수 있고, 붙인 기록이 따라온다. 판정을 묻는 말에는 사실과 규정을 답하고 판정 의견을 내지 않는다
        let (_, _, body) = stream(support, json!({ "messages": [say("이 지급을 승인해도 되나?")], "target": null, "attach": [{ "kind": "정황", "id": "계좌-D-024" }, { "kind": "지급", "id": "RB-00001" }] })).await?;
        let text = said(&events(&body).0);
        ensure!(text.contains("열어 둔 대상은 없다") && text.contains("정황 계좌 · 성일상사24") && text.contains("지급 대성상사1 · ") && !text.contains("테이블") && !text.contains("D-024"), "끈 문맥과 붙임 {text}");
        ensure!(text.contains("판정 의견은 내지 않는다") && text.contains("결정은 사람이 한다") && !["승인하세요", "승인해도 된다", "승인해도 됩니다", "반려하세요", "기각하세요"].iter().any(|w| text.contains(w)), "판정 의견 {text}");
        let (_, _, body) = stream(support, json!({ "messages": [say("안녕"), bot("안녕하세요"), say("대리점 두 곳")] })).await?;
        ensure!(said(&events(&body).0).starts_with("조회한 기록: "), "여러 말");

        // 대화는 남지 않는다: 보고·결정·경위·작업 어디에도 기록이 늘지 않았다
        ensure!(counts().await? == before, "대화가 기록을 남겼다 {before} {}", counts().await?);

        // AI가 멈춰 있으면 오류 낱말이 흐르고 끝나며, 오래 열려 있는 응답이 다른 요청을 막지 않는다
        set("fixture-down");
        let (code, _, body) = stream(audit, json!({ "messages": [say("안녕")] })).await?;
        let (ev, done) = events(&body);
        ensure!(code == 200 && done && ev.iter().any(|e| e["type"] == "error" && e["errorText"] == "대기") && ev.last().is_some_and(|e| e["type"] == "finish"), "AI 멈춤 {body}");
        ensure!(c.get(support, "/api/dealers").await?.as_array().is_some_and(|d| !d.is_empty()), "멈춘 동안의 화면");
        set("fixture-slow");
        let slow = { let (h, u, t) = (http.clone(), format!("{}/api/chat", c.base()), c.token(audit).to_string()); tokio::spawn(async move { h.post(u).bearer_auth(t).json(&json!({ "messages": [say("느리게")] })).send().await?.text().await }) };
        tokio::time::sleep(Duration::from_millis(300)).await;
        let t0 = std::time::Instant::now();
        let (state, listing) = (c.get(audit, "/api/state").await?, c.get(support, "/api/dealers").await?);
        ensure!(!slow.is_finished() && t0.elapsed() < Duration::from_millis(1500) && state["role"] == audit && listing.is_array(), "열려 있는 응답이 다른 요청을 막았다 {:?}", t0.elapsed());
        ensure!(said(&events(&slow.await??).0).contains("조회한 기록"), "느린 답");

        // 키 없이 실제 모델 이름이면 부르지 않고 오류 낱말(키는 인자다. OpenAI를 부르지 않는다)
        let ai = ai_session(&c.db).await?;
        let (ev, _) = (talk("gpt-검사".into(), None, ai.clone(), SYSTEM.into(), vec![("user".into(), "안녕".into())]).collect::<Vec<_>>().await, ());
        ensure!(ev.iter().any(|e| e["type"] == "error" && e["errorText"] == "대기") && said(&ev).is_empty(), "키 없음 {ev:?}");

        // 문맥 칩의 이름: 화면의 제목 줄과 같은 이름
        let it = urlenc(&json!([{ "kind": "정황", "id": "계좌-D-024" }, { "kind": "대리점", "id": "D-011" }, { "kind": "심사", "id": "2026-06-D-001" }, { "kind": "모름", "id": "x" }, { "kind": "정황", "id": "없음" }]).to_string());
        let n = c.get(audit, &format!("/api/chat/names?items={it}")).await?;
        ensure!(n["names"][0] == "계좌 · 성일상사24" && n["names"][1] == "금강상사11" && n["names"][2].is_string() && n["names"][3].is_null() && n["names"][4].is_null(), "이름 {n}");

        // 보고로 남기기: 대상이 정황이 아니거나 AI의 답이 없는 대화는 400 `대상`
        set("fixture");
        let bank = "계좌-D-024";
        let keep = async |role: &str, body: J| { let (code, r) = c.post(role, "/api/chat/report", body).await?; Ok::<_, anyhow::Error>((code, r)) };
        let talked = json!([say("이 정황을 알려 줘"), bot("계좌가 같다")]);
        for body in [json!({ "messages": talked }), json!({ "messages": talked, "target": { "kind": "대리점", "id": "D-011" } }), json!({ "messages": [say("a")], "target": { "kind": "정황", "id": bank } }), json!({ "messages": talked, "target": { "kind": "정황", "id": "없음" } })] {
            let (code, r) = keep(support, body.clone()).await?;
            ensure!(word(code, &r)? == "대상", "보고의 대상 {body} → {code} {r}");
        }
        ensure!(counts().await? == before, "거절한 보고가 남았다");
        // 검증을 통과하면 보고(검토)로 저장되고 17의 보고 칸에 올라온다. 근거 기록을 가리킨 사실이 있고 내부 감시가 채택할 수 있다
        let (code, r) = keep(support, json!({ "messages": talked, "target": { "kind": "정황", "id": bank } })).await?;
        ensure!(code == 200 && r["state"] == "검토" && r["id"].is_string(), "보고 {code} {r}");
        let d = c.get(audit, &format!("/api/signals/{bank}/report")).await?;
        ensure!(d["report"]["id"] == r["id"] && d["report"]["state"] == "검토" && d["report"]["model"] == "fixture" && d["report"]["stale"] == false && d["report"]["facts"].as_array().is_some_and(|f| !f.is_empty())
            && d["actions"].as_array().is_some_and(|a| a.len() == 2), "저장된 보고 {d}");
        // 붙인 정황으로도 남길 수 있다. 검증을 어기면(없는 기록 · 문장 틀의 숫자) 400과 낱말이고 아무것도 저장하지 않는다
        let n = q1(&c.db, "RETURN count(SELECT id FROM report);", json!({})).await?;
        for (m, w) in [("fixture-gap", "기록"), ("fixture-digit", "값")] {
            set(m);
            let (code, r) = keep(audit, json!({ "messages": talked, "target": { "kind": "대리점", "id": "D-011" }, "attach": [{ "kind": "정황", "id": bank }] })).await?;
            ensure!(code == 400 && r == json!({ "error": "오류" }), "{m} {w} → {code} {r}");
        }
        set("fixture-down");
        let (code, r) = keep(audit, json!({ "messages": talked, "target": { "kind": "정황", "id": bank } })).await?;
        ensure!(code == 503 && r == json!({ "error": "대기" }), "AI 멈춤의 보고 {code} {r}");
        ensure!(q1(&c.db, "RETURN count(SELECT id FROM report);", json!({})).await? == n && c.get(audit, &format!("/api/signals/{bank}/report")).await?["report"]["id"] == r_id(&d), "실패한 보고가 남았다");
        Ok(())
    }.await;
    *USE.lock().unwrap() = was;
    res
}
fn urlenc(s: &str) -> String { s.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect() }
fn r_id(d: &J) -> J { d["report"]["id"].clone() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_are_in_the_prompt() {
        assert!(SYSTEM.contains("판정 의견을 내지 않는다") && SYSTEM.contains("read_db") && SYSTEM.contains("쓰기는 되지 않는다"));
    }

    #[test]
    fn cites_records() {
        let mut s = BTreeSet::new();
        cited(r#"[[{"id":"dealer:`D-001`"},{"id":"payout:abc12","x":"http://a"},{"to":"xdealer:zz"},{"id":"review:⟨가-1⟩"}]]"#, &mut s);
        assert_eq!(s.into_iter().collect::<Vec<_>>(), ["dealer:`D-001`", "payout:abc12", "review:⟨가-1⟩"]);
    }

    #[test]
    fn parses_bodies() {
        let ok = json!({ "messages": [{ "role": "user", "parts": [{ "type": "text", "text": "안녕" }] }], "target": { "kind": "대리점", "id": "D-011" } });
        assert!(parse(&ok, true).is_ok_and(|a| a.talk.len() == 1 && a.target.is_some() && a.attach.is_empty()));
        assert!(parse(&json!({ "messages": [] }), true).is_err() && parse(&json!({}), true).is_err());
        let last_bot = json!({ "messages": [{ "role": "assistant", "parts": [{ "type": "text", "text": "x" }] }] });
        assert!(parse(&last_bot, true).is_err() && parse(&last_bot, false).is_ok());
    }
}
