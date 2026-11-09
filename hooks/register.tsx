import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { WinterRow, WinterScene } from '../types'

// The snow row under the logo, shown on the start screen until anything but /winter is entered.
const active = atom({ plugin: 'winter-clawd', key: 'active' } as const, null as WinterRow | null)

type Choice = WinterScene | 'random' | 'off'
const CHOICES: readonly Choice[] = ['snow', 'scene', 'random', 'off']
const USAGE = 'Usage: /winter [snow | scene | random | off | debug]'

// Measured with /winter debug against screenshots of a 46-row fullscreen layout: the logo
// block above the first site, and the bottom block (notice line, prompt with its two rules,
// status line) below. The notice line belongs to the bottom block, outside the transcript,
// so the snow cannot reach it.
const HEADER_ROWS = 5
// The bottom block is measured at run time (see bottomRows); this is its height with a
// six-line status line, used until the first measurement.
const DEFAULT_BOTTOM_ROWS = 10
const MIN_START_ROWS = 6
const FRAME_MS = 120
const RESIZE_CHECK_MS = 300

const DEFAULT = 0x01000000
const SNOW = 0xf4f9ff
const SNOW_DIM = 0x8299ad
const PILE = 0xe3eef8
const ICE = 0x9fd8ff

const SPRITE = [' ▐▛███▜▌', '▝▜█████▛▘', '  ▘▘ ▝▝']
const BLINK = ' ▐█████▌'
// Clawd (3 rows, its feet on the ground row) plus a row for the snow on its head.
const SCENE_MIN_ROWS = 5

// Transcript sites that report their laid-out height through `onScreen.of`.
const MEASURED = ['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolResult', 'ToolGroup', 'CommandOutput', 'TurnDuration', 'InfoNotice', 'Placed'] as const

type Flake = { x: number; y: number; v: number; k: number }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function toBase64(bytes: Uint8Array): string {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  const out: string[] = []
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63])
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==')
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=')
  }
  return out.join('')
}

