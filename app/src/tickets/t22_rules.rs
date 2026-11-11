//! 22 규정: 메뉴 "규정"이 보이는 것 — 조항(원문과 문서 위치), 규칙 버전(시행 기간, 이전 버전), 가정(스펙에서 **가정**으로 표시된 결정).
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
    ("D47", &["심사", "재검토"]),
    ("D49", &["대사"]),
];

/// 쓰인 곳으로 가는 길: (낱말, 열 대상의 kind, 그 가정이 쓰인 기록 하나의 id를 돌려주는 식). 여기에 없는 낱말은 화면에 글자로만 보인다.
/// 자기 화면을 만든 티켓이 한 줄을 더한다(기록이 아직 없으면 NONE이 되어 글자로만 보인다)
const WAYS: &[(&str, &str, &str)] = &[
    ("심사", "심사", "(SELECT record::id(id) AS id, total FROM review WHERE source != '원본' ORDER BY total DESC, id LIMIT 1)[0].id"),
    ("재검토", "심사", "(SELECT record::id(id) AS id, ym FROM review WHERE marks CONTAINS '재검토' ORDER BY ym DESC, id LIMIT 1)[0].id"),
];

/// 스펙에서 **가정**으로 표시된 줄마다 하나: 그 줄이 속한 결정의 번호와 제목, 줄의 글자 그대로(굵게 표시만 뗀다), 문서의 행
fn assumes() -> Vec<J> {
    let mut head = ("", "");
    let mut out = vec![];
    for (i, line) in SPEC.1.lines().enumerate() {
        if let Some(h) = line.strip_prefix("### ").and_then(|h| h.split_once(". ")) {
            head = h;
        } else if line.contains("**가정**") {
            let used = USED.iter().find(|u| u.0 == head.0).map_or(&[][..], |u| u.1);
            out.push(json!({ "id": head.0, "title": head.1, "text": line.replace("**", ""), "file": SPEC.0, "row": i + 1, "used": used, "source": "가정" }));
        }
    }
    out
}

pub fn routes() -> Router<Db> {
    Router::new().route("/rules", get(rules))
}

/// 규정: 조항(`clauses`), 규칙 버전(`rules`: 시행 기간 `since`·`until`, 이전 버전 `prev`), 가정(`assumes`: `used`는 쓰인 곳 — `id`가 있으면 그 기록으로 갈 수 있다)
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
        ensure!(c.get(role, "/api/rules").await? == d, "{role}의 규정");
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

    // 가정: 스펙에서 **가정**으로 표시된 결정 12개. 글은 스펙의 줄 그대로이고 출처는 가정
    let a = rows(&d["assumes"]);
    let ids: Vec<&str> = a.iter().filter_map(|x| x["id"].as_str()).collect();
    ensure!(ids == ["D7", "D8", "D12", "D14", "D17", "D19", "D20", "D30", "D32", "D34", "D47", "D49"], "가정 {ids:?}");
    ensure!(a.iter().all(|x| x["source"] == "가정" && x["file"] == "docs/graph-spec.md" && x["text"].as_str().is_some_and(|t| t.contains("가정") && !t.contains("**"))), "가정의 글");
    ensure!(a[0]["title"] == "합산 기준 월" && a[0]["row"] == 33 && a[0]["text"] == "귀속월. 가정 — 규정 원문은 \"월 지급액\"이라고만 한다. 지급일 기준이면 지급 시기를 미뤄 한도를 피할 수 있다.", "D7 {}", a[0]);
    // 쓰인 곳: 이미 있는 화면(심사, 재검토)은 그 기록으로 가고, 아직 없는 화면(정황)은 글자뿐이다. 만들지 않은 것(D34)은 쓰인 곳이 없다
    ensure!(a[0]["used"] == json!([{ "view": "심사", "kind": "심사", "id": "2026-06-D-011" }, { "view": "재검토", "kind": "심사", "id": "2026-05-D-011" }]), "D7이 쓰인 곳 {}", a[0]["used"]);
    ensure!(a[1]["used"] == json!([{ "view": "정황", "kind": null, "id": null }]) && a[9]["used"] == json!([]), "글자뿐인 곳 {} {}", a[1]["used"], a[9]["used"]);
    for u in rows(&a[0]["used"]) {
        c.get("내부 감시", &format!("/api/reviews/{}", u["id"].as_str().unwrap_or(""))).await?;
    }

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
        // 스펙의 **가정** 표시 수와 같고, 결정마다 하나다
        assert_eq!(a.len(), SPEC.1.matches("**가정**").count());
        assert_eq!(a.len(), 12);
        // 쓰인 곳의 표는 있는 가정만 가리킨다
        for (id, _) in USED {
            assert_eq!(a.iter().filter(|x| x["id"] == *id).count(), 1, "{id}");
        }
        // 가는 길의 낱말은 쓰인 곳의 낱말이다
        for (w, _, _) in WAYS {
            assert!(USED.iter().any(|u| u.1.contains(w)), "{w}");
        }
    }
}
