#!/bin/bash
# 장면 6 추가 확장 녹화. 준비: 초기화.
source "$(dirname "$0")/../lib.sh"; eval "$(python3 $HERE/cuetimes.py $HERE/scenes/s6.json $W)"
: > $MARKS
reset_demo; role_quiet 영업임원; A click @$(ref 'button "작업"') >/dev/null; sleep 2
prep; A mouse move 700 500 >/dev/null
recstart 1
stage past
foc "css:table"
pre "4,870,186" "4,505,596"; pt "4,870,186" $C0; pt "4,505,596" $C1
at $(python3 -c "print($S2+4.0)")
clear; wide; tap @$(ref 'button "규정"') 450; sleep 2
stage sim
pt "모의" $C2; at $(python3 -c "print($C2+0.6)"); tap @$(ref 'button "모의"') 400; sleep 0.8
tap @$(ref 'spinbutton "한도"') 350; log clear ""; A fill @$(ref 'spinbutton "한도"') "1500000" >/dev/null; sleep 0.6
tap @$(last 'button "모의"') 400; sleep 2; scrollto "h2:모의" 12; foc "h2:모의"
pt "1,500,000" $C3
sleep 6; clear; wide
recstop 1
