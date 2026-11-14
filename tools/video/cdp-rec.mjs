// 고화질 녹화: agent-browser가 띄운 브라우저의 지금 페이지에 CDP로 붙어 화면 전송(JPEG 품질 Q)을 받아 프레임 파일과 시각(epoch 초)을 남긴다.
// 사용: node tools/video/cdp-rec.mjs <browser ws url> <출력 폴더> [품질]   — SIGTERM을 받으면 멈추고 끝낸다. 커서는 agent-browser 녹화(--cursor)가 페이지에 그린다.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
const [, , browserWs, out, q = '95'] = process.argv
mkdirSync(out, { recursive: true })
const http = browserWs.replace(/^ws:\/\//, 'http://').replace(/\/devtools\/browser\/.*$/, '')
const pages = await (await fetch(`${http}/json`)).json()
const page = pages.find((p) => p.type === 'page' && !p.url.startsWith('devtools')) ?? pages[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
let n = 0
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method !== 'Page.screencastFrame') return
  const { data, metadata, sessionId } = m.params
  const f = `f${String(++n).padStart(6, '0')}.jpg`
  writeFileSync(`${out}/${f}`, Buffer.from(data, 'base64'))
  appendFileSync(`${out}/frames.tsv`, `${metadata.timestamp}\t${f}\n`)
  send('Page.screencastFrameAck', { sessionId })
}
ws.onopen = () => {
  writeFileSync(`${out}/frames.tsv`, '')
  // 화면 설정은 연결마다 따로다: agent-browser와 같은 크기 · 배율(SCALE)을 이 연결에도 건다
  send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: Number(process.env.SCALE ?? 3), mobile: false })
  send('Page.startScreencast', { format: 'jpeg', quality: Number(q), everyNthFrame: 1, maxWidth: 3840, maxHeight: 2160 })
  console.log('rec started')
}
process.on('SIGTERM', () => {
  send('Page.stopScreencast')
  setTimeout(() => process.exit(0), 300)
})
