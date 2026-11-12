//! 26 대화 서류: 대화에 올린 파일을 AI가 도구로 소명의 서류로 넘긴다(D24, U13).
//! 파일은 대화의 파일 파트(data URL)로 오고 서버는 저장하지 않는다. 넘기는 일은 19의 서류 접수(`accept`)와 같은 길이다:
//! 그 사람의 세션으로 `fn::uploadable`(영업지원 · 요청 상태 · 발송한 뒤)을 거쳐 `doc`이 만들어지고, 판독 · 정리 · 비교와 접수 이벤트는 19 그대로다. 새 쓰기 경로는 없다.
//! 어느 소명인지 정해지지 않으면 도구가 넘기지 않고 서류를 받을 수 있는 소명의 목록을 돌려주어 AI가 묻게 한다.
use super::t19_docs::{MAX, accept, sha};
use crate::check::Check;
use crate::db::{Db, q1};
use aisdk::core::tools::ToolExecute;
use aisdk::core::Tool;
use anyhow::{Result, ensure};
use axum::Router;
use base64::Engine;
use serde_json::{Value as J, json};
use std::sync::{Arc, Mutex};

pub const SCHEMA: &str = include_str!("../../db/26-대화서류.surql");
pub fn routes() -> Router<Arc<Db>> { Router::new() }
pub async fn seed(_db: &Db) -> Result<()> { Ok(()) }

/// 대화에 올린 파일
#[derive(Clone)]
pub(super) struct Up { pub name: String, pub mime: String, pub bytes: Vec<u8> }

/// 메시지의 파일 파트(`{ type: 'file', mediaType, filename, url: 'data:<종류>;base64,…' }`)에서 파일을 꺼낸다. 읽을 수 없는 것은 건너뛴다(종류와 크기는 접수가 따진다)
/// 같은 파일(내용이 같은 것)은 하나로, 이름이 같은 다른 파일은 두 번째부터 이름에 순번을 붙인다(`1.png`, `1-2.png`)
pub(super) fn distinct(files: Vec<Up>) -> Vec<Up> {
    let mut out: Vec<Up> = vec![];
    for mut f in files {
        if out.iter().any(|o| o.bytes == f.bytes) { continue; }
        let n = out.iter().filter(|o| o.name == f.name || o.name.starts_with(&format!("{}-", f.name.rsplit_once('.').map_or(f.name.as_str(), |x| x.0)))).count();
        if n > 0 {
            let (stem, ext) = f.name.rsplit_once('.').map_or((f.name.as_str(), String::new()), |(a, b)| (a, format!(".{b}")));
            f.name = format!("{stem}-{}{ext}", n + 1);
        }
        out.push(f);
    }
    out
}

pub(super) fn files_of(parts: &[J]) -> Vec<Up> {
    parts.iter().filter(|p| p["type"] == "file").filter_map(|p| {
        let b64 = p["url"].as_str()?.strip_prefix("data:")?.split_once(";base64,")?.1;
        // 2MB를 넘는 것은 풀지 않는다(base64는 4/3배). 접수가 크기로 거절한다
        let bytes = if b64.len() > MAX / 3 * 4 + 8 { vec![0; MAX + 1] } else { base64::engine::general_purpose::STANDARD.decode(b64).ok()? };
        Some(Up { name: p["filename"].as_str().unwrap_or_default().trim().to_string(), mime: p["mediaType"].as_str().unwrap_or_default().to_string(), bytes })
    }).collect()
}

