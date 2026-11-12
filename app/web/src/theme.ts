// 앱의 astryx 테마: neutral을 이어받고(astryx docs author-a-theme의 extends) 우리가 바꾸는 것만 적는다(docs/design/tokens.md "테마").
// - secondary 버튼: 옅은 회색 채움 대신 흰 바탕 + 테두리. 회색 판단 칸 위에서도 "누를 수 있음"이 보이고, 비활성(반투명)과 갈린다
// - 토글 버튼(경위의 그림): secondary와 같은 꼴. 눌린 상태는 astryx의 것 그대로
import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

const outlined = {
  backgroundColor: 'var(--color-background-surface)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--color-border-emphasized)',
}

export const sanhabTheme = defineTheme({
  name: 'sanhab',
  extends: neutralTheme,
  components: {
    button: {
      'variant:secondary': outlined,
    },
    'toggle-button': { base: outlined },
  },
})
