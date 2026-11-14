# 시연 영상 녹화 도우미. 장면 녹화 스크립트가 source 한다. 좌표는 CSS px(영상은 ×1.5).
# 규칙(하네스 tools/video/README.md): 상자(hl)는 커서가 움직이기 시작할 때 이름표와 함께 기록, 화면이 바뀌는 동작은 먼저 clear.
: "${W:?장면 작업 폴더 W 필요}"
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MARKS=$W/marks.txt
A(){ agent-browser --session vid "$@"; }
ref(){ A snapshot -i 2>/dev/null | grep -F -- "$1" | grep -oE 'ref=e[0-9]+' | head -1 | cut -d= -f2; }
last(){ A snapshot -i 2>/dev/null | grep -F -- "$1" | tail -1 | grep -oE 'ref=e[0-9]+' | cut -d= -f2; }
now(){ python3 -c 'import time;print(time.time())'; }
log(){ echo "$1 $(now) $2" >> $MARKS; }
js(){ python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$1"; }
R(){ A eval "($(cat $HERE/rect.js))($(js "$1"))" 2>/dev/null | tr -d '"'; }
center(){ A get box "$1" --json 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);d=d.get("data",d);b=d.get("box",d);print(int(b["x"]+b["width"]/2),int(b["y"]+b["height"]/2))'; }
mv(){ read x y < <(center "$1"); A mouse move $x $y --duration ${2:-600} --human >/dev/null; }
tap(){ log clear ""; mv "$1" "$2"; A mouse down >/dev/null; A mouse up >/dev/null; }
stage(){ T0=$(now); echo "$1 $T0" >> $MARKS; }
at(){ python3 -c "import time;d=$T0+$1-time.time();time.sleep(max(0,d))"; }
# pt "<값>" [시각]: 위치를 먼저 찾고, 시각이 주어지면 그때 정확히 움직인다(찾는 시간이 상자 시각을 밀지 않게)
pt(){ local r; r=$(R "$1"); if [ "$r" = none ]; then echo "miss $1" >&2; echo "miss $(now) @$1" >> $MARKS; return; fi; [ -n "${2:-}" ] && at "$2"
  local q="$1"; set -- $r; local x=$(( $1 + $3 + 10 )) y=$(( $2 + $4 + 4 )); [ $x -gt 1260 ] && x=$(( $1 - 18 ))
  echo "hl $(now) $r @$q" >> $MARKS; A mouse move $x $y --duration 550 --human >/dev/null; }
foc(){ local r; r=$(R "$1"); [ "$r" = none ] && { echo "miss focus $1" >&2; return; }; log focus "$r"; }
wide(){ log wide ""; }
clear(){ log clear ""; }
top(){ log clear ""; A eval 'document.querySelectorAll("*").forEach(n=>{if(n.scrollTop>0)n.scrollTo({top:0,behavior:"smooth"})});document.scrollingElement.scrollTo({top:0,behavior:"smooth"});1' >/dev/null; sleep 0.9; }
scrollto(){ log clear ""; A eval "(()=>{const q=$(js "$1");let e;if(q.startsWith('h2:'))e=[...document.querySelectorAll('h2')].find(h=>h.textContent.trim().startsWith(q.slice(3)));else e=document.querySelector(q.replace(/^css:/,''));if(!e)return 0;const sc=(n=>{while(n&&n!==document.body){const s=getComputedStyle(n);if(/(auto|scroll)/.test(s.overflowY)&&n.scrollHeight>n.clientHeight)return n;n=n.parentElement}return document.scrollingElement})(e);const top=e.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop-${2:-12};sc.scrollTo({top,behavior:'smooth'});return 1})()" >/dev/null; sleep 1.1; }
curRole(){ A snapshot -i | grep -oE 'button "(영업지원|영업임원|내부 감시|회계·자금)"' | head -1 | cut -d'"' -f2; }
setrole(){ local cur; cur=$(curRole); [ "$cur" = "$1" ] && return; A mouse move 36 36 --duration 500 --human >/dev/null; A click @$(ref "button \"$cur\"") >/dev/null; sleep 0.6; tap @$(ref 'combobox "역할"') 450; sleep 0.4; tap @$(ref "option \"$1\"") 400; sleep 2.2; }
role_quiet(){ local cur; cur=$(curRole); [ "$cur" = "$1" ] && return; A click @$(ref "button \"$cur\"") >/dev/null; sleep .6; A click @$(ref 'combobox "역할"') >/dev/null; sleep .5; A click @$(ref "option \"$1\"") >/dev/null; sleep 3; }
typeslow(){ log clear ""; A keyboard type "$1" >/dev/null; }
reset_demo(){ A click @$(ref 'button "시연"') >/dev/null; sleep 1; A click @$(last 'button "초기화"') >/dev/null; sleep 1; A click @$(last 'button "초기화"') >/dev/null; sleep 6; A press Escape >/dev/null; sleep 1; }
# 녹화 시작 전 확인: 1280×720 · 1.5배, 네 역할 안내를 본 것으로(온보딩이 찍히지 않게)
prep(){ A set viewport 1280 720 1.5 >/dev/null
  A eval 'for (const r of ["영업지원","영업임원","내부 감시","회계·자금"]) localStorage.setItem("tour:"+r,"1"); 1' >/dev/null
  local ok; ok=$(A eval '["영업지원","영업임원","내부 감시","회계·자금"].every(r=>localStorage.getItem("tour:"+r)==="1")' | tr -d '"')
  echo "prep $(now) tour=$ok viewport=1280x720x1.5" >> $MARKS; }
recstart(){ A record start $W/clip$1.mp4 --cursor >/dev/null 2>&1; echo "rec$1 $(now)" >> $MARKS; sleep 0.5; }
recstop(){ echo "end$1 $(now)" >> $MARKS; A record stop >/dev/null 2>&1; }
