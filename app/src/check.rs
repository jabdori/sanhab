//! 자동 검사의 도구. 검사는 화면과 같은 길(HTTP)로 한다: 실제 서버를 빈 포트에 띄우고 역할의 토큰으로 부른다.
use crate::db::Db;
use anyhow::{Context, Result, ensure};
use serde_json::{Value as J, json};
use std::collections::HashMap;

pub struct Check {
    /// root 세션. 검사 준비(시계 돌리기 등)에만 쓴다
    pub db: Db,
    base: String,
    http: reqwest::Client,
    tokens: HashMap<String, String>,
}

impl Check {
    pub async fn start(db: Db) -> Result<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let base = format!("http://{}", listener.local_addr()?);
        let app = crate::app(std::sync::Arc::new(db.clone()));
        tokio::spawn(async move { axum::serve(listener, app).await });
        Ok(Self { db, base, http: reqwest::Client::new(), tokens: HashMap::new() })
    }

    /// 원본 상태로 되돌리고 네 역할로 다시 접속한다
    pub async fn reset(&mut self) -> Result<()> {
        crate::boot(&self.db, true).await?;
        let (code, r) = self.call(None, "POST", "/api/enter", Some(json!({ "pass": crate::demo_pass() }))).await?;
        ensure!(code == 200, "접속 실패 {code}");
        self.tokens = roles(&r);
        Ok(())
    }

    /// 검사 서버의 주소(JSON이 아닌 본문을 보낼 때)
    /// 응답 시간: 역할별 작업 목록, 심사 상세, 접속 요청이 각각 1초 안에 온다(작은 파드에서 요청마다 몇 초씩 밀린 일이 있었다)
    pub async fn latency(&self) -> Result<()> {
        use std::time::{Duration, Instant};
        let slow = |what: String, t: Instant| -> Result<()> { ensure!(t.elapsed() < Duration::from_secs(1), "{what} {:?}", t.elapsed()); Ok(()) };
        for (_, role) in crate::tickets::ROLES {
            let t = Instant::now();
            self.get(role, "/api/tasks").await?;
            slow(format!("{role}의 작업 목록"), t)?;
        }
        let t = Instant::now();
        self.get("영업지원", "/api/reviews/2026-06-D-001").await?;
        slow("심사 상세".into(), t)?;
        let t = Instant::now();
        let (code, _) = self.call(None, "POST", "/api/enter", Some(json!({ "pass": crate::demo_pass() }))).await?;
        ensure!(code == 200, "접속 → {code}");
        slow("접속 요청".into(), t)
    }

    pub fn base(&self) -> &str { &self.base }

    pub fn token(&self, role: &str) -> &str {
        self.tokens.get(role).map_or("", String::as_str)
    }

    /// (상태 코드, 본문). `bearer`가 None이면 토큰 없이 부른다
    pub async fn call(&self, bearer: Option<&str>, method: &str, path: &str, body: Option<J>) -> Result<(u16, J)> {
        let mut req = self.http.request(method.parse()?, format!("{}{path}", self.base));
        if let Some(t) = bearer {
            req = req.bearer_auth(t);
        }
        if let Some(b) = body {
            req = req.header("content-type", "application/json").body(b.to_string());
        }
        let res = req.send().await?;
        let code = res.status().as_u16();
        let text = res.text().await?;
        Ok((code, serde_json::from_str(&text).unwrap_or(J::String(text))))
    }

    /// 본문을 글자 그대로 보낸다(JSON이 아닌 본문, `Content-Type` 없는 요청의 검사)
    pub async fn raw(&self, role: &str, path: &str, body: &str, kind: Option<&str>) -> Result<(u16, J)> {
        let mut req = self.http.post(format!("{}{path}", self.base)).bearer_auth(self.token(role)).body(body.to_string());
        if let Some(k) = kind {
            req = req.header("content-type", k);
        }
        let res = req.send().await?;
        let code = res.status().as_u16();
        let text = res.text().await?;
        Ok((code, serde_json::from_str(&text).unwrap_or(J::String(text))))
    }

    /// 역할로 조회. 200이 아니면 실패
    pub async fn get(&self, role: &str, path: &str) -> Result<J> {
        let (code, r) = self.call(Some(self.token(role)), "GET", path, None).await?;
        ensure!(code == 200, "GET {path} ({role}) → {code} {r}");
        Ok(r)
    }

    /// 역할로 조치. 거절도 검사할 수 있게 상태 코드를 함께 준다
    pub async fn post(&self, role: &str, path: &str, body: J) -> Result<(u16, J)> {
        self.call(Some(self.token(role)), "POST", path, Some(body)).await.with_context(|| format!("POST {path}"))
    }
}

/// 접속 응답 `{ roles: [{ role, token }] }` → 역할 → 토큰
pub fn roles(r: &J) -> HashMap<String, String> {
    r["roles"].as_array().into_iter().flatten()
        .filter_map(|x| Some((x["role"].as_str()?.to_string(), x["token"].as_str()?.to_string())))
        .collect()
}
