// 안내(온보딩): 예시 기록(ui/example.json) 위에서 요소를 하나씩 밝히고(둘레를 어둡게, 가장자리에 링) 옆에 떠 있는 흰 카드로 한 줄을 띄운다.
// astryx에 둘러보기 부품이 없어 구멍과 카드의 자리를 직접 잰다. 역할마다 처음 들어올 때 한 번(이 브라우저 기준), 도움말 창에서 다시.
// 예시가 켜진 동안 화면은 서버 대신 예시 응답을 받고 조치는 실행되지 않는다(state.ts의 exampleAtom). 끝나면 예시를 끄고 목록으로 돌아간다
import { Button } from '@astryxdesign/core/Button'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { L, TOUR } from '../labels'
import { changedAtom, exampleAtom, roleAtom, store, targetAtom, type Target } from '../state'
import EXAMPLE from './example.json'

export const tourAtom = atom(false)

type Example = { target: Target; stages: Record<string, unknown>[] }
const EX = EXAMPLE as Record<string, Example>

const seenKey = (role: string) => `tour:${role}`
/** 이 역할로 안내를 본 적이 있는가(저장소가 막혀 있으면 본 것으로 — 매번 뜨지 않게) */
const seen = (role: string) => {
  try {
    return localStorage.getItem(seenKey(role)) === '1'
  } catch {
    return true
  }
}
const markSeen = (role: string) => {
  try {
    localStorage.setItem(seenKey(role), '1')
  } catch {
    /* 저장소가 막혀 있으면 기억하지 않는다 */
  }
}

/** 밝힐 자리: 선택자에 걸린 요소들을 모두 감싸는 사각형(근거 표 + 관계 그림처럼 여러 영역을 함께 밝힐 때) */
const bounds = (sel: string) => {
  const rs = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
  if (!rs.length) return null
  const [l, t, r, b] = [Math.min(...rs.map((x) => x.left)), Math.min(...rs.map((x) => x.top)), Math.max(...rs.map((x) => x.right)), Math.max(...rs.map((x) => x.bottom))]
  return new DOMRect(l, t, r - l, b - t)
}

/** 선택자의 요소가 나타날 때까지 잠깐 기다린다(예시 기록을 연 직후). 없으면 null */
const wait = (sel: string, ms = 3000) =>
  new Promise<string | null>((done) => {
    const t0 = Date.now()
    const look = () => {
      if (bounds(sel)) return done(sel)
      if (Date.now() - t0 > ms) return done(null)
      setTimeout(look, 100)
    }
    look()
  })

