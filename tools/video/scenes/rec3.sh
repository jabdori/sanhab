#!/bin/bash
# 장면 3 조건 변경 녹화. 준비(녹화 밖): 초기화 → 내부 감시가 동명 · 박준호 기각 → 영업지원이 한라인상사34 6월 전결.
source "$(dirname "$0")/../lib.sh"; eval "$(python3 $HERE/cuetimes.py $HERE/scenes/s3.json $W)"
: > $MARKS
source $HERE/scenes/prep-change.sh || exit 9
A click @$(ref 'button "대리점"') >/dev/null; sleep 2; A fill @$(ref 'searchbox "검색"') "한라인상사34" >/dev/null; sleep 1.5; A click @$(ref 'row "한라인상사34') >/dev/null; sleep 3
prep; A mouse move 700 500 >/dev/null
recstart 1
stage before
pt "박준호" $C0
at $(python3 -c "print($S1-0.3)"); scrollto "h2:지급" 12; foc "h2:지급"
pt "1,353,657" $C1
at $(python3 -c "print($S1+6.5)")
stage change
at 0.1; wide; top; tap @$(ref 'button "변경"') 450; sleep 0.8
pt "2026-07-01" $C2
pt "날짜 선택" $C3; A click @$(ref 'spinbutton "연도') >/dev/null; for k in 2 0 2 6 0 2 0 1; do A press $k >/dev/null; sleep 0.08; done
pt "css:input:not([type=radio])" $C4; A click @$(ref 'textbox "값"') >/dev/null; A fill @$(ref 'textbox "값"') "" >/dev/null; typeslow "고양시 중앙로 128"
pt "2026-07-01" $C5
at $(python3 -c "print($S3+2.6)"); tap @$(last 'button "변경"') 450; sleep 2.5
stage effect
at 0.2; wide; scrollto "h2:지급" 12; foc "h2:지급"
pre "2026-02" "2026-03"; pt "2026-02" $C6; pt "2026-03" $C7
at $(python3 -c "print($S6+0.5)"); clear
pre "2026-04" "2026-05" "2026-01"; pt "2026-04" $C8; pt "2026-05" $C9; pt "2026-01" $C10
pt "2026-06" $C11; pt "재심사" $C12
at $(python3 -c "print($C12+2.2)")
clear; wide; setrole 영업임원; tap @$(ref 'button "작업"') 400; sleep 1.8
stage exec
pre "2,218,474" "2,007,205" "2,255,709"; pt "2,218,474" $C13; pt "2,007,205" $C14; pt "2,255,709" $C15
at $(python3 -c "print($C15+1.5)"); clear; setrole "내부 감시"; tap @$(ref 'button "작업"') 400; sleep 1.8
stage audit
pre "동명 · 박준호" "지연 · 한라인상사34"; pt "동명 · 박준호" $C16; pt "지연 · 한라인상사34" $C17
at $(python3 -c "print($S11+4.2)"); clear; wide
recstop 1
