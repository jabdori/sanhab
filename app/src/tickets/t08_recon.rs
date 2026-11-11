//! 08 대사: 지급이 끝나면 회계·자금의 대사 작업이 생기고(이벤트 `t08_task`), 회계·자금이 은행 회신을 넣으면
//! 코드가 승인된 금액·등록된 계좌와 맞춰 일치 / 불일치를 남긴다(이벤트 `t08_match`, D49). 실패한 회신이면 지급이 대기로 돌아간다. 심사가 승인한 지급이 모두 일치이면 심사에 정산 표시가 붙는다.
//! 회신을 넣는 것은 역할의 세션으로 `reply`를 만드는 것이고, 누가 할 수 있는지는 DB(`fn::repliable`)가 정한다. 은행 연동은 없다(모의 처리).
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, err, refuse};
use anyhow::{Result, ensure};
use axum::extract::Path;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/08-대사.surql");

pub fn routes() -> Router<Db> {
    Router::new().route("/pays/{id}/recon", get(detail)).route("/reply", post(reply))
}

/// 지급의 대사. `want`는 승인된 금액과 등록된 계좌(맞춰 본 뒤에는 그때 굳힌 값), `reply`는 지금 지급 시도의 은행 회신, `recon`은 맞춰 본 결과(없으면 아직 회신 전이거나 실패한 회신).
/// `can`은 지금 역할이 회신을 넣을 수 있는지, `role`은 담당하는 역할, `history`는 지금까지의 회신 전부(지급 시도마다 하나, 실패한 것 포함),
/// `lines`는 이력 — 지급 표시와 회신을 일어난 순서대로. 지급 작업이 없는 지급은 404
async fn detail(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "
        LET $p = type::record('payout', $id);
        LET $c = (SELECT amount, accounts, diff, verdict, source FROM recon WHERE payout = $p)[0];
        LET $m = (SELECT stamp FROM remit WHERE payout = $p ORDER BY stamp DESC LIMIT 1)[0].stamp;
        LET $all = (SELECT amount, account, result, role, time::format(at, '%Y-%m-%d') AS at, source, stamp FROM reply WHERE payout = $p ORDER BY stamp);
        LET $pays = (SELECT '지급' AS kind, role, time::format(at, '%Y-%m-%d') AS at, source, stamp FROM remit WHERE payout = $p);
        LET $said = (SELECT '회신' AS kind, result, role, at, source, stamp FROM $all);
        RETURN {
            id: $id,
            name: $p.name,
            state: $p.state,
            role: '회계·자금',
            can: fn::repliable($p),
            want: { amount: $c.amount ?? $p.amount, accounts: $c.accounts ?? fn::paid_accounts($p) },
            reply: (SELECT amount, account, result, role, at, source FROM $all WHERE stamp > $m)[0],
            recon: IF $c THEN { diff: $c.diff, verdict: $c.verdict, source: $c.source } END,
            history: $all.{ amount, account, result, role, at, source },
            lines: (SELECT kind, result, role, at, source FROM array::concat($pays, $said) ORDER BY stamp),
        };", json!({ "id": id })).await?;
    if r["state"].is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    Ok(Json(r))
}

