-- 10 추인: 재검토가 된 과거의 승인을 영업임원이 추인하거나 거부하고, 추인된 것을 내부 감시가 종결한다(D20, D25, D50, D52).
-- 추인·거부·종결·이견은 과거의 승인마다 결정(decision) 한 줄이고(선 30: 추인 → 과거의 승인), 과거의 승인 기록은 바뀌지 않는다.
-- 작업의 단위는 과거의 승인이 아니라 현재 계산의 그룹 × 귀속월이다(D50): 그 묶음이 ratify이고 추인·종결 작업의 대상이다.

-- 추인 작업의 대상: 한 그룹의 한 귀속월에서 재검토인 과거의 승인들. 코드(root)와 이벤트만 쓴다.
-- 영업임원이 결정하기 전에는 재검토 표시를 다시 맞출 때마다(09의 remark) 다시 만들어지고, 추인하거나 거부하면 그때의 값으로 남는다(fixed)
DEFINE TABLE ratify SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD ym ON ratify TYPE string;
DEFINE FIELD name ON ratify TYPE string;                          -- 현재 구성의 이름(금강상사11 외 2)
DEFINE FIELD members ON ratify TYPE array<record<dealer>>;        -- 현재 계산의 구성
DEFINE FIELD reviews ON ratify TYPE array<record<review>>;        -- 그 달의 재검토인 과거의 승인
DEFINE FIELD total ON ratify TYPE int;                            -- 현재 계산의 합산
DEFINE FIELD limit ON ratify TYPE int;
DEFINE FIELD approver ON ratify TYPE string;                      -- 현재 계산의 승인권자
DEFINE FIELD marks ON ratify TYPE array<string> DEFAULT ['재검토'];  -- 재검토 → 추인 또는 거부 → 종결(작업 목록의 표시)
DEFINE FIELD fixed ON ratify TYPE option<datetime>;               -- 영업임원이 추인하거나 거부한 날. 있으면 다시 만들지 않는다
DEFINE FIELD busy ON ratify TYPE option<bool>;                    -- 결정을 묶음의 나머지에 남기는 동안
DEFINE FIELD source ON ratify TYPE string;

-- 조치에 "심사에 이 표시 가운데 하나가 있으면 할 수 없다"를 더한다(추인하거나 거부한 심사를 다시 추인·거부하지 못하고, 종결된 심사에는 더 할 것이 없다)
DEFINE FIELD without ON act TYPE array<string> DEFAULT [];
DEFINE FUNCTION OVERWRITE fn::can($kind: string, $review: record<review>) -> bool {
    LET $a = type::record('act', $kind);
    RETURN $a.states CONTAINS $review.status
        AND ($a.who = $auth.role OR ($a.who = '승인권자' AND $review.approver = $auth.role))
        AND ($a.mark = NONE OR $review.marks CONTAINS $a.mark)
        AND !(($a.without ?? []) ANYINSIDE $review.marks);
} PERMISSIONS FULL;

-- 추인·거부·종결·이견 가운데 하나가 한 심사에 내려지면: 같은 묶음의 나머지 심사에도 같은 결정을 남긴다(추인 한 번이 그 달의 승인 모두에 남는다, D50).
-- 추인이면 추인 작업이 끝나고 내부 감시에 종결 작업이 생긴다. 거부이면 추인 작업이 끝난다(재검토 표시는 남고 거부 표시가 붙는다. 추인 정황의 접수는 정황 쪽이 건다, D52).
-- 종결이면 종결 작업이 끝난다. 이견이면 종결 작업이 진행으로 놓인다.
-- 심사의 상태(승인)는 바뀌지 않는다: 거부도 이견도 승인을 뒤집지 못한다(D25, D52)
DEFINE EVENT t10_spread ON decision WHEN $event = 'CREATE' AND $after.kind INSIDE ['추인', '거부', '종결', '이견'] THEN {
    IF $after.kind != '이견' { UPDATE $after.review SET marks += $after.kind; };
    LET $b = (SELECT * FROM ratify WHERE reviews CONTAINS $after.review AND busy = NONE)[0];
    IF $b != NONE {
        UPDATE $b.id SET busy = true;
        FOR $r IN $b.reviews.filter(|$r| $r != $after.review) {
            CREATE decision SET review = $r, kind = $after.kind, reason = $after.reason, by = $after.by, role = $after.role, at = $after.at, source = $after.source;
        };
        IF $after.kind = '추인' {
            UPDATE $b.id SET marks += '추인', fixed = $after.at;
            UPDATE task SET state = '완료' WHERE target = $b.id AND kind = '추인';
            CREATE task SET kind = '종결', view = '추인', target = $b.id, role = '내부 감시', also = [$after.role], source = '계산';
        } ELSE IF $after.kind = '거부' {
            UPDATE $b.id SET marks += '거부', fixed = $after.at;
            UPDATE task SET state = '완료' WHERE target = $b.id AND kind = '추인';
        } ELSE IF $after.kind = '종결' {
            UPDATE $b.id SET marks += '종결';
            UPDATE task SET state = '완료' WHERE target = $b.id AND kind = '종결';
        } ELSE {
            UPDATE task SET state = '진행' WHERE target = $b.id AND kind = '종결';
        };
        UPDATE $b.id SET busy = NONE;
    };
};

-- 거부된 묶음을 종결로 닫는다(D53: 거부된 추인의 정황을 내부 감시가 기각했을 때 11이 부른다). `$from`은 그 기각의 기록(reason, by, role, at, source)이다.
-- 묶음의 심사 하나에 종결 결정을 남기면 위의 이벤트가 나머지 심사와 묶음에 퍼뜨린다. 이력은 거부 다음에 종결이 되어 추인 없이 종결된 것이 드러난다
DEFINE FUNCTION fn::ratify_close($b: record<ratify>, $from: object) {
    IF $b.marks CONTAINS '거부' AND $b.marks CONTAINSNOT '종결' {
        CREATE decision SET review = $b.reviews[0], kind = '종결', reason = $from.reason, by = $from.by, role = $from.role, at = $from.at, source = $from.source;
    };
} PERMISSIONS NONE;
