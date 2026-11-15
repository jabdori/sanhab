#!/usr/bin/env python3
"""cdp-rec.mjs의 프레임을 녹화 시작(rec)~끝(end) 구간의 정확한 30fps 3840×2160 영상으로 묶는다.
매 1/30초마다 그 순간까지 찍힌 가장 최근 프레임을 쓴다(시작 전에는 첫 프레임).
사용: stitch.py <프레임 폴더> <rec epoch> <end epoch> <출력 mp4>"""
import bisect, os, subprocess, sys

src, rec, end, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
rows = sorted((float(t), f) for t, f in (l.split('\t') for l in open(f'{src}/frames.tsv').read().split('\n') if l))
assert rows, '프레임 없음'
ts = [t for t, _ in rows]
n = round((end - rec) * 30)
pick = [rows[max(0, bisect.bisect_right(ts, rec + i / 30) - 1)][1] for i in range(n)]
lst = f'{src}/list.txt'
with open(lst, 'w') as fh:
    for f in pick:
        fh.write(f"file '{os.path.abspath(f'{src}/{f}')}'\nduration {1/30:.6f}\n")
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-frames:v', str(n),
                '-vf', 'fps=30,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', out], check=True)
gaps = sorted(b - a for a, b in zip(ts, ts[1:]))
print(f'stitch {len(rows)}장 → {n}프레임, 평균 {len(rows)/(ts[-1]-ts[0]):.1f}장/초, 가장 긴 틈 {gaps[-1] if gaps else 0:.2f}초')
