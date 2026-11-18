import { handle, validateMessages } from '../netlify/functions/chat.js';
import assert from 'node:assert';
let p = 0, f = 0; const t = async (n, fn) => { try { await fn(); p++; console.log('PASS', n); } catch (e) { f++; console.log('FAIL', n, '-', e.message); } };
const post = (body, ip = '1.1.1.1') => new Request('http://x/.netlify/functions/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const U = c => ({ role: 'user', content: c });
const rawResponse = (raw, status = 200, headers = {}) => new Response(raw, { status, headers });

await t('GET reports Gemini web endpoint as configured without official key', async () => { const r = await handle(new Request('http://x/', { method: 'GET' })); const j = await r.json(); assert.equal(j.configured, true); assert.equal(j.officialApiKeyRequired, false); assert.equal(j.unofficial, true); });
await t('validation rejects empty / long / wrong roles', () => {
  assert.ok(validateMessages([])); assert.ok(validateMessages([U('x'.repeat(2001))])); assert.ok(validateMessages([{ role: 'assistant', content: 'a' }]));
  assert.ok(validateMessages([U('a'), U('b')])); assert.equal(validateMessages([U('a'), { role: 'assistant', content: 'b' }, U('c')]), null);
});
await t('bad JSON → 400', async () => { const r = await handle(post('{oops', '2.1.1.1')); assert.equal(r.status, 400); });
await t('success path bootstraps cookie and sends system prompt + chat to Gemini', async () => {
  const calls = [];
  const fetchMock = async (url, opts) => {
    calls.push({ url, opts });
    if (calls.length === 1) return rawResponse('ok', 200, { 'set-cookie': 'SID=abc; Path=/; Secure' });
    const answer = 'هذا جواب تجريبي مع مصدر https://quran.com/1';
    const nested = [null, null, null, null, [[null, [answer]]]];
    return rawResponse(')]}\'\n' + JSON.stringify([['wrb.fr', 'x', JSON.stringify(nested)]]));
  };
  const r = await handle(post({ messages: [U('ما معنى الفاتحة؟')] }, '2.2.2.2'), { fetch: fetchMock });
  const j = await r.json(); assert.equal(r.status, 200); assert.ok(j.reply.includes('هذا جواب تجريبي')); assert.equal(j.sources[0].url, 'https://quran.com/1');
  assert.ok(calls[0].url.includes('batchexecute')); assert.ok(calls[1].url.includes('StreamGenerate')); assert.ok(calls[1].opts.headers.cookie.includes('SID=abc'));
  const form = new URLSearchParams(calls[1].opts.body); const req = JSON.parse(form.get('f.req')); const prompt = JSON.parse(req[1])[0][0];
  assert.ok(prompt.includes('منهج أهل السنة والجماعة')); assert.ok(prompt.includes('لا تخترع آية'));
});
await t('upstream error gives a safe Arabic message', async () => {
  const fm = async () => rawResponse('failed', 503);
  const r = await handle(post({ messages: [U('سؤال')] }, '3.3.3.3'), { fetch: fm }); assert.equal(r.status, 502); assert.equal((await r.json()).error, 'upstream');
});
await t('network failure → 502 network', async () => { const r = await handle(post({ messages: [U('x')] }, '4.4.4.4'), { fetch: async () => { throw new Error('down'); } }); assert.equal((await r.json()).error, 'network'); });
await t('rate limit kicks in after 12 requests/min per IP', async () => { const fm = async (url) => url.includes('batchexecute') ? rawResponse('ok', 200, {'set-cookie':'SID=x; Path=/'}) : rawResponse('not parseable'); let last; for (let i=0;i<14;i++) last=await handle(post({messages:[U('x')]}, '9.9.9.9'), {fetch:fm}); assert.equal(last.status,429); });
console.log(`\n${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
