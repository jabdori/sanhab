-- W07 판매장려금 관련자 통제 — schema v1 (SurrealDB v4.0.0)
-- 원칙: 원본(original)·파생(derived)·가정(assumption)·AI추론(inferred)을 레코드 단위로 구분한다.
--      판단 함수는 kind='rule' 엣지만 본다(추론·관측 엣지는 판단 근거가 될 수 없음).
--      두 시간축: valid_from/valid_to(사실이 유효한 기간) · recorded_at(회사가 안 시점).

-- ───────── 메타 ─────────
DEFINE TABLE OVERWRITE meta SCHEMAFULL;
DEFINE FIELD OVERWRITE schema_version ON meta TYPE int;
DEFINE FIELD OVERWRITE seeded_at ON meta TYPE datetime;
DEFINE FIELD OVERWRITE sources ON meta TYPE array<object> FLEXIBLE;

-- ───────── 문서 ↔ 함수 (규정 조항 → 구현 규칙@버전) ─────────
DEFINE TABLE OVERWRITE doc SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE path ON doc TYPE string;
DEFINE FIELD OVERWRITE sha256 ON doc TYPE string;
DEFINE TABLE OVERWRITE clause SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE doc ON clause TYPE record<doc>;
DEFINE FIELD OVERWRITE lines ON clause TYPE string;
DEFINE FIELD OVERWRITE text ON clause TYPE string;
DEFINE TABLE OVERWRITE rule SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE name ON rule TYPE string;
DEFINE FIELD OVERWRITE version ON rule TYPE int;
DEFINE FIELD OVERWRITE impl ON rule TYPE string;
DEFINE FIELD OVERWRITE params ON rule TYPE object FLEXIBLE;
DEFINE TABLE OVERWRITE implemented_by TYPE RELATION IN clause OUT rule SCHEMAFULL PERMISSIONS FOR select FULL;

-- ───────── 원본 데이터 ─────────
DEFINE TABLE OVERWRITE agency SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE name ON agency TYPE string;
DEFINE FIELD OVERWRITE rep ON agency TYPE string;
DEFINE FIELD OVERWRITE address ON agency TYPE string;
DEFINE FIELD OVERWRITE account ON agency TYPE string;
DEFINE FIELD OVERWRITE rebate_eligible ON agency TYPE bool;
DEFINE FIELD OVERWRITE registered ON agency TYPE datetime;
DEFINE FIELD OVERWRITE src ON agency TYPE object FLEXIBLE;

DEFINE TABLE OVERWRITE rebate SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE agency ON rebate TYPE record<agency>;
DEFINE FIELD OVERWRITE period ON rebate TYPE string;
DEFINE FIELD OVERWRITE period_start ON rebate TYPE datetime;
DEFINE FIELD OVERWRITE period_end ON rebate TYPE datetime;   -- 다음 달 1일(배타)
DEFINE FIELD OVERWRITE perf ON rebate TYPE int;
DEFINE FIELD OVERWRITE amount ON rebate TYPE int;
DEFINE FIELD OVERWRITE status ON rebate TYPE string;
DEFINE FIELD OVERWRITE approver ON rebate TYPE option<string>;
DEFINE FIELD OVERWRITE paid_on ON rebate TYPE option<datetime>;
DEFINE FIELD OVERWRITE src ON rebate TYPE object FLEXIBLE;
DEFINE INDEX OVERWRITE rebate_ap ON rebate FIELDS agency, period;

DEFINE TABLE OVERWRITE deposit SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE agency ON deposit TYPE record<agency>;
DEFINE FIELD OVERWRITE on ON deposit TYPE datetime;
DEFINE FIELD OVERWRITE amount ON deposit TYPE int;
DEFINE FIELD OVERWRITE account ON deposit TYPE string;
DEFINE FIELD OVERWRITE src ON deposit TYPE object FLEXIBLE;

