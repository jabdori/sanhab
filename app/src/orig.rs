//! 원본 자료. 고치지 않고 실행 파일에 그대로 포함한다. 새 원본이 필요한 티켓은 여기에 한 줄을 더하고 app/Dockerfile의 COPY에도 더한다.
use serde_json::{Map, Value as Json, json};
use sha2::{Digest, Sha256};

macro_rules! orig {
    ($p:literal) => {
        ($p, include_str!(concat!("../../01_참가자_배포용/04_원본데이터/", $p)))
    };
}
/// (원본 폴더 기준 경로, 내용)
pub const AGENCY: (&str, &str) = orig!("01_corevia/master/m_agency_cv.csv");
pub const REBATE: (&str, &str) = orig!("01_corevia/sales/sales_rebate_payment_cv.csv");
pub const DEPOSIT: (&str, &str) = orig!("01_corevia/financials/fin_collection_history_cv.csv");
pub const POLICY: (&str, &str) = orig!("00_common/approval_authority_policy.md");

pub fn sha(s: &str) -> String {
    Sha256::digest(s.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

/// 원본 CSV: 파이프 구분, 빈 셀 없음, 해당 없음 = NONE(키 생략 → SurrealQL에서 NONE). `row`는 파일의 행 번호(머리글이 1).
pub fn csv(text: &str) -> Vec<Json> {
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
