export interface ConstructorRef { id: number; name: string; short: string; color: string; slug: string }

export interface Driver {
  id: number; name: string; short: string; number: number; slug: string
  country: string; country_name: string
  constructor: ConstructorRef
  price: number; price_prev: number; price_delta: number
  points: number; form: number; ownership: number; status: string
  value: number; last5: number[]
}

export interface DriverStats {
  avg_quali: number | null; avg_finish: number | null; podiums: number
  wins: number; dnfs: number; fastest_laps: number; positions_gained: number; races: number
}

export interface DriverHistoryRow {
  round: number; race: string; location: string; country: string
  grid: number; finish: number | null; status: string; quali: number | null
  points: number; fastest_lap: boolean; dotd: boolean
}

export interface DriverFull extends Driver {
  stats: DriverStats
  history: DriverHistoryRow[]
  last_breakdown: { label: string; points: number; tag: string }[]
  teammate: Driver | null
}

export interface Constructor {
  id: number; name: string; short: string; slug: string; color: string
  price: number; price_prev: number; price_delta: number
  points: number; form: number; ownership: number; reliability: number
  last5: number[]; value: number
  drivers: { id: number; name: string; short: string; number: number }[]
}
export interface ConstructorFull extends Constructor {
  history: { round: number; points: number }[]
  drivers_full: Driver[]
}

export interface RaceSession { kind: string; label: string; start: string }
export interface Race {
  round: number; name: string; slug: string; location: string; country: string; country_name: string
  circuit: string; laps: number; length_km: number; is_sprint: boolean
  race_start: string; deadline: string; weather: string; status: string
  winner: { name: string; short: string } | null
}
export interface RaceFull extends Race {
  sessions: RaceSession[]
  classification: ClassificationRow[]
  quali: { driver_id: number; name: string; short: string; constructor: string; color: string; position: number }[]
  fastest_lap: { name: string; short: string } | null
  dotd: { name: string; short: string } | null
}
export interface ClassificationRow {
  driver_id: number; name: string; short: string; number: number; constructor: string; color: string
  grid: number; finish: number | null; status: string; fastest_lap: boolean; dotd: boolean; delta: number | null
}

export interface Boost {
  id: string; name: string; icon: string; description: string
  usage_limit: number; activation_period: string; scoring_modifier: Record<string, unknown>
}
export interface GameConfig {
  budget: number; roster: { drivers: number; constructors: number }
  captain_multiplier: number; free_transfers: number; extra_transfer_cost: number
  rules: Record<string, unknown>; boosts: Boost[]
}
export interface Meta {
  season: number; product: string; provider: string; next_round: number; total_rounds: number
  next_race: Race | null; config: GameConfig; team_name_suggestions: string[]
}

export interface Profile {
  id: number; username: string; email: string | null; email_verified?: boolean; is_admin?: boolean
  display_name: string; team_name: string
  persona: string | null; country: string | null
  favorite_driver_id: number | null; favorite_constructor_id: number | null; public_profile: boolean
}
export interface TeamState {
  driver_ids: number[]; constructor_ids: number[]; captain_id: number | null
  active_boost: string | null; boost_driver_id?: number | null; boost_constructor_id?: number | null
  free_transfers: number; team_value?: number; bank?: number
}
export interface LedgerEntry { rule_code: string; phase: string; tag: string; label: string; points: number; base_points?: number; multiplier?: number }
export interface WeekendAsset {
  ref: string; name: string; short: string; color: string
  base: number; multiplier: number; subtotal: number; entries: LedgerEntry[]
}
export interface WeekendScore {
  total: number; state: string; round: number; assets: WeekendAsset[]; from_snapshot?: boolean
}
export interface TeamScore {
  total: number; drivers_points: number; constructors_points: number; captain_bonus: number
  per_round: Record<string, number>; last_race_points: number
}
export interface MeResponse {
  profile: Profile; team: TeamState | null
  score?: TeamScore; rank?: number; field_size?: number; percentile?: number
  weekend?: WeekendScore
}

export interface LeaderboardRow {
  rank: number; team_name: string; manager: string; country: string | null
  total: number; last_race: number; movement: number; is_me?: boolean; league_rank?: number
}
export interface LeagueSummary {
  code: string; name: string; description: string; privacy: string; type: string; member_count: number
}
export interface LeagueDetail extends LeagueSummary {
  creator: string; members: LeaderboardRow[]
}

export interface Insight { type: string; text: string; demo: boolean }

export interface LiveBoardRow {
  position: number; driver_id: number; short: string; name: string; number: number
  constructor: string; color: string; gap: string; tyre: string; pits: number; delta: number
}
export interface LiveEvent { lap: number; short: string; color: string; points: number; label: string }
export interface LiveSnapshot {
  demo: boolean
  race: { name: string; location: string; country: string; circuit: string; weather: string }
  status: string; lap: number; total_laps: number; track_status: string
  board: LiveBoardRow[]; events: LiveEvent[]
}
export interface SearchResult { type: string; label: string; slug: string; meta: string }
