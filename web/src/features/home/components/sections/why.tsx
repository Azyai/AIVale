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
import { Network, CircleHelp, ShieldX, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

const PAINS = [
  {
    icon: Network,
    title: '渠道分散',
    tag: '现状',
    text: '各业务各自对接模型，密钥散落、协议不一，每接一次就重复造一次轮子。',
  },
  {
    icon: CircleHelp,
    title: '成本黑箱',
    tag: '现状',
    text: 'Token 消耗没有统一计量，预算与分摊没有凭据，谁用了多少说不清。',
  },
  {
    icon: ShieldX,
    title: '安全薄弱',
    tag: '现状',
    text: '缺乏租户隔离、额度控制与操作审计，数据与密钥的管控路径不可视。',
  },
] as const

const ANSWERS = [
  { big: '一把钥匙', small: '统一 OpenAI 兼容协议，访问全部模型' },
  { big: '一枚 Token', small: '全程可计量、可追溯、可对账' },
  { big: '一个租户', small: '团队相互隔离，额度与权限自助管控' },
  { big: '一块大屏', small: '全局用量、成本与渠道健康尽收眼底' },
] as const

/** 破题:三条业务侧痛点 → 平台的答案(渐变描边卡)。 */
export function WhyPlatform() {
  const { t } = useTranslation()

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('为什么需要这个平台')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 max-w-2xl text-base leading-relaxed md:text-lg'>
            {t('大模型能力在爆发，但接入、成本与安全，是每条业务线都要重复解决的三件事。')}
          </p>
        </AnimateInView>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.15fr] md:items-stretch'>
          {/* Left: current pains */}
          <AnimateInView className='flex flex-col gap-4'>
            {PAINS.map((p) => (
              <div
                key={p.title}
                className='border-rose-400/25 bg-rose-500/[0.04] flex items-start gap-4.5 rounded-3xl border p-6 transition-colors duration-300 hover:border-rose-400/50'
              >
                <span className='bg-rose-500/10 text-rose-400 flex size-11.5 shrink-0 items-center justify-center rounded-2xl'>
                  <p.icon className='size-5.5' />
                </span>
                <div>
                  <h4 className='text-lg font-semibold tracking-wide'>
                    {t(p.title)}
                    <em className='text-rose-400 ml-3 font-mono text-xs font-semibold tracking-[0.2em] not-italic'>
                      {t(p.tag)}
                    </em>
                  </h4>
                  <p className='text-muted-foreground mt-1.5 text-[15.5px] leading-7'>
                    {t(p.text)}
                  </p>
                </div>
              </div>
            ))}
          </AnimateInView>

          {/* Right: the answer — gradient-bordered panel */}
          <AnimateInView
            delay={120}
            className='why-answer flex flex-col rounded-3xl p-8 md:p-10'
          >
            <div className='text-cyan-500 dark:text-cyan-300 mb-3.5 font-mono text-xs font-semibold tracking-[0.3em]'>
              {t('我们的答案')}
            </div>
            <h3 className='text-[clamp(1.5rem,2.6vw,2.2rem)] font-extrabold tracking-tight'>
              {t('一个统一的 AI 算力入口')}
            </h3>
            <div className='mt-6 flex flex-col gap-4'>
              {ANSWERS.map((a) => (
                <div key={a.big} className='flex items-start gap-3.5'>
                  <Check className='mt-1 size-5.5 shrink-0 stroke-[2.4] text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]' />
                  <p className='text-base leading-relaxed'>
                    <b className='text-foreground text-[17px] font-semibold'>
                      {t(a.big)}
                    </b>
                    <span className='text-muted-foreground ml-1.5 text-[15px]'>
                      {t(a.small)}
                    </span>
                  </p>
                </div>
              ))}
            </div>
            <div className='text-muted-foreground/70 mt-6 border-t border-border/60 pt-4.5 font-mono text-xs font-medium tracking-[0.18em]'>
              {t('OPENAI 兼容 · 即插即用 · 全链路可观测')}
            </div>
          </AnimateInView>
        </div>
      </div>
    </section>
  )
}
