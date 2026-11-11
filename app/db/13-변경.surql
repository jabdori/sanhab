-- 13 변경: 영업지원이 대리점의 식별자 변경을 넣는다(D30). 입력은 사건(`incident`)으로 남고, 이벤트가 선 1~3을 바꾼다.
-- 이전 값은 지우지 않는다: 지금 유효한 선의 `until`을 변경일로 닫고(변경일 전날까지 유효), 새 값의 선을 변경일부터 잇는다.
-- 역할이 쓰는 것은 사건 하나뿐이다. 인지일(시스템의 오늘)·경로(신고)·출처(시연)·누가는 DB가 채운다.

-- 지금 역할이 변경을 넣을 수 있는지. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::changeable() -> bool {
    RETURN $auth.role = '영업지원';
} PERMISSIONS FULL;

DEFINE TABLE incident SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE fn::changeable() AND kind = '변경';
DEFINE FIELD kind ON incident TYPE string ASSERT $value IN ['변경'];
DEFINE FIELD dealer ON incident TYPE record<dealer>;                   -- 선 22: 사건 → 대상
DEFINE FIELD item ON incident TYPE string ASSERT $value IN ['대표자', '주소', '계좌'];
DEFINE FIELD value ON incident TYPE string ASSERT string::len(string::trim($value)) > 0;
DEFINE FIELD since ON incident TYPE datetime ASSERT $value <= fn::today();   -- 변경일. 오늘보다 뒤일 수 없다
DEFINE FIELD known ON incident TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;   -- 인지일
DEFINE FIELD via ON incident TYPE string VALUE IF $auth.id THEN '신고' ELSE $value END;            -- 경로
DEFINE FIELD by ON incident TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON incident TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON incident TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD source ON incident TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;
DEFINE FIELD stamp ON incident TYPE datetime VALUE time::now() READONLY;   -- 순서를 가리는 데만 쓴다

-- 새 값의 선이 어느 사건에서 왔는지(경위 16이 거슬러 오른다)
DEFINE FIELD incident ON rep TYPE option<record<incident>>;
DEFINE FIELD incident ON addr TYPE option<record<incident>>;
DEFINE FIELD incident ON acct TYPE option<record<incident>>;

-- 지금 유효한 값(오늘 유효한 선의 값): 대리점 목록과 변경의 검사가 쓴다
DEFINE FUNCTION fn::current($d: record<dealer>, $item: string) -> array {
    LET $t = { '대표자': 'rep', '주소': 'addr', '계좌': 'acct' }[$item];
    RETURN SELECT VALUE { since: since, value: out.value ?? out.name } FROM type::table($t) WHERE in = $d AND since <= fn::today() AND (until = NONE OR until > fn::today());
} PERMISSIONS FULL;

-- 변경이 들어오면: 그 항목의 열린 선을 변경일로 닫고, 새 값의 노드(같은 값은 노드 하나)로 선을 잇는다. 이벤트는 root 권한으로 실행된다
DEFINE EVENT t13_change ON incident WHEN $event = 'CREATE' THEN {
    LET $a = $after;
    LET $e = { since: $a.since, known: $a.known, via: $a.via, source: $a.source, incident: $a.id };
    IF $a.item = '대표자' {
        LET $n = type::record('person', $a.value);
        IF $n.id = NONE { CREATE $n SET name = $a.value, same = '미상', source = $a.source; };
        UPDATE rep SET until = $a.since WHERE in = $a.dealer AND until = NONE;
        RELATE ($a.dealer)->rep->$n CONTENT $e;
    } ELSE IF $a.item = '주소' {
        LET $n = type::record('address', $a.value);
        IF $n.id = NONE { CREATE $n SET value = $a.value, source = $a.source; };
        UPDATE addr SET until = $a.since WHERE in = $a.dealer AND until = NONE;
        RELATE ($a.dealer)->addr->$n CONTENT $e;
    } ELSE {
        LET $n = type::record('account', $a.value);
        IF $n.id = NONE { CREATE $n SET value = $a.value, source = $a.source; };
        UPDATE acct SET until = $a.since WHERE in = $a.dealer AND until = NONE;
        RELATE ($a.dealer)->acct->$n CONTENT $e;
    };
};
