//! 22 규정: 메뉴 "규정"이 보이는 것 — 조항(원문과 문서 위치), 규칙 버전(시행 기간, 이전 버전), 가정(스펙에서 가정이라고 적힌 것).
//! 조항과 규칙은 04의 테이블을 읽기만 한다. 가정은 저장하지 않고 스펙 문서에서 직접 모은다(스펙이 바뀌면 목록도 따라 바뀐다).
use crate::check::Check;
use crate::db::{Db, q, q1};
use crate::{Me, R};
use anyhow::{Result, ensure};
use axum::routing::get;
use axum::{Extension, Json, Router};
use serde_json::{Value as J, json};

pub const SCHEMA: &str = include_str!("../../db/22-규정.surql");
/// 가정의 원문이 있는 문서(저장소 기준 경로, 내용)
const SPEC: (&str, &str) = ("docs/graph-spec.md", include_str!("../../../docs/graph-spec.md"));

/// 가정이 쓰인 곳: 결정 번호 → 화면의 낱말. 여기에 없는 가정(D34)은 만들지 않은 것이다
/// D46은 그 결정의 "숫자가 기대는 가정" 표의 줄들이다(1~5월의 재검토가 기대는 것)
const USED: &[(&str, &[&str])] = &[
    ("D7", &["심사", "재검토"]),
    ("D8", &["정황"]),
    ("D12", &["소명"]),
    ("D14", &["심사", "재검토"]),
    ("D17", &["소명"]),
    ("D19", &["심사", "재검토"]),
    ("D20", &["추인"]),
    ("D30", &["정황"]),
    ("D32", &["소명"]),
    ("D46", &["재검토"]),
    ("D47", &["심사", "재검토"]),
    ("D49", &["대사"]),
    ("D51", &["정황"]),
];

/// 쓰인 곳으로 가는 길: (낱말, 열 대상의 kind, 그 가정이 쓰인 기록 하나의 id를 돌려주는 식). 여기에 없는 낱말은 화면에 글자로만 보인다.
/// 자기 화면을 만든 티켓이 한 줄을 더한다(기록이 아직 없으면 NONE이 되어 글자로만 보인다)
const WAYS: &[(&str, &str, &str)] = &[
    ("심사", "심사", "(SELECT record::id(id) AS id, total FROM review WHERE source != '원본' ORDER BY total DESC, id LIMIT 1)[0].id"),
    ("재검토", "심사", "(SELECT record::id(id) AS id, ym FROM review WHERE marks CONTAINS '재검토' ORDER BY ym DESC, id LIMIT 1)[0].id"),
    // 대사(08): 가장 최근에 회신을 맞춰 본 지급. 지급 상세의 "대사" 표가 열린다
    ("대사", "지급", "(SELECT record::id(payout) AS id, at FROM recon ORDER BY at DESC, id LIMIT 1)[0].id"),
    // 정황(11): 기준이 가정인 정황(근접)이 먼저 — 출처가 가정인 것이 앞에 온다
    ("정황", "정황", "(SELECT record::id(id) AS id, source FROM signal ORDER BY source, id LIMIT 1)[0].id"),
    // 소명(18): 가장 먼저 열린 소명(만든 때 순). 서류 목록(D17)과 기한(D32)이 보인다
    ("소명", "소명", "(SELECT record::id(id) AS id FROM clarify ORDER BY born, id LIMIT 1)[0].id"),
];

/// 가정의 표(D46)의 머리글. 이 줄 아래의 표에서 줄마다 가정 하나를 모은다
const TABLE: &str = "| 숫자가 기대는 가정 |";

/// 스펙에서 가정이라고 적힌 것 전부. 줄의 글자 그대로이고(굵게 표시와 표의 바깥 선만 뗀다) 문서의 행을 함께 가진다.
/// ① **가정**으로 표시된 줄마다 하나: 그 줄이 속한 결정의 번호와 제목
/// ② "숫자가 기대는 가정" 표의 줄마다 하나: 제목은 첫 칸. 근거가 "가정 아님"인 줄과, 근거가 ①에서 이미 모은 결정 번호뿐인 줄은 뺀다
fn assumes() -> Vec<J> {
    marked("**가정**", "가정")
}

/// 스펙에서 `**시연**`으로 표시된 줄(D58의 시연 호실처럼 원본에 없어 넣은 값): 화면의 출처는 합성. 모양은 가정과 같다(표의 줄은 없다)
fn synths() -> Vec<J> {
    marked("**시연**", "합성")
}

