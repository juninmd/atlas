// Constelacao: um ponto por repositorio, agrupado por linguagem. Canvas 2D, sem dependencias.
const HUE = { TypeScript: 215, JavaScript: 48, Python: 160, 'C#': 275, HTML: 18, Java: 0, Rust: 28, Go: 190, Kotlin: 300, Dockerfile: 200, Shell: 120, CSS: 335, Dart: 175, HCL: 255 }
export const hue = lang => HUE[lang] ?? 240
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }

export function createConstellation(canvas, { labels = false, getRepos, isActive, colorMode, onPick, onHover }) {
  const ctx = canvas.getContext('2d')
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches
  let W = 0, H = 0, hover = -1, tx = 0, ty = 0, gx = 0, gy = 0, running = false, stars = [], clusters = {}, keys = [], neighbors = [], cols = {}
  const cs = () => getComputedStyle(document.documentElement)

  function readColors() {
    const g = n => cs().getPropertyValue(n).trim()
    cols = { fg: g('--fg'), mut: g('--mut'), acc: g('--accent'), sl: g('--sl'), ativo: g('--st-ativo'), manutencao: g('--st-manutencao'), experimento: g('--st-experimento'), abandonado: g('--st-abandonado'), 'n/d': g('--mut') }
  }
  function layout() {
    const repos = getRepos()
    const count = {}
    repos.forEach(r => { const l = r.language || '—'; count[l] = (count[l] || 0) + 1 })
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0])
    const key = r => top.includes(r.language || '—') ? (r.language || '—') : 'outros'
    keys = [...top, 'outros']; clusters = {}
    keys.forEach((k, j) => {
      const n = repos.filter(r => key(r) === k).length, a = j * 2.399963, rad = j ? 0.3 + 0.62 * Math.sqrt(j / keys.length) : 0
      clusters[k] = { x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.92, sd: 0.035 + 0.05 * Math.sqrt(n / 150), n, h: k === 'outros' ? 240 : hue(k) }
    })
    stars = repos.map((r, i) => {
      const rd = rng(i * 7919 + 11), c = clusters[key(r)], g1 = Math.sqrt(-2 * Math.log(rd() + 1e-6)), a = rd() * 6.2832
      return { i, k: key(r), x: c.x + Math.cos(a) * g1 * c.sd, y: c.y + Math.sin(a) * g1 * c.sd, z: .5 + rd(), ph: rd() * 6.28, sp: .6 + rd() * 1.4, sz: 2 + (r.scan?.health ?? 40) / 45 }
    })
  }
  const scale = () => Math.min(W, H) * 0.45
  const pos = s => [W / 2 + s.x * scale() + gx * 12 * s.z, H / 2 + s.y * scale() + gy * 12 * s.z]
  const color = r => colorMode() === 'lang' ? `hsl(${hue(r.language)} 75% ${cols.sl})` : cols[r.scan?.status || 'n/d']

  function draw(t = performance.now()) {
    if (!W) return
    const repos = getRepos(), S0 = scale()
    gx += (tx - gx) * .06; gy += (ty - gy) * .06
    ctx.clearRect(0, 0, W, H)
    for (const k of keys) {
      const c = clusters[k], x = W / 2 + c.x * S0 + gx * 8, y = H / 2 + c.y * S0 + gy * 8, rr = c.sd * S0 * 3.2
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr)
      g.addColorStop(0, `hsl(${c.h} 70% ${cols.sl} / .13)`); g.addColorStop(1, `hsl(${c.h} 70% ${cols.sl} / 0)`)
      ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2)
    }
    if (labels) {
      ctx.font = '10.5px "JetBrains Mono",monospace'; ctx.textAlign = 'center'; ctx.fillStyle = cols.mut; ctx.globalAlpha = .8
      for (const k of keys) { const c = clusters[k]; ctx.fillText(`${k} · ${c.n}`, W / 2 + c.x * S0 + gx * 8, H / 2 + c.y * S0 - c.sd * S0 * 2.3 + gy * 8) }
      ctx.globalAlpha = 1
    }
    if (hover >= 0 && stars[hover]) {
      ctx.strokeStyle = cols.acc; ctx.lineWidth = 1
      const [hx, hy] = pos(stars[hover])
      for (const j of neighbors) { const [x, y] = pos(stars[j]); ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x, y); ctx.stroke() }
      ctx.globalAlpha = 1
    }
    for (const s of stars) {
      const r = repos[s.i]; if (!r) continue
      const on = isActive(s.i), [x, y] = pos(s), tw = RM ? .8 : .62 + .38 * Math.sin(t / 1000 * s.sp + s.ph), c = color(r)
      ctx.globalAlpha = on ? tw : .07
      if (on) { ctx.fillStyle = c; ctx.globalAlpha = tw * .14; ctx.beginPath(); ctx.arc(x, y, s.sz * 3, 0, 6.2832); ctx.fill(); ctx.globalAlpha = tw }
      if (r.private) { ctx.strokeStyle = c; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(x, y, s.sz * .9, 0, 6.2832); ctx.stroke() }
      else { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, s.sz * (s.i === hover ? 1.8 : 1), 0, 6.2832); ctx.fill() }
    }
    ctx.globalAlpha = 1
    if (hover >= 0 && stars[hover]) { const [x, y] = pos(stars[hover]); ctx.strokeStyle = cols.fg; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.stroke() }
  }
  function hit(mx, my) {
    let best = -1, bd = 18
    for (const s of stars) { if (!isActive(s.i)) continue; const [x, y] = pos(s), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = s.i } }
    return best
  }
  function setHover(h, ev) {
    if (h === hover) return
    hover = h
    if (h >= 0) {
      const k = stars[h], [x0, y0] = pos(k)
      neighbors = stars.filter(s => s.k === k.k && s.i !== h && isActive(s.i)).map(s => [s.i, Math.hypot(pos(s)[0] - x0, pos(s)[1] - y0)]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(a => a[0])
      canvas.style.cursor = 'pointer'
    } else { neighbors = []; canvas.style.cursor = 'default'; onHover?.(null) }
    if (RM) draw(0)
  }
  const onMove = e => {
    const b = canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top
    tx = (mx / W - .5) * 2; ty = (my / H - .5) * 2
    const h = hit(mx, my); setHover(h)
    if (h >= 0) onHover?.(getRepos()[h], e.clientX, e.clientY)
  }
  const onLeave = () => { tx = ty = 0; setHover(-1) }
  const onClick = e => { const b = canvas.getBoundingClientRect(), h = hit(e.clientX - b.left, e.clientY - b.top); if (h >= 0) onPick?.(getRepos()[h]) }
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave); canvas.addEventListener('click', onClick)

  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1)
    W = canvas.clientWidth; H = canvas.clientHeight
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }
  const ro = new ResizeObserver(size); ro.observe(canvas)
  const loop = t => { if (running) { draw(t); requestAnimationFrame(loop) } }
  const io = new IntersectionObserver(es => {
    const v = es[0].isIntersecting
    if (v && !running && !RM) { running = true; requestAnimationFrame(loop) } else if (!v) running = false
  }); io.observe(canvas)
  readColors(); layout(); size()
  return {
    draw, size,
    refresh() { readColors(); layout(); draw() },
    recolor() { readColors(); draw() },
    destroy() { running = false; ro.disconnect(); io.disconnect(); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('click', onClick) },
  }
}
