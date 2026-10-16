/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  Building2,
  Headset,
  Lock,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// Model chips shown in the 全模态 panel visual (representative model names
// routed by the gateway).
// Latest-generation models per provider (per models.dev listing).
const MODEL_CHIPS = [
  'qwen3.8-max-prime',
  'glm-5.3',
  'deepseek-v4.1-flash',
  'kimi-k2.8-preview',
  'gpt-6.1',
  'claude-opus-5.5',
  'claude-fabre',
  'gemini-3.8-flash',
  'grok-4.7',
  'minimax-h3',
  'seedance-2.5',
  'nano-banana-2.1',
  'mimo-v2.6-pro',
] as const

function ModelChipsBoard() {
  const { t } = useTranslation()
  return (
    <div className='border-border/60 bg-card/80 flex h-full w-full flex-col justify-center rounded-2xl border p-5 shadow-sm backdrop-blur-sm md:p-6'>
      <div className='flex flex-wrap gap-2'>
        {MODEL_CHIPS.map((m) => (
          <span
            key={m}
            className='border-border/60 bg-muted/50 rounded-full border px-3 py-1 font-mono text-xs font-medium'
          >
            {m}
          </span>
        ))}
      </div>
      <div className='bg-muted/60 mt-4 rounded-xl p-3.5 font-mono text-[11px] leading-normal'>
        <div className='text-muted-foreground/70'>
          <span className='text-emerald-500'>POST</span>{' '}
          /v1/chat/completions
        </div>
        <div className='mt-1.5'>
          -H <span className='text-blue-500'>"Authorization: Bearer sk-••••"</span>
        </div>
        <div className='mt-1.5'>
          -d{' '}
          <span className='text-violet-500'>
            '&#123; "model": "qwen3.8-max", "messages": [...] &#125;'
          </span>
        </div>
        <div className='text-emerald-600 dark:text-emerald-400 mt-1.5'>
          ✓ 200 OK · {t('全模态统一接口')}
        </div>
      </div>
    </div>
  )
}

