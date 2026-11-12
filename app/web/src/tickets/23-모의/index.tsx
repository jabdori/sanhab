// 23 모의: 규정 기록에서 영업임원과 내부 감시가 한도를 넣어 보면, 코드가 모든 심사를 그 한도로 다시 따져 승인권자가 달라지는 심사를 세어 보인다.
// 값은 모두 코드가 계산한 것이고 출처는 가정이다. 심사의 상태·승인권자·작업은 바뀌지 않는다(저장하지 않는 계산).
// 페이지 조치(Simulate)에서 한도를 넣고, 본문(Result)에 결과를 둔다. 결과는 두 컴포넌트가 나눠 쓰는 atom에 있다.
import { VStack } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, menuAtom, roleAtom, targetAtom, useData } from '../../state'
import { Compare } from '../../ui/Compare'
import { Confirm } from '../../ui/Confirm'
import { grade } from '../../ui/grade'
import { Region } from '../../ui/Region'
import { Source } from '../../ui/Source'
import { Tiles } from '../../ui/Record'
import { num } from '../../ui/status'

type Mock = {
  limit: number
  total: number
  changed: number
  /** [영업지원, 영업임원]인 심사의 수 */
  now: [number, number]
  mock: [number, number]
  rows: ({ id: string; name: string; ym: string; total: number; approver: [string, string] } & Record<string, unknown>)[]
}

/** 마지막 모의의 결과와, 어느 역할이 얻은 것인지(역할이 바뀌면 보이지 않는다) */
const resultAtom = atom<{ role: string; mock: Mock } | null>(null)

const MAX = 1_000_000_000
/** 지금 역할이 모의를 할 수 있는지와 승인권자의 낱말(서버가 정한다) */
type Info = { can: boolean; approvers: [string, string] }

/** 페이지 조치: 누르면 확인 창에서 한도를 받아 모의한다. 모의할 수 없는 역할에는 없다. 서버가 거절하면 `onBad`로 그 낱말 */
export function Simulate({ target, onBad }: { target: string; onBad: (word: string | null) => void }) {
  const role = useAtomValue(roleAtom)
  const info = useData<Info>('/mock')
  const setResult = useSetAtom(resultAtom)
  const [won, setWon] = useState<number | null>(1_500_000)
  if (!info?.can) return null
  return (
    <Confirm
      label={L.모의}
      variant={grade(L.모의)}
      title={`${L.모의} · ${target}`}
      canConfirm={!!won && won >= 1 && won <= MAX}
      onConfirm={() => {
        onBad(null)
        return api<Mock>('/mock', { limit: won }).then(
          (mock) => setResult({ role: role!, mock }),
          (e: Error) => onBad(e.message),
        )
      }}
    >
      <NumberInput label={L.한도} width="100%" value={won} onChange={setWon} min={1} max={MAX} isIntegerOnly formatValue={num} />
    </Confirm>
  )
}

/** 본문: 한도와 변동 타일, 현재 / 모의 두 열, 달라지는 심사의 목록. 심사 이름을 누르면 그 심사가 열린다 */
export function Result() {
  const r = useAtomValue(resultAtom)
  const role = useAtomValue(roleAtom)
  const info = useData<Info>('/mock')
  const setMenu = useSetAtom(menuAtom)
  const setTarget = useSetAtom(targetAtom)
  if (!r || !info || r.role !== role) return null
  const m = r.mock
  return (
    <Region title={L.모의} aside={<Source kind={L.계산} tip={`${L.한도} ${num(m.limit)}`} rows={[[L.한도, num(m.limit)]]} />}>
      <VStack gap={4}>
        <Tiles
          items={[
            { name: L.한도, value: num(m.limit) },
            { name: L.변동, value: m.changed, below: <Text type="supporting" color="secondary" hasTabularNumbers>{`${L.전체} ${m.total}`}</Text> },
          ]}
        />
        <Compare
          head={[L.현재, L.모의]}
          rows={[
            [info.approvers[0], String(m.now[0]), String(m.mock[0])],
            [info.approvers[1], String(m.now[1]), String(m.mock[1])],
          ]}
        />
        <Table<Mock['rows'][number]>
          data={m.rows}
          idKey="id"
          density="compact"
          columns={[
            {
              key: 'name',
              header: L.심사,
              width: proportional(2, { minWidth: 80 }),
              renderCell: (x) => (
                <Link
                  weight="semibold"
                  onClick={() => {
                    setMenu(L.작업)
                    setTarget({ kind: L.심사, id: x.id })
                  }}
                >
                  {x.name}
                </Link>
              ),
            },
            { key: 'ym', header: L.귀속월, width: pixel(76), renderCell: (x) => <Text hasTabularNumbers>{x.ym}</Text> },
            { key: 'total', header: L.합산, align: 'end', width: pixel(100), renderCell: (x) => <Text weight="semibold" hasTabularNumbers>{num(x.total)}</Text> },
            { key: 'now', header: L.현재, width: pixel(78), renderCell: (x) => <Text color="secondary">{x.approver[0]}</Text> },
            { key: 'mock', header: L.모의, width: pixel(78), renderCell: (x) => <Text weight="semibold">{x.approver[1]}</Text> },
          ]}
        />
      </VStack>
    </Region>
  )
}

export default [] satisfies Piece[]