-- ───────── 관계 그래프 (이중 시간) ─────────
DEFINE TABLE OVERWRITE ident SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE kind ON ident TYPE string ASSERT $value IN ['rep','address','account'];
DEFINE FIELD OVERWRITE value ON ident TYPE string;

DEFINE TABLE OVERWRITE has_ident TYPE RELATION IN agency OUT ident ENFORCED SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE provenance ON has_ident TYPE string ASSERT $value IN ['master','deposit','vindication','ai_inferred','assumption'];
DEFINE FIELD OVERWRITE valid_from ON has_ident TYPE datetime;
DEFINE FIELD OVERWRITE valid_to ON has_ident TYPE option<datetime>;
DEFINE FIELD OVERWRITE recorded_at ON has_ident TYPE datetime;
DEFINE FIELD OVERWRITE src ON has_ident TYPE object FLEXIBLE;

DEFINE TABLE OVERWRITE related TYPE RELATION IN agency OUT agency SCHEMAFULL PERMISSIONS FOR select FULL CHANGEFEED 7d;
DEFINE FIELD OVERWRITE kind ON related TYPE string ASSERT $value IN ['rule','observed','inferred'];
DEFINE FIELD OVERWRITE status ON related TYPE string DEFAULT 'active' ASSERT $value IN ['active','vindicated','retracted'];
DEFINE FIELD OVERWRITE basis ON related TYPE array<string>;
DEFINE FIELD OVERWRITE rule ON related TYPE option<record<rule>>;
DEFINE FIELD OVERWRITE valid_from ON related TYPE datetime;
DEFINE FIELD OVERWRITE valid_to ON related TYPE option<datetime>;
DEFINE FIELD OVERWRITE recorded_at ON related TYPE datetime;
DEFINE FIELD OVERWRITE src ON related TYPE object FLEXIBLE;

-- ───────── 판단 · 작업 · 인과 ─────────
DEFINE TABLE OVERWRITE decision SCHEMAFULL PERMISSIONS FOR select FULL CHANGEFEED 7d;
DEFINE FIELD OVERWRITE rebate ON decision TYPE record<rebate>;
DEFINE FIELD OVERWRITE agency ON decision TYPE record<agency>;
DEFINE FIELD OVERWRITE period ON decision TYPE string;
DEFINE FIELD OVERWRITE period_start ON decision TYPE datetime;
DEFINE FIELD OVERWRITE period_end ON decision TYPE datetime;
DEFINE FIELD OVERWRITE amount ON decision TYPE int;
DEFINE FIELD OVERWRITE decided_level ON decision TYPE option<string>;
DEFINE FIELD OVERWRITE decided_at ON decision TYPE option<datetime>;
DEFINE FIELD OVERWRITE rules ON decision TYPE array<record<rule>>;   -- 판단 당시 규칙 버전 고정
DEFINE FIELD OVERWRITE acceptance ON decision TYPE string ASSERT $value IN ['pending','accepted','stale','failed'];
DEFINE FIELD OVERWRITE knowledge ON decision TYPE option<string> ASSERT $value = NONE OR $value IN ['outcome_error','control_violation'];
DEFINE FIELD OVERWRITE required_level ON decision TYPE option<string>;
DEFINE FIELD OVERWRITE group_total ON decision TYPE option<int>;
DEFINE FIELD OVERWRITE group_members ON decision TYPE option<array<record<agency>>>;
DEFINE FIELD OVERWRITE src ON decision TYPE object FLEXIBLE;

DEFINE TABLE OVERWRITE work SCHEMAFULL PERMISSIONS FOR select FULL CHANGEFEED 7d;
DEFINE FIELD OVERWRITE kind ON work TYPE string ASSERT $value IN ['evidence_check','ratification','violation_report','payment','dealer_notice'];
DEFINE FIELD OVERWRITE target ON work TYPE record;
DEFINE FIELD OVERWRITE dept ON work TYPE string ASSERT $value IN ['영업지원팀','영업임원','영업','회계','내부감사'];
DEFINE FIELD OVERWRITE reason ON work TYPE string;
DEFINE FIELD OVERWRITE state ON work TYPE string DEFAULT 'queued' ASSERT $value IN ['queued','active','waiting','blocked','cancelled','settled'];
DEFINE FIELD OVERWRITE created_at ON work TYPE datetime DEFAULT time::now();

