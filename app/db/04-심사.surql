-- 04 심사: 규정(조항, 규칙 버전), 심사, 결정, 작업. (스펙의 선 7~13, 23, 24)
-- 선 7~13은 따로 선 테이블을 두지 않고 기록을 가리키는 필드로 둔다(선에 실을 값이 없다): 필드 이름 옆에 선 번호를 적는다.
-- 심사·작업·규칙은 코드(root)만 쓴다. 역할이 쓰는 것은 결정 하나뿐이고, 그 권한은 fn::can이 정한다.

-- 조항: 규정 문서의 한 대목. 문서는 원본 파일(origin)이다
DEFINE TABLE clause SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD title ON clause TYPE string;
DEFINE FIELD doc ON clause TYPE record<origin>;        -- 선 7: 조항 → 문서
DEFINE FIELD first ON clause TYPE int;                 -- 문서의 첫 행과 끝 행
DEFINE FIELD last ON clause TYPE int;
DEFINE FIELD text ON clause TYPE string;               -- 그 행들의 원문 그대로
DEFINE FIELD source ON clause TYPE string;

-- 규칙 버전: 조항을 계산할 수 있게 옮긴 것. 시행 기간(since ≤ 귀속월의 끝날 < until)으로 귀속월의 버전을 고른다(D6, D14)
DEFINE TABLE rule SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD name ON rule TYPE string;                 -- 한도, 합산
DEFINE FIELD ver ON rule TYPE int;
DEFINE FIELD value ON rule TYPE int;                   -- 한도: 금액. 합산: 관련자가 되는 일치 수
DEFINE FIELD clause ON rule TYPE record<clause>;       -- 선 8: 규칙 버전 → 조항
DEFINE FIELD since ON rule TYPE option<datetime>;      -- 시행일. 없으면 미상(규정 문서에 시행일이 없다)
DEFINE FIELD until ON rule TYPE option<datetime>;      -- 다음 버전의 시행일. 없으면 지금도 시행
DEFINE FIELD source ON rule TYPE string;

-- 심사: 한 그룹의 한 귀속월. 승인 전에는 코드가 다시 계산할 때마다 구성이 그룹을 따라 바뀌고, 승인하면 fixed가 찍혀 더는 바뀌지 않는다(D36)
DEFINE TABLE review SCHEMAFULL PERMISSIONS FOR select WHERE fn::sees() != '회계·자금' OR status = '승인';   -- 5단계: 회계·자금은 승인된 심사만
DEFINE FIELD ym ON review TYPE string;                 -- 귀속월
DEFINE FIELD name ON review TYPE string;               -- 목록과 제목에 보일 이름(금강상사11 외 2)
DEFINE FIELD members ON review TYPE array<record<dealer>>;   -- 선 10: 심사 → 대리점(구성)
DEFINE FIELD payouts ON review TYPE array<record<payout>>;   -- 선 9: 지급 → 심사(합산에 든 지급)
DEFINE FIELD rules ON review TYPE array<record<rule>>;       -- 선 11: 심사 → 규칙 버전
DEFINE FIELD total ON review TYPE int;                 -- 합산
DEFINE FIELD limit ON review TYPE int;                 -- 한도(적용한 규칙 버전의 값)
DEFINE FIELD approver ON review TYPE string ASSERT $value IN ['영업지원', '영업임원'];   -- 승인권자
DEFINE FIELD status ON review TYPE string DEFAULT '대기' ASSERT $value IN ['대기', '승인', '보류', '반려'];
DEFINE FIELD marks ON review TYPE array<string> DEFAULT [];  -- 심사의 표시(재검토, 추인, 종결, 정산, 정황). 뒤 티켓이 더한다
DEFINE FIELD fixed ON review TYPE option<datetime>;    -- 굳은 날. 있으면 구성·합산·승인권자·규칙 버전을 다시 계산하지 않는다
DEFINE FIELD source ON review TYPE string;

