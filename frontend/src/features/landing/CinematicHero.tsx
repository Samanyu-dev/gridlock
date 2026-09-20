import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { getAsset } from '../../lib/gl3d/manifest'
import { useMeta } from '../../lib/meta'

const Scene = lazy(() => import('./CinematicScene'))
const asset = getAsset('gridlock-car-dev')!
const LABELS = ['The invitation', 'The reveal', 'Your grid', 'Your strategy', 'Every point', 'Own the grid', 'Race together']

/** Native document scrolling is the only clock. DOM stays useful before WebGL loads. */
export function CinematicHero() {
  const root = useRef<HTMLElement>(null)
  const progress = useRef(0)
  const [stage, setStage] = useState(0)
  const [ready, setReady] = useState(false)
  const [activated, setActivated] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [reduced, setReduced] = useState(true)
  const [staticChoice, setStaticChoice] = useState(false)
  const meta = useMeta()
  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const narrow = matchMedia('(max-width: 760px)')
    const short = matchMedia('(max-height: 500px)')
    const configure = () => { setReduced(motion.matches || short.matches || staticChoice); setMobile(narrow.matches) }
    configure()
    motion.addEventListener('change', configure); narrow.addEventListener('change', configure); short.addEventListener('change', configure)
    return () => { motion.removeEventListener('change', configure); narrow.removeEventListener('change', configure); short.removeEventListener('change', configure) }
  }, [staticChoice])
  useEffect(() => {
    const element = root.current
    if (!element) return
    let raf = 0
    const update = () => {
      raf = 0
      const rect = element.getBoundingClientRect()
      const sticky = element.querySelector<HTMLElement>('.cinema-sticky')!
      const distance = element.offsetHeight - sticky.offsetHeight
      const p = reduced ? 0 : Math.max(0, Math.min(1, (66 - rect.top) / Math.max(1, distance)))
      progress.current = p
      element.style.setProperty('--story-progress', String(p))
      const next = p < .09 ? 0 : p < .24 ? 1 : p < .42 ? 2 : p < .59 ? 3 : p < .74 ? 4 : p < .9 ? 5 : 6
      setStage(previous => previous === next ? previous : next)
      if (p > .005 && rect.bottom > 0 && !reduced) setActivated(true)
      // Style updates bypass React's render loop; text changes only at stage boundaries.
      element.querySelectorAll<HTMLElement>('[data-story-panel]').forEach((panel, i) => {
        panel.style.setProperty('--panel-active', String(i === next ? 1 : 0))
      })
    }
    const requestUpdate = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', requestUpdate); window.removeEventListener('resize', requestUpdate) }
  }, [reduced, mobile])

  const budget = meta?.config.budget ?? 300
  return <section ref={root} className={`cinema-story${reduced ? ' cinema-static' : ''}${ready ? ' cinema-webgl-ready' : ''}`} data-stage={stage} aria-label="Discover GRIDLOCK">
    <h1 className="sr-only">GRIDLOCK. Your grid. Your rivals. Your season.</h1>
    <div className="cinema-sticky">
      <div className="cinema-atmosphere" aria-hidden="true" />
      <div className="cinema-depth cinema-depth-back" aria-hidden="true">GRID</div>
      <div className="cinema-scene" aria-hidden="true">
        <img className="cinema-poster" src={asset.fallbackImage} alt="" />
        {activated && !reduced && <Suspense fallback={null}><Scene progress={progress} mobile={mobile} onReady={setReady} /></Suspense>}
      </div>
      <div className="cinema-depth cinema-depth-front" aria-hidden="true">LOCK</div>
      <div className="cinema-scrim" aria-hidden="true" />
      <div className="cinema-topline"><span>PRIVATE FANTASY RACING</span><div className="cinema-tools"><button type="button" aria-pressed={staticChoice} onClick={() => setStaticChoice(value => !value)}>{staticChoice ? 'Enable motion' : 'Reduce motion'}</button><a href="#weekend">Skip intro <ArrowDown size={12} /></a></div></div>
      <div className="cinema-panels">
        <div data-story-panel aria-hidden={stage !== 0} className="cinema-panel cinema-intro">
          <span className="cinema-kicker">The season is better with rivals.</span>
          <div className="cinema-wordmark" aria-hidden="true">GRIDLOCK</div>
          <h2>Your grid.<br />Your rivals.<br /><em>Your season.</em></h2>
          <p>Fantasy Formula racing for your group.</p>
        </div>
        <div data-story-panel aria-hidden={stage !== 1} className="cinema-panel">
          <span className="cinema-kicker">01 / The reveal</span><h2>Built for<br /><em>race day.</em></h2><p>Every weekend begins with a decision.</p>
        </div>
        <div data-story-panel aria-hidden={stage !== 2} className="cinema-panel">
          <span className="cinema-kicker">02 / Build</span><h2>Your grid.<br /><em>Your call.</em></h2>
          <div className="cinema-specs"><div><strong>${budget}M</strong><span>Budget</span></div><div><strong>{meta?.config.roster.drivers ?? 10}</strong><span>Drivers</span></div><div><strong>{meta?.config.roster.constructors ?? 2}</strong><span>Constructors</span></div></div>
        </div>
        <div data-story-panel aria-hidden={stage !== 3} className="cinema-panel">
          <span className="cinema-kicker">03 / Lock</span><h2>Back your<br /><em>instinct.</em></h2>
          <div className="cinema-specs"><div><strong>{meta?.config.captain_multiplier ?? 1.5}×</strong><span>Captain</span></div><div><strong>2×</strong><span>Underdog · P6–P10</span></div></div><p>One free transfer. Private leagues.<br />A different decision every weekend.</p>
        </div>
        <div data-story-panel aria-hidden={stage !== 4} className="cinema-panel">
          <span className="cinema-kicker">04 / Race</span><h2>Every point.<br /><em>Every reason.</em></h2><p>Trace your score from qualifying to the flag. Compare your grid with your rivals.</p>
          <div className="cinema-feed"><span>Next Grand Prix</span><strong>{meta?.next_race?.name ?? 'Schedule loading'}</strong><small>{meta?.data_source ? `Results via ${meta.data_source} · no simulated timing` : 'Real results. Transparent scoring.'}</small></div>
        </div>
        <div data-story-panel aria-hidden={stage !== 5} className="cinema-panel cinema-depth-copy"><span className="cinema-kicker">05 / Own the grid</span><p>Ten drivers. One shared obsession.</p></div>
        <div data-story-panel aria-hidden={stage !== 6} className="cinema-panel"><span className="cinema-kicker">Your weekend starts here</span><h2>Build. Lock.<br /><em>Race together.</em></h2><p>Bring your friends. Leave the easy points behind.</p></div>
      </div>
      <div className="cinema-footer">
        <Link to="/onboarding" className="btn btn-primary cinema-cta">Build my grid <ArrowRight size={16} /></Link>
        <div className="cinema-scroll"><span>{reduced ? 'FREE TO PLAY' : 'SCROLL TO EXPLORE'}</span>{!reduced && <ArrowDown size={15} />}</div>
        <div className="cinema-chapter" aria-hidden="true"><span>0{stage + 1} / 07</span><strong>{LABELS[stage]}</strong><div className="cinema-progress" /></div>
      </div>
    </div>
  </section>
}
