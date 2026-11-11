-- 11 정황: 코드가 찾은 수상한 신호(D29)와 내부 감시의 요청·기각(D18). 정황은 합산과 승인권자 계산에 들어가지 않고 지급을 막지 않는다(D3, D8).
-- 정황은 코드(root)와 이벤트만 쓴다. 역할이 쓰는 것은 정황의 결정(ruling) 하나뿐이고, 내부 감시만 만들 수 있다.

-- 정황: 같은 대상의 같은 종류는 하나다(id = `종류-대상의 id`). 근거가 더 나오면 같은 기록에 붙는다
DEFINE TABLE signal SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD kind ON signal TYPE string ASSERT $value IN ['계좌', '동명', '근접', '지연', '대사', '추인', '기타'];   -- 종류(추인은 D52: 거부된 추인)
DEFINE FIELD name ON signal TYPE string;                      -- 제목과 작업 목록의 "대상"(계좌 · 성일상사24)
DEFINE FIELD dealers ON signal TYPE array<record<dealer>>;    -- 선 14: 정황 → 대리점. 첫 번째가 대상이다
DEFINE FIELD evidence ON signal TYPE array<record>;           -- 선 15: 정황 → 근거 기록(회수, 식별자 선, 지급 …). 값은 화면에 보일 때 그 기록에서 읽는다
DEFINE FIELD state ON signal TYPE string DEFAULT '접수' ASSERT $value IN ['접수', '요청', '기각', '해소'];
DEFINE FIELD source ON signal TYPE string;                    -- 계산. 기준이 가정인 종류(근접)는 가정

-- 정황을 접수한다(코드와 이벤트만 부른다). 없으면 만들고 내부 감시의 정황 작업을 올린다. 있으면 대리점과 근거만 더한다.
-- 뒤 티켓: 15는 여기서 "기각된 정황에 새 근거가 붙었으면 다시 접수"를 더한다
DEFINE FUNCTION fn::signal($kind: string, $of: string, $name: string, $dealers: array<record<dealer>>, $evidence: array<record>, $source: string) -> record<signal> {
    LET $s = type::record('signal', string::concat($kind, '-', $of));
    IF $s.id = NONE {
        CREATE $s SET kind = $kind, name = string::concat($kind, ' · ', $name), dealers = $dealers, evidence = $evidence, source = $source;
        -- 작업의 id는 정황의 id와 같다(04의 심사 작업처럼. 목록의 순서가 고르고, 다시 접수할 때 같은 작업을 되살릴 수 있다)
        CREATE type::record('task', record::id($s)) SET kind = '정황', view = '정황', target = $s, role = '내부 감시', source = '계산';
    } ELSE {
        UPDATE $s SET dealers = array::union(dealers, $dealers), evidence = array::union(evidence, $evidence);
    };
    RETURN $s;
} PERMISSIONS NONE;

-- 심사의 정황 표시: 열린 정황(접수·요청)의 대리점이 구성원인 심사에 붙는다. 굳은 심사는 건드리지 않는다(정황이 걸린 채 승인된 심사에는 표시가 그대로 남는다)
DEFINE FUNCTION fn::signal_mark($r: record<review>) {
    IF $r.fixed = NONE {
        LET $on = count(SELECT id FROM signal WHERE state INSIDE ['접수', '요청'] AND dealers ANYINSIDE $r.members) > 0;
        IF $on AND '정황' NOTINSIDE $r.marks { UPDATE $r SET marks += '정황'; }
        ELSE IF !$on AND '정황' INSIDE $r.marks { UPDATE $r SET marks -= '정황'; };
    };
} PERMISSIONS NONE;
-- 표시는 저절로 맞춰진다: 심사가 만들어지거나 구성이 바뀔 때, 정황이 접수되거나 상태·대리점이 바뀔 때
DEFINE EVENT t11_review ON review WHEN $event = 'CREATE' OR ($event = 'UPDATE' AND $before.members != $after.members) THEN {
    fn::signal_mark($after.id);
};
DEFINE EVENT t11_signal ON signal WHEN $event = 'CREATE' OR ($event = 'UPDATE' AND ($before.state != $after.state OR $before.dealers != $after.dealers)) THEN {
    FOR $r IN (SELECT VALUE id FROM review WHERE fixed = NONE) { fn::signal_mark($r); };
};

-- 지금 역할이 그 정황에 요청·기각을 할 수 있는지. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::rulable($s: record<signal>) -> bool {
    RETURN $auth.role = '내부 감시' AND $s.state = '접수';
} PERMISSIONS FULL;
-- 조치마다 고를 수 있는 사유의 분류. 기각은 사유가 필수이고 요청은 선택이다(D41)
DEFINE FUNCTION fn::ruling_classes($kind: string) -> array<string> {
    RETURN { '요청': ['기타'], '기각': ['부족', '정상', '기타'] }[$kind] ?? [];
} PERMISSIONS FULL;