/// 결정(`### Dn. 제목`)의 본문: 제목 줄 다음부터 다음 제목 앞까지, 굵은 표시를 뗀 글 그대로. 출처 표지의 설명 칸이 "왜"로 보인다
fn body(id: &str) -> String {
    let mut out = vec![];
    let mut on = false;
    for line in SPEC.1.lines() {
        if line.starts_with('#') {
            on = line.strip_prefix("### ").and_then(|h| h.split_once(". ")).is_some_and(|h| h.0 == id);
        } else if on {
            out.push(line.replace("**", ""));
        }
    }
    out.join("\n").trim().to_string()
}

fn marked(mark: &str, source: &str) -> Vec<J> {
    let mut head = ("", "");
    let mut table = false;
    let (mut out, mut rows) = (vec![], vec![]);
    for (i, line) in SPEC.1.lines().enumerate() {
        let one = |id: &str, title: &str, text: &str| {
            let used = USED.iter().find(|u| u.0 == id).map_or(&[][..], |u| u.1);
            json!({ "id": id, "title": title, "text": text, "body": body(id), "file": SPEC.0, "row": i + 1, "used": used, "source": source, "since": super::t01_base::START })
        };
        if let Some(h) = line.strip_prefix("### ").and_then(|h| h.split_once(". ")) {
            head = h;
        } else if line.contains(mark) {
            out.push(one(head.0, head.1, &line.replace("**", "")));
        } else if mark == "**가정**" && line.starts_with(TABLE) {
            table = true;
        } else if table && line.starts_with('|') {
            let cells: Vec<&str> = line.trim_matches('|').split('|').map(str::trim).collect();
            if !cells[0].starts_with('-') {
                rows.push((cells.get(1).copied().unwrap_or(""), one(head.0, cells[0], line.trim_matches('|').trim())));
            }
        } else {
            table = false;
        }
    }
    let rows: Vec<J> = rows.into_iter().filter(|(why, _)| !why.contains("가정 아님") && !out.iter().any(|a| a["id"] == *why)).map(|r| r.1).collect();
    out.extend(rows);
    // 스펙의 행 순서(D46의 표 줄이 D47 앞에 온다)
    out.sort_by_key(|a| a["row"].as_u64());
    out
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/rules", get(rules))
}

