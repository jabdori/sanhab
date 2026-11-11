//! 시연 시나리오 + DB 권한 자기검증. `w07 check` (DB를 원본 기준으로 재적재함)
use crate::db::{Db, as_user, q, q1, signin};
use crate::seed::boot;
use anyhow::{Result, ensure};
use serde_json::{Value as J, json};

fn len(v: &J) -> usize { v.as_array().map_or(0, Vec::len) }

async fn approve(db: &Db, token: &str, key: &str) -> Result<usize> {
    let s = as_user(db, token).await?;
    Ok(len(&q1(&s, "CREATE approval SET decision = type::record('decision', $key);", json!({ "key": key })).await?))
}

pub async fn run(db: &Db) -> Result<()> {
    boot(db, true).await?;
    let pass = std::env::var("DEMO_PASS").unwrap_or_else(|_| "demo".into());
    let (support, exec) = (signin(db, "support", &pass).await?, signin(db, "exec", &pass).await?);
    let one = |sql: &'static str| q1(db, sql, json!({}));

    // 원본 발견: D-011 그룹 1~5월 15건은 알 수 있었던 위반, 그룹 합산은 이전 분석과 일치
    ensure!(len(&one("SELECT VALUE id FROM decision WHERE knowledge = 'control_violation';").await?) == 15);
    ensure!(one("RETURN decision:`RB-00049`.group_total;").await? == json!(4870186));

    // ① 정상: 단독 거래처 6월분, 영업지원팀 전결 → 지급 Work
    let n = one("RETURN (SELECT VALUE record::id(id) FROM decision WHERE acceptance = 'pending' AND fn::check(id, time::now()).required = '영업지원팀'
        AND array::len(fn::check(id, time::now()).blockers) = 0 LIMIT 1)[0];").await?;
    let n = n.as_str().unwrap_or_default().to_string();
    ensure!(approve(db, &support, &n).await? == 1, "정상 승인 실패");
    ensure!(q1(db, "SELECT VALUE kind FROM work WHERE target = type::record('decision', $k);", json!({ "k": n })).await? == json!(["payment"]));

    // ② 그룹 합산: D-011 6월분(개별 137만, 그룹 389만) — 영업지원팀 침묵 거부, 영업임원 승인
    ensure!(approve(db, &support, "RB-00054").await? == 0, "영업지원팀이 한도 초과를 승인함");
    ensure!(approve(db, &exec, "RB-00054").await? == 1);
    // 시스템(root) 세션은 $auth가 없어 승인 레코드를 만들 수 없음
    ensure!(q(db, "CREATE approval SET decision = decision:`RB-00180`;", json!({})).await.is_err(), "root가 승인함");

    // ③ 정보 부족: D-024 계좌 불일치 증빙 미해결 → 임원도 거부, 해소 후 승인
    ensure!(approve(db, &exec, "RB-00120").await? == 0, "증빙 미해결인데 승인됨");
    one("UPDATE work SET state = 'settled' WHERE kind = 'evidence_check' AND target = agency:`D-024`;").await?;
    ensure!(approve(db, &exec, "RB-00120").await? == 1);

    // ④ 조건 변경: D-034 주소가 D-041과 같아짐 — 이사일 3/1, 신고(인지) 5/10
    one("fn::change_ident(agency:`D-034`, 'address', '고양시 중앙로 128', d'2026-03-01', d'2026-05-10', { kind: 'assumption', note: '시연용 조건 변경' });").await?;
    let k = one("SELECT period, knowledge FROM decision WHERE agency IN [agency:`D-034`, agency:`D-041`] AND acceptance = 'stale' ORDER BY period;").await?;
    println!("D-034/041 재판정: {k}");
    let k = k.as_array().cloned().unwrap_or_default();
    ensure!(!k.is_empty() && k.iter().all(|x| x["period"].as_str() >= Some("2026-03")), "이사일 이전 월이 재판정됨(과잉 stale)");
    ensure!(k.iter().any(|x| x["knowledge"] == "outcome_error"));

    // ⑤ 정정의 정정: 소명으로 이사일 4/15 → 3월분 재판정 해소
    one("CREATE vindication CONTENT { edge: (SELECT VALUE id FROM related WHERE in = agency:`D-034` OR out = agency:`D-034`)[0],
        effect: 'correct_valid_from', valid_from: d'2026-04-15', evidence: '임대차계약서(가정)' };").await?;
    let mar = one("SELECT VALUE acceptance FROM decision WHERE agency IN [agency:`D-034`, agency:`D-041`] AND period = '2026-03';").await?;
    ensure!(mar.as_array().is_some_and(|a| a.iter().all(|x| x == "accepted")), "소명 후에도 3월분 stale");

    // 역추적: 위반 보고 Work가 왜 생겼나 → 판정 → 관련자 엣지
    let why = one("SELECT VALUE @.{..+collect}(<-caused<-?) FROM ONLY (SELECT VALUE id FROM work WHERE kind = 'violation_report' LIMIT 1)[0];").await?;
    let why: Vec<&str> = why.as_array().map(|a| a.iter().filter_map(J::as_str).collect()).unwrap_or_default();
    ensure!(why.iter().any(|x| x.starts_with("decision:")) && why.iter().any(|x| x.starts_with("related:")), "역추적 실패: {why:?}");

    println!("check OK");
    Ok(())
}
