//! 부팅 시 스키마·원본 적재. 원본은 바이너리에 그대로 포함(include_str) — 수정 없이 sha256으로 추적.
//! named volume이 사라져도(크레딧 소진 일시정지) 원본에서 결정적으로 재구성된다.
use crate::db::{Db, dbname, q, q1};
use anyhow::Result;
use serde_json::{Map, Value as Json, json};
use sha2::{Digest, Sha256};

pub const SCHEMA_VERSION: i64 = 1;
const SCHEMA: &str = include_str!("../db/schema.surql");
const SEED: &str = include_str!("../db/seed.surql");

macro_rules! orig {
    ($p:literal) => {
        ($p, include_str!(concat!("../../01_참가자_배포용/04_원본데이터/", $p)))
    };
}
const AGENCY: (&str, &str) = orig!("01_corevia/master/m_agency_cv.csv");
const REBATE: (&str, &str) = orig!("01_corevia/sales/sales_rebate_payment_cv.csv");
const DEPOSIT: (&str, &str) = orig!("01_corevia/financials/fin_collection_history_cv.csv");
const POLICY: (&str, &str) = orig!("00_common/approval_authority_policy.md");

fn sha(s: &str) -> String {
    Sha256::digest(s.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// 원본 CSV: 파이프 구분, 빈 셀 없음, 해당 없음 = NONE(키 생략 → SurrealQL에서 NONE)
fn csv(text: &str) -> Vec<Json> {
    let mut lines = text.trim().lines();
    let keys: Vec<&str> = lines.next().unwrap_or_default().split('|').collect();
    lines
        .enumerate()
        .map(|(i, line)| {
            let mut o = Map::new();
            o.insert("row".into(), json!(i + 2));
            for (k, v) in keys.iter().zip(line.split('|')) {
                if v != "NONE" {
                    o.insert((*k).into(), json!(v));
                }
            }
            Json::Object(o)
        })
        .collect()
}

/// 귀속월 "2026-01" → [2026-01-01, 2026-02-01)
fn period_bounds(ym: &str) -> (String, String) {
    let (y, m): (i32, u32) = (ym[..4].parse().unwrap(), ym[5..7].parse().unwrap());
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    (format!("{y:04}-{m:02}-01T00:00:00Z"), format!("{ny:04}-{nm:02}-01T00:00:00Z"))
}

pub async fn boot(db: &Db, force: bool) -> Result<bool> {
    if !force {
        let v = q1(db, "RETURN (SELECT VALUE schema_version FROM ONLY meta:v);", json!({})).await;
        if matches!(v, Ok(Json::Number(n)) if n.as_i64() == Some(SCHEMA_VERSION)) {
            return Ok(false);
        }
    }
    let name = dbname();
    q(db, &format!("REMOVE DATABASE IF EXISTS {name}; DEFINE DATABASE {name};"), json!({})).await?;
    q(db, SCHEMA, json!({})).await?;

    let mut rebates = csv(REBATE.1);
    for r in &mut rebates {
        let (s, e) = period_bounds(r["period_ym"].as_str().unwrap_or("0000-01"));
        r["period_start"] = json!(s);
        r["period_end"] = json!(e);
    }
    let clause: String = POLICY.1.lines().skip(40).take(5).collect::<Vec<_>>().join("\n");
    let sources: Vec<Json> = [("agency", AGENCY), ("rebate", REBATE), ("deposit", DEPOSIT), ("policy", POLICY)]
        .iter()
        .map(|(k, (p, t))| json!({ "key": k, "path": p, "sha256": sha(t) }))
        .collect();
    let vars = json!({
        "files": { "agency": AGENCY.0, "rebate": REBATE.0, "deposit": DEPOSIT.0 },
        "policy": { "path": POLICY.0, "sha256": sha(POLICY.1), "clause": clause },
        "agencies": csv(AGENCY.1), "rebates": rebates, "deposits": csv(DEPOSIT.1),
        "demo_pass": std::env::var("DEMO_PASS").unwrap_or_else(|_| "demo".into()),
        "schema_version": SCHEMA_VERSION, "sources": sources,
    });
    q(db, &format!("BEGIN;\n{SEED}\nCOMMIT;"), vars).await?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    #[test]
    fn bounds_and_csv() {
        assert_eq!(super::period_bounds("2026-12").1, "2027-01-01T00:00:00Z");
        let rows = super::csv(super::REBATE.1);
        assert_eq!(rows.len(), 240);
        assert!(rows.iter().any(|r| r.get("payment_date").is_none())); // 미지급 = NONE → 키 생략
    }
}
