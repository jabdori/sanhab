# 장면 편집 + 검증 관문. 화면(녹화)이 기준이고, 해설 문장을 상자가 뜨는 순간에 맞춰 놓는다.
# 상자가 말보다 이르면 그 직전에 화면을 멈추고(속도 변경 없음), 늦으면 커서가 서 있는 구간을 잘라 낸다.
# 관문을 하나라도 넘지 못하면 종료 코드 2로 끝나고 make.sh는 합성 · 렌더를 하지 않는다.
# 사용: python3 tools/video/build.py tools/video/scenes/s2.json <작업 폴더>
import json,sys,subprocess,re
cfg=json.load(open(sys.argv[1])); W=sys.argv[2]; K=1.5; GAP=0.15; TOL=0.5; MAXHOLD=6.5  # 2026-11-15: 0.3→0.5 · 6.0→6.5 — 4K 캡처 중 화면이 조금 느려 생기는 차이를 허용(README 관문 표)
ev=[l.rstrip('\n').split(' ') for l in open(W+'/marks.txt')]
fails=[]
def gate(ok,msg):
    if not ok: fails.append(msg)
# 관문 1: 녹화 준비(1.5배, 온보딩 꺼 둠)
pr=[e for e in ev if e[0]=='prep']
gate(pr and 'tour=true' in pr[-1] and 'viewport=1280x720x3' in pr[-1],'준비: 안내 꺼 둠 · 1280×720×3 기록 없음')
FPS=30
def dims(f): return subprocess.check_output(['ffprobe','-v','error','-select_streams','v','-show_entries','stream=width,height,r_frame_rate','-of','csv=p=0',f]).decode().strip().rstrip(',')
gate(not [e for e in ev if e[0]=='miss'],'녹화 중 못 찾은 상자: '+', '.join(' '.join(e).split('@',1)[1] for e in ev if e[0]=='miss'))
V=json.load(open(W+'/voice.json'))
gate(V['lines']==cfg['lines'],'음성이 지금 대본으로 만든 것이 아님(tts.py 다시)')
PA=V['para']; L=[{'text':t} for t in cfg['lines']]
clips=sorted(int(e[0][3:]) for e in ev if re.fullmatch(r'rec\d+',e[0]))
rec={n:float([e for e in ev if e[0]==f'rec{n}'][0][1]) for n in clips}; end={n:float([e for e in ev if e[0]==f'end{n}'][0][1]) for n in clips}
base={};acc=0
for n in clips: base[n]=acc; acc+=end[n]-rec[n]
END=acc
def raw(e):
    x=float(e[1]); n=max([c for c in clips if x>=rec[c]-0.01] or [clips[0]]); return base[n]+(x-rec[n])
STG=[k for k,_ in cfg['stages']]; NAME=dict(cfg['stages'])
SM={e[0]:raw(e) for e in ev if e[0] in STG}
gate(all(k in SM for k in STG),'단계 표지가 빠짐: '+', '.join(k for k in STG if k not in SM))
chunk={}
for gi,p in enumerate(PA):
    txt=p['text'];pos=0;ss=[]
    for j in p['group']:
        a=txt.find(L[j]['text'],pos);b=a+len(L[j]['text']);pos=b;ss.append((j,a,b))
    for k,(j,a,b) in enumerate(ss):
        s0=p['cs'][a];e0=p['ce'][b-1]
        cut0=0 if k==0 else (p['ce'][ss[k-1][2]-1]+s0)/2
        cut1=p['dur'] if k==len(ss)-1 else (e0+p['cs'][ss[k+1][1]])/2
        chunk[j]=dict(para=gi,a=a,cut0=cut0,cut1=cut1,lead=s0-cut0,speak=e0-s0)
def wrel(j,w):
    if w is None: return chunk[j]['lead']
    p=PA[chunk[j]['para']];i=p['text'].find(w,chunk[j]['a']);assert i>=0,(j,w); return p['cs'][i]-chunk[j]['cut0']
evs=[]
for e in ev:
    if e[0] in('hl','clear','wide','focus','mock_on','mock_off','ask','wait_on','wait_off')+tuple(STG):
        lab=' '.join(e).split(' @',1)[1] if e[0]=='hl' else '@'+e[0]
        evs.append(dict(kind=e[0],raw=raw(e),lab=lab,r=[round(float(v)*K) for v in e[2:6]] if e[0] in('hl','focus') else None))
evs.sort(key=lambda x:x['raw'])
used=[];cues={}
for lab,j,w in cfg['cues']:
    lo=max([evs[i]['raw'] for i in used]+[-1])
    i=next((i for i,x in enumerate(evs) if i not in used and x['lab']==lab and x['raw']>=lo),None)
    if i is None: fails.append(f'단서 "{lab}"의 상자가 녹화에 없음'); continue
    used.append(i); cues.setdefault(j,[]).append((i,w,lab))
