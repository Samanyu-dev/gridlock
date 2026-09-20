import type {
  Meta, Driver, DriverFull, Constructor, ConstructorFull, Race, RaceFull,
  MeResponse, Profile, TeamState, TeamScore, LeaderboardRow, LeagueSummary,
  LeagueDetail, Insight, LiveSnapshot, SearchResult, Boost, WeekendScore, OwnershipReport,
  H2HReport, LiveBattleReport, TransferTrendsReport, OptimalTeamReport, Notification, LeagueActivityEvent,
} from './types'

const TOKEN_KEY = 'gridlock.token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api${path}`, { ...options, headers, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(20000) })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (!entries.length) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

export interface RegisterPayload {
  email: string; password: string; username: string
  team_name?: string; persona?: string
  favorite_driver_id?: number; favorite_constructor_id?: number; country?: string
}
export interface AuthResult { profile: Profile; access_token: string; token_type: string; verify_token?: string }
export interface SaveTeamPayload {
  driver_ids: number[]; constructor_ids: number[]
  captain_id: number | null; active_boost: string | null
  boost_driver_id?: number | null; boost_constructor_id?: number | null
}

export const api = {
  meta: () => req<Meta>('/meta'),
  rules: () => req<{ config: Meta['config']; rules: Record<string, unknown>; boosts: Boost[] }>('/rules'),
  insights: () => req<{ insights: Insight[] }>('/insights'),

  drivers: (p: { search?: string; constructorId?: number; sort?: string; order?: string } = {}) =>
    req<{ drivers: Driver[] }>(`/drivers${qs({ search: p.search, constructor: p.constructorId, sort: p.sort, order: p.order })}`),
  driver: (slug: string) => req<DriverFull>(`/drivers/${slug}`),
  constructors: (p: { sort?: string; order?: string } = {}) =>
    req<{ constructors: Constructor[] }>(`/constructors${qs(p)}`),
  constructor: (slug: string) => req<ConstructorFull>(`/constructors/${slug}`),

  races: () => req<{ races: Race[] }>('/races'),
  race: (slug: string) => req<RaceFull>(`/races/${slug}`),
  live: () => req<LiveSnapshot>('/live'),

  // --- auth (token-based) ---
  register: (p: RegisterPayload) => req<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(p) }),
  login: (email: string, password: string) =>
    req<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  authMe: () => req<{ profile: Profile }>('/auth/me'),
  requestReset: (email: string) => req<{ ok: boolean; reset_token?: string }>('/auth/reset/request', { method: 'POST', body: JSON.stringify({ email }) }),
  confirmReset: (token: string, password: string) => req<{ ok: boolean }>('/auth/reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) }),
  verifyEmail: (token: string) => req<{ ok: boolean }>('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  oauthStart: (provider: string) => req<{ authorize_url: string; client_id: string }>(`/auth/oauth/${provider}`),

  // --- fantasy (identity from token) ---
  me: () => req<MeResponse>('/me'),
  validateTeam: (p: { driver_ids: number[]; constructor_ids: number[]; captain_id: number | null }) =>
    req<{ valid: boolean; errors: string[]; cost: number; remaining: number; projected: TeamScore | null }>(
      '/team/validate', { method: 'POST', body: JSON.stringify(p) }),
  saveTeam: (payload: SaveTeamPayload) =>
    req<{ team: TeamState; score: TeamScore; rank: number; field_size: number; transfers: TransferOutcome }>(
      '/team', { method: 'PUT', body: JSON.stringify(payload) }),
  teamScore: (round?: number) => req<WeekendScore>(`/team/score${qs({ round_id: round })}`),
  transferHistory: () => req<{ transfers: TransferRow[] }>('/team/transfers'),

  leaderboard: (p: { offset?: number; limit?: number } = {}) =>
    req<{ entries: LeaderboardRow[]; total: number; me: LeaderboardRow | null }>(`/leaderboard${qs(p)}`),
  leaderboardRound: (round: number, p: { offset?: number; limit?: number } = {}) =>
    req<{ round: number; entries: LeaderboardRow[]; me: LeaderboardRow | null; total: number }>(`/leaderboard/round/${round}${qs(p)}`),

  leagues: () => req<{ mine: LeagueSummary[] }>('/leagues'),
  createLeague: (p: { name: string; description: string; type: string }) =>
    req<{ code: string; name: string }>('/leagues', { method: 'POST', body: JSON.stringify(p) }),
  joinLeague: (p: { code: string }) =>
    req<{ code: string; joined: boolean }>('/leagues/join', { method: 'POST', body: JSON.stringify(p) }),
  league: (code: string) => req<LeagueDetail>(`/leagues/${code}`),
  leagueActivity: (code: string) => req<{ league: string; events: LeagueActivityEvent[] }>(`/leagues/${code}/activity`),

  search: (q: string) => req<{ results: SearchResult[] }>(`/search${qs({ q })}`),
  ownership: (league?: string) => req<OwnershipReport>(`/ownership${qs({ league })}`),
  h2h: (username: string) => req<H2HReport>(`/h2h/${username.replace(/^@/, '')}`),
  liveBattle: (rival: string) => req<LiveBattleReport>(`/live/battle${qs({ rival: rival.replace(/^@/, '') })}`),
  optimalTeam: (round: number) => req<OptimalTeamReport>(`/optimal-team/${round}`),
  transferTrends: (league?: string) => req<TransferTrendsReport>(`/transfers/trends${qs({ league })}`),
  notifications: () => req<{ notifications: Notification[] }>('/notifications'),

  dataHealth: () => req<DataHealth>('/admin/data-health'),
  resync: () => req<DataHealth>('/admin/resync', { method: 'POST' }),
  ledgerAudit: () => req<{ total: number; groups: LedgerAuditGroup[] }>('/admin/ledger-audit'),
}

export interface TransferOutcome { transfers: number; free_used: number; penalized: number; penalty: number }
export interface LedgerCorrection {
  id: number; round: number; entity_type: string; entity_id: number; entity_name: string
  previous_points: number; new_points: number; delta: number; reason: string
  detected_at: string; run_id: number | null; run_started_at: string | null
}
export interface LedgerAuditGroup { run_id: number | null; run_started_at: string | null; corrections: LedgerCorrection[] }
export interface DataHealth {
  provider: string; season_year?: number
  last_synced_at: string | null; last_sync_duration_seconds: number | null
  last_sync_source: string; sync_count: number; cache_ttl_seconds: number
  last_error: string | null; next_round: number | null
  rounds_elapsed: number; rounds_with_confirmed_winner: number; rounds_total: number; data_gaps: number
  rounds: { round: number; name: string; status: string; round_state: string; has_winner: boolean; race_start: string }[]
}
export interface TransferRow {
  round: number; asset_type: 'driver' | 'constructor'
  sold: string | null; bought: string | null
  sale_price: number; purchase_price: number; free: boolean; penalty: number; created_at: string
}
