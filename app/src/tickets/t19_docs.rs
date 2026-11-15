//! 19 서류: 영업지원이 발송한 소명에 대리점의 서류를 올리면(접수) 소명이 접수가 되고 내부 감시의 소명 작업이 생긴다(D26, D27, 선 18).
//! 판독은 업스테이지 OCR(글자와 위치), 정리는 AI(항목마다 판독 낱말을 가리키고 값을 다듬는다), 비교는 코드(정리된 값을 등록 값과 맞춰 일치 / 불일치 / 누락)다.
//! 판독·정리는 앱이 도는 동안 17의 일꾼이 몇 초마다 `sweep`으로 채운다. 멈춰 있어도 원본은 보이고 값은 비어 있으며 소명의 다른 일은 그대로 된다.
//! 원본은 DB의 `doc.data`에 둔다(DB의 볼륨은 다시 배포해도 남는다. 앱 컨테이너는 비루트 distroless라 볼륨에 쓰지 못한다).
//! 자동 검사는 업스테이지도 OpenAI도 부르지 않는다: 모델 이름이 `fixture`로 시작하면 고정 응답을 쓰고(판독은 `READ`, 정리는 17의 `USE`), 키는 인자로 받는다.
use super::t17_report::{USE, model};
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{ApiError, Me, R, attempt, err};
use aisdk::core::LanguageModelRequest;
use aisdk::providers::openai::OpenAI;
use anyhow::{Result, ensure};
use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{DefaultBodyLimit, Path, Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Extension, Json, Router};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use serde_json::{Value as J, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

pub const SCHEMA: &str = include_str!("../../db/19-서류.surql");

/// 서류 한 장의 최대 크기(2MB). DB의 `doc.size`와 같다. DB에 base64로 넣으므로 DB의 요청 크기 안에 들게 했다
pub const MAX: usize = 2 * 1024 * 1024;
/// 받는 파일의 종류(이미지·PDF)
pub const KINDS: [&str; 3] = ["image/png", "image/jpeg", "application/pdf"];
/// 정리할 항목(임대차계약서 — 주소 일치의 서류, D17). 순서가 값 표의 기본 순서다
pub const ITEMS: [&str; 4] = ["임차인", "주소", "호실", "기간"];
/// 상대 대리점의 호실(시연). 원본의 주소는 도로명·건물번호까지만 있어(D10) 호실을 견줄 등록 값이 없다. 시연에서 견줄 값으로만 쓰고 출처는 시연이다
pub const ROOMS: [(&str, &str); 2] = [("D-011", "101호"), ("D-041", "205호")];
/// 시연용 서류 네 장(D27): 이름, 누구의 서류인지(임차인 — 원본의 대리점 이름), 그림, 판독의 고정 응답(그 그림을 업스테이지 OCR에 한 번 보낸 응답). 그림은 `app/db/19-서류/make.py`가 그린다
pub const SAMPLES: [(&str, &str, &[u8], &str); 4] = [
    ("임대차계약서-1.png", "성일상사24", include_bytes!("../../db/19-서류/1.png"), include_str!("../../db/19-서류/1.json")),
    ("임대차계약서-2.png", "성일상사24", include_bytes!("../../db/19-서류/2.png"), include_str!("../../db/19-서류/2.json")),
    ("임대차계약서-3.png", "한라인상사34", include_bytes!("../../db/19-서류/3.png"), include_str!("../../db/19-서류/3.json")),
    // 보완된 서류(시나리오 5의 7): 호실이 금강상사41(205호)과 다르다
    ("임대차계약서-4.png", "한라인상사34", include_bytes!("../../db/19-서류/4.png"), include_str!("../../db/19-서류/4.json")),
];
/// 판독·정리를 다시 시도하는 간격(초)
const RETRY: u64 = 60;
/// 판독 모델의 기본값(업스테이지의 별칭)
const OCR: &str = "ocr";
/// 판독·정리를 부른 수(자동 검사가 "다시 부르지 않는다"를 셀 때 쓴다)
static CALLS: AtomicUsize = AtomicUsize::new(0);
/// 자동 검사가 판독 모델을 갈아 끼우는 자리(`fixture` 고정 응답, `fixture-down` 응답 없음)
pub(super) static READ: Mutex<Option<String>> = Mutex::new(None);

pub(super) fn read_model() -> String {
    READ.lock().unwrap().clone().or_else(|| std::env::var("UPSTAGE_MODEL").ok().filter(|m| !m.is_empty())).unwrap_or_else(|| OCR.into())
}
pub(super) fn sha(b: &[u8]) -> String {
    Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect()
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new()
        .route("/clarifies/{id}/docs", get(list).post(upload).layer(DefaultBodyLimit::max(MAX + 4096)))
        .route("/docs/{id}/file", get(file))
        .route("/dealers/{id}/clarifies", get(of_dealer))
        .route("/samples", get(samples))
        .route("/samples/{n}", get(sample))
}

// ---- 판독(업스테이지 OCR) ----

/// 업스테이지 OCR의 응답에서 첫 쪽의 낱말과 위치(쪽의 폭·높이에 대한 0~1)를 꺼낸다. 꼴이 다르면 None
fn words(raw: &J) -> Option<Vec<J>> {
    let p = raw["pages"].get(0)?;
    let (w, h) = (p["width"].as_f64().filter(|w| *w > 0.0)?, p["height"].as_f64().filter(|h| *h > 0.0)?);
    p["words"].as_array()?.iter().map(|x| {
        let v = x["boundingBox"]["vertices"].as_array()?;
        let xs: Vec<f64> = v.iter().filter_map(|p| p["x"].as_f64()).collect();
        let ys: Vec<f64> = v.iter().filter_map(|p| p["y"].as_f64()).collect();
        let r = |n: f64, d: f64| ((n / d).clamp(0.0, 1.0) * 10000.0).round() / 10000.0;
        Some(json!({ "text": x["text"].as_str()?, "box": [
            r(xs.iter().cloned().fold(f64::MAX, f64::min), w), r(ys.iter().cloned().fold(f64::MAX, f64::min), h),
            r(xs.iter().cloned().fold(0.0, f64::max), w), r(ys.iter().cloned().fold(0.0, f64::max), h)] }))
    }).collect()
}

/// 판독. `fixture`는 시연 서류의 고정 응답(그 밖의 파일은 응답 없음), `fixture-down`은 응답 없음. 키가 없거나 응답이 없으면 None.
/// 업스테이지: `POST https://api.upstage.ai/v1/document-digitization`, multipart의 `document`(파일)와 `model`
pub(super) async fn ocr(model: &str, key: Option<&str>, bytes: &[u8], mime: &str) -> Option<Vec<J>> {
    if let Some(m) = model.strip_prefix("fixture") {
        let fx = SAMPLES.iter().find(|s| m.is_empty() && sha(s.2) == sha(bytes))?.3;
        return words(&serde_json::from_str(fx).ok()?);
    }
    let key = key.filter(|k| !k.is_empty())?;
    // ponytail: multipart를 손으로 짠다(reqwest의 multipart 기능을 더하지 않으려고). 파일 이름은 ASCII만 보낸다
    let b = format!("w07{}", sha(bytes));
    let ext = match mime { "image/png" => "png", "image/jpeg" => "jpg", _ => "pdf" };
    let mut body = format!("--{b}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model}\r\n--{b}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"doc.{ext}\"\r\nContent-Type: {mime}\r\n\r\n").into_bytes();
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{b}--\r\n").as_bytes());
    let res = reqwest::Client::new().post("https://api.upstage.ai/v1/document-digitization").bearer_auth(key)
        .header("content-type", format!("multipart/form-data; boundary={b}")).body(body).timeout(Duration::from_secs(120)).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    words(&res.json().await.ok()?)
}

// ---- 정리(AI) ----

const SYSTEM: &str = "너는 판매장려금 심사에서 내부 감시를 돕는 AI다. 대리점이 낸 임대차계약서를 글자 인식 도구가 읽은 낱말 목록(번호: 글자)이 주어진다.
항목마다 그 값에 해당하는 낱말의 번호를 가리키고, 값을 견줄 수 있게 다듬는다.
- 항목: 임차인(상호 그대로), 주소(시 도로명 건물번호까지. 층·호는 빼고 예: 성남시 상공로 128), 호실(호 번호에 '호'. 층은 빼고 예: 302호), 기간(YYYY-MM-DD~YYYY-MM-DD).
- 값은 가리킨 낱말에 있는 글자와 숫자로만 만든다. 없는 숫자를 지어내지 않는다.
- 서류에서 찾지 못한 항목은 words를 빈 배열, value를 null로 둔다.
- JSON 하나로만 답한다(다른 글, 코드 울타리 없이): {\"items\": [{\"item\": \"호실\", \"words\": [13, 14], \"value\": \"302호\"}, …]}";

/// 자동 검사용으로 고정한 정리: 항목의 이름표 낱말(임차인·소재지·호실·기간)을 찾아 같은 줄의 뒤 낱말을 가리킨다. `fixture-digit`은 호실에 판독에 없는 숫자를 쓴다
fn canned(model: &str, ws: &[J]) -> Option<String> {
    let label = |item: &'static str| -> &'static str { if item == "주소" { "소재지" } else { item } };
    let mid = |w: &J| (w["box"][1].as_f64().unwrap_or(0.0) + w["box"][3].as_f64().unwrap_or(0.0)) / 2.0;
    let items: Vec<J> = ITEMS.iter().map(|item| {
        let Some(at) = ws.iter().position(|w| w["text"] == label(item)) else { return json!({ "item": item, "words": [], "value": null }) };
        let line: Vec<usize> = (at + 1..ws.len()).filter(|i| (mid(&ws[*i]) - mid(&ws[at])).abs() < 0.01).collect();
        let text: Vec<&str> = line.iter().filter_map(|i| ws[*i]["text"].as_str()).collect();
        let value = match *item {
            "호실" => text.last().map(|t| t.trim_start_matches('제').to_string()),
            "기간" => Some(text.concat().replace('.', "-")),
            _ => Some(text.join(" ")),
        };
        json!({ "item": item, "words": line, "value": value })
    }).collect();
    let mut items = items;
    match model {
        "fixture" => {}
        "fixture-digit" => items[2]["value"] = json!("301호"),
        _ => return None,
    }
    Some(json!({ "items": items }).to_string())
}

/// AI의 정리(글). 키가 없거나 응답이 없으면 None
async fn ask(model: &str, key: Option<&str>, ws: &[J]) -> Option<String> {
    if model.starts_with("fixture") {
        return canned(model, ws);
    }
    key.filter(|k| !k.is_empty())?;
    let list = ws.iter().enumerate().map(|(i, w)| format!("{i}: {}", w["text"].as_str().unwrap_or_default())).collect::<Vec<_>>().join("\n");
    let mut req = LanguageModelRequest::builder()
        .model(OpenAI::<aisdk::core::DynamicModel>::model_name(model))
        .system(SYSTEM)
        .prompt(format!("낱말 목록:\n{list}"))
        .build();
    tokio::time::timeout(Duration::from_secs(120), req.generate_text()).await.ok()?.ok()?.text()
}

/// 정리의 꼴: 항목마다 가리킨 낱말이 판독에 있고, 값이 있으면 낱말을 가리켰고, 값의 숫자 덩어리는 모두 가리킨 낱말에 있다(AI가 숫자를 지어내지 못한다).
/// 빠진 항목은 찾지 못한 것(누락)으로 둔다. 하나라도 어기면 None(그 정리는 버린다)
fn checked(raw: &str, ws: &[J]) -> Option<Vec<J>> {
    let t = raw.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```");
    let v: J = serde_json::from_str(t.trim()).ok()?;
    let got = v["items"].as_array()?;
    ITEMS.iter().map(|item| {
        let Some(e) = got.iter().find(|e| e["item"] == *item) else { return Some(json!({ "item": item, "words": [] })) };
        let idx: Vec<usize> = e["words"].as_array()?.iter().map(|i| i.as_u64().map(|i| i as usize).filter(|i| *i < ws.len())).collect::<Option<_>>()?;
        let value = match &e["value"] {
            J::Null => None,
            J::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
            _ => return None,
        };
        if let Some(val) = &value {
            let read: String = idx.iter().filter_map(|i| ws[*i]["text"].as_str()).collect::<Vec<_>>().join(" ");
            if idx.is_empty() || !digits(val).iter().all(|d| read.contains(d.as_str())) {
                return None;
            }
        }
        // 찾지 못한 항목은 value를 두지 않는다(DB의 NONE. JSON의 null은 DB에서 NONE이 아니다)
        Some(match value { Some(v) => json!({ "item": item, "words": idx, "value": v }), None => json!({ "item": item, "words": [] }) })
    }).collect()
}
fn digits(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_ascii_digit()).filter(|d| !d.is_empty()).map(String::from).collect()
}

// ---- 판독·정리를 채운다 ----

/// 서류 한 장의 판독·정리. 시도한 때를 먼저 남긴다(간격 동안 다시 부르지 않는다). 판독이 없으면 판독만, 있으면 정리를 한다
pub async fn fill(db: &Db, id: &str, ocr_key: Option<&str>, ai_key: Option<&str>) -> Result<()> {
    let d = q1(db, "RETURN (SELECT data, mime, read FROM type::record('doc', $id))[0];", json!({ "id": id })).await?;
    if d.is_null() {
        return Ok(());
    }
    CALLS.fetch_add(1, Ordering::Relaxed);
    if d["read"].is_null() {
        q(db, "UPDATE type::record('doc', $id) SET read_tried = time::now();", json!({ "id": id })).await?;
        let bytes = B64.decode(d["data"].as_str().unwrap_or_default())?;
        let m = read_model();
        if let Some(ws) = ocr(&m, ocr_key, &bytes, d["mime"].as_str().unwrap_or_default()).await {
            q(db, "UPDATE type::record('doc', $id) SET read = $ws, read_model = $m;", json!({ "id": id, "ws": ws, "m": m })).await?;
        }
        return Ok(());
    }
    q(db, "UPDATE type::record('doc', $id) SET tidy_tried = time::now();", json!({ "id": id })).await?;
    let ws = d["read"].as_array().cloned().unwrap_or_default();
    let m = model();
    if let Some(items) = ask(&m, ai_key, &ws).await.and_then(|raw| checked(&raw, &ws)) {
        q(db, "UPDATE type::record('doc', $id) SET tidy = $items, tidy_model = $m;", json!({ "id": id, "items": items, "m": m })).await?;
    }
    Ok(())
}

/// 판독이나 정리가 빈 서류를 채운다(앱이 도는 동안 17의 일꾼이 몇 초마다 부른다). 멈춰 있으면 `RETRY` 간격으로만 다시 시도한다
pub async fn sweep(db: &Db) -> Result<()> {
    sweep_with(db, std::env::var("UPSTAGE_API_KEY").ok().as_deref(), std::env::var("OPENAI_API_KEY").ok().as_deref()).await
}
/// `sweep`의 키를 인자로 뗀 것(자동 검사는 환경과 상관없이 키 없음을 탄다)
pub(super) async fn sweep_with(db: &Db, ocr_key: Option<&str>, ai_key: Option<&str>) -> Result<()> {
    let ids = q1(db, &format!("
        RETURN (SELECT VALUE record::id(id) FROM doc WHERE
            (read = NONE AND (read_tried = NONE OR (time::now() - read_tried) > {RETRY}s)) OR
            (read != NONE AND tidy = NONE AND (tidy_tried = NONE OR (time::now() - tidy_tried) > {RETRY}s)) ORDER BY stamp);"), json!({})).await?;
    for id in ids.as_array().into_iter().flatten().filter_map(|i| i.as_str()) {
        fill(db, id, ocr_key, ai_key).await.ok();
    }
    Ok(())
}

// ---- 비교(코드) ----

/// 견줄 때는 띄어쓰기를 보지 않는다
fn same(a: &str, b: &str) -> bool {
    a.split_whitespace().collect::<String>() == b.split_whitespace().collect::<String>()
}
/// 값 표의 줄: 항목, 판독(가리킨 낱말 그대로), 가리킨 낱말, 등록 값과 그 출처, 비교. 정리가 찾지 못한 항목은 누락, 등록 값이 없는 항목은 비교가 없다.
/// 누락·불일치인 줄이 위, 그다음 일치, 비교가 없는 줄(항목의 순서는 그대로)
fn rows(ws: &[J], tidy: &[J], reg: &HashMap<&str, J>) -> Vec<J> {
    let mut out: Vec<J> = tidy.iter().map(|t| {
        let item = t["item"].as_str().unwrap_or_default();
        let idx: Vec<usize> = t["words"].as_array().into_iter().flatten().filter_map(|i| i.as_u64().map(|i| i as usize)).collect();
        let read = (!idx.is_empty()).then(|| idx.iter().filter_map(|i| ws.get(*i)?["text"].as_str()).collect::<Vec<_>>().join(" "));
        let r = reg.get(item).cloned().unwrap_or(J::Null);
        let result = match (t["value"].as_str(), r["value"].as_str()) {
            (None, _) => Some("누락"),
            (_, None) => None,
            (Some(v), Some(g)) => Some(if same(v, g) { "일치" } else { "불일치" }),
        };
        json!({ "item": item, "read": read, "words": idx, "reg": r, "result": result })
    }).collect();
    out.sort_by_key(|r| match r["result"].as_str() { Some("누락" | "불일치") => 0, Some(_) => 1, None => 2 });
    out
}

/// 소명의 서류 화면: 지금 역할이 올릴 수 있는지(`can`), 받는 종류와 크기, 서류마다 판독 낱말·정리·값 표·누락과 불일치의 수.
/// 등록 값: 임차인은 소명한 대리점의 이름, 주소는 상대 대리점(정황의 두 번째 대리점)의 지금 주소(원본의 선), 호실은 상대 대리점의 호실(시연, `ROOMS`). 기간은 등록 값이 없다
pub(super) async fn list(State(db): State<std::sync::Arc<Db>>, Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let c = q1(&db, "
        LET $c = type::record('clarify', $id);
        LET $o = fn::pair($c)[1];
        LET $a = (SELECT out.value AS value, source, file.path AS file, row FROM addr WHERE in = $o AND excluded = false AND since <= fn::today() AND (until = NONE OR until > fn::today()) ORDER BY since DESC LIMIT 1)[0];
        RETURN IF $c.id = NONE THEN NONE ELSE {
            dealer: { value: $c.dealer.name, source: $c.dealer.source, file: $c.dealer.file.path, row: $c.dealer.row },
            other: IF $o THEN record::id($o) END,
            addr: $a,
            docs: (SELECT record::id(id) AS id, name, mime, size, role, time::format(at, '%Y-%m-%d') AS at, source, sha, read, read_model, tidy, tidy_model, stamp FROM doc WHERE clarify = $c ORDER BY stamp),
        } END;", json!({ "id": id })).await?;
    if c.is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    let can = q1(&me.db, "RETURN fn::uploadable(type::record('clarify', $id));", json!({ "id": id })).await?;
    let room = c["other"].as_str().and_then(|o| ROOMS.iter().find(|r| r.0 == o)).map(|r| json!({ "value": r.1, "source": "시연" }));
    let reg: HashMap<&str, J> = [("임차인", Some(c["dealer"].clone())), ("주소", (!c["addr"].is_null()).then(|| c["addr"].clone())), ("호실", room)]
        .into_iter().filter_map(|(k, v)| Some((k, v?))).collect();
    let docs: Vec<J> = c["docs"].as_array().into_iter().flatten().map(|d| {
        let ws = d["read"].as_array().cloned().unwrap_or_default();
        let rs = d["tidy"].as_array().map(|t| rows(&ws, t, &reg)).unwrap_or_default();
        let n = |w: &str| rs.iter().filter(|r| r["result"] == w).count();
        // sample: 시연용으로 만든 서류(SAMPLES)와 내용이 같은가 — 어느 길로 올렸든 합성 서류다(A05 §6)
        json!({ "id": d["id"], "name": d["name"], "mime": d["mime"], "size": d["size"], "role": d["role"], "at": d["at"], "source": d["source"], "sample": SAMPLES.iter().any(|x| d["sha"].as_str() == Some(sha(x.2).as_str())),
            "words": d["read"], "read_model": d["read_model"], "tidy": d["tidy"], "tidy_model": d["tidy_model"], "rows": rs,
            "counts": { "누락": n("누락"), "불일치": n("불일치") } })
    }).collect();
    Ok(Json(json!({ "can": can, "kinds": KINDS, "max": MAX, "docs": docs })))
}

/// 그 대리점의 소명(선 16). 발송한 뒤 영업지원이 서류를 올리러 소명을 여는 길(대리점 상세)
async fn of_dealer(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    Ok(Json(q1(&me.db, "RETURN (SELECT record::id(id) AS id, name, state, born FROM clarify WHERE dealer = type::record('dealer', $id) ORDER BY born).map(|$c| { id: $c.id, name: $c.name, state: $c.state });", json!({ "id": id })).await?))
}

/// 서류의 원본 그대로(그 종류로)
async fn file(Extension(me): Extension<Me>, Path(id): Path<String>) -> Result<impl IntoResponse, ApiError> {
    let d = q1(&me.db, "RETURN (SELECT mime, data FROM type::record('doc', $id))[0];", json!({ "id": id })).await?;
    let bytes = d["data"].as_str().and_then(|s| B64.decode(s).ok()).ok_or_else(|| err(StatusCode::NOT_FOUND, "없음"))?;
    Ok(([(header::CONTENT_TYPE, d["mime"].as_str().unwrap_or("application/octet-stream").to_string())], bytes))
}

/// 시연용 서류의 목록과 그 원본(출처 시연). 실행 파일에 들어 있어 초기화해도 언제나 있다
async fn samples() -> Json<J> {
    Json(json!(SAMPLES.iter().enumerate().map(|(i, s)| json!({ "id": (i + 1).to_string(), "name": s.0, "dealer": s.1, "source": "시연" })).collect::<Vec<_>>()))
}
async fn sample(Path(n): Path<usize>) -> Result<impl IntoResponse, ApiError> {
    let s = n.checked_sub(1).and_then(|i| SAMPLES.get(i)).ok_or_else(|| err(StatusCode::NOT_FOUND, "없음"))?;
    Ok(([(header::CONTENT_TYPE, "image/png")], s.2))
}

/// 파일의 시작 표시가 선언한 종류와 맞는지(PNG·JPEG·PDF). 받는 종류가 아니면 거짓
pub(super) fn looks(mime: &str, b: &[u8]) -> bool {
    match mime {
        "image/png" => b.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => b.starts_with(&[0xFF, 0xD8, 0xFF]),
        "application/pdf" => b.starts_with(b"%PDF-"),
        _ => false,
    }
}

/// 서류 접수: 본문은 파일 그대로, `Content-Type`은 그 종류, 쿼리 `name`은 파일 이름. 쓰기 전에 거절의 낱말을 정한다(`refuse`: 대상 → 권한 → 상태):
/// 없는 소명, 이미지·PDF가 아니거나 시작 표시가 그 종류와 다르거나 비었거나 2MB를 넘거나 이름이 없으면 대상, 영업지원이 아니면 권한, 발송 전이거나 요청 상태가 아니면 상태
pub(super) async fn upload(Extension(me): Extension<Me>, Path(id): Path<String>, Query(qs): Query<HashMap<String, String>>, h: HeaderMap, body: Result<Bytes, BytesRejection>) -> R {
    let mime = h.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or_default().split(';').next().unwrap_or_default().trim().to_string();
    let name = qs.get("name").map(|n| n.trim().to_string()).unwrap_or_default();
    accept(&me.db, &id, &name, &mime, &body.unwrap_or_default()).await
}

/// 접수의 본체. 화면의 올리기와 26 대화의 도구가 같은 길로 부른다(`db`는 그 사람의 세션이라 권한은 DB가 정한다)
pub(super) async fn accept(db: &Db, id: &str, name: &str, mime: &str, bytes: &[u8]) -> R {
    let bad = !looks(mime, bytes) || bytes.is_empty() || bytes.len() > MAX || name.is_empty() || name.chars().count() > 200;
    let vars = json!({ "id": id, "bad": bad, "name": name, "mime": mime, "size": bytes.len(), "sha": sha(bytes), "data": if bad { String::new() } else { B64.encode(bytes) } });
    let made = attempt(db, "
        LET $c = type::record('clarify', $id);
        RETURN IF $c.id = NONE OR $bad THEN '대상' ELSE IF $auth.role != '영업지원' THEN '권한' ELSE IF !fn::uploadable($c) THEN '상태' END;",
        "CREATE doc SET clarify = type::record('clarify', $id), name = $name, mime = $mime, size = $size, sha = $sha, data = $data RETURN VALUE record::id(id);", vars).await?;
    Ok(Json(json!({ "id": made[0] })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_words(n: usize) -> Vec<J> {
        words(&serde_json::from_str(SAMPLES[n].3).unwrap()).unwrap()
    }

    #[test]
    fn supplemented_sample_reads_a_different_room() {
        // 시나리오 5의 7: 보완된 서류는 호실이 있고(제301호) 금강상사41의 205호와 다르다
        let ws = sample_words(3);
        let t = checked(&canned("fixture", &ws).unwrap(), &ws).unwrap();
        assert!(serde_json::to_string(&t).unwrap().contains("301"), "{t:?}");
    }

    #[test]
    fn reads_upstage_words() {
        let ws = sample_words(0);
        let room = ws.iter().find(|w| w["text"] == "제302호").unwrap();
        let b: Vec<f64> = room["box"].as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect();
        assert!(b[0] < b[2] && b[1] < b[3] && b.iter().all(|x| (0.0..=1.0).contains(x)), "{b:?}");
        assert!(words(&json!({ "pages": [] })).is_none());
    }

    #[test]
    fn tidy_points_and_rejects_made_up_digits() {
        let ws = sample_words(0);
        let t = checked(&canned("fixture", &ws).unwrap(), &ws).unwrap();
        let v: Vec<&J> = t.iter().map(|x| &x["value"]).collect();
        assert_eq!(v, [&json!("성일상사24"), &json!("성남시 상공로 128"), &json!("302호"), &json!("2026-01-01~2027-12-31")]);
        assert!(checked(&canned("fixture-digit", &ws).unwrap(), &ws).is_none(), "판독에 없는 숫자");
        assert!(checked(r#"{"items":[{"item":"호실","words":[999],"value":"302호"}]}"#, &ws).is_none(), "없는 낱말");
        assert!(checked(r#"{"items":[{"item":"호실","words":[],"value":"302호"}]}"#, &ws).is_none(), "가리키지 않은 값");
        assert!(checked("글", &ws).is_none());
        // 호실이 빠진 서류: 호실은 찾지 못함
        let ws3 = sample_words(2);
        let t3 = checked(&canned("fixture", &ws3).unwrap(), &ws3).unwrap();
        assert_eq!(t3[2], json!({ "item": "호실", "words": [] }));
    }

    #[test]
    fn compares_and_puts_problems_first() {
        let ws = sample_words(0);
        let t = checked(&canned("fixture", &ws).unwrap(), &ws).unwrap();
        let reg = HashMap::from([("임차인", json!({ "value": "성일상사24" })), ("주소", json!({ "value": "성남시  상공로 128" })), ("호실", json!({ "value": "101호" }))]);
        let r = rows(&ws, &t, &reg);
        let got: Vec<(&J, &J)> = r.iter().map(|x| (&x["item"], &x["result"])).collect();
        assert_eq!(got, [(&json!("호실"), &json!("불일치")), (&json!("임차인"), &json!("일치")), (&json!("주소"), &json!("일치")), (&json!("기간"), &J::Null)]);
        assert_eq!(r[0]["read"], "제3층 제302호");
    }
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let rows_of = |v: &J| v.as_array().cloned().unwrap_or_default();
    let mine = async |role: &str, kind: &str| -> Result<Vec<J>> { Ok(rows_of(&c.get(role, "/api/tasks").await?[kind]).into_iter().filter(|m| m["kind"] == "소명").collect()) };
    let up = async |role: &str, id: &str, name: &str, bytes: &[u8], kind: &str| -> Result<(u16, J)> {
        let res = reqwest::Client::new().post(format!("{}/api/clarifies/{id}/docs?name={name}", c.base())).bearer_auth(c.token(role))
            .header("content-type", kind).body(bytes.to_vec()).send().await?;
        let code = res.status().as_u16();
        Ok((code, res.json().await.unwrap_or(J::Null)))
    };
    let docs = async |id: &str| c.get(audit, &format!("/api/clarifies/{id}/docs")).await;
    // 소명 하나를 연다: 기타 정황(대상, 상대 대리점) → 요청 → 발송. 소명의 id
    let open = async |tag: &str, a: &str, b: &str| -> Result<String> {
        q(&c.db, &format!("RETURN fn::signal('기타', 't19-{tag}', 't19-{tag}', [dealer:`{a}`, dealer:`{b}`], [], '계산');"), json!({})).await?;
        ensure!(c.post(audit, "/api/rule", json!({ "id": format!("기타-t19-{tag}"), "kind": "요청" })).await?.0 == 200, "요청 {tag}");
        let id = q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM clarify WHERE signal = type::record('signal', $s))[0];", json!({ "s": format!("기타-t19-{tag}") })).await?.as_str().unwrap_or_default().to_string();
        Ok(id)
    };
    let send = async |id: &str| c.post(support, "/api/send", json!({ "id": id })).await;
    let png = SAMPLES[0].2;
    let none = || { *USE.lock().unwrap() = None; *READ.lock().unwrap() = None; };

    // 호실이 다른 서류(성일상사24 ↔ 금강상사11)
    let one = open("1", "D-024", "D-011").await?;
    // 발송 전에는 올리지 못한다(상태). 올리는 칸도 없다
    ensure!(up(support, &one, "a.png", png, "image/png").await? == (400, json!({ "error": "상태" })), "발송 전");
    ensure!(docs(&one).await?["can"] == false && c.get(support, &format!("/api/clarifies/{one}/docs")).await?["can"] == false, "발송 전의 칸");
    ensure!(send(&one).await?.0 == 200, "발송");
    ensure!(c.get(support, &format!("/api/clarifies/{one}/docs")).await?["can"] == true && docs(&one).await?["can"] == false, "올리는 칸은 영업지원에게만");
    // 틀린 파일은 대상: 종류, 빈 파일, 2MB 초과, 이름 없음, 없는 소명. 다른 역할은 권한
    let big = vec![0u8; MAX + 1];
    for (name, bytes, kind) in [("a.txt", png, "text/plain"), ("a.png", &b"not a png"[..], "image/png"), ("a.pdf", png, "application/pdf"), ("a.png", &b""[..], "image/png"), ("a.png", &big[..], "image/png"), ("", png, "image/png")] {
        let r = up(support, &one, name, bytes, kind).await?;
        ensure!(r == (400, json!({ "error": "대상" })), "틀린 파일 {name} {kind} {} → {r:?}", bytes.len());
    }
    ensure!(up(support, "x", "a.png", png, "image/png").await? == (400, json!({ "error": "대상" })), "없는 소명");
    for role in [exec, audit, acct] {
        ensure!(up(role, &one, "a.png", png, "image/png").await? == (403, json!({ "error": "권한" })), "{role}의 접수");
    }
    // DB를 직접 써도: 다른 역할은 서류를 만들지 못하고, 영업지원이 판독·정리를 지어 넣어도 비어 있다
    for role in [exec, audit, acct] {
        let s = as_user(&c.db, c.token(role)).await?;
        q(&s, "CREATE doc SET clarify = type::record('clarify', $id), name = 'x.png', mime = 'image/png', size = 1, sha = 'x', data = 'AA==';", json!({ "id": one })).await.ok();
    }
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM doc);", json!({})).await? == 0 && mine(audit, "mine").await?.is_empty(), "거절된 접수가 남음");
    ensure!(c.get(audit, &format!("/api/clarifies/{one}")).await?["clarify"]["state"] == "요청", "거절 뒤의 상태");

    // 접수(2MB에 꼭 맞는 파일도 받는다 — DB에 들어가는지): 소명이 접수가 되고 내부 감시의 담당에 소명 작업, 영업지원은 진행
    let mut full = vec![7u8; MAX];
    full[..3].copy_from_slice(&[0xFF, 0xD8, 0xFF]);
    let two = open("2", "D-024", "D-011").await?;
    ensure!(send(&two).await?.0 == 200, "발송 2");
    ensure!(up(support, &two, "임대차계약서-2.png", &full, "image/jpeg").await?.0 == 200, "2MB 접수");
    let (code, r) = up(support, &one, SAMPLES[0].0, png, "image/png").await?;
    ensure!(code == 200 && r["id"].is_string(), "접수 {code} {r}");
    let d = docs(&one).await?;
    ensure!(d["docs"].as_array().is_some_and(|x| x.len() == 1) && d["docs"][0]["name"] == SAMPLES[0].0 && d["docs"][0]["role"] == support && d["docs"][0]["source"] == "시연" && d["docs"][0]["at"] == "2026-07-01", "서류 {}", d["docs"]);
    ensure!(c.get(audit, &format!("/api/clarifies/{one}")).await?["clarify"]["state"] == "접수", "접수 상태");
    let t = mine(audit, "mine").await?;
    ensure!(t.iter().any(|x| x["target"] == one.as_str() && x["view"] == "소명" && x["role"] == audit), "소명 작업 {t:?}");
    ensure!(mine(support, "going").await?.iter().any(|x| x["target"] == one.as_str()), "영업지원의 진행");
    // 원본은 올린 그대로다(DB에 남는다)
    let res = reqwest::Client::new().get(format!("{}/api/docs/{}/file", c.base(), d["docs"][0]["id"].as_str().unwrap_or_default())).bearer_auth(c.token(audit)).send().await?;
    ensure!(res.headers()[header::CONTENT_TYPE] == "image/png" && res.bytes().await?.as_ref() == png, "원본");
    // 한 번 접수하면 다시 올리지 못한다(상태). 동시에 둘을 올리면 하나만 된다
    ensure!(up(support, &one, "b.png", png, "image/png").await? == (400, json!({ "error": "상태" })), "다시 접수");
    let three = open("3", "D-034", "D-041").await?;
    ensure!(send(&three).await?.0 == 200, "발송 3");
    let both = tokio::join!(up(support, &three, "c.png", SAMPLES[2].2, "image/png"), up(support, &three, "c.png", SAMPLES[2].2, "image/png"));
    let mut got = [both.0?, both.1?];
    got.sort_by_key(|g| g.0);
    ensure!(got[0].0 == 200 && got[1] == (400, json!({ "error": "상태" })), "동시 접수 {got:?}");

    // 판독·정리가 멈춰 있으면(키 없음, 응답 없음): 원본만 있고 값은 비어 있다. 간격 안에는 다시 부르지 않는다
    none();
    let base = CALLS.load(Ordering::Relaxed);
    sweep_with(&c.db, None, None).await?;
    sweep_with(&c.db, None, None).await?;
    ensure!(CALLS.load(Ordering::Relaxed) == base + 3, "간격 {}", CALLS.load(Ordering::Relaxed) - base);
    let d = docs(&one).await?;
    ensure!(d["docs"][0]["words"].is_null() && d["docs"][0]["rows"] == json!([]) && d["docs"][0]["tidy"].is_null(), "멈춤 {}", d["docs"][0]);
    let again = || q(&c.db, "UPDATE doc SET read_tried = NONE, tidy_tried = NONE;", json!({}));
    // 판독은 되고 AI가 멈춰 있으면: 낱말은 있고 값 표는 비어 있다
    *READ.lock().unwrap() = Some("fixture".into());
    *USE.lock().unwrap() = Some("fixture-down".into());
    again().await?;
    sweep_with(&c.db, None, None).await?;
    again().await?;
    sweep_with(&c.db, None, None).await?;
    let d = docs(&one).await?;
    ensure!(d["docs"][0]["words"].as_array().is_some_and(|w| w.len() == 32) && d["docs"][0]["rows"] == json!([]) && d["docs"][0]["read_model"] == "fixture", "AI 멈춤 {}", d["docs"][0]["rows"]);
    // AI가 판독에 없는 숫자를 쓰면 그 정리는 버린다
    *USE.lock().unwrap() = Some("fixture-digit".into());
    again().await?;
    sweep_with(&c.db, None, None).await?;
    ensure!(docs(&one).await?["docs"][0]["tidy"].is_null(), "지어낸 숫자");
    // 정상: 호실이 다른 서류는 호실이 불일치(제3층 제302호 ↔ 금강상사11의 101호)이고 맨 위, 임차인·주소는 일치, 기간은 비교 없음
    *USE.lock().unwrap() = Some("fixture".into());
    again().await?;
    sweep_with(&c.db, None, None).await?;
    let d = docs(&one).await?;
    let row = |d: &J, i: usize| json!([d["rows"][i]["item"], d["rows"][i]["read"], d["rows"][i]["reg"]["value"], d["rows"][i]["result"]]);
    let x = &d["docs"][0];
    ensure!(row(x, 0) == json!(["호실", "제3층 제302호", "101호", "불일치"]) && x["rows"][0]["reg"]["source"] == "시연", "호실 {}", x["rows"]);
    ensure!(row(x, 1) == json!(["임차인", "성일상사24", "성일상사24", "일치"]) && row(x, 2) == json!(["주소", "성남시 상공로 128", "성남시 상공로 128", "일치"]) && x["rows"][2]["reg"]["source"] == "원본", "임차인·주소 {}", x["rows"]);
    ensure!(row(x, 3) == json!(["기간", "2026.01.01 ~ 2027.12.31", null, null]) && x["counts"] == json!({ "누락": 0, "불일치": 1 }), "기간 {}", x["rows"]);
    ensure!(x["tidy"][2]["value"] == "302호" && x["tidy_model"] == "fixture", "정리 {}", x["tidy"]);
    // 값의 줄이 가리킨 판독 낱말에 위치가 있다(원본의 강조)
    let w = x["rows"][0]["words"][0].as_u64().unwrap_or(999) as usize;
    ensure!(x["words"][w]["text"] == "제3층" && x["words"][w]["box"].as_array().is_some_and(|b| b.len() == 4), "위치 {}", x["words"][w]);
    // 채운 뒤에는 다시 부르지 않는다
    let base = CALLS.load(Ordering::Relaxed);
    again().await?;
    sweep_with(&c.db, None, None).await?;
    ensure!(CALLS.load(Ordering::Relaxed) == base + 1, "다시 부름 {}", CALLS.load(Ordering::Relaxed) - base); // 판독이 없는 2MB 파일만

    // 호실까지 같은 서류 → 모두 일치. 호실이 빠진 서류(한라인상사34 ↔ 금강상사41) → 호실 누락이 맨 위
    let four = open("4", "D-024", "D-011").await?;
    ensure!(send(&four).await?.0 == 200 && up(support, &four, SAMPLES[1].0, SAMPLES[1].2, "image/png").await?.0 == 200, "접수 4");
    again().await?;
    sweep_with(&c.db, None, None).await?;
    sweep_with(&c.db, None, None).await?;
    let x = docs(&four).await?["docs"][0].clone();
    ensure!(row(&x, 0) == json!(["임차인", "성일상사24", "성일상사24", "일치"]) && row(&x, 2) == json!(["호실", "제1층 제101호", "101호", "일치"]) && x["counts"] == json!({ "누락": 0, "불일치": 0 }), "같은 호실 {}", x["rows"]);
    let x = docs(&three).await?["docs"][0].clone();
    ensure!(row(&x, 0) == json!(["호실", null, "205호", "누락"]) && x["counts"] == json!({ "누락": 1, "불일치": 0 }), "빠진 호실 {}", x["rows"]);
    ensure!(row(&x, 1) == json!(["임차인", "한라인상사34", "한라인상사34", "일치"]) && row(&x, 2) == json!(["주소", "고양시 중앙로 128", "고양시 중앙로 128", "일치"]), "빠진 호실의 나머지 {}", x["rows"]);
    // 대리점 상세에서 소명으로 가는 길
    ensure!(c.get(support, "/api/dealers/D-034/clarifies").await? == json!([{ "id": three, "name": "기타 · t19-3", "state": "접수" }]), "대리점의 소명");
    // 시연 서류는 언제나 받을 수 있다(실행 파일에 들어 있다)
    let s = c.get(support, "/api/samples").await?;
    ensure!(s.as_array().is_some_and(|s| s.len() == 4) && s[2]["dealer"] == "한라인상사34" && s[3]["dealer"] == "한라인상사34" && s[0]["dealer"] == "성일상사24", "시연 서류 {s}");
    none();
    Ok(())
}
