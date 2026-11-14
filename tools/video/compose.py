# 장면 겹 그림(hyperframes): 녹화 + 카메라 + 말하는 값 상자 + 단계 칩 + 실제/모의 표지 + 자막.
# 사용: python3 tools/video/compose.py <작업 폴더> <hyperframes 프로젝트>  — plan.json은 build.py가 검증을 통과했을 때만 만든다
import json,sys,html
WD,HF=sys.argv[1],sys.argv[2]; P=json.load(open(WD+'/plan.json')); T=P['total']
W,H=2560,1440; MAXS=1.3; S=4/3   # 출력 2560×1440: 녹화 좌표(1920 기준)를 4/3배로
def camstate(c):
    if c.get('wide'): return (0,0,1)
    x,y,w,h=[v*S for v in c['r']]; pad=1.25
    s=min(W/(w*pad),H/(h*pad),MAXS); s=max(s,1.0)
    cx,cy=x+w/2,y+h/2
    tx=W/2-cx*s; ty=H/2-cy*s
    tx=min(0,max(W-W*s,tx)); ty=min(0,max(H-H*s,ty))
    return (round(tx),round(ty),round(s,3))
tw=[];el=[]
prev=None
for c in P['cam']:
    st=camstate(c)
    if st==prev: continue
    tw.append(f'tl.to("#cam",{{x:{st[0]},y:{st[1]},scale:{st[2]},duration:1.1,ease:"power2.inOut"}},{max(c["t"],0):.2f});'); prev=st
def clip(id,start,dur,cls,inner,z=10,anim=True):
    el.append(f'<div id="{id}" class="clip {cls}" data-start="{start:.2f}" data-duration="{dur:.2f}" data-track-index="{z}" style="z-index:{z}"><div class="in">{inner}</div></div>')
    if anim: tw.append(f'tl.fromTo("#{id} .in",{{opacity:0}},{{opacity:1,duration:0.2,ease:"power1.out"}},{start:.2f});')
# 말하는 값 표시(카메라 안에 두어 함께 움직인다)
hb=[]
for i,b in enumerate(P['boxes']):
    x,y,w,h=[round(v*S) for v in b['r']]
    hb.append(f'<div id="hl{i}" class="clip hl" data-start="{b["t"]:.2f}" data-duration="{b["d"]:.2f}" data-track-index="5" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px"><div class="in"></div></div>')
    tw.append(f'tl.fromTo("#hl{i} .in",{{opacity:0,scale:1.04}},{{opacity:1,scale:1,duration:0.18,ease:"power2.out"}},{b["t"]:.2f});')
# 여는 제목
clip('title',0,2.4,'title',f'<div class="k">{P["num"]}</div><div><div class="t1">{html.escape(P["title"])}</div><div class="t2">{html.escape(P["subtitle"])}</div></div>',40)
tw.append('tl.to("#title .in",{opacity:0,duration:0.3},2.1);')
# 단계 칩: 단계마다 한 덩어리(지금 단계만 진하게)
names=P['chips']
spans=[]
for s in P['segs']:
    if spans and spans[-1][0]==s['stage']: spans[-1][2]=s['out']+s['dur']
    else: spans.append([s['stage'],s['out'],s['out']+s['dur']])
for i,(nm,a,b) in enumerate(spans):
    chips=''.join(f'<span class="chip{" on" if n==nm else (" done" if nm in names and names.index(n)<names.index(nm) else "")}">{n}</span>' for n in names)
    clip(f'rail{i}',a,b-a,'rail',f'<span class="sc">{P["num"]} {html.escape(P["title"])}</span>{chips}',30,anim=False)
# 응답 대기를 잘라 낸 자리: 1.6초 표지(빨리 감기 대신 생략했음을 보인다)
for i,t in enumerate(P.get('skips',[])): clip(f'skip{i}',max(0,t),1.6,'badge skip','<i></i>대기 생략',32)
# 실제 / 모의
cuts=[0]+[x for m in P['mock'] for x in m]+[T]
for i in range(0,len(cuts),2):
    if cuts[i+1]-cuts[i]>0.05: clip(f'real{i}',cuts[i],cuts[i+1]-cuts[i],'badge real','<i></i>실제 작동',30,anim=False)
