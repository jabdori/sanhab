-- 06 반려: 승인권자가 심사를 반려하면 영업지원에 재상신 작업이 생기고, 영업지원이 재상신하면 심사가 대기로 돌아간다(D42).
-- 반려 자체는 seed가 act에 한 줄로 더한다(04의 규약). 반려된 심사는 굳지 않는다: 구성·합산·승인권자는 recalc가 계속 계산하는 그대로다.
-- 재상신에도 사유가 필수다(D55): 무엇을 바로잡았는지가 남는다.
-- 재상신은 결정이 아니라 영업지원이 남기는 기록이다(결정의 종류는 승인·보류·반려·추인). 그래서 재상신 뒤의 결정은 05의 prev로 그 반려 결정에 이어진다(선 30).
-- 역할이 쓰는 것은 재상신(resubmit) 하나뿐이고 나머지는 이벤트가 쓴다.

-- 지금 역할이 그 심사를 재상신할 수 있는지. 권한과 화면의 조치가 모두 이것을 쓴다. 원본의 과거 반려는 굳어 있어 재상신할 수 없다
DEFINE FUNCTION fn::resubmittable($r: record<review>) -> bool {
    RETURN $auth.role = '영업지원' AND $r.status = '반려' AND $r.fixed = NONE;
} PERMISSIONS FULL;

-- 재상신의 사유에 고를 수 있는 분류(D55)
DEFINE FUNCTION fn::resubmit_classes() -> array<string> {
    RETURN ['서류', '금액', '소명', '기타'];
} PERMISSIONS FULL;

-- 재상신: 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다. 사유는 필수이고 규칙은 05의 fn::reason
DEFINE TABLE resubmit SCHEMAFULL PERMISSIONS FOR select FULL FOR create WHERE fn::resubmittable(review) AND fn::reason(true, fn::resubmit_classes(), reason);
DEFINE FIELD review ON resubmit TYPE record<review>;
DEFINE FIELD by ON resubmit TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON resubmit TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON resubmit TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD reason ON resubmit TYPE option<object> FLEXIBLE;            -- 사유 { class 분류, memo 메모 }
DEFINE FIELD stamp ON resubmit TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON resubmit TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;

-- 반려되면: 그 심사의 심사 작업을 닫고, 영업지원에 재상신 작업을 만든다(반려한 역할은 진행에서 본다). 원본의 과거 반려에는 만들지 않는다(09)
DEFINE EVENT t06_task ON decision WHEN $event = 'CREATE' AND $after.kind = '반려' AND $after.source != '원본' THEN {
    UPDATE task SET state = '완료' WHERE target = $after.review AND kind = '심사';
    CREATE task SET kind = '재상신', view = '심사', target = $after.review, role = '영업지원', also = [$after.role], source = '계산';
};

-- 재상신되면: 심사는 대기로 돌아가고, 재상신 작업이 끝나고, 심사 작업이 승인권자의 담당에 다시 열린다
DEFINE EVENT t06_back ON resubmit WHEN $event = 'CREATE' THEN {
    UPDATE $after.review SET status = '대기';
    UPDATE task SET state = '완료' WHERE target = $after.review AND kind = '재상신';
    UPDATE task SET state = '대기' WHERE target = $after.review AND kind = '심사';
};

-- 그룹이 바뀌어 반려된 심사가 없어지면(04의 recalc) 그 재상신 작업도 지운다
DEFINE EVENT t06_gone ON review WHEN $event = 'DELETE' THEN {
    DELETE task WHERE target = $before.id AND kind = '재상신';
};
