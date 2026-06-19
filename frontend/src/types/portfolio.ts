export type StatusKey = 'red' | 'orange_hot' | 'yellow' | 'green' | 'purple';

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
}

export interface Position {
  ticker: string;
  avg_cost: number;
  live_price: number;
  shares: number;
  stop_loss: number;
  stop_raised: boolean;
  t1_hit: boolean;
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
  indicators?: Record<string, number | string | null>;
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

export interface PortfolioData {
  positions: Position[];
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

export interface NewsItem {
  headline: string;
  time: string | null;
  url: string | null;
  sentiment: string | null;
  source?: string;
}
