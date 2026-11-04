export type DateRange = 'today' | 'yesterday' | 'custom';
export type CustomRange = { label: string; days: number };

/** The Home dashboard's numbers for a date range */
export type Analytics = {
  inbound: { total: number; answered: number; abandoned: number };
  outbound: { total: number; answered: number; missed: number };
  /** Seconds */
  shift: { login: number; idle: number; brk: number; call: number };
  callTime: { ringing: number; talk: number; hold: number; wrap: number };
  /** Time on each break type, in seconds */
  breaks: { label: string; seconds: number }[];
  /** Empty when the per-hour charts have no data (the backend has none) */
  hours: string[];
  hourly: { outbound: number[]; inbound: number[]; busy: number[]; abandoned: number[] };
  /** AHT per hour, seconds */
  aht: { inbound: number[]; outbound: number[]; overall: number };
};
