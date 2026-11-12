-- 17 보고: AI가 정황을 조사해 쓴 기록(D4, D22, D24)과 내부 감시의 채택·불채택(선 29).
-- AI는 DB를 읽기만 한다. 쓸 수 있는 것은 보고뿐이고, 그것도 DB의 권한이 강제한다: AI의 접속 계정(staff:ai, 역할 AI)에는 이 파일의 보고 말고는 쓰기 권한을 준 테이블이 없다.
-- 합산, 승인권자, 정황의 조치에는 보고가 쓰이지 않는다. 채택해도 계산은 그대로다.

-- AI의 접속 계정. 역할 AI는 다른 테이블의 권한 규칙($auth.role = …)에 하나도 걸리지 않는다
DEFINE FIELD OVERWRITE role ON staff TYPE string ASSERT $value IN ['영업지원', '영업임원', '내부 감시', '회계·자금', 'AI'];

-- 보고: 대상(정황 …)마다, 입력(대상의 종류·대리점·근거 기록과 그 값)마다 하나. 새 근거가 오면 입력이 달라져 새 보고가 만들어지고 이전 보고는 기록으로 남는다(D39)
-- 사실은 기록을 가리키기만 한다(선 21): ref는 가리킨 기록, text는 값 자리({dealer} {at} …)만 있는 틀이고 값은 보일 때 코드가 그 기록에서 읽는다
DEFINE TABLE report SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE $auth.role = 'AI' AND state = '대기'
    -- AI가 쓰는 보고의 상태는 대기·오류·검토뿐이다(채택·불채택은 내부 감시의 결정이 남길 때만). 검토로 올리려면 사실이 하나 이상이고 가리킨 기록이 모두 있어야 한다(없는 기록을 가리킨 보고는 올라가지 못한다).
    -- 수정 권한은 고치기 전과 뒤의 기록에 모두 적용되고, 고치기 전이 대기였는지는 아래 이벤트가 본다
    FOR update WHERE $auth.role = 'AI' AND state INSIDE ['대기', '오류', '검토']
        AND (state != '검토' OR (array::len(facts) > 0 AND facts.all(|$f| $f.ref.id != NONE)));
DEFINE FIELD target ON report TYPE record;                    -- 선 20: 보고 → 대상(지금은 정황. 소명·사건은 그 티켓이 같은 필드를 쓴다)
DEFINE FIELD input ON report TYPE string;                     -- 입력의 해시. 같은 입력에는 저장된 보고를 쓴다
DEFINE FIELD state ON report TYPE string DEFAULT '대기' ASSERT $value IN ['대기', '오류', '검토', '채택', '불채택'];
DEFINE FIELD facts ON report TYPE array<object> DEFAULT [];
DEFINE FIELD facts.*.ref ON report TYPE record;               -- 선 21: 보고 → 가리킨 기록
DEFINE FIELD facts.*.text ON report TYPE string;
DEFINE FIELD guess ON report TYPE array<string> DEFAULT [];     -- 추정
DEFINE FIELD unknown ON report TYPE array<string> DEFAULT [];   -- 미확인
DEFINE FIELD opinion ON report TYPE option<object>;             -- 의견: { action 요청·기각, text }
DEFINE FIELD opinion.action ON report TYPE string ASSERT $value INSIDE ['요청', '기각'];
DEFINE FIELD opinion.text ON report TYPE string;
DEFINE FIELD counter ON report TYPE option<string>;             -- 반론
DEFINE FIELD model ON report TYPE string;
DEFINE FIELD reads ON report TYPE int DEFAULT 0;                -- AI가 DB를 읽은 횟수
DEFINE FIELD error ON report TYPE option<string>;               -- 오류의 까닭(낱말)
DEFINE FIELD at ON report TYPE datetime DEFAULT fn::today() READONLY;
DEFINE FIELD born ON report TYPE datetime DEFAULT time::now() READONLY;   -- 같은 대상의 보고 가운데 가장 새것을 가리는 데만 쓴다
DEFINE FIELD tried ON report TYPE datetime VALUE time::now();             -- 마지막 시도. 대기의 보고를 다시 시도할 간격을 잰다
DEFINE FIELD source ON report TYPE string DEFAULT 'AI' READONLY;
DEFINE INDEX report_target ON report FIELDS target;

