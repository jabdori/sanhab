import { Badge } from '@astryxdesign/core/Badge'

/** 상태 표지의 다섯 갈래 → astryx Badge의 변형(tokens.md). 색은 이 다섯뿐이고 항상 글자가 함께 있다 */
const tones = { wait: 'neutral', good: 'success', hold: 'warning', bad: 'error', again: 'purple' } as const

/** 상태 표지: 처리 상태(대기·승인·보류·반려·재심사 …)와 거절의 낱말 */
export const Pill = ({ tone, children }: { tone: keyof typeof tones; children: string }) => <Badge variant={tones[tone]} label={children} />
