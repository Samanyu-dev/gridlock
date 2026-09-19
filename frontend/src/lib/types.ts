export interface ConstructorRef { id: number; name: string; short: string; color: string; accessible_color: string; slug: string }
export interface TransferTrend { in: number; out: number; net: number; ownership_delta: number }

export interface Driver {
  id: number; name: string; short: string; number: number; slug: string
  country: string; country_name: string; image_url: string
  constructor: ConstructorRef
  price: number; price_prev: number; price_delta: number
  points: number; form: number; ownership: number; captain_pct: number; underdog_pct: number; status: string
  value: number; last5: number[]; transfer_trend: TransferTrend
}

export interface DriverStats {
  avg_quali: number | null; avg_finish: number | null; podiums: number
  wins: number; dnfs: number; fastest_laps: number; positions_gained: number; races: number
  last3_avg_pts: number | null; last5_avg_pts: number | null; season_avg_pts: number | null
  quali_avg_pts: number | null; race_avg_pts: number | null
  consistency: number; dnf_rate: number
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
  accessible_color: string; logo_url: string; car_url: string
  price: number; price_prev: number; price_delta: number
  points: number; form: number; ownership: number; reliability: number
  last5: number[]; value: number; transfer_trend: TransferTrend
  drivers: { id: number; name: string; short: string; number: number; image_url: string }[]
}
export interface ConstructorStats {
  last3_avg_pts: number | null; last5_avg_pts: number | null; season_avg_pts: number | null
  quali_avg_pts: number | null; race_avg_pts: number | null
  consistency: number; dnf_count: number; dnf_rate: number
}
export interface ConstructorFull extends Constructor {
  history: { round: number; points: number }[]
  drivers_full: Driver[]
  stats: ConstructorStats
}

export interface RaceSession { kind: string; label: string; start: string }
export interface Race {
  round: number; name: string; slug: string; location: string; country: string; country_name: string
  circuit: string; laps: number; length_km: number; is_sprint: boolean
  race_start: string; deadline: string; weather: string; status: string
  circuit_image_url: string; round_state: 'UPCOMING' | 'OPEN' | 'LOCKED' | 'LIVE' | 'PROVISIONAL' | 'FINAL'
  winner: { name: string; short: string } | null
}
export interface QualiRow { driver_id: number; name: string; short: string; constructor: string; color: string; position: number }
export interface RaceFull extends Race {
  sessions: RaceSession[]
  classification: ClassificationRow[]
  quali: QualiRow[]
  sprint_classification: ClassificationRow[]
  sprint_quali: QualiRow[]
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
  round_id: number; locked: boolean; deadline: string | null; last_synced_at: string | null
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
  correction_notice?: string | null
}
export interface OwnershipRow { id: number; name: string; short: string; color: string; owned_pct: number; captain_pct?: number; underdog_pct?: number }
export interface OwnershipReport {
  round: number | null; total_teams: number; league: string | null
  drivers: OwnershipRow[]; constructors: OwnershipRow[]
}
export interface TeamScore {
  total: number; drivers_points: number; constructors_points: number; captain_bonus: number
  per_round: Record<string, number>; last_race_points: number
}
export interface MeResponse {
  profile: Profile; team: TeamState | null
  score?: TeamScore; rank?: number; field_size?: number; percentile?: number; gap_to_leader?: number
  weekend?: WeekendScore
}

export interface LeaderboardRow {
  rank: number; team_name: string; manager: string; country: string | null
  total: number; last_race: number; movement: number; is_me?: boolean; league_rank?: number
  gap_to_leader?: number
}
export interface LeagueSummary {
  code: string; name: string; description: string; privacy: string; type: string; member_count: number
}
export interface LeagueDetail extends LeagueSummary {
  creator: string; members: LeaderboardRow[]
}

export interface Insight { type: string; text: string }

export interface LiveRaceBrief {
  name: string; location: string; country: string; circuit: string; weather: string
  deadline: string | null; race_start: string | null
}
export interface LiveSnapshot {
  live: boolean
  race: LiveRaceBrief | null
  reason?: string
}
export interface SearchResult { type: string; label: string; slug: string; meta: string }

export interface H2HRef { id: number; name: string; short: string; color: string }
export interface H2HSide {
  profile_id: number; username: string; team_name: string; total: number; last_race_points: number
  captain: H2HRef | null; drivers: H2HRef[]; constructors: H2HRef[]; differentials: H2HRef[]
}
export interface H2HReport {
  a: H2HSide; b: H2HSide; shared_drivers: H2HRef[]; shared_constructors: H2HRef[]
  gap: number; rounds_record: { a: number; b: number; ties: number }
}

export interface LiveBattleSwing { ref: string; name: string; short: string; color: string; mine: number; rival: number; delta: number }
export interface LiveBattleAsset { ref: string; name: string; short: string; color: string; subtotal: number }
export interface LiveBattleReport {
  round: number; state: string
  mine: { total: number; season_before: number }; rival: { total: number; season_before: number }
  swing: number; gap_before: number; gap_projected: number
  swings: LiveBattleSwing[]
  captain_battle: { mine: LiveBattleAsset | null; rival: LiveBattleAsset | null }
  rival_username: string; rival_team_name: string
}

export interface TransferTrendRow { id: number; name: string; short: string; color: string; in: number; out: number; net: number; ownership_delta: number }
export interface TransferTrendsReport {
  round: number | null; league: string | null
  drivers: TransferTrendRow[]; constructors: TransferTrendRow[]
}

export interface OptimalMissedRow { ref: string; name: string; short: string; color: string; optimal: number; mine: number; missed: number }
export interface OptimalTeamReport {
  round: number; actual_total: number; optimal_total: number; efficiency: number; missed_points: number
  optimal_assets: WeekendAsset[]; actual_assets: WeekendAsset[]
  optimal_captain_id: number; optimal_underdog_id: number | null
  breakdown: OptimalMissedRow[]
}
