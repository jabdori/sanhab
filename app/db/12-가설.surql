-- 12 가설: 정황이 사실이라고 놓았을 때의 계산(D3, D29, D51). 계산은 03의 관련자 계산에 정황이 가리키는 일치를 더해 다시 하는 것이라 저장하지 않는다.
-- 저장하는 것은 가설에서 승인권자가 올라가는 심사와 정황의 표시(raised)뿐이다. 합산과 승인권자는 그대로다.

DEFINE FIELD raised ON review TYPE bool DEFAULT false;   -- 열린 정황의 가설에서 승인권자가 영업임원으로 올라가는 심사(가정: 영업임원의 담당으로 간다)
DEFINE FIELD raised ON signal TYPE bool DEFAULT false;   -- 그 정황의 가설에서 승인권자가 올라가는 심사가 있다(17의 의견은 조치 뒤에 열린다)

-- 그 심사에 승인권자의 조치를 하는 역할: 저장된 승인권자, 가설에서 올라가는 심사는 영업임원
DEFINE FIELD left ON review TYPE bool DEFAULT false;   -- D64: 등록 변경으로 그룹에서 빠진 대리점의 심사(변경한 영업지원이 바로 전결하지 못하게 영업임원으로)
DEFINE FUNCTION fn::holder($r: record<review>) -> string {
    RETURN IF $r.raised OR $r.left THEN '영업임원' ELSE $r.approver END;
} PERMISSIONS FULL;

-- 04·10의 조건과 같고 승인권자 자리만 fn::holder로 바꿨다(다른 티켓이 fn::can에 조건을 더하면 여기에도 더한다)
DEFINE FUNCTION OVERWRITE fn::can($kind: string, $review: record<review>) -> bool {
    LET $a = type::record('act', $kind);
    RETURN $a.states CONTAINS $review.status
        AND ($a.who = $auth.role OR ($a.who = '승인권자' AND fn::holder($review) = $auth.role))
        AND ($a.mark = NONE OR $review.marks CONTAINS $a.mark)
        AND !(($a.without ?? []) ANYINSIDE $review.marks)
        AND !($kind = '이견' AND count(SELECT id FROM decision WHERE review = $review AND kind = '이견') > 0);
} PERMISSIONS FULL;

DEFINE FUNCTION OVERWRITE fn::refusal($kind: string, $review: record<review>, $reason: option<object>) -> option<string> {
    LET $a = type::record('act', $kind);
    RETURN IF $a.id = NONE OR $review.id = NONE THEN '대상'
        ELSE IF !($a.who = $auth.role OR ($a.who = '승인권자' AND fn::holder($review) = $auth.role)) THEN '권한'
        ELSE IF !fn::can($kind, $review) THEN '상태'
        ELSE IF !fn::reason(fn::must($kind, $review), fn::classes($kind, $review), $reason) THEN '사유'
        END;
} PERMISSIONS FULL;

-- 17: 가설에서 승인권자가 올라가는 정황은 내부 감시가 조치를 내린 뒤에야 의견이 열린다
DEFINE FUNCTION OVERWRITE fn::gated($s: record) -> bool { RETURN $s.raised ?? false; } PERMISSIONS FULL;
