/* OAA agent runner (Cloudflare Worker): delivers jobs of the OAA agents in the on-chain OAA Agent Registry.
 *
 *   1. A client hires an OAA agent on oaap.si/registry (the payment waits in the registry contract).
 *   2. The registry page sends the job input here (POST /request). The runner checks that the input matches
 *      the fingerprint stored on-chain and that the job belongs to an agent this runner operates.
 *   3. Every minute (cron) the runner runs the agent through the Sia worker and delivers the result on-chain
 *      with deliver(jobId, resultHash, resultUri). Only then the registry pays out (80/20 or 100% treasury).
 *   4. Anyone can read the result at GET /result/<jobId>.
 *
 * Settings (Settings -> Variables and Secrets):
 *   AGENT_KEY   Secret  private key of the agent wallet (only this worker can sign deliveries)
 *   REGISTRY    Text    OAA Agent Registry address on Base
 *   AGENT_MAP   Text    JSON: registry agent id -> Sia agent id and input name, e.g. {"1":{"id":"sentinel","param":"token"}}
 *   RPC         Text    optional, Base RPC (default https://mainnet.base.org)
 * Bindings: KV namespace RUNNER_KV, Service binding SIA -> worker "sia". Cron trigger: every minute.
 */
import { Wallet, JsonRpcProvider, Contract, keccak256, toUtf8Bytes, id as hashText } from 'ethers';

const ABI = [
  'function getJob(uint256) view returns (tuple(uint64 agentId,address client,bool usdcPaid,uint8 status,uint32 units,uint64 dueAt,uint128 amount,bytes32 request,bytes32 result))',
  'function getAgent(uint256) view returns (tuple(address owner,address operator,address payout,uint96 priceEth,uint96 priceUsdc,uint32 deadline,bool active,bool verified,bool suspended,bool official,uint64 jobsDone,uint128 earnedEth,uint128 earnedUsdc,string name,string uri))',
  'function deliver(uint256 jobId, bytes32 result, string resultUri)'
];
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?oaap\.si$/i, /^http:\/\/localhost(:\d+)?$/];
const OPEN = 1;

function cors(origin) {
  const ok = origin && ORIGINS.some(r => r.test(origin));
  return { 'Access-Control-Allow-Origin': ok ? origin : 'https://oaap.si', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' };
}
const json = (o, s, origin) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, cors(origin)) });
const map = env => { try { return JSON.parse(env.AGENT_MAP || '{}'); } catch { return {}; } };
const chain = env => {
  const p = new JsonRpcProvider(env.RPC || 'https://mainnet.base.org', 8453, { staticNetwork: true });
  const w = new Wallet(env.AGENT_KEY, p);
  return { p, w, reg: new Contract(env.REGISTRY, ABI, w) };
};

async function request(req, env, origin) {
  let b; try { b = await req.json(); } catch { return json({ error: 'bad_json' }, 400, origin); }
  const jobId = Number(b && b.jobId), input = String((b && b.input) || '').trim();
  if (!(jobId > 0) || !input || input.length > 400) return json({ error: 'bad_input' }, 400, origin);
  const { w, reg } = chain(env);
  const j = await reg.getJob(jobId).catch(() => null);
  if (!j) return json({ error: 'no_job' }, 404, origin);
  if (Number(j.status) !== OPEN) return json({ error: 'job_closed' }, 409, origin);
  if (hashText(input) !== j.request) return json({ error: 'input_mismatch', detail: 'The text does not match the fingerprint of this job.' }, 400, origin);
  const a = await reg.getAgent(j.agentId);
  if (a.operator.toLowerCase() !== w.address.toLowerCase()) return json({ error: 'not_ours' }, 400, origin);
  if (!map(env)[String(j.agentId)]) return json({ error: 'agent_not_mapped' }, 400, origin);
  await env.RUNNER_KV.put('runner:req:' + jobId, JSON.stringify({ input, agentId: Number(j.agentId), at: Date.now() }), { expirationTtl: 8 * 86400 });
  const q = JSON.parse((await env.RUNNER_KV.get('runner:queue')) || '[]'); if (!q.includes(jobId)) q.push(jobId);
  await env.RUNNER_KV.put('runner:queue', JSON.stringify(q.slice(-200)));
  return json({ ok: true, jobId, status: 'queued' }, 200, origin);
}

