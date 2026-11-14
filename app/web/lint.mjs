// 화면 규약 검사: 낱말은 labels.ts에만, 색·크기 숫자는 theme.css에만, 색 이름은 ui/status.ts에만, Card는 정해진 파일에만(docs/design/tokens.md).
// 부품은 astryx의 props(variant, type, gap …)와 astryx가 낸 Tailwind 다리의 이름(text-secondary, bg-muted, gap-3 …)만 쓴다.
// 막는 것: #색, 숫자나 #이 든 직접 값(w-[360px], bg-[#fff]), style=. 숫자 없는 직접 값(grid-cols-[auto_1fr])은 된다.
// ponytail: 주석을 정규식으로 걷어 내는 단순 검사. 문자열 안의 `//`에 속으면 그때 파서를 쓴다.
import { readdirSync, readFileSync } from 'node:fs'

// 색(tokens.md "색 — 의미가 있을 때만"): 색 이름은 ui/status.ts에서만. 다른 파일은 그 파일이 낸 값(badge · dot · fail · caution · meter)을 넘긴다
const COLOR = /\b(variant|color|status)=(\{[^}]*)?["'](red|orange|yellow|green|teal|cyan|blue|purple|pink|success|warning|error|info)["']/
// Card(tokens.md "면"): 숫자 타일(ui/Record의 Tiles), 접속 카드, 대화 속 조치 카드, 경위 그림의 칸, 안내 카드에만. 영역마다 Card를 씌우지 않는다(Card soup)
const CARD_OK = ['ui/Record.tsx', 'Enter.tsx', 'tickets/25-카드/index.tsx', 'tickets/16-경위/index.tsx', 'ui/Tour.tsx']
const bad = []
for (const f of readdirSync('src', { recursive: true })) {
  if (!/\.tsx?$/.test(f) || f === 'labels.ts') continue
  const raw = readFileSync(`src/${f}`, 'utf8')
  // 템플릿에서 온 파일(첫 줄 `// astryx template: <id>`)은 템플릿의 스타일(style= · 직접 값)을 그대로 쓴다(components.md)
  const fromTemplate = raw.startsWith('// astryx template:')
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/\/\/.*$/gm, '')
  code.split('\n').forEach((line, i) => {
    // 다른 티켓의 폴더에서 가져오는 경로(from '../04-심사/review')는 낱말이 아니다
    const rest = line.replace(/\bL\.[가-힣A-Za-z0-9_]+|\bL\['[^']+'\]|\bfrom '\.[^']+'/g, '')
    if (/[가-힣]/.test(rest)) bad.push(`src/${f}:${i + 1} 낱말은 labels.ts에 두고 L.낱말로 쓴다`)
    if (!fromTemplate && /#[0-9a-fA-F]{3,8}\b|[a-z]-\[[^\]]*[0-9#]|style=\{/.test(rest)) bad.push(`src/${f}:${i + 1} 색·크기는 theme.css의 이름만 쓴다`)
    if (f !== 'ui/status.ts' && COLOR.test(rest)) bad.push(`src/${f}:${i + 1} 색 이름은 ui/status.ts에서만 쓴다(tokens.md 색 표)`)
    if (!['ui/status.ts', 'ui/Mark.tsx'].includes(f) && /\bbadge\(/.test(rest)) bad.push(`src/${f}:${i + 1} 상태 표지는 ui/Mark의 State로(기본 상태는 그리지 않는다, tokens.md)`)
    if (/<Banner\b/.test(rest)) bad.push(`src/${f}:${i + 1} 상세 머리에 경고 띠를 두지 않는다(tokens.md — 칩 ⚑정황과 확인 창의 사유로)`)
    if (!CARD_OK.includes(f) && /<(Card|ClickableCard)\b/.test(rest)) bad.push(`src/${f}:${i + 1} Card는 숫자 타일 · 접속 · 조치 카드에만(tokens.md 면, Card soup 금지)`)
  })
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
