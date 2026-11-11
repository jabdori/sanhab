-- 원본 적재. seed.rs가 CSV 행을 가공 없이 JSON 배열로 바인딩한다($agencies/$rebates/$deposits).
-- 원본 → 그래프 변환은 이 파일에서만 일어난다. 가정은 src.assumption에 남긴다.

CREATE doc:approval_policy CONTENT { path: $policy.path, sha256: $policy.sha256 };
CREATE clause:rebate_limit CONTENT { doc: doc:approval_policy, lines: '41-45', text: $policy.clause };
CREATE rule:group_v1 CONTENT { name: '동일 관련자 합산', version: 1, impl: 'fn::group', params: { min_match: 2, kinds: ['rep', 'address', 'account'], provenance: ['master'] } };
CREATE rule:limit_v1 CONTENT { name: '월 지급액 전결 한도', version: 1, impl: 'fn::check', params: { limit: 2000000, basis: '귀속월(period_ym) 합산 — 가정' } };
RELATE clause:rebate_limit->implemented_by->[rule:group_v1, rule:limit_v1];

FOR $a IN $agencies {
  LET $id = type::record('agency', $a.agency_id);
  LET $reg = <datetime>$a.registered_date;
  LET $src = { file: $files.agency, row: $a.row, kind: 'original' };
  CREATE $id CONTENT {
    name: $a.agency_name, rep: $a.representative_name, address: $a.address, account: $a.bank_account_no,
    rebate_eligible: $a.rebate_eligible = 'True', registered: $reg, src: $src
  };
  -- 마스터에 변경 이력이 없으므로 유효·인지 시점 모두 등록일로 둔다
  FOR $p IN [['rep', $a.representative_name], ['address', $a.address], ['account', $a.bank_account_no]] {
    LET $i = type::record('ident', $p);
    UPSERT $i SET kind = $p[0], value = $p[1];
    RELATE $id->has_ident->$i CONTENT {
      provenance: 'master', valid_from: $reg, recorded_at: $reg,
      src: object::extend($src, { assumption: 'valid_from=recorded_at=registered_date' })
    };
  };
};

FOR $r IN $rebates {
  LET $id = type::record('rebate', $r.rebate_id);
  LET $ag = type::record('agency', $r.agency_id);
  LET $done = $r.approval_status = '승인';
  LET $paid = IF $r.payment_date { <datetime>$r.payment_date };
  CREATE $id CONTENT {
    agency: $ag, period: $r.period_ym, period_start: <datetime>$r.period_start, period_end: <datetime>$r.period_end,
    perf: <int>$r.sales_performance_krw, amount: <int>$r.rebate_amount_krw, status: $r.approval_status,
    approver: $r.approver, paid_on: $paid, src: { file: $files.rebate, row: $r.row, kind: 'original' }
  };
  IF $r.approval_status != '반려' {
    CREATE type::record('decision', $r.rebate_id) CONTENT {
      rebate: $id, agency: $ag, period: $r.period_ym, period_start: <datetime>$r.period_start, period_end: <datetime>$r.period_end,
      amount: <int>$r.rebate_amount_krw,
      acceptance: IF $done { 'accepted' } ELSE { 'pending' },
      decided_level: IF $done { $r.approver }, decided_at: IF $done { $paid },
      rules: [],  -- 과거 승인은 적용 규칙 버전 기록이 원본에 없음
      src: { file: $files.rebate, row: $r.row, kind: 'derived', assumption: IF $done { 'decided_at≈payment_date' } }
    };
  };
};

-- 실제 입금 계좌가 마스터와 다르면: 관측 엣지(판단 근거 아님) + 증빙 확인 Work. 같은 불일치는 첫 관측만.
FOR $d IN (SELECT * FROM $deposits ORDER BY deposit_date) {
  LET $id = type::record('deposit', $d.deposit_id);
  LET $ag = type::record('agency', $d.agency_id);
  CREATE $id CONTENT {
    agency: $ag, on: <datetime>$d.deposit_date, amount: <int>$d.amount_krw, account: $d.bank_account_no,
    src: { file: $files.deposit, row: $d.row, kind: 'original' }
  };
  LET $i = type::record('ident', ['account', $d.bank_account_no]);
  IF $d.bank_account_no != $ag.account AND array::len(SELECT id FROM has_ident WHERE in = $ag AND out = $i AND provenance = 'deposit') = 0 {
    UPSERT $i SET kind = 'account', value = $d.bank_account_no;
    RELATE $ag->has_ident->$i CONTENT {
      provenance: 'deposit', valid_from: <datetime>$d.deposit_date, recorded_at: <datetime>$d.deposit_date,
      src: { file: $files.deposit, row: $d.row, kind: 'original' }
    };
    LET $w = CREATE ONLY work CONTENT {
      kind: 'evidence_check', dept: '영업지원팀', target: $ag,
      reason: string::concat('입금계좌(', $d.bank_account_no, ')가 마스터 정산계좌(', $ag.account, ')와 다름 — 지급 전 계좌 귀속 확인')
    };
    RELATE $id->caused->($w.id) SET note = '계좌 불일치 관측';
  };
};

-- 관련자 엣지 생성 → related_changed EVENT가 과거 판정을 재판정
FOR $a IN (SELECT VALUE id FROM agency ORDER BY id) { fn::relink($a); };

FOR $s IN [['support', '영업지원팀'], ['exec', '영업임원'], ['acct', '회계'], ['audit', '내부감사']] {
  CREATE type::record('staff', $s[0]) SET role = $s[1], pass = crypto::argon2::generate($demo_pass);
};

CREATE meta:v CONTENT { schema_version: $schema_version, seeded_at: time::now(), sources: $sources };
