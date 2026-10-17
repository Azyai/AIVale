/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import '../../token-flow.css'

/* ============================================================
   一枚 Token 的旅程 —— Token 流转剧场
   Ported from the standalone deck presentation/index3.html (S4).
   Static SVG (nodes / wires / icons) is declared as JSX; particles
   are still created imperatively and animated along the wire paths
   with requestAnimationFrame, exactly like the original engine.
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg'

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

type ScnId = 'standard' | 'failover'
type NodeId =
  | 'client'
  | 'gateway'
  | 'router'
  | 'chA'
  | 'chB'
  | 'chC'
  | 'bill'
  | 'data'
type NodeState = 'idle' | 'on' | 'ok' | 'err'
type FlowColor = 'v' | 'c' | 'a'
type LogTag =
  | 'REQ'
  | 'AUTH'
  | 'ROUTE'
  | 'INFER'
  | 'BILL'
  | 'DATA'
  | 'WARN'
  | 'DONE'
  | 'SYS'

interface NodeDef {
  id: NodeId
  x: number
  y: number
  w: number
  h: number
  kind: 'main' | 'ch' | 'bar'
  icon: IconName
  title: string
  sub: string
}

interface PathDef {
  id: string
  d: string
  c: FlowColor
  label?: { text: string; x: number; y: number }
}

interface Particle {
  el: SVGCircleElement
  delay: number
  dur: number
  t0: number
}

interface FlowRun {
  parts: Particle[]
  path: SVGPathElement
  len: number
  res: () => void
}

interface FlowOpts {
  count?: number
  dur?: number
  gap?: number
  color?: FlowColor
  r?: number
}

interface LogLine {
  id: number
  tm: string
  tag: LogTag
  msg: string
}

type IconName = 'client' | 'shield' | 'route' | 'chip' | 'coin' | 'bars'

/* Node icons — same geometry as the deck's ICONS map. */
const ICONS: Record<IconName, ReactElement> = {
  client: (
    <>
      <rect x={3} y={4} width={18} height={12} rx={2.2} />
      <path d='M9 20h6M12 16v4' />
    </>
  ),
  shield: (
    <>
      <path d='M12 3l7 2.8v5.1c0 4.4-2.9 7.4-7 9.1-4.1-1.7-7-4.7-7-9.1V5.8z' />
      <path d='M9.2 12.1l2 2 3.6-4.2' />
    </>
  ),
  route: (
    <>
      <circle cx={5} cy={12} r={2.1} />
      <circle cx={19} cy={5.5} r={2.1} />
      <circle cx={19} cy={12} r={2.1} />
      <circle cx={19} cy={18.5} r={2.1} />
      <path d='M6.9 11L17 6.4M7 12h10M6.9 13L17 17.6' />
    </>
  ),
  chip: (
    <>
      <rect x={6.5} y={6.5} width={11} height={11} rx={2} />
      <path d='M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21' />
    </>
  ),
  coin: (
    <>
      <circle cx={12} cy={12} r={8.6} />
      <path d='M8.6 7.6L12 11.6l3.4-4M12 11.6V17M9.4 13.2h5.2M9.4 15.6h5.2' />
    </>
  ),
  bars: <path d='M4.5 19.5h15M7 19.5v-7M12 19.5V6M17 19.5v-9.5' />,
}

/* Node cards — coordinates verbatim from the deck. */
const NODES: NodeDef[] = [
  { id: 'client', x: 120, y: 180, w: 188, h: 78, kind: 'main', icon: 'client', title: '终端应用', sub: '对话 / 代码 / Agent' },
  { id: 'gateway', x: 352, y: 180, w: 188, h: 78, kind: 'main', icon: 'shield', title: '统一网关', sub: '鉴权 · 限流 · 协议' },
  { id: 'router', x: 584, y: 180, w: 188, h: 78, kind: 'main', icon: 'route', title: '智能调度', sub: '负载均衡 · 熔断切换' },
  { id: 'chA', x: 812, y: 96, w: 200, h: 64, kind: 'ch', icon: 'chip', title: 'CH-01 · 千问 125B', sub: '主力对话 · 权重 40%' },
  { id: 'chB', x: 812, y: 180, w: 200, h: 64, kind: 'ch', icon: 'chip', title: 'CH-02 · Qwen3.8-Flash', sub: '轻量高速 · 权重 35%' },
  { id: 'chC', x: 812, y: 264, w: 200, h: 64, kind: 'ch', icon: 'chip', title: 'CH-03 · MiniMax H3', sub: '文生图 · 权重 25%' },
  { id: 'bill', x: 1012, y: 180, w: 176, h: 78, kind: 'main', icon: 'coin', title: '计量计费', sub: '计量·扣费·账单' },
  { id: 'data', x: 600, y: 344, w: 560, h: 64, kind: 'bar', icon: 'bars', title: '数据洞察', sub: '数据看板 · 排行榜 · 对账 · 订阅账单' },
]

