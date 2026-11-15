# 장면 3 · 4의 준비(녹화 밖): 초기화 → 내부 감시가 동명 · 박준호 기각 → 영업지원이 한라인상사34 6월 전결 → (인자 change면) 주소 변경까지. 단계마다 결과를 확인하고, 틀리면 멈춘다.
die(){ echo "✗ 준비 실패: $1" >&2; exit 9; }
reset_demo
role_quiet "내부 감시"; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref 'row "동명 · 박준호') >/dev/null; sleep 3
A click @$(ref 'button "기각"') >/dev/null; sleep 1; A click @$(ref 'combobox "분류"') >/dev/null; sleep .6; A click @$(ref 'option "부족"') >/dev/null; sleep .3
A fill @$(ref 'textbox "메모"') "대표자 이름만 같고 주소 · 계좌가 달라 근거 부족" >/dev/null; sleep .3; A click @$(last 'button "기각"') >/dev/null; sleep 2.5
[ -z "$(ref 'button "기각"')" ] || die "동명 정황 기각"
role_quiet 영업지원; A click @$(ref 'button "작업"') >/dev/null; sleep 2; A click @$(ref 'radio "전체"') >/dev/null; A fill @$(ref 'searchbox "검색"') "한라인상사34" >/dev/null; sleep 1.5
A click @$(ref 'row "선택한라인상사34') >/dev/null; sleep 3; A click @$(ref 'button "승인"') >/dev/null; sleep 1; A click @$(last 'button "승인"') >/dev/null; sleep 2.5
[ -z "$(ref 'button "보류"')" ] || die "한라인상사34 6월 전결"
if [ "${1:-}" = change ]; then
  A click @$(ref 'button "대리점"') >/dev/null; sleep 2; A fill @$(ref 'searchbox "검색"') "한라인상사34" >/dev/null; sleep 1.5; A click @$(ref 'row "한라인상사34') >/dev/null; sleep 3
  A click @$(ref 'button "변경"') >/dev/null; sleep 1; A click @$(ref 'combobox "변경일"') >/dev/null; A keyboard type "2026-02-01" >/dev/null; sleep .2; A press Escape >/dev/null
  A fill @$(ref 'textbox "값"') "고양시 중앙로 128" >/dev/null; A click @$(last 'button "변경"') >/dev/null; sleep 4
  [ "$(A eval '(t=>t.includes("고양시 중앙로 128")&&t.includes("재심사"))(document.querySelector("main,#astryx-app-shell-main").innerText)')" = true ] || die "주소 변경"   # 그룹은 이제 이름 토큰 줄이라 바뀐 주소와 6월 재심사로 확인
fi
echo "준비 확인 통과"
