import * as ai from 'ai';
const { DefaultChatTransport, readUIMessageStream } = ai;
const t0 = Date.now();
const transport = new DefaultChatTransport({ api: 'http://localhost:3998/api/chat' });
const stream = await transport.sendMessages({
  chatId: 'c1', trigger: 'submit-message', messageId: undefined, abortSignal: undefined,
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: '성일상사24의 2026-06 심사는 누가 승인해야 해?' }] }],
});
let last, updates = 0, firstText;
for await (const m of readUIMessageStream({ stream })) {
  last = m; updates++;
  if (!firstText && m.parts.some(p => p.type === 'text' && p.text)) firstText = Date.now() - t0;
}
console.log('갱신 횟수', updates, '| 첫 글자', firstText, 'ms | 전체', Date.now() - t0, 'ms');
for (const p of last.parts) console.log(p.type, '|', p.state ?? '', '|', JSON.stringify(p.input ?? p.text ?? '').slice(0, 120), p.output ? '| output ' + JSON.stringify(p.output).slice(0, 80) : '');
