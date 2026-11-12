import { EmptyState } from '@astryxdesign/core/EmptyState'
import { L } from '../labels'

/** 빈 자리(영역의 몸통이 비었을 때): astryx EmptyState의 작은 꼴, 제목 `없음` */
export const Empty = () => <EmptyState title={L.없음} isCompact headingLevel={4} />