holds={}; cuts=[]; busy=sorted(x['raw'] for x in evs if x['kind'] not in('wait_on','wait_off'))
# 어시스턴트의 응답 대기: 보낸 뒤 1초와 답이 끝나기 전 0.8초만 남기고 잘라 낸다(속도 변경 없음, 화면에 대기 생략 표지)
won=[x['raw'] for x in evs if x['kind']=='wait_on']; woff=[x['raw'] for x in evs if x['kind']=='wait_off']
for a,b in zip(won,woff):
    if b-0.8-(a+1.0)>0.5: cuts.append((a+1.0,b-0.8))
cuts.sort(); waits=list(cuts)
def out(r): return r+sum(h for t,h in holds.items() if t<=r)-sum(min(b,r)-a for a,b in cuts if a<r)
def idle_before(r):
    prev=max([t for t in busy if t<r-0.02]+[0]); a=max([prev+1.3]+[b for _,b in cuts]); return (a,r-0.05) if r-0.05-a>0.05 else None
place=[];prev=-1;report=[]
for j in range(len(L)):
    ch=chunk[j]; cs=cues.get(j,[])
    if cs: i0,w0,_=cs[0]; st=out(evs[i0]['raw'])-wrel(j,w0)
    else: st=prev+0.25
    st=max(st,prev+GAP,0.2)
    for i,w,lab in cs:
        wt=st+wrel(j,w); bt=out(evs[i]['raw'])
        if wt-bt>0.03: holds[evs[i]['raw']-0.01]=holds.get(evs[i]['raw']-0.01,0)+(wt-bt)
        elif bt-wt>0.03:
            iv=idle_before(evs[i]['raw'])
            if iv: c=min(bt-wt,iv[1]-iv[0]); cuts.append((iv[1]-c,iv[1])); cuts.sort()
        report.append((lab,j,round(out(evs[i]['raw'])-wt,2)))
    place.append((j,round(st,3))); L[j]['start']=round(st+ch['lead'],2); L[j]['dur']=round(ch['speak'],2); prev=st+ch['cut1']-ch['cut0']
total=max(out(END),prev+0.6); tail=total-out(END)
# 관문 2: 말과 상자
LOOSE=cfg.get('loose',{})  # 장면 설정에서 단서별 허용치(처리 시간이 정해진 화면 동작 — README 관문 표)
for lab,j,d in report: gate(abs(d)<=LOOSE.get(lab,TOL),f'싱크 어긋남: "{lab}"(대본 {j}행) {d:+.2f}초')
# 관문 3: 멈춤 길이, 속도
for t,h in holds.items(): gate(h<=MAXHOLD,f'화면 멈춤 {h:.1f}초(>{MAXHOLD}) at {out(t):.1f}초 — 녹화 동작을 대본 쪽으로 당길 것')
# 관문 4: 자막 글(면책 · 개발용 표기)
# 보는 사람이 식별할 수 없는 표기: 면책 문구, 개발용 표기, 영문자+숫자 번호(W07 · S12 · t19 · D-011), 버전 표기
BAN=re.compile(r'판정은 사람|참고용|근거 기반|AI는 판정하지|fixture|css:|data-tour|(?<![A-Za-z가-힣])[A-Za-z]{1,3}-?\d{1,4}(?![A-Za-z가-힣])|\bv\d+\b|\.md\b')
for t in cfg['lines']+[cfg['title'],cfg['subtitle']]+cfg['chips']+[n for _,n in cfg['stages']]:
    gate(not BAN.search(t),f'화면 · 해설 글에 금지 표기: {t}')
segs=[]
for k,nk in zip(STG,STG[1:]+['END']):
    a=out(SM.get(k,0)); b=out(SM[nk]) if nk!='END' else total
    segs.append(dict(key=k,stage=NAME[k],role=cfg['roles'].get(k,''),out=round(a,3),dur=round(b-a,3)))
segs[0]['dur']=round(segs[0]['dur']+segs[0]['out'],3); segs[0]['out']=0.0
cam=[];boxes=[];mock=[]
for n,x in enumerate(evs):
    T=round(out(x['raw']),2)
    if x['kind']=='wide': cam.append({'t':T,'wide':True})
    # 화면 밖(오른쪽으로 넘친 탭 등)을 가리키는 확대는 버리고 전체 화면으로 — 빈 곳을 크게 확대하지 않게(좌표는 ×K, 화면 폭 1280×K)
    elif x['kind']=='focus': cam.append({'t':T,'wide':True} if x['r'][1]<120 or x['r'][0]+x['r'][2]>1280*K+8 or x['r'][0]<0 else {'t':T,'r':x['r']})
    elif x['kind'].startswith('mock'): mock.append(T)
    elif x['kind']=='hl':
        nx=[out(y['raw']) for y in evs[n+1:] if y['kind'] in('hl','clear')]+[total]
        boxes.append({'t':T,'d':round(max(0.1,min(nx[0],T+4)-T),2),'r':x['r']})   # 다음 상자 · 화면 전환에서 끝난다(늘리지 않는다)