/* Wires — d values verbatim from the deck. */
const PATHS: PathDef[] = [
  { id: 'p1', d: 'M 214 180 H 257', c: 'v' },
  { id: 'p2', d: 'M 446 180 H 489', c: 'v' },
  { id: 'p3a', d: 'M 678 180 C 698 180 694 96 712 96', c: 'v' },
  { id: 'p3b', d: 'M 678 180 H 712', c: 'v' },
  { id: 'p3c', d: 'M 678 180 C 698 180 694 264 712 264', c: 'v' },
  { id: 'p4a', d: 'M 912 96 C 934 96 902 180 924 180', c: 'a' },
  { id: 'p4b', d: 'M 912 180 H 924', c: 'a' },
  { id: 'p4c', d: 'M 912 264 C 934 264 902 180 924 180', c: 'a' },
  { id: 'pArc', d: 'M 907 102 C 700 -28 340 -28 122 140', c: 'c', label: { text: '流式响应 · 回到应用', x: 505, y: 26 } },
  { id: 'p5', d: 'M 1012 219 C 1012 288 946 344 884 344', c: 'a', label: { text: '异步落账', x: 1016, y: 288 } },
]

/* The demo plays these two scripts back to back, forever, once the section
 * scrolls into view: a clean standard call, then a failover call. */
const LOOP: ScnId[] = ['standard', 'failover']

/* Requester badge under the client node. id / color are technical strings;
 * only the name is a translation key. */
const BADGE = { id: 'u-1024', name: '个人', color: '#a78bfa' }

const INIT_NODES: Record<NodeId, NodeState> = {
  client: 'idle',
  gateway: 'idle',
  router: 'idle',
  chA: 'idle',
  chB: 'idle',
  chC: 'idle',
  bill: 'idle',
  data: 'idle',
}