// mulberry32: a seeded generator, so each shown row has snow and a walk of its own.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Sim {
  flakes: Flake[] = []
  pile: number[] = []
  readonly head = new Array<number>(9).fill(0)
  ground = 0
  top = 0
  cx = 0
  dir = 1
  // Clawd alternates walking and standing for random spans, at a random pace.
  walking = false
  phaseLeft = 0
  stepEvery = 3
  blinkLeft = 0
  // A slow wind that leans the flakes' sideways drift one way or the other.
  wind = 0
  windLeft = 0
  meltAt = 0.3
  melt = false
  tick = 0
  readonly rnd: () => number

  constructor(public w: number, public h: number, readonly scene: WinterScene, seed: number) {
    this.rnd = makeRng(seed)
    this.cx = Math.max(4, Math.floor(w / 2) - 4)
    this.dir = this.rnd() < 0.5 ? -1 : 1
    this.meltAt = 0.25 + this.rnd() * 0.12
    this.resize(w, h)
    for (let i = 0; i < 80; i++) this.step()
  }

  private between(lo: number, hi: number) {
    return lo + Math.floor(this.rnd() * (hi - lo + 1))
  }

  private get hasClawd() {
    return this.scene === 'scene' && this.h >= SCENE_MIN_ROWS && this.w >= 20
  }

  // Keeps the flakes that still fit and the pile, so a row that shrinks for a line drawn
  // above it does not restart its snow.
  resize(w: number, h: number) {
    this.w = w
    this.h = h
    this.ground = h - 1
    this.top = this.ground - 2
    this.pile = Array.from({ length: w }, (_, i) => this.pile[i] ?? 0)
    this.cx = Math.min(Math.max(4, this.cx), Math.max(4, w - 14))
    const density = this.scene === 'snow' ? 0.035 : 0.029
    const want = Math.max(1, Math.round(w * h * density))
    this.flakes = this.flakes.filter(f => f.x < w && f.y < h).slice(0, want)
    while (this.flakes.length < want) this.flakes.push(this.spawn(true))
  }

  private spawn(init: boolean): Flake {
    return {
      x: Math.floor(this.rnd() * this.w),
      y: init ? this.rnd() * (this.h + 1) - 1 : -0.2 - this.rnd() * 2,
      v: 0.12 + this.rnd() * 0.22,
      k: this.rnd(),
    }
  }

  private landAt(x: number): number {
    if (!this.hasClawd) return this.h
    const d = x - this.cx
    if (d >= 1 && d <= 7) return this.top
    if (d === 0 || d === 8) return this.top + 1
    return this.ground + 0.5
  }

  private land(x: number, stop: number) {
    if (!this.hasClawd || this.melt) return
    const d = x - this.cx
    const add = 0.05 + this.rnd() * 0.05
    if (stop === this.ground + 0.5) this.pile[x] = Math.min(0.5, this.pile[x] + add)
    else if (d >= 0 && d <= 8) this.head[d] = Math.min(0.32, this.head[d] + add)
  }

  private stepWind() {
    if (--this.windLeft > 0) return
    this.windLeft = this.between(60, 260)
    this.wind = this.rnd() < 0.35 ? 0 : (this.rnd() * 2 - 1) * 0.6
  }

  private stepClawd() {
    if (--this.phaseLeft <= 0) {
      this.walking = !this.walking
      if (this.walking) {
        this.phaseLeft = this.between(20, 150)
        this.stepEvery = this.between(2, 4)
        if (this.rnd() < 0.4) this.dir *= -1
      } else {
        this.phaseLeft = this.between(15, 90)
      }
    }
    if (this.walking && this.tick % this.stepEvery === 0) {
      this.cx += this.dir
      if (this.cx > this.w - 14 || this.cx < 4) {
        this.dir *= -1
        this.cx += this.dir * 2
      }
      for (const foot of [2, 3, 5, 6]) {
        const x = this.cx + foot
        if (x >= 0 && x < this.w) this.pile[x] = Math.min(this.pile[x], 0.05)
      }
    }
    if (this.blinkLeft > 0) this.blinkLeft--
    else if (this.rnd() < (this.walking ? 0.008 : 0.03)) this.blinkLeft = 2
  }

  step() {
    this.tick++
    this.stepWind()
    // The drift chance stays 7%; the wind only decides which way it goes more often.
    const leftShare = 0.5 - this.wind / 2
    for (const f of this.flakes) {
      f.y += f.v
      if (this.rnd() < 0.07) f.x += this.rnd() < leftShare ? -1 : 1
      const x = Math.round(f.x)
      if (x < 0 || x >= this.w) {
        Object.assign(f, this.spawn(false))
        continue
      }
      const stop = this.landAt(x)
      if (f.y >= stop) {
        this.land(x, stop)
        Object.assign(f, this.spawn(false))
      }
    }
    if (!this.hasClawd) return
    this.stepClawd()

    const avg = this.pile.reduce((a, b) => a + b, 0) / this.w
    if (!this.melt && avg > this.meltAt) this.melt = true
    if (this.melt) {
      let left = false
      for (let i = 0; i < this.w; i++) {
        this.pile[i] = Math.max(0, this.pile[i] - 0.006)
        if (this.pile[i] > 0) left = true
      }
      for (let i = 0; i < 9; i++) {
        this.head[i] = Math.max(0, this.head[i] - 0.006)
        if (this.head[i] > 0) left = true
      }
      if (!left) {
        this.melt = false
        this.meltAt = 0.25 + this.rnd() * 0.12
      }
    }
  }

  cells(): string {
    const { w, h } = this
    const buf = new Uint32Array(w * h * 3)
    for (let i = 0; i < w * h; i++) {
      buf[i * 3] = 0x20
      buf[i * 3 + 1] = DEFAULT
      buf[i * 3 + 2] = DEFAULT
    }
    const put = (x: number, y: number, cp: number, fg: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return
      const i = (y * w + x) * 3
      buf[i] = cp
      buf[i + 1] = fg
    }
    const text = (x: number, y: number, s: string, fg: number) => {
      let i = 0
      for (const ch of s) {
        if (ch !== ' ') put(x + i, y, ch.codePointAt(0)!, fg)
        i++
      }
    }
    // U+2581..U+2584 are the lower one- to four-eighths blocks: a pile at most half a row tall.
    const eighths = (frac: number) => Math.min(4, Math.round(frac * 8))

    for (const f of this.flakes) {
      const bright = f.k < 0.32
      put(Math.round(f.x), Math.floor(f.y), bright ? 0x2a : 0xb7, bright ? SNOW : SNOW_DIM)
    }
    if (this.hasClawd) {
      for (let x = 0; x < w; x++) {
        const n = eighths(this.pile[x])
        if (n > 0) put(x, this.ground, 0x2580 + n, PILE)
      }
      for (let d = 0; d < 9; d++) {
        const n = eighths(this.head[d])
        if (n > 0) put(this.cx + d, d === 0 || d === 8 ? this.top : this.top - 1, 0x2580 + n, PILE)
      }
      text(this.cx, this.top, this.blinkLeft > 0 ? BLINK : SPRITE[0], ICE)
      text(this.cx, this.top + 1, SPRITE[1], ICE)
      text(this.cx, this.top + 2, SPRITE[2], ICE)
    }
    return toBase64(new Uint8Array(buf.buffer))
  }
}

