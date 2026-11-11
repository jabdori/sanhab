-- 08 대사: 지급이 끝나면 회계·자금의 대사 작업이 생기고, 회계·자금이 은행 회신을 넣으면 코드가 승인된 금액·등록된 계좌와 맞춰 본다(D45).
-- 은행 회신(reply)은 사람이 넣는 것(모의 처리, 출처 시연), 대사(recon)는 코드가 맞춰 본 결과(출처 계산)다.
-- 역할이 쓰는 것은 은행 회신 하나뿐이고 나머지는 이벤트가 쓴다.

-- 지금 역할이 그 지급에 은행 회신을 넣을 수 있는지. 권한과 화면의 조치가 모두 이것을 쓴다. 회신은 지급 하나에 한 번뿐
DEFINE FUNCTION fn::repliable($p: record<payout>) -> bool {
    RETURN $auth.role = '회계·자금' AND $p.state = '완료' AND count(SELECT id FROM reply WHERE payout = $p) = 0;
} PERMISSIONS FULL;

-- 은행 회신: 은행이 알려 준 실제 지급 결과. 만들기만 하고 고치거나 지우지 못한다. 누가·언제는 DB가 채운다
DEFINE TABLE reply SCHEMAFULL PERMISSIONS FOR select FULL FOR create WHERE fn::repliable(payout);
DEFINE FIELD payout ON reply TYPE record<payout>;
DEFINE FIELD amount ON reply TYPE int ASSERT $value >= 0;               -- 지급 금액
DEFINE FIELD account ON reply TYPE string ASSERT string::len($value) > 0;  -- 수취 계좌
DEFINE FIELD result ON reply TYPE string ASSERT $value IN ['성공', '실패'];  -- 처리 결과
DEFINE FIELD by ON reply TYPE option<record<staff>> VALUE $auth.id;
DEFINE FIELD role ON reply TYPE string VALUE $auth.role ?? $value;
DEFINE FIELD at ON reply TYPE datetime VALUE IF $auth.id THEN fn::today() ELSE $value END;
DEFINE FIELD stamp ON reply TYPE datetime VALUE time::now() READONLY;
DEFINE FIELD source ON reply TYPE string VALUE IF $auth.id THEN '시연' ELSE $value END;
DEFINE INDEX reply_once ON reply FIELDS payout UNIQUE;

-- 대사: 회신을 승인된 금액·등록된 계좌와 맞춰 본 결과. 맞춰 본 값은 그때의 것으로 굳혀 둔다.
-- 불일치도 여기에 기록으로 남는다. 정황(11)은 `DEFINE EVENT … ON recon WHEN $event = 'CREATE' AND $after.verdict = '불일치'`로 잇는다
DEFINE TABLE recon SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD payout ON recon TYPE record<payout>;
DEFINE FIELD reply ON recon TYPE record<reply>;
DEFINE FIELD review ON recon TYPE option<record<review>>;   -- 그 지급을 승인한 심사
DEFINE FIELD amount ON recon TYPE int;                      -- 승인된 금액
DEFINE FIELD accounts ON recon TYPE array<string>;          -- 등록된 계좌(맞춰 본 날 그 대리점에 유효한 것)
DEFINE FIELD diff ON recon TYPE array<string>;              -- 맞지 않은 항목: 금액, 계좌, 결과
DEFINE FIELD verdict ON recon TYPE string ASSERT $value IN ['일치', '불일치'];
DEFINE FIELD at ON recon TYPE datetime;
DEFINE FIELD source ON recon TYPE string;
DEFINE INDEX recon_once ON recon FIELDS payout UNIQUE;

-- 지급으로 표시되면: 회계·자금의 대사 작업이 생긴다. 진행으로 보는 역할은 그 지급의 지급 작업과 같다
DEFINE EVENT t08_task ON remit WHEN $event = 'CREATE' THEN {
    CREATE task SET kind = '대사', view = '지급', target = $after.payout, role = '회계·자금',
        also = (SELECT VALUE also FROM task WHERE target = $after.payout AND kind = '지급')[0] ?? [], source = '계산';
};

-- 은행 회신이 들어오면: 맞춰 보고 대사를 남긴다. 금액과 계좌가 같고 결과가 성공이면 일치, 하나라도 아니면 불일치.
-- 대사 작업은 끝나고, 그 심사가 승인한 지급이 모두 일치이면 심사에 정산 표시가 붙는다
DEFINE EVENT t08_match ON reply WHEN $event = 'CREATE' THEN {
    LET $p = $after.payout;
    LET $d = (SELECT VALUE out FROM payout_of WHERE in = $p)[0];
    LET $accounts = (SELECT VALUE out.value FROM acct WHERE in = $d AND since <= fn::today() AND (until = NONE OR until > fn::today()));
    LET $diff = array::flatten([
        IF $after.amount != $p.amount THEN ['금액'] ELSE [] END,
        IF $after.account NOTINSIDE $accounts THEN ['계좌'] ELSE [] END,
        IF $after.result != '성공' THEN ['결과'] ELSE [] END,
    ]);
    CREATE recon SET payout = $p, reply = $after.id, review = $p.review, amount = $p.amount, accounts = $accounts, diff = $diff,
        verdict = IF array::len($diff) = 0 THEN '일치' ELSE '불일치' END, at = fn::today(), source = '계산';
    UPDATE task SET state = '완료' WHERE target = $p AND kind = '대사';
    LET $r = $p.review;
    LET $ok = (SELECT VALUE payout FROM recon WHERE review = $r AND verdict = '일치');
    IF $r != NONE AND count(SELECT id FROM payout WHERE review = $r AND id NOTINSIDE $ok) = 0 {
        UPDATE $r SET marks += '정산' WHERE marks CONTAINSNOT '정산';
    };
};
