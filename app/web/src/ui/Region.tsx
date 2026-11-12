import { Heading } from '@astryxdesign/core/Heading'
import type { ReactNode } from 'react'

/**
 * 영역: 이름(영역 제목, Heading 3 모양) + 몸통. 가운데의 구성·관계·규정, 오른쪽의 조치·사유·보고·경위·이력이 모두 이것이다.
 * `aside`는 이름 옆에 붙는 것(출처 표지). 몸통이 `없음`뿐이면 이름과 없음이 한 줄로 접힌다(theme.css의 [data-region]).
 * 테두리를 두지 않는다: 영역은 간격으로 나뉘고, 오른쪽 칸에서는 칸이 선을 긋는다(App)
 */
export const Region = ({ title, aside, className = '', children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) => (
  <section data-region="" className={`flex flex-col gap-3 ${className}`}>
    <div className="flex items-center gap-2">
      <Heading level={3} accessibilityLevel={2}>
        {title}
      </Heading>
      {aside}
    </div>
    <div data-region-body="" className="flex min-w-0 flex-col gap-3">
      {children}
    </div>
  </section>
)
