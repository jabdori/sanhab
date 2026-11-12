// 07 지급: 지급 기록(pages/Pay)의 숫자 타일과 페이지 조치. 데이터는 pay.ts의 usePay().
// 상태(대기·재심사·이체·완료)는 상태 Badge(ui/status), 이체는 지급으로 표시했고 은행의 회신을 기다리는 것(D54). 원본의 값(승인·미지급·반려)은 여기에 없다.
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom } from '../../state'
import { Empty } from '../../ui/Empty'
import { Act } from '../../ui/Record'
import { Source } from '../../ui/Source'
import { Tiles } from '../../ui/Record'
import { num } from '../../ui/status'
import { usePay } from './pay'

/** 판단의 재료 타일: 금액(원본이라 행 번호 표지) · 계좌 · 이 지급을 승인한 심사(누르면 그 심사가 열린다) */
export function PayTiles() {
  const p = usePay()
  const setTarget = useSetAtom(targetAtom)
  if (!p) return null
  const { pay } = p
  return (
    <Tiles
      items={[
        { name: L.금액, value: num(pay.amount), aside: <Source kind={pay.source} file={pay.file} row={pay.row} /> },
        {
          name: L.계좌,
          value: p.accounts.length ? (
            <Text type="large" weight="semibold" hasTabularNumbers>
              {p.accounts.map((a) => a.value).join(' · ')}
            </Text>
          ) : (
            <Empty />
          ),
        },
        {
          name: L.심사,
          value: (
            <Link weight="semibold" onClick={() => setTarget({ kind: L.심사, id: pay.review.id })}>
              {pay.review.name}
            </Link>
          ),
        },
      ]}
    />
  )
}

/** 페이지 조치: 지급으로 표시할 수 있을 때만(주 버튼, 되돌릴 수 없으므로 확인 창). 거절되어도 화면을 다시 읽어 지금 할 수 있는 조치를 보인다 */
export function PayActions({ onBad }: { onBad: (word: string | null) => void }) {
  const p = usePay()
  if (!p?.can) return null
  return (
    <HStack gap={2}>
      <Act
        kind={L.지급}
        target={p.pay.name}
        rows={[
          [L.금액, num(p.pay.amount)],
          [L.계좌, p.accounts.map((a) => a.value).join(' · ') || L.없음],
          [L.귀속월, p.pay.ym],
        ]}
        send={() => (onBad(null), api('/pay', { id: p.pay.id }).catch((e: Error) => (onBad(e.message), store.set(changedAtom, (n) => n + 1))))}
      />
    </HStack>
  )
}

export default [] satisfies Piece[]
