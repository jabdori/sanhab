-- 20 소명: 서류가 접수된 소명을 내부 감시가 인정·불인정·보완으로 정한다(D12, D13, D31, D41, 선 17·18·19).
-- 인정이면 그 대리점의 해당 식별자 선에 소명으로 제외가 붙고(효력은 서류가 입증하는 기간), 그 소명의 정황이 해소된다. 그룹·심사의 재계산은 처리기가 이어서 한다.
-- 불인정은 관련자가 유지된다(아무것도 바꾸지 않는다). 보완이면 영업지원에 발송 작업이 다시 생기고 그동안 관련자로 계속 본다.
-- 역할이 쓰는 것은 결과(verdict)를 만드는 것 하나뿐이고 내부 감시만 할 수 있다. 사유(분류)는 셋 다 필수다(D41).

-- 선 1~3에 소명으로 제외한 기간과 그 소명(선 17). 기간의 한쪽이 없으면 그쪽은 끝이 없다. 03의 links()가 읽는다
DEFINE FIELD ex_from ON rep TYPE option<datetime>;
DEFINE FIELD ex_to ON rep TYPE option<datetime>;
DEFINE FIELD excused ON rep TYPE option<record<clarify>>;
DEFINE FIELD ex_from ON addr TYPE option<datetime>;
DEFINE FIELD ex_to ON addr TYPE option<datetime>;
DEFINE FIELD excused ON addr TYPE option<record<clarify>>;
DEFINE FIELD ex_from ON acct TYPE option<datetime>;
DEFINE FIELD ex_to ON acct TYPE option<datetime>;
DEFINE FIELD excused ON acct TYPE option<record<clarify>>;

-- 대리점이 먼저 낸 소명(D59): 정황 없이 열린다. 소명한 대리점(dealer)과 상대(pair의 둘째), 일치 종류(kind). 정황에서 시작한 소명은 둘 다 비어 있다
DEFINE FIELD OVERWRITE signal ON clarify TYPE option<record<signal>>;
DEFINE FIELD pair ON clarify TYPE option<array<record<dealer>>>;
DEFINE FIELD kind ON clarify TYPE option<string> ASSERT $value = NONE OR $value IN ['대표자', '주소', '계좌'];
-- 소명의 두 대리점(소명한 쪽이 먼저): 대리점이 낸 소명은 pair, 정황에서 시작한 소명은 그 정황의 대리점들
DEFINE FUNCTION fn::pair($c: record<clarify>) -> option<array<record<dealer>>> {
    RETURN $c.pair ?? $c.signal.dealers;
} PERMISSIONS FULL;

-- 서류가 입증하는 기간(D31): 가장 나중 서류의 정리 값 가운데 기간(`YYYY-MM-DD~YYYY-MM-DD`). 꼴이 맞지 않거나 없으면 NONE(기본값: 제한 없음)
DEFINE FUNCTION fn::span($c: record<clarify>) -> option<array<datetime>> {
    LET $d = (SELECT tidy, stamp FROM doc WHERE clarify = $c ORDER BY stamp DESC LIMIT 1)[0];
    LET $v = ($d.tidy ?? []).filter(|$t| $t.item = '기간')[0].value;
    LET $p = string::split($v ?? '', '~');
    LET $ok = array::len($p) = 2 AND $p.all(|$x| string::len($x) = 10 AND string::is_datetime(string::concat($x, 'T00:00:00Z'), '%Y-%m-%dT%H:%M:%SZ'));
    RETURN IF $ok AND $p[0] <= $p[1] THEN $p.map(|$x| <datetime> string::concat($x, 'T00:00:00Z')) END;
} PERMISSIONS FULL;

-- 인정하면 제외될 선: 서류가 다루는 종류(발송한 서류 목록의 일치 종류)마다, 소명한 대리점(정황의 첫 대리점)의 선 가운데
-- 정황의 나머지 대리점이 지금 가리키는 같은 노드를 가리키는 것. 이미 제외된 선은 뺀다.
-- 주소 서류(임대차계약서)가 있으면 주소만 본다: 서류를 읽어 견주는 것은 임대차계약서뿐이고 그것이 입증하는 것은 주소다(통장 사본·생년월일 서류의 처리는 만들지 않았다, 스펙의 만들지 않는 것)
DEFINE FUNCTION fn::excusable($c: record<clarify>) -> array<record> {
    LET $all = array::distinct(($c.docs ?? []).map(|$d| $d[0]));
    LET $ks = IF '주소' IN $all THEN ['주소'] ELSE $all END;
    LET $o = array::slice(fn::pair($c), 1);
    LET $r = IF '대표자' IN $ks THEN (SELECT VALUE id FROM rep WHERE in = $c.dealer AND !excluded AND out IN (SELECT VALUE out FROM rep WHERE in IN $o AND !excluded AND since <= fn::today() AND (until = NONE OR until > fn::today()))) ELSE [] END;
    LET $a = IF '주소' IN $ks THEN (SELECT VALUE id FROM addr WHERE in = $c.dealer AND !excluded AND out IN (SELECT VALUE out FROM addr WHERE in IN $o AND !excluded AND since <= fn::today() AND (until = NONE OR until > fn::today()))) ELSE [] END;
    LET $k = IF '계좌' IN $ks THEN (SELECT VALUE id FROM acct WHERE in = $c.dealer AND !excluded AND out IN (SELECT VALUE out FROM acct WHERE in IN $o AND !excluded AND since <= fn::today() AND (until = NONE OR until > fn::today()))) ELSE [] END;
    RETURN array::concat($a, $k, $r);
} PERMISSIONS FULL;