// The animation lives in module variables, so a hot reload restarts the snow.
let sim: Sim | null = null
let simScene: WinterScene | null = null
let simFor = ''
let timer: { cancel: () => void } | null = null
let runFor = ''

function stop() {
  timer?.cancel()
  timer = null
  runFor = ''
}

function frameFor($: EngineInterface, requestId: string, row: WinterRow, cols: number, rows: number): string {
  const { scene } = row
  if (!sim || simFor !== row.id || simScene !== scene) {
    sim = new Sim(cols, rows, scene, row.seed)
    simFor = row.id
    simScene = scene
  } else if (sim.w !== cols || sim.h !== rows) {
    sim.resize(cols, rows)
  }
  const current = sim
  const key = `${requestId}:${scene}:${cols}x${rows}`
  if (runFor !== key) {
    stop()
    runFor = key
    timer = $.clock.every(FRAME_MS, async () => {
      current.step()
      const r = await $.ui.blit({ requestId, key: 'snow', cells: current.cells(), columns: cols, rows })
      if (r && 'deny' in r && r.deny) stop()
    })
  }
  return current.cells()
}

// Laid-out height of each transcript site, keyed by component and id. A site scrolled off
// screen reports null and keeps its last height.
const heights = new Map<string, number>()
// The /clear line stays under the logo on the new screen, but it is drawn before anything
// a mod hears about the clear, so its height is booked by hand under this key until the
// line reports its own.
const CLEAR_LINE = 'clear-line'
const CLEAR_LINE_ROWS = 2
let lastViewportRows = 0
let mountedRows = 0
// A sent prompt's optimistic row, drawn under this id until the real row replaces it. The
// engine draws it a frame before any hook answers, so under the full-height snow row the
// screen scrolls for a moment on Enter, kept on purpose over a shorter row.
const PLACEHOLDER = 'placeholder'
let checkPending = false
// The band above the prompt may take what the bottom slot has left, and that slot is capped
// at half the terminal with the prompt block included, so half the rows less the band's
// maxRows is the bottom block's height, whatever the status line's.
// Right after startup the status line is not drawn yet and the block measures short, which
// made the snow overflow and scroll the logo away for half a second. So a session starts from
// the last settled value (kept in $.store), takes a taller reading at once (a shorter snow
// row is always safe) and a shorter one only once it has held for BOTTOM_SETTLE_MS.
let bottom = DEFAULT_BOTTOM_ROWS
let bottomSource: 'default' | 'stored' | 'measured' = 'default'
let bottomReading: number | null = null
let settleTimer: { cancel: () => void } | null = null
const BOTTOM_SETTLE_MS = 2000
const BOTTOM_KEY = 'bottomRows'

