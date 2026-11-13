// 안내(온보딩): 요소를 하나씩 밝히고(둘레를 어둡게) 옆에 설명 카드를 띄운다. astryx에 둘러보기 부품이 없어 구멍과 카드의 자리를 직접 잰다(Popover의 밖 기준점은 고정 위치 요소를 따라가지 않았다).
// 역할마다 처음 들어올 때 한 번(이 브라우저 기준), 메뉴 레일의 `안내`로 다시. 아무것도 결정하지 않는다 — 기록을 열어 보여 줄 뿐이고 끝나면 목록으로 돌아간다
import { Button } from '@astryxdesign/core/Button'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { L, TOUR } from '../labels'
import { firstTask, type Task } from '../pages/Work'
import { api, roleAtom, targetAtom } from '../state'

export const tourAtom = atom(false)

const seenKey = (role: string) => `tour:${role}`
/** 이 역할로 안내를 본 적이 있는가(저장소가 막혀 있으면 본 것으로 — 매번 뜨지 않게) */
export const seen = (role: string) => {
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

/** 선택자의 요소가 나타날 때까지 잠깐 기다린다(기록을 연 직후). 없으면 null */
const wait = (sel: string, ms = 3000) =>
  new Promise<Element | null>((done) => {
    const t0 = Date.now()
    const look = () => {
      const el = document.querySelector(sel)
      if (el && el.getBoundingClientRect().width > 0) return done(el)
      if (Date.now() - t0 > ms) return done(null)
      setTimeout(look, 100)
    }
    look()
  })

export function Tour() {
  const [open, setOpen] = useAtom(tourAtom)
  const role = useAtomValue(roleAtom)
  const setTarget = useSetAtom(targetAtom)
  const steps = (role && TOUR[role]) || []
  const [i, setI] = useState(0)
  const [el, setEl] = useState<Element | null>(null)
  const [ready, setReady] = useState(false)
  const hole = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // 이 역할로 처음 들어오면 저절로 연다
  useEffect(() => {
    if (role && TOUR[role] && !seen(role)) setOpen(true)
  }, [role, setOpen])
  useEffect(() => {
    if (open) {
      setI(0)
      opened.current = false
      if (role) markSeen(role)
    }
  }, [open, role])

  // 단계가 바뀌면: 필요하면 첫 기록을 열고, 밝힐 요소를 찾는다. 요소가 없으면(빈 목록의 기록 단계) 그 단계를 건너뛴다
  useEffect(() => {
    if (!open) return
    const s = steps[i]
    if (!s) return
    let live = true
    setReady(false)
    // 기록을 열기 전 단계로 돌아가면 기록을 닫는다(목록을 다시 밝히게)
    const first = steps.findIndex((x) => x.record)
    if (opened.current && first >= 0 && i < first) {
      opened.current = false
      setTarget(null)
    }
    ;(async () => {
      if (s.record && !opened.current) {
        const d = await api<{ mine: Task[] }>('/tasks').catch(() => null)
        const t = d && firstTask(d.mine)
        if (t) {
          opened.current = true
          setTarget({ kind: t.view, id: t.target })
        }
      }
      const found = s.at ? await wait(s.at) : null
      if (!live) return
      if (s.at && !found) {
        // 이 단계와, 기록이 없어 이어지는 기록의 단계를 건너뛴다
        const next = steps.findIndex((x, k) => k > i && (!x.at || document.querySelector(x.at)))
        if (next < 0) return close()
        return setI(next)
      }
      setEl(found)
      // 구멍을 먼저 옮기고 설명 창을 띄운다(창은 뜰 때 기준점을 잰다)
      place(found)
      setReady(true)
    })()
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i])

  // 구멍(밝힌 자리)을 요소에 맞춘다. 화면이 움직여도 따라가게 짧게 다시 잰다
  const place = (target: Element | null) => {
    const h = hole.current
    if (!h) return
    const r = target?.getBoundingClientRect()
    const pad = target ? 4 : 0
    // 가운데 단계는 화면 위쪽 3분의 1에 크기 없는 구멍(둘레 전체가 어둡다)
    const [x, y, w, hgt] = r ? [r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2] : [innerWidth / 2, innerHeight / 3, 0, 0]
    const set = (e: HTMLElement, k: string, v: number) => e.style.setProperty(k, `${Math.round(v)}px`)
    set(h, 'left', x)
    set(h, 'top', y)
    set(h, 'width', w)
    set(h, 'height', hgt)
    // 카드의 자리: 좁은 왼쪽 요소면 오른쪽에, 오른쪽 요소면 왼쪽에, 넓은 요소면 아래(아래가 모자라면 위). 화면 안으로 당긴다
    const c = card.current
    if (!c) return
    const cw = c.offsetWidth
    const ch = c.offsetHeight
    const gap = 12
    let [cx, cy] = [innerWidth / 2 - cw / 2, innerHeight / 3]
    if (r) {
      if (r.width < innerWidth * 0.3 && r.right < innerWidth * 0.55) [cx, cy] = [r.right + gap, r.top]
      else if (r.left > innerWidth * 0.45) [cx, cy] = [r.left - cw - gap, r.top]
      else if (innerHeight - r.bottom > ch + gap * 2) [cx, cy] = [r.left, r.bottom + gap]
      else if (r.top > ch + gap * 2) [cx, cy] = [r.left, r.top - ch - gap]
      else [cx, cy] = [r.left + gap * 2, r.top + gap * 2]
    }
    set(c, 'left', Math.min(Math.max(16, cx), innerWidth - cw - 16))
    set(c, 'top', Math.min(Math.max(16, cy), innerHeight - ch - 16))
  }
  // Esc로 닫는다
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  // 카드가 그려진 뒤(크기를 알게 된 뒤) 자리를 잡는다
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
  }, [open, ready, el])

  const close = () => {
    setOpen(false)
    setEl(null)
    if (opened.current) setTarget(null)
  }
  if (!open || !steps.length) return null
  const s = steps[i]
  return (
    <>
      {/* 바깥을 누르는 것을 막는 막 + 둘레를 어둡게 하는 구멍(theme.css의 tour-) */}
      <div className="tour-veil" />
      <div ref={hole} className="tour-hole" />
      {ready && (
        <div ref={card} className="tour-card" role="dialog" aria-label={L.안내}>
          <Card>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  <Text weight="semibold">{s.title}</Text>
                </StackItem>
                <Text type="supporting" color="secondary" hasTabularNumbers>{`${i + 1}/${steps.length}`}</Text>
              </HStack>
              <Text>{s.body}</Text>
              <HStack gap={2}>
                <StackItem size="fill">{i < steps.length - 1 && <Button label={L.끝} variant="ghost" size="sm" onClick={close} />}</StackItem>
                {i > 0 && <Button label={L.이전} variant="secondary" size="sm" onClick={() => setI(i - 1)} />}
                {i < steps.length - 1 ? <Button label={L.다음} variant="primary" size="sm" onClick={() => setI(i + 1)} /> : <Button label={L.끝} variant="primary" size="sm" onClick={close} />}
              </HStack>
            </VStack>
          </Card>
        </div>
      )}
    </>
  )
}
