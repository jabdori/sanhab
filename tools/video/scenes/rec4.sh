#!/bin/bash
# 장면 4 정보 부족 · 승인 거절 녹화. 준비(녹화 밖): 장면 3의 준비 + 주소 변경. 클립 셋, 사이의 대리점 쪽 모의 동작은 녹화 밖.
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
at 0.3; tap @$(ref 'button "보류"') 450; sleep 0.8; foc "css:dialog"
tap @$(ref 'combobox "분류"') 400; sleep .4; tap @$(ref 'option "소명"') 350
tap @$(ref 'textbox "메모"') 350; typeslow "같은 사업장인지 소명 확인 뒤 판단"
pt "보류" $C0
at $(python3 -c "print($C0+0.6)"); tap @$(last 'button "보류"') 400; sleep 1.2; wide
setrole "내부 감시"; tap @$(ref 'button "작업"') 400; sleep 1.8; tap @$(ref 'row "동명 · 박준호') 450; sleep 2.5
pt "요청" $C1
at $(python3 -c "print($C1+0.7)"); tap @$(ref 'button "요청"') 400; sleep 0.8; tap @$(last 'button "요청"') 400; sleep 2
setrole 영업지원; tap @$(ref 'button "작업"') 400; sleep 1.8
stage draft
tap @$(ref 'row "동명 · 박준호"') 450; sleep 2.5; waitdraft; scrollto "h2:요청서" 12; foc "h2:요청서"
pt "h2:요청서" $C2
pt "발송" $C3; at $(python3 -c "print($C3+0.5)"); tap @$(ref 'button "발송"') 400; sleep 0.8; tap @$(last 'button "발송"') 400; sleep 1.2
at $(python3 -c "print($C3+1.6)"); log mock_on ""; tap @$(ref 'button "시연"') 400; sleep 1; tap @$(ref 'button "임대차계약서-3') 450; sleep 1.2; demo_off; sleep .4
scrollto "h2:접수" 12; tap @$(ref 'button "접수"') 450; sleep .8; tap @$(last 'button "접수"') 400; sleep 2; log mock_off ""
recstop 1
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호" tail; sleep 4; waitread; A mouse move 700 500 >/dev/null
recstart 2
stage read
at 0.2; scrollto "h2:판독" 12; foc "h2:판독"
pt "호실" $C4; pt "누락" $C5
pt "보완" $C6; at $(python3 -c "print($C6+0.6)"); tap @$(ref 'button "보완"') 400; sleep 0.8
tap @$(ref 'combobox "분류"') 400; sleep .4; tap @$(ref 'option "누락"') 350; tap @$(ref 'textbox "메모"') 350; typeslow "임대 목적물의 호실이 없음"; sleep .3
tap @$(last 'button "보완"') 400; sleep 1.5
recstop 2
role_quiet 영업지원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호\""; sleep 3
A click @$(ref 'button "발송"') >/dev/null; sleep 1; A click @$(last 'button "발송"') >/dev/null; sleep 2
A click @$(ref 'button "시연"') >/dev/null; sleep 1; A click @$(ref 'button "임대차계약서-4') >/dev/null; sleep 1.5; demo_off
A click @$(ref 'button "접수"') >/dev/null; sleep 1; A click @$(last 'button "접수"') >/dev/null; sleep 4
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; openrow "동명 · 박준호" tail; sleep 4; waitread 제301호; A mouse move 700 500 >/dev/null
recstart 3
stage accept
at 0.2; scrollto "h2:판독" 12; foc "h2:판독"
pre "제301호" "205호" "불일치"; pt "제301호" $C7; pt "205호" $C8; pt "불일치" $C9
pt "인정" $C10; at $(python3 -c "print($C10+0.5)"); tap @$(ref 'button "인정"') 400; sleep 0.8
tap @$(ref 'combobox "분류"') 400; sleep .4; tap @$(ref 'option "입증"') 350; tap @$(ref 'textbox "메모"') 350; typeslow "호실 301호, 금강상사41 205호와 다름"; sleep .3
tap @$(last 'button "인정"') 400; sleep 1.5; wide
setrole 영업지원; tap @$(ref 'button "작업"') 400; sleep 1.5; tap @$(ref 'radio "전체"') 350; A fill @$(ref 'searchbox "검색"') "한라인상사34" >/dev/null; newchat; sleep 1.2
pt "1,353,657" $C11
sleep 9.5; clear; wide
recstop 3
