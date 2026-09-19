/** Renders a branded 1200×630 share card to a PNG and hands it to the Web
 *  Share API (or downloads it if sharing files isn't supported) — one
 *  canvas renderer reused by every card type instead of four bespoke ones. */
export interface ShareCardSpec {
  eyebrow: string
  title: string
  bigStat: string
  bigStatLabel: string
  rows: { label: string; value: string; color?: string }[]
  accent?: string
}

const W = 1200, H = 630
const BG = '#0a0c10', SURFACE = '#161a20', TEXT = '#f2f4f7', DIM = '#a5adb8', RED = '#ff2130'

export async function renderShareCard(spec: ShareCardSpec): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const accent = spec.accent || RED

  // Background + accent glow.
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  const grad = ctx.createRadialGradient(W * 0.85, -50, 50, W * 0.85, -50, 700)
  grad.addColorStop(0, accent + '33')
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Wordmark.
  ctx.fillStyle = TEXT
  ctx.font = '700 28px Archivo, Arial, sans-serif'
  ctx.fillText('GRIDLOCK', 60, 70)
  ctx.fillStyle = accent
  ctx.fillRect(60, 84, 46, 4)

  // Eyebrow + title.
  ctx.fillStyle = DIM
  ctx.font = '600 20px Inter, Arial, sans-serif'
  ctx.fillText(spec.eyebrow.toUpperCase(), 60, 190)
  ctx.fillStyle = TEXT
  ctx.font = '800 56px Archivo, Arial, sans-serif'
  wrapText(ctx, spec.title, 60, 250, 1080, 60)

  // Big stat.
  ctx.fillStyle = accent
  ctx.font = '800 120px Archivo, Arial, sans-serif'
  ctx.fillText(spec.bigStat, 60, 430)
  ctx.fillStyle = DIM
  ctx.font = '600 22px Inter, Arial, sans-serif'
  ctx.fillText(spec.bigStatLabel.toUpperCase(), 60, 465)

  // Row panel.
  const rowY = 500, rowH = 90
  ctx.fillStyle = SURFACE
  roundRect(ctx, 60, rowY, 1080, rowH, 14)
  ctx.fill()
  const colW = 1080 / Math.max(1, spec.rows.length)
  spec.rows.forEach((r, i) => {
    const x = 60 + colW * i + 24
    ctx.fillStyle = DIM
    ctx.font = '600 15px Inter, Arial, sans-serif'
    ctx.fillText(r.label.toUpperCase(), x, rowY + 32)
    ctx.fillStyle = r.color || TEXT
    ctx.font = '800 26px Archivo, Arial, sans-serif'
    ctx.fillText(r.value, x, rowY + 65)
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas export failed'))), 'image/png')
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ')
  let line = '', lineY = y
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, lineY)
      line = word
      lineY += lineHeight
    } else {
      line = test
    }
  }
  ctx.fillText(line, x, lineY)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function shareOrDownload(spec: ShareCardSpec, filename: string): Promise<'shared' | 'downloaded'> {
  const blob = await renderShareCard(spec)
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  if (nav.canShare && nav.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: spec.title } as ShareData)
    return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
