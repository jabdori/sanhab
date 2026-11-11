-- 05 승인권자: 사유의 규칙(D41, U3). 조치(act)마다 고를 수 있는 분류와, 사유가 필수가 되는 조건을 둔다.
-- 보류 같은 조치 자체는 seed가 act에 한 줄로 더한다(04의 규약).

DEFINE FIELD classes ON act TYPE array<string> DEFAULT [];   -- 이 조치에 고를 수 있는 사유의 분류. 비어 있으면 가리지 않는다
DEFINE FIELD over ON act TYPE option<object> FLEXIBLE;         -- 심사의 상태가 이 열쇠이면 classes 대신 이 목록을 쓴다(보류된 심사의 승인: { 보류: [...] }, D48)
DEFINE FIELD need ON act TYPE array<string> DEFAULT [];      -- 심사의 상태나 표시가 이 가운데 하나이면 사유 필수(보류된 심사의 승인, D48. 11: UPDATE act:`승인` SET need += '정황')

-- 사유가 규칙에 맞는지: 필수이면 분류가 있어야 하고, 분류는 목록 안의 것이어야 하고, 기타이면 메모가 있어야 한다.
-- 심사가 아닌 대상(정황, 보고, 소명)의 결정도 자기 테이블의 권한에서 이것을 부른다
DEFINE FUNCTION fn::reason($must: bool, $classes: array<string>, $reason: option<object>) -> bool {
    LET $c = $reason.class;
    RETURN IF $c = NONE THEN !$must
        ELSE (array::len($classes) = 0 OR $c INSIDE $classes) AND ($c != '기타' OR string::trim($reason.memo ?? '') != '') END;
} PERMISSIONS FULL;

-- 그 심사에 그 조치를 할 때 사유가 필수인지
DEFINE FUNCTION OVERWRITE fn::must($kind: string, $review: record<review>) -> bool {
    LET $a = type::record('act', $kind);
    RETURN $a.reason = true OR ($a.need ?? []) ANYINSIDE array::concat($review.marks, [$review.status]);
} PERMISSIONS FULL;

-- 그 심사에 그 조치를 할 때 고를 수 있는 분류
DEFINE FUNCTION fn::classes($kind: string, $review: record<review>) -> array<string> {
    LET $a = type::record('act', $kind);
    RETURN ($a.over ?? {})[$review.status] ?? $a.classes ?? [];
} PERMISSIONS FULL;

-- 결정의 권한에 사유의 규칙을 더한다(04의 조건 fn::can은 그대로)
DEFINE TABLE OVERWRITE decision SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE fn::can(kind, review) AND fn::reason(fn::must(kind, review), fn::classes(kind, review), reason);

-- 보류한 동안 그 심사의 작업은 진행이다(D48). 소명 결과가 나오면 20번이 대기로 되돌리고, 승인되면 04가 완료로 끝낸다
DEFINE EVENT t05_hold ON decision WHEN $event = 'CREATE' AND $after.kind = '보류' THEN {
    UPDATE task SET state = '진행' WHERE target = $after.review AND kind = '심사';
};

-- 선 30: 결정 → 같은 심사의 바로 앞 결정(보류를 푼 승인은 그 보류에 이어진다). 역할의 결정은 DB가 채운다
DEFINE FIELD prev ON decision TYPE option<record<decision>>
    VALUE IF $auth.id OR $value = NONE THEN (SELECT id, stamp FROM decision WHERE review = $parent.review ORDER BY stamp DESC LIMIT 1)[0].id ELSE $value END READONLY;