function TrustBoard() {
  const { t } = useTranslation()
  const items = [
    { icon: Building2, big: t('国资背景'), small: t('京西智库产业生态底座') },
    { icon: Lock, big: t('私有化部署'), small: t('数据不出企业内网') },
    { icon: Headset, big: t('本地团队'), small: t('原厂技术支持护航') },
    { icon: ShieldCheck, big: t('SLA 99.9%'), small: t('全天候运维值守') },
  ]
  return (
    <div className='border-border/60 bg-card/80 grid h-full w-full grid-cols-1 gap-3 rounded-2xl border p-6 shadow-sm backdrop-blur-sm sm:grid-cols-2 sm:grid-rows-2 md:p-7'>
      {items.map((item) => (
        <div
          key={item.big}
          className='bg-muted/40 flex flex-col items-start justify-center gap-2.5 rounded-xl p-5'
        >
          <div className='bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl'>
            <item.icon className='size-5.5' />
          </div>
          <div className='min-w-0'>
            <div className='truncate text-base font-semibold'>
              {item.big}
            </div>
            <div className='text-muted-foreground mt-0.5 truncate text-[13px]'>
              {item.small}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function BudgetBoard() {
  const { t } = useTranslation()
  return (
    <div className='border-border/60 bg-card/80 flex h-full w-full flex-col justify-center rounded-2xl border p-6 shadow-sm backdrop-blur-sm md:p-7'>
      <div className='flex items-baseline justify-between'>
        <span className='text-[15px] font-medium'>{t('本月用量')}</span>
        <span className='text-muted-foreground text-[15px]'>
          ¥128.4 <span className='text-xs'>/ ¥200.0</span>
        </span>
      </div>
      <Progress value={62} className='mt-3.5 h-2.5' />
      <div className='mt-6 grid flex-1 grid-cols-3 gap-3 text-center'>
        <div className='bg-muted/40 flex flex-col items-center justify-center rounded-xl px-2 py-4'>
          <div className='text-base font-semibold'>{t('月付')}</div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {t('基准单价')}
          </div>
        </div>
        <div className='bg-primary/8 flex flex-col items-center justify-center rounded-xl px-2 py-4'>
          <div className='text-primary text-base font-semibold'>
            {t('季付')}
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {t('更优单价')}
          </div>
        </div>
        <div className='bg-primary/10 flex flex-col items-center justify-center rounded-xl px-2 py-4'>
          <div className='text-primary text-base font-semibold'>
            {t('年付')}
          </div>
          <div className='text-muted-foreground mt-1 text-xs'>
            {t('最优惠')}
          </div>
        </div>
      </div>
      <div className='text-muted-foreground/70 mt-5 flex items-center gap-1.5 text-[13px]'>
        <TrendingDown className='size-4' />
        {t('实时用量监控，预算不超支')}
      </div>
    </div>
  )
}

/**
 * Qianwen-style interactive showcase: three selectable items stacked on the
 * left (click one to expand its description below it) with the matching
 * visual on the right. Auto-rotates until the visitor interacts.
 */
export function SellingPoints() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true)

  useEffect(() => {
    if (!autoPlay) return
    const id = setInterval(() => {
      setActive((a) => (a + 1) % 3)
    }, 5000)
    return () => clearInterval(id)
  }, [autoPlay])

  const items = [
    {
      title: t('全模态一站式体验'),
      description: t(
        '一个 API Key，解锁无限可能。支持国内外主流模型，在统一订阅体系下无缝调用文本、语音、图像等全模态 AI 能力。'
      ),
      tint: 'from-blue-500/10 via-blue-500/5 to-transparent',
      visual: <ModelChipsBoard />,
    },
    {
      title: t('国企背书，安全可靠'),
      description: t(
        '京西智库国资背景平台，企业级数据安全与合规保障；支持私有化部署，本地技术团队全程护航。'
      ),
      tint: 'from-violet-500/10 via-violet-500/5 to-transparent',
      visual: <TrustBoard />,
    },
    {
      title: t('极致性价比，预算可控'),
      description: t(
        '包月/季/年订阅享更优价格，按量付费配合实时用量监控，灵活兜底。'
      ),
      tint: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
      visual: <BudgetBoard />,
    },
  ]

  const select = (i: number) => {
    setActive(i)
    setAutoPlay(false)
  }

  return (
    <section className='px-[5%] pt-6 pb-12 md:pt-8 md:pb-16'>
      <div className='mx-auto w-full'>
        <div className='mb-8 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('为什么选择京西智库')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 max-w-2xl text-base leading-relaxed md:text-lg'>
            {t('统一网关接入全模态模型，成本完全可控——为个人与团队而生。')}
          </p>
        </div>

        <div
          className={cn(
            'bg-gradient-to-br rounded-3xl p-6 transition-all duration-500 md:p-10',
            items[active].tint
          )}
        >
          <div className='flex flex-col gap-8 md:flex-row md:items-center md:gap-12'>
            {/* Left: selectable items, active one expands its description —
                stretched to the board height so both columns align exactly. */}
            <div className='flex w-full flex-col md:h-[20.375rem] md:justify-between md:w-2/5'>
              {items.map((item, i) => {
                const isActive = i === active
                return (
                  <div key={item.title} className='border-border/50 border-b last:border-b-0'>
                    <button
                      type='button'
                      onClick={() => select(i)}
                      aria-expanded={isActive}
                      className='group flex w-full cursor-pointer items-center gap-3 py-4 text-left md:py-5'
                    >
                      <span
                        className={cn(
                          'h-6 w-1 shrink-0 rounded-full transition-all duration-300',
                          isActive
                            ? 'bg-primary shadow-primary/30 shadow'
                            : 'bg-border group-hover:bg-muted-foreground/30'
                        )}
                        aria-hidden='true'
                      />
                      <span
                        className={cn(
                          'text-xl font-semibold tracking-tight transition-colors md:text-2xl',
                          isActive
                            ? 'text-foreground'
                            : 'text-muted-foreground/70 group-hover:text-foreground'
                        )}
                      >
                        {item.title}
                      </span>
                    </button>
                    <div
                      className={cn(
                        'grid transition-all duration-300',
                        isActive
                          ? 'grid-rows-[1fr] pb-5 opacity-100'
                          : 'grid-rows-[0fr] opacity-0'
                      )}
                    >
                      <div className='overflow-hidden'>
                        <p className='text-muted-foreground/80 pl-4 text-base leading-relaxed md:pl-5 md:text-lg'>
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Right: the visual matching the active item — fixed to the
                left column's content height so both sides align. */}
            <div className='flex w-full items-stretch md:h-[20.375rem] md:w-3/5'>
              {items[active].visual}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
