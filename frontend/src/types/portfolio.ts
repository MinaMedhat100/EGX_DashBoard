export type StatusKey = 'red' | 'orange_hot' | 'yellow' | 'green' | 'purple';

export interface Mtf {
  weekly_bias?: string | null;
  daily_bias?: string | null;
  bias_4h?: string | null;
  bias_1h?: string | null;
  bias_15m?: string | null;
  wd_aligned?: boolean;
  higher_tf_bullish?: boolean;
  alignment_status?: string | null;
  confidence?: string | null;
  net_score?: number | null;
  recommendation?: string | null;
}

export interface Alert {
  flags: string[];
  thndr_action: string | null;
  severity: string;
}

export interface AiAnalysis {
  ticker: string;
  recommendation: 'HOLD' | 'TRIM' | 'EXIT' | 'ADD' | 'WATCH' | string;
  conviction: number;
  thesis: string;
  key_risk?: string;
  suggested_stop?: number;
  suggested_t1?: number;
  suggested_t2?: number;
  action_line?: string;
  model?: string;
  analyzed_at?: string;
  vs_prior?: 'unchanged' | 'changed';
  change_reason?: string;
  catalyst?: string;
}

export interface Lot {
  id: 'A' | 'B';
  target: 'T1' | 'T2';
  shares: number;
  tp_price: number;
  stop: number;
  tp_hit: boolean;
  stopped: boolean;
  stop_raised: boolean;
  exit_price: number | null;
  exit_date: string | null;
}
export interface Brackets { entry_price: number; lots: Lot[]; }

export interface Position {
  ticker: string;
  avg_cost: number;
  live_price: number;
  shares: number;
  stop_loss: number;
  stop_raised: boolean;
  levels_source?: 'pending' | 'ai' | 'manual';
  t1_hit: boolean;
  t2_hit?: boolean;
  t1_fill_price?: number | null;
  t1_fill_date?: string | null;
  t2_fill_price?: number | null;
  t2_fill_date?: string | null;
  t1_price: number;
  t2_price: number;
  position_label: string;
  daily_chg: string | null;
  chg_pos: boolean | null;
  status_key: StatusKey;
  tv_signal: string;
  analysis_notes: string;
  add_zone: string;
  sell_plan: string;
  unrealized_pnl: number | null;
  unrealized_pct: number | null;
  is_liquid: boolean;
  adx: number | null;
  plus_di: number | null;
  minus_di: number | null;
  rsi: number | null;
  macd_histogram: number | null;
  ema20: number | null;
  ema50: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  alert: Alert | null;
  ai: AiAnalysis | null;
  mtf?: Mtf | null;
  indicators?: Record<string, unknown>;
  brackets?: Brackets | null;
}

export interface LevelProposal {
  stop: number | null;
  t1: number | null;
  t2: number | null;
}

export interface RefreshAiResult {
  ok: boolean;
  position: Position;
  applied: boolean;
  proposal?: LevelProposal;
  error?: string;
  live_error?: string | null;
}

export interface ActionLogEntry {
  id: string;
  date: string;
  type: string;
  ticker: string;
  shares: number | null;
  price: number | null;
  new_avg_cost: number | null;
  total_shares: number | null;
  fifo_cost: number | null;
  realized_pnl: number | null;
  notes: string;
}

export interface ExitedPosition {
  ticker: string;
  exit_date: string;
  exit_price: number | null;
  shares: number | null;
  avg_cost: number | null;
  realized_pnl: number | null;
  exit_type: string;
  approximate?: boolean;
}

export interface BookAi {
  posture?: string;
  concentration?: string;
  clusters?: string[];
  strongest?: { ticker: string; why: string };
  weakest?: { ticker: string; why: string };
  risk_note?: string;
  analyzed_at?: string;
  model?: string;
}

export interface PortfolioData {
  positions: Position[];
  book_ai?: BookAi | null;
  realized_pnl: number;
  last_refresh: string | null;
  deadline_positions: string[];
  deadline_date: string;
  action_log: ActionLogEntry[];
  exited_positions: ExitedPosition[];
}

export interface Opportunity {
  ticker: string;
  sector?: string;
  score?: number;
  tv_signal?: string;
  adx?: number;
  plus_di?: number;
  minus_di?: number;
  rsi?: number;
  macd?: string;
  entry_zone?: [number, number];
  stop?: number;
  t1?: number;
  t2?: number;
  t1_pct?: number;
  t2_pct?: number;
  rr?: number;
  thesis?: string;
  conviction?: number;
  weekly_bias?: string;
  wd_aligned?: boolean;
  mtf?: Mtf | null;
  passes_filter?: boolean;
  split?: [number, number];
  split_reason?: string;
}

