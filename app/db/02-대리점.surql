-- 02 대리점: 원본을 그래프로 적재한다(스펙의 노드와 선 1~6). 관련자·그룹은 저장하지 않는다(03번이 이 모양에서 계산한다).
-- 모든 기록에 출처(source)가 붙는다. 원본에서 온 기록은 원본 파일(file)과 행(row)을 가리킨다.
-- 역할은 읽기만 한다. 쓰기 권한은 그 조치를 만드는 티켓이 더한다.

-- 원본 파일과 내용 해시(sha256)
DEFINE TABLE origin SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD path ON origin TYPE string;
DEFINE FIELD sha ON origin TYPE string;

-- 대리점: 마스터의 한 행. id는 원본의 agency_id
DEFINE TABLE dealer SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD name ON dealer TYPE string;
DEFINE FIELD biz_no ON dealer TYPE string;
DEFINE FIELD eligible ON dealer TYPE bool;            -- 장려금 대상 여부
DEFINE FIELD registered ON dealer TYPE datetime;      -- 등록일
DEFINE FIELD source ON dealer TYPE string;
DEFINE FIELD file ON dealer TYPE option<record<origin>>;
DEFINE FIELD row ON dealer TYPE option<int>;

-- 사람·주소·계좌: 같은 값은 노드 하나(id가 곧 값). 여러 대리점이 같은 노드를 가리키는 모양에서 관련자가 계산된다
DEFINE TABLE person SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD name ON person TYPE string;
DEFINE FIELD same ON person TYPE string;              -- 동일인 여부. 원본에는 이름만 있어 미상(D9)
DEFINE FIELD source ON person TYPE string;
DEFINE TABLE address SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD value ON address TYPE string;
DEFINE FIELD source ON address TYPE string;
DEFINE TABLE account SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD value ON account TYPE string;
DEFINE FIELD source ON account TYPE string;

-- 선 1~3: 대리점 → 사람(대표자) / 주소 / 계좌. 유효 기간, 인지일, 경로, 출처, 소명으로 제외됨(D30, 스펙 "관계")
DEFINE TABLE rep TYPE RELATION IN dealer OUT person SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE TABLE addr TYPE RELATION IN dealer OUT address SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE TABLE acct TYPE RELATION IN dealer OUT account SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD since ON rep TYPE datetime;              -- 변경일. 원본은 등록일
DEFINE FIELD until ON rep TYPE option<datetime>;      -- 다음 값으로 바뀐 날. 없으면 지금도 유효
DEFINE FIELD known ON rep TYPE option<datetime>;      -- 인지일. 없으면 미상(D15)
DEFINE FIELD via ON rep TYPE string ASSERT $value IN ['신고', '회수', '소명', '원본'];   -- 경로
DEFINE FIELD excluded ON rep TYPE bool DEFAULT false; -- 소명으로 제외됨
DEFINE FIELD source ON rep TYPE string;
DEFINE FIELD file ON rep TYPE option<record<origin>>;
DEFINE FIELD row ON rep TYPE option<int>;
DEFINE FIELD since ON addr TYPE datetime;
DEFINE FIELD until ON addr TYPE option<datetime>;
DEFINE FIELD known ON addr TYPE option<datetime>;
DEFINE FIELD via ON addr TYPE string ASSERT $value IN ['신고', '회수', '소명', '원본'];
DEFINE FIELD excluded ON addr TYPE bool DEFAULT false;
DEFINE FIELD source ON addr TYPE string;
DEFINE FIELD file ON addr TYPE option<record<origin>>;
DEFINE FIELD row ON addr TYPE option<int>;
DEFINE FIELD since ON acct TYPE datetime;
DEFINE FIELD until ON acct TYPE option<datetime>;
DEFINE FIELD known ON acct TYPE option<datetime>;
DEFINE FIELD via ON acct TYPE string ASSERT $value IN ['신고', '회수', '소명', '원본'];
DEFINE FIELD excluded ON acct TYPE bool DEFAULT false;
DEFINE FIELD source ON acct TYPE string;
DEFINE FIELD file ON acct TYPE option<record<origin>>;
DEFINE FIELD row ON acct TYPE option<int>;

-- 지급: 한 대리점의 한 귀속월 장려금. status·approver·paid는 원본의 값 그대로(해석은 심사 티켓의 일)
DEFINE TABLE payout SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD ym ON payout TYPE string;                -- 귀속월
DEFINE FIELD sales ON payout TYPE int;
DEFINE FIELD amount ON payout TYPE int;
DEFINE FIELD status ON payout TYPE string;
DEFINE FIELD approver ON payout TYPE option<string>;
DEFINE FIELD paid ON payout TYPE option<datetime>;
DEFINE FIELD source ON payout TYPE string;
DEFINE FIELD file ON payout TYPE option<record<origin>>;
DEFINE FIELD row ON payout TYPE option<int>;

-- 회수: 대금을 받은 기록 한 건
DEFINE TABLE deposit SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD date ON deposit TYPE datetime;
DEFINE FIELD amount ON deposit TYPE int;
DEFINE FIELD ar ON deposit TYPE option<string>;
DEFINE FIELD source ON deposit TYPE string;
DEFINE FIELD file ON deposit TYPE option<record<origin>>;
DEFINE FIELD row ON deposit TYPE option<int>;

-- 선 4~6: 회수 → 대리점, 회수 → 계좌, 지급 → 대리점
DEFINE TABLE deposit_of TYPE RELATION IN deposit OUT dealer SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE TABLE deposit_into TYPE RELATION IN deposit OUT account SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE TABLE payout_of TYPE RELATION IN payout OUT dealer SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD source ON deposit_of TYPE string;
DEFINE FIELD source ON deposit_into TYPE string;
DEFINE FIELD source ON payout_of TYPE string;
