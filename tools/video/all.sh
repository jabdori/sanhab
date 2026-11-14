#!/bin/bash
# 여섯 장면을 차례로 녹화하고 하네스로 만든다. 사용: tools/video/all.sh <vid 폴더> [장면 번호 …]  (--tts: 음성도 다시)
V=$1; shift; TTS=""; [ "${1:-}" = --tts ] && { TTS="$2"; shift 2; }
for n in ${@:-1 2 3 4 5 6}; do
  export W=$V/w$n; mkdir -p $W; rm -rf $W/cache
  case " $TTS " in *" $n "*) zsh -i -c "python3 -I tools/video/tts.py tools/video/scenes/s$n.json $W" 2>&1 | grep -E '^[0-9]+ |rror' ;; esac
  bash tools/video/scenes/rec$n.sh 2>&1 | grep -E "miss|✗|준비" | head -5
  # 앞 장면이 끝난 화면 상태 때문에 준비에서 멈추면(녹화 기록이 비면) 한 번 더 찍는다
  [ -s $W/marks.txt ] && grep -q '^rec1' $W/marks.txt || { echo "↻ 장면 $n 다시 녹화"; bash tools/video/scenes/rec$n.sh 2>&1 | grep -E "miss|✗|준비" | head -5; }
  tools/video/make.sh $n $W 2>&1 | grep -E "검증|불통과|  - |✓|✗"
done
