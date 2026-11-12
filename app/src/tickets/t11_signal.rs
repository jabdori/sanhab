//! 11 정황: 코드가 정해진 종류의 정황을 찾아(`detect`) 내부 감시의 작업에 올리고, 내부 감시가 요청 또는 기각한다(D18, D29).
//! 정황은 합산과 승인권자 계산에 들어가지 않고 지급을 막지 않는다. 걸린 심사에 표시가 붙을 뿐이다(DB의 이벤트가 맞춘다).
//! 요청·기각은 역할의 세션으로 `ruling`을 만드는 것이고, 누가 할 수 있는지는 DB(`fn::rulable`)가 정한다.
use super::t03_related::{groups, links, matches};
use crate::check::Check;
use crate::db::{Db, as_user, q, q1};
use crate::{Body, Me, R, err, refuse};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};
use std::collections::{BTreeMap, BTreeSet};

pub const SCHEMA: &str = include_str!("../../db/11-정황.surql");
/// 근접의 기준(D51): 지급 금액이 이 범위(이상, 미만)이면 한도 바로 아래로 보고, 같은 대리점에서 귀속월이 다른 그런 지급이 `NEAR_TIMES`건 이상이면 정황이다. **가정** — 정황의 출처도 가정이다
// ponytail: 금액을 그대로 적었다(D51의 값). 한도의 규칙 버전이 바뀌는 장면을 만들면 그 귀속월의 한도에서 계산한다
pub const NEAR: (i64, i64) = (1_800_000, 2_000_000);
pub const NEAR_TIMES: usize = 2;

/// 정해진 종류의 정황을 지금의 기록에서 빠짐없이 찾아 접수한다. 같은 대상의 같은 종류는 하나이고, 이미 있는 정황에는 새 근거만 붙는다(여러 번 불러도 같다).
/// 회수·식별자 선·지급을 넣거나 바꾸는 티켓은 끝에 이것을 부른다.
/// - 계좌: 회수의 계좌가 그 대리점의 계좌가 아니고 다른 대리점이 등록한 계좌와 같다(둘 다 회수 날짜에 유효한 등록). 대상은 회수의 대리점
/// - 동명: 두 대리점이 대표자만 일치하고 같은 그룹이 아니다(지금의 선으로. 이미 같은 그룹이면 정황이 아니다 — D51). 대상은 그 이름
/// - 근접: 한 대리점에 금액이 `NEAR` 안인 지급이 귀속월을 달리해 `NEAR_TIMES`건 이상 있다(과거의 지급도 본다. 한 번은 정황이 아니다 — D51). 대상은 그 대리점
/// (대사는 여기서 찾지 않는다. 불일치가 기록될 때 이벤트 `t11_recon`이 접수한다)
pub async fn detect(db: &Db) -> Result<()> {
    let all = links(db, None).await?;
    let gs = groups(&all);
    let reps: Vec<_> = all.iter().filter(|l| l.item == 0).collect();
    let mut names: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    for a in &reps {
        for b in reps.iter().filter(|b| b.node == a.node && b.dealer > a.dealer) {
            if matches(&all, &a.dealer, &b.dealer) == [0] && !gs.iter().any(|g| g.contains(&a.dealer) && g.contains(&b.dealer)) {
                names.entry(&a.value).or_default().extend([a.dealer.as_str(), b.dealer.as_str()]);
            }
        }
    }
    q(db, "
        FOR $d IN (SELECT id, date, (->deposit_of->dealer)[0] AS dealer, (->deposit_into->account)[0] AS account FROM deposit ORDER BY date, id) {
            -- 회수 날짜에 유효한 등록만 본다(13: 계좌가 바뀐 대리점은 바뀌기 전의 회수만 옛 계좌로, 바뀐 뒤의 회수는 새 계좌로)
            LET $own = (SELECT VALUE id FROM acct WHERE in = $d.dealer AND out = $d.account AND !excluded AND since <= $d.date AND (until = NONE OR until > $d.date));
            LET $others = (SELECT id, in FROM acct WHERE out = $d.account AND in != $d.dealer AND !excluded AND since <= $d.date AND (until = NONE OR until > $d.date) ORDER BY in);
            IF array::len($own) = 0 AND array::len($others) > 0 {
                fn::signal('계좌', record::id($d.dealer), $d.dealer.name, array::concat([$d.dealer], $others.in), array::concat([$d.id], $others.id), '계산');
            };
        };
        FOR $n IN $names {
            LET $ds = $n.dealers.map(|$d| type::record('dealer', $d));
            fn::signal('동명', $n.name, $n.name, $ds, (SELECT VALUE id FROM rep WHERE in INSIDE $ds AND out.name = $n.name AND !excluded ORDER BY in), '계산');
        };
        LET $near = (SELECT id, ym, (->payout_of->dealer)[0] AS dealer FROM payout WHERE amount >= $lo AND amount < $hi ORDER BY ym, id);
        FOR $d IN array::distinct($near.dealer) {
            LET $mine = $near[WHERE dealer = $d];
            IF array::len(array::distinct($mine.ym)) >= $times {
                fn::signal('근접', record::id($d), $d.name, [$d], $mine.id, '가정');
            };
        };",
        json!({ "names": names.iter().map(|(name, dealers)| json!({ "name": name, "dealers": dealers })).collect::<Vec<_>>(), "lo": NEAR.0, "hi": NEAR.1, "times": NEAR_TIMES }),
    ).await?;
    // 가설에서 승인권자가 올라가는 심사의 담당을 맞춘다(12)
    super::t12_hypo::raise(db).await
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/signals/{id}", get(detail)).route("/reviews/{id}/signals", get(of_review)).route("/rule", post(rule))
}