/// 파일을 소명의 서류로 넘긴다. → (AI가 전할 글, 넘겼으면 `{ id, name }`). `clarify`가 비었으면 넘기지 않고 서류를 받을 수 있는 소명을 알려 묻게 한다
pub(super) async fn hand(me: &Db, files: &[Up], clarify: &str, file: &str) -> (String, Option<J>) {
    let no = |t: &str| (t.to_string(), None);
    let (clarify, file) = (clarify.trim(), file.trim());
    let Some(up) = (if file.is_empty() && files.len() == 1 { files.first() } else { files.iter().find(|f| f.name == file) }) else {
        return no(&if files.is_empty() { "넘길 파일이 없다: 대화에 올라온 파일이 없다".to_string() } else { format!("어느 파일인지 묻는다: {}", files.iter().map(|f| f.name.as_str()).collect::<Vec<_>>().join(", ")) });
    };
    // 영업지원이 아니면 후보를 찾기 전에 권한으로 답한다(19와 같은 규칙: 서류는 영업지원만 올린다)
    if q1(me, "RETURN $auth.role;", json!({})).await.ok().and_then(|r| r.as_str().map(String::from)).as_deref() != Some("영업지원") { return no("넘기지 않았다: 이 역할은 서류를 올릴 수 없다(권한)"); }
    // 후보는 이름으로만 보인다(id는 화면에 나가지 않게): 사용자에게는 이름을, 도구에는 번호를 준다
    let open = q1(me, "RETURN (SELECT name, record::id(id) AS id FROM clarify WHERE fn::uploadable(id) ORDER BY id);", json!({})).await.unwrap_or_default();
    let open = open.as_array().cloned().unwrap_or_default();
    if clarify.is_empty() {
        return no(&if open.is_empty() { "넘길 수 있는 소명이 없다: 요청 상태이고 발송한 소명이 없다. 파일을 넘기지 않았다".to_string() } else {
            format!("어느 소명인지 묻는다. 서류를 받을 수 있는 소명(사용자에게는 이름만 말하고, 고르면 번호로 부른다): {}", open.iter().enumerate().map(|(i, o)| format!("{} {}", i + 1, o["name"].as_str().unwrap_or_default())).collect::<Vec<_>>().join(", "))
        });
    }
    // 번호이면 후보의 id로 바꾼다
    let picked = clarify.parse::<usize>().ok().and_then(|n| open.get(n.checked_sub(1)?)).and_then(|o| o["id"].as_str());
    let clarify = picked.unwrap_or(clarify);
    // 같은 소명에 같은 파일은 다시 넘기지 않는다(대화는 파일을 매번 다시 보낸다)
    let dup = q1(me, "RETURN count(SELECT id FROM doc WHERE clarify = type::record('clarify', $id) AND sha = $sha);", json!({ "id": clarify, "sha": sha(&up.bytes) })).await.ok().and_then(|n| n.as_u64()).unwrap_or(0);
    if dup > 0 { return no("이미 넘긴 파일이다"); }
    match accept(me, clarify, &up.name, &up.mime, &up.bytes).await {
        Ok(_) => {
            let name = q1(me, "RETURN type::record('clarify', $id).name;", json!({ "id": clarify })).await.ok().and_then(|n| n.as_str().map(String::from)).unwrap_or_default();
            (format!("넘겼다: {name}. 판독과 정리는 서류 화면에서 이어진다"), Some(json!({ "id": clarify, "name": name })))
        }
        Err(e) => no(match e.1["error"].as_str() {
            Some("권한") => "넘기지 않았다: 이 역할은 서류를 올릴 수 없다(권한)",
            Some("상태") => "넘기지 않았다: 그 소명은 서류를 받을 수 있는 상태가 아니다(요청 상태이고 발송한 소명만 받는다)",
            _ => "넘기지 않았다: 없는 소명이거나 받을 수 없는 파일이다(대상. 이미지나 PDF, 2MB까지)",
        }),
    }
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
#[allow(dead_code)] // 입력의 꼴은 모델에게 보이는 스키마로만 쓰인다
// 칸은 모두 필수다(OpenAI의 strict 도구 규칙) — 정해지지 않았으면 빈 글
struct DocInput {
    /// 서류를 받을 소명의 id 또는 후보 목록의 번호. 사용자가 말했거나 열어 둔 대상이 소명일 때만 쓴다. 정해지지 않았으면 빈 글(추측하지 않는다)
    clarify: String,
    /// 넘길 파일의 이름. 올라온 파일이 하나뿐이면 빈 글
    file: String,
}

/// 대화에 올린 파일을 소명의 서류로 넘기는 도구(`doc`). `me`는 사람의 세션이라 권한과 상태는 19와 같은 길에서 DB가 정한다. 넘긴 것은 `done`에 모은다
pub(super) fn doc_tool(me: &Db, files: Arc<Vec<Up>>, done: Arc<Mutex<Vec<J>>>) -> Result<Tool, &'static str> {
    Tool::builder()
        .name("doc")
        .description("사용자가 대화에 올린 파일을 소명의 서류로 넘긴다. 어느 소명인지 정해지지 않았으면 clarify를 빈 글로 불러 서류를 받을 수 있는 소명의 목록을 얻고 사용자에게 묻는다. 넘길 수 없으면 까닭을 글로 돌려준다")
        .input_schema(schemars::schema_for!(DocInput))
        .execute(ToolExecute::from_async({
            let me = me.clone();
            move |_, input: J| {
                let (me, files, done) = (me.clone(), files.clone(), done.clone());
                async move {
                    let (text, ok) = hand(&me, &files, input["clarify"].as_str().unwrap_or_default(), input["file"].as_str().unwrap_or_default()).await;
                    if let Some(d) = ok { done.lock().unwrap().push(d); }
                    Ok(text)
                }
            }
        }))
        .build()
        .map_err(|_| "응답")
}

