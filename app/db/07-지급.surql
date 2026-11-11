-- 07 지급: 승인된 심사의 지급마다 회계·자금의 지급 작업이 생기고, 회계·자금이 지급으로 표시하면 이체가 된다(D39, D40, D54. 완료는 08의 회신이 성공일 때다. 은행 연동은 없다 — 모의 처리).
-- 지급 작업의 대상은 원본의 지급(payout) 그대로다. 원본의 값(status: 승인·미지급·반려)은 건드리지 않고, 이 시스템의 상태는 state에 따로 둔다.
-- 역할이 쓰는 것은 지급 표시(remit) 하나뿐이고 나머지는 이벤트가 쓴다.

DEFINE FIELD state ON payout TYPE option<string> ASSERT $value = NONE OR $value IN ['대기', '재심사', '이체', '완료'];   -- 지급의 상태. 없으면 아직 승인된 심사에 들지 않은 것
DEFINE FIELD state_source ON payout TYPE option<string>;      -- 그 상태를 만든 것의 출처(사람의 조치면 시연). 대리점 상세가 상태 옆에 보인다
DEFINE FIELD review ON payout TYPE option<record<review>>;   -- 이 지급을 승인한 심사
DEFINE FIELD name ON payout TYPE option<string>;             -- 작업 목록의 "대상"(대리점 이름)
DEFINE FIELD total ON payout TYPE option<int>;               -- 작업 목록의 금액 열(04의 목록이 대상의 total을 읽는다)

-- 지금 역할이 그 지급을 지급으로 표시할 수 있는지. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::payable($p: record<payout>) -> bool {
    RETURN $auth.role = '회계·자금' AND $p.state = '대기';
} PERMISSIONS FULL;

-- 지급 표시: 회계·자금이 지급했다고 남긴 것. 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다. 지급 하나에 한 번뿐
DEFINE TABLE remit SCHEMAFULL PERMISSIONS FOR select FULL FOR create WHERE fn::payable(payout);
DEFINE FIELD payout ON remit TYPE record<payout>;
DEFINE FIELD by ON remit TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON remit TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON remit TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD stamp ON remit TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON remit TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;
DEFINE INDEX remit_once ON remit FIELDS payout UNIQUE;

-- 심사가 승인되면: 그 심사의 지급 가운데 아직 지급 작업이 없는 미지급마다 작업을 만든다.
-- (심사의 payouts에는 합산에 든 지급이 모두 있어, 앞서 굳은 심사가 승인한 지급도 들어 있다. 그것은 다시 만들지 않는다)
-- 담당은 회계·자금, 접수한 영업지원과 승인한 역할은 진행에서 본다
DEFINE EVENT t07_task ON decision WHEN $event = 'CREATE' AND $after.kind = '승인' THEN {
    FOR $p IN (SELECT VALUE id FROM payout WHERE id INSIDE $after.review.payouts AND status = '미지급' AND state = NONE) {
        UPDATE $p SET state = '대기', state_source = $after.source, review = $after.review, name = (->payout_of->dealer)[0].name, total = amount;
        CREATE task SET kind = '지급', view = '지급', target = $p, role = '회계·자금', also = array::union(['영업지원'], [$after.role]), source = '계산';
    };
};

-- 지급으로 표시되면: 지급은 이체(은행에 보냈고 회신을 기다린다. D54), 지급 작업은 끝난다. 뒤 티켓(08 대사)은 `DEFINE EVENT … ON remit WHEN $event = 'CREATE'`로 뒤따를 일을 건다
DEFINE EVENT t07_done ON remit WHEN $event = 'CREATE' THEN {
    UPDATE $after.payout SET state = '이체', state_source = $after.source;
    UPDATE task SET state = '완료' WHERE target = $after.payout AND kind = '지급';
};
