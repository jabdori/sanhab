import { Text } from '@astryxdesign/core/Text'
import { Table } from './Table'

/** 두 열 비교(당시 / 현재, 현재 / 가설, 현재 / 모의): 줄마다 이름표(다른 표의 이름 열과 같은 중간 굵기)와 두 값. 두 값이 다른 줄만 굵다. 한쪽에만 값이 있는 줄(인지일)은 굵게 하지 않는다 */
export function Compare({ head, rows }: { head: [string, string]; rows: [string, string, string?][] }) {
  return (
    <Table
      head={['', ...head]}
      rows={rows.map(([name, a, b]) => {
        const weight = b !== undefined && a !== b ? 'semibold' : undefined
        return [
          <Text weight="medium">{name}</Text>,
          <Text weight={weight}>{a}</Text>,
          <Text weight={weight}>{b ?? ''}</Text>,
        ]
      })}
    />
  )
}
