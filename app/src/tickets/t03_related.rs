//! 03 관련자: 관련자와 그룹을 선 1~3에서 조회할 때 계산한다(저장하지 않는다. D3, D9, D10, D21).
//! 계산은 여기 한 곳에 있다: `links()`가 기간에 유효하고 소명으로 제외되지 않은 선을 읽고, `matches()`·`groups()`가 그 선만으로 계산한다.
//! 정황이 사실일 때의 가설은 `links()`의 결과에 `Link`를 더해 같은 함수를 부르면 된다.
use crate::check::Check;
use crate::db::{Db, q, q1};
use crate::{R, err};
use anyhow::{Result, ensure};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{Value as J, json};
use std::collections::{BTreeMap, BTreeSet};

pub const SCHEMA: &str = include_str!("../../db/03-관련자.surql");
/// 식별자의 종류. `Link::item`은 이 배열의 자리다
pub const ITEMS: [&str; 3] = ["대표자", "주소", "계좌"];

/// 식별자 선 하나: 대리점 → 사람·주소·계좌 노드. 같은 `node`를 가리키면 그 식별자가 일치한다
/// (대표자는 이름마다 노드 하나라 이름이 같으면 일치이고, 동명이인으로 나뉜 사람은 다른 노드다)
#[derive(Clone, Debug, Deserialize)]
pub struct Link {
    pub dealer: String,
    pub name: String,
    pub item: usize,
    pub node: String,
    pub value: String,
}

/// 계산에 쓰는 선. `period`는 (첫날, 끝날) `YYYY-MM-DD`이고 없으면 시스템의 오늘 하루다.
/// 유효 기간이 그 기간과 하루라도 겹치는 선을 읽고, 소명으로 제외된 선은 뺀다(제외의 기간(`ex_from`·`ex_to`, 20)이 있으면 그 기간과 겹칠 때만 뺀다)
pub async fn links(db: &Db, period: Option<(&str, &str)>) -> Result<Vec<Link>> {
    let one = |i: usize, table: &str, value: &str| {
        format!("(SELECT record::id(in) AS dealer, in.name AS name, {i} AS item, <string> out AS node, out.{value} AS value FROM {table} WHERE (!excluded OR (ex_from != NONE AND $t < ex_from) OR (ex_to != NONE AND $f > ex_to)) AND since <= $t AND (until = NONE OR until > $f))")
    };
    let sql = format!(
        "LET $f = IF $from THEN <datetime> ($from + 'T00:00:00Z') ELSE fn::today() END;
        LET $t = IF $to THEN <datetime> ($to + 'T00:00:00Z') ELSE fn::today() END;
        RETURN array::concat({}, {}, {});",
        one(0, "rep", "name"),
        one(1, "addr", "value"),
        one(2, "acct", "value"),
    );
    let r = q1(db, &sql, json!({ "from": period.map(|p| p.0), "to": period.map(|p| p.1) })).await?;
    Ok(serde_json::from_value(r)?)
}

/// 대리점마다 가리키는 (종류, 노드)
fn idents(links: &[Link]) -> BTreeMap<&str, BTreeSet<(usize, &str)>> {
    let mut of: BTreeMap<&str, BTreeSet<(usize, &str)>> = BTreeMap::new();
    for l in links {
        of.entry(&l.dealer).or_default().insert((l.item, &l.node));
    }
    of
}

fn shared(a: &BTreeSet<(usize, &str)>, b: &BTreeSet<(usize, &str)>) -> Vec<usize> {
    let items: BTreeSet<usize> = a.intersection(b).map(|x| x.0).collect();
    items.into_iter().collect()
}

/// 두 대리점에서 일치하는 식별자의 종류(`ITEMS`의 자리). 둘 이상이면 관련자다
pub fn matches(links: &[Link], a: &str, b: &str) -> Vec<usize> {
    let of = idents(links);
    match (of.get(a), of.get(b)) {
        (Some(x), Some(y)) => shared(x, y),
        _ => vec![],
    }
}

