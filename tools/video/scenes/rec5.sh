#!/bin/bash
# 장면 5 필수 확장 · 다른 부서 영향 녹화. 준비: 장면 3의 상태(주소 변경까지).
source "$(dirname "$0")/../lib.sh"; eval "$(python3 $HERE/cuetimes.py $HERE/scenes/s5.json $W)"
: > $MARKS
source $HERE/scenes/prep-change.sh change || exit 9
role_quiet 영업임원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref '2,218,474') >/dev/null; sleep 3
prep; A mouse move 700 500 >/dev/null
recstart 1
stage version
at $(python3 -c "print($S1-0.5)"); scrollto "h2:재검토" 12; foc "h2:재검토"
pt "단독" $C0; pt "2곳" $C1
at $(python3 -c "print($S2+5.6)"); top
tap @$(ref 'button "경위"') 450; sleep 1.5
stage trace
scrollto "h2:그림" 12; foc "h2:그림"
pt "한라인상사34 주소" $C2
at $(python3 -c "print($C2+4.6)")
clear; wide; setrole 회계·자금; tap @$(ref 'button "작업"') 400; sleep 1.8
stage acct
pt "재심사" $C3
at $(python3 -c "print($C3+2.5)")
clear; setrole "내부 감시"; tap @$(ref 'button "작업"') 400; sleep 1.8; tap @$(ref 'row "동명 · 박준호') 450; sleep 2.5
stage audit
pre "새" "대표자 이름만 같고 주소 · 계좌가 달라 근거 부족"
pt "새" $C4; pt "대표자 이름만 같고 주소 · 계좌가 달라 근거 부족" $C5
sleep 5; clear; wide
recstop 1
