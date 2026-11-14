# 녹화 스크립트용 단서 시각: 단계 시작 기준으로 그 낱말이 들릴 시각(대략). 실제 맞춤은 build.py가 한다.
# 사용: eval "$(python3 tools/video/cuetimes.py scenes/sN.json <작업 폴더>)" → C0, C1, … (cues 순서), S<문장> (문장 시작)
import json,sys
cfg=json.load(open(sys.argv[1]));V=json.load(open(sys.argv[2]+'/voice.json'));PA=V['para'];L=cfg['lines']
gs=cfg['group_stage'];start={};t={}
for gi,p in enumerate(PA):
    st=gs[gi]; t[st]=t.get(st,0.5); base=t[st]; pos=0
    for j in p['group']:
        a=p['text'].find(L[j],pos); pos=a+len(L[j]); start[j]=(base,a,gi)
    t[st]=base+p['dur']+0.4
for j,(base,a,gi) in start.items(): print(f'S{j}={base+PA[gi]["cs"][a]:.2f}')
for i,(lab,j,w) in enumerate(cfg['cues']):
    base,a,gi=start[j]; p=PA[gi]; k=p['text'].find(w,a) if w else a
    print(f'C{i}={base+p["cs"][k]:.2f}')
