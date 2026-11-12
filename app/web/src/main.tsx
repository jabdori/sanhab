import './theme.css' // 맨 먼저: CSS 층의 순서를 정한다(theme.css 첫 줄)
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { createRoot } from 'react-dom/client'
import { App } from './App'

// astryx 부품의 기본 문구(건너뛰기, 닫기, 필수 …)는 astryx가 낸 한국어 목록으로. 화면의 낱말은 labels.ts
createRoot(document.getElementById('root')!).render(
  <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }}>
    <Theme theme={neutralTheme} mode="light">
      <App />
    </Theme>
  </InternationalizationProvider>,
)
