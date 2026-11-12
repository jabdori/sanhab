import { createRoot } from 'react-dom/client'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import Detail from './detail-page/page'
import Incident from './incident-console/page'
import Chat from './ai-chat/page'
import './tpl.css'
const P: Record<string, () => JSX.Element> = { detail: Detail, incident: Incident, chat: Chat }
const C = P[new URLSearchParams(location.search).get('t') ?? 'detail']
createRoot(document.getElementById('root')!).render(<Theme theme={neutralTheme} mode="light"><C /></Theme>)
