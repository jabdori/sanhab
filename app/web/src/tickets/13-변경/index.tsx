// 13 변경: 대리점 기록의 페이지 조치 `변경`(항목, 값, 변경일을 확인 창에서 입력)과 이력. 변경을 넣을 수 있는 역할(영업지원, 서버의 `can`)에게만 조치가 있다.
// 인지일(시스템의 오늘)·경로(신고)·출처(시연)는 서버가 찍는다. 되돌리기 어려운 조치라 확인 창을 거치고, 보낸 뒤 새 값을 받을 때까지는 다시 눌리지 않는다.
import { DateInput } from '@astryxdesign/core/DateInput'
import { VStack } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useAtomValue } from 'jotai'
import { type ComponentProps, useState } from 'react'
import { Icon } from '@astryxdesign/core/Icon'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { L } from '../../labels'
import { api, targetAtom, useData } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { grade } from '../../ui/grade'
import { useDetail } from '../02-대리점'

const ITEMS = [L.대표자, L.주소, L.계좌] as const

/** 달력에 있는 YYYY-MM-DD인가(2026-02-30은 아니다) */
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !!new Date(`${s}T00:00:00Z`).toJSON()?.startsWith(s)

/** 지금 역할이 변경을 넣을 수 있는지(서버가 정한다). 읽기 전에는 undefined */
export const useCanChange = () => useData<{ can: boolean }>('/change')?.can

/** 페이지 조치: 누르면 확인 창에서 항목 · 값 · 변경일을 받는다. 서버가 거절하면 `onBad`로 그 낱말 */
export function Change({ onBad }: { onBad: (word: string | null) => void }) {
  const d = useDetail()
  const can = useCanChange()
  const today = useData<{ today: string }>('/state')?.today
  const [item, setItem] = useState<string>(L.주소)
  const [value, setValue] = useState('')
  const [since, setSince] = useState('')
  // 보낸 때의 상세. 새 값을 받을 때까지(또는 거절될 때까지) 다시 누를 수 없다
  const [sent, setSent] = useState<unknown>(null)
  if (!d || !can) return null
  const ok = value.trim() !== '' && isDay(since)
  return (
    <Confirm
      label={L.변경}
      variant={grade(L.변경)}
      isDisabled={sent === d}
      canConfirm={ok}
      title={`${L.변경} · ${d.dealer.name}`}
      rows={[
        [L.인지일, today ?? ''],
        [L.경로, L.신고],
      ]}
      onConfirm={() => {
        setSent(d)
        onBad(null)
        return api('/change', { id: d.dealer.id, item, value: value.trim(), since }).then(
          () => {
            setValue('')
            setSince('')
          },
          (e: Error) => {
            onBad(e.message)
            setSent(null)
          },
        )
      }}
    >
      <VStack gap={3}>
        <RadioList label={L.항목} orientation="horizontal" value={item} onChange={setItem}>
          {ITEMS.map((v) => (
            <RadioListItem key={v} label={v} value={v} />
          ))}
        </RadioList>
        <TextInput label={L.값} width="100%" value={value} onChange={setValue} />
        <DateInput label={L.변경일} width="100%" presentation="native" max={(today || undefined) as ComponentProps<typeof DateInput>['max']} format="system_date" value={(since || undefined) as ComponentProps<typeof DateInput>['value']} onChange={(v) => setSince(v ?? '')} />
      </VStack>
    </Confirm>
  )
}

type Changed = { kind: string; role: string; at: string; item: string; value: string; since: string }

/** 이력: 그 대리점에 들어온 변경을 일어난 순서대로. 06의 이력과 같은 꼴 — 역할의 Avatar · `변경 · 역할` / `항목 값 · 변경일 날짜` / 날짜 */
export function History() {
  const target = useAtomValue(targetAtom)
  const h = useData<Changed[]>(target && `/dealers/${target.id}/changes`)
  if (!target || !h) return null
  if (!h.length) return <Empty />
  return (
    <List density="spacious">
      {h.map((x, i) => (
        <ListItem
          key={i}
          align="start"
          startContent={<Icon icon={UserCircleIcon} size="md" color="secondary" />}
          label={[x.kind, x.role].join(' · ')}
          description={`${x.item} ${x.value} · ${L.변경일} ${x.since}`}
          endContent={x.at ? <Text type="supporting" color="secondary" hasTabularNumbers>{x.at}</Text> : <Text type="supporting" color="secondary">{L.미상}</Text>}
        />
      ))}
    </List>
  )
}

