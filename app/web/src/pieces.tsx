// 티켓이 화면의 자리에 조각을 끼우는 방법. 티켓마다 src/tickets/NN-이름/index.tsx가 Piece[]를 default로 내놓으면 저절로 모인다.
import { useAtomValue } from 'jotai'
import type { ComponentType } from 'react'
import { type Menu, menuAtom, targetAtom } from './state'
import { Empty } from './ui/Empty'

/** 자리: 목록 / 가운데(사실) / 오른쪽의 조치·사유·보고·경위·이력 / 대화 */
export type Slot = 'list' | 'fact' | 'action' | 'reason' | 'report' | 'trail' | 'history' | 'chat'
export type Piece = {
  slot: Slot
  /** list 조각: 어느 메뉴의 목록인지 */
  menu?: Menu
  /** 그 밖의 조각: 열어 둔 대상의 kind가 이것일 때 보인다. 없으면 대상이 무엇이든 보인다 */
  kind?: string
  /** 같은 자리 안의 순서(작은 것이 위). 기본은 티켓 번호 순 */
  order?: number
  View: ComponentType
}

const found = import.meta.glob<{ default: Piece[] }>('./tickets/*/index.tsx', { eager: true })
const pieces = Object.keys(found).sort().flatMap((k, i) => found[k].default.map((p) => ({ ...p, order: p.order ?? i })))
pieces.sort((a, b) => a.order - b.order)

export function usePieces(slot: Slot) {
  const menu = useAtomValue(menuAtom)
  const target = useAtomValue(targetAtom)
  return pieces.filter((p) => p.slot === slot && (slot === 'list' ? p.menu === menu : slot === 'chat' || (target && (!p.kind || p.kind === target.kind))))
}

/** 자리 하나. 끼울 조각이 없으면 `없음` */
export function SlotView({ slot }: { slot: Slot }) {
  const list = usePieces(slot)
  return list.length ? list.map((p, i) => <p.View key={i} />) : <Empty />
}
