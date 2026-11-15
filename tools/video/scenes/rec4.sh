#!/bin/bash
# 장면 4 정보 부족 · 승인 거절 녹화. 준비(녹화 밖): 장면 3의 준비 + 주소 변경. 클립 다섯, 사이의(소명 요청 · 역할 전환 포함) 대리점 쪽 모의 동작은 녹화 밖.
source "$(dirname "$0")/../lib.sh"; eval "$(python3 $HERE/cuetimes.py $HERE/scenes/s4.json $W)"
: > $MARKS
openrow(){ A click @$(A snapshot -i | grep -E "row \"$1" | ${2:-head} -1 | grep -oE 'e[0-9]+') >/dev/null; }
source $HERE/scenes/prep-change.sh change || exit 9
# waitread [글]: 판독 영역이 생기고(글을 주면 그 글도 보일 때까지) 기다린다 — 두 번째 제출은 앞 판독이 이미 있어 새 값으로 확인
waitread(){ for i in $(seq 1 20); do [ "$(A eval "[...document.querySelectorAll('h2')].some(h=>h.textContent.trim().startsWith('판독'))&&document.body.innerText.includes($(js "${1:-판독}"))")" = true ] && return; sleep 3; A click @$(ref 'button "작업"') >/dev/null; sleep 1.5; openrow "동명 · 박준호" tail; sleep 3; done; echo "✗ 판독이 끝나지 않음" >&2; exit 9; }
# AI 요청서 초안이 다 쓰일 때까지(빈 글이면 발송이 막힌다)
waitdraft(){ for i in $(seq 1 60); do [ "$(A eval '(document.querySelector("textarea")?.value ?? "").trim().length>20')" = true ] && return; sleep 1; done; echo "✗ 요청서 초안이 비어 있음" >&2; }
role_quiet 영업임원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref '2,255,709') >/dev/null; sleep 3
prep; A mouse move 700 500 >/dev/null
recstart 1
stage hold
at 0.3; tap @$(ref 'button "보류"') 450; sleep 0.6; foc "css:dialog"
tap @$(ref 'combobox "분류"') 400; sleep .4; tap @$(ref 'option "소명"') 350
tap @$(ref 'textbox "메모"') 350; typeslow "소명 확인 뒤 판단"
pt "보류" $C0
at $(python3 -c "print($C0+0.5)"); tap @$(last 'button "보류"') 400; sleep 1; wide
recstop 1
# 내부 감시의 소명 요청은 녹화 밖(해설은 다음 클립 첫 문장): 역할 전환 두 번의 빈 시간을 뺀다
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호"; sleep 3
A click @$(ref 'button "요청"') >/dev/null; sleep 1; A click @$(last 'button "요청"') >/dev/null; sleep 2
role_quiet 영업지원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호\""; sleep 3; waitdraft; A mouse move 700 500 >/dev/null
recstart 2
stage draft
at 0.2; scrollto "h2:요청서" 12; foc "h2:요청서"
pt "h2:요청서" $C1
pt "발송" $C2; at $(python3 -c "print($C2+0.4)"); tap @$(ref 'button "발송"') 400; sleep 0.6; tap @$(last 'button "발송"') 400; sleep 1
log mock_on ""; tap @$(ref 'button "시연"') 400; sleep 0.5; tap @$(ref 'button "임대차계약서-3') 450; sleep 0.6; demo_off
scrollto "h2:접수" 12; tap @$(ref 'button "접수"') 450; sleep .5; tap @$(last 'button "접수"') 400; sleep 0.8; log mock_off ""
recstop 2
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호" tail; sleep 4; waitread; A mouse move 700 500 >/dev/null
recstart 3
stage read
at 0.2; scrollto "h2:판독" 12; foc "h2:판독"
pt "호실" $C3; pt "누락" $C4
pt "보완" $C5; at $(python3 -c "print($C5+0.5)"); tap @$(ref 'button "보완"') 400; sleep 0.8
tap @$(ref 'combobox "분류"') 400; sleep .4; tap @$(ref 'option "누락"') 350; tap @$(ref 'textbox "메모"') 350; typeslow "호실 없음"; sleep .3
tap @$(last 'button "보완"') 400; sleep 1.2
recstop 3
role_quiet 영업지원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호\""; sleep 3; waitdraft   # 보완 요청서 초안도 AI가 다 쓴 뒤에 발송(빈 글이면 막힌다)
A click @$(ref 'button "발송"') >/dev/null; sleep 1; A click @$(last 'button "발송"') >/dev/null; sleep 2
A click @$(ref 'button "시연"') >/dev/null; sleep 1; A click @$(ref 'button "임대차계약서-4') >/dev/null; sleep 1.5; demo_off
A click @$(ref 'button "접수"') >/dev/null; sleep 1; A click @$(last 'button "접수"') >/dev/null; sleep 4
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호" tail; sleep 4; waitread 제301호; A mouse move 700 500 >/dev/null
recstart 4
stage accept
at 0.2; scrollto "h2:판독" 12; foc "h2:판독"
pre "제301호" "205호" "불일치"; pt "제301호" $C6; pt "205호" $C7; pt "불일치" $C8
pt "인정" $C9; at $(python3 -c "print($C9+0.4)"); tap @$(ref 'button "인정"') 400; sleep 0.8
tap @$(ref 'combobox "분류"') 400; sleep .4; tap @$(ref 'option "입증"') 350; tap @$(ref 'textbox "메모"') 350; typeslow "301호로 다름"; sleep .3
tap @$(last 'button "인정"') 400; sleep 1.2; wide
recstop 4
# 영업지원으로 바꿔 6월 심사 두 건을 찾는 동작은 녹화 밖(역할 전환의 빈 시간을 뺀다) — 다음 클립은 찾은 화면에서 시작
role_quiet 영업지원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref 'radio "전체"') >/dev/null; A fill @$(ref 'searchbox "검색"') "한라인상사34" >/dev/null; newchat; sleep 2; A mouse move 700 500 >/dev/null
recstart 5
pt "1,353,657"
sleep 7; clear; wide
recstop 5
