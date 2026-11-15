// 목록 사이드바(table-inbox의 목록 열): 기록을 연 채 같은 메뉴의 다른 줄로 옮겨 다닌다. 기록을 열면 접힌 채 시작하고(본문 폭), 기록 머리의 `목록` 단추로 편다.
import { Icon } from '@astryxdesign/core/Icon'
import { List, ListItem } from '@astryxdesign/core/List'
import { Heading } from '@astryxdesign/core/Text'
import { Section, VStack } from '@astryxdesign/core/Layout'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { FlagIcon } from '@heroicons/react/24/outline'
import { L } from './labels'
import { menuAtom, navAtom, stepAtom, targetAtom, useData, type Target } from './state'
import { type Task, sortTasks } from './pages/Work'
import { num } from './ui/status'
import { useRules } from './tickets/22-규정'

type Item = { go: Target; label: string; description?: string; flag?: boolean }

export function Pane() {
  const menu = useAtomValue(menuAtom)
  const target = useAtomValue(targetAtom)
  const step = useSetAtom(stepAtom)
  const setNav = useSetAtom(navAtom)
  const tasks = useData<{ mine: Task[] }>(menu === L.작업 ? '/tasks' : null)
  const dealers = useData<{ id: string; name: string }[]>(menu === L.대리점 ? '/dealers' : null)
  const rules = useRules().data
  const items: Item[] =
    menu === L.작업
      ? // 작업 목록 · n/전체와 같은 순서(pages/Work의 sortTasks)
        sortTasks(tasks?.mine ?? []).map((t) => ({
          go: { kind: t.view, id: t.target },
          label: t.name ?? t.target,
          description: [t.kind, t.ym, t.total != null ? num(t.total) : null].filter(Boolean).join(' · '),
          flag: t.marks.includes(L.정황),
        }))
      : menu === L.대리점
        ? (dealers ?? []).map((d) => ({ go: { kind: L.대리점, id: d.id }, label: d.name, description: d.id }))
        : (rules?.clauses ?? []).map((c) => ({ go: { kind: L.규정, id: c.id }, label: c.title }))
  // 조치로 작업이 줄면 기록 머리의 n/전체도 남은 작업 수로(처리한 줄은 순서에서 뺀다)
  const left = menu === L.작업 && tasks ? new Set(items.map((x) => `${x.go.kind}/${x.go.id}`)) : null
  useEffect(() => {
    if (left) setNav((nav) => (nav.every((n) => left.has(`${n.kind}/${n.id}`)) ? nav : nav.filter((n) => left.has(`${n.kind}/${n.id}`))))
  }, [tasks]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <VStack gap={0}>
      <Section variant="transparent" padding={4} paddingBlockEnd={2}>
        <Heading level={3}>{menu}</Heading>
      </Section>
      <List hasDividers density="compact">
        {items.map((it) => (
          <ListItem
            key={`${it.go.kind}/${it.go.id}`}
            label={it.label}
            description={it.description}
            isSelected={it.go.kind === target?.kind && it.go.id === target?.id}
            endContent={it.flag ? <Icon icon={FlagIcon} size="sm" color="secondary" /> : undefined}
            onClick={() => {
              // 목록 안에서 옮겨 다니는 것은 돌아가기에 쌓지 않는다(n/전체와 같다)
              setNav(items.map((x) => x.go))
              step(it.go)
            }}
          />
        ))}
      </List>
    </VStack>
  )
}
