#!/bin/bash
# 장면 2 정상 녹화. W=<작업 폴더> bash tools/video/scenes/rec2.sh  (로컬 앱이 열린 agent-browser 세션 vid)
source "$(dirname "$0")/../lib.sh"; eval "$(python3 $HERE/cuetimes.py $HERE/scenes/s2.json $W)"
: > $MARKS
reset_demo; role_quiet 영업지원
A click @$(ref 'button "작업"') >/dev/null; sleep 2
A click @$(ref 'radio "전체"') >/dev/null; A fill @$(ref 'searchbox "검색"') "금강상사11" >/dev/null; sleep 1.5; prep
A mouse move 640 500 >/dev/null
recstart 1
stage input
at 0.4; pt "3,888,097"
at 1.0; tap @$(ref '2026-063,888,097') 400
scrollto "h2:구성"; foc "h2:구성"
pt "1,373,515" $C1; pt "1,189,046" $(python3 -c "print($C1+0.5)"); pt "1,325,536" $(python3 -c "print($C1+1.0)")
at $(python3 -c "print($C1+1.6)")
stage data
at 0.2; scrollto "h2:관계" 40; foc "h2:관계"
pt "박상현" $C2; pt "성남시 상공로 128" $C3; pt "국민 412-27-556310" $C4
at $(python3 -c "print($C4+2.4)")
stage calc
at $(python3 -c "print(max(0.3,$C5-0.4))"); pt "성일상사24"; pt "대륙상사37" $(python3 -c "print($C5+0.8)")
at $(python3 -c "print($C6-1.9)"); wide; top
at $(python3 -c "print($C6-0.5)"); foc "css:[data-tour=tiles]"
pt "3,888,097" $C6; pt "2,000,000" $C7
at $(python3 -c "print($C8-0.5)"); wide; pt "css:[data-tour=actions]"
at $(python3 -c "print($C8+2.6)")
stage evid
at 0.2; clear; wide
setrole 영업임원
tap @$(ref '2026-063,888,097') 450; sleep 1.5
scrollto "h2:정황" 12; pt "계좌 · 성일상사24"
at $(python3 -c "print($S5-1.4)"); scrollto "css:[data-tour=ai]" 16; foc "css:[data-tour=ai]"
pt "사실" $C10; pt "추정" $C11; pt "미확인" $C12
at $(python3 -c "print($S6-0.3)"); wide; top
pt "승인" $C13; pt "보류" $C14; pt "반려" $C15
at $(python3 -c "print($C15+1.5)")
stage approve
at 0.2; tap @$(ref 'button "승인"') 450; sleep 0.4; foc "css:[role=dialog], dialog[open]"
tap @$(ref 'combobox "분류"') 450; sleep .3; tap @$(ref 'option "정상"') 400; sleep .2
tap @$(ref 'textbox "메모"') 400; typeslow "세 곳 합산으로 승인"; sleep .3
tap @$(last 'button "승인"') 450; sleep 0.6; wide
stage pay
at 0.2; wide
setrole 회계·자금
pt "1,373,515"; sleep 0.5
tap @$(ref '금강상사11') 450; sleep 1.0
tap @$(ref 'button "지급"') 450; sleep .5; tap @$(last 'button "지급"') 400; sleep 0.6
at $S9; log mock_on ""
tap @$(ref 'button "시연"') 450; sleep 0.6; foc "h2:회신"
tap @$(ref 'button "회신"') 450; sleep .5; tap @$(last 'button "회신"') 400; sleep 0.8
demo_off; log mock_off ""; wide
foc "h2:대사"; sleep 0.6
recstop 1
# 녹화 밖: 나머지 두 건
for n in 대륙상사37 성일상사24; do
  A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref "row \"$n") >/dev/null; sleep 2.5
  A click @$(ref 'button "지급"') >/dev/null; sleep .8; A click @$(last 'button "지급"') >/dev/null; sleep 2
  A click @$(ref 'button "시연"') >/dev/null; sleep 1; A click @$(ref 'button "회신"') >/dev/null; sleep .8; A click @$(last 'button "회신"') >/dev/null; sleep 2
  demo_off; sleep 1
done
A click @$(ref 'button "내용"') >/dev/null; sleep 1; A mouse move 640 400 >/dev/null
recstart 2
stage state
at 0.3; foc "h2:대사"
at $(python3 -c "print(max(0.5,$C19-0.3))"); pt "일치"
at $(python3 -c "print($C20-1.2)"); tap @$(ref 'button "금강상사11 외 2"') 450; sleep 1.2; pt "정산"
at $S11; tap @$(ref 'button "이력"') 450; sleep 0.8; foc "h2:이력"; pt "승인 · 영업임원"
at $S12; clear; wide
at $(python3 -c "print($S12+4.0)")
recstop 2
