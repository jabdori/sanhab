-- 19 서류: 영업지원이 발송한 소명에 대리점의 서류를 올리면(접수) 소명이 접수가 되고 내부 감시의 소명 작업이 생긴다(D26, 선 18).
-- 판독(글자와 위치)은 업스테이지 OCR, 정리(항목의 조각을 가리키고 값을 다듬기)는 AI가 하고 코드(root)가 저장한다. 비교는 코드가 보일 때마다 계산한다(저장하지 않는다).
-- 서류의 원본은 이 테이블에 그대로 둔다(DB의 볼륨에 남으므로 다시 배포해도 남는다). 역할이 쓰는 것은 서류를 만드는 것 하나뿐이고 영업지원만 할 수 있다.

-- 지금 역할이 그 소명에 서류를 올릴 수 있는지: 영업지원이고, 발송한 뒤이고, 요청 상태다. 권한과 화면의 조치가 모두 이것을 쓴다
DEFINE FUNCTION fn::uploadable($c: record<clarify>) -> bool {
    RETURN $auth.role = '영업지원' AND $c.state = '요청' AND $c.sent != NONE;
} PERMISSIONS FULL;

-- 서류(선 18: 소명 → 서류). 원본은 data(base64)에 있다 — 목록을 읽을 때는 data를 고르지 않는다
DEFINE TABLE doc SCHEMAFULL PERMISSIONS FOR select FULL FOR create WHERE fn::uploadable(clarify);
DEFINE FIELD clarify ON doc TYPE record<clarify>;
DEFINE FIELD name ON doc TYPE string ASSERT string::len($value) > 0 AND string::len($value) <= 200;
DEFINE FIELD mime ON doc TYPE string ASSERT $value IN ['image/png', 'image/jpeg', 'application/pdf'];
DEFINE FIELD size ON doc TYPE int ASSERT $value > 0 AND $value <= 2097152;   -- 2MB(t19_docs.rs의 MAX와 같다)
DEFINE FIELD sha ON doc TYPE string;
DEFINE FIELD data ON doc TYPE string;
-- 판독: 첫 쪽의 낱말 [{ text, box: [x0, y0, x1, y1] }](위치는 쪽의 폭·높이에 대한 0~1). 역할이 만들 때는 비어 있다(값은 코드만 넣는다)
DEFINE FIELD read ON doc TYPE option<array<object>> VALUE IF $auth.id THEN NONE ELSE $value END;
DEFINE FIELD read.*.text ON doc TYPE string;
DEFINE FIELD read.*.box ON doc TYPE array<float>;
DEFINE FIELD read_model ON doc TYPE option<string> VALUE IF $auth.id THEN NONE ELSE $value END;
DEFINE FIELD read_tried ON doc TYPE option<datetime> VALUE IF $auth.id THEN NONE ELSE $value END;
-- 정리(AI): 항목마다 [{ item, words(판독 낱말의 번호), value(다듬은 값. 찾지 못했으면 NONE) }]
DEFINE FIELD tidy ON doc TYPE option<array<object>> VALUE IF $auth.id THEN NONE ELSE $value END;
DEFINE FIELD tidy.*.item ON doc TYPE string;
DEFINE FIELD tidy.*.words ON doc TYPE array<int>;
DEFINE FIELD tidy.*.value ON doc TYPE option<string>;
DEFINE FIELD tidy_model ON doc TYPE option<string> VALUE IF $auth.id THEN NONE ELSE $value END;
DEFINE FIELD tidy_tried ON doc TYPE option<datetime> VALUE IF $auth.id THEN NONE ELSE $value END;
DEFINE FIELD by ON doc TYPE option<record<staff>> VALUE $auth.id ?? $value;   -- 코드가 판독·정리를 넣을 때(root)는 그대로 둔다
DEFINE FIELD role ON doc TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON doc TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD stamp ON doc TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON doc TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;
DEFINE INDEX doc_clarify ON doc FIELDS clarify;

-- 서류가 접수되면: 소명이 접수가 되고 내부 감시의 소명 작업이 생긴다(영업지원은 진행에서 본다)
DEFINE EVENT t19_received ON doc WHEN $event = 'CREATE' THEN {
    UPDATE $after.clarify SET state = '접수';
    CREATE task SET kind = '소명', view = '소명', target = $after.clarify, role = '내부 감시', also = ['영업지원'], source = '계산';
};
