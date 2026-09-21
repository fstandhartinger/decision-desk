import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const gateway = (process.env.JEV_GATEWAY_URL || 'https://jev-router.app.mintapis.com').replace(/\/$/, '');
const gatewayKey = process.env.JEV_GATEWAY_API_KEY || '';
const dailyCap = Number(process.env.DAILY_SPEND_CAP_USD || 2);
const perMinute = Number(process.env.RATE_LIMIT_PER_MINUTE || 8);
const maxBody = 12_000;
const buckets = new Map();
let spend = { day: new Date().toISOString().slice(0, 10), usd: 0, decisions: 0 };

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function ipOf(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function allow(ip) {
  const now = Date.now(); const old = buckets.get(ip) || [];
  const fresh = old.filter(t => now - t < 60_000);
  if (fresh.length >= perMinute) return false;
  fresh.push(now); buckets.set(ip, fresh); return true;
}
function resetDay() {
  const day = new Date().toISOString().slice(0, 10);
  if (spend.day !== day) spend = { day, usd: 0, decisions: 0 };
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > maxBody) throw new Error('too_large'); }
  return JSON.parse(raw || '{}');
}
function requestFor(ticket, model) {
  return {
    model,
    state: { subject: ticket.subject, message: ticket.message, customer_tier: ticket.tier },
    questions: {
      route: { type: 'choice', instructions: 'Route this customer support ticket to exactly one queue.', criteria: { billing: 'Payments, charges, invoices, or refunds', technical: 'Product bugs, outages, or setup problems', account: 'Login, access, identity, or subscription changes', feedback: 'Feature requests or general feedback' } },
      priority: { type: 'choice', instructions: 'Choose the operational urgency.', criteria: { urgent: 'Active outage, security concern, safety issue, or continuing financial harm', normal: 'Needs a timely agent response but harm is not continuing', low: 'Non-urgent feedback or informational request' } },
      risk: { type: 'choice', instructions: 'Flag the main handling risk.', criteria: { none: 'No special handling risk', privacy: 'Personal or sensitive data concern', money: 'Payment, refund, or financial impact', churn: 'Customer signals cancellation or severe dissatisfaction' } },
      next_action: { type: 'choice', instructions: 'Choose the best immediate next action.', criteria: { agent_reply: 'Send to a human agent to reply', request_details: 'Ask the customer for missing diagnostic details', verify_account: 'Verify identity or account ownership first', auto_acknowledge: 'Acknowledge automatically and place in a normal queue' } }
    }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return json(res, 200, { ok: true });
    if (req.url === '/api/models' && req.method === 'GET') {
      const upstream = await fetch(`${gateway}/models`, { signal: AbortSignal.timeout(5000) });
      return json(res, upstream.status, await upstream.json());
    }
    if (req.url === '/api/status' && req.method === 'GET') { resetDay(); return json(res, 200, { ...spend, daily_cap_usd: dailyCap }); }
    if (req.url === '/api/decide' && req.method === 'POST') {
      if (!allow(ipOf(req))) return json(res, 429, { error: 'rate_limit', message: `Please wait. This public demo allows ${perMinute} decisions per minute.` }, { 'retry-after': '60' });
      resetDay();
      if (spend.usd >= dailyCap) return json(res, 503, { error: 'daily_cap', message: 'The public demo reached its daily $2 model budget. Try again tomorrow or run it locally.' });
      const input = await body(req);
      const subject = String(input.subject || '').trim().slice(0, 180);
      const message = String(input.message || '').trim().slice(0, 3000);
      const tier = ['free','pro','enterprise'].includes(input.tier) ? input.tier : 'free';
      const model = ['classifier-fast','djev','semif-qwen3.5-4b'].includes(input.model) ? input.model : 'classifier-fast';
      if (!subject || message.length < 10) return json(res, 400, { error: 'invalid_input', message: 'Add a subject and at least 10 characters of ticket text.' });
      const started = performance.now();
      const headers = { 'content-type': 'application/json', ...(gatewayKey ? { authorization: `Bearer ${gatewayKey}` } : {}) };
      const upstream = await fetch(`${gateway}/v1/systemone`, { method: 'POST', headers, body: JSON.stringify(requestFor({ subject, message, tier }, model)), signal: AbortSignal.timeout(20_000) });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return json(res, upstream.status === 429 ? 429 : 502, { error: 'gateway_error', message: data?.attempts?.[0]?.error || data?.error || 'The selected model is temporarily unavailable.' });
      const cost = Number(upstream.headers.get('x-jev-cost-usd') || data?.usage?.estimated_cost_usd || 0);
      spend.usd += Number.isFinite(cost) ? cost : 0; spend.decisions += 1;
      return json(res, 200, { answers: data.answers, meta: { requested_model: model, model: upstream.headers.get('x-jev-model') || data.model || model, provider: upstream.headers.get('x-jev-provider') || 'unknown', model_latency_ms: Number(upstream.headers.get('x-jev-latency-ms') || 0), round_trip_ms: Math.round(performance.now() - started), cost_usd: cost, daily_spend_usd: spend.usd, daily_cap_usd: dailyCap } });
    }
    if (req.method === 'GET') {
      const rel = req.url === '/' ? 'public/index.html' : `public/${req.url.replace(/^\//, '').split('?')[0]}`;
      if (!/^public\/[\w./-]+$/.test(rel) || rel.includes('..')) return json(res, 404, { error: 'not_found' });
      const ext = path.extname(rel); const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml' };
      const file = await readFile(path.join(root, rel)); res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' }); return res.end(file);
    }
    json(res, 404, { error: 'not_found' });
  } catch (error) {
    if (error.message === 'too_large') return json(res, 413, { error: 'too_large' });
    json(res, 500, { error: 'server_error', message: 'Something went wrong. Your ticket was not stored.' });
  }
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '0.0.0.0', () => console.log(`Decision Desk on :${port}`));
}
export { requestFor };
