const tones = {
  wait: 'bg-wait-bg text-wait',
  good: 'bg-good-bg text-good',
  hold: 'bg-hold-bg text-hold',
  bad: 'bg-bad-bg text-bad',
  again: 'bg-again-bg text-again',
}

/** 상태 표지(알약). 색은 다섯 가지뿐이고 항상 글자가 함께 있다 */
export const Pill = ({ tone, children }: { tone: keyof typeof tones; children: string }) => (
  <span className={`inline-flex items-center rounded-pill px-2 text-label ${tones[tone]}`}>{children}</span>
)
