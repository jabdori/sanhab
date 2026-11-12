-- 21 미응답: 시연자가 시스템의 오늘을 앞으로 넘기면(D43, 모의) 기한이 지난 요청 상태의 소명이 미응답이 되고 내부 감시에 미응답 작업이 생긴다(D32).
-- 지급을 멈추거나 관련자의 계산을 바꾸는 것은 없다: 소명이 끝나기 전에는 식별자 선을 건드리지 않으므로 03은 그 대리점을 관련자로 계속 본다. 지급을 멈출지는 승인권자가 정한다.

-- 오늘을 며칠 앞으로 옮긴다. 뒤로는 옮기지 못한다(1 이상). root(코드)만 부른다
DEFINE FUNCTION fn::advance($days: int) -> datetime {
    IF $days < 1 { THROW 'days'; };
    UPDATE meta:v SET today = today + duration::from_days($days);
    RETURN fn::today();
} PERMISSIONS FULL;

-- 기한이 지난 소명(요청 상태, 발송했고, 기한이 오늘보다 앞)을 미응답으로 옮기고 내부 감시의 미응답 작업을 만든다. 이미 미응답이면 건드리지 않는다
DEFINE FUNCTION fn::lapse() -> array<string> {
    LET $late = SELECT VALUE id FROM clarify WHERE state = '요청' AND sent != NONE AND due < fn::today() ORDER BY id;
    FOR $c IN $late {
        UPDATE $c SET state = '미응답';
        CREATE type::record('task', string::concat('미응답-', record::id($c))) SET kind = '미응답', view = '소명', target = $c, role = '내부 감시', also = ['영업지원'], source = '계산';
    };
    RETURN $late.map(|$c| record::id($c));
} PERMISSIONS FULL;
