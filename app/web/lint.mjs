// 화면 규약 검사: 낱말은 labels.ts에만, 색·크기 숫자는 theme.css에만.
// ponytail: 주석을 정규식으로 걷어 내는 단순 검사. 문자열 안의 `//`에 속으면 그때 파서를 쓴다.
import { readdirSync, readFileSync } from 'node:fs'

const bad = []
for (const f of readdirSync('src', { recursive: true })) {
  if (!/\.tsx?$/.test(f) || f === 'labels.ts') continue
  const code = readFileSync(`src/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/\/\/.*$/gm, '')
  code.split('\n').forEach((line, i) => {
    // 다른 티켓의 폴더에서 가져오는 경로(from '../04-심사/review')는 낱말이 아니다
    const rest = line.replace(/\bL\.[가-힣A-Za-z0-9_]+|\bL\['[^']+'\]|\bfrom '\.[^']+'/g, '')
    if (/[가-힣]/.test(rest)) bad.push(`src/${f}:${i + 1} 낱말은 labels.ts에 두고 L.낱말로 쓴다`)
    if (/#[0-9a-fA-F]{3,8}\b|[a-z]-\[|style=\{/.test(rest)) bad.push(`src/${f}:${i + 1} 색·크기는 theme.css의 이름만 쓴다`)
  })
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