function fmtNum(v: number, dec: number) {
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

export function TokenFlowTheater() {
  const { t } = useTranslation()

  /* ---------- React state ---------- */
  const [nodeState, setNodeState] = useState<Record<NodeId, NodeState>>(INIT_NODES)
  const [flowOn, setFlowOn] = useState<Record<string, boolean>>({})
  const [lines, setLines] = useState<LogLine[]>([])
  const [hot, setHot] = useState<{ lat: boolean }>({ lat: false })

  /* ---------- DOM refs ---------- */
  const rootRef = useRef<HTMLElement>(null)
  const gPartsRef = useRef<SVGGElement>(null)
  const termBodyRef = useRef<HTMLDivElement>(null)
  const stTokRef = useRef<HTMLDivElement>(null)
  const stWalRef = useRef<HTMLDivElement>(null)
  const stLatRef = useRef<HTMLDivElement>(null)
  const pathEls = useRef<Map<string, SVGPathElement>>(new Map())

  /* ---------- Engine bookkeeping (imperative) ---------- */
  const flows = useRef<FlowRun[]>([])
  const raf = useRef<number | null>(null)
  const tweenRafs = useRef<Map<HTMLDivElement, number>>(new Map())
  const w0 = useRef(0)
  const runT0 = useRef(0)
  const running = useRef(false)
  const logSeq = useRef(0)
  const mounted = useRef(true)
  const ctx = useRef({
    aborted: false,
    waiters: new Set<() => void>(),
    timeouts: new Set<number>(),
  })

  /* ---------- Particle engine ---------- */
  const tick = (now: number) => {
    const c = ctx.current
    if (c.aborted) {
      for (const f of flows.current) f.res()
      flows.current = []
      raf.current = null
      return
    }
    let alive = false
    flows.current = flows.current.filter((f) => {
      let done = 0
      for (const p of f.parts) {
        const t = (now - p.t0 - p.delay) / p.dur
        if (t >= 1) {
          p.el.remove()
          done++
          continue
        }
        if (t < 0) {
          alive = true
          continue
        }
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const pt = f.path.getPointAtLength(e * f.len)
        p.el.setAttribute('cx', `${pt.x}`)
        p.el.setAttribute('cy', `${pt.y}`)
        p.el.setAttribute('opacity', `${Math.min(1, t * 5, (1 - t) * 5 + 0.3)}`)
        alive = true
      }
      if (done === f.parts.length) {
        f.res()
        return false
      }
      return true
    })
    if (alive) raf.current = requestAnimationFrame(tick)
    else raf.current = null
  }

  const flow = (pid: string, o: FlowOpts = {}) =>
    new Promise<void>((resolve) => {
      const base = pathEls.current.get(pid)
      const host = gPartsRef.current
      if (!base || !host || ctx.current.aborted) {
        resolve()
        return
      }
      const { count = 5, dur = 760, gap = 110, color = 'v', r = 3.5 } = o
      setFlowOn((prev) => ({ ...prev, [pid]: true }))
      const len = base.getTotalLength()
      const parts: Particle[] = []
      const n = REDUCED ? Math.min(3, count) : count
      for (let i = 0; i < n; i++) {
        const c = document.createElementNS(NS, 'circle')
        c.setAttribute('r', `${r}`)
        c.setAttribute('class', `pt pt-${color}`)
        c.setAttribute('opacity', '0')
        host.appendChild(c)
        parts.push({ el: c, delay: i * gap, dur, t0: performance.now() })
      }
      flows.current.push({ parts, path: base, len, res: resolve })
      if (raf.current == null) raf.current = requestAnimationFrame(tick)
    })

  /* ---------- Log / node state / stat tween ---------- */
  const log = (tag: LogTag, msg: string) => {
    if (!mounted.current) return
    const dt = new Date(w0.current + (performance.now() - runT0.current))
    const pad = (n: number, l = 2) => String(n).padStart(l, '0')
    const tm = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}.${pad(dt.getMilliseconds(), 3)}`
    setLines((prev) => {
      const next = [...prev, { id: logSeq.current++, tm, tag, msg }]
      if (next.length > 60) next.shift()
      return next
    })
  }

  const active = (id: NodeId) => {
    if (!mounted.current) return
    setNodeState((prev) => {
      const next = { ...prev }
      for (const n of NODES) {
        if (next[n.id] === 'on') next[n.id] = 'ok'
      }
      next[id] = 'on'
      return next
    })
  }

  const markErr = (id: NodeId) => {
    if (!mounted.current) return
    setNodeState((prev) => ({ ...prev, [id]: 'err' }))
  }

  const tween = (
    el: HTMLDivElement | null,
    from: number,
    to: number,
    dur: number,
    fmt: (v: number) => string
  ) => {
    if (!el) return
    const prev = tweenRafs.current.get(el)
    if (prev != null) cancelAnimationFrame(prev)
    const t0 = performance.now()
    const step = (n: number) => {
      if (ctx.current.aborted) {
        tweenRafs.current.delete(el)
        return
      }
      const p = Math.min(1, (n - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      el.textContent = fmt(from + (to - from) * e)
      if (p < 1) tweenRafs.current.set(el, requestAnimationFrame(step))
      else tweenRafs.current.delete(el)
    }
    tweenRafs.current.set(el, requestAnimationFrame(step))
  }

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const c = ctx.current
      if (c.aborted) {
        resolve()
        return
      }
      let fin: () => void = () => {}
      const id = window.setTimeout(() => {
        c.waiters.delete(fin)
        resolve()
      }, ms)
      fin = () => {
        window.clearTimeout(id)
        resolve()
      }
      c.waiters.add(fin)
    })

  /* ---------- Reset ---------- */
  const resetAll = () => {
    setNodeState(INIT_NODES)
    setFlowOn({})
    setLines([])
    setHot({ lat: false })
    for (const f of flows.current) f.res()
    flows.current = []
    if (raf.current != null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
    gPartsRef.current?.replaceChildren()
    for (const id of tweenRafs.current.values()) cancelAnimationFrame(id)
    tweenRafs.current.clear()
    if (stTokRef.current) stTokRef.current.textContent = '0'
    if (stWalRef.current) stWalRef.current.textContent = '¥ 1,250.00'
    if (stLatRef.current) stLatRef.current.textContent = '0 ms'
  }

  /* ---------- Scenario scripts (verbatim from the deck) ---------- */
  const SCN: Record<ScnId, () => Promise<void>> = {
    async standard() {
      log('REQ', 'POST /v1/chat/completions · model=qwen-125b · stream=true')
      active('client')
      await wait(420)
      await flow('p1', { color: 'v' })
      active('gateway')
      log('AUTH', 'API Key 校验通过 · 用户 u-1024 · 分组「默认」')
      await wait(320)
      log('AUTH', '额度校验通过 · 余额 ¥1,250.00 · 限流 60 RPM')
      await wait(260)
      await flow('p2', { color: 'v' })
      active('router')
      log('ROUTE', '渠道画像刷新 · 3 个健康渠道 · 权重 × 实时负载评分')
      await wait(280)
      await flow('p3a', { color: 'v' })
      active('chA')
      log('ROUTE', '命中 CH-01 千问 125B · 评分 92 · 建立流式连接')
      await wait(300)
      log('INFER', '首字节返回 314ms · 开始流式输出')
      const arc = flow('pArc', { color: 'c', count: 7, dur: 1500, gap: 150 })
      await wait(650)
      log('INFER', '生成完毕 · prompt 356 tok + completion 1,486 tok')
      await arc
      await flow('p4a', { color: 'a', count: 4, dur: 640 })
      active('bill')
      log('BILL', '计量 1,842 tok × ¥1.25/K ≈ ¥2.30 · 钱包扣减')
      tween(stTokRef.current, 0, 1842, 1200, (v) => fmtNum(Math.round(v), 0))
      tween(stWalRef.current, 1250, 1247.7, 1100, (v) => `¥ ${fmtNum(v, 2)}`)
      tween(stLatRef.current, 0, 1140, 1200, (v) => `${Math.round(v)} ms`)
      await wait(520)
      await flow('p5', { color: 'a', count: 3, dur: 900 })
      active('data')
      log('DATA', '用量明细落库 · 更新团队/模型排行 · 对账流水 +1')
      await wait(260)
      log('DONE', '端到端 1,140ms · 本次请求闭环')
    },
    async failover() {
      log('REQ', 'POST /v1/chat/completions · model=qwen-125b')
      active('client')
      await wait(400)
      await flow('p1', { color: 'v' })
      active('gateway')
      log('AUTH', 'API Key 校验通过 · 额度校验通过')
      await wait(300)
      await flow('p2', { color: 'v' })
      active('router')
      log('ROUTE', '命中 CH-01 千问 125B · 评分 89')
      await wait(240)
      await flow('p3a', { color: 'v' })
      active('chA')
      await wait(420)
      log('WARN', 'CH-01 健康探测超时 · 上游 5xx ×2 · 触发熔断')
      markErr('chA')
      await wait(560)
      log('ROUTE', '故障自动切换 → CH-02 Qwen3.8-Flash · 对业务无感')
      await flow('p3b', { color: 'v' })
      active('chB')
      log('ROUTE', '命中 CH-02 · 评分 95 · 无感重试')
      await wait(280)
      log('INFER', '首字节返回 260ms · 流式输出')
      const arc = flow('pArc', { color: 'c', count: 7, dur: 1400, gap: 140 })
      await wait(600)
      log('INFER', '生成完毕 · 1,842 tok')
      await arc
      await flow('p4b', { color: 'a', count: 4, dur: 640 })
      active('bill')
      log('BILL', '计量 1,842 tok · 扣减 ¥2.30 · 渠道成本记录 CH-02')
      if (mounted.current) setHot((h) => ({ ...h, lat: true }))
      tween(stTokRef.current, 0, 1842, 1200, (v) => fmtNum(Math.round(v), 0))
      tween(stWalRef.current, 1250, 1247.7, 1100, (v) => `¥ ${fmtNum(v, 2)}`)
      tween(stLatRef.current, 0, 1320, 1200, (v) => `${Math.round(v)} ms`)
      await wait(520)
      await flow('p5', { color: 'a', count: 3, dur: 900 })
      active('data')
      log('DATA', '渠道可用性更新 · 告警通知运维 · 复盘样本 +1')
      await wait(260)
      log('DONE', '端到端 1,320ms · 含 1 次无感切换')
    },
  }

  /* ---------- Run control ---------- */
  const SESSION_LABEL: Record<ScnId, string> = {
    standard: t('标准调用'),
    failover: t('故障切换'),
  }
  const sessionNo = useRef(0)

  /* Each run owns its terminal session: the log is cleared and reopened with
   * a divider line, so consecutive plays never read as one continuous run. */
  const run = async (sc: ScnId) => {
    if (running.current) return
    running.current = true
    w0.current = Date.now()
    runT0.current = performance.now()
    resetAll()
    sessionNo.current += 1
    log('SYS', `── 第 ${sessionNo.current} 次请求 · ${SESSION_LABEL[sc]} ──`)
    try {
      await SCN[sc]()
    } finally {
      running.current = false
    }
  }

  const runRef = useRef(run)
  runRef.current = run
  const waitRef = useRef(wait)
  waitRef.current = wait

  /* Endless demo once the section scrolls into view: a clean standard call,
   * then a failover call, holding each finished frame before the next. */
  useEffect(() => {
    const el = rootRef.current
    if (!el || REDUCED) return
    let cancelled = false
    let startTimer: number | undefined
    const loop = async () => {
      for (let i = 0; !cancelled; i++) {
        await runRef.current(LOOP[i % LOOP.length])
        if (cancelled) return
        await waitRef.current(3500)
      }
    }
    let started = false
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started) {
          started = true
          startTimer = window.setTimeout(() => {
            void loop()
          }, 700)
        }
      },
      { threshold: 0.15 }
    )
    io.observe(el)
    return () => {
      cancelled = true
      io.disconnect()
      if (startTimer != null) window.clearTimeout(startTimer)
    }
  }, [])

  /* Full teardown: resolve pending waits/flows, stop rAF loops.
   * Reading/writing refs inside the cleanup is intentional: the flows array
   * and the timer registries are live registries mutated by the engine, so
   * the cleanup must observe whatever is pending at unmount time. */
  /* eslint-disable react-hooks/exhaustive-deps -- live registries, see note above */
  useEffect(() => {
    mounted.current = true
    ctx.current.aborted = false
    return () => {
      mounted.current = false
      const c = ctx.current
      c.aborted = true
      for (const w of c.waiters) w()
      c.waiters.clear()
      for (const id of c.timeouts) window.clearTimeout(id)
      c.timeouts.clear()
      for (const f of flows.current) f.res()
      flows.current = []
      if (raf.current != null) {
        cancelAnimationFrame(raf.current)
        raf.current = null
      }
      for (const id of tweenRafs.current.values()) cancelAnimationFrame(id)
      tweenRafs.current.clear()
      gPartsRef.current?.replaceChildren()
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  /* Keep the terminal pinned to the latest line. */
  useEffect(() => {
    const el = termBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const pathRef = (id: string) => (el: SVGPathElement | null): void => {
    if (el) pathEls.current.set(id, el)
    else pathEls.current.delete(id)
  }

  return (
    <section ref={rootRef} className='tf tf-stage-font px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <div className='mb-8 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('一枚 Token 的旅程')}
          </h2>
        </div>

        <div className='flow-grid'>
          <div>
            <div className='stage-wrap'>
              <svg
                className='stage'
                viewBox='0 0 1180 420'
                role='img'
                aria-label={t('一枚 Token 的旅程')}
              >
                {/* base wires + static labels */}
                <g>
                  {PATHS.map((p) => (
                    <path key={p.id} d={p.d} className='wire' ref={pathRef(p.id)} />
                  ))}
                  {PATHS.map((p) =>
                    p.label ? (
                      <text
                        key={`lb-${p.id}`}
                        x={p.label.x}
                        y={p.label.y}
                        className='plabel'
                        textAnchor='middle'
                      >
                        {t(p.label.text)}
                      </text>
                    ) : null
                  )}
                </g>
                {/* flow overlays */}
                <g>
                  {PATHS.map((p) => (
                    <path
                      key={p.id}
                      d={p.d}
                      className={flowOn[p.id] ? `flowline fl-${p.c} on` : `flowline fl-${p.c}`}
                    />
                  ))}
                </g>
                {/* nodes + requester badge */}
                <g>
                  {NODES.map((n) => {
                    const st = nodeState[n.id]
                    return (
                      <g
                        key={n.id}
                        className={st === 'idle' ? 'node' : `node ${st}`}
                        transform={`translate(${n.x},${n.y})`}
                      >
                        {/* Inner group carries the error shake: a CSS transform
                            on the outer <g> would replace its translate(x,y)
                            attribute and fling the node to the SVG origin. */}
                        <g className='node-shake'>
                          <rect
                            x={-n.w / 2}
                            y={-n.h / 2}
                            width={n.w}
                            height={n.h}
                            rx={n.kind === 'ch' ? 14 : 16}
                            className='box'
                          />
                          {n.kind === 'ch' ? (
                            <>
                              <circle cx={-n.w / 2 + 18} cy={0} r={3.5} className='chdot' />
                              <text x={-n.w / 2 + 34} y={-5} className='ttl ch-ttl'>
                                {n.title}
                              </text>
                              <text x={-n.w / 2 + 34} y={16} className='sub ch-sub'>
                                {t(n.sub)}
                              </text>
                            </>
                          ) : (
                            <>
                              <circle cx={-n.w / 2 + 36} cy={0} r={21} />
                              <g className='ic' transform={`translate(${-n.w / 2 + 24},-12)`}>
                                {ICONS[n.icon]}
                              </g>
                              <text x={-n.w / 2 + 66} y={-4} className='ttl'>
                                {t(n.title)}
                              </text>
                              <text x={-n.w / 2 + 66} y={16} className='sub'>
                                {t(n.sub)}
                              </text>
                            </>
                          )}
                        </g>
                      </g>
                    )
                  })}
                  <text
                    x={120}
                    y={252}
                    className='reqbadge'
                    textAnchor='middle'
                    fill={BADGE.color}
                  >
                    {`${BADGE.id} · ${t(BADGE.name)}`}
                  </text>
                </g>
                {/* particles (imperative) */}
                <g ref={gPartsRef} />
              </svg>
            </div>
            <div className='legend'>
              <span>
                <i className='lv' />
                {t('请求流')}
              </span>
              <span>
                <i className='lc' />
                {t('响应流')}
              </span>
              <span>
                <i className='la' />
                {t('计费流')}
              </span>
            </div>
          </div>

          <aside className='flow-side'>
            <div className='stats'>
              <div className='stat'>
                <div className='sv' ref={stTokRef}>
                  0
                </div>
                <div className='sl'>{t('本次消耗 TOKENS')}</div>
              </div>
              <div className='stat'>
                <div className='sv' ref={stWalRef}>
                  ¥ 1,250.00
                </div>
                <div className='sl'>{t('钱包余额')}</div>
              </div>
              <div className={hot.lat ? 'stat hot-a' : 'stat'}>
                <div className='sv' ref={stLatRef}>
                  0 ms
                </div>
                <div className='sl'>{t('端到端耗时')}</div>
              </div>
            </div>
            <div className='term'>
              <div className='term-hd'>
                <span className='led' />
                {`runtime.log · ${t('请求链路追踪')}`}
              </div>
              <div className='term-bd' ref={termBodyRef}>
                {lines.map((l) => (
                  <div className='ln' key={l.id}>
                    <span className='tm'>{l.tm}</span>
                    <span className={`tg tg-${l.tag}`}>{l.tag}</span>
                    <span className='tx'>{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
