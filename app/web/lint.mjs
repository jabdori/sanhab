// 화면 규약 검사: 낱말은 labels.ts에만, 색·크기 숫자는 theme.css에만, 색 이름은 ui/status.ts에만, Card는 정해진 파일에만(docs/design/tokens.md).
// 부품은 astryx의 props(variant, type, gap …)로 꾸민다(app/web/CLAUDE.md). 날 요소 · className · style= · .css 가져오기는 astryx doctor가 센다(npm run doctor).
// 여기서 막는 것: #색, 숫자나 #이 든 직접 값(w-[360px], bg-[#fff]), style= — 템플릿에서 온 파일도 예외 없이(astryx 규칙: style={{…}} 금지).
// ponytail: 주석을 정규식으로 걷어 내는 단순 검사. 문자열 안의 `//`에 속으면 그때 파서를 쓴다.
import { readdirSync, readFileSync } from 'node:fs'

// 색(tokens.md "색"): 상태 · 범주 · 기록 종류 · 완료의 색 이름은 ui/status.ts에서만. 다른 파일은 그 파일이 낸 값(badge · tone · dot · mark · kind · done · fail · caution · meter)을 넘긴다.
// accent(테마의 강조색 — AI 표지, 고른 줄의 화살표)는 낱말의 대응이 아니라 막지 않는다
const COLOR = /\b(variant|color|status)=(\{[^}]*)?["'](red|orange|yellow|green|teal|cyan|blue|purple|pink|success|warning|error|info)["']/
// Card(tokens.md "면"): 접속 카드, 빈 대화의 제안 카드(ai-chat-landing), 대화 속 조치 카드, 경위 그림의 칸, AI 보고 카드, 기록 종류 타일(ui/Mark의 Kind — Card 색 변형을 면으로)에만. 영역마다 Card를 씌우지 않는다(Card soup)
const CARD_OK = ['Enter.tsx', 'ui/Mark.tsx', 'tickets/24-대화/index.tsx', 'tickets/25-카드/index.tsx', 'tickets/16-경위/index.tsx', 'ui/AiCard.tsx']
const bad = []
for (const f of readdirSync('src', { recursive: true })) {
  if (!/\.tsx?$/.test(f) || f === 'labels.ts') continue
  const raw = readFileSync(`src/${f}`, 'utf8')
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/\/\/.*$/gm, '')
  code.split('\n').forEach((line, i) => {
    // 다른 티켓의 폴더에서 가져오는 경로(from '../04-심사/review')는 낱말이 아니다
    const rest = line.replace(/\bL\.[가-힣A-Za-z0-9_]+|\bL\['[^']+'\]|\bfrom '\.[^']+'/g, '')
    if (/[가-힣]/.test(rest)) bad.push(`src/${f}:${i + 1} 낱말은 labels.ts에 두고 L.낱말로 쓴다`)
    if (/#[0-9a-fA-F]{3,8}\b|[a-z]-\[[^\]]*[0-9#]|style=\{/.test(rest)) bad.push(`src/${f}:${i + 1} 색·크기는 부품의 props나 토큰으로(직접 값 · style= 금지)`)
    if (f !== 'ui/status.ts' && COLOR.test(rest)) bad.push(`src/${f}:${i + 1} 색 이름은 ui/status.ts에서만 쓴다(tokens.md 색 표)`)
    if (!['ui/status.ts', 'ui/Mark.tsx'].includes(f) && /\bbadge\(/.test(rest)) bad.push(`src/${f}:${i + 1} 상태 표지는 ui/Mark로 — 머리는 State(Badge), 목록 줄은 StateDot(StatusDot)(기본 상태는 그리지 않는다, tokens.md)`)
    // 사람의 말(review.md 2-1): 버전 코드 `v1`을 붙이지 않는다, 파일 경로는 출처 칸에서만
    if (/\bv\$\{/.test(rest)) bad.push(`src/${f}:${i + 1} 버전은 v1이 아니라 낱말로(버전 1), 의미 있는 곳에서만(review.md 2-1)`)
    if (f !== 'ui/Source.tsx' && !/<Source\b/.test(rest) && /\{[^}]*\.file\}/.test(rest.replace(/\bfile=\{[^}]*\}/g, ''))) bad.push(`src/${f}:${i + 1} 파일 경로는 화면에 두지 않는다 — 출처 칸(ui/Source)에서만(review.md 2-1)`)
    if (f !== 'ui/Source.tsx' && (/^\s*\{[a-zA-Z.?]*\.id\}\s*$/.test(rest) || />\{[a-zA-Z.?]*\.id\}</.test(rest))) bad.push(`src/${f}:${i + 1} 내부 식별자(D-011 …)를 글로 그리지 않는다 — 이름으로(review.md 2-1)`)
    if (/<Banner\b/.test(rest)) bad.push(`src/${f}:${i + 1} 상세 머리에 경고 띠를 두지 않는다(tokens.md — 칩 ⚑정황과 확인 창의 사유로)`)
    if (!CARD_OK.includes(f) && /<(Card|ClickableCard)\b/.test(rest)) bad.push(`src/${f}:${i + 1} Card는 접속 · 조치 · AI 보고 카드와 경위 그림에만(tokens.md 면, Card soup 금지)`)
  })
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
