export function flagEmoji(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2) return '🏁'
  const A = 0x1f1e6
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65)
}

export function pad(n: number): string { return String(Math.max(0, n)).padStart(2, '0') }

export interface CountdownParts { days: number; hours: number; mins: number; secs: number; past: boolean }
export function countdownTo(iso: string, from = Date.now()): CountdownParts {
  const diff = new Date(iso).getTime() - from
  const past = diff <= 0
  const s = Math.abs(Math.floor(diff / 1000))
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
    past,
  }
}

/** Local time in the user's timezone (all race times stored UTC). */
export function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
export function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
export function localDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
export function localWeekday(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short' })
}
export function userTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

export function money(v: number): string { return `$${v.toFixed(1)}M` }
export function initials(name: string): string {
  const parts = name.split(' ')
  return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')
}

/** Deadline urgency tier drives escalating UI treatment. */
export function urgency(iso: string): 'locked' | 'urgent' | 'soon' | 'near' | 'normal' {
  const { past, days, hours } = countdownTo(iso)
  if (past) return 'locked'
  const totalHours = days * 24 + hours
  if (totalHours < 1) return 'urgent'
  if (totalHours < 6) return 'soon'
  if (totalHours < 24) return 'near'
  return 'normal'
}

export function statusLabel(s: string): string {
  return { finished: 'FIN', classified: 'CLA', dnf: 'DNF', dns: 'DNS', dsq: 'DSQ' }[s] || s.toUpperCase()
}

/** One color per round lifecycle state, shared by the calendar and the
 *  admin data-health page so a state always reads the same everywhere. */
export const ROUND_STATE_COLOR: Record<string, string> = {
  UPCOMING: 'var(--text-faint)', OPEN: 'var(--info)', LOCKED: 'var(--caution)',
  LIVE: 'var(--red)', PROVISIONAL: 'var(--caution)', FINAL: 'var(--gain)',
}
