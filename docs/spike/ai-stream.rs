use aisdk::core::utils::step_count_is;
use aisdk::core::{LanguageModelRequest, LanguageModelStreamChunkType, Message, Tool};
use aisdk::integrations::vercel_aisdk_ui::VercelUIRequest;
use aisdk::macros::tool;
use aisdk::providers::openai::OpenAI;
use futures::StreamExt;

/// 관련자 그룹의 귀속월 합산액과 필요한 승인권자를 조회한다.
#[tool]
fn group_total(agency_name: String, period: String) -> Tool {
    // 시험용 고정 응답. 실제 구현에서는 DB를 조회한다.
    Ok(serde_json::json!({
        "agency": agency_name, "period": period,
        "members": ["금강상사11", "성일상사24", "대륙상사37"],
        "total": 3888097, "limit": 2000000, "required_approver": "영업임원"
    }).to_string())
}

const SYSTEM: &str = "너는 판매장려금 심사 도우미다. 금액과 승인권자는 반드시 group_total 도구로 조회해서 답한다. 한국어로 두 문장 이내로 답한다.";

fn model() -> OpenAI<aisdk::core::DynamicModel> {
    OpenAI::model_name(std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-6.1-terra".into()))
}

/// aisdk의 핵심 스트림을 AI SDK UI 메시지 스트림 형식으로 직접 옮긴다(내장 변환기는 모르는 이벤트를 error로 내보낸다).
async fn chat(axum::Json(req): axum::Json<VercelUIRequest>) -> impl axum::response::IntoResponse {
    use axum::response::sse::{Event, Sse};
    use serde_json::json;
    let messages: Vec<Message> = req.into();
    let resp = LanguageModelRequest::builder()
        .model(model()).system(SYSTEM).messages(messages)
        .with_tool(group_total()).stop_when(step_count_is(5))
        .build().stream_text().await.expect("stream");
    let mut inner = resp.stream;
    let out = async_stream::stream! {
        let ev = |v: serde_json::Value| Ok::<_, std::convert::Infallible>(Event::default().data(v.to_string()));
        yield ev(json!({"type":"start","messageId":"msg-1"}));
        let mut text_open = false; let mut n = 0;
        while let Some(c) = inner.next().await {
            match c {
                LanguageModelStreamChunkType::ToolCallAvailable(i) =>
                    yield ev(json!({"type":"tool-input-available","toolCallId":i.tool.id,"toolName":i.tool.name,"input":i.input})),
                LanguageModelStreamChunkType::ToolCallEnd(i) => {
                    let out = match i.output { Ok(v) => v, Err(e) => json!({"error": format!("{e:?}")}) };
                    yield ev(json!({"type":"tool-output-available","toolCallId":i.tool.id,"output":out}));
                }
                LanguageModelStreamChunkType::TextDelta(t) => {
                    if !text_open { n += 1; text_open = true; yield ev(json!({"type":"text-start","id":format!("t{n}")})); }
                    yield ev(json!({"type":"text-delta","id":format!("t{n}"),"delta":t}));
                }
                LanguageModelStreamChunkType::TextEnd => if text_open { text_open = false; yield ev(json!({"type":"text-end","id":format!("t{n}")})); },
                LanguageModelStreamChunkType::Failed(e) => yield ev(json!({"type":"error","errorText":e})),
                _ => {}
            }
        }
        if text_open { yield ev(json!({"type":"text-end","id":format!("t{n}")})); }
        yield ev(json!({"type":"finish"}));
        yield Ok(Event::default().data("[DONE]"));
    };
    ([("x-vercel-ai-ui-message-stream", "v1")], Sse::new(out))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::args().nth(1).as_deref() == Some("serve") {
        let app = axum::Router::new().route("/api/chat", axum::routing::post(chat));
        let l = tokio::net::TcpListener::bind("127.0.0.1:3998").await?;
        println!("listening 3998");
        axum::serve(l, app).await?;
        return Ok(());
    }
    let t0 = std::time::Instant::now();
    let response = LanguageModelRequest::builder()
        .model(model())
        .system(SYSTEM)
        .prompt("성일상사24의 2026-06 심사는 누가 승인해야 해?")
        .with_tool(group_total())
        .stop_when(step_count_is(5))
        .build()
        .stream_text()
        .await?;
    let mut stream = response.stream;
    let (mut n_text, mut first) = (0, None);
    while let Some(chunk) = stream.next().await {
        match chunk {
            LanguageModelStreamChunkType::ToolCallStart(d) => println!("[{:>5}ms] 도구 호출 시작 name={}", t0.elapsed().as_millis(), d.name),
            LanguageModelStreamChunkType::ToolCallDelta { delta, .. } => println!("[{:>5}ms] 도구 인자 조각 {delta}", t0.elapsed().as_millis()),
            LanguageModelStreamChunkType::ToolCallEnd(i) => println!("[{:>5}ms] 도구 결과 name={} output={:?}", t0.elapsed().as_millis(), i.tool.name, i.output),
            LanguageModelStreamChunkType::TextDelta(t) => { n_text += 1; if first.is_none() { first = Some(t0.elapsed().as_millis()); } print!("{t}"); }
            other => { let s = format!("{other:?}"); println!("[{:>5}ms] {}", t0.elapsed().as_millis(), &s[..s.len().min(120)]); }
        }
    }
    println!("\n글자 조각 {n_text}개, 첫 글자까지 {:?}ms, 전체 {}ms", first, t0.elapsed().as_millis());
    Ok(())
}
