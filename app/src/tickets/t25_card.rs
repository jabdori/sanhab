//! 25 조치 카드: 대화에서 사람이 조치를 지시하면 AI가 카드(대상, 조치, 사유의 분류와 메모)를 도구로 낸다.
//! AI는 아무것도 실행하지 못한다. 카드는 내용뿐이고(저장하지 않는다), 사람이 화면에서 실행을 눌러야 그 사람의 세션으로
//! 화면에서 직접 한 조치와 같은 경로(`POST /api/decide` · `/rule` · `/verdict`)가 불린다 — 결과는 이력과 경위에 똑같이 남는다. 새 쓰기 경로는 없다.
//! 그 역할이 할 수 없는 조치는 카드를 내지 않는다: 그 사람의 세션으로 04·05·10의 `fn::refusal`, 11의 `fn::rulable`, 20의 `fn::decidable`을 묻는다.
//! 카드가 다루는 조치: 심사의 승인 · 보류 · 반려, 추인의 추인 · 거부, 정황의 요청 · 기각, 소명의 인정 · 불인정 · 보완.
//! 화면 부품(A2UI, 2026-11-15 결정): AI가 `show` 도구로 Google A2UI v0.8의 메시지(surfaceUpdate · beginRendering)를 내면 답 안에 부품을 그린다.
//! 부품은 앱의 목록(`CATALOG`) 안의 것만이고 보기만 한다 — 단추 · 조치가 없다(실행은 위의 조치 카드뿐). 값은 그대로 그리고, 기록 목록은 read_db로 읽은 기록만 받으며 이름은 서버가 붙인다.
use crate::check::Check;
use crate::db::{Db, q, q1};
use anyhow::{Result, ensure};
use aisdk::core::tools::ToolExecute;
use aisdk::core::Tool;
use axum::Router;
use serde_json::{Value as J, json};
use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

pub const SCHEMA: &str = include_str!("../../db/25-카드.surql");
pub fn routes() -> Router<Arc<Db>> { Router::new() }
pub async fn seed(_db: &Db) -> Result<()> { Ok(()) }

/// 대상의 종류(화면의 낱말)마다 카드로 낼 수 있는 조치
const ACTS: [(&str, &[&str]); 4] = [("심사", &["승인", "보류", "반려"]), ("추인", &["추인", "거부"]), ("정황", &["요청", "기각"]), ("소명", &["인정", "불인정", "보완"])];