-- AI는 대기인 보고만 고친다(오류와 검토로 올린 보고는 그대로 남는다). 이벤트는 고치는 쪽의 권한을 본다: 결정이 남길 때(root 이벤트)는 걸리지 않는다
DEFINE EVENT t17_guard ON report WHEN $event = 'UPDATE' AND $before.state != '대기' AND $auth.role = 'AI' THEN { THROW '상태'; };

-- 그 대상의 가장 새 보고
DEFINE FUNCTION fn::report_of($t: record) -> option<record<report>> {
    RETURN (SELECT id, born FROM report WHERE target = $t ORDER BY born DESC LIMIT 1)[0].id;
} PERMISSIONS FULL;

-- 의견이 조치 뒤에야 열리는 정황인가. 가설(12)에서 승인권자가 올라가는 정황이면 참이 되게 `DEFINE FUNCTION OVERWRITE fn::gated`로 덮어쓴다. 지금은 해당 정황이 없다
DEFINE FUNCTION fn::gated($s: record) -> bool { RETURN false; } PERMISSIONS FULL;
-- 의견을 볼 수 있는가: 조치 뒤에야 열리는 정황이 아니거나, 이미 조치(요청·기각)가 내려졌다
DEFINE FUNCTION fn::opened($s: record) -> bool {
    RETURN !fn::gated($s) OR count(SELECT id FROM ruling WHERE signal = $s) > 0;
} PERMISSIONS FULL;
-- 지금 역할이 그 보고를 채택·불채택할 수 있는가: 내부 감시이고, 올라와 있는(검토) 가장 새 보고이고, 의견이 열려 있다. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::adoptable($r: record<report>) -> bool {
    RETURN $auth.role = '내부 감시' AND $r.state = '검토' AND fn::report_of($r.target) = $r.id AND fn::opened($r.target);
} PERMISSIONS FULL;
-- 채택은 사유가 선택이고 불채택은 필수다(D41). 불채택의 분류는 보고의 어느 칸이 받아들여지지 않았는지
DEFINE FUNCTION fn::adoption_classes($kind: string) -> array<string> {
    RETURN { '채택': ['기타'], '불채택': ['추정', '의견', '기타'] }[$kind] ?? [];
} PERMISSIONS FULL;

-- 채택·불채택: 내부 감시가 남긴다. 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다(선 29)
-- opinion은 그 보고의 AI 의견이 고른 조치, acted는 그때까지 내부 감시가 정황에 내린 조치이고, same은 둘이 같은지다(조치가 아직 없으면 비어 있다)
DEFINE TABLE adoption SCHEMAFULL PERMISSIONS
    FOR select FULL
    FOR create WHERE fn::adoptable(report) AND kind INSIDE ['채택', '불채택'] AND fn::reason(kind = '불채택', fn::adoption_classes(kind), reason);
DEFINE FIELD report ON adoption TYPE record<report>;
DEFINE FIELD kind ON adoption TYPE string;
DEFINE FIELD by ON adoption TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON adoption TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON adoption TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD reason ON adoption TYPE option<object> FLEXIBLE;
DEFINE FIELD opinion ON adoption TYPE option<string> VALUE IF $auth.id THEN $this.report.opinion.action ELSE $value END;
DEFINE FIELD acted ON adoption TYPE option<string>
    VALUE IF $auth.id THEN (SELECT kind, stamp FROM ruling WHERE signal = $parent.report.target ORDER BY stamp DESC LIMIT 1)[0].kind ELSE $value END;
DEFINE FIELD same ON adoption TYPE option<bool>
    VALUE IF $auth.id THEN IF $this.acted = NONE THEN NONE ELSE $this.acted = $this.opinion END ELSE $value END;
DEFINE FIELD stamp ON adoption TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON adoption TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;

-- 결정이 남으면 보고의 상태가 그 낱말이 된다
DEFINE EVENT t17_apply ON adoption WHEN $event = 'CREATE' THEN {
    UPDATE $after.report SET state = $after.kind;
};