function bottomRows(): number {
  return bottom
}

function settleBottom($: EngineInterface) {
  settleTimer?.cancel()
  settleTimer = $.clock.after(BOTTOM_SETTLE_MS, async () => {
    settleTimer = null
    if (bottomReading === null) return
    if (bottomReading !== bottom) {
      bottom = bottomReading
      scheduleCheck($)
    }
    bottomSource = 'measured'
    await $.store.set(BOTTOM_KEY, bottom)
  })
}

function readBottom($: EngineInterface, reading: number) {
  bottomReading = reading
  if (reading > bottom) {
    bottom = reading
    scheduleCheck($)
  }
  settleBottom($)
}

// Rows between the logo and the bottom block that no site takes. A site's height already
// includes the blank line above it.
function freeRows(viewportRows: number): number {
  let used = HEADER_ROWS
  for (const size of heights.values()) used += size
  return viewportRows - used - bottomRows()
}

// The row shrinks for whatever else stands under the logo (the /clear line, an update notice
// that reports its height), so the logo never scrolls away.
function rowsFor(viewportRows: number): number {
  return Math.min(256, Math.max(MIN_START_ROWS, freeRows(viewportRows)))
}

// Render hooks may not redraw from inside a draw, so a changed height asks for one shortly after.
function scheduleCheck($: EngineInterface) {
  if (checkPending || mountedRows === 0) return
  checkPending = true
  $.clock.after(RESIZE_CHECK_MS, () => {
    checkPending = false
    if (mountedRows > 0 && rowsFor(lastViewportRows) !== mountedRows) $.ui.invalidate('ui.render')
  })
}

// `random` is settled in showRow from the clock, like the row's seed: the mod's own
// Math.random may run the same sequence every session.
function sceneFor(choice: Choice): WinterScene | 'random' | null {
  return choice === 'off' ? null : choice
}

function debugLines(): string[] {
  let sum = 0
  const sites = [...heights.entries()].map(([key, of]) => {
    sum += of
    return `  ${key} = ${of}`
  })
  return [
    `viewport rows ${lastViewportRows}, snow row drawn ${mountedRows} rows`,
    `header ${HEADER_ROWS} + sites ${sum} + bottom ${bottomRows()} (${bottomSource}, last reading ${bottomReading ?? 'none'}) -> free ${freeRows(lastViewportRows)}`,
    `${heights.size} sites:`,
    ...sites,
  ]
}

async function readChoice($: EngineInterface): Promise<Choice> {
  const v = await $.store.get('choice')
  return CHOICES.includes(v as Choice) ? (v as Choice) : 'random'
}

async function showRow($: EngineInterface, choice: WinterScene | 'random') {
  const now = Math.floor(await $.clock.now())
  const seed = now % 2147483647
  const scene: WinterScene = choice === 'random' ? (makeRng(seed ^ 0x9e3779b9)() < 0.5 ? 'snow' : 'scene') : choice
  const row: WinterRow = { id: `winter-${now.toString(36)}`, scene, seed }
  await update($, active, () => row)
  await $.ui.place({ id: row.id })
}