-- 정황의 결정: 내부 감시가 요청 또는 기각을 고른 것. 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다
DEFINE TABLE ruling SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE fn::rulable(signal) AND kind INSIDE ['요청', '기각'] AND fn::reason(kind = '기각', fn::ruling_classes(kind), reason);
DEFINE FIELD signal ON ruling TYPE record<signal>;
DEFINE FIELD kind ON ruling TYPE string;
DEFINE FIELD by ON ruling TYPE option<record<staff>> VALUE $auth.id;   -- 선 28: 정황 → 직원. 사유와 날짜를 함께 둔다(D41)
DEFINE FIELD role ON ruling TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON ruling TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD reason ON ruling TYPE option<object> FLEXIBLE;            -- 사유 { class 분류, memo 메모 }
DEFINE FIELD stamp ON ruling TYPE datetime VALUE time::now() READONLY; -- 순서를 가리는 데만 쓴다
DEFINE FIELD source ON ruling TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;

-- 결정이 내려지면: 정황의 상태가 그 낱말이 되고 정황 작업이 끝난다.
-- 뒤 티켓은 `DEFINE EVENT … ON ruling WHEN $event = 'CREATE' AND $after.kind = '요청'`으로 뒤따를 일(소명, 발송 작업)을 건다
DEFINE EVENT t11_apply ON ruling WHEN $event = 'CREATE' THEN {
    UPDATE $after.signal SET state = $after.kind;
    UPDATE task SET state = '완료' WHERE target = $after.signal AND kind = '정황' AND state != '완료';
};

-- 근거 한 줄: 가리키는 기록의 값을 그 기록에서 읽는다(근거 표, 보고의 사실이 같이 쓴다. AI의 글이 아니다).
-- 새 종류의 기록을 근거로 다는 티켓은 `DEFINE FUNCTION OVERWRITE`로 갈래를 더한다
DEFINE FUNCTION fn::evidence($e: record) -> object {
    LET $t = record::tb($e);
    LET $v = IF $t = 'deposit' THEN { item: '회수', dealer: ($e->deposit_of->dealer)[0], at: time::format($e.date, '%Y-%m-%d'), node: ($e->deposit_into->account)[0], amount: $e.amount }
        ELSE IF $t = 'payout' THEN { item: '지급', dealer: ($e->payout_of->dealer)[0], ym: $e.ym, amount: $e.amount }
        ELSE IF $t INSIDE ['rep', 'addr', 'acct'] THEN { item: { rep: '대표자', addr: '주소', acct: '계좌' }[$t], dealer: $e.in, node: $e.out }
        ELSE IF $t = 'recon' THEN { item: '대사', dealer: ($e.payout->payout_of->dealer)[0], ym: $e.payout.ym, value: array::join($e.diff, ' · '),
            want: { amount: $e.amount, accounts: $e.accounts }, got: { amount: $e.reply.amount, account: $e.reply.account } }
        ELSE { item: $t } END;
    RETURN {
        id: <string> $e, item: $v.item, at: $v.at, ym: $v.ym, amount: $v.amount, value: $v.value, want: $v.want, got: $v.got,
        dealer: IF $v.dealer THEN { id: record::id($v.dealer), name: $v.dealer.name } END,
        node: IF $v.node THEN { id: <string> $v.node, name: $v.node.value ?? $v.node.name } END,
        source: $e.source, file: $e.file.path, row: $e.row,
    };
} PERMISSIONS FULL;

-- 대사의 불일치(08, D45·D49)는 대사 정황으로 접수된다. 대상은 그 대리점이고 근거는 그 대사 기록이다(같은 대리점의 불일치는 한 정황에 모인다)
DEFINE EVENT t11_recon ON recon WHEN $event = 'CREATE' AND $after.verdict = '불일치' THEN {
    LET $d = ($after.payout->payout_of->dealer)[0];
    fn::signal('대사', record::id($d), $d.name, [$d], [$after.id], '계산');
};

-- 10과 11을 잇는다(정황의 id는 `추인-묶음-<묶음 id>` — 10의 추인 작업 `task:추인-<묶음 id>`와 겹치지 않게). D52: 영업임원이 재검토 묶음을 거부하면 그 묶음(그룹 × 귀속월)이 추인 정황으로 접수된다
DEFINE EVENT t11_refused ON ratify WHEN $event = 'UPDATE' AND $after.marks CONTAINS '거부' AND $before.marks CONTAINSNOT '거부' THEN {
    fn::signal('추인', string::concat('묶음-', record::id($after.id)), string::concat($after.name, ' ', $after.ym), $after.members, $after.reviews, '계산');
};
-- D53: 내부 감시가 추인 정황을 기각하면 그 묶음은 종결된다(영업임원에게 추인 작업이 다시 가지 않는다)
DEFINE EVENT t11_refused_close ON ruling WHEN $event = 'CREATE' AND $after.kind = '기각' AND $after.signal.kind = '추인' THEN {
    fn::ratify_close(type::record('ratify', string::replace(record::id($after.signal), '추인-묶음-', '')), $after);
};
