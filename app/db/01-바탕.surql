-- 01 바탕: 시스템의 시계, 역할, 접속. (SurrealDB v4.0.1)
-- 초기화는 DB를 지우고 모든 티켓의 스키마와 적재를 다시 실행한다.

-- 시스템의 오늘(D43). 계산과 기록은 time::now()가 아니라 fn::today()를 쓴다.
DEFINE TABLE meta SCHEMAFULL PERMISSIONS FOR select FULL;
DEFINE FIELD today ON meta TYPE datetime;
DEFINE FIELD schema ON meta TYPE option<string>;   -- 적재할 때의 스키마 해시. 다르면 부팅 때 다시 적재한다
DEFINE FUNCTION fn::today() -> datetime { RETURN meta:v.today; } PERMISSIONS FULL;

-- 역할. 조치는 이 역할의 세션으로 실행되고 권한은 각 테이블의 PERMISSIONS가 강제한다($auth.role).
DEFINE TABLE staff SCHEMAFULL PERMISSIONS FOR select WHERE id = $auth.id;
DEFINE FIELD role ON staff TYPE string ASSERT $value IN ['영업지원', '영업임원', '내부 감시', '회계·자금'];
DEFINE FIELD pass ON staff TYPE string;
-- 5단계(역할별 읽기 범위): 읽는 범위의 역할. 사람은 자기 역할, AI 계정(17)은 대신 읽는 역할이다(쓰기 권한은 role이 정하므로 AI는 쓰지 못한다)
DEFINE FIELD sees ON staff TYPE option<string>;
DEFINE FUNCTION fn::sees() -> string { RETURN $auth.sees ?? $auth.role ?? ''; } PERMISSIONS FULL;
DEFINE ACCESS staff ON DATABASE TYPE RECORD
  SIGNIN (SELECT * FROM staff WHERE id = type::record('staff', $user) AND crypto::argon2::compare(pass, $pass))
  DURATION FOR TOKEN 12h, FOR SESSION 12h;
