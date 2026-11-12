-- 14 재심사: 승인은 났지만 지급 전(대기)인 건이 변경 등으로 승인권자가 올라가면(D33, D11) 그 지급은 재심사가 되고,
-- 앞선 승인은 기록으로 남되 효력을 잃는다(심사의 표시 '재심사'. 승인 결정과 이력은 그대로). 올바른 승인권자의 승인이 나면 지급이 다시 대기가 된다.
-- 재심사는 규정으로 계산한 승인권자만 따진다(정황의 가설(12)은 따지지 않는다). 이미 이체·완료인 지급은 재심사가 아니라 재검토(09)다.
-- 계산은 코드(t14_redo::rework)가 하고 이 테이블은 그 기록이다. 역할은 읽기만 한다. 16 경위가 지급 → 앞선 승인 → 변경(cause)으로 거슬러 오른다.

DEFINE TABLE redo SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD payout ON redo TYPE record<payout>;                  -- 재심사가 된 지급
DEFINE FIELD was ON redo TYPE record<review>;                     -- 효력을 잃은 앞선 승인(심사)
DEFINE FIELD cause ON redo TYPE option<record<incident>>;         -- 원인: 그 구성원의 승인 뒤에 들어온 가장 늦은 변경(없으면 규정의 바뀜 등)
DEFINE FIELD at ON redo TYPE datetime;
DEFINE FIELD back ON redo TYPE option<record<review>>;            -- 다시 승인한 심사
DEFINE FIELD back_at ON redo TYPE option<datetime>;
DEFINE FIELD source ON redo TYPE string;
DEFINE FIELD stamp ON redo TYPE datetime VALUE time::now() READONLY;

-- 승인이 나면: 그 심사의 지급 가운데 재심사인 것은 다시 대기가 되고 그 심사를 가리킨다(지급 작업은 처음 것 그대로다. t07_task는 상태가 이미 있는 지급을 건드리지 않는다)
DEFINE EVENT t14_back ON decision WHEN $event = 'CREATE' AND $after.kind = '승인' THEN {
    LET $r = $after.review;
    LET $ps = $r.payouts;
    -- 재승인한 역할도 지급 작업을 진행에서 본다
    UPDATE task SET also = array::union(also, [$after.role]) WHERE kind = '지급' AND target INSIDE (SELECT VALUE id FROM payout WHERE state = '재심사' AND id INSIDE $ps);
    UPDATE redo SET back = $r, back_at = fn::today() WHERE back = NONE AND payout.state = '재심사' AND payout INSIDE $ps;
    UPDATE payout SET state = '대기', state_source = $after.source, review = $r WHERE state = '재심사' AND id INSIDE $ps;
};
