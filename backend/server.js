// server.js — Express API for the EGX dashboard (port 3001).
import express from 'express';
import cors from 'cors';

import portfolioRoutes from './routes/portfolio.js';
import refreshRoutes from './routes/refresh.js';
import scanRoutes from './routes/scan.js';
import marketRoutes from './routes/market.js';
import newsRoutes from './routes/news.js';
import ordersRoutes from './routes/orders.js';
import { bridge } from './services/bridgeClient.js';
import { DEFAULT_MODEL } from './services/analystService.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (_req, res) => {
  let bridgeOk = false;
  try { await bridge.health(); bridgeOk = true; } catch { /* bridge down */ }
  res.json({
    ok: true,
    service: 'egx-backend',
    bridge: bridgeOk,
    bridge_url: bridge.base,
    analysis_model: DEFAULT_MODEL,
  });
});

app.use('/api', portfolioRoutes);
app.use('/api', refreshRoutes);
app.use('/api', scanRoutes);
app.use('/api', marketRoutes);
app.use('/api', newsRoutes);
app.use('/api', ordersRoutes);

// central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api error]', err.message);
  res.status(err.status || 500).json({ ok: false, error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`EGX backend listening on http://localhost:${PORT}`);
  console.log(`  bridge: ${bridge.base}  |  analysis model: ${DEFAULT_MODEL}`);
});
