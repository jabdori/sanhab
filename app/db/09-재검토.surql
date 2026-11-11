-- 09 재검토: 원본의 1~5월 승인·반려를 과거의 결정으로 싣고(04의 심사 구조 그대로, 굳은 심사), 현재 계산으로 한도를 넘는 승인에 재검토 표시를 단다(D5, D11, D15).
-- 과거의 기록은 고치지 않는다. 현재 계산은 저장하지 않고 조회할 때 옆에 붙이며, 저장하는 것은 심사의 표시(marks의 '재검토') 하나다.

-- 원본의 승인에는 적용한 규칙 버전의 기록이 없다: 과거의 심사는 규칙(rules)이 비고 한도도 없다(미상)
DEFINE FIELD OVERWRITE limit ON review TYPE option<int>;
-- 원본에서 온 심사와 결정은 원본의 행을 가진다(02의 규약)
DEFINE FIELD file ON review TYPE option<record<origin>>;
DEFINE FIELD row ON review TYPE option<int>;
DEFINE FIELD file ON decision TYPE option<record<origin>> VALUE IF $auth.id THEN NONE ELSE $value END;
DEFINE FIELD row ON decision TYPE option<int> VALUE IF $auth.id THEN NONE ELSE $value END;
-- 원본의 반려에는 날짜가 없다(미상). 역할의 결정은 그대로 DB가 시스템의 오늘을 채운다
DEFINE FIELD OVERWRITE at ON decision TYPE option<datetime> VALUE IF $auth.id THEN fn::today() ELSE $value END;
