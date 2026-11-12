-- 15 재접수: 늦은 인지는 지연 정황으로 접수되고(D30), 기각된 정황에 새 근거가 붙으면 다시 접수된다(이전 기각은 ruling에 남아 이력에 보인다).
-- 새 근거인지는 코드가 가린다: 결정(ruling)이 내려질 때의 근거(basis)와 지금의 근거를 견준다

-- "늦다"의 기준(가정, D30). 한 곳에만 둔다(정황 상세의 숫자 줄이 읽는다)
DEFINE FUNCTION fn::delay() -> duration { RETURN 30d; } PERMISSIONS FULL;

-- 결정이 내려질 때의 근거. DB가 채운다
DEFINE FIELD basis ON ruling TYPE array<record> VALUE $this.signal.evidence ?? [];

-- 마지막 결정 뒤에 붙은 근거(새 근거). 결정이 없으면 비어 있다
DEFINE FUNCTION fn::fresh($s: record<signal>) -> array<record> {
    LET $last = (SELECT basis FROM ruling WHERE signal = $s ORDER BY stamp DESC LIMIT 1)[0];
    RETURN IF $last = NONE THEN [] ELSE array::complement($s.evidence ?? [], $last.basis) END;
} PERMISSIONS FULL;

-- 11의 fn::signal에 재접수를 더했다: 기각된 정황에 새 근거가 붙으면 접수로 되돌리고 정황 작업을 다시 대기로 둔다
DEFINE FUNCTION OVERWRITE fn::signal($kind: string, $of: string, $name: string, $dealers: array<record<dealer>>, $evidence: array<record>, $source: string) -> record<signal> {
    LET $s = type::record('signal', string::concat($kind, '-', $of));
    IF $s.id = NONE {
        CREATE $s SET kind = $kind, name = string::concat($kind, ' · ', $name), dealers = $dealers, evidence = $evidence, source = $source;
        CREATE type::record('task', record::id($s)) SET kind = '정황', view = '정황', target = $s, role = '내부 감시', source = '계산';
    } ELSE {
        UPDATE $s SET dealers = array::union(dealers, $dealers), evidence = array::union(evidence, $evidence);
        IF $s.state = '기각' AND array::len(fn::fresh($s)) > 0 {
            UPDATE $s SET state = '접수';
            UPDATE type::record('task', record::id($s)) SET state = '대기';
        };
    };
    RETURN $s;
} PERMISSIONS NONE;

-- 지연(D30): 변경일과 인지일의 차이가 기준보다 크면 그 대리점의 지연 정황이 접수된다(근거는 그 변경)
DEFINE EVENT t15_late ON incident WHEN $event = 'CREATE' AND $after.known - $after.since > fn::delay() THEN {
    fn::signal('지연', record::id($after.dealer), $after.dealer.name, [$after.dealer], [$after.id], '계산');
};
