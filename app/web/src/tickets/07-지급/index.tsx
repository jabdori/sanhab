// 07 지급: 지급 상세(가운데: 제목·숫자 줄 / 오른쪽: 조치, 이력).
// 제목·숫자 줄은 머리(slot 'head')이고, 뒤 티켓이 kind: L.지급으로 끼우는 가운데 조각은 order를 적지 않는다(08의 대사).
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { useSetAtom } from 'jotai'
import { L } from '../../labels'
import type { Piece } from '../../pieces'
import { api, changedAtom, store, targetAtom } from '../../state'
import { Confirm } from '../../ui/Confirm'
import { Empty } from '../../ui/Empty'
import { Figures } from '../../ui/Figures'
import { grade } from '../../ui/grade'
import { Line as Row } from '../../ui/Line'
import { Pill } from '../../ui/Pill'
import { Source } from '../../ui/Source'
import { num } from '../../ui/Table'
import { Title } from '../../ui/Title'
import { usePay } from './pay'

// 지급의 상태(대기·재심사·이체·완료)와 그 색. 이체는 지급으로 표시했고 은행의 회신을 기다리는 것(D54). 원본의 값(승인·미지급·반려)은 여기에 없다
const tones = { [L.대기]: 'wait', [L.재심사]: 'again', [L.이체]: 'wait', [L.완료]: 'good' } as const
type State = keyof typeof tones
const pill = (state: string) => <Pill tone={tones[state as State] ?? 'wait'}>{state}</Pill>

/** 머리(가운데 위에 고정): 대리점 · 귀속월 · 상태 / 금액, 계좌, 이 지급을 승인한 심사(누르면 그 심사가 열린다). 값은 원본이라 표지 없이 행 번호만 */
function Head() {
  const p = usePay()
  const setTarget = useSetAtom(targetAtom)
  if (!p) return null
  const { pay } = p
  const cell = 'flex items-baseline gap-2'
  return (
    <>
      <Title name={pay.name} sub={pay.ym}>
        {pill(pay.state)}
      </Title>
      <Figures
        items={[
          [
            L.금액,
            <span className={cell}>
              {num(pay.amount)}
              <Source kind={pay.source} file={pay.file} row={pay.row} />
            </span>,
          ],
          [
            L.계좌,
            p.accounts.length ? (
              <span className={cell}>
                {p.accounts.map((a) => (
                  <span key={a.value} className={cell}>
                    {a.value}
                    <Source kind={a.source} file={a.file} row={a.row} />
                  </span>
                ))}
              </span>
            ) : (
              <Empty />
            ),
          ],
          [L.심사, <Link type="inherit" onClick={() => setTarget({ kind: L.심사, id: pay.review.id })}>{pay.review.name}</Link>],
        ]}
      />
    </>
  )
}

/** 지급 표시 한 줄: 지급(굵게) · 사람 · 날짜 */
const Line = ({ h }: { h: { role: string; at: string } }) => <Row kind={L.지급} parts={[h.role, h.at]} />

/** 조치: 지급으로 표시할 수 있으면 버튼(주 버튼, 되돌릴 수 없으므로 확인 창을 거친다). 아니면 남긴 지급 표시, 대기인데 담당이 아닌 역할에게는 누구 차례인지, 재심사이면 없음.
 *  거절되어도 화면을 다시 읽어 지금 할 수 있는 조치를 보인다 */
function Action() {
  const p = usePay()
  if (!p) return null
  if (!p.can) {
    // 회신이 실패해 대기로 돌아온 지급(08)은 지급 표시가 남아 있어도 다시 지급할 차례다
    if (p.history.length && (p.pay.state === L.이체 || p.pay.state === L.완료)) return <Line h={p.history[p.history.length - 1]} />
    if (p.pay.state !== L.대기) return <Empty />
    return (
      <div className="flex items-baseline gap-2">
        <Text type="supporting">{L.담당}</Text>
        <Text weight="semibold">{p.role}</Text>
      </div>
    )
  }
  return (
    <div>
      <Confirm
        label={L.지급}
        variant={grade(L.지급)}
        title={`${L.지급} ${p.pay.name}`}
        rows={[
          [L.금액, num(p.pay.amount)],
          [L.계좌, p.accounts.map((a) => a.value).join(' · ') || L.없음],
          [L.귀속월, p.pay.ym],
        ]}
        onConfirm={() => api('/pay', { id: p.pay.id }).catch(() => store.set(changedAtom, (n) => n + 1))}
      />
    </div>
  )
}

export default [
  { slot: 'head', kind: L.지급, View: Head },
  { slot: 'action', kind: L.지급, View: Action },
  // 이력은 08(대사)의 조각이 지급 표시와 회신을 일어난 순서대로 함께 보인다
] satisfies Piece[]
