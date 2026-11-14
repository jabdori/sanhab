// 07 지급: 지급 기록(pages/Pay)의 숫자 타일과 페이지 조치. 데이터는 pay.ts의 usePay().
// 상태(대기·재심사·이체·완료)는 상태 Badge(ui/status), 이체는 지급으로 표시했고 은행의 회신을 기다리는 것(D54). 원본의 값(승인·미지급·반려)은 여기에 없다.
import { HStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import { api, changedAtom, store, targetAtom, useData } from '../../state'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Table } from '@astryxdesign/core/Table'
import { Region } from '../../ui/Region'
import type { Review } from '../04-심사/review'
import { Empty } from '../../ui/Empty'
import { Act } from '../../ui/Record'
import { Source } from '../../ui/Source'
import { Tiles } from '../../ui/Record'
import { meter, num, pct } from '../../ui/status'
import { usePay } from './pay'

/** 판단의 재료 타일: 금액(원본이라 행 번호 표지) · 계좌 · 이 지급을 승인한 심사(누르면 그 심사가 열린다) */
export function PayTiles() {
  const p = usePay()
  const r = useData<Review>(p ? `/reviews/${p.pay.review.id}` : null)?.review
  if (!p) return null
  const { pay } = p
  const over = !!r?.limit && r.total > r.limit
  // 지표만: 이 지급의 금액, 이 지급을 승인한 심사의 합산(한도 대비 막대)과 한도. 계좌 · 심사 같은 글은 보조 칸의 요약으로
  return (
    <Tiles
      items={[
        { name: L.금액, value: num(pay.amount), aside: <Source kind={pay.source} file={pay.file} row={pay.row} /> },
        ...(r
          ? [
              {
                name: L.합산,
                value: num(r.total),
                below: r.limit ? <ProgressBar label={L.한도} isLabelHidden value={Math.min(r.total, r.limit)} max={r.limit} variant={meter(over)} hasValueLabel formatValueLabel={() => pct(r.total, r.limit!)} /> : undefined,
              },
              { name: L.한도, value: r.limit === null ? L.미상 : num(r.limit) },
            ]
          : []),
      ]}
    />
  )
}

/** 구성: 이 지급을 승인한 심사에 묶인 대리점과 금액 — 지급이 어느 묶음의 돈인지(이 대리점이 굵게) */
export function PayGroup() {
  const p = usePay()
  const r = useData<Review>(p ? `/reviews/${p.pay.review.id}` : null)
  const setTarget = useSetAtom(targetAtom)
  if (!p || !r) return null
  const rows = r.members.map((m) => ({ id: m.id, name: m.name, amount: m.pays.reduce((n, x) => n + x.amount, 0), self: m.id === p.pay.dealer }))
  return (
    <Region title={L.구성} aside={<Link type="supporting" onClick={() => setTarget({ kind: L.심사, id: r.review.id })}>{`${r.review.name} · ${r.review.ym}`}</Link>}>
      <Table<(typeof rows)[number]>
        data={rows}
        idKey="id"
        density="balanced"
        columns={[
          { key: 'name', header: L.대리점, renderCell: (x) => <Text weight={x.self ? 'semibold' : 'normal'}>{x.name}</Text> },
          { key: 'amount', header: L.금액, align: 'end', renderCell: (x) => <Text weight={x.self ? 'semibold' : 'normal'} hasTabularNumbers>{num(x.amount)}</Text> },
        ]}
      />
    </Region>
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