# 관문 5: 상자가 화면이 바뀐 뒤까지 남지 않는다
clears=[out(x['raw']) for x in evs if x['kind']=='clear']
for b in boxes: gate(not any(b['t']<c<b['t']+b['d']-0.02 for c in clears),f'상자가 화면 전환 뒤에도 남음 at {b["t"]:.1f}초')
plan=dict(skips=[round(out(a)-0.01,2) for a,_ in waits],num=cfg['num'],title=cfg['title'],subtitle=cfg['subtitle'],chips=cfg['chips'],segs=segs,lines=L,cam=cam,boxes=boxes,mock=[mock[i:i+2] for i in range(0,len(mock),2)],total=round(total,2))
json.dump(plan,open(W+'/plan.json','w'),ensure_ascii=False,indent=1)
rep=[f'장면 {cfg["num"]} 검증 — 길이 {total:.1f}초, 멈춤 {len(holds)}곳 {sum(holds.values()):.1f}초(최대 {max(holds.values() or [0]):.1f}), 잘라냄 {len(cuts)}곳 {sum(b-a for a,b in cuts):.1f}초(응답 대기 {len(waits)}곳 {sum(b-a for a,b in waits):.1f}초)']
rep+= [f'  {lab:24s} {d:+.2f}초' for lab,j,d in report]
rep+= ['통과' if not fails else '불통과:']+['  - '+f for f in fails]
open(W+'/verify.txt','w').write('\n'.join(rep)+'\n'); print('\n'.join(rep))
if fails: sys.exit(2)
# 영상: 프레임 번호로 정확히 — 클립을 잇고, 잘라낸 구간을 빼고, 멈춤은 그 프레임을 늘린다(이음매에서 프레임이 빠지거나 겹치지 않게). 4K 그대로 한 번만 압축
for c in clips: gate(dims(f'{W}/clip{c}.mp4')=='3840,2160,30/1',f'원본 해상도 · 프레임: clip{c} {dims(f"{W}/clip{c}.mp4")} (3840,2160,30/1이어야)')
if fails:
    open(W+'/verify.txt','a').write('불통과(원본):\n'+'\n'.join('  - '+f for f in fails)+'\n'); print('\n'.join(fails)); sys.exit(2)
keep=[];x=0
for c0,c1 in cuts: keep.append((x,c0)); x=c1
keep.append((x,END))
srcs=[(i,base[n],base[n]+end[n]-rec[n]) for i,n in enumerate(clips)]
f=[];n=0;hp=sorted(holds);made=0
for k0,k1 in keep:
    bounds=[k0]+[t for t in hp if k0<t<k1]+[k1]
    for i in range(len(bounds)-1):
        a,b=bounds[i],bounds[i+1]; h=holds.get(b,0) if b in holds else (tail if b==END else 0)
        for si,lo,hi in srcs:
            x0,x1=max(a,lo),min(b,hi)
            if x1-x0>0.005:
                f0,f1=round((x0-lo)*FPS),round((x1-lo)*FPS); hh=round(h*FPS) if x1==b else 0
                if f1<=f0 and hh==0: continue
                f1=max(f1,f0+1)
                f.append(f"[{si}:v]trim=start_frame={f0}:end_frame={f1},setpts=N/{FPS}/TB"+(f",tpad=stop_mode=clone:stop={hh}" if hh>0 else "")+f"[v{n}]"); n+=1; made+=(f1-f0)+hh
f.append(''.join(f'[v{i}]' for i in range(n))+f'concat=n={n}:v=1:a=0,fps={FPS}[o]')
ins=sum((['-i',f'{W}/clip{c}.mp4'] for c in clips),[])
subprocess.run(['ffmpeg','-loglevel','error','-y',*ins,'-filter_complex',';'.join(f),'-map','[o]','-c:v','libx264','-preset','medium','-crf','12','-pix_fmt','yuv420p','-r',str(FPS),W+'/edit.mp4'],check=True)
ins=[];g=[]
for i,(j,st) in enumerate(place):
    ch=chunk[j]; ins+=['-i',f"{W}/{PA[ch['para']]['file']}"]; ms=int(st*1000)
    g.append(f"[{i}]atrim={ch['cut0']:.3f}:{ch['cut1']:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={max(0,ch['cut1']-ch['cut0']-0.03):.3f}:d=0.03,adelay={ms}|{ms}[a{i}]")
g.append(''.join(f'[a{i}]' for i in range(len(place)))+f"amix=inputs={len(place)}:normalize=0,apad=whole_dur={round(total,2)}[o]")
subprocess.run(['ffmpeg','-loglevel','error','-y',*ins,'-filter_complex',';'.join(g),'-map','[o]','-ar','48000','-ac','2',W+'/voice.wav'],check=True)
