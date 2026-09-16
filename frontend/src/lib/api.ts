import type {
  Meta, Driver, DriverFull, Constructor, ConstructorFull, Race, RaceFull,
  MeResponse, Profile, TeamState, TeamScore, LeaderboardRow, LeagueSummary,
  LeagueDetail, Insight, LiveSnapshot, SearchResult, Boost,
} from './types'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
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

export interface AuthPayload {
  username: string; persona?: string; favorite_driver_id?: number
  favorite_constructor_id?: number; team_name?: string; country?: string
}
export interface SaveTeamPayload {
  username: string; driver_ids: number[]; constructor_ids: number[]
  captain_id: number | null; active_boost: string | null
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

  auth: (payload: AuthPayload) =>
    req<{ profile: Profile; created: boolean }>('/auth', { method: 'POST', body: JSON.stringify(payload) }),
  me: (username: string) => req<MeResponse>(`/me${qs({ username })}`),
  validateTeam: (p: { driver_ids: number[]; constructor_ids: number[]; captain_id: number | null }) =>
    req<{ valid: boolean; errors: string[]; cost: number; remaining: number; projected: TeamScore | null }>(
      '/team/validate', { method: 'POST', body: JSON.stringify(p) }),
  saveTeam: (payload: SaveTeamPayload) =>
    req<{ team: TeamState; score: TeamScore; rank: number; field_size: number }>(
      '/team', { method: 'PUT', body: JSON.stringify(payload) }),

  leaderboard: (p: { offset?: number; limit?: number; username?: string } = {}) =>
    req<{ entries: LeaderboardRow[]; total: number; me: LeaderboardRow | null }>(`/leaderboard${qs(p)}`),

  leagues: (username?: string) =>
    req<{ public: LeagueSummary[]; mine: LeagueSummary[] }>(`/leagues${qs({ username })}`),
  createLeague: (p: { username: string; name: string; description: string; privacy: string; type: string }) =>
    req<{ code: string; name: string }>('/leagues', { method: 'POST', body: JSON.stringify(p) }),
  joinLeague: (p: { username: string; code: string }) =>
    req<{ code: string; joined: boolean }>('/leagues/join', { method: 'POST', body: JSON.stringify(p) }),
  league: (code: string, username?: string) =>
    req<LeagueDetail>(`/leagues/${code}${qs({ username })}`),

  search: (q: string) => req<{ results: SearchResult[] }>(`/search${qs({ q })}`),
}
