// astryx doctor의 "Source uses Astryx well" 관문: 지적(날 요소 · 아이콘 직접 렌더 · className · style= · .css 가져오기)이 하나라도 있으면 줄마다 찍고 실패한다.
// `npx astryx doctor --built .`는 지적이 있어도 경고로만 끝나고 앞의 5건만 보여서, 같은 검사(scanBuilt)를 직접 부른다.
// ponytail: CLI 안쪽 파일을 경로로 부른다(공개 API가 아니다). CLI를 올려 경로가 바뀌면 여기를 고친다
import { scanBuilt } from './node_modules/@astryxdesign/cli/api/doctor/built-checks.mjs'

const { findings } = scanBuilt(new URL('.', import.meta.url).pathname, [])
for (const f of findings) console.error(`${f.file}:${f.line} ${f.message}`)
console.error(`astryx doctor: ${findings.length}`)
process.exit(findings.length ? 1 : 0)
