import './theme.css' // 맨 먼저: CSS 층의 순서를 정한다(theme.css 첫 줄)
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js'
import { Theme } from '@astryxdesign/core/theme'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { L } from './labels'
import { sanhabTheme } from './theme'

// astryx 부품의 기본 문구(건너뛰기, 닫기, 필수 …)는 astryx가 낸 한국어 목록으로. 용어집과 다른 낱말은 overrides로 바꾼다(보내기 → 전송). 화면의 낱말은 labels.ts
createRoot(document.getElementById('root')!).render(
  <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }} overrides={{ 'ko-KR': { '@astryx.chatSendButton.send': L.전송 } }}>
    <Theme theme={sanhabTheme} mode="light">
      <App />
    </Theme>
  </InternationalizationProvider>,
)
