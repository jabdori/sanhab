//! 24 대화: 오른쪽 끝의 대화. 사람이 묻고 AI가 DB를 읽어 답한다(D22, U13, U14).
//! 대화는 임시다 — 서버는 말을 저장하지 않는다(화면이 대화 전체를 매번 보낸다). 남기려면 "보고"를 눌러 17의 검증(꼴 · 문장 틀 · 가리킨 기록의 존재)을 거쳐 보고로 저장한다.
//! 답은 AI SDK의 UI 메시지 스트림(SSE)으로 조각조각 보낸다(`docs/spike/ai-stream.rs`: 내장 변환기를 쓰지 않고 직접 낸다). 웹소켓은 쓰지 않는다.
//! AI는 17의 읽기 전용 계정(`ai_session`)의 `read_db`만 쓴다. 답 아래의 조회한 기록 목록은 AI가 쓰지 않고, 도구가 돌려준 결과에서 코드가 찾아 붙인다(`data-reads`).
//! 자동 검사는 OpenAI를 부르지 않는다: 모델 이름이 `fixture`로 시작하면 고정한 답을 쓰고(`fixture-down` 응답 없음, `fixture-slow` 느리게 흐름), 키는 인자로 받는다.
use super::t25_card::{card_tool, draw, make as make_card, show_tool};
use super::t26_chatdoc::{Up, distinct, doc_tool, files_of, hand};
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

/// 한 번에 쓰는 대화의 길이(마지막 말의 수, 말 하나의 글자 수), 붙일 수 있는 기록의 수, 답을 기다리는 시간(초)
const TURNS: usize = 20;
const CHARS: usize = 4000;
const ATTACH: usize = 5;
const WAIT: u64 = 120;
/// 한 답에서 도구를 부르는 단계의 수
const STEPS: usize = 10;
/// 조회한 기록으로 알려 줄 수 있는 테이블(도구 결과에서 `테이블:id` 꼴을 찾는다)과 그 수
pub(super) const TABLES: [&str; 22] = [
    "dealer", "person", "address", "account", "payout", "deposit", "review", "signal", "ruling", "recon", "clarify",
    "doc", "verdict", "report", "rule", "clause", "task", "decision", "ratify", "dispatch", "adoption", "act",
];
const LISTED: usize = 30;
/// 기록(`$r`)의 사람이 읽는 이름. 화면의 제목 줄과 같다. 기록이 없으면 NONE, 이름이 없는 기록(작업 · 결정 …)은 빈 글
const NAME: &str = "(SELECT VALUE (IF record::tb(id) IN ['review', 'ratify'] THEN name + ' · ' + ym
    ELSE IF record::tb(id) = 'payout' THEN (->payout_of->dealer)[0].name + ' · ' + ym
    ELSE IF record::tb(id) = 'deposit' THEN (->deposit_of->dealer)[0].name
    ELSE IF record::tb(id) = 'rule' THEN name
    ELSE IF record::tb(id) = 'clause' THEN title
    ELSE IF record::tb(id) IN ['address', 'account'] THEN value ELSE name END) ?? '' FROM $r)[0]";

pub const SYSTEM: &str = "너는 SanHab의 대화 도우미다. SanHab은 판매장려금 심사 앱이다: 대리점에 주는 월 판매장려금을 심사 · 승인 · 지급하고, 이름이 달라도 대표자 · 주소 · 계좌 가운데 둘 이상이 같은 대리점(관련 거래처)은 지급을 합쳐 한도를 본다. 네 이름을 물으면 SanHab 도우미라고 답한다.

## 먼저 정한다: 도구가 필요한가
- 인사, 너에 대한 질문(이름, 할 수 있는 일), 앱 쓰는 법, 낱말의 뜻(아래 낱말)은 도구 없이 바로 답한다.
- 특정 기록의 값(금액, 상태, 합산, 승인권자, 일치, 이력, 규정의 값)이 답에 필요할 때만 도구로 읽는다.
- 무엇을 묻는지 모호하면 도구를 부르지 말고 한 문장으로 되묻는다.

## 읽는 법
DB는 read_db 도구로만 읽는다(SurrealQL의 SELECT와 RETURN만. 쓰기는 되지 않는다). 테이블: dealer(name) · person · address · account · rep/addr/acct(대리점 → 사람/주소/계좌 선) · deposit(회수) · payout(지급: ym, amount, status) · review(심사) · signal(정황: kind, name, state, evidence(근거 기록들)) · incident(대리점 정보 변경: dealer, item, value, since(변경일), known(인지일)) · clarify(소명) · rule(규칙) · clause(조항) · recon(대사) · task(작업) · doc(소명에 올라온 서류: name, clarify, read(판독 — 업스테이지 OCR이 읽은 낱말 목록, 낱말은 read.text), tidy(AI가 판독에서 항목 · 값을 정리한 것: item, value)). doc의 data(원본)는 크니 읽지 않는다: 서류의 내용은 `SELECT name, read.text AS words, tidy FROM doc WHERE clarify = clarify:`…``처럼 칸을 정해 읽는다. id에 -가 있으면 `D-024`처럼 백틱으로 감싼다.
- 지금 보는 화면의 기록이 있으면 그 id에서 시작한다. 한 번의 조회에 필요한 칸을 함께 가져온다(대개 한두 번, 많아도 서너 번). 같은 것을 다시 읽지 않는다.
- 정황 화면의 근거 줄과 숫자(지연 일수 · 변경일 · 인지일 · 금액 …)는 `RETURN signal:`지연-D-034`.evidence.map(|$e| fn::evidence($e));`로 화면과 같은 값을 읽는다: at(변경일 · 날짜), known(인지일), days(지연 일수 — 화면의 「지연 45일」), amount, value. 지연 정황의 지연은 근거인 incident의 인지일과 변경일의 차이다.
- 칸을 모를 때만 SELECT * FROM 테이블 LIMIT 2로 먼저 본다.
- 목록 화면(작업)에서는 특정 기록을 가리키지 않는다. 사용자가 기록을 말하지 않았으면 기록을 골라 읽지 않는다.

## 낱말
관련 거래처(대표자 · 주소 · 계좌 가운데 둘 이상이 같은 대리점들) · 합산(관련 거래처까지 합친 그달의 지급액) · 한도(영업지원이 혼자 승인할 수 있는 한 달 금액, 값은 규정에서 읽는다) · 승인권자(합산이 한도 안이면 영업지원, 넘으면 영업임원) · 정황(관련 거래처일 수 있다는 단서, 내부 감시가 판정) · 소명(정황에 대해 대리점에게 받는 설명과 서류) · 추인(이미 나간 지급을 나중에 승인) · 재심사(승인 뒤 관련 거래처가 밝혀져 지급을 멈추고 다시 봄) · 대사(은행 회신과 보낸 금액 · 계좌를 맞춰 봄). 역할: 영업지원(월 지급 심사), 영업임원(한도를 넘는 심사 승인, 추인), 내부 감시(정황 · 소명 판정), 회계·자금(지급과 대사).

## 지킬 것
- 사실과 규정(조항과 규칙의 값)만 답한다. 읽은 값을 그대로 전한다. 읽지 않은 값은 말하지 않는다. 모르면 모른다고 한다. 확신을 숫자나 퍼센트로 쓰지 않는다.
- 승인, 반려, 보류, 요청, 기각, 추인 같은 조치를 해도 되는지 해야 하는지 묻는 말에는 판정 의견을 내지 않는다. 그 판단에 관련된 사실과 규정만 보여 준다.
- 자기 설명과 면책 문장을 쓰지 않는다: 「판정 의견은 내지 않습니다」 「사실과 규정만 정리합니다」 「결정은 사람이 합니다」 「저는 ~할 수 없습니다」처럼 네가 무엇을 하고 안 하는지 말하는 문장 없이, 첫 문장부터 사실을 쓴다.
- 합산, 승인권자, 관련자 여부, 재검토 여부는 DB에 계산되어 있는 값을 읽어 전한다. 직접 계산하거나 고치지 않는다.
- 조치를 실행하지 못하고 기록을 만들거나 바꾸지 못한다. 사용자가 승인, 보류, 반려, 추인, 거부, 요청, 기각, 인정, 불인정, 보완 같은 조치를 하라고 지시하면 card 도구로 조치 카드를 낸다(대상의 id는 먼저 읽어 확인한다). 카드는 내용일 뿐이고 실행은 사람이 카드에서 누른다. 사유의 분류와 메모는 사용자가 말한 것만 옮겨 적고 말하지 않았으면 비운다(지어내지 않는다). 사용자가 지시하지 않았으면 카드를 내지 않는다. 카드를 냈으면 답은 「아래 카드의 실행을 누르면 처리됩니다」처럼 한 문장으로 짧게 맺는다(「카드에서 눌러 주세요」 같은 지시조로 되풀이하지 않는다). 도구가 카드를 내지 않는다고 하면 그 까닭(권한이 없다 · 지금 상태에서는 할 수 없다 · 분류가 맞지 않는다)을 짧게 알린다.
- 사용자가 이번 말에 파일을 올렸으면(문맥의 「이번 말에 올린 파일」) 묻는 말이 무엇이든 그 파일을 소명의 서류로 넘기는 일로 이끈다. 앞선 말에서 올린 파일은 사용자가 넘기라고 하거나 넘길 소명을 고를 때만 doc로 넘기고, 그 밖의 물음에는 서류 이야기를 꺼내지 않는다. 파일은 소명의 서류로 넘기려고 올리는 것이다. 어느 소명인지 사용자가 말했거나 열어 둔 대상이 소명이면 doc 도구로 넘긴다. 아니면 doc를 clarify 빈 글로 불러 받을 수 있는 소명을 얻고 「이 서류를 어느 소명의 서류로 넘길까요?」처럼 소명의 이름을 들어 묻는다(추측하지 않는다). 받을 수 있는 소명이 없거나 넘기지 못했으면 그 까닭을 짧게 알린다.
- 서류를 읽고 무엇이 적혀 있는지는 설명하되, 서류를 근거로 인정 · 불인정 같은 판정 의견은 내지 않는다. 소명에 올라온 서류는 doc의 read와 tidy로 읽고, 이번 말에 올린 파일은 문맥의 「판독(OCR) 글」로 읽는다. 서류의 내용을 전할 때는 「판독(OCR)한 글에 ~라고 적혀 있다」처럼 출처가 판독임을 사실로 밝힌다. 판독 글이 없으면(판독하지 못했다) 그 사실만 짧게 알린다.

