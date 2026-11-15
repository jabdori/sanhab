// SanHab 테마: neutral(흰 면 · 회색 글자)을 그대로 물려받고 강조색 하나만 남색으로(유저 결정 2026-11-15, service-plan U9 "누를 수 있는 것은 남색").
// neutral의 강조색은 검정(#1b1b1b)이라 링크 · 진행 막대 · 진행 중 점 · AI 표지 · 주 버튼이 모두 무채색이 되어 와이어프레임처럼 보였다.
// 값은 neutral 테마가 함께 내는 팔레트의 blue 계열에서 고른다(직접 색 값을 지어내지 않는다). [밝은 모드, 어두운 모드]
import { defineTheme } from '@astryxdesign/core/theme'
import { neutralPalettes, neutralTheme } from '@astryxdesign/theme-neutral'

const { blue } = neutralPalettes

export const sanhabTheme = defineTheme({
  name: 'sanhab',
  extends: neutralTheme,
  tokens: {
    '--color-accent': [blue.light[25], blue.dark[75]],
    '--color-accent-muted': [blue.light[90], blue.dark[30]],
    '--color-text-accent': [blue.light[25], blue.dark[75]],
    '--color-icon-accent': [blue.light[25], blue.dark[75]],
    '--color-on-accent': [blue.light[100], blue.dark[5]],
  },
})
