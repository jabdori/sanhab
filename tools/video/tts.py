# 장면 해설 음성: 단락(groups)마다 ElevenLabs로 한 번에 만들고, 글자별 실제 시각을 함께 저장한다(문장마다 따로 만들면 끊긴다).
# 사용: zsh -i -c 'python3 -I tools/video/tts.py tools/video/scenes/s2.json <작업 폴더>'  (ELEVENLABS_API_KEY는 ~/.zshrc)
import os,sys,json,base64,urllib.request,subprocess
cfg=json.load(open(sys.argv[1])); W=sys.argv[2]; k=os.environ['ELEVENLABS_API_KEY']
VOICE=cfg.get('voice','EXAVITQu4vr4xnSDxMaL'); MODEL=cfg.get('model','eleven_v4')
L=cfg['lines']; G=cfg['groups']; texts=[' '.join(L[j] for j in g) for g in G]
os.makedirs(W+'/para',exist_ok=True); out=[]; prev=[]
for gi,g in enumerate(G):
    body={'text':texts[gi],'model_id':MODEL,'language_code':'ko','previous_text':texts[gi-1] if gi else '','next_text':texts[gi+1] if gi+1<len(texts) else '','voice_settings':{'speed':float(__import__('os').environ.get('TTS_SPEED','1.15'))}}
    if prev: body['previous_request_ids']=prev[-3:]
    r=urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128',data=json.dumps(body).encode(),headers={'xi-api-key':k,'Content-Type':'application/json'})
    x=urllib.request.urlopen(r,timeout=180); rid=x.headers.get('request-id'); d=json.load(x)
    if rid: prev.append(rid)
    open(f'{W}/para/{gi}.mp3','wb').write(base64.b64decode(d['audio_base64']))
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',f'{W}/para/{gi}.mp3','-ar','48000',f'{W}/para/{gi}.wav'],check=True)
    ra=d['alignment']; assert ''.join(ra['characters'])==texts[gi],(gi,'정렬 글자가 원문과 다름')
    dur=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'{W}/para/{gi}.wav']))
    out.append({'group':g,'file':f'para/{gi}.wav','dur':round(dur,2),'text':texts[gi],'cs':ra['character_start_times_seconds'],'ce':ra['character_end_times_seconds']})
    print(gi,round(dur,1))
json.dump({'lines':L,'para':out},open(W+'/voice.json','w'),ensure_ascii=False)
