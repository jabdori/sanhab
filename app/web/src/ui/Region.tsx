import { Heading } from '@astryxdesign/core/Heading'
import { Section } from '@astryxdesign/core/Section'
import type { ReactNode } from 'react'

/**
 * 영역(astryx detail-page 템플릿의 Section 그대로): 제목 줄(Heading 2 + 붙는 것 `aside` — 출처 표지·상태 / 오른쪽에 영역 조치 `actions`) 아래 몸통.
 * 몸통이 `없음`뿐이면 제목과 없음이 한 줄로 접힌다(theme.css의 [data-region])
 */
export const Region = ({ title, aside, actions, children }: { title: string; aside?: ReactNode; actions?: ReactNode; children: ReactNode }) => (
  <Section>
    <div data-region="" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <Heading level={2}>{title}</Heading>
          {aside}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <div data-region-body="" className="flex min-w-0 flex-col gap-3">
        {children}
      </div>
    </div>
  </Section>
)