async function runOne(env, ctx, jobId) {
  const raw = await env.RUNNER_KV.get('runner:req:' + jobId); if (!raw) return 'no_input';
  const r = JSON.parse(raw), m = map(env)[String(r.agentId)]; if (!m) return 'not_mapped';
  const { reg } = ctx;
  const j = await reg.getJob(jobId);
  if (Number(j.status) !== OPEN) return 'closed';
  if (Date.now() / 1000 > Number(j.dueAt) - 30) return 'too_late';
  const qs = new URLSearchParams(); qs.set(m.param, r.input); if (m.extra) for (const k in m.extra) qs.set(k, m.extra[k]);
  const res = await env.SIA.fetch('https://sia.internal/internal/run/' + m.id + '?' + qs.toString());
  const out = await res.json().catch(() => ({ error: 'bad_reply' }));
  if (!res.ok || out.error) { r.tries = (r.tries || 0) + 1; await env.RUNNER_KV.put('runner:req:' + jobId, JSON.stringify(r), { expirationTtl: 8 * 86400 }); return 'agent_error:' + (out.error || res.status); }
  const doc = JSON.stringify({ jobId, agentId: r.agentId, agent: m.id, input: r.input, result: out, at: new Date().toISOString() });
  const hash = keccak256(toUtf8Bytes(doc));
  await env.RUNNER_KV.put('runner:res:' + jobId, doc);
  const tx = await reg.deliver(jobId, hash, (env.PUBLIC_URL || 'https://oaa-agent-runner.oaaprotocol.workers.dev') + '/result/' + jobId);
  await tx.wait(1);
  return 'delivered';
}

async function tick(env) {
  if (!env.AGENT_KEY || !env.REGISTRY) return;
  const q = JSON.parse((await env.RUNNER_KV.get('runner:queue')) || '[]'); if (!q.length) return;
  const ctx = chain(env), keep = [];
  for (const jobId of q.slice(0, 8)) {
    let s; try { s = await runOne(env, ctx, jobId); } catch (e) { s = 'error'; }
    const r = JSON.parse((await env.RUNNER_KV.get('runner:req:' + jobId)) || '{}');
    if (!(s === 'delivered' || s === 'closed' || s === 'too_late' || s === 'no_input' || s === 'not_mapped' || (r.tries || 0) >= 5)) keep.push(jobId);
    await env.RUNNER_KV.put('runner:log:' + jobId, s, { expirationTtl: 8 * 86400 });
  }
  await env.RUNNER_KV.put('runner:queue', JSON.stringify(keep.concat(q.slice(8))));
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/request' && req.method === 'POST') return request(req, env, origin);
    const m = url.pathname.match(/^\/result\/(\d+)$/);
    if (m) {
      const doc = await env.RUNNER_KV.get('runner:res:' + m[1]);
      if (doc) return new Response(doc, { headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }, cors(origin)) });
      const log = await env.RUNNER_KV.get('runner:log:' + m[1]);
      return json({ status: (await env.RUNNER_KV.get('runner:req:' + m[1])) ? 'working' : 'unknown', last: log || null }, 202, origin);
    }
    if (url.pathname === '/agents') return json({ agents: map(env) }, 200, origin);
    if (url.pathname === '/run' && req.method === 'POST') { ctx.waitUntil(tick(env)); return json({ ok: true }, 200, origin); }
    let wallet = null; try { wallet = env.AGENT_KEY ? new Wallet(env.AGENT_KEY).address : null; } catch {}
    return json({ name: 'OAA agent runner', wallet, registry: env.REGISTRY || null }, 200, origin);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env)); }
};
