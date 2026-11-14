#!/bin/bash
# 장면 렌더본(검증 통과본)을 차례로 잇는다. 사용: tools/video/concat.sh <vid 폴더> <출력.mp4>  — w1…w6/sceneN.mp4가 모두 있어야 한다
set -euo pipefail
V=$1; OUT=$2; ins=(); f=""
for n in 1 2 3 4 5 6; do s=$V/w$n/scene$n.mp4; [ -s "$s" ] || { echo "✗ 장면 $n 없음"; exit 2; }; grep -q '^통과' $V/w$n/verify.txt || { echo "✗ 장면 $n 검증 불통과"; exit 2; }
  ins+=(-i "$s"); f+="[$((n-1)):v][$((n-1)):a]"; done
ffmpeg -loglevel error -y "${ins[@]}" -filter_complex "${f}concat=n=6:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k "$OUT"
echo "✓ $OUT $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")초"
