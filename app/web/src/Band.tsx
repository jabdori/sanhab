import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Select } from '@base-ui/react/select'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useState } from 'react'
import { APP, L } from './labels'
import { api, roleAtom, rolesAtom, targetAtom, useData } from './state'
import { button, floating, label } from './ui/styles'

/** 띠: 앱 이름, 역할, 날짜, 초기화. 항상 보인다 */
export function Band() {
  const roles = useAtomValue(rolesAtom)
  const [role, setRole] = useAtom(roleAtom)
  const setTarget = useSetAtom(targetAtom)
  const state = useData<{ today: string }>('/state')
  return (
    <header className="flex h-band shrink-0 items-center gap-6 border-b border-line bg-surface px-4">
      <span className="text-title">{APP}</span>
      <div className="flex items-center gap-2">
        <span className={label}>{L.역할}</span>
        <Select.Root
          value={role}
          onValueChange={(v) => {
            setRole(v)
            setTarget(null)
          }}
        >
          <Select.Trigger aria-label={L.역할} className="flex cursor-pointer items-center gap-1 text-body text-action hover:text-action-hover">
            <Select.Value />
            <Select.Icon>▾</Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner sideOffset={4} alignItemWithTrigger={false} className="z-10 outline-none">
              <Select.Popup className={`${floating} py-1`}>
                {roles.map((r) => (
                  <Select.Item
                    key={r.role}
                    value={r.role}
                    className="flex h-head cursor-pointer items-center px-3 text-body outline-none data-highlighted:bg-surface data-selected:text-figure"
                  >
                    <Select.ItemText>{r.role}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>
      <div className="flex items-center gap-2">
        <span className={label}>{L.날짜}</span>
        <span className="text-body tabular-nums">{state?.today}</span>
        <Advance />
      </div>
      <div className="flex-1" />
      <AlertDialog.Root>
        <AlertDialog.Trigger className={button}>{L.초기화}</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
            <AlertDialog.Title className="text-title">{L.초기화}</AlertDialog.Title>
            <div className="flex justify-end gap-2">
              <AlertDialog.Close className={button}>{L.취소}</AlertDialog.Close>
              <AlertDialog.Close className={button} onClick={() => api('/reset', {}).then(() => setTarget(null))}>
                {L.초기화}
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </header>
  )
}

/** 날짜 넘기기(모의): 날수를 받아 앞으로만 넘긴다. 확인을 거치고 끝날 때까지 다시 눌리지 않는다 */
function Advance() {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState('15')
  const [busy, setBusy] = useState(false)
  const n = Number(days)
  const ok = Number.isInteger(n) && n >= 1 && n <= 365
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialog.Trigger className={button}>{L.넘기기}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Popup className={`${floating} fixed top-1/2 left-1/2 flex w-list -translate-x-1/2 -translate-y-1/2 flex-col gap-4 p-6`}>
          <AlertDialog.Title className="text-title">{L.날짜}</AlertDialog.Title>
          <label className="flex items-center gap-2 text-body">
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              disabled={busy}
              aria-label={L.일}
              onChange={(e) => setDays(e.target.value)}
              className="h-head w-24 rounded-box border border-line bg-bg px-3 text-body tabular-nums"
            />
            <span>{L.일}</span>
          </label>
          <div className="flex justify-end gap-2">
            <AlertDialog.Close disabled={busy} className={button}>
              {L.취소}
            </AlertDialog.Close>
            <button
              className={button}
              disabled={!ok || busy}
              onClick={() => {
                setBusy(true)
                api('/advance', { days: n }).then(
                  () => {
                    setBusy(false)
                    setOpen(false)
                  },
                  () => setBusy(false),
                )
              }}
            >
              {L.넘기기}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