-- 결과의 분류(가정: 스펙에 없어 정했다). 셋 다 사유가 필수이고 끝은 기타
DEFINE FUNCTION fn::verdict_classes($kind: string) -> array<string> {
    RETURN IF $kind = '인정' THEN ['입증', '기타'] ELSE IF $kind = '불인정' THEN ['일치', '서류', '기타'] ELSE IF $kind = '보완' THEN ['누락', '서류', '기타'] ELSE [] END;
} PERMISSIONS FULL;

-- 지금 역할이 그 소명의 결과를 정할 수 있는지: 내부 감시이고 서류가 접수된 상태다. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::decidable($c: record<clarify>) -> bool {
    RETURN $auth.role = '내부 감시' AND $c.state = '접수';
} PERMISSIONS FULL;

-- 결과(선 19: 소명 → 직원). 만들기만 하고 고치거나 지우지 못한다. 누가·언제·효력 기간은 DB가 채운다(보낸 값은 쓰이지 않는다)
DEFINE TABLE verdict SCHEMAFULL PERMISSIONS FOR select FULL
    FOR create WHERE fn::decidable(clarify) AND kind INSIDE ['인정', '불인정', '보완'] AND fn::reason(true, fn::verdict_classes(kind), reason);
DEFINE FIELD clarify ON verdict TYPE record<clarify>;
DEFINE FIELD kind ON verdict TYPE string ASSERT $value IN ['인정', '불인정', '보완'];
DEFINE FIELD by ON verdict TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON verdict TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON verdict TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD reason ON verdict TYPE option<object> FLEXIBLE;
DEFINE FIELD since ON verdict TYPE option<datetime> VALUE fn::span($this.clarify)[0];   -- 효력 기간(인정일 때 쓰인다)
DEFINE FIELD until ON verdict TYPE option<datetime> VALUE fn::span($this.clarify)[1];
DEFINE FIELD stamp ON verdict TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON verdict TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;

-- 결과가 만들어지면: 소명의 상태가 바뀌고 내부 감시의 소명 작업이 끝난다
--  인정: 선에 소명으로 제외가 붙고, 그 소명의 정황이 해소된다
--  보완: 발송과 기한이 비워지고(서류를 다시 받을 때까지 관련자로 계속 본다) 영업지원에 발송 작업이 다시 생긴다
DEFINE EVENT t20_verdict ON verdict WHEN $event = 'CREATE' THEN {
    LET $c = $after.clarify;
    LET $ls = IF $after.kind = '인정' THEN fn::excusable($c) ELSE [] END;
    UPDATE $c SET state = $after.kind;
    UPDATE task SET state = '완료' WHERE target = $c AND kind INSIDE ['소명', '미응답'];   -- 21: 결과가 나오면 미응답 작업도 닫는다(보완 포함)
    IF $after.kind = '인정' {
        UPDATE $ls SET excluded = true, ex_from = $after.since, ex_to = $after.until, excused = $c;
        IF $c.signal != NONE { UPDATE $c.signal SET state = '해소'; };   -- 정황에서 시작한 소명만(D59)
    };
    IF $after.kind = '보완' {
        UPDATE $c SET sent = NONE, due = NONE, body = NONE, docs = [];
        CREATE task SET kind = '발송', view = '소명', target = $c, role = '영업지원', also = ['내부 감시'], source = '계산';
    };
};

-- 보완 뒤의 발송과 서류 접수: 18·19의 조건에 보완을 더하고, 미응답 뒤에 늦게 낸 서류도 받는다(스펙에 없어 정한 기본값. 21)(발송이 비워져 있으면 다시 보낼 수 있고, 보낸 뒤에는 서류를 다시 올릴 수 있다)
DEFINE FUNCTION OVERWRITE fn::sendable($c: record<clarify>) -> bool {
    RETURN $auth.role = '영업지원' AND $c.state INSIDE ['요청', '보완'] AND $c.sent = NONE AND $c.pair = NONE;   -- 대리점이 먼저 낸 소명(D59)에는 요청서·발송이 없다
} PERMISSIONS FULL;
DEFINE FUNCTION OVERWRITE fn::uploadable($c: record<clarify>) -> bool {
    RETURN $auth.role = '영업지원' AND $c.state INSIDE ['요청', '보완', '미응답'] AND ($c.sent != NONE OR $c.pair != NONE);
} PERMISSIONS FULL;
-- 발송 표시는 소명마다 한 번이던 것을 보완의 횟수마다 한 번으로 푼다(같은 시도를 두 번 표시하지 못하게 하는 것은 그대로)
REMOVE INDEX dispatch_once ON dispatch;
DEFINE FIELD round ON dispatch TYPE int VALUE count(SELECT id FROM verdict WHERE clarify = $parent.clarify AND kind = '보완') READONLY;
DEFINE INDEX dispatch_round ON dispatch FIELDS clarify, round UNIQUE;
