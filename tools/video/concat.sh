#!/bin/bash
# 장면 렌더본(검증 통과본)을 잇는다: 장면 사이 0.5초 크로스페이드(화면 · 소리), 2560×1440 · 정확히 30fps로 한 번 인코딩.
# 사용: tools/video/concat.sh <vid 폴더> <출력.mp4>
set -euo pipefail
V=$1; OUT=$2; X=0.5; ins=(); durs=()
for n in 1 2 3 4 5 6; do s=$V/w$n/scene$n.mp4; [ -s "$s" ] || { echo "✗ 장면 $n 없음"; exit 2; }; grep -q '^통과' $V/w$n/verify.txt || { echo "✗ 장면 $n 검증 불통과"; exit 2; }
  ins+=(-i "$s"); durs+=($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$s")); done
f=$(python3 - "${durs[@]}" <<'PY'
import sys
d=[float(x) for x in sys.argv[1:]]; X=0.5; g=[]; off=0; v='[0:v]'; a='[0:a]'
for i in range(1,len(d)):
    off+=d[i-1]-X
    g.append(f"{v}[{i}:v]xfade=transition=fade:duration={X}:offset={off:.3f}[v{i}]"); v=f'[v{i}]'
    g.append(f"{a}[{i}:a]acrossfade=d={X}[a{i}]"); a=f'[a{i}]'
    off=off  # 다음 장면은 앞 장면 끝에서 X 겹친다
print(';'.join(g)+f";{v}fps=30,format=yuv420p[v];{a}anull[a]")
PY
)
ffmpeg -loglevel error -y "${ins[@]}" -filter_complex "$f" -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 16 -r 30 -c:a aac -b:a 192k "$OUT"
read fr nf < <(ffprobe -v error -select_streams v -count_frames -show_entries stream=r_frame_rate,nb_read_frames -of csv=p=0 "$OUT" | tr , ' ')
echo "✓ $OUT $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")초 $fr 프레임 $nf"