/// 그룹: 관련자를 전이적으로 이은 것. 모든 대리점이 한 그룹에 들어간다(관련자가 없으면 혼자). 장려금 대상 여부는 보지 않는다(D21)
// ponytail: 모든 쌍을 본다(대리점 50곳이면 1,225쌍). 수천 곳이 되면 노드 → 대리점으로 뒤집어 센다
pub fn groups(links: &[Link]) -> Vec<Vec<String>> {
    let of = idents(links);
    let ids: Vec<&str> = of.keys().copied().collect();
    let mut g: Vec<usize> = (0..ids.len()).collect();
    for i in 0..ids.len() {
        for j in i + 1..ids.len() {
            if shared(&of[ids[i]], &of[ids[j]]).len() >= 2 && g[i] != g[j] {
                let (keep, gone) = (g[i], g[j]);
                g.iter_mut().filter(|x| **x == gone).for_each(|x| *x = keep);
            }
        }
    }
    let mut out: BTreeMap<usize, Vec<String>> = BTreeMap::new();
    for (i, id) in ids.iter().enumerate() {
        out.entry(g[i]).or_default().push(id.to_string());
    }
    out.into_values().collect()
}

pub fn routes() -> Router<std::sync::Arc<Db>> {
    Router::new().route("/dealers/{id}/related", get(related))
}

/// 대리점의 관계(지금): 자기 식별자(`idents`), 그 가운데 하나라도 함께 가리키는 대리점(`near`: 일치하는 종류와 관련자 여부), 그림의 선(`lines`), 그룹(`group`, 자기 포함)
async fn related(State(db): State<std::sync::Arc<Db>>, Path(id): Path<String>) -> R {
    let all = links(&db, None).await?;
    let mine: Vec<&Link> = all.iter().filter(|l| l.dealer == id).collect();
    // 유효한 선이 하나도 없는 대리점(모두 제외되었거나 기간이 지남)도 있는 대리점이다: 이웃 없이 자기만 든 그룹
    let me = q1(&db, "RETURN type::record('dealer', $id).name;", json!({ "id": id })).await?;
    let Some(me) = me.as_str() else {
        return Err(err(StatusCode::NOT_FOUND, "없음"));
    };
    let mut name: BTreeMap<&str, &str> = all.iter().map(|l| (l.dealer.as_str(), l.name.as_str())).collect();
    name.insert(&id, me);
    let dealer = |d: &str| json!({ "id": d, "name": name[d] });
    let touching: Vec<&Link> = all.iter().filter(|l| l.dealer != id && mine.iter().any(|m| m.node == l.node)).collect();
    let near: Vec<J> = touching.iter().map(|l| l.dealer.as_str()).collect::<BTreeSet<_>>().into_iter()
        .map(|d| {
            let m = matches(&all, &id, d);
            json!({ "id": d, "name": name[d], "match": m.iter().map(|i| ITEMS[*i]).collect::<Vec<_>>(), "related": m.len() >= 2 })
        })
        .collect();
    let group = groups(&all).into_iter().find(|g| g.contains(&id)).unwrap_or_else(|| vec![id.clone()]);
    Ok(Json(json!({
        "id": id,
        "idents": mine.iter().map(|l| json!({ "id": l.node, "item": ITEMS[l.item], "value": l.value })).collect::<Vec<_>>(),
        "near": near,
        "lines": mine.iter().chain(&touching).map(|l| json!([l.dealer, l.node])).collect::<Vec<_>>(),
        "group": group.iter().map(|d| dealer(d)).collect::<Vec<_>>(),
        "source": "계산",
    })))
}

pub async fn seed(_: &Db) -> Result<()> {
    Ok(())
}

