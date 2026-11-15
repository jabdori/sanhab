// 1080 녹화(2026-11-15 4K에서 낮춤 — 4K 캡처가 화면을 느리게 하고 프레임이 모자라 마우스가 끊겼다, 제출은 1080p): agent-browser 녹화기(화면 전송)는 배율과 상관없이 1280×720으로 찍고 키운다 — 얇은 아이콘 선 · 글자가 뭉개졌다.
// 그래서 같은 페이지에 CDP로 붙어 배율 3 스크린샷(3840×2160)을 네 개씩 동시에 요청한다(초당 약 30장). 프레임 파일과 찍힌 시각(epoch 초)을 남긴다.
// 커서는 agent-browser 녹화(--cursor)가 페이지 안에 그리므로 스크린샷에 함께 찍힌다.
// 사용: node tools/video/cdp-rec.mjs <browser ws url> <출력 폴더>   — SIGTERM을 받으면 멈추고 끝낸다. 영상으로 묶는 것은 stitch.py
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
const [, , browserWs, out] = process.argv
mkdirSync(out, { recursive: true })
writeFileSync(`${out}/frames.tsv`, '')
const http = browserWs.replace(/^ws:\/\//, 'http://').replace(/\/devtools\/browser\/.*$/, '')
const page = (await (await fetch(`${http}/json`)).json()).find((p) => p.type === 'page' && p.url.startsWith('http'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const wait = {}
const call = (method, params = {}) => new Promise((r) => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params })) })
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (wait[m.id]) { wait[m.id](m); delete wait[m.id] } }
await new Promise((r) => (ws.onopen = r))
// 화면 설정은 연결마다 따로다: agent-browser와 같은 크기 · 배율을 이 연결에도 건다
// 화면 설정(Emulation)은 덮어쓰지 않는다 — 덮어쓰면 agent-browser의 클릭이 엇나간다. 배율은 스크린샷의 clip.scale로만 준다
let on = true
let n = 0
process.on('SIGTERM', () => { on = false })
console.log('rec started')
await Promise.all([0, 1].map(async () => {
  while (on) {
    const t0 = Date.now() / 1000
    const r = await call('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1280, height: 720, scale: 1.5 } })
    const t1 = Date.now() / 1000
    if (!r.result) continue
    const f = `f${String(++n).padStart(6, '0')}.jpg`
    writeFileSync(`${out}/${f}`, Buffer.from(r.result.data, 'base64'))
    appendFileSync(`${out}/frames.tsv`, `${((t0 + t1) / 2).toFixed(4)}\t${f}\n`)
  }
}))
process.exit(0)
