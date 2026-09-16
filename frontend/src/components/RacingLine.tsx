import { motion } from 'framer-motion'

/** The signature GRIDLOCK racing line — a sweeping track that draws itself in.
 *  Reused across the hero, onboarding, and section dividers. */
export function RacingLine({ height = 220, color = 'var(--red)' }: { height?: number; color?: string }) {
  const path =
    'M-20,180 C120,180 160,40 320,40 C520,40 540,200 720,200 C900,200 940,60 1120,60 C1260,60 1320,140 1460,140'
  return (
    <svg
      viewBox="0 0 1440 240" width="100%" height={height} preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block' }} aria-hidden
    >
      {/* faint under-track */}
      <path d={path} fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round" opacity="0.5" />
      {/* animated racing line */}
      <motion.path
        d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0.2 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2.4, ease: 'easeInOut' }}
      />
      {/* start/finish + apex dots */}
      <motion.circle cx="320" cy="40" r="5" fill={color}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring' }} />
      <motion.circle cx="720" cy="200" r="5" fill="var(--info)"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.3, type: 'spring' }} />
      <motion.circle cx="1120" cy="60" r="5" fill="var(--purple)"
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.8, type: 'spring' }} />
    </svg>
  )
}