export function Tour() {
  const [open, setOpen] = useAtom(tourAtom)
  const role = useAtomValue(roleAtom)
  const setTarget = useSetAtom(targetAtom)
  // 예시를 바꾸면 changedAtom도 올린다: 기록 화면의 조회(atom)들이 그것을 보고 다시 읽는다
  const setExample = (v: Record<string, unknown> | null) => {
    if (store.get(exampleAtom) === v) return
    store.set(exampleAtom, v)
    store.set(changedAtom, (n) => n + 1)
  }
  const steps = (role && TOUR[role]) || []
  const ex = role ? EX[role] : undefined
  const [i, setI] = useState(0)
  const [el, setEl] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const hole = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)

  // 이 역할로 처음 들어오면 저절로 연다
  useEffect(() => {
    if (role && TOUR[role] && !seen(role)) setOpen(true)
  }, [role, setOpen])
  useEffect(() => {
    if (open) {
      setI(0)
      if (role) markSeen(role)
    }
  }, [open, role])

  // 단계마다: 예시의 장면을 고르고, 기록 단계면 예시 기록을 연다(아니면 닫는다). 밝힐 요소가 없으면 건너뛴다
  useEffect(() => {
    if (!open || !ex) return
    const s = steps[i]
    if (!s) return
    let live = true
    setReady(false)
    // 장면은 문제가 드러난 단계부터 그대로 이어진다(뒤로 가면 앞 장면으로)
    const stage = Math.max(0, ...steps.slice(0, i + 1).map((x) => x.stage ?? 0))
    setExample(ex.stages[Math.min(stage, ex.stages.length - 1)])
    setTarget(s.record ? ex.target : null)
    ;(async () => {
      const found = await wait(s.at)
      if (!live) return
      if (!found) return i < steps.length - 1 ? setI(i + 1) : close()
      // 밝힐 영역을 화면 가운데로(아래에 걸쳐 잘리지 않게). 스크롤이 멈춘 뒤 링과 카드를 둔다
      document.querySelector(found)?.scrollIntoView({ block: 'center' })
      await new Promise((r) => setTimeout(r, 150))
      if (!live) return
      setEl(found)
      setReady(true)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i])

  // 구멍(밝힌 자리)과 카드의 자리. 카드: 좁은 왼쪽 요소면 오른쪽에, 오른쪽 요소면 왼쪽에, 넓은 요소면 아래(모자라면 위). 꼬리는 요소 쪽 가장자리에
  const place = (sel: string | null) => {
    const h = hole.current
    const c = card.current
    const r = sel && bounds(sel)
    if (!h || !r) return
    const set = (e: HTMLElement, k: string, v: number) => e.style.setProperty(k, `${Math.round(v)}px`)
    const pad = 6
    set(h, 'left', r.left - pad)
    set(h, 'top', r.top - pad)
    set(h, 'width', r.width + pad * 2)
    set(h, 'height', r.height + pad * 2)
    if (!c) return
    const [cw, ch, gap] = [c.offsetWidth, c.offsetHeight, 16]
    let side: 'left' | 'right' | 'top' | 'bottom'
    let [cx, cy] = [0, 0]
    if (r.width < innerWidth * 0.3 && r.right < innerWidth * 0.55) [side, cx, cy] = ['left', r.right + pad + gap, r.top]
    else if (r.left > innerWidth * 0.45) [side, cx, cy] = ['right', r.left - pad - cw - gap, r.top]
    else if (innerHeight - r.bottom > ch + gap * 2) [side, cx, cy] = ['top', r.left, r.bottom + pad + gap]
    else if (r.top > ch + gap * 2) [side, cx, cy] = ['bottom', r.left, r.top - pad - ch - gap]
    else [side, cx, cy] = ['top', r.left + gap * 2, r.top + gap * 2]
    cx = Math.min(Math.max(16, cx), innerWidth - cw - 16)
    cy = Math.min(Math.max(16, cy), innerHeight - ch - 16)
    set(c, 'left', cx)
    set(c, 'top', cy)
    // 꼬리: 카드 가장자리에서 요소의 가운데 쪽으로(카드 안에 머물게)
    c.dataset.side = side
    const along = side === 'left' || side === 'right' ? Math.min(Math.max(20, r.top + Math.min(r.height, 80) / 2 - cy), ch - 20) : Math.min(Math.max(20, r.left + Math.min(r.width, 160) / 2 - cx), cw - 20)
    set(c, '--tail', along)
  }
  useLayoutEffect(() => {
    if (open && ready) place(el)
  })
  useEffect(() => {
    if (!open || !ready) return
    const again = () => place(el)
    const t = setInterval(again, 250)
    addEventListener('resize', again)
    return () => {
      clearInterval(t)
      removeEventListener('resize', again)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, el])

  const close = () => {
    setOpen(false)
    setEl(null)
    setReady(false)
    setExample(null)
    setTarget(null)
  }
  // 안내 중에는 뒤 화면(앱 틀) 전체를 키보드로도 닿지 않게(inert). 안내는 틀 밖, 테마 안에 따로 그린다(테마의 색 이름을 그대로 쓰게)
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.astryx-app-shell')
    if (!open || !root) return
    root.inert = true
    return () => {
      root.inert = false
    }
  }, [open])
  // Esc로 닫는다
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  if (!open || !steps.length) return null
  const s = steps[i]
  const last = i === steps.length - 1
  return createPortal(
    <>
      {/* 바깥을 누르는 것을 막는 막 + 둘레를 어둡게 하고 가장자리에 링을 두른 구멍(theme.css의 tour-) */}
      <div className="tour-veil" />
      <div ref={hole} className="tour-hole" hidden={!ready} />
      {ready && (
        <div ref={card} className="tour-card" role="dialog" aria-label={L.안내}>
          <VStack gap={4}>
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  <Heading level={3}>{s.title}</Heading>
                </StackItem>
                {/* 화면의 기록은 예시다(실제 업무 기록이 아니다) */}
                <Token size="sm" label={L.예시} />
              </HStack>
              <Text color="secondary">{s.body}</Text>
            </VStack>
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                {/* 진행 점: 지금 단계만 진하게 */}
                <HStack gap={1} vAlign="center" aria-label={`${i + 1}/${steps.length}`}>
                  {steps.map((_, k) => (
                    <span key={k} className={k === i ? 'tour-dot tour-dot-on' : 'tour-dot'} />
                  ))}
                </HStack>
              </StackItem>
              {!last && <Button label={L.스킵} variant="ghost" size="sm" onClick={close} />}
              {i > 0 && <Button label={L.이전} variant="secondary" size="sm" onClick={() => setI(i - 1)} />}
              <Button label={last ? L.끝 : L.다음} variant="primary" size="sm" onClick={() => (last ? close() : setI(i + 1))} />
            </HStack>
          </VStack>
        </div>
      )}
    </>,
    document.querySelector('[data-astryx-theme]') ?? document.body,
  )
}