pub async fn check(c: &Check) -> Result<()> {
    use super::t17_report::USE;
    use super::t19_docs::{READ, SAMPLES, sweep_with};
    use super::t24_chat::{events, said};
    use crate::db::{q, q1};
    use base64::Engine;
    let (support, audit) = ("영업지원", "내부 감시");
    let http = reqwest::Client::new();
    let png = SAMPLES[0].2;
    let other = SAMPLES[1].2;
    // 대화에서 파일을 올린다(고정 응답: OpenAI를 부르지 않는다) → (AI의 글, 넘긴 서류의 `data-doc`)
    let say = async |role: &str, line: &str, file: Option<&[u8]>| -> Result<(String, Vec<J>)> {
        let mut parts = vec![json!({ "type": "text", "text": line })];
        if let Some(f) = file { parts.push(json!({ "type": "file", "mediaType": "image/png", "filename": "임대차.png", "url": format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(f)) })); }
        let body = json!({ "messages": [{ "role": "user", "id": "u", "parts": parts }] });
        let res = http.post(format!("{}/api/chat", c.base())).bearer_auth(c.token(role)).json(&body).send().await?;
        ensure!(res.status() == 200, "대화 {}", res.status());
        let ev = events(&res.text().await?).0;
        Ok((said(&ev), ev.iter().filter(|e| e["type"] == "data-doc").map(|e| e["data"].clone()).collect()))
    };
    let count = async |id: &str| q1(&c.db, "RETURN count(SELECT id FROM doc WHERE clarify = type::record('clarify', $id));", json!({ "id": id })).await;
    let was = USE.lock().unwrap().clone();
    *USE.lock().unwrap() = Some("fixture".into());
    let res = async {
        // 요청 상태의 소명이 없으면 넘기지 않고 그 사실을 답한다
        let (text, done) = say(support, "서류||", Some(png)).await?;
        ensure!(done.is_empty() && text.contains("넘길 수 있는 소명이 없다"), "소명이 없을 때 {text}");
        // 정황 → 요청 → 발송: 서류를 받을 수 있는 소명 둘
        let mut ids = vec![];
        for t in ["a", "b"] {
            q(&c.db, &format!("RETURN fn::signal('기타', 't26-{t}', 't26-{t}', [dealer:`D-024`, dealer:`D-011`], [], '계산');"), json!({})).await?;
            ensure!(c.post(audit, "/api/rule", json!({ "id": format!("기타-t26-{t}"), "kind": "요청" })).await?.0 == 200, "요청 {t}");
            let id = q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM clarify WHERE signal = type::record('signal', $s))[0];", json!({ "s": format!("기타-t26-{t}") })).await?.as_str().unwrap_or_default().to_string();
            ensure!(c.post(support, "/api/send", json!({ "id": id })).await?.0 == 200, "발송 {t}");
            ids.push(id);
        }
        let (a, b) = (&ids[0], &ids[1]);
        // 어느 소명인지 정해지지 않으면 묻고, 아무것도 넘기지 않는다
        let (text, done) = say(support, "서류||", Some(png)).await?;
        ensure!(done.is_empty() && text.contains("어느 소명") && text.contains("1 ") && text.contains("2 ") && !text.contains(a.as_str()) && !text.contains(b.as_str()) && count(a).await? == 0 && count(b).await? == 0, "어느 소명 {text}");
        // 파일이 없으면 넘길 것이 없다
        let (text, done) = say(support, &format!("서류|{a}|"), None).await?;
        ensure!(done.is_empty() && text.contains("넘길 파일이 없다") && count(a).await? == 0, "파일 없음 {text}");
        // 영업지원이 아니면 권한(19와 같은 길): 넘기지 않는다
        let (text, done) = say(audit, &format!("서류|{a}|"), Some(png)).await?;
        ensure!(done.is_empty() && text.contains("권한") && count(a).await? == 0, "내부 감시 {text}");
        // 영업지원이 아니면 소명을 말하지 않아도 권한이다(후보가 없다는 답이 아니다)
        let (text, done) = say(audit, "서류||", Some(png)).await?;
        ensure!(done.is_empty() && text.contains("권한") && !text.contains("소명이 없다"), "내부 감시, 소명 없이 {text}");
        // 없는 소명
        let (text, done) = say(support, "서류|없는-소명|", Some(png)).await?;
        ensure!(done.is_empty() && text.contains("대상"), "없는 소명 {text}");
        // 넘긴다: 서류가 소명 상세에 나타나고 소명은 접수가 되며 내부 감시의 소명 작업이 생긴다 — 소명 화면에서 올린 것과 같다
        let (text, done) = say(support, &format!("서류|{a}|"), Some(png)).await?;
        ensure!(text.contains("넘겼다") && done.len() == 1 && done[0]["id"] == a.as_str() && count(a).await? == 1, "넘김 {text} {done:?}");
        let d = c.get(audit, &format!("/api/clarifies/{a}/docs")).await?;
        let doc = &d["docs"][0];
        ensure!(d["docs"].as_array().is_some_and(|l| l.len() == 1) && doc["name"] == "임대차.png" && doc["mime"] == "image/png" && doc["size"] == png.len() && doc["role"] == support, "소명 상세의 서류 {d}");
        let file = http.get(format!("{}/api/docs/{}/file", c.base(), doc["id"].as_str().unwrap_or_default())).bearer_auth(c.token(audit)).send().await?.bytes().await?;
        ensure!(file.as_ref() == png, "원본 그대로");
        ensure!(q1(&c.db, "RETURN type::record('clarify', $id).state;", json!({ "id": a })).await? == "접수", "접수");
        // 같은 파일을 다시 넘기지 않는다
        let (text, done) = say(support, &format!("서류|{a}|"), Some(png)).await?;
        ensure!(done.is_empty() && text.contains("이미") && count(a).await? == 1, "같은 파일 {text}");
        // 접수된 소명은 요청이 아니라 더 받지 않는다(상태). 다른 내용의 파일로 보내 중복 검사가 아니라 상태 거절을 본다. 남은 요청 상태의 소명은 하나뿐이라 후보도 하나다
        let (text, done) = say(support, &format!("서류|{a}|"), Some(other)).await?;
        ensure!(done.is_empty() && text.contains("상태가 아니다") && count(a).await? == 1, "접수 뒤 {text}");
        let (text, done) = say(support, "서류||", Some(png)).await?;
        ensure!(done.is_empty() && text.contains("어느 소명") && text.contains("1 ") && !text.contains("2 ") && !text.contains(b.as_str()), "후보는 요청 상태만, id 없이 {text}");
        // 번호로 고르면 그 소명에 넘어간다
        let (text, done) = say(support, "서류|1|", Some(png)).await?;
        ensure!(text.contains("넘겼다") && done.len() == 1 && done[0]["id"] == b.as_str() && count(b).await? == 1, "번호로 고름 {text}");
        // 넘겨진 파일도 판독 · 정리 · 비교를 똑같이 거친다
        *READ.lock().unwrap() = Some("fixture".into());
        for _ in 0..2 {
            q(&c.db, "UPDATE doc SET read_tried = NONE, tidy_tried = NONE;", json!({})).await?;
            sweep_with(&c.db, None, None).await?;
        }
        *READ.lock().unwrap() = None;
        let d = c.get(audit, &format!("/api/clarifies/{a}/docs")).await?;
        ensure!(d["docs"][0]["words"].as_array().is_some_and(|w| !w.is_empty()) && d["docs"][0]["rows"].as_array().is_some_and(|r| !r.is_empty()), "판독·정리·비교 {d}");
        // 보완 뒤 같은 소명에 다른 파일을 다시 올릴 수 있는 것은 19의 `fn::uploadable`이 정한다(이 길은 그것만 묻는다)
        Ok(())
    }.await;
    *USE.lock().unwrap() = was;
    res
}

#[cfg(test)]
mod tests {
    use super::*;
    fn up(n: &str, b: u8) -> Up { Up { name: n.into(), mime: "image/png".into(), bytes: vec![b] } }
    #[test]
    fn same_bytes_once_same_name_numbered() {
        let l = distinct(vec![up("1.png", 1), up("1.png", 1), up("1.png", 2), up("1.png", 3), up("a", 4), up("a", 5)]);
        assert_eq!(l.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["1.png", "1-2.png", "1-3.png", "a", "a-2"]);
    }
}
