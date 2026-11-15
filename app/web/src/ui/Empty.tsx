import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Icon } from '@astryxdesign/core/Icon'
import { InboxIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { L } from '../labels'

/** 빈 자리(영역의 몸통이 비었을 때): astryx EmptyState의 작은 꼴, 제목 `없음` */
export const Empty = () => <EmptyState title={L.없음} isCompact headingLevel={4} />

/** 목록의 빈 자리(EmptyStateActions 꼴): 아이콘 + 제목 `없음`. 걸린 검색이 있을 때만 조치 `초기화`(copy.md 규칙 4: 빈 자리에는 "없음"만 — 검색어를 되풀이하지 않는다) */
export const NoResult = ({ query, onClear }: { query: string; onClear: () => void }) =>
  query.trim() ? (
    <EmptyState icon={<Icon icon={MagnifyingGlassIcon} size="lg" />} title={L.없음} actions={<Button label={L.초기화} variant="secondary" onClick={onClear} />} />
  ) : (
    <EmptyState icon={<Icon icon={InboxIcon} size="lg" />} title={L.없음} />
  )