pub async fn check(c: &Check) -> Result<()> {
    let role = "영업지원";
    let get = async |id: &str| c.get(role, &format!("/api/dealers/{id}/related")).await;
    let ids = |v: &J| v.as_array().into_iter().flatten().filter_map(|x| x["id"].as_str().map(String::from)).collect::<Vec<_>>();
    let near = |id: &str, name: &str, m: &[&str], related: bool| json!({ "id": id, "name": name, "match": m, "related": related });

    // 금강상사11: 성일상사24와 대표자·주소, 대륙상사37과 대표자·계좌로 관련자. 세 곳이 한 그룹
    let d = get("D-011").await?;
    ensure!(d["near"] == json!([near("D-024", "성일상사24", &["대표자", "주소"], true), near("D-037", "대륙상사37", &["대표자", "계좌"], true)]), "금강상사11의 관련자 {}", d["near"]);
    ensure!(d["group"] == json!([{ "id": "D-011", "name": "금강상사11" }, { "id": "D-024", "name": "성일상사24" }, { "id": "D-037", "name": "대륙상사37" }]), "그룹 {}", d["group"]);
    // 그림: 자기 식별자 셋과 바로 옆 이웃의 선만(자기 3 + 박상현 2 + 주소 1 + 계좌 1)
    ensure!(d["idents"].as_array().map(|a| a.iter().map(|i| (i["item"].as_str().unwrap_or(""), i["value"].as_str().unwrap_or(""))).collect::<Vec<_>>())
        == Some(vec![("대표자", "박상현"), ("주소", "성남시 상공로 128"), ("계좌", "국민 412-27-556310")]), "식별자 {}", d["idents"]);
    ensure!(d["lines"].as_array().is_some_and(|l| l.len() == 7) && d["source"] == "계산", "선 {}", d["lines"]);

    // 성일상사24와 대륙상사37은 대표자만 같아 서로 관련자가 아니지만 금강상사11을 거쳐 한 그룹이다(전이)
    let d = get("D-024").await?;
    ensure!(d["near"] == json!([near("D-011", "금강상사11", &["대표자", "주소"], true), near("D-037", "대륙상사37", &["대표자"], false)]), "성일상사24의 관련자 {}", d["near"]);
    ensure!(ids(&d["group"]) == ["D-011", "D-024", "D-037"], "성일상사24의 그룹 {}", d["group"]);

    // 한라인상사34와 금강상사41은 대표자만 같아 관련자가 아니다
    let d = get("D-034").await?;
    ensure!(d["near"] == json!([near("D-041", "금강상사41", &["대표자"], false)]) && ids(&d["group"]) == ["D-034"], "한라인상사34 {d}");
    // 아무것도 겹치지 않는 대리점
    let d = get("D-001").await?;
    ensure!(d["near"] == json!([]) && ids(&d["group"]) == ["D-001"] && d["lines"].as_array().is_some_and(|l| l.len() == 3), "대성상사1 {d}");

    // 다른 그룹은 없다: 50곳 가운데 둘 이상인 그룹에 든 곳은 셋, 관련자 쌍은 둘
    let (mut grouped, mut pairs) = (vec![], 0);
    for i in 1..=50 {
        let id = format!("D-{i:03}");
        let d = get(&id).await?;
        if d["group"].as_array().is_some_and(|g| g.len() > 1) {
            grouped.push(id);
        }
        pairs += d["near"].as_array().into_iter().flatten().filter(|n| n["related"] == true).count();
    }
    ensure!(grouped == ["D-011", "D-024", "D-037"] && pairs == 4, "그룹에 든 곳 {grouped:?}, 관련자 {pairs}");
    let (code, _) = c.call(Some(c.token(role)), "GET", "/api/dealers/D-999/related", None).await?;
    ensure!(code == 404, "없는 대리점 {code}");
    for (_, r) in crate::tickets::ROLES {
        ensure!(c.get(r, "/api/dealers/D-034/related").await? == get("D-034").await?, "{r}의 관계");
    }

    // 장려금 대상이 아닌 대리점도 그룹에 들어간다(D21)
    q(&c.db, "UPDATE dealer:`D-024` SET eligible = false;", json!({})).await?;
    ensure!(ids(&get("D-011").await?["group"]) == ["D-011", "D-024", "D-037"], "비대상 대리점이 그룹에서 빠짐");

    // 뒤 티켓이 채울 값 ①: 소명으로 제외된 선은 계산에서 빠진다(20번). 대륙상사37의 계좌가 빠지면 대표자만 남아 그룹에서 나간다
    q(&c.db, "UPDATE acct SET excluded = true WHERE in = dealer:`D-037`;", json!({})).await?;
    let d = get("D-011").await?;
    ensure!(d["near"][1] == near("D-037", "대륙상사37", &["대표자"], false) && ids(&d["group"]) == ["D-011", "D-024"], "제외된 선 {d}");
    ensure!(ids(&get("D-037").await?["group"]) == ["D-037"], "제외 뒤 대륙상사37");
    q(&c.db, "UPDATE acct SET excluded = false WHERE in = dealer:`D-037`;", json!({})).await?;

    // 유효한 선이 하나도 없는 대리점: 404가 아니라 이웃 없음, 자기만 든 그룹
    q(&c.db, "UPDATE rep, addr, acct SET excluded = true WHERE in = dealer:`D-034`;", json!({})).await?;
    let d = get("D-034").await?;
    ensure!(d["near"] == json!([]) && d["idents"] == json!([]) && d["lines"] == json!([]) && d["group"] == json!([{ "id": "D-034", "name": "한라인상사34" }]), "선이 없는 대리점 {d}");

    // 뒤 티켓이 채울 값 ②: 선의 유효 기간(13번). 성일상사24의 주소가 2026-03-10에 다른 값으로 바뀌었다면
    // 3월(하루라도 겹침)까지는 그룹이고 4월과 지금(2026-07-01)은 아니다. 등록 전의 기간에는 선이 없다
    q(&c.db, "UPDATE addr SET until = d'2026-03-10T00:00:00Z' WHERE in = dealer:`D-024`;", json!({})).await?;
    let size = async |p: Option<(&str, &str)>| anyhow::Ok(groups(&links(&c.db, p).await?).into_iter().find(|g| g.iter().any(|d| d == "D-024")).map_or(0, |g| g.len()));
    ensure!(size(Some(("2026-03-01", "2026-03-31"))).await? == 3, "3월의 그룹");
    ensure!(size(Some(("2026-04-01", "2026-04-30"))).await? == 1 && size(Some(("2026-03-10", "2026-03-10"))).await? == 1, "4월의 그룹");
    ensure!(size(Some(("2020-07-01", "2020-07-04"))).await? == 0, "등록 전");
    ensure!(ids(&get("D-024").await?["group"]) == ["D-024"] && ids(&get("D-011").await?["group"]) == ["D-011", "D-037"], "지금의 그룹");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn l(dealer: &str, item: usize, node: &str) -> Link {
        Link { dealer: dealer.into(), name: dealer.into(), item, node: node.into(), value: node.into() }
    }

    #[test]
    fn 둘_이상_일치하면_관련자이고_전이적으로_잇는다() {
        let links = [
            l("A", 0, "p1"), l("A", 1, "ad1"), l("A", 2, "ac1"),
            l("B", 0, "p1"), l("B", 1, "ad1"), l("B", 2, "ac2"), // A와 대표자·주소
            l("C", 0, "p1"), l("C", 1, "ad3"), l("C", 2, "ac1"), // A와 대표자·계좌, B와는 대표자만
            l("D", 0, "p1"), l("D", 1, "ad4"), l("D", 2, "ac4"), // 대표자만
            l("E", 0, "p5"), l("E", 1, "ad5"), l("E", 2, "ac5"),
        ];
        assert_eq!(matches(&links, "A", "B"), [0, 1]);
        assert_eq!(matches(&links, "A", "C"), [0, 2]);
        assert_eq!(matches(&links, "B", "C"), [0]);
        assert_eq!(matches(&links, "A", "E"), [] as [usize; 0]);
        assert_eq!(groups(&links), [vec!["A", "B", "C"], vec!["D"], vec!["E"]]);
    }

    #[test]
    fn 같은_종류의_값이_둘_겹쳐도_한_종류로_센다() {
        // 기간 안에 주소가 바뀌어 선이 둘인 대리점: 옛 주소와 새 주소가 모두 겹쳐도 주소 하나
        let links = [l("A", 1, "ad1"), l("A", 1, "ad2"), l("B", 1, "ad1"), l("B", 1, "ad2")];
        assert_eq!(matches(&links, "A", "B"), [1]);
        assert_eq!(groups(&links), [vec!["A"], vec!["B"]]);
    }

    #[test]
    fn 가설은_선을_더해_같은_계산을_부른다() {
        let mut links = vec![l("A", 0, "p1"), l("A", 2, "ac1"), l("B", 0, "p1"), l("B", 2, "ac2")];
        assert_eq!(groups(&links).len(), 2);
        links.push(l("B", 2, "ac1"));
        assert_eq!(groups(&links), [vec!["A", "B"]]);
    }
}