export interface MarketOverview {
  direction: string;
  change_pct: number;
  sentiment: string;
  breadth: { advancing: number; declining: number; unchanged: number };
  top_sectors: { sector: string; strong_count: number; avg_score: number }[];
  top_gainers: { ticker: string; price: number; change_pct: number }[];
  top_losers: { ticker: string; price: number; change_pct: number }[];
  most_active: { ticker: string; price: number; change_pct: number }[];
  total_analyzed?: number;
}

export interface ScanParamsDto {
  min_adx: number;
  min_di_gap: number;
  rsi_min: number;
  rsi_max: number;
}

export interface ScanRunSummary {
  id: string;
  timestamp: string;
  params: ScanParamsDto;
  model: string;
  count: number;
  scanned: number;
  passed: number;
  ai_fallback: boolean;
  market_direction: string | null;
  mode?: 'market' | 'watchlist';
  watchlist_count?: number;
}

export interface ScanRun {
  id: string;
  timestamp: string;
  params: ScanParamsDto;
  model: string;
  opportunities: Opportunity[];
  market: MarketOverview | null;
  ai_fallback: boolean;
  scanned: number;
  passed: number;
  mode?: 'market' | 'watchlist';
  watchlist_tickers?: string[];
}

export interface NewsItem {
  headline: string;
  time: string | null;
  url: string | null;
  sentiment: string | null;
  source?: string;
}

export interface ScanResponse {
  ok: boolean;
  opportunities: Opportunity[];
  market: MarketOverview | null;
  ai_fallback: boolean;
  note: string | null;
  raw: { scanned: number; passed: number };
  model: string;
  mode?: 'market' | 'watchlist';
}

export interface IndexAi {
  index: string;
  regime: string;
  trend: string;
  thesis: string;
  key_support?: number;
  key_resistance?: number;
}

export interface IndexStats {
  avg_change?: number | null;
  advancing?: number | null;
  declining?: number | null;
  unchanged?: number | null;
  breadth?: number | null;
  sentiment?: string | null;
  total_constituents?: number | null;
}

export interface IndexSector { sector: string; stocks_count: number; avg_change: number; }
export interface IndexConstituent {
  symbol: string;
  sector?: string | null;
  change_pct?: number | null;
  rsi?: number | null;
  bb_signal?: string | null;
}

export interface IndexData {
  index: string;
  coin_symbol: string;
  level: number | null;
  change_pct: number | null;
  indicators: Record<string, number | string | null>;
  mtf?: Mtf | null;
  stats?: IndexStats;
  sectors?: IndexSector[];
  top_gainers?: IndexConstituent[];
  top_losers?: IndexConstituent[];
  ai?: IndexAi | null;
}

export interface IndexSnapshot {
  timestamp: string;
  model: string;
  overall: { regime: string; summary: string } | null;
  indices: IndexData[];
}

export interface GoldAi {
  recommendation: string;
  conviction?: number;
  thesis?: string;
  key_risk?: string;
  entry_zone?: [number, number];
  stop?: number; t1?: number; t2?: number; t1_pct?: number; t2_pct?: number; rr?: number;
  suggested_stop?: number; suggested_t1?: number; suggested_t2?: number; action_line?: string;
  net_of_fee?: string;
  weekly_bias?: string; wd_aligned?: boolean;
  vs_prior?: 'unchanged' | 'changed';
  change_reason?: string;
  catalyst?: string;
}

export interface GoldSnapshot {
  indicators: Record<string, number | string | null>;
  mtf?: Mtf | null;
  usd_egp: number | null;
  gc_usd: number | null;
  dxy?: { price: number; change_pct?: number } | null;
  us10y?: { price: number; change_pct?: number } | null;
  ai: GoldAi | null;
  model: string;
  timestamp: string;
}

export interface GoldPosition {
  avg_cost: number; live_price: number; shares: number;
  stop_loss: number; stop_raised: boolean;
  levels_source?: 'pending' | 'ai' | 'manual';
  t1_hit: boolean; t2_hit: boolean;
  t1_fill_price: number | null; t2_fill_price: number | null;
  t1_price: number; t2_price: number;
  position_label: string; status_key: StatusKey;
  unrealized_pnl: number | null; unrealized_pct: number | null;
  mtf?: Mtf | null;
  ai: GoldAi | null;
}

export interface GoldState {
  snapshot: GoldSnapshot | null;
  position: GoldPosition | null;
  realized_pnl_usd: number;
}
