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
at $(python3 -c "print($C1+2.8)"); top
tap @$(ref 'button "경위"') 450; sleep 1.5
stage trace
scrollto "h2:그림" 12; foc "h2:그림"
pt "한라인상사34 주소" $C2
at $(python3 -c "print($C2+3.0)"); clear; wide
recstop 1
# 부서를 옮기는 역할 전환은 녹화 밖에서(화면 위 역할 표지가 바뀐 부서를 알린다)
role_quiet 회계·자금; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A mouse move 700 500 >/dev/null
recstart 2
stage acct
pt "재심사" $C3
at $(python3 -c "print($C3+1.8)"); clear
recstop 2
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref 'row "동명 · 박준호') >/dev/null; sleep 3; A mouse move 700 500 >/dev/null
recstart 3
stage audit
pre "새" "대표자 이름만 같고 주소 · 계좌가 달라 근거 부족"
pt "새" $C4; pt "대표자 이름만 같고 주소 · 계좌가 달라 근거 부족" $C5
sleep 3; clear; wide
recstop 3