/// 규정: 조항(`clauses`), 규칙 버전(`rules`: 시행 기간 `since`·`until`, 이전 버전 `prev`), 가정(`assumes`: `used`는 쓰인 곳 — `id`가 있으면 그 기록으로 갈 수 있다, `body`는 그 결정의 본문, `since`는 적용 시점 — 기준일부터),
/// 합성(`synths`: 스펙이 시연으로 넣는다고 적은 값. 모양은 가정과 같다). 화면의 출처 표지가 설명 칸을 여기서 채운다
async fn rules(Extension(me): Extension<Me>) -> R {
    let day = |f: &str| format!("IF {f} THEN time::format({f}, '%Y-%m-%d') END AS {f}");
    let mut r = q1(&me.db, &format!("
        RETURN {{
            clauses: (SELECT record::id(id) AS id, title, doc.path AS file, doc.sha AS sha, first, last, text, source FROM clause ORDER BY first),
            rules: (SELECT record::id(id) AS id, name, ver, value, record::id(clause) AS clause, {}, {}, IF prev THEN {{ name: prev.name, ver: prev.ver }} END AS prev, source FROM rule ORDER BY name, ver),
            ways: [{}],
        }};", day("since"), day("until"), WAYS.iter().map(|w| w.2).collect::<Vec<_>>().join(", ")), json!({})).await?;
    let ways = r["ways"].take();
    let mut list = assumes();
    for a in &mut list {
        let used: Vec<J> = a["used"].as_array().into_iter().flatten().map(|view| {
            let way = WAYS.iter().position(|w| view == w.0);
            json!({ "view": view, "kind": way.map(|i| WAYS[i].1), "id": way.map(|i| &ways[i]).filter(|id| id.is_string()) })
        }).collect();
        a["used"] = json!(used);
    }
    r.as_object_mut().map(|o| o.remove("ways"));
    r["assumes"] = json!(list);
    r["synths"] = json!(synths());
    Ok(Json(r))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let rows = |v: &J| v.as_array().cloned().unwrap_or_default();
    // 규정은 네 역할 모두에게 같게 보인다
    let d = c.get("영업임원", "/api/rules").await?;
    for role in ["영업지원", "내부 감시", "회계·자금"] {
        // 5단계: 조항 · 규칙은 같다. 가정의 예(`assumes[].used[].id`)는 그 역할이 읽을 수 있는 기록일 때만 있다
        let g = c.get(role, "/api/rules").await?;
        ensure!(g["clauses"] == d["clauses"] && g["rules"] == d["rules"] && g["synths"] == d["synths"] && rows(&g["assumes"]).len() == rows(&d["assumes"]).len(), "{role}의 규정");
    }

    // 조항: 규정 문서의 41~45행 원문 그대로, 출처 원본
    ensure!(rows(&d["clauses"]).len() == 1, "조항 수 {}", d["clauses"]);
    let cl = &d["clauses"][0];
    let text = cl["text"].as_str().unwrap_or("");
    ensure!(cl["id"] == "지급한도" && cl["title"] == "판매장려금 지급 한도" && cl["file"] == "00_common/approval_authority_policy.md" && cl["first"] == 41 && cl["last"] == 45 && cl["source"] == "원본", "조항 {cl}");
    ensure!(cl["sha"].as_str().is_some_and(|s| s.len() == 64) && text.starts_with("## 판매장려금 지급 한도\n- 거래처별 **월 지급액 2백만원 이하**는 영업지원팀 전결.") && text.ends_with("관련자 그룹 여부를 확인한다."), "조항의 원문 {cl}");

    // 규칙: 한도 v1(2,000,000)과 합산 v1(일치 2). 시행일은 규정 문서에 없어 미상(null), 이전 버전 없음
    let rule = |id: &str, name: &str, value: i64| json!({ "id": id, "name": name, "ver": 1, "value": value, "clause": "지급한도", "since": null, "until": null, "prev": null, "source": "원본" });
    ensure!(d["rules"] == json!([rule("한도-v1", "한도", 2_000_000), rule("합산-v1", "합산", 2)]), "규칙 {}", d["rules"]);

    // 가정: 스펙에서 가정이라고 적힌 것. 글은 스펙의 줄 그대로이고 출처는 가정(수는 스펙을 따르므로 적지 않는다)
    let a = rows(&d["assumes"]);
    let of = |id: &str| a.iter().filter(|x| x["id"] == id).cloned().collect::<Vec<_>>();
    ensure!(a.iter().all(|x| x["source"] == "가정" && x["file"] == "docs/graph-spec.md" && x["row"].as_i64().is_some_and(|r| r > 1) && x["text"].as_str().is_some_and(|t| !t.is_empty() && !t.contains("**"))), "가정의 글");
    ensure!(a[0]["id"] == "D7" && a[0]["title"] == "합산 기준 월" && a[0]["row"] == 33 && a[0]["text"] == "귀속월. 가정 — 규정 원문은 \"월 지급액\"이라고만 한다. 지급일 기준이면 지급 시기를 미뤄 한도를 피할 수 있다.", "D7 {}", a[0]);
    // 숫자가 기대는 가정(D46의 표): 가정 아님과 이미 모은 D7의 줄은 없다
    let titles: Vec<J> = of("D46").iter().map(|x| x["title"].clone()).collect();
    ensure!(json!(titles) == json!(["대표자 이름이 같으면 일치로 본다", "주소·계좌는 지금 등록된 값이 1~5월에도 같았다", "한도 200만원이 1~5월에도 시행 중이었다"]), "D46의 가정 {titles:?}");
    // 쓰인 곳: 이미 있는 화면(심사, 재검토, 정황)은 그 기록으로 가고(정황은 출처가 가정인 근접이 먼저), 만들지 않은 것(D34)은 쓰인 곳이 없다
    ensure!(a[0]["used"] == json!([{ "view": "심사", "kind": "심사", "id": "2026-06-D-011" }, { "view": "재검토", "kind": "심사", "id": "2026-05-D-011" }]), "D7이 쓰인 곳 {}", a[0]["used"]);
    ensure!(of("D8")[0]["used"] == json!([{ "view": "정황", "kind": "정황", "id": "근접-D-011" }]) && of("D34")[0]["used"] == json!([]) && of("D51")[0]["used"][0]["view"] == "정황", "정황이 쓰인 곳");
    for u in rows(&a[0]["used"]) {
        c.get("내부 감시", &format!("/api/reviews/{}", u["id"].as_str().unwrap_or(""))).await?;
    }

    // 대사(D49): 맞춰 본 지급이 아직 없으면 글자뿐이고, 승인 → 지급 → 회신을 거쳐 대사가 생기면 그 지급으로 간다
    ensure!(of("D49")[0]["used"] == json!([{ "view": "대사", "kind": "지급", "id": null }]), "대사 전의 D49 {}", of("D49")[0]["used"]);
    ensure!(c.post("영업지원", "/api/decide", json!({ "ids": ["2026-06-D-001"], "kind": "승인" })).await?.0 == 200, "승인");
    let acct = "회계·자금";
    let pay = c.get(acct, "/api/pays").await?["rows"][0]["id"].clone();
    ensure!(c.post(acct, "/api/pay", json!({ "id": pay })).await?.0 == 200, "지급");
    let want = c.get(acct, &format!("/api/pays/{}/recon", pay.as_str().unwrap_or(""))).await?["want"].clone();
    ensure!(c.post(acct, "/api/reply", json!({ "id": pay, "amount": want["amount"], "account": want["accounts"][0], "result": "성공" })).await?.0 == 200, "회신");
    let after = c.get("내부 감시", "/api/rules").await?;
    let d49 = rows(&after["assumes"]).into_iter().find(|x| x["id"] == "D49").unwrap_or_default();
    ensure!(pay.is_string() && d49["used"] == json!([{ "view": "대사", "kind": "지급", "id": pay }]), "대사 뒤의 D49 {}", d49["used"]);

    // 심사 상세의 규정 줄 → 이 화면의 조항. 원본의 과거 심사에는 규정이 없다
    let r = c.get("영업지원", "/api/reviews/2026-06-D-011").await?;
    ensure!(r["rules"][0]["clause"] == cl["id"] && r["rules"][1]["clause"] == cl["id"], "심사의 조항 {}", r["rules"]);
    ensure!(c.get("영업지원", "/api/reviews/2026-05-D-011").await?["rules"] == json!([]), "과거의 심사의 규정");

    // 본보기(23의 일을 흉내): 한도의 새 버전이 7월 1일에 시행되면 앞 버전의 시행 기간이 닫히고 새 버전은 앞 버전에 이어진다(선 27)
    q(&c.db, "
        UPDATE rule:`한도-v1` SET until = d'2026-07-01T00:00:00Z';
        CREATE rule:`한도-t22` SET name = '한도', ver = 2, value = 1500000, clause = clause:`지급한도`, since = d'2026-07-01T00:00:00Z', prev = rule:`한도-v1`, source = '시연';", json!({})).await?;
    let d = c.get("내부 감시", "/api/rules").await?;
    let got: Vec<J> = rows(&d["rules"]).iter().map(|x| json!([x["name"], x["ver"], x["value"], x["since"], x["until"], x["prev"], x["source"]])).collect();
    ensure!(json!(got) == json!([
        ["한도", 1, 2_000_000, null, "2026-07-01", null, "원본"],
        ["한도", 2, 1_500_000, "2026-07-01", null, { "name": "한도", "ver": 1 }, "시연"],
        ["합산", 1, 2, null, null, null, "원본"],
    ]), "버전이 둘일 때 {got:?}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 가정은_스펙의_표시대로() {
        let a = assumes();
        // 스펙의 굵은 가정 표시를 빠짐없이 모았다(표의 줄은 굵은 표시가 없다)
        let table = a.iter().filter(|x| x["text"].as_str().is_some_and(|t| t.contains(" | "))).count();
        assert!(table > 0);
        assert_eq!(a.len() - table, SPEC.1.matches("**가정**").count());
        assert!(a.iter().all(|x| !x["text"].as_str().unwrap_or("").contains("가정 아님")));
        // 모은 글(제목과 줄)에 용어집의 피할 말이 섞여 들어오지 않는다
        assert!(a.iter().all(|x| !format!("{}{}", x["title"], x["text"]).contains("판정")), "판정");
        // 쓰인 곳의 표는 있는 가정만 가리킨다
        for (id, _) in USED {
            assert!(a.iter().any(|x| x["id"] == *id), "{id}");
        }
        // 결정의 본문: 제목 줄은 빼고 그 절의 글만, 굵은 표시 없이
        let d30 = a.iter().find(|x| x["id"] == "D30").unwrap();
        let b = d30["body"].as_str().unwrap();
        assert!(b.starts_with("회사(서비스) 쪽에서 보는 날짜는 둘이다.") && b.ends_with("가정 — \"늦다\"의 기준 일수.") && !b.contains("**") && !b.contains("###"), "{b}");
        // 합성: 시연 호실(D58) 하나
        let s = synths();
        assert!(s.len() == 1 && s[0]["id"] == "D58" && s[0]["source"] == "합성" && s[0]["body"].as_str().unwrap().contains("101호"), "{s:?}");
        // 가는 길의 낱말은 쓰인 곳의 낱말이다
        for (w, _, _) in WAYS {
            assert!(USED.iter().any(|u| u.1.contains(w)), "{w}");
        }
    }
}
