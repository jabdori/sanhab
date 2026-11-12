-- 24 대화(D61): 대화는 그래프의 노드다. 역할마다 따로 보이고, 업무 DB를 다시 적재해도 남는다(main.rs의 seed_all이 보관했다가 되살린다).
-- AI는 17의 읽기 전용 계정(staff:ai)으로 업무 기록만 읽는다. 대화는 서버(root)만 읽고 쓴다 — 다른 역할의 대화나 AI의 도구에는 보이지 않는다.
-- 근거(선 15)·경위(선 25)에는 들어가지 않는다. 공식 기록이 되는 길은 "보고로 남기기"(17의 report) 하나다.

-- 대화: role(역할), title(첫 말), target({ kind, id } 시작한 문맥 — 목록에 보이는 이름용), messages(AI SDK UI 메시지 목록), created, updated
DEFINE TABLE session SCHEMALESS PERMISSIONS NONE;
-- 대화 → 다룬 기록(시작한 문맥, 붙인 기록)
DEFINE TABLE about TYPE RELATION IN session SCHEMALESS PERMISSIONS NONE;
-- 대화 → AI가 답하며 읽은 기록(답 아래의 `조회`)
DEFINE TABLE reads TYPE RELATION IN session SCHEMALESS PERMISSIONS NONE;