## 화면 부품(show)
- 답에 값이 셋 이상이거나, 여러 기록을 들거나, 둘 이상을 비교할 때만 글과 함께 show로 부품을 하나 그린다(한 기록의 값 → Facts, 여러 기록 · 비교 → Table, 근거가 된 기록 → Records). 대화 칸은 좁다: Table은 열 2개면 표로, 3개 이상이면 줄마다 묶음으로 그려지니 열은 꼭 필요한 넷 안팎으로 하고 값은 짧게 쓴다. 답이 여러 기록을 다뤘으면 Table과 함께 Records로 그 기록들을 열 수 있게 붙인다. 인사 · 낱말 · 값 한두 개의 물음에는 쓰지 않는다.
- 두 대리점 이상의 식별자(대표자 · 주소 · 계좌) 비교는 Table로(줄 = 항목, 열 = 대리점).
- 부품에는 이 답에서 read_db로 읽은 값만 그대로 넣는다. 읽지 않은 값과 계산한 값은 넣지 않는다. 사용자가 말한 가정의 값(예: 한도 150만 원)은 넣을 수 있고, 열이나 칸 이름에 가정이라고 밝힌다. 부품은 보기만 한다 — 조치는 card로만 낸다.
- 부품의 칸 하나에는 값 하나만 넣는다: 귀속월 · 금액 · 상태처럼 뜻이 다른 값을 ·나 쉼표로 이어 한 칸에 넣지 않고 열이나 줄을 나눈다.
- 부품을 그렸으면 글은 첫 문장의 답과 부품에 없는 것만 짧게 쓴다.

## 답의 꼴
- 첫 문장에 묻는 말의 답을 바로 쓴다. 그 뒤에 근거가 된 값을 줄마다 `-`로 짧게 덧붙인다(필요할 때만).
- 답에는 테이블 이름과 id를 쓰지 않고 이름(대리점 이름, 귀속월 …)으로 적는다. id는 도구를 부를 때만 쓴다.
- 날짜는 2026-06-01 꼴로 쓴다(DB의 T00:00:00Z는 붙이지 않는다). 값이 비어 있으면 없음이라고 쓴다.
- 한국어로 짧게 쓴다. 마크다운(표, 굵은 글씨, 제목)은 쓰지 않는다.";

/// 화면의 기록: 대상의 종류(화면의 낱말)와 id
#[derive(Clone)]
struct Rec { kind: String, id: String }

fn rec(v: &J) -> Option<Rec> {
    let (k, i) = (v["kind"].as_str()?, v["id"].as_str()?);
    (!k.is_empty() && !i.is_empty() && k.chars().count() <= 40 && i.chars().count() <= 200).then(|| Rec { kind: k.into(), id: i.into() })
}
/// 화면의 대상 종류가 가리키는 테이블
fn table_of(kind: &str) -> Option<&'static str> {
    Some(match kind { "심사" => "review", "정황" => "signal", "소명" => "clarify", "대리점" => "dealer", "지급" => "payout", "규정" => "clause", "추인" => "ratify", _ => return None })
}

/// 요청의 본문: (대화, 문맥, 붙인 기록). 틀리면 400 `대상`
struct Ask { talk: Vec<(String, String)>, target: Option<Rec>, attach: Vec<Rec>, files: Vec<Up>, now: Vec<Up> }
/// now: 이번 말(마지막 사람의 말)에 올린 파일 — 판독은 이것만 한다(한 말에 한 번)
/// `asking`이면 마지막이 사람의 말이어야 한다(답을 청하는 요청). 보고로 남길 때는 AI의 답으로 끝난다
fn parse(b: &J, asking: bool) -> Result<Ask, ApiError> {
    let bad = || refuse("대상");
    let list = b["messages"].as_array().filter(|m| !m.is_empty()).ok_or_else(bad)?;
    let (mut talk, mut files, mut now) = (vec![], vec![], vec![]);
    // 대화가 길어지면 마지막 TURNS개만 쓴다(거절하지 않는다)
    for m in &list[list.len().saturating_sub(TURNS)..] {
        let role = m["role"].as_str().filter(|r| ["user", "assistant"].contains(r)).ok_or_else(bad)?;
        let text: String = m["parts"].as_array().ok_or_else(bad)?.iter().filter(|p| p["type"] == "text").filter_map(|p| p["text"].as_str()).collect();
        if text.chars().count() > CHARS { return Err(bad()); }
        if role == "user" {
            let got = files_of(m["parts"].as_array().map_or(&[][..], Vec::as_slice));
            now = got.clone();
            files.extend(got);
        }
        if text.trim().is_empty() { continue; }
        // 대화는 역할마다 하나라 화면을 오간다(D67): 사람의 말마다 그때 보던 화면을 적어 보낸다. 화면이 보낸 이름이라 짧게 자른다
        let seen: Vec<String> = m["metadata"]["ctx"].as_array().into_iter().flatten().take(ATTACH + 1)
            .filter_map(|c| Some(format!("{} {}", c["kind"].as_str()?, c["name"].as_str().unwrap_or_default()).trim().chars().take(80).collect::<String>())).collect();
        let text = if role == "user" && !seen.is_empty() { format!("[이 말을 할 때 보던 화면: {}] {text}", seen.join(", ")) } else { text };
        talk.push((role.to_string(), text));
    }
    if talk.last().is_none_or(|(r, _)| asking && r != "user") { return Err(bad()); }
    let target = match &b["target"] { J::Null => None, t => Some(rec(t).ok_or_else(bad)?) };
    let attach = match b["attach"].as_array() {
        None => vec![],
        Some(a) if a.len() <= ATTACH => a.iter().map(|r| rec(r).ok_or_else(bad)).collect::<Result<_, _>>()?,
        Some(_) => return Err(bad()),
    };
    Ok(Ask { talk, target, attach, files: distinct(files), now: distinct(now) })
}

/// 모델에게 알리는 문맥: 역할, 지금 열어 둔 대상(끄면 없다), 붙인 기록
fn context(role: &str, a: &Ask, names: &HashMap<String, String>) -> String {
    let one = |r: &Rec| format!("{} {} (테이블 {}, id {})", r.kind, names.get(&format!("{}/{}", r.kind, r.id)).filter(|n| !n.is_empty()).unwrap_or(&r.id), table_of(&r.kind).unwrap_or_default(), r.id);
    let mut s = format!("{SYSTEM}\n{}\n사용자의 역할은 {role}이다.", super::t17_report::SOURCE);
    match &a.target { Some(t) => s += &format!("\n사용자가 지금 보는 화면: {}. 묻는 말에 대상이 따로 없으면 이것을 가리킨다.", one(t)), None => s += "\n사용자가 지금 연 기록은 없다(목록 화면)." }
    s += "\n대화는 화면을 옮겨도 이어진다. 앞선 말의 [이 말을 할 때 보던 화면]은 그 말이 가리키던 기록이다. 그 표시는 답에 되풀이하지 않는다.";
    if !a.attach.is_empty() { s += &format!("\n사용자가 붙인 기록: {}.", a.attach.iter().map(one).collect::<Vec<_>>().join(", ")); }
    let names = a.files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>().join(", ");
    if !a.files.is_empty() { s += &if !a.now.is_empty() { format!("\n사용자가 이번 말에 올린 파일: {names}.") } else { format!("\n사용자가 앞선 말에서 올린 파일(이번 말에는 올리지 않았다): {names}.") }; }
    s
}

