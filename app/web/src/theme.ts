// 앱의 astryx 테마: stone을 이어받고(neutral · stone · matcha를 같은 화면에 견줘 골랐다 — stone은 바탕(body)·muted·테두리가 neutral보다 진해 카드와 묶음 머리의 경계가 보이고, matcha는 글자·모서리가 커서 업무 콘솔의 밀도에 맞지 않았다)(astryx docs author-a-theme의 extends) 우리가 바꾸는 것만 적는다(docs/design/tokens.md "테마").
// - secondary 버튼: 옅은 회색 채움 대신 흰 바탕 + 테두리. 회색 판단 칸 위에서도 "누를 수 있음"이 보이고, 비활성(반투명)과 갈린다
// - 토글 버튼(경위의 그림): secondary와 같은 꼴. 눌린 상태는 astryx의 것 그대로
// - Link(이동): 본문 색 · 중간 굵기 · 옅은 밑줄로 모든 화면이 같다
import { defineTheme } from '@astryxdesign/core/theme'
import { stoneTheme } from '@astryxdesign/theme-stone'

const outlined = {
  backgroundColor: 'var(--color-background-surface)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--color-border-emphasized)',
}

export const sanhabTheme = defineTheme({
  name: 'sanhab',
  extends: stoneTheme,
  components: {
    button: {
      'variant:secondary': outlined,
      // destructive(초기화뿐): 옅은 분홍은 비활성처럼 보여 진한 적색 채움으로
      'variant:destructive': { backgroundColor: 'var(--color-error)', color: 'var(--color-on-error)' },
    },
    'toggle-button': { base: outlined },
    // 이동(다른 대상을 여는 Link): 어느 화면에서나 같은 꼴 — 본문 색, 중간 굵기, 옅은 밑줄(머물면 진하게)
    link: {
      base: { fontWeight: 'var(--font-weight-medium)', textDecorationLine: 'underline', textDecorationColor: 'var(--color-border-emphasized)', textUnderlineOffset: '3px' },
    },
  },
})
