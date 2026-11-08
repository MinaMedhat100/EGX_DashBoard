// Neutral, made-up input that pins the v2.10.0 indices prompt (v2.11.0: "ESTHMR off" must equal it byte for byte).
const D = (name, value) => ({ name, tf: 'D', value });
const W = (name, value) => ({ name, tf: 'W', value });

export const FIXTURE_STRATEGY = 'STRATEGY FIXTURE: neutral text only.';

export const FIXTURE_INDICES = [
  {
    index: 'EGX30', level: 1000, change_pct: -0.5,
    indicators: { atr: 100, rsi: 45, ema20: 990, ema50: 1010, ema200: 950, adx: 20 },
    mtf: { daily: 'neutral', weekly: 'bullish' },
    levels: [D('Pivot R1', 1200), D('EMA50', 1100), W('EMA30', 900), D('BB lower', 940), D('Pivot S2', 700)],
    weekly_ok: true,
    stats: { advancing: 12, declining: 18, breadth: 40 },
    sectors: [{ name: 'Banks', change_pct: 0.5 }, { name: 'Real Estate', change_pct: -1 }],
  },
  {
    index: 'EGX70', level: 500, change_pct: 0.25,
    indicators: { atr: 20, rsi: 55 },
    mtf: { daily: 'bullish', weekly: 'neutral' },
    levels: [D('Pivot R1', 540), W('EMA20', 520), D('EMA20', 490), D('Pivot S1', 470)],
    weekly_ok: false,
    stats: { advancing: 40, declining: 30, breadth: 57 },
    sectors: [],
  },
];

export const FIXTURE_NEWS = {
  items: [
    { id: 'N1', headline: 'Fixture headline about the market', source: 'Fixture Wire', age: '1d', time: null, url: null },
    { id: 'N2', headline: 'Fixture headline about the pound', source: 'Fixture Daily', age: '3d', time: null, url: null },
  ],
  error: null,
};
