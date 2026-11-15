# 시연 영상 녹화 도우미. 장면 녹화 스크립트가 source 한다. 좌표는 CSS px(영상은 ×3).
# 규칙(하네스 tools/video/README.md): 상자(hl)는 커서가 움직이기 시작할 때 이름표와 함께 기록, 화면이 바뀌는 동작은 먼저 clear.
: "${W:?장면 작업 폴더 W 필요}"
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MARKS=$W/marks.txt
A(){ agent-browser --session ${SES:-vid} "$@"; }
ref(){ A snapshot -i 2>/dev/null | grep -F -- "$1" | grep -oE 'ref=e[0-9]+' | head -1 | cut -d= -f2; }
last(){ A snapshot -i 2>/dev/null | grep -F -- "$1" | tail -1 | grep -oE 'ref=e[0-9]+' | cut -d= -f2; }
now(){ python3 -c 'import time;print(time.time())'; }
log(){ echo "$1 $(now) $2" >> $MARKS; }
js(){ python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$1"; }
R(){ A eval "($(cat $HERE/rect.js))($(js "$1"))" 2>/dev/null | tr -d '"'; }
center(){ A get box "$1" --json 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);d=d.get("data",d);b=d.get("box",d);print(int(b["x"]+b["width"]/2),int(b["y"]+b["height"]/2))'; }
mv(){ read x y < <(center "$1"); A mouse move $x $y --duration ${2:-600} --human >/dev/null; }
tap(){ wait; log clear ""; mv "$1" "$2"; A mouse down >/dev/null; A mouse up >/dev/null; }
stage(){ T0=$(now); echo "$1 $T0" >> $MARKS; }
at(){ python3 -c "import time;d=$T0+$1-time.time();time.sleep(max(0,d))"; }
# pt "<값>" [시각]: 위치를 먼저 찾고, 시각이 주어지면 그때 정확히 움직인다(찾는 시간이 상자 시각을 밀지 않게)
# pre "<값>" …: 같은 문장의 값 위치를 미리 찾아 둔다(빠르게 이어지는 단서에서 찾는 시간이 상자를 늦추지 않게)
ck(){ mkdir -p $W/cache; echo "$W/cache/$(printf '%s' "$1" | md5)"; }
pre(){ for q in "$@"; do R "$q" > "$(ck "$q")"; done; }
pt(){ local r c; c=$(ck "$1"); if [ -s "$c" ]; then r=$(cat "$c"); rm -f "$c"; else r=$(R "$1"); fi; if [ "$r" = none ]; then echo "miss $1" >&2; echo "miss $(now) @$1" >> $MARKS; return; fi; [ -n "${2:-}" ] && at "$2"
  local q="$1"; set -- $r; local x=$(( $1 + $3 + 10 )) y=$(( $2 + $4 + 4 )); [ $x -gt 1260 ] && x=$(( $1 - 18 ))
  echo "hl $(now) $r @$q" >> $MARKS; ( A mouse move $x $y --duration 380 --human >/dev/null ) & }   # 커서 이동은 뒤에서: 다음 단서 시각을 밀지 않게
foc(){ wait; local r; r=$(R "$1"); [ "$r" = none ] && { echo "miss focus $1" >&2; return; }; log focus "$r"; }
wide(){ log wide ""; }
clear(){ log clear ""; }
top(){ wait; log clear ""; A eval 'document.querySelectorAll("*").forEach(n=>{if(n.scrollTop>0)n.scrollTo({top:0,behavior:"smooth"})});document.scrollingElement.scrollTo({top:0,behavior:"smooth"});1' >/dev/null; sleep 0.9; }
scrollto(){ wait; log clear ""; A eval "(()=>{const q=$(js "$1");let e;if(q.startsWith('h2:'))e=[...document.querySelectorAll('h2')].find(h=>h.textContent.trim().startsWith(q.slice(3)));else e=document.querySelector(q.replace(/^css:/,''));if(!e)return 0;const sc=(n=>{while(n&&n!==document.body){const s=getComputedStyle(n);if(/(auto|scroll)/.test(s.overflowY)&&n.scrollHeight>n.clientHeight)return n;n=n.parentElement}return document.scrollingElement})(e);const top=e.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop-${2:-12};sc.scrollTo({top,behavior:'smooth'});return 1})()" >/dev/null; sleep 1.1; }
newchat(){ local nc; nc=$(ref 'button "새 대화"'); [ -n "$nc" ] && A click @$nc >/dev/null; }
curRole(){ A snapshot -i | grep -oE 'button "(영업지원|영업임원|내부 감시|회계·자금)"' | head -1 | cut -d'"' -f2; }
setrole(){ wait; local cur; cur=$(curRole); [ "$cur" = "$1" ] && return; A mouse move 36 36 --duration 500 --human >/dev/null; A click @$(ref "button \"$cur\"") >/dev/null; sleep 0.6; tap @$(ref 'combobox "역할"') 450; sleep 0.4; tap @$(ref "option \"$1\"") 400; sleep 2.2; newchat; }
role_quiet(){ local cur; cur=$(curRole); [ "$cur" = "$1" ] && return; A click @$(ref "button \"$cur\"") >/dev/null; sleep .6; A click @$(ref 'combobox "역할"') >/dev/null; sleep .5; A click @$(ref "option \"$1\"") >/dev/null; sleep 3; }
typeslow(){ wait; log clear ""; A keyboard type "$1" >/dev/null; }
# 시연 패널 닫기: Escape가 패널에 닿지 않을 때가 있어(초점이 밖에 있으면) 남아 있으면 패널의 닫기를 누른다(남으면 대화 칸을 가린다)
demo_off(){ A press Escape >/dev/null; sleep .4; local c; c=$(A snapshot -i 2>/dev/null | grep -A3 'dialog "시연"' | grep -F 'button "닫기"' | grep -oE 'ref=e[0-9]+' | cut -d= -f2); [ -n "$c" ] && A click @$c >/dev/null; sleep .3; }
# 초기화: 확인 창은 서버 초기화가 끝나야 닫힌다(같은 SurrealDB의 다른 적재와 잠금을 나눠 몇 분 걸릴 수 있다) — 닫힐 때까지 기다린다.
# 끝나면 다시 읽어 목록이 초기화 전 값으로 남지 않게 하고(폴링을 기다리지 않고), 초기화는 토큰을 새로 내므로 접속 화면이 나오면 다시 접속
reset_demo(){ wait; A press Escape >/dev/null; A press Escape >/dev/null; local c; c=$(last 'button "취소"'); [ -n "$c" ] && A click @$c >/dev/null; sleep .5; A click @$(ref 'button "시연"') >/dev/null; sleep 1; A click @$(last 'button "초기화"') >/dev/null; sleep 1; A click @$(last 'button "초기화"') >/dev/null; sleep 2
  for i in $(seq 1 150); do A snapshot -i 2>/dev/null | grep -q 'dialog "초기화"' || break; sleep 2; done; sleep 1; demo_off; A reload >/dev/null; sleep 3; [ -z "$(ref 'textbox "접속 패스워드"')" ] || login; }
# 녹화 시작 전 확인: 1280×720 · 3배, 네 역할 안내를 본 것으로(온보딩이 찍히지 않게)
prep(){ A set viewport 1280 720 3 >/dev/null
  A eval 'for (const r of ["영업지원","영업임원","내부 감시","회계·자금"]) localStorage.setItem("tour:"+r,"1"); 1' >/dev/null
  local ok; ok=$(A eval '["영업지원","영업임원","내부 감시","회계·자금"].every(r=>localStorage.getItem("tour:"+r)==="1")' | tr -d '"')
  local nc; nc=$(ref 'button "새 대화"'); [ -n "$nc" ] && A click @$nc >/dev/null; sleep 0.5   # 대화 칸은 빈 새 대화로
  echo "prep $(now) tour=$ok viewport=1280x720x3" >> $MARKS; }
# 녹화: agent-browser 녹화기는 커서를 페이지에 그리는 데만 쓴다(그 영상은 1280×720을 키운 것이라 버린다). 화면은 cdp-rec.mjs가 배율 3 스크린샷으로 찍는다
# DRY=1: 녹화하지 않고 동작만 돌린다(바뀐 화면에서 못 찾는 상자 · 단추를 미리 찾는 리허설). miss는 marks.txt에 남는다
recstart(){ [ -n "${DRY:-}" ] && { echo "rec$1 $(now)" >> $MARKS; return; };  rm -rf $W/frames$1; A record start $W/cursor$1.mp4 --cursor >/dev/null 2>&1; ( node $HERE/cdp-rec.mjs "$(A get cdp-url)" $W/frames$1 > /dev/null & echo $! > $W/grab.pid ); sleep 1; echo "rec$1 $(now)" >> $MARKS; sleep 0.5; }
recstop(){ wait; [ -n "${DRY:-}" ] && { echo "end$1 $(now)" >> $MARKS; return; }; echo "end$1 $(now)" >> $MARKS; sleep 0.3; kill -TERM $(cat $W/grab.pid); while kill -0 $(cat $W/grab.pid) 2>/dev/null; do sleep 0.2; done; A record stop >/dev/null 2>&1; rm -f $W/cursor$1.mp4
  python3 $HERE/stitch.py $W/frames$1 $(grep "^rec$1 " $MARKS | cut -d' ' -f2) $(grep "^end$1 " $MARKS | cut -d' ' -f2) $W/clip$1.mp4 && rm -rf $W/frames$1; }
# 접속(서버를 다시 띄우면 토큰이 바뀐다): 패스워드는 .env에서 읽어 입력만 하고 출력하지 않는다
login(){ local p; p=$(grep '^DEMO_PASS=' "$HERE/../../.env" | cut -d= -f2- | tr -d '"'); A open ${APP:-http://localhost:3100} >/dev/null 2>&1; sleep 3
  [ -n "$(ref textbox)" ] || return 0; A fill @$(ref textbox) "$p" >/dev/null; A click @$(ref 'button "접속"') >/dev/null; sleep 3; A click @$(ref "button \"${1:-영업지원}\"") >/dev/null; sleep 3; }
# 어시스턴트에게 묻기: 입력창을 눌러 질문을 치고 보낸다(ask 표지). 답이 끝날 때까지 기다리는 구간은 wait_on ~ wait_off로 남겨 편집에서 잘라 낸다(대기 생략 표시)
ask(){ wait; local r; r=$(ref 'combobox "대화"'); tap @$r 450; typeslow "$1"; sleep 0.4; log ask ""; A press Enter >/dev/null; sleep 1.2; log wait_on ""
  # 답이 끝남 = 대화 칸 글(답 · 도구 줄 · A2UI 부품)의 길이가 늘었고, 메시지 목록이 스트리밍 중(aria-busy)이 아닌 채 3초 동안 늘지 않음(도구 호출 사이의 멈춤을 끝으로 보지 않게)
  local base prev=-1 same=0 n; base=$(A eval '(document.querySelector("[role=complementary]")?.innerText ?? "").length' | tr -d '"')
  for i in $(seq 1 90); do sleep 1
    n=$(A eval '(c=>c?(c.querySelector("[role=log][aria-busy=true]")?-1:c.innerText.length):0)(document.querySelector("[role=complementary]"))' | tr -d '"')
    if [ "$n" -gt "$base" ] && [ "$n" = "$prev" ]; then same=$((same+1)); [ $same -ge 3 ] && break; else same=0; fi; prev=$n; done
  log wait_off ""; }