-- 인과 엣지: 무엇이 무엇을 일으켰나 (정방향/역방향 순회로 "왜 생겼나" 답함)
DEFINE TABLE OVERWRITE caused TYPE RELATION SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE rule ON caused TYPE option<record<rule>>;
DEFINE FIELD OVERWRITE note ON caused TYPE option<string>;
DEFINE FIELD OVERWRITE at ON caused TYPE datetime DEFAULT time::now();

-- ───────── 사람 · 권한 ─────────
DEFINE TABLE OVERWRITE staff SCHEMAFULL PERMISSIONS FOR select WHERE id = $auth.id;
DEFINE FIELD OVERWRITE role ON staff TYPE string ASSERT $value IN ['영업지원팀','영업임원','회계','내부감사'];
DEFINE FIELD OVERWRITE pass ON staff TYPE string;
DEFINE ACCESS OVERWRITE staff ON DATABASE TYPE RECORD
  SIGNIN (SELECT * FROM staff WHERE id = type::record('staff', $user) AND crypto::argon2::compare(pass, $pass))
  DURATION FOR TOKEN 1h, FOR SESSION 12h;

-- ───────── 판단 함수 ─────────
-- 관련자 그룹: 유효기간이 [vstart, vend)와 겹치고, known 시점까지 회사가 알고 있던 규정 엣지만 따라간다.
DEFINE FUNCTION OVERWRITE fn::group($a: record<agency>, $vstart: datetime, $vend: datetime, $known: datetime) -> array {
  LET $g = (SELECT VALUE @.{..+collect}(<->related[WHERE kind = 'rule' AND status = 'active' AND valid_from < $vend AND (valid_to = NONE OR valid_to > $vstart) AND recorded_at <= $known]<->agency) FROM ONLY $a) ?? [];
  RETURN array::union([$a], $g);
};
-- 상태·시간 무관 전체 연결 성분 (재판정 범위 산정용)
DEFINE FUNCTION OVERWRITE fn::component($a: record<agency>) -> array {
  RETURN array::union([$a], (SELECT VALUE @.{..+collect}(<->related<->agency) FROM ONLY $a) ?? []);
};

-- 판정: 규정 조항의 유일한 구현. UI 설명과 DB 권한(approval PERMISSIONS)이 같은 함수를 쓴다.
DEFINE FUNCTION OVERWRITE fn::check($d: record<decision>, $known: datetime) -> object {
  LET $dd = $d.*;
  LET $m = fn::group($dd.agency, $dd.period_start, $dd.period_end, $known);
  LET $t = math::sum(SELECT VALUE amount FROM rebate WHERE agency IN $m AND period = $dd.period AND status != '반려');
  LET $req = IF $t > rule:limit_v1.params.limit { '영업임원' } ELSE { '영업지원팀' };
  LET $blk = SELECT VALUE reason FROM work WHERE target = $dd.agency AND kind = 'evidence_check' AND state NOT IN ['settled', 'cancelled'];
  LET $allowed = IF array::len($blk) > 0 { [] } ELSE IF $req = '영업임원' { ['영업임원'] } ELSE { ['영업지원팀', '영업임원'] };
  RETURN { members: $m, total: $t, required: $req, blockers: $blk, allowed: $allowed, rules: [rule:group_v1, rule:limit_v1] };
};