/// 은행 회신을 넣는다: `{ id, amount, account, result }`. 역할의 세션으로 `reply`를 만들고, 넣을 수 있는지는 DB(`fn::repliable`)가 정한다.
/// 거절의 낱말: 본문의 꼴이 틀리거나(금액은 1 이상) 없는 지급이면 400 `대상`, 회계·자금이 아니면 403 `권한`, 지급 전이거나 이미 회신한 시도이면 400 `상태`. DB의 문구는 밖으로 내보내지 않는다
async fn reply(Extension(me): Extension<Me>, Body(b): Body) -> R {
    let bad = || refuse("대상");
    let id = b["id"].as_str().filter(|i| !i.is_empty()).ok_or_else(bad)?;
    let amount = b["amount"].as_i64().filter(|a| *a >= 1).ok_or_else(bad)?;
    let account = b["account"].as_str().map(str::trim).filter(|a| !a.is_empty()).ok_or_else(bad)?;
    let result = b["result"].as_str().filter(|r| ["성공", "실패"].contains(r)).ok_or_else(bad)?;
    // 쓰기 전에 낱말을 정한다: 대상(지급 작업이 없는 지급) → 권한 → 상태. DB의 권한 규칙은 마지막 방어선으로 남는다
    let word = q1(&me.db, "
        LET $p = type::record('payout', $id);
        RETURN IF $p.state = NONE THEN '대상' ELSE IF $auth.role != '회계·자금' THEN '권한' ELSE IF !fn::repliable($p) THEN '상태' END;", json!({ "id": id })).await.map_err(|_| bad())?;
    if let Some(w) = word.as_str() {
        return Err(refuse(w));
    }
    let made = q1(&me.db, "CREATE reply SET payout = type::record('payout', $id), amount = $amount, account = $account, result = $result RETURN VALUE record::id(payout);",
        json!({ "id": id, "amount": amount, "account": account, "result": result })).await.map_err(|_| bad())?;
    if made.as_array().is_none_or(Vec::is_empty) {
        return Err(refuse("권한"));
    }
    Ok(Json(json!({ "id": made[0] })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, acct) = ("영업지원", "영업임원", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let approve = async |role: &str, id: &str| c.post(role, "/api/decide", json!({ "ids": [id], "kind": "승인" })).await;
    let pay = async |id: &str| c.post(acct, "/api/pay", json!({ "id": id })).await;
    let send = async |role: &str, id: &str, amount: i64, account: &str, result: &str| c.post(role, "/api/reply", json!({ "id": id, "amount": amount, "account": account, "result": result })).await;
    let recon = async |id: &str| c.get(acct, &format!("/api/pays/{id}/recon")).await;
    // 작업 목록에서 대사 작업만 본다(다른 종류의 작업이 있어도 상관하지 않는다)
    let tasks = async |role: &str, kind: &str| -> Result<Vec<J>> {
        let t = c.get(role, "/api/tasks").await?;
        Ok(rows(&t[kind]).into_iter().filter(|m| m["kind"] == "대사").collect())
    };
    let marks = async |id: &str| -> Result<Vec<J>> { Ok(rows(&c.get(acct, &format!("/api/reviews/{id}")).await?["review"]["marks"])) };
    let settled = async |id: &str| -> Result<bool> { Ok(marks(id).await?.contains(&json!("정산"))) };
    let (one, group) = ("2026-06-D-001", "2026-06-D-011");
    // 지급 작업의 대상(지급의 id)을 대리점 이름으로 찾는다
    let target = async |name: &str| -> Result<String> {
        let t = c.get(acct, "/api/tasks").await?;
        Ok(rows(&t["mine"]).iter().find(|m| m["kind"] == "지급" && m["name"] == name).and_then(|m| m["target"].as_str()).unwrap_or("").to_string())
    };

    // 대성상사1(988,932)의 심사를 승인. 지급 전: 대사 작업이 없고 회신을 넣을 수 없다. 대사 표에는 승인된 금액과 등록된 계좌만 있다
    ensure!(approve(support, one).await?.0 == 200, "승인");
    let id = target("대성상사1").await?;
    let account = rows(&c.get(acct, "/api/dealers/D-001").await?["registered"]).into_iter().find(|r| r["item"] == "계좌").unwrap_or_default()["value"].as_str().unwrap_or("").to_string();
    ensure!(!account.is_empty() && tasks(acct, "mine").await?.is_empty(), "지급 전의 대사 작업");
    let d = recon(&id).await?;
    ensure!(d["id"] == id.as_str() && d["name"] == "대성상사1" && d["state"] == "대기" && d["can"] == false && d["role"] == acct && d["want"] == json!({ "amount": 988_932, "accounts": [account] }) && d["reply"].is_null() && d["recon"].is_null() && d["history"] == json!([]), "지급 전의 대사 {d}");
    let state = (400, json!({ "error": "상태" }));
    ensure!(send(acct, &id, 988_932, &account, "성공").await? == state, "지급 전에 회신");
    ensure!(send(acct, "검사-없는지급", 1, "검사-계좌", "성공").await? == (400, json!({ "error": "대상" })) && send(acct, "RB-00168", 1, "검사-계좌", "성공").await? == (400, json!({ "error": "대상" })), "없는 지급에 회신");

    // 지급이 완료되면 대사 작업이 생긴다: 담당 회계·자금, 영업지원은 진행에서 본다. 고르면 같은 지급이 열린다
    ensure!(pay(&id).await?.0 == 200, "지급");
    let mine = tasks(acct, "mine").await?;
    ensure!(mine.len() == 1 && mine[0]["view"] == "지급" && mine[0]["target"] == id.as_str() && mine[0]["name"] == "대성상사1" && mine[0]["ym"] == "2026-06" && mine[0]["total"] == 988_932 && mine[0]["role"] == acct, "대사 작업 {mine:?}");
    ensure!(tasks(support, "going").await?.len() == 1 && tasks(exec, "going").await?.is_empty() && tasks(support, "mine").await?.is_empty(), "다른 역할의 대사 작업");
    ensure!(recon(&id).await?["can"] == true && c.get(support, &format!("/api/pays/{id}/recon")).await?["can"] == false, "회신을 넣을 수 있는 역할");

    // 다른 역할은 회신을 넣을 수 없다. 화면을 거치지 않고 DB에 직접 써도 마찬가지다(회계·자금도 회신 말고는 쓰지 못한다)
    for role in [support, exec, "내부 감시"] {
        ensure!(send(role, &id, 988_932, &account, "성공").await? == (403, json!({ "error": "권한" })), "{role}이 회신");
        let s = as_user(&c.db, c.token(role)).await?;
        q(&s, "CREATE reply SET payout = type::record('payout', $id), amount = 1, account = '검사-계좌', result = '성공';", json!({ "id": id })).await.ok();
    }
    let s = as_user(&c.db, c.token(acct)).await?;
    for sql in ["CREATE recon SET payout = type::record('payout', $id), verdict = '일치', diff = [], amount = 1, accounts = [], at = time::now(), source = '계산';",
        "UPDATE review SET marks += '정산';", "UPDATE task SET state = '완료';"] {
        q(&s, sql, json!({ "id": id })).await.ok();
    }
    ensure!(q1(&c.db, "RETURN [count(SELECT id FROM reply), count(SELECT id FROM recon)];", json!({})).await? == json!([0, 0]) && !settled(one).await? && tasks(acct, "mine").await?.len() == 1, "직접 쓴 뒤");
    // 본문의 꼴이 틀린 요청은 400이고 DB의 문구가 나가지 않는다
    for body in [json!({}), json!([]), json!({ "id": id, "amount": "x", "account": account, "result": "성공" }), json!({ "id": id, "amount": -1, "account": account, "result": "성공" }), json!({ "id": id, "amount": 0, "account": account, "result": "성공" }),
        json!({ "id": id, "amount": 1, "account": " ", "result": "성공" }), json!({ "id": id, "amount": 1, "account": account, "result": "검사-결과" }), json!({ "id": 5, "amount": 1, "account": account, "result": "성공" })] {
        let (code, r) = c.post(acct, "/api/reply", body.clone()).await?;
        ensure!(code == 400 && r == json!({ "error": "대상" }), "틀린 본문 {body} → {code} {r}");
    }
    // JSON이 아닌 본문, 빈 본문, Content-Type이 없는 요청도 400 대상이다
    for (body, kind) in [("검사", Some("application/json")), ("", Some("application/json")), ("{}", None)] {
        ensure!(c.raw(acct, "/api/reply", body, kind).await? == (400, json!({ "error": "대상" })), "JSON이 아닌 본문 {body:?}");
    }

    // 결과가 실패인 회신: 돈이 나가지 않았다. 지급은 대기로 돌아가고 지급 작업이 다시 담당에 놓인다. 대사 작업은 끝나고 대사(일치·불일치)는 남지 않는다
    let pays = async || -> Result<Vec<J>> { Ok(rows(&c.get(acct, "/api/tasks").await?["mine"]).into_iter().filter(|m| m["kind"] == "지급" && m["target"] == id.as_str()).collect()) };
    ensure!(pays().await?.is_empty(), "지급 뒤의 지급 작업");
    let (code, r) = send(acct, &id, 988_932, &account, "실패").await?;
    ensure!(code == 200 && r["id"] == id.as_str(), "실패한 회신 {code} {r}");
    let d = recon(&id).await?;
    let failed = json!({ "amount": 988_932, "account": account, "result": "실패", "role": acct, "at": "2026-07-01", "source": "시연" });
    ensure!(d["state"] == "대기" && d["can"] == false && d["recon"].is_null() && d["reply"]["result"] == "실패" && d["history"] == json!([failed]), "실패 뒤 {d}");
    ensure!(pays().await?.len() == 1 && tasks(acct, "mine").await?.is_empty() && !settled(one).await?, "실패 뒤의 작업");
    ensure!(c.get(acct, &format!("/api/pays/{id}")).await?["can"] == true && send(acct, &id, 988_932, &account, "성공").await? == state, "실패 뒤의 조치");
    ensure!(q1(&c.db, "RETURN count(SELECT id FROM recon);", json!({})).await? == 0, "실패한 회신에 대사가 남음");
    // 07이 보이는 것도 다시 대기다: 목록 위의 수, 대리점 상세의 지급 줄, 다른 역할에게는 조치가 없다
    let p = c.get(acct, "/api/pays").await?;
    ensure!(p["counts"]["대기"] == 1 && p["counts"]["완료"] == 0, "실패 뒤 목록 위의 수 {}", p["counts"]);
    let line = rows(&c.get(acct, "/api/dealers/D-001").await?["payouts"]).into_iter().find(|l| l["ym"] == "2026-06").unwrap_or_default();
    ensure!(line["state"] == "대기" && line["state_source"] == "시연", "실패 뒤 대리점 상세의 지급 줄 {line}");
    let p = c.get(support, &format!("/api/pays/{id}")).await?;
    ensure!(p["pay"]["state"] == "대기" && p["can"] == false, "실패 뒤 영업지원이 보는 지급 {p}");

    // 다시 지급하면 대사 작업이 다시 생기고, 승인된 금액·등록된 계좌 그대로 성공을 넣으면: 일치, 대사 작업이 끝나고, 심사에 정산 표시가 붙는다
    ensure!(pay(&id).await?.0 == 200 && tasks(acct, "mine").await?.len() == 1 && pays().await?.is_empty(), "다시 지급");
    let d = recon(&id).await?;
    ensure!(d["state"] == "완료" && d["can"] == true && d["reply"].is_null(), "다시 지급한 뒤 {d}");
    let (code, r) = send(acct, &id, 988_932, &account, "성공").await?;
    ensure!(code == 200 && r["id"] == id.as_str(), "회신 {code} {r}");
    let d = recon(&id).await?;
    ensure!(d["reply"] == json!({ "amount": 988_932, "account": account, "result": "성공", "role": acct, "at": "2026-07-01", "source": "시연" }), "회신 {}", d["reply"]);
    ensure!(d["recon"] == json!({ "diff": [], "verdict": "일치", "source": "계산" }) && d["can"] == false && d["want"] == json!({ "amount": 988_932, "accounts": [account] }), "일치 {d}");
    ensure!(d["history"] == json!([failed, { "amount": 988_932, "account": account, "result": "성공", "role": acct, "at": "2026-07-01", "source": "시연" }]), "회신의 이력 {}", d["history"]);
    // 이력은 일어난 순서대로: 지급 → 회신(실패) → 지급 → 회신(성공)
    let line = |kind: &str, result: Option<&str>| json!({ "kind": kind, "result": result, "role": acct, "at": "2026-07-01", "source": "시연" });
    ensure!(d["lines"] == json!([line("지급", None), line("회신", Some("실패")), line("지급", None), line("회신", Some("성공"))]), "이력의 순서 {}", d["lines"]);
    ensure!(tasks(acct, "mine").await?.is_empty() && tasks(support, "going").await?.is_empty() && settled(one).await?, "일치 뒤의 작업과 정산 표시");
    // 회신은 지급 시도 하나에 한 번뿐이다
    ensure!(send(acct, &id, 1, "검사-계좌", "성공").await? == state && recon(&id).await?["recon"]["verdict"] == "일치", "두 번째 회신");

    // 박상현 그룹의 심사(지급 3건): 지급이 모두 일치여야 정산이다. 하나만 일치로는 붙지 않는다
    ensure!(approve(exec, group).await?.0 == 200, "그룹의 승인");
    let mut ids = vec![];
    for (name, dealer) in [("금강상사11", "D-011"), ("대륙상사37", "D-037"), ("성일상사24", "D-024")] {
        let p = target(name).await?;
        ensure!(pay(&p).await?.0 == 200, "{name}의 지급");
        let a = recon(&p).await?["want"]["accounts"][0].as_str().unwrap_or("").to_string();
        let registered = rows(&c.get(acct, &format!("/api/dealers/{dealer}")).await?["registered"]).into_iter().find(|r| r["item"] == "계좌").unwrap_or_default();
        ensure!(!a.is_empty() && registered["value"] == a.as_str(), "{name}의 등록된 계좌 {a}");
        ids.push((p, a));
    }
    ensure!(tasks(acct, "mine").await?.len() == 3 && tasks(exec, "going").await?.len() == 3, "그룹의 대사 작업");
    // 맞춰 보는 계좌는 그 지급을 한 날의 것이다: 지급 뒤에 금강상사11의 계좌가 바뀌고 날짜가 지나도, 지급한 날의 계좌로 온 회신이 일치다
    q(&c.db, "
        UPDATE acct SET until = d'2026-07-02T00:00:00Z' WHERE in = dealer:`D-011`;
        UPSERT account:`검사-새계좌` SET value = '검사-새계좌', source = '시연';
        RELATE dealer:`D-011`->acct->account:`검사-새계좌` SET since = d'2026-07-02T00:00:00Z', via = '신고', source = '시연';
        UPDATE meta:v SET today = d'2026-07-03T00:00:00Z';", json!({})).await?;
    let now = rows(&c.get(acct, "/api/dealers/D-011").await?["registered"]).into_iter().filter(|r| r["item"] == "계좌").count();
    ensure!(now == 2, "계좌가 바뀌지 않음 {now}");
    ensure!(c.get(acct, &format!("/api/pays/{}", ids[0].0)).await?["accounts"].as_array().map(|a| a.iter().map(|x| x["value"].clone()).collect::<Vec<_>>()) == Some(vec![json!(ids[0].1)]), "지급 상세의 계좌도 지급한 날의 것");
    ensure!(recon(&ids[0].0).await?["want"]["accounts"] == json!([ids[0].1]), "지급한 날의 계좌");
    ensure!(send(acct, &ids[0].0, 1_373_515, &ids[0].1, "성공").await?.0 == 200, "회신");
    let d = recon(&ids[0].0).await?;
    ensure!(d["recon"]["verdict"] == "일치" && d["reply"]["at"] == "2026-07-03" && d["want"]["accounts"] == json!([ids[0].1]) && !settled(group).await?, "하나만 일치 {d}");
    // 결과는 성공인데 금액이 다르면 불일치(금액), 계좌가 다르면 불일치(계좌). 지급은 완료로 남고 대사 작업은 끝나며 정산 표시는 붙지 않는다
    ensure!(send(acct, &ids[1].0, 1_325_535, &ids[1].1, "성공").await?.0 == 200, "금액이 다른 회신");
    ensure!(recon(&ids[1].0).await?["recon"] == json!({ "diff": ["금액"], "verdict": "불일치", "source": "계산" }), "금액 불일치");
    ensure!(send(acct, &ids[2].0, 1_189_046, "검사-계좌", "성공").await?.0 == 200, "계좌가 다른 회신");
    let d = recon(&ids[2].0).await?;
    ensure!(d["recon"] == json!({ "diff": ["계좌"], "verdict": "불일치", "source": "계산" }) && d["state"] == "완료" && d["want"] == json!({ "amount": 1_189_046, "accounts": [ids[2].1] }) && d["reply"]["account"] == "검사-계좌", "계좌 불일치 {d}");
    ensure!(tasks(acct, "mine").await?.is_empty() && !settled(group).await? && settled(one).await?, "불일치 뒤");
    // 불일치는 기록으로 남는다(11이 정황으로 올릴 것): 어느 지급·심사의 무엇이 달랐는지
    let left = q1(&c.db, "RETURN (SELECT VALUE [record::id(payout), record::id(review), diff] FROM recon WHERE verdict = '불일치' ORDER BY payout);", json!({})).await?;
    let mut want = vec![json!([ids[1].0, group, ["금액"]]), json!([ids[2].0, group, ["계좌"]])];
    want.sort_by_key(|w| w[0].as_str().unwrap_or("").to_string());
    ensure!(left == json!(want), "불일치의 기록 {left}");
    // 지급의 상태와 원본의 값은 그대로다
    ensure!(c.get(acct, "/api/pays").await?["counts"]["완료"] == 4 && q1(&c.db, "RETURN count(SELECT id FROM payout WHERE status = '미지급');", json!({})).await? == 40, "지급의 상태가 바뀜");
    // 지급 작업이 없는 지급은 대사도 없다
    ensure!(c.call(Some(c.token(acct)), "GET", "/api/pays/RB-00168/recon", None).await?.0 == 404, "지급 작업이 없는 지급의 대사");
    Ok(())
}
