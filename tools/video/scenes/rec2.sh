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
at 2.0; tap @$(ref '2026-063,888,097') 400
at 3.2; scrollto "h2:구성"; foc "h2:구성"
pt "1,373,515" $C1; pt "1,189,046" $(python3 -c "print($C1+0.9)"); pt "1,325,536" $(python3 -c "print($C1+1.8)")
at 7.5
stage data
at 0.2; scrollto "h2:관계" 40; foc "h2:관계"
pt "박상현" $C2; pt "성남시 상공로 128" $C3; pt "국민 412-27-556310" $C4
at $(python3 -c "print($C4+2.2)")
stage calc
at $(python3 -c "print(max(0.3,$C5-0.4))"); pt "성일상사24"; pt "대륙상사37" $(python3 -c "print($C5+0.8)")
at $(python3 -c "print($C6-1.9)"); wide; top
at $(python3 -c "print($C6-0.5)"); foc "css:[data-tour=tiles]"
pt "3,888,097" $C6; pt "2,000,000" $C7
at $(python3 -c "print($C8-0.5)"); wide; pt "css:[data-tour=actions]"
at $C9; clear; pt "css:[data-tour=tiles]"
at $(python3 -c "print($S6+4.6)")
stage evid
at 0.2; clear; wide
setrole 영업임원
tap @$(ref '2026-063,888,097') 450; sleep 2.5
scrollto "h2:정황" 12; pt "계좌 · 성일상사24"
at $(python3 -c "print($S8-1.4)"); scrollto "css:[data-tour=ai]" 16; foc "css:[data-tour=ai]"
pt "사실" $C11; pt "추정" $C12; pt "미확인" $C13
at $(python3 -c "print($S9-0.3)"); wide; top
pt "승인" $C14; pt "보류" $C15; pt "반려" $C16
at $(python3 -c "print($S9+5)")
stage ask
clear; wide; ask "이 심사는 왜 내 몫이야?"
pt "조회" $C18
sleep 5
stage approve
at 0.2; tap @$(ref 'button "승인"') 450; sleep 0.9; foc "css:[role=dialog], dialog[open]"
tap @$(ref 'combobox "분류"') 450; sleep .4; tap @$(ref 'option "정상"') 400; sleep .3
tap @$(ref 'textbox "메모"') 400; typeslow "정황 보고 확인, 세 곳 합산으로 승인"; sleep .5
tap @$(last 'button "승인"') 450; sleep 1.5; wide; sleep 0.5
stage pay
at 0.2; wide
setrole 회계·자금
pt "1,373,515"; sleep 0.6; pt "1,325,536"; sleep 0.6; pt "1,189,046"; sleep 0.6
tap @$(ref '금강상사11') 450; sleep 2.0
tap @$(ref 'button "지급"') 450; sleep .7; tap @$(last 'button "지급"') 400; sleep 1.5
at $S14; log mock_on ""
tap @$(ref 'button "시연"') 450; sleep 1.0; foc "h2:회신"
tap @$(ref 'button "회신"') 450; sleep .7; tap @$(last 'button "회신"') 400; sleep 1.8
A press Escape >/dev/null; log mock_off ""; wide; sleep 0.6
foc "h2:대사"; sleep 1.5
recstop 1
# 녹화 밖: 나머지 두 건
for n in 2 3; do
  A click @$(ref 'button "뒤"') >/dev/null; sleep 2.5
  A click @$(ref 'button "지급"') >/dev/null; sleep .8; A click @$(last 'button "지급"') >/dev/null; sleep 2
  A click @$(ref 'button "시연"') >/dev/null; sleep 1; A click @$(ref 'button "회신"') >/dev/null; sleep .8; A click @$(last 'button "회신"') >/dev/null; sleep 2
  A press Escape >/dev/null; sleep 1
done
A click @$(ref 'button "내용"') >/dev/null; sleep 1; A mouse move 640 400 >/dev/null
recstart 2
stage state
at 0.3; foc "h2:대사"
at $(python3 -c "print(max(0.5,$C22-0.3))"); pt "일치"
at $(python3 -c "print($S16-1.2)"); tap @$(ref 'button "금강상사11 외 2"') 450; sleep 1.6; pt "정산"
at $S17; tap @$(ref 'button "이력"') 450; sleep 1.0; foc "h2:이력"; pt "승인 · 영업임원"
at $S18; clear; wide
at $(python3 -c "print($S18+4.4)")
recstop 2