-- 재판정: 이미 내려진 판정을 현재 사실로 다시 보고, 몰랐던 오류인지(outcome_error) 알 수 있었던 위반인지(control_violation) 가른다.
-- 멱등: 같은 입력으로 여러 번 돌려도 Work가 중복 생성되지 않는다.
DEFINE FUNCTION OVERWRITE fn::reconcile($members: array, $cause: record) {
  FOR $d IN (SELECT * FROM decision WHERE agency IN $members AND decided_level != NONE) {
    LET $now = fn::check($d.id, time::now());
    LET $then = fn::check($d.id, $d.decided_at);
    LET $wrong = $now.required = '영업임원' AND $d.decided_level = '영업지원팀';
    IF $wrong AND $d.acceptance = 'accepted' {
      LET $k = IF $then.required = '영업임원' { 'control_violation' } ELSE { 'outcome_error' };
      UPDATE $d.id SET acceptance = 'stale', knowledge = $k, required_level = $now.required, group_total = $now.total, group_members = $now.members;
      RELATE $cause->caused->($d.id) SET rule = rule:group_v1;
      LET $w = CREATE ONLY work CONTENT {
        kind: IF $k = 'control_violation' { 'violation_report' } ELSE { 'ratification' },
        dept: IF $k = 'control_violation' { '내부감사' } ELSE { '영업임원' },
        target: $d.id,
        reason: string::concat($d.period, ' 그룹합산 ', <string>$now.total, '원 > 한도, 하위권한(', $d.decided_level, ') 승인')
      };
      RELATE ($d.id)->caused->($w.id) SET rule = rule:limit_v1;
    } ELSE IF $wrong {
      -- 이미 stale: 그룹이 더 커졌을 수 있으므로 근거만 갱신(Work 추가 없음)
      UPDATE $d.id SET group_total = $now.total, group_members = $now.members, knowledge = IF $then.required = '영업임원' { 'control_violation' } ELSE { 'outcome_error' };
      RELATE $cause->caused->($d.id) SET note = '근거 갱신';
    } ELSE IF !$wrong AND $d.acceptance = 'stale' {
      UPDATE $d.id SET acceptance = 'accepted', knowledge = NONE, required_level = $now.required, group_total = $now.total, group_members = $now.members;
      RELATE $cause->caused->($d.id) SET note = '재판정 해소';
      UPDATE work SET state = 'cancelled' WHERE target = $d.id AND state IN ['queued', 'active', 'waiting', 'blocked'];
    };
  };
};

-- 관련자 엣지 생성: 마스터 식별자 2개 이상이 겹치면 규정 엣지. 성립 시점 = 두 번째 일치가 시작된 시점.
DEFINE FUNCTION OVERWRITE fn::relink($a: record<agency>) {
  LET $mine = SELECT out, valid_from, recorded_at FROM has_ident WHERE in = $a AND provenance = 'master' AND valid_to = NONE;
  FOR $b IN array::distinct(SELECT VALUE in FROM has_ident WHERE out IN $mine.out AND provenance = 'master' AND valid_to = NONE AND in != $a) {
    LET $theirs = SELECT out, valid_from, recorded_at FROM has_ident WHERE in = $b AND provenance = 'master' AND valid_to = NONE AND out IN $mine.out;
    LET $raw = $theirs.map(|$t| {
      LET $m = $mine[WHERE out = $t.out][0];
      RETURN { kind: $t.out.kind, vf: array::max([$t.valid_from, $m.valid_from]), rec: array::max([$t.recorded_at, $m.recorded_at]) };
    });
    LET $hits = SELECT * FROM $raw ORDER BY vf;
    LET $exists = SELECT VALUE id FROM related WHERE kind = 'rule' AND status = 'active' AND ((in = $a AND out = $b) OR (in = $b AND out = $a));
    IF array::len($hits) >= 2 AND array::len($exists) = 0 {
      RELATE $a->related->$b CONTENT {
        kind: 'rule', rule: rule:group_v1, basis: $hits.kind,
        valid_from: $hits[1].vf, recorded_at: array::max(array::slice($hits.rec, 0, 2)),
        src: { kind: 'derived', from: 'fn::relink', rule: 'policy:2of3' }
      };
    };
  };
};