/// 그 대상에 그 조치를 지금 이 세션(역할)이 할 수 있는지 물어 카드를 만든다. 못 하면 거절의 낱말(대상 · 권한 · 상태 · 분류)
pub(super) async fn make(me: &Db, kind: &str, id: &str, action: &str, class: Option<&str>, memo: Option<&str>) -> Result<J, String> {
    // 모델은 읽은 그대로 `review:⟨2026-06-D-001⟩`이나 백틱을 붙여 넘기기도 한다 — 테이블 머리와 감싼 기호를 걷어 id만 쓴다
    let id = id.rsplit_once(':').map_or(id, |(_, r)| r).trim_matches(|c| matches!(c, '`' | '⟨' | '⟩' | ' ' | '\'' | '"'));
    if !ACTS.iter().any(|(k, a)| *k == kind && a.contains(&action)) || id.is_empty() { return Err("대상".into()); }
    // 사유가 필수이면(`must`) 카드는 사유가 비어도 그려지고, 사람이 채워야 실행이 눌린다
    let (sql, path) = match kind {
        "심사" => ("LET $r = type::record('review', $id);
            RETURN { w: fn::refusal($action, $r, NONE), name: string::concat($r.name, ' · ', $r.ym), must: fn::must($action, $r), classes: fn::classes($action, $r), ids: [$id] };", "/decide"),
        "추인" => ("LET $b = type::record('ratify', $id); LET $r = $b.reviews[0];
            RETURN { w: IF $b.name = NONE THEN '대상' ELSE fn::refusal($action, $r, NONE) END, name: string::concat($b.name, ' · ', $b.ym), must: fn::must($action, $r), classes: fn::classes($action, $r), ids: [record::id($r)] };", "/decide"),
        "정황" => ("LET $s = type::record('signal', $id);
            RETURN { w: IF $s.id = NONE THEN '대상' ELSE IF $auth.role != '내부 감시' THEN '권한' ELSE IF !fn::rulable($s) THEN '상태' END, name: $s.name ?? '', must: $action = '기각', classes: fn::ruling_classes($action) };", "/rule"),
        _ => ("LET $c = type::record('clarify', $id);
            RETURN { w: IF $c.id = NONE THEN '대상' ELSE IF $auth.role != '내부 감시' THEN '권한' ELSE IF !fn::decidable($c) THEN '상태' END, name: $c.name ?? '', must: true, classes: fn::verdict_classes($action) };", "/verdict"),
    };
    let v = q1(me, sql, json!({ "id": id, "action": action })).await.map_err(|_| "대상".to_string())?;
    // 사유가 모자란 것('사유')은 거절이 아니다(카드에서 채운다). 그 밖의 낱말이면 카드를 내지 않는다
    if let Some(w) = v["w"].as_str().filter(|w| *w != "사유") { return Err(w.into()); }
    let classes = v["classes"].clone();
    let class = class.map(str::trim).filter(|c| !c.is_empty());
    if class.is_some_and(|c| !classes.as_array().is_some_and(|l| l.iter().any(|x| x == c))) { return Err("분류".into()); }
    let body = match kind { "심사" | "추인" => json!({ "ids": v["ids"], "kind": action }), _ => json!({ "id": id, "kind": action }) };
    Ok(json!({
        "kind": kind, "id": id, "name": v["name"], "action": action, "must": v["must"], "classes": classes,
        "class": class, "memo": memo.map(str::trim).filter(|m| !m.is_empty()),
        "run": { "path": path, "body": body },
    }))
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
#[allow(dead_code)] // 입력의 꼴은 모델에게 보이는 스키마로만 쓰인다
// 칸은 모두 필수다(OpenAI의 strict 도구 규칙) — 사유를 말하지 않았으면 빈 글
struct CardInput {
    /// 대상의 종류: 심사 · 추인 · 정황 · 소명
    kind: String,
    /// 대상의 id(read_db로 읽은 것. 추인은 묶음의 id)
    id: String,
    /// 조치: 심사(승인 · 보류 · 반려) · 추인(추인 · 거부) · 정황(요청 · 기각) · 소명(인정 · 불인정 · 보완)
    action: String,
    /// 사유의 분류. 사람이 말한 것만 옮겨 적는다. 말하지 않았으면 빈 글
    class: String,
    /// 사유의 메모. 사람이 말한 것을 그대로 옮겨 적는다. 말하지 않았으면 빈 글(지어내지 않는다)
    memo: String,
}

/// 카드를 내는 도구(`card`). 쓰기가 아니라 카드의 내용만 `cards`에 모은다. `me`는 사람의 세션이라 그 역할이 할 수 없는 조치는 카드가 되지 않는다
pub(super) fn card_tool(me: &Db, cards: Arc<Mutex<Vec<J>>>) -> Result<Tool, &'static str> {
    Tool::builder()
        .name("card")
        .description("사람이 조치를 지시했을 때 조치 카드를 낸다. 조치를 실행하지 않는다: 사람이 카드에서 실행을 눌러야 한다. 사유는 사람이 말한 것만 옮겨 적는다. 낼 수 없으면 까닭을 글로 돌려준다")
        .input_schema(schemars::schema_for!(CardInput))
        .execute(ToolExecute::from_async({
            let me = me.clone();
            move |_, input: J| {
                let (me, cards) = (me.clone(), cards.clone());
                async move {
                    let s = |k: &str| input[k].as_str().map(String::from);
                    Ok(match make(&me, &s("kind").unwrap_or_default(), &s("id").unwrap_or_default(), &s("action").unwrap_or_default(), s("class").as_deref(), s("memo").as_deref()).await {
                        Ok(c) => {
                            let mut l = cards.lock().unwrap();
                            if !l.iter().any(|o| o["kind"] == c["kind"] && o["id"] == c["id"] && o["action"] == c["action"]) { l.push(c); }
                            "카드를 그렸다. 실행은 사람이 누른다".to_string()
                        }
                        Err(w) => format!("카드를 내지 않는다: {}", match w.as_str() { "권한" => "이 역할에는 그 조치의 권한이 없다", "상태" => "지금 상태에서는 그 조치를 할 수 없다", "분류" => "분류가 목록에 없다", _ => "대상이나 조치가 맞지 않는다" }),
                    })
                }
            }
        }))
        .build()
        .map_err(|_| "응답")
}

/// A2UI 부품 목록(catalog): 이름 → 화면의 astryx 부품. Column → VStack · Text → Text · Facts(한 기록의 값들) → MetadataList · Table(여러 기록 · 비교) → Table · Records(기록 목록, 누르면 그 기록을 연다) → List
pub(super) const CATALOG: [&str; 5] = ["Column", "Text", "Facts", "Table", "Records"];
/// 한 표면의 한도: 부품 수, 입력 글자 수, 한 답의 표면 수
const PARTS: usize = 30;
const RAW: usize = 16_000;
pub(super) const SURFACES: usize = 2;

/// `테이블:id`(id는 백틱 · ⟨⟩로 감싸였거나 맨 글) → `테이블:\`id\``. 모르는 테이블이면 None
pub(super) fn record_ref(s: &str) -> Option<String> {
    let (tb, id) = s.trim().split_once(':')?;
    let id = id.trim_matches(|c| matches!(c, '`' | '⟨' | '⟩' | ' '));
    (super::t24_chat::TABLES.contains(&tb) && !id.is_empty() && !id.contains('`')).then(|| format!("{tb}:`{id}`"))
}

/// A2UI 메시지(JSON 배열 글)를 목록에 맞춰 검사하고 허락한 칸만 남긴 표면으로 → (`[surfaceUpdate, beginRendering]`, 기록 목록이 가리키는 기록들). `seen`은 이 답에서 read_db가 돌려준 기록
pub(super) fn surface(raw: &str, seen: &BTreeSet<String>) -> Result<(J, Vec<String>), String> {
    let no = |w: &str| w.to_string();
    if raw.len() > RAW { return Err(no("너무 크다")); }
    let msgs: Vec<J> = serde_json::from_str(raw).map_err(|_| no("A2UI 메시지의 JSON 배열이 아니다"))?;
    let (mut parts, mut root, mut sid) = (serde_json::Map::new(), None::<String>, None::<String>);
    for m in &msgs {
        let (k, v) = m.as_object().filter(|o| o.len() == 1).and_then(|o| o.iter().next()).ok_or_else(|| no("메시지마다 키가 하나다"))?;
        match k.as_str() {
            "surfaceUpdate" => for c in v["components"].as_array().ok_or_else(|| no("components가 없다"))? {
                let id = c["id"].as_str().filter(|s| !s.is_empty() && s.chars().count() <= 40).ok_or_else(|| no("부품의 id가 없다"))?;
                let (ty, props) = c["component"].as_object().filter(|o| o.len() == 1).and_then(|o| o.iter().next()).ok_or_else(|| no("component에는 부품이 하나다"))?;
                if parts.insert(id.into(), json!({ ty: part(ty, props)? })).is_some() { return Err(format!("id {id}가 겹친다")); }
            },
            "beginRendering" => root = v["root"].as_str().map(String::from),
            "dataModelUpdate" => return Err(no("값은 부품에 바로 넣는다(dataModelUpdate는 받지 않는다)")),
            _ => return Err(format!("{k}는 받지 않는다")),
        }
        sid = sid.or_else(|| v["surfaceId"].as_str().filter(|s| s.chars().count() <= 40).map(String::from));
    }
    if parts.len() > PARTS { return Err(no("부품이 너무 많다")); }
    let root = root.filter(|r| parts.contains_key(r)).ok_or_else(|| no("beginRendering의 root가 없다"))?;
    // 뿌리에서 닿는 부품만 그린다: 없는 자식 · 되돌아오는 선 · 네 겹을 넘는 깊이는 거절
    let seen: BTreeSet<String> = seen.iter().filter_map(|s| record_ref(s)).collect();
    let (mut out, mut refs, mut stack) = (vec![], vec![], vec![(root.clone(), 0)]);
    let mut met = BTreeSet::new();
    while let Some((id, depth)) = stack.pop() {
        if depth > 4 || !met.insert(id.clone()) { return Err(no("부품의 짜임이 틀렸다(되돌아오거나 너무 깊다)")); }
        let c = parts.get(&id).ok_or_else(|| format!("없는 부품 {id}"))?;
        for k in c["Column"]["children"]["explicitList"].as_array().into_iter().flatten().rev() { stack.push((k.as_str().unwrap_or_default().to_string(), depth + 1)); }
        for r in c["Records"]["items"].as_array().into_iter().flatten() {
            let r = r["record"].as_str().unwrap_or_default();
            if !seen.contains(r) { return Err(format!("{r}는 이 답에서 read_db로 읽은 기록이 아니다")); }
            refs.push(r.to_string());
        }
        out.push(json!({ "id": id, "component": c }));
    }
    let sid = sid.unwrap_or_else(|| "s1".into());
    Ok((json!([{ "surfaceUpdate": { "surfaceId": sid, "components": out } }, { "beginRendering": { "surfaceId": sid, "root": root, "catalogId": "sanhab" } }]), refs))
}

/// 부품 하나의 칸을 검사해 허락한 칸만 돌려준다(그 밖의 칸 — action 같은 것 — 은 버린다)
fn part(ty: &str, p: &J) -> Result<J, String> {
    // 글은 짧은 글, 수는 글로
    let text = |v: &J, max: usize| -> Option<String> { let t = v.as_str().map(String::from).or_else(|| v.is_number().then(|| v.to_string()))?; (t.chars().count() <= max).then_some(t) };
    let list = |v: &J, lo: usize, hi: usize| v.as_array().filter(|a| (lo..=hi).contains(&a.len())).cloned();
    let title = || -> Result<J, String> { match &p["title"] { J::Null => Ok(J::Null), t => text(t, 60).map(J::String).ok_or_else(|| "title이 길다".into()) } };
    let bad = |w: &str| format!("{ty}: {w}");
    Ok(match ty {
        "Column" => {
            let kids = list(&p["children"]["explicitList"], 1, 10).ok_or_else(|| bad("children.explicitList는 id 1~10개"))?;
            if kids.iter().any(|k| !k.is_string()) { return Err(bad("children은 id")); }
            json!({ "children": { "explicitList": kids } })
        }
        "Text" => json!({ "text": { "literalString": text(&p["text"]["literalString"], 1000).ok_or_else(|| bad("text.literalString(1000자까지)"))? } }),
        "Facts" => {
            let items = list(&p["items"], 1, 12).ok_or_else(|| bad("items는 1~12개"))?;
            let items: Option<Vec<J>> = items.iter().map(|i| Some(json!({ "label": text(&i["label"], 40)?, "value": text(&i["value"], 200)? }))).collect();
            json!({ "title": title()?, "items": items.ok_or_else(|| bad("items는 { label, value }"))? })
        }
        "Table" => {
            let cols = list(&p["columns"], 2, 6).ok_or_else(|| bad("columns는 2~6개"))?;
            let cols: Option<Vec<String>> = cols.iter().map(|c| text(c, 40)).collect();
            let cols = cols.ok_or_else(|| bad("columns는 글"))?;
            let rows = list(&p["rows"], 1, 20).ok_or_else(|| bad("rows는 1~20줄"))?;
            let rows: Option<Vec<Vec<String>>> = rows.iter().map(|r| r.as_array().filter(|r| r.len() == cols.len()).and_then(|r| r.iter().map(|x| text(x, 100)).collect())).collect();
            json!({ "title": title()?, "columns": cols, "rows": rows.ok_or_else(|| bad("rows의 줄마다 columns와 같은 수의 글"))? })
        }
        "Records" => {
            let items = list(&p["items"], 1, 12).ok_or_else(|| bad("items는 1~12개"))?;
            let items: Option<Vec<J>> = items.iter().map(|i| Some(json!({ "record": record_ref(i["record"].as_str()?)? }))).collect();
            json!({ "title": title()?, "items": items.ok_or_else(|| bad("items는 { record: \"테이블:id\" }"))? })
        }
        _ => return Err(format!("{ty}는 부품 목록에 없다({}만)", CATALOG.join(" · "))),
    })
}

/// 검사한 표면의 기록 목록에 이름과 여는 길을 붙인다(이름은 모델이 아니라 DB에서). 없는 기록이면 거절
pub(super) async fn draw(ai: &Db, raw: &str, seen: &BTreeSet<String>) -> Result<J, String> {
    let (mut s, refs) = surface(raw, seen)?;
    let got = super::t24_chat::named(ai, &refs).await;
    let mut at = refs.iter().zip(got);
    for c in s[0]["surfaceUpdate"]["components"].as_array_mut().into_iter().flatten() {
        // get_mut으로만 찾는다(색인 `[]`로 고치면 없는 칸이 null로 생긴다)
        let items = c.pointer_mut("/component/Records/items").and_then(J::as_array_mut);
        for i in items.into_iter().flatten() {
            let Some((_, Some((name, go)))) = at.next() else { return Err("없는 기록이다".into()) };
            i["name"] = json!(name);
            i["go"] = go;
        }
    }
    Ok(s)
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
#[allow(dead_code)]
struct ShowInput {
    /// A2UI v0.8 메시지의 JSON 배열(글): surfaceUpdate(부품들) 다음 beginRendering(root)
    messages: String,
}

/// 화면 부품을 그리는 도구(`show`). 쓰기가 아니라 검사한 표면을 `out`에 모은다. `seen`은 이 답에서 read_db가 돌려준 기록
pub(super) fn show_tool(ai: &Db, seen: Arc<Mutex<BTreeSet<String>>>, out: Arc<Mutex<Vec<J>>>) -> Result<Tool, &'static str> {
    Tool::builder()
        .name("show")
        .description(r#"답에 값이 셋 이상이거나 여러 기록 · 비교를 보일 때 글과 함께 화면 부품을 그린다. 보기만 한다(단추 · 조치 없음 — 조치는 card).
messages는 A2UI v0.8 메시지의 JSON 배열 글이다. 예: [{"surfaceUpdate":{"surfaceId":"s1","components":[{"id":"root","component":{"Column":{"children":{"explicitList":["f","r"]}}}},{"id":"f","component":{"Facts":{"title":"합산","items":[{"label":"합산","value":"3,888,097원"},{"label":"한도","value":"2,000,000원"}]}}},{"id":"r","component":{"Records":{"title":"관련 거래처","items":[{"record":"dealer:`D-011`"}]}}}]}},{"beginRendering":{"surfaceId":"s1","root":"root"}}]
부품은 이 다섯만: Column{children:{explicitList:[id…]}} · Text{text:{literalString}} · Facts{title, items:[{label, value}]}(한 기록의 값들) · Table{title, columns:[…], rows:[[…]]}(여러 기록 · 비교. 첫 열은 이름) · Records{title, items:[{record:"테이블:id"}]}(이 답에서 read_db로 읽은 기록만. 이름은 앱이 붙이고 누르면 그 기록이 열린다).
값은 read_db로 읽은 것을 그대로 넣는다(지어내거나 계산하지 않는다). 글은 한국어 이름으로 쓰고 테이블 이름과 id는 record에만 쓴다. 그리지 못하면 까닭을 글로 돌려준다"#)
        .input_schema(schemars::schema_for!(ShowInput))
        .execute(ToolExecute::from_async({
            let ai = ai.clone();
            move |_, input: J| {
                let (ai, seen, out) = (ai.clone(), seen.clone(), out.clone());
                async move {
                    if out.lock().unwrap().len() >= SURFACES { return Ok("그리지 않는다: 한 답에 둘까지".to_string()); }
                    let known = seen.lock().unwrap().clone();
                    Ok(match draw(&ai, input["messages"].as_str().unwrap_or_default(), &known).await {
                        Ok(s) => { out.lock().unwrap().push(s); "그렸다. 글에서 같은 값을 줄마다 되풀이하지 않는다".to_string() }
                        Err(w) => format!("그리지 않는다: {w}"),
                    })
                }
            }
        }))
        .build()
        .map_err(|_| "응답")
}

pub async fn check(c: &Check) -> Result<()> {
    use super::t17_report::USE;
    use super::t24_chat::{events, said};
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let http = reqwest::Client::new();
    // 대화에서 카드를 청한다(고정 응답: OpenAI를 부르지 않는다). → (낸 카드들, AI의 글)
    let ask = async |role: &str, line: &str| -> Result<(Vec<J>, String)> {
        let body = json!({ "messages": [{ "role": "user", "id": "u", "parts": [{ "type": "text", "text": line }] }] });
        let res = http.post(format!("{}/api/chat", c.base())).bearer_auth(c.token(role)).json(&body).send().await?;
        ensure!(res.status() == 200, "대화 {}", res.status());
        let ev = events(&res.text().await?).0;
        Ok((ev.iter().filter(|e| e["type"] == "data-card").map(|e| e["data"].clone()).collect(), said(&ev)))
    };
    let counts = async || q1(&c.db, "RETURN [count(SELECT id FROM decision), count(SELECT id FROM ruling), count(SELECT id FROM verdict), count(SELECT id FROM task WHERE state = '완료')];", json!({})).await;
    // 사람이 실행을 누르는 것: 카드가 가리키는 경로에 사유를 실어 그 사람의 세션으로 보낸다(화면이 하는 일 그대로)
    let run = async |role: &str, card: &J, reason: Option<J>| {
        let mut body = card["run"]["body"].clone();
        if let Some(r) = reason { body["reason"] = r; }
        c.post(role, &format!("/api{}", card["run"]["path"].as_str().unwrap_or_default()), body).await
    };
    let was = USE.lock().unwrap().clone();
    *USE.lock().unwrap() = Some("fixture".into());
    let res = async {
        let before = counts().await?;
        // 승인: 영업지원의 담당이라 영업지원에게만 카드가 나온다. 사유는 선택이라 사유 없이 그려진다. 카드를 그리는 것은 아무것도 바꾸지 않는다
        let one = "2026-06-D-001";
        let (cards, text) = ask(support, &format!("카드|심사|{one}|승인")).await?;
        ensure!(cards.len() == 1 && text.contains("카드를 그렸다"), "승인 카드 {cards:?} {text}");
        let k = &cards[0];
        ensure!(k["action"] == "승인" && k["must"] == false && k["class"].is_null() && k["memo"].is_null() && k["run"] == json!({ "path": "/decide", "body": { "ids": [one], "kind": "승인" } })
            && k["name"].as_str().is_some_and(|n| n.ends_with(" · 2026-06") && !n.contains("2026-06-D")), "승인 카드의 내용 {k}");
        for role in [exec, audit, acct] {
            let (cards, text) = ask(role, &format!("카드|심사|{one}|승인")).await?;
            ensure!(cards.is_empty() && text.contains("카드를 내지 않는다: 권한"), "{role}에게는 카드가 없다 {cards:?} {text}");
        }
        ensure!(counts().await? == before, "카드를 그리는 것이 기록을 바꿨다");

        // 반려: 사유가 필수. 분류와 메모는 사람이 말한 것을 옮겨 적고, 목록에 없는 분류이면 카드를 내지 않는다. 비어 있어도 카드는 그려지지만 사유 없이는 실행되지 않는다
        let two = "2026-06-D-002";
        let (cards, _) = ask(support, &format!("카드|심사|{two}|반려")).await?;
        let blank = cards.first().cloned().unwrap_or_default();
        let class = blank["classes"][0].as_str().unwrap_or_default().to_string();
        ensure!(cards.len() == 1 && blank["must"] == true && blank["class"].is_null() && !class.is_empty(), "빈 사유의 카드 {cards:?}");
        let (cards, text) = ask(support, &format!("카드|심사|{two}|반려|없는분류|x")).await?;
        ensure!(cards.is_empty() && text.contains("카드를 내지 않는다: 분류"), "없는 분류 {cards:?} {text}");
        let (cards, _) = ask(support, &format!("카드|심사|{two}|반려|{class}|근거 서류가 없다")).await?;
        ensure!(cards.len() == 1 && cards[0]["class"] == class.as_str() && cards[0]["memo"] == "근거 서류가 없다", "옮겨 적은 사유 {cards:?}");
        ensure!(counts().await? == before, "카드가 기록을 바꿨다");
        let (code, r) = run(support, &blank, None).await?;
        ensure!(code == 400 && r == json!({ "error": "사유" }) && counts().await? == before, "사유 없는 실행 {code} {r}");
        // 사람이 카드에서 고친 사유로 실행하면 직접 한 조치와 같은 길(`/decide`)로 가고 이력에 남는다
        let (code, r) = run(support, &cards[0], Some(json!({ "class": class, "memo": "고친 메모" }))).await?;
        ensure!(code == 200 && r == json!({ "ids": [two] }), "카드의 실행 {code} {r}");
        let d = c.get(support, &format!("/api/reviews/{two}")).await?;
        let last = d["history"].as_array().and_then(|h| h.last()).cloned().unwrap_or_default();
        ensure!(d["review"]["status"] == "반려" && last["kind"] == "반려" && last["role"] == support && last["reason"] == json!({ "class": class, "memo": "고친 메모" }), "이력 {d}");
        ensure!(ask(support, &format!("카드|심사|{two}|승인")).await?.1.contains("카드를 내지 않는다: 상태"), "끝난 심사의 카드");
        // 종류와 조치가 맞지 않으면 대상
        for line in [format!("카드|지급|{one}|승인"), format!("카드|정황|계좌-D-024|승인"), "카드|심사|없는-심사|승인".to_string(), format!("카드|심사|{one}|종결")] {
            let (cards, text) = ask(support, &line).await?;
            ensure!(cards.is_empty() && (text.contains(": 대상") || text.contains(": 권한")), "틀린 카드 {line} {text}");
        }

        // 정황: 내부 감시만. 기각은 사유 필수, 요청은 선택
        let bank = "계좌-D-024";
        ensure!(ask(support, &format!("카드|정황|{bank}|기각")).await?.0.is_empty() && ask(exec, &format!("카드|정황|{bank}|요청")).await?.0.is_empty(), "정황 카드는 내부 감시에게만");
        let (cards, _) = ask(audit, &format!("카드|정황|{bank}|기각|정상|거래 내역이 맞다")).await?;
        ensure!(cards.len() == 1 && cards[0]["must"] == true && cards[0]["classes"] == json!(["부족", "정상", "기타"]) && cards[0]["name"] == "계좌 · 성일상사24", "기각 카드 {cards:?}");
        ensure!(ask(audit, &format!("카드|정황|{bank}|요청")).await?.0[0]["must"] == false, "요청은 사유가 선택");
        let (code, r) = run(audit, &cards[0], None).await?;
        ensure!(code == 400 && r == json!({ "error": "사유" }), "사유 없는 기각 {code} {r}");
        let (code, _) = run(audit, &cards[0], Some(json!({ "class": "정상", "memo": "거래 내역이 맞다" }))).await?;
        let sig = c.get(audit, &format!("/api/signals/{bank}")).await?;
        ensure!(code == 200 && sig["signal"]["state"] == "기각" && sig["history"].as_array().is_some_and(|h| h.iter().any(|x| x["kind"] == "기각" && x["role"] == audit)), "기각 뒤 {sig}");
        ensure!(ask(audit, &format!("카드|정황|{bank}|기각")).await?.1.contains("카드를 내지 않는다: 상태"), "끝난 정황");

        // 소명: 서류가 접수된 것만. 결과는 모두 사유 필수
        q1(&c.db, "CREATE clarify:t25 SET signal = signal:`동명-박상현`, dealer = dealer:`D-024`, name = '주소 · 성일상사24', state = '접수', source = '시연';
            CREATE clarify:t25b SET signal = signal:`동명-박상현`, dealer = dealer:`D-024`, name = '주소 · 대기', state = '요청', source = '시연';", json!({})).await?;
        ensure!(ask(support, "카드|소명|t25|불인정|일치").await?.0.is_empty() && ask(audit, "카드|소명|t25b|불인정").await?.1.contains("카드를 내지 않는다: 상태"), "소명 카드의 권한과 상태");
        let (cards, _) = ask(audit, "카드|소명|t25|불인정|일치|서류가 다르다").await?;
        ensure!(cards.len() == 1 && cards[0]["must"] == true && cards[0]["name"] == "주소 · 성일상사24" && cards[0]["run"] == json!({ "path": "/verdict", "body": { "id": "t25", "kind": "불인정" } }), "불인정 카드 {cards:?}");
        let (code, r) = run(audit, &cards[0], None).await?;
        ensure!(code == 400 && r == json!({ "error": "사유" }), "사유 없는 결과 {code} {r}");
        let (code, _) = run(audit, &cards[0], Some(json!({ "class": "일치", "memo": "서류가 다르다" }))).await?;
        ensure!(code == 200 && q1(&c.db, "RETURN [clarify:t25.state, count(SELECT id FROM verdict WHERE clarify = clarify:t25 AND role = '내부 감시')];", json!({})).await? == json!(["불인정", 1]), "불인정 뒤");

        // 추인: 영업임원만, 사유 필수. 한 번 누르면 묶음 전체에 남고 같은 묶음의 거부 카드는 더 나오지 않는다
        let b = "2026-01-D-011";
        let (cards, _) = ask(exec, &format!("카드|추인|{b}|추인|정상|우연히 같다")).await?;
        ensure!(cards.len() == 1 && cards[0]["name"] == "금강상사11 외 2 · 2026-01" && cards[0]["must"] == true && cards[0]["run"]["path"] == "/decide" && cards[0]["run"]["body"]["ids"].as_array().is_some_and(|i| i.len() == 1), "추인 카드 {cards:?}");
        ensure!(ask(audit, &format!("카드|추인|{b}|추인")).await?.0.is_empty() && ask(support, &format!("카드|추인|{b}|거부")).await?.0.is_empty(), "추인 카드는 영업임원에게만");
        let (code, _) = run(exec, &cards[0], Some(json!({ "class": "정상", "memo": "우연히 같다" }))).await?;
        let d = c.get(exec, &format!("/api/ratifies/{b}")).await?;
        ensure!(code == 200 && d["ratify"]["marks"].as_array().is_some_and(|m| m.iter().any(|x| x == "추인")) && d["history"].as_array().is_some_and(|h| h.len() == 1 && h[0]["role"] == exec), "추인 뒤 {d}");
        ensure!(ask(exec, &format!("카드|추인|{b}|거부")).await?.1.contains("카드를 내지 않는다: 상태"), "추인한 묶음의 거부 카드");
        // 인정: 서류가 접수된 실제 소명(20의 흐름: 정황 → 요청 → 발송 → 서류 → 판독·정리)에서 카드를 실행하면 결과가 남고 선이 제외된다
        {
            use super::t19_docs::{READ, SAMPLES, sweep_with};
            *READ.lock().unwrap() = Some("fixture".into());
            q(&c.db, "RETURN fn::signal('기타', 't25-a', 't25-a', [dealer:`D-024`, dealer:`D-011`], [], '계산');", json!({})).await?;
            ensure!(c.post(audit, "/api/rule", json!({ "id": "기타-t25-a", "kind": "요청" })).await?.0 == 200, "요청");
            let id = q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM clarify WHERE signal = signal:`기타-t25-a`)[0];", json!({})).await?.as_str().unwrap_or_default().to_string();
            ensure!(c.post(support, "/api/send", json!({ "id": id })).await?.0 == 200, "발송");
            let s = SAMPLES[0];
            let res = http.post(format!("{}/api/clarifies/{id}/docs?name={}", c.base(), s.0)).bearer_auth(c.token(support)).header("content-type", "image/png").body(s.2.to_vec()).send().await?;
            ensure!(res.status() == 200, "서류");
            for _ in 0..2 {
                q(&c.db, "UPDATE doc SET read_tried = NONE, tidy_tried = NONE;", json!({})).await?;
                sweep_with(&c.db, None, None).await?;
            }
            *READ.lock().unwrap() = None;
            ensure!(ask(support, &format!("카드|소명|{id}|인정|입증")).await?.0.is_empty(), "인정 카드는 내부 감시에게만");
            let (cards, _) = ask(audit, &format!("카드|소명|{id}|인정|입증|호실이 다르다")).await?;
            ensure!(cards.len() == 1 && cards[0]["action"] == "인정", "인정 카드 {cards:?}");
            let (code, r) = run(audit, &cards[0], Some(json!({ "class": "입증", "memo": "호실이 다르다" }))).await?;
            ensure!(code == 200 && q1(&c.db, "RETURN [type::record('clarify', $id).state, count(SELECT id FROM verdict WHERE clarify = type::record('clarify', $id) AND role = '내부 감시' AND kind = '인정')];", json!({ "id": id })).await? == json!(["인정", 1]), "인정 카드의 실행 {code} {r}");
        }
        Ok(())
    }.await;
    *USE.lock().unwrap() = was;
    res
}
