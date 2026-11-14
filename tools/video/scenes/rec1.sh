#!/bin/bash
# 장면 1 소개 녹화(읽기만 함). W=<작업 폴더> bash tools/video/scenes/rec1.sh
source "$(dirname "$0")/../lib.sh"; eval "$(python3 $HERE/cuetimes.py $HERE/scenes/s1.json $W)"
: > $MARKS
role_quiet 영업지원
A click @$(ref 'button "대리점"') >/dev/null; sleep 2.5; A fill @$(ref 'searchbox "검색"') "" >/dev/null; sleep 1; prep
A mouse move 900 600 >/dev/null
recstart 1
stage intro
at $(python3 -c "print($S1+1.0)"); foc "css:table"
at $(python3 -c "print($S1+3.5)"); tap @$(ref 'searchbox "검색"') 600; typeslow "박상현"; sleep 1.0; wide
stage list
pt "금강상사11" $C0; pt "성일상사24" $C1; pt "대륙상사37" $C2
pt "박상현" $C3; pt "성남시 상공로 128" $C4; pt "국민 412-27-556310" $C5
at $(python3 -c "print($C5+2.0)")
stage rel
at 0.2; tap @$(ref 'row "금강상사11') 500; sleep 2.0
scrollto "h2:관계" 12; foc "h2:관계"
at $(python3 -c "print($S4+0.5)"); wide
at $(python3 -c "print($S4+8.5)")
recstop 1