/// 정황 상세. 가운데: 제목(`signal`), 근거 표(`evidence` — 가리키는 기록의 값), 관계(`relation` — 대상이 왼쪽, 근거의 사람·주소·계좌가 가운데.
/// `lines`는 등록된 식별자 선, `hints`는 회수가 들어간 계좌처럼 등록이 아닌 이어짐), 근접의 기준(`near`).
/// 오른쪽: 담당하는 역할(`role`), 지금 역할이 할 수 있는 조치(`actions`, 요청 · 기각 순), 이력(`history`)
async fn detail(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let mut r = q1(&me.db, "
        LET $s = type::record('signal', $id);
        RETURN {
            signal: (SELECT record::id(id) AS id, kind, name, state, source, dealers.map(|$d| { id: record::id($d), name: $d.name }) AS dealers FROM $s)[0],
            evidence: ($s.evidence ?? []).map(|$e| fn::evidence($e)),
            role: '내부 감시',
            fresh: fn::fresh($s).map(|$e| <string> $e),
            delay: duration::days(fn::delay()),
            actions: IF fn::rulable($s) THEN ['요청', '기각'].map(|$k| { kind: $k, reason: $k = '기각', classes: fn::ruling_classes($k) }) ELSE [] END,
            history: (SELECT kind, role, time::format(at, '%Y-%m-%d') AS at, reason, source, stamp FROM ruling WHERE signal = $s ORDER BY stamp),
        };", json!({ "id": id })).await?;
    if r["signal"].is_null() {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    }
    // 근거 표의 순서: 회수·지급(날짜순)이 먼저, 그다음 식별자 선(대리점순)
    let mut rows: Vec<J> = r["evidence"].as_array().cloned().unwrap_or_default();
    let text = |v: &J| v.as_str().unwrap_or_default().to_string();
    rows.sort_by_key(|e| (e["at"].is_null() && e["ym"].is_null(), text(&e["at"]), text(&e["ym"]), text(&e["dealer"]["id"])));
    let dealers = r["signal"]["dealers"].as_array().cloned().unwrap_or_default();
    let mid: BTreeMap<String, &J> = rows.iter().filter(|e| e["node"].is_object()).map(|e| (text(&e["node"]["id"]), &e["node"])).collect();
    let pairs = |hint: bool| rows.iter().filter(|e| e["node"].is_object() && (e["item"] == "회수") == hint).map(|e| [text(&e["dealer"]["id"]), text(&e["node"]["id"])]).collect::<BTreeSet<_>>();
    r["relation"] = json!({ "left": dealers.iter().take(1).collect::<Vec<_>>(), "mid": mid.values().collect::<Vec<_>>(), "right": dealers.iter().skip(1).collect::<Vec<_>>(), "lines": pairs(false), "hints": pairs(true) });
    r["near"] = json!([NEAR.0, NEAR.1]);
    r["evidence"] = json!(rows);
    Ok(Json(r))
}

/// 심사의 구성원에 걸린 정황(상태를 가리지 않는다). 심사 상세의 "정황" 줄이 읽는다. 12는 여기에 가설의 결과를 붙인다
async fn of_review(Extension(me): Extension<Me>, Path(id): Path<String>) -> R {
    let r = q1(&me.db, "
        LET $r = type::record('review', $id);
        RETURN (SELECT record::id(id) AS id, kind, name, state FROM signal WHERE dealers ANYINSIDE ($r.members ?? []) ORDER BY id);", json!({ "id": id })).await?;
    Ok(Json(r))
}

/// 요청 또는 기각: `{ id, kind, reason? }`. 쓰기 전에 거절의 낱말을 정해 돌려주고(`refuse`: 대상 → 권한 → 상태 → 사유), 역할의 세션으로 `ruling`을 만든다. DB의 권한 규칙은 마지막 방어선이다
async fn rule(State(db): State<std::sync::Arc<Db>>, Extension(me): Extension<Me>, Body(b): Body) -> R {
    let bad = || refuse("대상");
    let (Some(id), Some(kind)) = (b["id"].as_str().filter(|i| !i.is_empty()), b["kind"].as_str()) else {
        return Err(bad());
    };
    let mut vars = json!({ "id": id, "kind": kind });
    if b["reason"].is_object() {
        vars["reason"] = b["reason"].clone();
    }
    let word = async || q1(&me.db, "
        LET $s = type::record('signal', $id);
        RETURN IF $s.id = NONE OR $kind NOTINSIDE ['요청', '기각'] THEN '대상'
            ELSE IF $auth.role != '내부 감시' THEN '권한'
            ELSE IF !fn::rulable($s) THEN '상태'
            ELSE IF !fn::reason($kind = '기각', fn::ruling_classes($kind), $reason) THEN '사유' END;", vars.clone()).await.map_err(|_| bad());
    if let Some(w) = word().await?.as_str() {
        return Err(refuse(w));
    }
    // DB의 거절은 오류가 아니라 빈 결과다. 만들어지지 않으면 되돌린다
    let mut res = me.db.query("
        BEGIN;
        LET $made = CREATE ruling SET signal = type::record('signal', $id), kind = $kind, reason = $reason;
        IF array::len($made) != 1 { THROW '권한' };
        COMMIT;").bind(vars.clone()).await.map_err(|_| bad())?;
    if !res.take_errors().is_empty() {
        // 그 사이에 다른 결정이 먼저 내려졌으면 다시 따진 낱말(상태)을 돌려준다. 이긴 쪽이 아직 쓰는 중일 수 있어 잠깐 기다리며 다시 본다
        for _ in 0..5 {
            if let Some(w) = word().await?.as_str() {
                return Err(refuse(w));
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        return Err(refuse("권한"));
    }
    // 정황이 닫히면 그 가설로 올라갔던 심사의 담당이 돌아온다(12)
    super::t12_hypo::raise(&db).await?;
    Ok(Json(json!({ "id": id })))
}

pub async fn seed(db: &Db) -> Result<()> {
    // 정황이 걸린 심사의 승인에는 사유가 필수다(D41. 05의 규약)
    q(db, "UPDATE act:`승인` SET need += '정황';", json!({})).await?;
    detect(db).await
}

pub async fn check(c: &Check) -> Result<()> {
    let (support, exec, audit, acct) = ("영업지원", "영업임원", "내부 감시", "회계·자금");
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    let signal = async |role: &str, id: &str| c.get(role, &format!("/api/signals/{id}")).await;
    let review = async |role: &str, id: &str| c.get(role, &format!("/api/reviews/{id}")).await;
    // 조치의 결과: 되면 "", 거절되면 그 낱말(권한은 403, 나머지는 400이고 본문은 낱말뿐이다)
    let rule = async |role: &str, id: &str, kind: &str, reason: J| {
        let (code, r) = c.post(role, "/api/rule", json!({ "id": id, "kind": kind, "reason": reason })).await?;
        let word = r["error"].as_str().unwrap_or("").to_string();
        ensure!(if code == 200 { word.is_empty() } else { r == json!({ "error": word }) && code == if word == "권한" { 403 } else { 400 } && ["권한", "사유", "상태", "대상"].contains(&word.as_str()) }, "거절의 꼴 {code} {r}");
        Ok(word)
    };
    let ids = async |kind: &str| q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM signal WHERE kind = $kind ORDER BY id);", json!({ "kind": kind })).await;
    let (bank, name, near) = ("계좌-D-024", "동명-박준호", "근접-D-011");
    let (file_d, file_p, file_a) = ("01_corevia/financials/fin_collection_history_cv.csv", "01_corevia/sales/sales_rebate_payment_cv.csv", "01_corevia/master/m_agency_cv.csv");

    // 코드가 원본 전체에서 찾은 세 종류는 이것뿐이다. 같은 대상의 같은 종류는 하나: 계좌 1(회수 2건), 동명 1, 근접 1(지급 2건).
    // 정황이 아닌 것(D51): 성일상사24↔대륙상사37은 대표자만 같지만 이미 같은 그룹, 대륙상사6의 근접 지급(4월 1,822,391)은 한 번뿐
    for (kind, id) in [("계좌", bank), ("동명", name), ("근접", near)] {
        ensure!(ids(kind).await? == json!([id]), "{kind} 정황 {}", ids(kind).await?);
    }
    ensure!(q1(&c.db, "RETURN (SELECT VALUE record::id(id) FROM payout WHERE amount >= 1800000 AND amount < 2000000 ORDER BY id);", json!({})).await? == json!(["RB-00028", "RB-00049", "RB-00053"]), "근접 지급 3건");
    // 다시 찾아도 늘지 않는다
    let count = async || q1(&c.db, "RETURN [count(SELECT id FROM signal), count(SELECT id FROM task WHERE kind = '정황'), math::sum(SELECT VALUE array::len(evidence) FROM signal)];", json!({})).await;
    let before = count().await?;
    detect(&c.db).await?;
    ensure!(count().await? == before, "다시 찾은 뒤 {before}");

    // 계좌: 성일상사24의 회수 2건(2026-03-13, 2026-04-13. 원본의 14·15행)이 들어간 계좌가 금강상사11·대륙상사37의 등록 계좌와 같다. 근거 4, 대리점 3
    let d = signal(audit, bank).await?;
    ensure!(d["signal"] == json!({ "id": bank, "kind": "계좌", "name": "계좌 · 성일상사24", "state": "접수", "source": "계산",
        "dealers": [{ "id": "D-024", "name": "성일상사24" }, { "id": "D-011", "name": "금강상사11" }, { "id": "D-037", "name": "대륙상사37" }] }), "계좌 정황 {}", d["signal"]);
    let line = |e: &J| json!([e["item"], e["dealer"]["name"], e["at"], e["ym"], e["node"]["name"], e["amount"], e["source"], e["file"], e["row"]]);
    let got: Vec<J> = rows(&d["evidence"]).iter().map(line).collect();
    let no = "국민 412-27-556310";
    ensure!(json!(got) == json!([
        ["회수", "성일상사24", "2026-03-13", null, no, 11_356_215, "원본", file_d, 14],
        ["회수", "성일상사24", "2026-04-13", null, no, 6_231_858, "원본", file_d, 15],
        ["계좌", "금강상사11", null, null, no, null, "원본", file_a, 12],
        ["계좌", "대륙상사37", null, null, no, null, "원본", file_a, 38],
    ]), "계좌 정황의 근거 {got:?}");
    // 관계: 대상(성일상사24)이 왼쪽. 등록된 선은 두 곳의 계좌, 성일상사24는 회수로만 그 계좌에 닿는다
    let rel = &d["relation"];
    let node = rel["mid"][0]["id"].clone();
    ensure!(rel["left"] == json!([{ "id": "D-024", "name": "성일상사24" }]) && rel["mid"] == json!([{ "id": node, "name": no }]) && rows(&rel["right"]).len() == 2, "계좌 정황의 관계 {rel}");
    ensure!(rel["lines"] == json!([["D-011", node], ["D-037", node]]) && rel["hints"] == json!([["D-024", node]]), "계좌 정황의 선 {rel}");

    // 동명: 한라인상사34와 금강상사41은 대표자(박준호)만 같다
    let d = signal(audit, name).await?;
    let got: Vec<J> = rows(&d["evidence"]).iter().map(line).collect();
    ensure!(d["signal"]["name"] == "동명 · 박준호" && d["signal"]["source"] == "계산" && json!(got) == json!([
        ["대표자", "한라인상사34", null, null, "박준호", null, "원본", file_a, 35],
        ["대표자", "금강상사41", null, null, "박준호", null, "원본", file_a, 42],
    ]), "동명 정황 {} {got:?}", d["signal"]);
    ensure!(rows(&d["relation"]["lines"]).len() == 2 && d["relation"]["hints"] == json!([]), "동명 정황의 관계 {}", d["relation"]);

    // 근접: 금강상사11에 1,800,000 이상 2,000,000 미만인 지급이 두 달(1월, 5월). 기준은 가정이라 출처도 가정
    let d = signal(audit, near).await?;
    let got: Vec<J> = rows(&d["evidence"]).iter().map(line).collect();
    ensure!(d["signal"]["name"] == "근접 · 금강상사11" && d["signal"]["source"] == "가정" && d["near"] == json!([1_800_000, 2_000_000]) && json!(got) == json!([
        ["지급", "금강상사11", null, "2026-01", null, 1_867_253, "원본", file_p, 50],
        ["지급", "금강상사11", null, "2026-05", null, 1_854_851, "원본", file_p, 54],
    ]) && d["relation"]["mid"] == json!([]), "근접 정황 {} {got:?}", d["signal"]);
    ensure!(c.call(Some(c.token(audit)), "GET", "/api/signals/근접-D-006", None).await?.0 == 404, "한 번뿐인 근접");

    // 내부 감시의 담당에 정황 작업이 오른다. 다른 역할의 목록에는 없다
    let mine = |t: &J| rows(&t["mine"]).into_iter().filter(|m| m["kind"] == "정황").collect::<Vec<_>>();
    let t = mine(&c.get(audit, "/api/tasks").await?);
    let row = t.iter().find(|m| m["target"] == bank).cloned().unwrap_or_default();
    ensure!(row["view"] == "정황" && row["name"] == "계좌 · 성일상사24" && row["role"] == audit && row["pick"] == false, "정황 작업 {row}");
    ensure!([name, near].iter().all(|id| t.iter().any(|m| m["target"] == *id)), "정황 작업의 목록");
    for role in [support, exec, acct] {
        let t = c.get(role, "/api/tasks").await?;
        ensure!(mine(&t).is_empty() && !rows(&t["going"]).iter().any(|m| m["kind"] == "정황"), "{role}의 정황 작업");
    }

    // 정황이 걸린 심사에 표시가 붙고 목록의 위로 온다: 박상현 그룹(계좌·근접), 한라인상사34·금강상사41(동명). 걸리지 않은 심사와 과거의 굳은 심사에는 없다(D51)
    let (group, r34, r41, plain) = ("2026-06-D-011", "2026-06-D-034", "2026-06-D-041", "2026-06-D-001");
    let marked = async |id: &str| Ok::<_, anyhow::Error>(rows(&review(support, id).await?["review"]["marks"]).contains(&json!("정황")));
    for id in [group, r34, r41] {
        ensure!(marked(id).await?, "{id}에 정황 표시가 없음");
    }
    ensure!(!marked(plain).await? && !marked("2026-06-D-006").await? && !marked("2026-01-D-011").await?, "걸리지 않은 심사의 표시");
    let t = c.get(support, "/api/tasks").await?;
    let flagged = |m: &J| rows(&m["marks"]).contains(&json!("정황"));
    let top: Vec<J> = rows(&t["mine"]).into_iter().take_while(flagged).collect();
    ensure!(top.len() == 2 && [r34, r41].iter().all(|id| top.iter().any(|m| m["target"] == *id && m["pick"] == false)), "정황이 걸린 줄이 위 {top:?}");
    // 선택 칸은 정황이 없는 줄에만 있다. 섞어 보내면 거절된다
    ensure!(rows(&t["mine"]).iter().all(|m| m["kind"] != "심사" || m["pick"] == !flagged(m)) && rows(&t["mine"]).iter().any(|m| m["target"] == plain && m["pick"] == true), "선택 칸");
    ensure!(c.post(support, "/api/decide", json!({ "ids": [plain, r34], "kind": "승인" })).await?.0 == 400 && review(support, plain).await?["review"]["status"] == "대기", "정황이 걸린 줄을 섞은 선택");
    // 심사 상세의 정황 줄: 그 심사의 구성원에 걸린 정황
    let of = c.get(exec, &format!("/api/reviews/{group}/signals")).await?;
    ensure!(of == json!([{ "id": bank, "kind": "계좌", "name": "계좌 · 성일상사24", "state": "접수" }, { "id": near, "kind": "근접", "name": "근접 · 금강상사11", "state": "접수" }]), "심사의 정황 {of}");
    ensure!(c.get(support, &format!("/api/reviews/{plain}/signals")).await? == json!([]), "정황이 없는 심사");

    // 정황이 걸린 심사의 승인에는 사유가 필수다(D41). 정황이 없는 심사는 그대로 선택이다
    let must = |d: &J| d["actions"].as_array().into_iter().flatten().find(|a| a["kind"] == "승인").map(|a| a["reason"] == true);
    ensure!(must(&review(exec, group).await?) == Some(true) && must(&review(support, r34).await?) == Some(true) && must(&review(support, plain).await?) == Some(false), "승인의 사유");
    let approve = async |role: &str, id: &str, reason: J| c.post(role, "/api/decide", json!({ "ids": [id], "kind": "승인", "reason": reason })).await;
    ensure!(approve(exec, group, J::Null).await? == (400, json!({ "error": "사유" })) && approve(support, r34, J::Null).await? == (400, json!({ "error": "사유" })), "사유 없는 승인");
    // 정황은 지급을 막지 않는다(D8): 사유를 적으면 승인되고 지급 작업이 생긴다. 굳은 심사의 표시는 그대로 남는다
    ensure!(approve(exec, group, json!({ "class": "경미" })).await?.0 == 200, "정황이 걸린 심사의 승인");
    ensure!(rows(&c.get(acct, "/api/tasks").await?["mine"]).iter().filter(|m| m["kind"] == "지급").count() == 3, "정황이 걸린 심사의 지급 작업");
    let d = review(exec, group).await?;
    ensure!(d["review"]["status"] == "승인" && marked(group).await? && d["history"][0]["reason"] == json!({ "class": "경미" }), "승인 뒤 {}", d["review"]);

    // 조치: 내부 감시에게만 요청 · 기각(이 순서). 기각은 사유 필수, 요청은 선택
    let d = signal(audit, name).await?;
    ensure!(d["actions"] == json!([{ "kind": "요청", "reason": false, "classes": ["기타"] }, { "kind": "기각", "reason": true, "classes": ["부족", "정상", "기타"] }]) && d["history"] == json!([]) && d["role"] == audit, "내부 감시의 조치 {}", d["actions"]);
    for role in [support, exec, acct] {
        ensure!(signal(role, name).await?["actions"] == json!([]), "{role}에게 조치가 보임");
        ensure!(rule(role, name, "기각", json!({ "class": "부족" })).await? == "권한" && rule(role, name, "요청", J::Null).await? == "권한", "{role}의 조치");
        // 화면을 거치지 않고 DB에 직접 써도 마찬가지다
        let s = as_user(&c.db, c.token(role)).await?;
        for sql in ["CREATE ruling SET signal = signal:`동명-박준호`, kind = '기각', reason = { class: '부족' };", "UPDATE signal SET state = '기각';", "DELETE signal; DELETE task WHERE kind = '정황';", "RETURN fn::signal('기타', 'x', 'x', [], [], '시연');"] {
            q(&s, sql, json!({})).await.ok();
        }
    }
    // 내부 감시도 결정 말고는 쓰지 못하고, 사유의 규칙은 DB가 강제한다
    let s = as_user(&c.db, c.token(audit)).await?;
    for sql in ["UPDATE signal SET state = '해소';", "CREATE ruling SET signal = signal:`동명-박준호`, kind = '기각';", "CREATE ruling SET signal = signal:`동명-박준호`, kind = '해소', reason = { class: '부족' };", "CREATE signal:`기타-x` SET kind = '기타', name = 'x', dealers = [], evidence = [], source = '시연';"] {
        q(&s, sql, json!({})).await.ok();
    }
    for reason in [J::Null, json!({}), json!({ "memo": "근거 부족" }), json!({ "class": "경미" }), json!({ "class": "기타" }), json!({ "class": "기타", "memo": " " })] {
        ensure!(rule(audit, name, "기각", reason.clone()).await? == "사유", "기각 {reason}");
    }
    ensure!(rule(audit, name, "요청", json!({ "class": "부족" })).await? == "사유", "요청의 분류");
    ensure!(rule(audit, "동명-없음", "기각", json!({ "class": "부족" })).await? == "대상" && rule(audit, name, "해소", json!({ "class": "부족" })).await? == "대상", "없는 대상");
    for body in ["", "{", r#"{"id":5,"kind":"기각"}"#, r#"{"id":"동명-박준호"}"#, "[]"] {
        ensure!(c.raw(audit, "/api/rule", body, Some("application/json")).await? == (400, json!({ "error": "대상" })), "틀린 본문 {body:?}");
    }
    ensure!(signal(audit, name).await? == d && q1(&c.db, "RETURN [count(SELECT id FROM ruling), signal:`기타-x`.id];", json!({})).await? == json!([0, null]) && count().await? == before, "거절 뒤");

    // 기각: 상태 기각, 누가·언제·사유가 남고(선 28) 작업이 끝난다. 남의 이름을 적어 보내도 DB가 채운 값이 남는다
    q(&s, "CREATE ruling SET signal = signal:`동명-박준호`, kind = '기각', reason = { class: '부족', memo: '이름 말고는 같은 것이 없음' }, role = '영업임원', by = staff:exec, at = d'2020-01-01T00:00:00Z', source = '원본';", json!({})).await?;
    let d = signal(audit, name).await?;
    let mut h = d["history"].clone();
    h[0].as_object_mut().map(|o| o.remove("stamp"));
    ensure!(d["signal"]["state"] == "기각" && d["actions"] == json!([]) && h == json!([{ "kind": "기각", "role": audit, "at": "2026-07-01", "reason": { "class": "부족", "memo": "이름 말고는 같은 것이 없음" }, "source": "시연" }]), "기각 뒤 {d}");
    ensure!(q1(&c.db, "RETURN (SELECT VALUE by FROM ruling)[0] = staff:audit;", json!({})).await? == true, "결정한 직원");
    ensure!(!mine(&c.get(audit, "/api/tasks").await?).iter().any(|m| m["target"] == name), "기각 뒤의 작업");
    ensure!(rule(audit, name, "요청", J::Null).await? == "상태" && rule(audit, name, "기각", json!({ "class": "부족" })).await? == "상태", "기각된 정황의 조치");
    // 기각되면 대기인 심사의 표시가 떨어지고 승인의 사유가 다시 선택이 된다. 굳은 심사(정황이 걸린 채 승인된 것)는 그대로다
    ensure!(!marked(r34).await? && !marked(r41).await? && marked(group).await?, "기각 뒤의 표시");
    ensure!(must(&review(support, r34).await?) == Some(false) && approve(support, r34, J::Null).await?.0 == 200, "기각 뒤의 승인");
    // 근거가 그대로이면 다시 찾아도 기각된 채다(새 근거로 다시 올리는 것은 15)
    detect(&c.db).await?;
    ensure!(signal(audit, name).await?["signal"]["state"] == "기각" && !marked(r41).await?, "다시 찾은 뒤의 기각");

    // 요청(화면의 길): 사유 없이도 된다. 상태 요청, 작업이 끝난다. 17·18은 이 결정(ruling)에 뒤따를 일을 건다
    ensure!(rule(audit, bank, "요청", J::Null).await? == "", "요청");
    let d = signal(audit, bank).await?;
    ensure!(d["signal"]["state"] == "요청" && d["actions"] == json!([]) && d["history"][0]["kind"] == "요청" && d["history"][0]["reason"].is_null(), "요청 뒤 {d}");
    ensure!(!mine(&c.get(audit, "/api/tasks").await?).iter().any(|m| m["target"] == bank), "요청 뒤의 작업");
    // 요청인 정황은 열려 있다: 구성이 바뀌어 새로 만들어진 심사에도 표시가 따라온다.
    // 한라인상사3이 성일상사24의 주소·계좌를 함께 쓰게 되면(6월 1일) 박상현 그룹에 들고, 그 심사에 계좌 정황이 걸린다
    ensure!(!marked("2026-06-D-003").await?, "바뀌기 전");
    q(&c.db, "
        LET $e = { since: d'2026-06-01T00:00:00Z', via: '신고', source: '시연' };
        RELATE dealer:`D-003`->addr->(SELECT VALUE out FROM addr WHERE in = dealer:`D-024`) CONTENT $e;
        RELATE dealer:`D-003`->acct->(SELECT VALUE out FROM acct WHERE in = dealer:`D-024`) CONTENT $e;", json!({})).await?;
    super::t04_review::recalc(&c.db).await?;
    let d = review(support, "2026-06-D-003").await?;
    ensure!(rows(&d["members"]).len() == 4 && d["review"]["status"] == "대기" && marked("2026-06-D-003").await?, "구성이 바뀐 심사의 표시 {}", d["review"]);
    // 같은 정황에 결정 둘을 동시에 보내면 하나만 된다
    let both = tokio::join!(rule(audit, near, "기각", json!({ "class": "정상" })), rule(audit, near, "요청", json!({ "class": "기타", "memo": "확인" })));
    let mut got = [both.0?, both.1?];
    got.sort();
    ensure!(got == ["", "상태"] && rows(&signal(audit, near).await?["history"]).len() == 1, "동시에 보낸 결정 {got:?}");

    // 대사의 불일치는 대사 정황으로 접수된다(D45, D49): 대성상사1의 6월 지급(988,932)에 금액이 다른 회신이 들어오면
    ensure!(approve(support, plain, J::Null).await?.0 == 200 && c.post(acct, "/api/pay", json!({ "id": "RB-00006" })).await?.0 == 200, "승인과 지급");
    let own = q1(&c.db, "RETURN (SELECT VALUE out.value FROM acct WHERE in = dealer:`D-001`)[0];", json!({})).await?;
    ensure!(ids("대사").await? == json!([]), "회신 전의 대사 정황");
    ensure!(c.post(acct, "/api/reply", json!({ "id": "RB-00006", "amount": 900_000, "account": own, "result": "성공" })).await?.0 == 200, "회신");
    let d = signal(audit, "대사-D-001").await?;
    ensure!(ids("대사").await? == json!(["대사-D-001"]) && d["signal"]["name"] == "대사 · 대성상사1" && d["signal"]["state"] == "접수" && d["signal"]["source"] == "계산" && rows(&d["actions"]).len() == 2, "대사 정황 {}", d["signal"]);
    let e = &d["evidence"][0];
    ensure!(rows(&d["evidence"]).len() == 1 && e["item"] == "대사" && e["dealer"]["name"] == "대성상사1" && e["ym"] == "2026-06" && e["value"] == "금액" && e["source"] == "계산"
        && e["want"] == json!({ "amount": 988_932, "accounts": [own] }) && e["got"] == json!({ "amount": 900_000, "account": own }), "대사 정황의 근거 {e}");
    ensure!(mine(&c.get(audit, "/api/tasks").await?).iter().filter(|m| m["target"] == "대사-D-001").count() == 1, "대사 정황의 작업");
    // 일치하는 회신은 정황이 아니다
    let pay = "RB-00168";
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200, "한라인상사34의 지급");
    let (amount, account) = (q1(&c.db, "RETURN payout:`RB-00168`.amount;", json!({})).await?, q1(&c.db, "RETURN (SELECT VALUE out.value FROM acct WHERE in = dealer:`D-034`)[0];", json!({})).await?);
    ensure!(c.post(acct, "/api/reply", json!({ "id": pay, "amount": amount, "account": account, "result": "성공" })).await?.0 == 200 && ids("대사").await? == json!(["대사-D-001"]), "일치하는 회신");
    Ok(())
}
