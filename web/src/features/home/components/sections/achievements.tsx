/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied WARRANTY of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

/* 指标卡 — 进入视口时数字滚动(与汇报页同款 cubic ease)。 */
const METRICS = [
  { to: 30, suffix: '+', label: '接入模型', dec: 0 },
  { to: 3, suffix: ' 类', label: '模型品类 · 对话/推理/图像', dec: 0 },
  { to: 99.9, suffix: ' %', label: '服务可用性', dec: 1 },
  { to: 100, suffix: ' %', label: '对账通过率', dec: 0 },
] as const

/* 已上线能力清单 — 与平台实际交付一致。 */
const SHIPPED = [
  { big: '支持多种第三方登录', small: '飞书扫码 · SSO' },
  { big: '额度用量管理', small: '按人限额 · 团队钱包' },
  { big: '模型广场', small: '模型对比 · 千问式体验' },
  { big: '排行榜', small: '团队榜 · 模型榜' },
  { big: '账单对账', small: '流水级核对' },
  { big: '数据看板', small: '实时监控 · KPI 总览' },
] as const

function fmtNum(v: number, dec: number) {
  return v.toLocaleString('zh-CN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
}

function MetricValue({
  to,
  suffix,
  dec,
}: {
  to: number
  suffix: string
  dec: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setVal(to)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !started.current) {
          started.current = true
          io.unobserve(el)
          const t0 = performance.now()
          const dur = 1400
          const step = (n: number) => {
            const p = Math.min(1, (n - t0) / dur)
            const e = 1 - Math.pow(1 - p, 3)
            setVal(to * e)
            if (p < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }
      },
      { threshold: 0.5 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [to])

  return (
    <span ref={ref} className='font-mono text-[clamp(1.9rem,3.4vw,3.2rem)] leading-none font-bold whitespace-nowrap'>
      {fmtNum(val, dec)}
      {suffix}
    </span>
  )
}

/** 建设成果:数字指标 + 已上线能力清单。 */
export function Achievements() {
  const { t } = useTranslation()

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('建设成果 · 基座已经跑起来')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 w-[90%] text-base leading-relaxed md:text-lg'>
            {t('以下能力全部上线，支撑真实业务运行。')}
          </p>
        </AnimateInView>

        <AnimateInView className='grid grid-cols-2 gap-4 md:grid-cols-4'>
          {METRICS.map((m) => (
            <div
              key={m.label}
              className='border-border/60 bg-card/50 metric-grad hover:border-violet-400/50 rounded-3xl border p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_34px_rgba(60,40,180,0.28)]'
            >
              <div className='text-foreground'>
                <MetricValue to={m.to} suffix={t(m.suffix)} dec={m.dec} />
              </div>
              <div className='text-muted-foreground mt-3 text-[15px] tracking-wide'>
                {t(m.label)}
              </div>
            </div>
          ))}
        </AnimateInView>

        <AnimateInView delay={120} className='mt-12'>
          <div className='text-muted-foreground/70 mb-4 text-center text-[13px] font-semibold tracking-[0.3em]'>
            {t('已 上 线 能 力 清 单')}
          </div>
          <div className='grid grid-cols-1 gap-3.5 md:grid-cols-2'>
            {SHIPPED.map((s) => (
              <div
                key={s.big}
                className='border-border/60 bg-card/40 flex items-start gap-3.5 rounded-2xl border p-5 transition-all duration-300 hover:translate-x-1 hover:border-violet-400/40 hover:bg-primary/[0.06]'
              >
                <Check className='mt-0.5 size-5 shrink-0 stroke-[2.2] text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]' />
                <b className='text-foreground flex-none text-[17px] font-semibold'>
                  {t(s.big)}
                </b>
                <span className='text-muted-foreground ml-1 text-[15px]'>
                  {t(s.small)}
                </span>
              </div>
            ))}
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
