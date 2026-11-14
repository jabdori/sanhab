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
        -- 거부된 추인의 정황(D52)은 이름을 `거부 · …`로(종류 낱말 추인은 결과와 반대로 읽힌다)
        CREATE $s SET kind = $kind, name = string::concat(IF $kind = '추인' THEN '거부' ELSE $kind END, ' · ', $name), dealers = $dealers, evidence = $evidence, source = $source;
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

-- 지연(D30, 기준이 가정이라 정황의 출처도 가정): 변경일과 인지일의 차이가 기준보다 크면 그 대리점의 지연 정황이 접수된다(근거는 그 변경)
DEFINE EVENT t15_late ON incident WHEN $event = 'CREATE' AND $after.known - $after.since > fn::delay() THEN {
    fn::signal('지연', record::id($after.dealer), $after.dealer.name, [$after.dealer], [$after.id], '가정');
};

-- 근거 한 줄(13의 fn::evidence)에 사건의 인지일과 변경일과의 차이(일)를 더했다. 이 함수를 다시 덮는 티켓은 이 갈래를 남긴다
DEFINE FUNCTION OVERWRITE fn::evidence($e: record) -> object {
    LET $t = record::tb($e);
    LET $v = IF $t = 'deposit' THEN { item: '회수', dealer: ($e->deposit_of->dealer)[0], at: time::format($e.date, '%Y-%m-%d'), node: ($e->deposit_into->account)[0], amount: $e.amount }
        ELSE IF $t = 'payout' THEN { item: '지급', dealer: ($e->payout_of->dealer)[0], ym: $e.ym, amount: $e.amount }
        ELSE IF $t INSIDE ['rep', 'addr', 'acct'] THEN { item: { rep: '대표자', addr: '주소', acct: '계좌' }[$t], dealer: $e.in, node: $e.out }
        ELSE IF $t = 'recon' THEN { item: '대사', dealer: ($e.payout->payout_of->dealer)[0], ym: $e.payout.ym, value: array::join($e.diff, ' · '),
            want: { amount: $e.amount, accounts: $e.accounts }, got: { amount: $e.reply.amount, account: $e.reply.account, owner: array::join(array::distinct((SELECT VALUE in.name FROM acct WHERE out.value = $e.reply.account AND excluded = false AND (until = NONE OR until > fn::today()))), ' · ') } }
        ELSE IF $t = 'incident' THEN { item: $e.kind, dealer: $e.dealer, at: time::format($e.since, '%Y-%m-%d'), node: (SELECT VALUE out FROM rep, addr, acct WHERE incident = $e)[0], value: $e.item,
            known: time::format($e.known, '%Y-%m-%d'), days: duration::days($e.known - $e.since) }
        ELSE IF $t = 'review' THEN { item: $e.name, ym: $e.ym, amount: $e.total }
        ELSE { item: $t } END;
    RETURN {
        id: <string> $e, item: $v.item, at: $v.at, ym: $v.ym, amount: $v.amount, value: $v.value, known: $v.known, days: $v.days, want: $v.want, got: $v.got,
        dealer: IF $v.dealer THEN { id: record::id($v.dealer), name: $v.dealer.name } END,
        node: IF $v.node THEN { id: <string> $v.node, name: $v.node.value ?? $v.node.name } END,
        source: $e.source, file: $e.file.path, row: $e.row,
    };
} PERMISSIONS FULL;
