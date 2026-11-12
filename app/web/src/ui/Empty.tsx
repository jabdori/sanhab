import { Text } from '@astryxdesign/core/Text'
import { L } from '../labels'

/** 빈 자리: `없음`만. data-empty가 있어 영역(Region)이 이것만 담으면 한 줄로 접힌다(theme.css) */
export const Empty = () => (
  <p data-empty="">
    <Text color="secondary">{L.없음}</Text>
  </p>
)