-- 마스터 식별자 변경(조건 변경): 이전 값은 valid_to로 닫고 새 값을 이중 시간으로 기록한 뒤 관련자 재연결.
-- ponytail: 기존 related 엣지의 basis 소멸(valid_to 닫기)은 미처리 — 주소 이전으로 관계가 끊기는 사례가 생기면 추가
DEFINE FUNCTION OVERWRITE fn::change_ident($a: record<agency>, $kind: string, $value: string, $valid_from: datetime, $recorded_at: datetime, $src: object) {
  LET $i = type::record('ident', [$kind, $value]);
  UPDATE has_ident SET valid_to = $valid_from WHERE in = $a AND provenance = 'master' AND out.kind = $kind AND valid_to = NONE;
  UPSERT $i SET kind = $kind, value = $value;
  RELATE $a->has_ident->$i CONTENT { provenance: 'master', valid_from: $valid_from, recorded_at: $recorded_at, src: $src };
  IF $kind = 'address' { UPDATE $a SET address = $value; } ELSE IF $kind = 'rep' { UPDATE $a SET rep = $value; } ELSE { UPDATE $a SET account = $value; };
  fn::relink($a);
};

DEFINE EVENT OVERWRITE related_changed ON TABLE related WHEN $event IN ['CREATE', 'UPDATE'] THEN {
  fn::reconcile(array::union(fn::component($after.in), fn::component($after.out)), $after.id);
};

-- ───────── 소명(정정) ─────────
DEFINE TABLE OVERWRITE vindication SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD OVERWRITE edge ON vindication TYPE record<related>;
DEFINE FIELD OVERWRITE effect ON vindication TYPE string ASSERT $value IN ['not_related','correct_valid_from'];
DEFINE FIELD OVERWRITE valid_from ON vindication TYPE option<datetime>;
DEFINE FIELD OVERWRITE evidence ON vindication TYPE string;
DEFINE FIELD OVERWRITE at ON vindication TYPE datetime DEFAULT time::now();
DEFINE EVENT OVERWRITE vindication_applied ON TABLE vindication WHEN $event = 'CREATE' THEN {
  RELATE ($after.id)->caused->($after.edge) SET note = $after.effect;
  IF $after.effect = 'not_related' { UPDATE $after.edge SET status = 'vindicated'; }
  ELSE { UPDATE $after.edge SET valid_from = $after.valid_from; };
};

-- ───────── 승인 (DB가 권한을 강제) ─────────
DEFINE TABLE OVERWRITE approval SCHEMAFULL CHANGEFEED 7d
  PERMISSIONS FOR select FULL
    FOR create WHERE $auth.role IN fn::check(decision, time::now()).allowed AND decision.acceptance = 'pending';
DEFINE FIELD OVERWRITE decision ON approval TYPE record<decision>;
DEFINE FIELD OVERWRITE by ON approval TYPE string VALUE $auth.role;   -- 시스템 계정($auth 없음)은 승인 불가
DEFINE FIELD OVERWRITE by_user ON approval TYPE record<staff> VALUE $auth.id;
DEFINE FIELD OVERWRITE at ON approval TYPE datetime VALUE time::now();
DEFINE FIELD OVERWRITE check ON approval TYPE object FLEXIBLE VALUE fn::check(decision, time::now()); -- 판단 근거 스냅샷
DEFINE EVENT OVERWRITE approval_done ON TABLE approval WHEN $event = 'CREATE' THEN {
  UPDATE $after.decision SET acceptance = 'accepted', decided_level = $after.by, decided_at = $after.at,
    rules = $after.check.rules, required_level = $after.check.required, group_total = $after.check.total, group_members = $after.check.members;
  LET $w = CREATE ONLY work CONTENT { kind: 'payment', dept: '회계', target: $after.decision,
    reason: string::concat('승인(', $after.by, ') — 지급 실행, 귀속월 ', $after.decision.period) };
  RELATE ($after.id)->caused->($w.id) SET rule = rule:limit_v1;
};
