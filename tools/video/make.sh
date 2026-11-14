#!/bin/bash
# 장면 하나를 만든다: (음성) → 편집 · 검증 관문 → 겹 그림 → lint → 렌더 → 음성 합치기 → 길이 확인.
# 사용: tools/video/make.sh <장면 번호> <작업 폴더> [--tts]
# 관문(build.py)을 넘지 못하면 여기서 멈춘다. 렌더본은 검증을 통과한 것만 나온다.
set -euo pipefail
N=$1; W=$2; ROOT=$(cd "$(dirname "$0")/../.." && pwd); T=$ROOT/tools/video; CFG=$T/scenes/s$N.json
HF=${HF:-$W/../hf}
[ "${3:-}" = --tts ] && zsh -i -c "python3 -I $T/tts.py $CFG $W" 2>&1 | grep -E '^[0-9]+ |Error|정렬' || true
python3 $T/build.py $CFG $W || { echo "✗ 장면 $N 검증 불통과 — $W/verify.txt"; exit 2; }
python3 $T/compose.py $W $HF
cp $W/edit.mp4 $HF/assets/scene.mp4
( cd $HF && npx --yes hyperframes@0.9.46 lint 2>&1 | grep -qE '^◇  0 error' ) || { echo "✗ hyperframes lint 오류"; exit 3; }
( cd $HF && npx --yes hyperframes@0.9.46 render --quality delivery -o $W/overlay.mp4 2>&1 | grep -qE 'Render complete' ) || { echo "✗ 렌더 실패"; exit 4; }
ffmpeg -loglevel error -y -i $W/overlay.mp4 -i $W/voice.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest $W/scene$N.mp4
want=$(python3 -c "import json;print(json.load(open('$W/plan.json'))['total'])"); got=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $W/scene$N.mp4)
python3 -c "import sys;sys.exit(0 if abs($want-$got)<0.2 else 1)" || { echo "✗ 길이 다름 $want vs $got"; exit 5; }
# 관문: 출력은 2560×1440 · 정확히 30fps, 프레임 수 = 길이 × 30(빠지거나 겹친 프레임 없음)
read wh fr nf < <(ffprobe -v error -select_streams v -count_frames -show_entries stream=width,height,r_frame_rate,nb_read_frames -of csv=p=0 $W/scene$N.mp4 | awk -F, '{print $1"x"$2, $3, $4}')
python3 -c "import sys;sys.exit(0 if '$wh'=='2560x1440' and '$fr'=='30/1' and abs($nf-round($want*30))<=2 else 1)" || { echo "✗ 출력 $wh $fr 프레임 $nf (기대 $(python3 -c "print(round($want*30))"))"; exit 6; }
echo "✓ 장면 $N → $W/scene$N.mp4 (${got}초)"; cat $W/verify.txt | head -1