for i,(a,b) in enumerate(P['mock']): clip(f'mock{i}',a,b-a,'badge mock','<i></i>모의 처리',31,anim=False)
for i,l in enumerate(P['lines']): clip(f'cap{i}',l['start'],l['dur']+0.25,'cap',html.escape(l['text']),35)
doc=f'''<!doctype html><html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=2560, height=1440"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>
@font-face{{font-family:"Pretendard";src:url("assets/fonts/Pretendard-Regular.otf");font-weight:400}}
@font-face{{font-family:"Pretendard";src:url("assets/fonts/Pretendard-SemiBold.otf");font-weight:600}}
@font-face{{font-family:"Pretendard";src:url("assets/fonts/Pretendard-Bold.otf");font-weight:700}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:2560px;height:1440px;overflow:hidden;background:#f6f7f8}} #stage{{position:absolute;left:0;top:0;width:1920px;height:1080px;transform:scale(1.3333333);transform-origin:0 0}}
#root{{position:relative;width:100%;height:100%;font-family:"Pretendard";overflow:hidden}}
#cam{{position:absolute;left:0;top:0;width:2560px;height:1440px;transform-origin:0 0}}
#bg{{position:absolute;inset:0;width:2560px;height:1440px}}
.clip{{position:absolute}} .hl .in{{position:absolute;inset:0;border:5px solid #f08c00;border-radius:12px;background:rgba(240,140,0,.10);box-shadow:0 0 0 4px rgba(240,140,0,.18)}}
.title{{inset:0}} .title .in{{position:absolute;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;gap:40px;color:#111}}
.title .k{{font-size:140px;font-weight:700;color:#c9cdd2}} .title .t1{{font-size:80px;font-weight:700}} .title .t2{{font-size:36px;color:#555;margin-top:6px}}
.rail{{left:24px;bottom:112px}} .rail .in{{display:flex;gap:6px;align-items:center;background:rgba(255,255,255,.94);border:1px solid #e3e5e8;border-radius:999px;padding:6px 8px 6px 18px;box-shadow:0 2px 10px rgba(0,0,0,.08);font-size:19px;color:#888}}
.rail .sc{{font-weight:700;color:#111;margin-right:8px}} .chip{{padding:5px 12px;border-radius:999px}} .chip.done{{color:#444}} .chip.on{{background:#111;color:#fff;font-weight:600}}
.badge{{right:24px;bottom:112px}} .badge .in{{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.94);border:1px solid #e3e5e8;border-radius:999px;padding:9px 16px;font-size:19px;font-weight:600;color:#222;box-shadow:0 2px 10px rgba(0,0,0,.08)}}
.badge i{{width:10px;height:10px;border-radius:5px;display:inline-block}} .real i{{background:#1a7f37}} .skip{{right:200px}} .skip i{{background:#6e7781}} .mock i{{background:#bf8700}} .mock .in{{color:#7a5600;background:#fff8c5;border-color:#eed888}}
.cap{{left:160px;right:160px;bottom:36px;text-align:center}} .cap .in{{display:inline-block;background:rgba(17,17,17,.86);color:#fff;padding:12px 26px;border-radius:12px;font-size:32px;font-weight:600;line-height:1.4;max-width:1500px}}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{T:.2f}" data-width="2560" data-height="1440">
<div id="cam"><video id="bg" class="clip" src="assets/scene.mp4" muted data-start="0" data-duration="{T:.2f}" data-track-index="0"></video>{chr(10).join(hb)}</div>
<div id="stage">
{chr(10).join(el)}
</div></div>
<script>
const tl=gsap.timeline({{paused:true}});
{chr(10).join(tw)}
window.__timelines["main"]=tl; tl.seek(0);
</script></body></html>'''
open(HF+'/index.html','w').write(doc)
print(len(P['cam']),'cam keys')
