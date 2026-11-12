// 버튼 등급(docs/design/components.md "버튼 등급"): 조치 묶음마다 주 버튼(primary)은 흐름을 앞으로 보내는 조치 하나다.
// 나머지 조치는 secondary. destructive는 기록을 지우는 시연 조작(초기화)에만 쓴다 — 반려·불인정·거부·기각은 사유와 함께 남는 결정이고 되돌리는 길(재상신·보완·이견·재접수)이 있어 secondary다.
// 보고의 채택·불채택은 예외로 둘 다 secondary(같은 무게, research-ux)
import { L } from '../labels'

const PRIMARY: string[] = [L.승인, L.추인, L.종결, L.요청, L.인정, L.발송, L.지급, L.회신, L.재상신, L.변경, L.접수]

/** 조치의 낱말 → 버튼 등급 */
export const grade = (kind: string): 'primary' | 'secondary' => (PRIMARY.includes(kind) ? 'primary' : 'secondary')