-- 조치: 심사에 내릴 수 있는 결정의 종류(id가 곧 낱말). 뒤 티켓은 자기 seed에서 줄을 더한다
DEFINE TABLE act SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD states ON act TYPE array<string>;         -- 심사가 이 상태일 때만
DEFINE FIELD to ON act TYPE option<string>;            -- 결정하면 심사가 이 상태가 된다. 없으면 그대로
DEFINE FIELD who ON act TYPE string;                   -- 역할 이름, 또는 '승인권자'(그 심사의 승인권자)
DEFINE FIELD mark ON act TYPE option<string>;          -- 심사에 이 표시가 있을 때만
DEFINE FIELD reason ON act TYPE bool DEFAULT false;    -- 사유(분류)가 필수인지

-- 지금 역할이 그 심사에 그 조치를 할 수 있는지. 결정의 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::can($kind: string, $review: record<review>) -> bool {
    LET $a = type::record('act', $kind);
    RETURN $a.states CONTAINS $review.status
        AND ($a.who = $auth.role OR ($a.who = '승인권자' AND $review.approver = $auth.role))
        AND ($a.mark = NONE OR $review.marks CONTAINS $a.mark);
} PERMISSIONS FULL;

-- 결정: 사람이 심사에 내린 것. 역할은 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다
DEFINE TABLE decision SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE fn::can(kind, review) AND (!type::record('act', kind).reason OR reason.class != NONE);
DEFINE FIELD review ON decision TYPE record<review>;   -- 선 12: 결정 → 심사
DEFINE FIELD kind ON decision TYPE string;
DEFINE FIELD by ON decision TYPE option<record<staff>> VALUE $auth.id;   -- 선 13: 결정 → 직원. 사유와 날짜를 함께 둔다(D41)
DEFINE FIELD role ON decision TYPE string VALUE $auth.role ?? $value;    -- 역할. 원본의 과거 결정은 코드가 원본의 값을 넣는다
DEFINE FIELD at ON decision TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD reason ON decision TYPE option<object> FLEXIBLE;            -- 사유 { class 분류, memo 메모 }
DEFINE FIELD stamp ON decision TYPE datetime VALUE time::now() READONLY; -- 순서를 가리는 데만 쓴다
DEFINE FIELD source ON decision TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;

-- 작업: 어느 역할이 무엇을 해야 하는지
DEFINE TABLE task SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD kind ON task TYPE string;                 -- 종류: 심사, 추인, 종결, 정황, 발송, 소명, 미응답, 지급, 대사, 재상신
DEFINE FIELD view ON task TYPE string;                 -- 고르면 열리는 화면(심사, 정황, 소명, 지급)
DEFINE FIELD target ON task TYPE record;               -- 선 23: 작업 → 대상
DEFINE FIELD role ON task TYPE string;                 -- 선 24: 담당하는 역할
DEFINE FIELD also ON task TYPE array<string> DEFAULT [];   -- 관여한 역할. 담당이 아니어도 "진행"에서 본다
DEFINE FIELD state ON task TYPE string DEFAULT '대기' ASSERT $value IN ['대기', '진행', '완료', '취소'];
DEFINE FIELD source ON task TYPE string;

-- 결정이 내려지면: 심사의 상태를 옮기고, 승인이면 굳히고 심사 작업을 끝낸다.
-- 뒤 티켓은 자기 스키마에서 `DEFINE EVENT … ON decision WHEN $event = 'CREATE' AND $after.kind = '…'`로 뒤따를 일을 건다
DEFINE EVENT t04_apply ON decision WHEN $event = 'CREATE' THEN {
    LET $to = type::record('act', $after.kind).to;
    IF $to { UPDATE $after.review SET status = $to; };
    IF $after.kind = '승인' {
        UPDATE $after.review SET fixed = $after.at;
        UPDATE task SET state = '완료' WHERE target = $after.review AND kind = '심사' AND state != '완료';
    };
};
