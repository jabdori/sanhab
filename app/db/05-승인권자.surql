-- 05 승인권자: 사유의 규칙(D41, U3). 조치(act)마다 고를 수 있는 분류와, 사유가 필수가 되는 조건을 둔다.
-- 보류 같은 조치 자체는 seed가 act에 한 줄로 더한다(04의 규약).

DEFINE FIELD classes ON act TYPE array<string> DEFAULT [];   -- 이 조치에 고를 수 있는 사유의 분류. 비어 있으면 가리지 않는다
DEFINE FIELD need ON act TYPE array<string> DEFAULT [];      -- 심사에 이 표시가 있으면 사유 필수(11: UPDATE act:`승인` SET need = ['정황'])

-- 사유가 규칙에 맞는지: 필수이면 분류가 있어야 하고, 분류는 목록 안의 것이어야 하고, 기타이면 메모가 있어야 한다.
-- 심사가 아닌 대상(정황, 보고, 소명)의 결정도 자기 테이블의 권한에서 이것을 부른다
DEFINE FUNCTION fn::reason($must: bool, $classes: array<string>, $reason: option<object>) -> bool {
    LET $c = $reason.class;
    RETURN IF $c = NONE THEN !$must
        ELSE (array::len($classes) = 0 OR $c INSIDE $classes) AND ($c != '기타' OR string::trim($reason.memo ?? '') != '') END;
} PERMISSIONS FULL;

-- 그 심사에 그 조치를 할 때 사유가 필수인지
DEFINE FUNCTION fn::must($kind: string, $review: record<review>) -> bool {
    LET $a = type::record('act', $kind);
    RETURN $a.reason = true OR ($a.need ?? []) ANYINSIDE $review.marks;
} PERMISSIONS FULL;

-- 결정의 권한에 사유의 규칙을 더한다(04의 조건 fn::can은 그대로)
DEFINE TABLE OVERWRITE decision SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE fn::can(kind, review) AND fn::reason(fn::must(kind, review), type::record('act', kind).classes ?? [], reason);