// session.start covers startup but also runs on every hot reload; classic.SessionStart is
// the one that sees /clear. A shown row or any message means the start screen is already
// past, so neither places a second row.
async function showOnStart($: EngineInterface) {
  if (await read($, active)) return
  try {
    if ((await $.session.messages()).length > 0) return
  } catch {
    // Throws while no session is bound yet, which only happens on a fresh screen.
  }
  const scene = sceneFor(await readChoice($))
  if (scene) await showRow($, scene)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'winter',
      description: 'Let it snow on the start screen (snow, scene, random, off)',
      argumentHint: 'snow | scene | random | off | debug',
    })
    const stored = await $.store.get(BOTTOM_KEY)
    if (bottomSource === 'default' && typeof stored === 'number' && stored > 0) {
      bottom = stored
      bottomSource = 'stored'
    }
    if (e.isInteractive) await showOnStart($)
    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    // After /clear the transcript still holds the /clear command's own row, so the
    // message check would always skip; and a row placed before the clear settles is
    // wiped with the old transcript. Place it shortly after, guarded by `active` alone.
    if (e.source === 'clear') {
      // Only now are the old transcript's sites gone; resetting earlier kept rows they
      // reported while being cleared (the snow came out four rows short).
      heights.clear()
      heights.set(CLEAR_LINE, CLEAR_LINE_ROWS)
      $.clock.after(300, async () => {
        if (await read($, active)) return
        const scene = sceneFor(await readChoice($))
        if (scene) await showRow($, scene)
      })
    }
    return next(e)
  })

  on('command.run', { command: 'winter' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'debug') {
      // Transcript notices, not command output: the model would otherwise read it and
      // answer it. One call per line: a log row draws a newline as a garbage glyph.
      for (const line of ['debug', ...debugLines()]) $.ui.log(line)
      return {}
    }
    if (arg !== '' && !CHOICES.includes(arg as Choice)) return { text: USAGE }
    if (arg !== '') await $.store.set('choice', arg)
    const scene = sceneFor(arg === '' ? await readChoice($) : (arg as Choice))
    if (!scene) {
      await update($, active, () => null)
      $.ui.toast('Winter: off')
      return {}
    }
    // Only the start screen snows; mid-conversation the choice waits for the next one.
    if (await read($, active)) {
      await showRow($, scene)
      if (arg !== '') $.ui.toast(`Winter: ${arg}`)
    } else {
      $.ui.toast(`Winter: ${arg || 'saved'} (from the next start screen)`)
    }
    return {}
  })

  // Anything entered ends the start screen, since its row would land under the snow; /clear
  // then makes a new one and /winter swaps it itself. A chat message passes prompt.submit;
  // a slash command typed at the prompt may not, so commands are caught at command.run.
  on('prompt.submit', async ($, e, next) => {
    if (!e.command && (await read($, active))) await update($, active, () => null)
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== 'winter' && (await read($, active))) await update($, active, () => null)
    return next(e)
  })

  for (const component of MEASURED) {
    on('ui.render', { component }, async ($, e, next) => {
      const drawn = await next(e)
      const placedByUs = e.component === 'Placed' && e.props.plugin === 'winter-clawd'
      const of = e.props.onScreen?.of
      // The optimistic copy of a just-sent prompt is replaced by the real row; counting both
      // would double the prompt.
      if (!placedByUs && e.requestId !== PLACEHOLDER && typeof of === 'number') {
        if (e.component === 'UserMessage') heights.delete(CLEAR_LINE)
        heights.set(`${e.component}:${e.requestId}`, of)
        scheduleCheck($)
      }
      return drawn
    })
  }

  // Draws nothing of its own: only reads the band's room to size the bottom block.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rows = e.viewport?.rows
    if (rows && e.viewport?.isFullscreen === true) {
      const reading = Math.floor(rows / 2) - e.props.maxRows
      if (reading > 0 && reading !== bottomReading) readBottom($, reading)
    }
    return next(e)
  })

  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    if (e.props.plugin !== 'winter-clawd') return next(e)
    const row = await read($, active)
    if (!row || row.id !== e.props.id || e.surface !== 'terminal') {
      if (!row) {
        stop()
        mountedRows = 0
      }
      return next(e)
    }
    lastViewportRows = e.viewport?.rows ?? 40
    const cols = Math.min(512, Math.max(20, (e.viewport?.columns ?? 100) - 2))
    const rows = rowsFor(lastViewportRows)
    mountedRows = rows
    const cells = frameFor($, e.requestId, row, cols, rows)
    const { Raster } = $.ui.resolve(e)
    return <Raster key="snow" columns={cols} rows={rows} cells={cells} />
  })
}
