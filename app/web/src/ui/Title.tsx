import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import type { ReactNode } from 'react'

/** 화면 제목: 대상 이름(Heading 1) + 덧붙는 값(귀속월, 번호 — 보조 색) + 상태 표지·덧표시(children). 한 줄이고 한 화면에 하나 */
export const Title = ({ name, sub, children }: { name: string; sub?: string; children?: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
    <Heading level={1}>{name}</Heading>
    {sub && (
      <Text type="large" color="secondary" weight="normal" hasTabularNumbers>
        {sub}
      </Text>
    )}
    {children}
  </div>
)
