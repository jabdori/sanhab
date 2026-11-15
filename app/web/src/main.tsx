import './theme.css' // 맨 먼저: CSS 층의 순서를 정한다(theme.css 첫 줄)
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import koKR from '@astryxdesign/core/locales/ko-KR.generated.js'
import { Theme } from '@astryxdesign/core/theme'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { L } from './labels'
// 테마: astryx가 배포하는 neutral을 덮어쓰지 않고 쓴다(본보기 템플릿과 같은 흰 면 · 검정 글자 — docs/design/tokens.md). 글꼴만 theme.css에서 Pretendard
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

// astryx 부품의 기본 문구(건너뛰기, 닫기, 필수 …)는 astryx가 낸 한국어 목록으로. 용어집과 다른 낱말은 overrides로 바꾼다(보내기 → 전송, 기록 머리의 n/전체 — 「37 페이지 중 2 페이지」 대신 2/37). 화면의 낱말은 labels.ts
createRoot(document.getElementById('root')!).render(
  <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': koKR }} overrides={{ 'ko-KR': { '@astryx.chatSendButton.send': L.전송, '@astryx.inputClearButton.tooltip': L.지움, '@astryx.selector.emptySearchResults': L.없음, '@astryx.selector.clearLabel': `{label} ${L.지움}`, '@astryx.pagination.pageOfTotal': '{current, number}/{total, number}' } }}>
    <Theme theme={neutralTheme} mode="light">
      <App />
    </Theme>
  </InternationalizationProvider>,
)
