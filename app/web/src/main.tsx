import './theme.css' // 맨 먼저: CSS 층의 순서를 정한다(theme.css 첫 줄)
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <Theme theme={neutralTheme} mode="light">
    <App />
  </Theme>,
)
