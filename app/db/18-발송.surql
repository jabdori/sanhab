-- 18 발송: 내부 감시가 정황에 요청을 내리면 소명이 요청 상태로 열리고, 영업지원의 발송 작업이 생긴다(D13, D17, D18, D32, D40). 영업지원이 요청서를 발송으로 표시하면 기한이 붙는다.
-- 발송은 표시일 뿐 실제로 보내지 않는다(모의 처리). 소명이 끝나기 전에는 식별자 선을 건드리지 않으므로 03의 계산은 그 대리점을 관련자로 계속 본다(D32, 선 17).
-- 소명은 코드(root)와 이벤트만 쓴다. 역할이 쓰는 것은 발송 표시(dispatch) 하나뿐이고, 영업지원만 만들 수 있다.

-- 소명(선 16: 누가 낸 소명인지 · 선 17: 무엇에 대한 소명인지. 지금은 정황). 19(서류 접수)·20(인정·불인정·보완)이 state와 서류를 이어 간다
DEFINE TABLE clarify SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD signal ON clarify TYPE record<signal>;                   -- 선 17
DEFINE FIELD dealer ON clarify TYPE record<dealer>;                   -- 선 16: 정황의 대상(첫 대리점)
DEFINE FIELD name ON clarify TYPE string;                             -- 작업 목록의 "대상"(정황의 이름)
DEFINE FIELD state ON clarify TYPE string DEFAULT '요청' ASSERT $value IN ['요청', '접수', '인정', '불인정', '보완', '미응답'];
DEFINE FIELD docs ON clarify TYPE array<array<string>> DEFAULT [];    -- 발송한 요청서의 서류 목록 [[일치의 종류, 서류]]. 발송 전에는 비어 있고 화면은 그때그때 계산한 목록을 보인다
DEFINE FIELD body ON clarify TYPE option<string>;                     -- 발송한 요청서의 글(영업지원이 고친 것. 없으면 서류 목록만 보냈다)
DEFINE FIELD sent ON clarify TYPE option<datetime>;                   -- 발송한 날(시스템의 오늘)
DEFINE FIELD due ON clarify TYPE option<datetime>;                    -- 기한: 발송한 날 + fn::term(). 지나면 미응답(뒤의 일)
DEFINE FIELD draft ON clarify TYPE option<string>;                    -- AI가 쓴 요청서 초안(값 자리 {dealer}만 있는 글). 사람이 채택하기 전에는 아무것도 바꾸지 않는다
DEFINE FIELD draft_model ON clarify TYPE option<string>;
DEFINE FIELD draft_tried ON clarify TYPE option<datetime>;            -- 초안을 마지막으로 시도한 때(AI가 멈춰 있으면 간격을 두고 다시 시도한다)
DEFINE FIELD born ON clarify TYPE datetime DEFAULT time::now() READONLY;   -- 열린 때(순서를 가리는 데만 쓴다)
DEFINE FIELD source ON clarify TYPE string;

-- 요청이 내려지면: 소명이 요청 상태로 열리고(id = 그 결정의 id), 영업지원의 발송 작업이 생긴다. 내부 감시는 진행에서 본다
DEFINE EVENT t18_request ON ruling WHEN $event = 'CREATE' AND $after.kind = '요청' THEN {
    LET $s = $after.signal;
    LET $c = type::record('clarify', record::id($after.id));
    CREATE $c SET signal = $s, dealer = $s.dealers[0], name = $s.name, source = '계산';
    CREATE type::record('task', string::concat('발송-', record::id($after.id))) SET kind = '발송', view = '소명', target = $c, role = '영업지원', also = ['내부 감시'], source = '계산';
};

-- 지금 역할이 그 소명의 요청서를 발송으로 표시할 수 있는지. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::sendable($c: record<clarify>) -> bool {
    RETURN $auth.role = '영업지원' AND $c.state = '요청' AND $c.sent = NONE;
} PERMISSIONS FULL;

-- 기한의 길이(가정, D32). 발송한 날부터 센다. 이 값 하나뿐이다
DEFINE FUNCTION fn::term() -> duration { RETURN 14d; } PERMISSIONS FULL;

-- 발송 표시: 영업지원이 요청서를 보냈다고 남긴 것. 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다. 소명 하나에 한 번뿐
DEFINE TABLE dispatch SCHEMAFULL PERMISSIONS FOR select FULL FOR create WHERE fn::sendable(clarify);
DEFINE FIELD clarify ON dispatch TYPE record<clarify>;
DEFINE FIELD body ON dispatch TYPE option<string> ASSERT $value = NONE OR string::len($value) <= 2000;
DEFINE FIELD docs ON dispatch TYPE array<array<string>>;
DEFINE FIELD due ON dispatch TYPE datetime VALUE fn::today() + fn::term();   -- 기한. DB가 채운다(보낸 값은 쓰이지 않는다)
DEFINE FIELD by ON dispatch TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON dispatch TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON dispatch TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD stamp ON dispatch TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON dispatch TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;
DEFINE INDEX dispatch_once ON dispatch FIELDS clarify UNIQUE;

-- 발송으로 표시되면: 소명에 요청서와 날짜·기한이 남고 발송 작업은 끝난다. 상태는 요청 그대로다(서류가 접수되면 19가 접수로 옮긴다)
DEFINE EVENT t18_sent ON dispatch WHEN $event = 'CREATE' THEN {
    UPDATE $after.clarify SET body = $after.body, docs = $after.docs, sent = $after.at, due = $after.due;
    UPDATE task SET state = '완료' WHERE target = $after.clarify AND kind = '발송';
};