/// 문맥에서 이번 말에 올린 파일의 판독 글이 시작하는 표시(고정 응답이 이 뒤를 그대로 전한다)
const OCR_MARK: &str = "의 판독(OCR) 글: ";
/// 이번 말에 올린 파일을 19와 같은 판독(업스테이지 OCR, 첫 쪽)으로 읽어 문맥 줄로. 모델의 사용자 말은 글만 받아(aisdk 0.6.4의 UserMessage는 글 하나) 파일을 판독한 글로 준다.
/// 이미지 · PDF이고 2MB까지만 읽는다. 판독은 한 말에 한 번(앞선 말의 파일은 다시 읽지 않는다)
async fn read_files(files: &[Up], key: Option<&str>) -> String {
    let m = super::t19_docs::read_model();
    let mut s = String::new();
    for f in files.iter().take(ATTACH) {
        let ok = f.bytes.len() <= super::t19_docs::MAX && super::t19_docs::looks(&f.mime, &f.bytes);
        let ws = if ok { super::t19_docs::ocr(&m, key, &f.bytes, &f.mime).await } else { None };
        s += &match ws {
            Some(ws) => format!("\n이번 말에 올린 파일 {}{OCR_MARK}{}", f.name, ws.iter().filter_map(|w| w["text"].as_str()).collect::<Vec<_>>().join(" ").chars().take(CHARS).collect::<String>()),
            None => format!("\n이번 말에 올린 파일 {}은 판독하지 못했다{}.", f.name, if ok { "" } else { "(이미지나 PDF, 2MB까지)" }),
        };
    }
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
fn talk(model: String, key: Option<String>, ai: Db, me: Db, system: String, recs: Vec<Rec>, talk: Vec<(String, String)>, files: Vec<Up>) -> impl Stream<Item = J> {
    async_stream::stream! {
        // 답마다 다른 id: 같은 id면 화면(AI SDK)이 앞 답을 덮어쓴다
        yield json!({ "type": "start", "messageId": format!("msg-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos())) });
        let seen = Arc::new(Mutex::new(BTreeSet::new()));
        // 조치 카드(25): AI가 도구로 낸 카드의 내용. 실행은 하지 않는다
        let cards = Arc::new(Mutex::new(Vec::<J>::new()));
        // 화면 부품(A2UI, 25): AI가 show 도구로 낸 표면. 검사를 거친 것만
        let surfaces = Arc::new(Mutex::new(Vec::<J>::new()));
        // 서류(26): 넘긴 파일. 넘기는 일은 도구가 그 사람의 세션으로 19와 같은 길에서 한다
        let (files, handed) = (Arc::new(files), Arc::new(Mutex::new(Vec::<J>::new())));
        let mut n = 0;
        let mut open = false;
        let mut word: Option<&str> = None;
        // 시작한 도구 호출과 그 시각(끝나지 않고 멈추면 실패로 닫는다. 끝나면 걸린 시간을 보인다)
        let mut running: Vec<(String, &str, tokio::time::Instant)> = vec![];
        if model.starts_with("fixture") {
            let say = match match fixture_card(&model, &me, &talk, &cards).await { None => fixture_doc(&model, &me, &talk, &files, &handed).await, c => c } { Some(t) => Some((t, 5)), None => canned(&model, &ai, &system, &recs, &talk, &seen).await };
            match say {
                None => word = Some("대기"),
                Some((text, pause)) => {
                if let Some(raw) = talk.last().and_then(|(_, t)| t.strip_prefix("표시|")).filter(|_| model == "fixture") {
                    let known = seen.lock().unwrap().clone();
                    match draw(&ai, raw, &known).await { Ok(s) => surfaces.lock().unwrap().push(s), Err(w) => { n += 1; yield json!({ "type": "text-start", "id": format!("t{n}") }); yield json!({ "type": "text-delta", "id": format!("t{n}"), "delta": format!("그리지 않는다: {w}. ") }); yield json!({ "type": "text-end", "id": format!("t{n}") }); } }
                }
                for piece in text.split_inclusive(' ') {
                    if !open { n += 1; open = true; yield json!({ "type": "text-start", "id": format!("t{n}") }); }
                    yield json!({ "type": "text-delta", "id": format!("t{n}"), "delta": piece });
                    tokio::time::sleep(Duration::from_millis(pause)).await;
                }
                }
            }
        } else if key.as_deref().is_none_or(str::is_empty) {
            word = Some("대기");
        } else {
            let tool = read_tool(&ai, { let seen = seen.clone(); Arc::new(move |out: &str| cited(out, &mut seen.lock().unwrap())) }).and_then(|t| card_tool(&me, cards.clone()).map(|c| (t, c))).and_then(|(t, c)| doc_tool(&me, files.clone(), handed.clone()).map(|d| (t, c, d))).and_then(|(t, c, d)| show_tool(&ai, seen.clone(), surfaces.clone()).map(|s| (t, c, d, s)));
            let started = match tool {
                Ok((tool, card, doc, show)) => LanguageModelRequest::builder()
                    .model(OpenAI::<aisdk::core::DynamicModel>::model_name(&model)).messages(messages(system, &talk))
                    .with_tool(tool).with_tool(card).with_tool(doc).with_tool(show).stop_when(step_count_is(STEPS)).build().stream_text().await.ok(),
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
                            LanguageModelStreamChunkType::ToolCallAvailable(info) => {
                                let what = match info.tool.name.as_str() { "read_db" => "조회", "card" => "카드", "doc" => "서류", "show" => "요약", _ => "" };
                                if !what.is_empty() { running.push((info.tool.id.clone(), what, tokio::time::Instant::now())); yield json!({ "type": "data-step", "id": info.tool.id, "data": { "tool": what, "state": "run", "names": [], "go": [] } }); }
                            }
                            LanguageModelStreamChunkType::ToolCallEnd(r) => {
                                let what = match r.tool.name.as_str() { "read_db" => "조회", "card" => "카드", "doc" => "서류", "show" => "요약", _ => "" };
                                if !what.is_empty() {
                                    let ms = running.iter().find(|(id, ..)| id == &r.tool.id).map(|(.., t0)| t0.elapsed().as_millis() as u64);
                                    running.retain(|(id, ..)| id != &r.tool.id);
                                    // aisdk는 도구의 실패를 `Error: …` 글로 감싸 돌려준다
                                    let out = r.output.as_ref().map(|v| v.as_str().map_or_else(|| v.to_string(), String::from)).unwrap_or_default();
                                    let failed = r.output.is_err() || out.starts_with("Error:");
                                    let (names, go) = if what == "조회" { let mut one = BTreeSet::new(); cited(&out, &mut one); reads_names(&ai, &one.into_iter().take(LISTED).collect::<Vec<_>>()).await } else { (vec![], vec![]) };
                                    yield json!({ "type": "data-step", "id": r.tool.id, "data": { "tool": what, "state": if failed { "fail" } else { "done" }, "names": names, "go": go, "ms": ms } });
                                }
                            }
                            LanguageModelStreamChunkType::Failed(_) => { word = Some("대기"); break }
                            _ => {}
                        }
                    }
                }
            }
        }
        if open { yield json!({ "type": "text-end", "id": format!("t{n}") }); }
        // 시간 초과 · 모델 실패로 끝났으면 진행 중인 도구 줄을 실패로 닫는다(저장된 대화에 `진행`이 남지 않게)
        for (id, what, _) in std::mem::take(&mut running) { yield json!({ "type": "data-step", "id": id, "data": { "tool": what, "state": "fail", "names": [], "go": [] } }); }
        if model.starts_with("fixture") {
            let ids: Vec<String> = seen.lock().unwrap().iter().take(LISTED).cloned().collect();
            if !ids.is_empty() { let (names, go) = reads_names(&ai, &ids).await; yield json!({ "type": "data-step", "id": "s1", "data": { "tool": "조회", "state": "done", "names": names, "go": go } }); }
        }
        // 글 없이 끝났으면(단계를 다 쓰고도 답하지 못함) 응답이 없는 것과 같다
        if n == 0 && word.is_none() && cards.lock().unwrap().is_empty() && handed.lock().unwrap().is_empty() && surfaces.lock().unwrap().is_empty() { word = Some("대기"); }
        if let Some(w) = word { yield json!({ "type": "error", "errorText": w }); }
        let shown: Vec<J> = surfaces.lock().unwrap().clone();
        for (i, s) in shown.into_iter().enumerate() { yield json!({ "type": "data-a2ui", "id": format!("a{i}"), "data": { "messages": s } }); }
        let drawn: Vec<J> = cards.lock().unwrap().clone();
        for card in drawn { yield json!({ "type": "data-card", "data": card }); }
        let given: Vec<J> = handed.lock().unwrap().clone();
        for d in given { yield json!({ "type": "data-doc", "data": d }); }
        let ids: Vec<String> = seen.lock().unwrap().iter().take(LISTED).cloned().collect();
        let (listed, go) = reads_names(&ai, &ids).await;
        if !listed.is_empty() { yield json!({ "type": "data-reads", "data": { "names": listed, "go": go } }); }
        // 답을 마친 시각(말의 시각 표시)과 실패의 낱말은 말의 메타데이터로 — 저장된 대화에도 남는다
        let at = q1(&ai, "RETURN <string> time::now();", json!({})).await.unwrap_or_default();
        yield json!({ "type": "finish", "messageMetadata": { "at": at, "fail": word } });
    }
}

/// 고정한 조치 카드(자동 검사용, 모델 `fixture`만): 사람의 말이 `카드|종류|id|조치|분류|메모`이면 실제 도구와 같은 `make_card`로 카드를 만들어 모은다. 글은 결과의 낱말이다
async fn fixture_card(model: &str, me: &Db, talk: &[(String, String)], cards: &Arc<Mutex<Vec<J>>>) -> Option<String> {
    let ask = talk.last().map(|(_, t)| t.as_str())?;
    let f: Vec<&str> = ask.strip_prefix("카드|").filter(|_| model == "fixture")?.split('|').collect();
    let at = |i: usize| f.get(i).copied().filter(|s| !s.is_empty());
    Some(match make_card(me, at(0).unwrap_or_default(), at(1).unwrap_or_default(), at(2).unwrap_or_default(), at(3), at(4)).await {
        Ok(c) => { cards.lock().unwrap().push(c); "카드를 그렸다.".into() }
        Err(w) => format!("카드를 내지 않는다: {w}."),
    })
}

/// 고정한 서류 넘기기(자동 검사용, 모델 `fixture`만): 사람의 말이 `서류|소명 id|파일 이름`이면 실제 도구와 같은 `hand`로 넘긴다. 글은 `hand`의 결과 그대로다
async fn fixture_doc(model: &str, me: &Db, talk: &[(String, String)], files: &Arc<Vec<Up>>, handed: &Arc<Mutex<Vec<J>>>) -> Option<String> {
    let ask = talk.last().map(|(_, t)| t.as_str())?;
    let f: Vec<&str> = ask.strip_prefix("서류|").filter(|_| model == "fixture")?.split('|').collect();
    let (text, done) = hand(me, files, f.first().copied().unwrap_or_default(), f.get(1).copied().unwrap_or_default()).await;
    if let Some(d) = done { handed.lock().unwrap().push(d); }
    Some(text)
}

/// 고정한 답(자동 검사용): 열어 둔 대상과 붙인 기록을 실제로 읽고(AI의 세션) 그 이름과 값 한두 개를 풀어 쓴다. 문맥이 없으면 읽지 않는다. 판정 의견 · 자기 설명은 쓰지 않는다. (글, 조각 사이의 쉼 밀리초). `fixture-down`은 없음
async fn canned(model: &str, ai: &Db, system: &str, recs: &[Rec], _talk: &[(String, String)], seen: &Arc<Mutex<BTreeSet<String>>>) -> Option<(String, u64)> {
    let pause = match model { "fixture" => 5, "fixture-slow" => 600, _ => return None };
    // 이번 말에 올린 파일을 판독했으면 그 글을 전한다(출처는 판독)
    if let Some((_, read)) = system.split_once(OCR_MARK) { return Some((format!("판독(OCR)한 글: {}", read.lines().next().unwrap_or_default()), pause)); }
    let mut facts: Vec<String> = vec![];
    for r in recs {
        let Some(tb) = table_of(&r.kind) else { continue };
        let sql = format!("SELECT id, name, total, `limit`, approver, (evidence ?? []).len() AS ev FROM type::record('{tb}', '{}');", r.id.replace('\\', "\\\\").replace('\'', "\\'"));
        let out = read_db(ai, &sql).await;
        cited(&out, &mut seen.lock().unwrap());
        let Some(row) = serde_json::from_str::<J>(&out).ok().and_then(|v| v[0].get(0).cloned()) else { continue };
        // 이름은 제목 줄과 같은 이름(지급은 `대리점 · 귀속월`)
        let shown = reads_names(ai, &[format!("{tb}:`{}`", r.id.replace('`', ""))]).await.0.into_iter().next().unwrap_or_else(|| row["name"].as_str().unwrap_or_default().to_string());
        let mut f = format!("{} {shown}", r.kind).trim_end().to_string();
        if let (Some(t), Some(a)) = (row["total"].as_i64(), row["approver"].as_str()) { f += &format!(": 합산 {}, 승인권자 {a}", super::t17_report::comma(t)); }
        // 근거는 정황에만 있다 — 다른 기록(지급 · 대리점 …)은 이름만
        else if let (true, Some(n)) = (tb == "signal", row["ev"].as_i64()) { f += &format!(": 근거 {n}건"); }
        facts.push(f);
    }
    // 판정을 묻는 말에도 판정 의견 · 자기 설명 없이 읽은 사실만
    let text = if facts.is_empty() { "열어 둔 기록도 붙인 기록도 없어 조회하지 않았다. 기록을 열거나 @로 붙여 물어보면 그 기록을 읽어 답한다.".to_string() }
        else { format!("조회한 기록: {}.", facts.join(", ")) };
    // 지시문(문맥 줄)은 되풀이하지 않는다 — 답에는 읽은 기록의 사실만
    Some((text, pause))
}

pub fn routes() -> Router<Arc<Db>> {
    Router::new()
        .route("/chat", post(chat).layer(axum::extract::DefaultBodyLimit::max(8 * 1024 * 1024)))
        .route("/chat/report", post(keep))
        .route("/chat/names", get(names))
        .route("/chat/find", get(find))
        .route("/chat/sessions", get(sessions).post(open_session))
        .route("/chat/sessions/{id}", get(session).put(save_session).layer(axum::extract::DefaultBodyLimit::max(4 * 1024 * 1024)))
}

/// `@`로 붙일 기록 찾기: `?q=` → `{ items: [{ kind, id, name }] }`(대리점 · 심사 · 정황 · 소명 · 추인 · 조항, 이름이나 id에 q가 든 것, 종류마다 몇 개).
/// 그 사람의 세션으로 읽는다(볼 수 있는 기록만). q가 비면 종류마다 두 개(처음 펼친 목록)
async fn find(Extension(me): Extension<Me>, Query(q): Query<HashMap<String, String>>) -> R {
    let q = q.get("q").map(|s| s.trim().to_lowercase()).unwrap_or_default().chars().take(40).collect::<String>();
    let n = if q.is_empty() { 2 } else { 5 };
    let pick = |kind: &str, tb: &str, name: &str| format!("(SELECT '{kind}' AS kind, <string> record::id(id) AS id, {name} AS name FROM {tb} WHERE string::contains(string::lowercase({name} + ' ' + <string> record::id(id)), $q) LIMIT {n})");
    let parts = [
        pick("대리점", "dealer", "name"),
        pick("심사", "review", "name + ' · ' + ym"),
        pick("정황", "signal", "name"),
        pick("소명", "clarify", "name"),
        pick("추인", "ratify", "name + ' · ' + ym"),
        pick("규정", "clause", "title"),
    ];
    let items = q1(&me.db, &format!("RETURN array::flatten([{}]);", parts.join(", ")), json!({ "q": q })).await?;
    Ok(Json(json!({ "items": items })))
}

// ---- 대화 세션(D61): 그래프의 노드 `session`과 선 `about`(대화 → 다룬 기록: 문맥·붙임) · `reads`(대화 → AI가 읽은 기록).
// 근거·경위(선 15·25)에는 들어가지 않는다 — 공식 기록이 되는 길은 "보고로 남기기" 하나. 역할마다 따로 보인다.
// 업무 DB를 다시 적재해도(시연 초기화, 스키마가 바뀐 재배포) 남는다: main.rs의 `seed_all`이 이 세 테이블을 보관했다가 되살린다.
// 화면이 답이 끝날 때마다 대화 전체를 저장한다(말 목록은 노드 안에, 읽은 기록·붙인 기록은 선으로).

const SESSION: &str = "record::id(id) AS id, title, target, time::format(<datetime> updated + 9h, '%Y-%m-%d %H:%M') AS updated";

/// `{ kind, id }` 목록 → 있는 기록만 `table:id` 문자열로(종류를 모르거나 없는 기록은 뺀다 — 화면이 보낸 값이라 서버가 거른다)
async fn records_of(db: &Db, items: &J) -> Vec<String> {
    let ids: Vec<String> = items.as_array().into_iter().flatten().filter_map(rec).filter_map(|r| table_of(&r.kind).map(|t| format!("{t}:`{}`", r.id.replace('`', "")))).take(50).collect();
    let v = q1(db, "RETURN $ids.filter(|$s| (SELECT VALUE id FROM type::record($s)).len() > 0);", json!({ "ids": ids })).await.unwrap_or_default();
    v.as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect()
}

/// 이 역할의 대화 목록(최근 것부터). `?of=종류/id`이면 그 기록을 다룬 대화만 → `{ sessions: [{ id, title, target|null, updated }] }`
async fn sessions(Extension(me): Extension<Me>, State(db): State<Arc<Db>>, Query(q): Query<HashMap<String, String>>) -> R {
    let of = match q.get("of").and_then(|s| s.split_once('/')) {
        Some((k, i)) => records_of(&db, &json!([{ "kind": k, "id": i }])).await.into_iter().next().ok_or_else(|| refuse("대상")).map(Some)?,
        None => None,
    };
    let filter = if of.is_some() { "AND type::record($of) INSIDE ->about->?" } else { "" };
    let mut list = q1(&db, &format!("SELECT {SESSION}, target_name, (->about->?).map(|$r| <string> $r) AS about, <datetime> updated AS at FROM session WHERE role = $role {filter} ORDER BY at DESC LIMIT 100;"), json!({ "role": me.role, "of": of })).await?;
    // 다룬 기록의 이름(첫 기록)과 수. 기록이 없어졌으면(다시 적재로 바뀐 기록) 대화를 열 때 적어 둔 이름
    if let Some(rows) = list.as_array_mut() {
        for row in rows.iter_mut() {
            let ids: Vec<String> = row["about"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect();
            // 수는 선의 수로 센다(다시 적재로 없어진 기록도 다룬 기록이다), 첫 이름은 연 기록의 이름(적어 둔 것)이 먼저
            let (names, _) = reads_names(&db, &ids).await;
            let first = row["target_name"].as_str().map(String::from).or_else(|| names.first().cloned());
            // 기록 이름에 이미 `외 n`(심사의 구성)이 있을 수 있어 수는 따로 낸다(화면: `기록 n`)
            row["name"] = first.map_or(J::Null, J::String);
            row["count"] = json!(ids.len());
            if let Some(o) = row.as_object_mut() { o.remove("about"); o.remove("target_name"); o.remove("at"); }
        }
    }
    Ok(Json(json!({ "sessions": list })))
}

/// 새 대화: `{ target?: { kind, id } }` → `{ id }`. 문맥이 있으면 그 기록에 `about` 선을 잇는다
async fn open_session(Extension(me): Extension<Me>, State(db): State<Arc<Db>>, Body(b): Body) -> R {
    let target = if b["target"].is_null() { None } else { Some(records_of(&db, &json!([b["target"]])).await.into_iter().next().ok_or_else(|| refuse("대상"))?) };
    // 문맥 기록의 이름을 적어 둔다: 기록이 다시 적재로 바뀌어도 목록에서 어느 기록의 대화였는지 보이게
    let named = match &target { Some(t) => reads_names(&db, std::slice::from_ref(t)).await.0.into_iter().next(), None => None };
    let r = q1(
        &db,
        "LET $s = (CREATE session SET role = $role, title = '', target = $t, target_name = $n, messages = [], created = time::now(), updated = time::now())[0].id;
         IF $r { RELATE $s->about->(type::record($r)) };
         RETURN record::id($s);",
        json!({ "role": me.role, "t": if target.is_some() { b["target"].clone() } else { J::Null }, "r": target, "n": named }),
    )
    .await?;
    Ok(Json(json!({ "id": r })))
}

/// 대화 하나 → `{ id, title, target, updated, messages, about[], reads[] }`(다른 역할의 대화는 404)
async fn session(Extension(me): Extension<Me>, State(db): State<Arc<Db>>, axum::extract::Path(id): axum::extract::Path<String>) -> R {
    let r = q1(&db, &format!("SELECT {SESSION}, messages, ->about->? AS about, ->reads->? AS reads FROM type::record('session', $id) WHERE role = $role;"), json!({ "id": id, "role": me.role })).await?;
    r.get(0).cloned().map(Json).ok_or_else(|| err(StatusCode::NOT_FOUND, "없음"))
}

/// 대화 저장: `{ messages, title, about?: [{kind,id}], reads?: [{kind,id}] }` — 말 목록은 덮어쓰고, 다룬 기록·읽은 기록은 아직 없는 선만 더한다(파일 파트는 화면이 빼고 보낸다)
async fn save_session(Extension(me): Extension<Me>, State(db): State<Arc<Db>>, axum::extract::Path(id): axum::extract::Path<String>, Body(b): Body) -> R {
    let (Some(messages), title) = (b["messages"].as_array(), b["title"].as_str().unwrap_or("").chars().take(60).collect::<String>()) else { return Err(refuse("대상")) };
    let (about, reads) = (records_of(&db, &b["about"]).await, records_of(&db, &b["reads"]).await);
    let r = q1(
        &db,
        // 맨 바깥의 RETURN은 뒤 문장을 멈추지 않는다 — 역할이 맞을 때만 블록 안에서 고친다(다른 역할의 대화는 건드리지 못한다)
        "LET $s = type::record('session', $id);
         IF (SELECT VALUE role FROM $s)[0] = $role {
             UPDATE $s SET messages = $m, title = $t, updated = time::now();
             FOR $x IN $about { LET $o = type::record($x); IF $o NOT IN $s->about->? { RELATE $s->about->$o } };
             FOR $x IN $reads { LET $o = type::record($x); IF $o NOT IN $s->reads->? { RELATE $s->reads->$o } };
             RETURN $id;
         } ELSE { RETURN NONE };",
        json!({ "id": id, "role": me.role, "m": messages, "t": title, "about": about, "reads": reads }),
    )
    .await?;
    if r.is_null() { return Err(err(StatusCode::NOT_FOUND, "없음")); }
    Ok(Json(json!({ "id": r })))
}

/// 문맥 칩의 이름: `?items=[{ kind, id }]` → `{ names: [이름|null] }`. 화면이 제목 줄에 보이는 이름과 같다(정황 · 대리점 · 소명은 name, 심사는 `이름 · 귀속월`, 지급은 `대리점 · 귀속월`, 조항은 title).
/// 모르는 종류나 없는 기록은 null(화면은 id를 보인다). 읽기 한 번이다
async fn names(State(db): State<Arc<Db>>, Query(q): Query<HashMap<String, String>>) -> R {
    let items: Vec<J> = serde_json::from_str::<Vec<J>>(q.get("items").map_or("[]", String::as_str)).map_err(|_| refuse("대상"))?;
    let recs: Vec<Rec> = items.iter().map(rec).collect::<Option<_>>().filter(|r: &Vec<Rec>| r.len() <= ATTACH + 1).ok_or_else(|| refuse("대상"))?;
    Ok(Json(json!({ "names": names_of(&db, &recs).await.map_err(|_| refuse("대상"))? })))
}
/// 화면의 기록들의 이름(모르는 종류나 없는 기록은 None, 기록은 있고 이름이 없으면 빈 글)
async fn names_of(db: &Db, recs: &[Rec]) -> Result<Vec<Option<String>>> {
    let items: Vec<J> = recs.iter().map(|r| json!({ "tb": table_of(&r.kind).unwrap_or("meta"), "id": r.id })).collect();
    let v = q1(db, &format!("RETURN $items.map(|$i| type::record($i.tb, $i.id)).map(|$r| {NAME});"), json!({ "items": items })).await?;
    Ok(v.as_array().into_iter().flatten().zip(recs).map(|(n, r)| n.as_str().filter(|_| table_of(&r.kind).is_some()).map(String::from)).collect())
}
/// 조회한 기록(`테이블:id`)의 이름들. 이름이 없는 기록은 빼고 같은 이름은 한 번만
/// 조회한 기록의 이름과, 화면에서 그 기록을 여는 길(`go`: 이름과 같은 순서. `{ kind: 화면의 종류, id }`, 열 화면이 없는 기록(사람·주소·규칙 …)은 null)
async fn reads_names(db: &Db, ids: &[String]) -> (Vec<String>, Vec<J>) {
    let (mut out, mut go): (Vec<String>, Vec<J>) = (vec![], vec![]);
    for (n, g) in named(db, ids).await.into_iter().flatten() {
        if n.is_empty() || out.contains(&n) { continue; }
        out.push(n);
        go.push(g);
    }
    (out, go)
}
/// 기록마다(같은 순서) 이름과 여는 길. 없는 기록은 None, 이름이 없으면 빈 글
pub(super) async fn named(db: &Db, ids: &[String]) -> Vec<Option<(String, J)>> {
    let v = q1(db, &format!("RETURN $ids.map(|$s| type::record($s)).map(|$r| {{ name: {NAME}, tb: record::tb($r), id: <string> record::id($r) }});"), json!({ "ids": ids })).await.unwrap_or_default();
    let view = |tb: &str| match tb { "review" => Some("심사"), "ratify" => Some("추인"), "payout" => Some("지급"), "dealer" => Some("대리점"), "signal" => Some("정황"), "clarify" => Some("소명"), _ => None };
    v.as_array().into_iter().flatten().map(|r| Some((r["name"].as_str()?.to_string(), view(r["tb"].as_str().unwrap_or_default()).map_or(J::Null, |k| json!({ "kind": k, "id": r["id"] }))))).collect()
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
    let m = model();
    // 고정 응답(자동 검사)에서는 업스테이지를 부르지 않는다(판독도 고정 응답 `READ`만)
    let ocr_key = if m.starts_with("fixture") { None } else { std::env::var("UPSTAGE_API_KEY").ok() };
    let system = context(&me.role, &a, &names) + &read_files(&a.now, ocr_key.as_deref()).await;
    let events = talk(m, std::env::var("OPENAI_API_KEY").ok(), ai, me.db.clone(), system, recs, a.talk, a.files)
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
    let basis_hash = sha(&base.to_string());
    let (model, ai) = ( model(), ai_session(&db).await.map_err(|_| err(StatusCode::SERVICE_UNAVAILABLE, "대기"))?);
    let mut given = base;
    given["conversation"] = json!(a.talk.iter().map(|(r, t)| json!({ "role": r, "text": t })).collect::<Vec<_>>());
    given["note"] = json!("conversation은 사람과 AI가 나눈 대화다. 그 내용 가운데 기록으로 확인되는 것만 사실로 쓴다");
    let today = q1(&db, "RETURN time::format(fn::today(), '%Y-%m-%d');", json!({})).await?;
    let key = std::env::var("OPENAI_API_KEY").ok();
    let (raw, reads) = ask(&model, key.as_deref(), &ai, &given, today.as_str().unwrap_or_default()).await.map_err(|_| err(StatusCode::SERVICE_UNAVAILABLE, "대기"))?;
    let made = verify(&db, &raw).await.map_err(|w| refuse_with(w))?;
    // 대화로 남긴 보고의 입력은 `chat:정황 입력의 해시:대화의 해시`다. 조사 보고와 나란히 남고 17의 다시 부르기 판단(같은 입력)에 걸리지 않으며, 17은 앞 해시로 근거가 달라졌는지만 본다
    let input = format!("chat:{basis_hash}:{}", sha(&json!(a.talk).to_string()));
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
pub(super) fn events(sse: &str) -> (Vec<J>, bool) {
    let data: Vec<&str> = sse.lines().filter_map(|l| l.strip_prefix("data:")).map(str::trim).collect();
    (data.iter().filter(|d| **d != "[DONE]").filter_map(|d| serde_json::from_str(d).ok()).collect(), data.last() == Some(&"[DONE]"))
}
pub(super) fn said(ev: &[J]) -> String { ev.iter().filter(|e| e["type"] == "text-delta").filter_map(|e| e["delta"].as_str()).collect() }

pub async fn check(c: &Check) -> Result<()> {
    let (support, audit) = ("영업지원", "내부 감시");
    let word = |code: u16, r: &J| -> Result<String> { Ok(if code == 200 { String::new() } else { ensure!(r.get("error").is_some(), "거절의 꼴 {code} {r}"); r["error"].as_str().unwrap_or("").to_string() }) };
    let say = |t: &str| json!({ "role": "user", "id": "u", "parts": [{ "type": "text", "text": t }] });
    let bot = |t: &str| json!({ "role": "assistant", "id": "a", "parts": [{ "type": "text", "text": t }] });
    let counts = async || q1(&c.db, "RETURN [count(SELECT id FROM report), count(SELECT id FROM adoption), count(SELECT id FROM ruling), count(SELECT id FROM act), count(SELECT id FROM task), count(SELECT id FROM decision)];", json!({})).await;
    let http = reqwest::Client::new();
    // 대화 세션(D61): 새로 → 저장 → 목록 맨 위 → 열면 말과 선이 그대로, 다른 역할에는 404 → (맨 끝에서) 다시 적재해도 남는다
    let kept: String;
    {
        // 목록 화면(연 기록 없음)에서 시작하는 대화도 만들어진다(D67) — null도 빠진 것도
        for body in [json!({ "target": null }), json!({})] {
            let (code, s) = c.post(support, "/api/chat/sessions", body.clone()).await?;
            ensure!(code == 200 && s["id"].is_string(), "기록 없는 새 대화 {body} → {code} {s}");
        }
        let (code, s) = c.post(support, "/api/chat/sessions", json!({ "target": { "kind": "심사", "id": "2026-06-D-001" } })).await?;
        let id = s["id"].as_str().unwrap_or_default().to_string();
        ensure!(code == 200 && !id.is_empty(), "새 대화 {code} {s}");
        let path = format!("/api/chat/sessions/{id}");
        let save = json!({ "messages": [say("근거"), bot("답")], "title": "근거", "reads": [{ "kind": "대리점", "id": "D-001" }, { "kind": "대리점", "id": "없는-대리점" }] });
        let (code, _) = c.call(Some(c.token(support)), "PUT", &path, Some(save.clone())).await?;
        ensure!(code == 200, "대화 저장 {code}");
        c.call(Some(c.token(support)), "PUT", &path, Some(save)).await?; // 두 번 저장해도 선은 하나
        let list = c.get(support, "/api/chat/sessions").await?;
        ensure!(list["sessions"][0]["id"] == id.as_str() && list["sessions"][0]["title"] == "근거" && list["sessions"][0]["target"]["id"] == "2026-06-D-001", "대화 목록 {list}");
        let of = c.get(support, "/api/chat/sessions?of=심사/2026-06-D-001").await?;
        ensure!(of["sessions"][0]["id"] == id.as_str(), "기록을 다룬 대화(가장 최근 것이 방금 연 대화 — 앞선 실행의 대화는 다시 적재해도 남는다) {of}");
        let graph = |v: &J| (v["about"].as_array().map(Vec::len), v["reads"].as_array().map(Vec::len));
        let one = c.get(support, &path).await?;
        ensure!(one["messages"].as_array().is_some_and(|m| m.len() == 2) && graph(&one) == (Some(1), Some(1)), "대화 열기(말 둘, 다룸 1 · 읽음 1 — 없는 기록은 잇지 않음) {one}");
        let (code, _) = c.call(Some(c.token(audit)), "GET", &path, None).await?;
        ensure!(code == 404, "다른 역할의 대화 {code}");
        let (code, _) = c.call(Some(c.token(audit)), "PUT", &path, Some(json!({ "messages": [], "title": "x" }))).await?;
        ensure!(code == 404, "다른 역할이 덮어쓰기 {code}");
        kept = id;
    }
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
        let step = ev.iter().find(|e| e["type"] == "data-step").map(|e| e["data"].clone()).unwrap_or_default();
        ensure!(step["tool"] == "조회" && step["state"] == "done" && step["names"] == json!(["금강상사11"]), "도구 호출 한 줄(D67) {step}");
        ensure!(reads["names"] == json!(["금강상사11"]) && reads.get("ids").is_none() && reads["go"] == json!([{ "kind": "대리점", "id": "D-011" }]) && !text.contains("테이블") && !text.contains("D-0"), "조회한 기록 {reads} {text}");
        // 열어 둔 심사의 이름이 조회한 기록으로 나가고, 답은 그 대상의 값(합산 · 승인권자)을 말한다. 정황이면 근거 수
        let rid = "2026-06-D-001";
        let (_, _, body) = stream(audit, json!({ "messages": [say("근거")], "target": { "kind": "심사", "id": rid } })).await?;
        let (ev, _) = events(&body);
        let (text, reads) = (said(&ev), ev.iter().find(|e| e["type"] == "data-reads").map(|e| e["data"].clone()).unwrap_or_default());
        let rn = q1(&c.db, &format!("RETURN type::record('review', '{rid}').name;"), json!({})).await?;
        ensure!(reads["names"].as_array().is_some_and(|n| n.iter().any(|x| x.as_str().is_some_and(|x| x.starts_with(rn.as_str().unwrap_or("?"))))) && reads["go"][0]["kind"] == "심사" && text.contains("합산") && text.contains("승인권자"), "열어 둔 심사 {rid} {reads} {text}");
        let (_, _, body) = stream(audit, json!({ "messages": [say("근거")], "target": { "kind": "정황", "id": "계좌-D-024" } })).await?;
        let (ev, _) = events(&body);
        ensure!(said(&ev).contains("근거 ") && ev.iter().any(|e| e["type"] == "data-reads" && e["data"]["names"] == json!(["계좌 · 성일상사24"])), "열어 둔 정황 {body}");

        // 화면 부품(A2UI v0.8): 목록 안의 부품만, 허락한 칸만 남고(action 같은 칸은 버린다), 기록 목록은 이 답에서 읽은 기록만 — 이름과 여는 길은 서버가 붙인다. 답을 마친 시각은 말의 메타데이터
        let ui = |parts: &str| format!(r#"표시|[{{"surfaceUpdate":{{"surfaceId":"s1","components":[{{"id":"root","component":{{"Column":{{"children":{{"explicitList":["f","r"]}}}}}}}},{parts}]}}}},{{"beginRendering":{{"surfaceId":"s1","root":"root"}}}}]"#);
        let facts = r#"{"id":"f","component":{"Facts":{"title":"합산","items":[{"label":"합산","value":3888097}],"action":{"name":"승인"}}}}"#;
        let (_, _, body) = stream(audit, json!({ "messages": [say(&ui(&format!(r#"{facts},{{"id":"r","component":{{"Records":{{"items":[{{"record":"dealer:`D-011`"}}]}}}}}}"#)))], "target": { "kind": "대리점", "id": "D-011" } })).await?;
        let (ev, _) = events(&body);
        let a = ev.iter().find(|e| e["type"] == "data-a2ui").map(|e| e["data"]["messages"].clone()).unwrap_or_default();
        let parts = &a[0]["surfaceUpdate"]["components"];
        let item = &parts[2]["component"]["Records"]["items"][0];
        ensure!(a[1]["beginRendering"]["root"] == "root" && parts.as_array().is_some_and(|p| p.len() == 3) && parts[1]["component"]["Facts"].get("action").is_none() && parts.as_array().is_some_and(|p| p.iter().all(|c| c["component"].as_object().is_some_and(|o| o.len() == 1))) && parts[1]["component"]["Facts"]["items"][0]["value"] == "3888097"
            && item["name"] == "금강상사11" && item["go"] == json!({ "kind": "대리점", "id": "D-011" }), "A2UI 표면 {body}");
        ensure!(ev.last().is_some_and(|e| e["type"] == "finish" && e["messageMetadata"]["at"].as_str().is_some_and(|t| t.len() >= 19) && e["messageMetadata"]["fail"].is_null()), "답을 마친 시각 {body}");
        for bad in [r#"{"id":"f","component":{"Button":{"label":"승인","action":{"name":"승인"}}}},{"id":"r","component":{"Text":{"text":{"literalString":"x"}}}}"#.to_string(), format!(r#"{facts},{{"id":"r","component":{{"Records":{{"items":[{{"record":"dealer:`D-024`"}}]}}}}}}"#)] {
            let (_, _, body) = stream(audit, json!({ "messages": [say(&ui(&bad))], "target": { "kind": "대리점", "id": "D-011" } })).await?;
            let (ev, _) = events(&body);
            ensure!(!ev.iter().any(|e| e["type"] == "data-a2ui") && said(&ev).starts_with("그리지 않는다: "), "목록 밖 부품 · 읽지 않은 기록 {body}");
        }

        // 문맥은 끌 수 있고, 붙인 기록이 따라온다. 판정을 묻는 말에는 사실과 규정을 답하고 판정 의견을 내지 않는다
        let (_, _, body) = stream(support, json!({ "messages": [say("이 지급을 승인해도 되나?")], "target": null, "attach": [{ "kind": "정황", "id": "계좌-D-024" }, { "kind": "지급", "id": "RB-00001" }] })).await?;
        let text = said(&events(&body).0);
        ensure!(text.contains("정황 계좌 · 성일상사24") && text.contains("지급 대성상사1 · ") && !text.contains("테이블") && !text.contains("D-024"), "끈 문맥과 붙임 {text}");
        ensure!(text.starts_with("조회한 기록: ") && !["판정 의견", "결정은 사람", "승인하세요", "승인해도 된다", "승인해도 됩니다", "반려하세요", "기각하세요"].iter().any(|w| text.contains(w)), "판정 의견 {text}");
        let (_, _, body) = stream(support, json!({ "messages": [say("안녕"), bot("안녕하세요"), say("대리점 두 곳")] })).await?;
        ensure!(said(&events(&body).0).starts_with("열어 둔 기록도 붙인 기록도 없어"), "여러 말");

        // 대화는 남지 않는다: 보고·결정·경위·작업 어디에도 기록이 늘지 않았다
        ensure!(counts().await? == before, "대화가 기록을 남겼다 {before} {}", counts().await?);

        // AI가 멈춰 있으면 오류 낱말이 흐르고 끝나며, 오래 열려 있는 응답이 다른 요청을 막지 않는다
        set("fixture-down");
        let (code, _, body) = stream(audit, json!({ "messages": [say("안녕")] })).await?;
        let (ev, done) = events(&body);
        ensure!(code == 200 && done && ev.iter().any(|e| e["type"] == "error" && e["errorText"] == "대기") && ev.last().is_some_and(|e| e["type"] == "finish"), "AI 멈춤 {body}");
        ensure!(c.get(support, "/api/dealers").await?.as_array().is_some_and(|d| !d.is_empty()), "멈춘 동안의 화면");
        set("fixture-slow");
        let slow = { let (h, u, t) = (http.clone(), format!("{}/api/chat", c.base()), c.token(audit).to_string()); tokio::spawn(async move { h.post(u).bearer_auth(t).json(&json!({ "messages": [say("느리게")], "target": { "kind": "대리점", "id": "D-011" } })).send().await?.text().await }) };
        tokio::time::sleep(Duration::from_millis(300)).await;
        let t0 = std::time::Instant::now();
        let (state, listing) = (c.get(audit, "/api/state").await?, c.get(support, "/api/dealers").await?);
        ensure!(!slow.is_finished() && t0.elapsed() < Duration::from_millis(1500) && state["role"] == audit && listing.is_array(), "열려 있는 응답이 다른 요청을 막았다 {:?}", t0.elapsed());
        ensure!(said(&events(&slow.await??).0).contains("조회한 기록"), "느린 답");

        // 키 없이 실제 모델 이름이면 부르지 않고 오류 낱말(키는 인자다. OpenAI를 부르지 않는다)
        let ai = ai_session(&c.db).await?;
        let (ev, _) = (talk("gpt-검사".into(), None, ai.clone(), ai.clone(), SYSTEM.into(), vec![], vec![("user".into(), "안녕".into())], vec![]).collect::<Vec<_>>().await, ());
        ensure!(ev.iter().any(|e| e["type"] == "error" && e["errorText"] == "대기") && said(&ev).is_empty(), "키 없음 {ev:?}");

        set("fixture");
        // 대화가 길어져도(말 25개) 마지막 20개만 쓰고 거절하지 않는다
        let long: Vec<J> = (0..25).map(|i| if i % 2 == 0 { say("묻는다") } else { bot("답한다") }).collect();
        ensure!(stream(audit, json!({ "messages": long })).await?.0 == 200, "긴 대화");
        ensure!(c.post(support, "/api/chat/report", json!({ "messages": long.iter().take(24).collect::<Vec<_>>(), "target": { "kind": "정황", "id": "계좌-D-024" } })).await?.0 == 200, "긴 대화의 보고");
        // 추인(묶음)도 문맥이 된다: 이름은 `이름 · 귀속월`, 이름이 없는 기록은 거절하지 않는다
        q1(&c.db, "CREATE ratify:t24 SET ym = '2026-01', name = '금강상사11 외 2', members = [], reviews = [], total = 0, limit = 0, approver = '영업임원', source = '시연';", json!({})).await?;
        let (code, _, body) = stream(audit, json!({ "messages": [say("안녕")], "target": { "kind": "추인", "id": "t24" } })).await?;
        ensure!(code == 200 && said(&events(&body).0).contains("추인 금강상사11 외 2 · 2026-01"), "추인 문맥 {body}");
        // 문맥 칩의 이름: 화면의 제목 줄과 같은 이름
        let it = urlenc(&json!([{ "kind": "정황", "id": "계좌-D-024" }, { "kind": "대리점", "id": "D-011" }, { "kind": "심사", "id": "2026-06-D-001" }, { "kind": "모름", "id": "x" }, { "kind": "정황", "id": "없음" }]).to_string());
        let n = c.get(audit, &format!("/api/chat/names?items={it}")).await?;
        ensure!(n["names"][0] == "계좌 · 성일상사24" && n["names"][1] == "금강상사11" && n["names"][2].is_string() && n["names"][3].is_null() && n["names"][4].is_null(), "이름 {n}");

        // 보고로 남기기: 대상이 정황이 아니거나 AI의 답이 없는 대화는 400 `대상`
        set("fixture");
        let bank = "계좌-D-024";
        let keep = async |role: &str, body: J| { let (code, r) = c.post(role, "/api/chat/report", body).await?; Ok::<_, anyhow::Error>((code, r)) };
        let talked = json!([say("이 정황을 알려 줘"), bot("계좌가 같다")]);
        let before_keep = counts().await?;
        for body in [json!({ "messages": talked }), json!({ "messages": talked, "target": { "kind": "대리점", "id": "D-011" } }), json!({ "messages": [say("a")], "target": { "kind": "정황", "id": bank } }), json!({ "messages": talked, "target": { "kind": "정황", "id": "없음" } })] {
            let (code, r) = keep(support, body.clone()).await?;
            ensure!(word(code, &r)? == "대상", "보고의 대상 {body} → {code} {r}");
        }
        ensure!(counts().await? == before_keep, "거절한 보고가 남았다");
        // 검증을 통과하면 보고(검토)로 저장되고 17의 보고 칸에 올라온다. 근거 기록을 가리킨 사실이 있고 내부 감시가 채택할 수 있다
        let (code, r) = keep(support, json!({ "messages": talked, "target": { "kind": "정황", "id": bank } })).await?;
        let nrep = || q1(&c.db, "RETURN count(SELECT id FROM report WHERE target = signal:`계좌-D-024`);", json!({}));
        ensure!(code == 200 && r["state"] == "검토" && r["id"].is_string(), "보고 {code} {r}");
        let d = c.get(audit, &format!("/api/signals/{bank}/report")).await?;
        ensure!(d["report"]["id"] == r["id"] && d["report"]["state"] == "검토" && d["report"]["model"] == "fixture" && d["report"]["stale"] == false && d["report"]["facts"].as_array().is_some_and(|f| !f.is_empty())
            && d["actions"].as_array().is_some_and(|a| a.len() == 2), "저장된 보고 {d}");
        // 조사 보고와 나란히 남는다: 조사는 따로 한 번 돌고, 그 뒤 조사를 눌러도 AI를 다시 부르지 않으며 보고는 근거가 달라진 것으로 보이지 않는다
        let n0 = nrep().await?;
        let (code, r) = c.post(audit, "/api/investigate", json!({ "id": bank })).await?;
        ensure!(code == 200 && r["state"] == "검토" && nrep().await? == json!(n0.as_i64().unwrap_or(0) + 1), "조사 보고 {code} {r} {n0}");
        ensure!(c.post(audit, "/api/investigate", json!({ "id": bank })).await?.1["state"] == "검토" && nrep().await? == json!(n0.as_i64().unwrap_or(0) + 1), "조사 반복");
        // 붙인 정황으로도 남길 수 있다. 검증을 어기면(없는 기록 · 문장 틀의 숫자) 400과 낱말이고 아무것도 저장하지 않는다
        let n = q1(&c.db, "RETURN count(SELECT id FROM report);", json!({})).await?;
        let last = c.get(audit, &format!("/api/signals/{bank}/report")).await?["report"]["id"].clone();
        for (m, w) in [("fixture-gap", "기록"), ("fixture-digit", "값")] {
            set(m);
            let (code, r) = keep(audit, json!({ "messages": talked, "target": { "kind": "대리점", "id": "D-011" }, "attach": [{ "kind": "정황", "id": bank }] })).await?;
            ensure!(code == 400 && r == json!({ "error": "오류" }), "{m} {w} → {code} {r}");
        }
        set("fixture-down");
        let (code, r) = keep(audit, json!({ "messages": talked, "target": { "kind": "정황", "id": bank } })).await?;
        ensure!(code == 503 && r == json!({ "error": "대기" }), "AI 멈춤의 보고 {code} {r}");
        ensure!(q1(&c.db, "RETURN count(SELECT id FROM report);", json!({})).await? == n && c.get(audit, &format!("/api/signals/{bank}/report")).await?["report"]["id"] == last, "실패한 보고가 남았다");
        Ok(())
    }.await;
    *USE.lock().unwrap() = was;
    res?;
    // 다시 적재해도(시연 초기화 · 스키마가 바뀐 재배포) 대화와 그 선이 남는다 — 토큰이 바뀌므로 맨 끝에서 root로 본다(검사 틀이 뒤에서 다시 초기화한다)
    crate::boot(&c.db, true).await?;
    let left = q1(&c.db, "SELECT array::len(messages) AS n, count(->about) AS about, count(->reads) AS reads FROM type::record('session', $id);", json!({ "id": kept })).await?;
    ensure!(left[0]["n"] == 2 && left[0]["about"] == 1 && left[0]["reads"] == 1, "다시 적재 뒤 대화와 선 {left}");
    Ok(())
}
fn urlenc(s: &str) -> String { s.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_a2ui() {
        use super::super::t25_card::surface;
        let seen: BTreeSet<String> = ["review:⟨2026-06-D-001⟩".to_string()].into();
        let one = |c: &str| format!(r#"[{{"surfaceUpdate":{{"components":[{c}]}}}},{{"beginRendering":{{"root":"root"}}}}]"#);
        let ok = surface(&one(r#"{"id":"root","component":{"Records":{"items":[{"record":"review:`2026-06-D-001`"}]}}}"#), &seen);
        assert!(ok.is_ok_and(|(s, refs)| refs == ["review:`2026-06-D-001`"] && s[1]["beginRendering"]["catalogId"] == "sanhab"));
        assert!(surface(&one(r#"{"id":"root","component":{"Image":{"url":"x"}}}"#), &seen).is_err());
        assert!(surface(&one(r#"{"id":"root","component":{"Column":{"children":{"explicitList":["root"]}}}}"#), &seen).is_err());
        assert!(surface(&one(r#"{"id":"root","component":{"Table":{"columns":["a","b"],"rows":[["1"]]}}}"#), &seen).is_err());
        assert!(surface(&one(r#"{"id":"root","component":{"Records":{"items":[{"record":"dealer:`D-001`"}]}}}"#), &seen).is_err());
        assert!(surface("[]", &seen).is_err() && surface("x", &seen).is_err());
    }

    #[test]
    fn a2ui_dates_and_blanks() {
        use super::super::t25_card::{dates, surface};
        assert_eq!(dates("변경일 2026-06-01T00:00:00Z, 인지일 2026-07-16T00:00:00.000Z"), "변경일 2026-06-01, 인지일 2026-07-16");
        assert_eq!(dates("2026-12-31T15:05:00Z"), "2027-01-01 00:05");
        assert_eq!(dates("2026-06"), "2026-06");
        let one = r#"[{"surfaceUpdate":{"components":[{"id":"root","component":{"Table":{"columns":["이름","날짜"],"rows":[["가","2026-06-01T00:00:00Z"],["나",""]]}}}]}},{"beginRendering":{"root":"root"}}]"#;
        let (s, _) = surface(one, &BTreeSet::new()).unwrap();
        assert_eq!(s[0]["surfaceUpdate"]["components"][0]["component"]["Table"]["rows"], json!([["가", "2026-06-01"], ["나", "없음"]]));
    }

    #[test]
    fn rules_are_in_the_prompt() {
        assert!(SYSTEM.contains("판정 의견을 내지 않는다") && SYSTEM.contains("read_db") && SYSTEM.contains("쓰기는 되지 않는다"));
        // 서류: 판독 · 정리를 읽고(원본 data는 읽지 않는다) 출처를 밝힌다. 판정 의견은 내지 않는다
        assert!(SYSTEM.contains("doc(") && SYSTEM.contains("read.text") && SYSTEM.contains("data(원본)는 크니 읽지 않는다") && SYSTEM.contains("인정 · 불인정 같은 판정 의견은 내지 않는다") && !SYSTEM.contains("네가 읽지 않는다"));
    }

    #[test]
    fn cites_records() {
        let mut s = BTreeSet::new();
        cited(r#"[[{"id":"dealer:`D-001`"},{"id":"payout:abc12","x":"http://a"},{"to":"xdealer:zz"},{"id":"review:⟨가-1⟩"}]]"#, &mut s);
        assert_eq!(s.into_iter().collect::<Vec<_>>(), ["dealer:`D-001`", "payout:abc12", "review:⟨가-1⟩"]);
    }

    #[test]
    fn stamps_the_screen() {
        let b = json!({ "messages": [{ "role": "user", "metadata": { "ctx": [{ "kind": "심사", "id": "x", "name": "금강상사11 외 2 · 2026-06" }] }, "parts": [{ "type": "text", "text": "왜 영업임원이야?" }] }] });
        let Ok(a) = parse(&b, true) else { panic!("본문") };
        assert_eq!(a.talk[0].1, "[이 말을 할 때 보던 화면: 심사 금강상사11 외 2 · 2026-06] 왜 영업임원이야?");
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
