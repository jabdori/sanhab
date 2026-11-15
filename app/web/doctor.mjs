// astryx doctor의 "Source uses Astryx well" 관문: 지적(날 요소 · 아이콘 직접 렌더 · className · style= · .css 가져오기)이 하나라도 있으면 줄마다 찍고 실패한다.
// `npx astryx doctor --built .`는 지적이 있어도 경고로만 끝나고 앞의 5건만 보여서, 같은 검사(scanBuilt)를 직접 부른다.
// ponytail: CLI 안쪽 파일을 경로로 부른다(공개 API가 아니다). CLI를 올려 경로가 바뀌면 여기를 고친다
import { scanBuilt } from './node_modules/@astryxdesign/cli/api/doctor/built-checks.mjs'

// 남겨 둔 지적: astryx에 대응 부품이 없는 곳만. 이유는 docs/design/components.md "템플릿에서 벗어난 곳" 표에 있다. 줄 번호가 아니라 파일 · 종류로 묶는다
const KEPT = [
  ['src/main.tsx', 'stylesheet'], // theme.css: Tailwind 다리 · Pretendard 글꼴 · 전역 어절 줄바꿈(tokens.md 예외)
  ['src/ui/Relation.tsx', '<svg>'], // 관계 그림 — 노드 · 선 그림 부품이 없다
  ['src/tickets/16-경위/index.tsx', '<svg>'], // 경위 그림
  ['src/tickets/19-서류/index.tsx', ''], // 서류 원본(PDF · 이미지)과 위치 상자 — 그림 위 겹침 부품이 없다
  ['src/tickets/24-대화/index.tsx', '<input>'], // 서류 붙이기 단추 뒤의 숨은 file input — FileInput은 보이는 칸뿐
]
const all = scanBuilt(new URL('.', import.meta.url).pathname, []).findings
const findings = all.filter((f) => !KEPT.some(([file, kind]) => f.file === file && f.message.includes(kind)))
console.error(`남겨 둔 것(이유는 components.md): ${all.length - findings.length}`)
for (const f of findings) console.error(`${f.file}:${f.line} ${f.message}`)
console.error(`astryx doctor: ${findings.length}`)
process.exit(findings.length ? 1 : 0)
