// bridgeClient.js — HTTP client for the FastAPI MCP bridge (port 8001).
const BASE = process.env.MCP_BRIDGE_URL || 'http://127.0.0.1:8001';

async function call(pathname, { method = 'GET', body, timeoutMs = 120000 } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`bridge ${pathname} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export const bridge = {
  base: BASE,
  health: () => call('/health', { timeoutMs: 5000 }),
  mcpCheck: () => call('/mcp-check', { timeoutMs: 90000 }),
  refreshPrices: (tickers) =>
    call('/refresh-prices', { method: 'POST', body: { tickers }, timeoutMs: 180000 }),
  scan: (params) =>
    call('/scan-opportunities', { method: 'POST', body: params, timeoutMs: 300000 }),
  marketOverview: () => call('/market-overview', { timeoutMs: 120000 }),
  news: (ticker) => call(`/news/${encodeURIComponent(ticker)}`, { timeoutMs: 30000 }),
};
