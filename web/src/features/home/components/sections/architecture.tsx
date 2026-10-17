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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

const APP_CHIPS = ['智能对话', '代码助手', 'Agent 编排', '内部业务系统'] as const

const COMPUTE_CHIPS = [
  '千问 125B',
  'Qwen3.8-Flash',
  'MiniMax H3',
  'DeepSeek',
  'GLM',
  '···',
] as const

const CORE_MODULES = [
  { title: '统一网关', lines: ['鉴权 · 限流', '协议转换'] },
  { title: '智能调度', lines: ['负载均衡 · 故障切换', '渠道权重'] },
  { title: '计量计费', lines: ['Token 计量 · 团队钱包', '订阅套餐'] },
  { title: '运营洞察', lines: ['数据看板 · 排行榜', '账单对账'] },
] as const

function LayerTag({
  name,
  sub,
  badge,
}: {
  name: string
  sub: string
  badge: string
}) {
  const { t } = useTranslation()
  return (
    <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
      <b className='text-lg font-semibold tracking-wide'>
        {t(name)}
        <small className='text-muted-foreground/70 ml-3 text-sm font-medium tracking-wider'>
          {t(sub)}
        </small>
      </b>
      <em className='text-cyan-600 dark:text-cyan-300 border-cyan-500/35 bg-cyan-500/[0.07] rounded-full border px-3.5 py-1 font-mono text-xs font-semibold tracking-[0.16em] not-italic'>
        {t(badge)}
      </em>
    </div>
  )
}

/** 平台总览:应用层 / 平台层(核心) / 算力层 三明治结构。 */
export function PlatformArchitecture() {
  const { t } = useTranslation()

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('平台总览 · 一图看清')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 w-[90%] text-base leading-relaxed md:text-lg'>
            {t('我们站在业务与算力之间：对上提供标准服务，对下把一切模型收拢为可调度的渠道。')}
          </p>
        </AnimateInView>

        <div className='mx-auto flex w-full flex-col'>
          {/* 应用层 */}
          <AnimateInView className='border-border/60 bg-card/50 rounded-3xl border p-6 backdrop-blur-md md:p-7'>
            <LayerTag name='应用层' sub='消费算力的一方' badge='业务零改造接入' />
            <div className='flex flex-wrap gap-3'>
              {APP_CHIPS.map((c) => (
                <span
                  key={c}
                  className='border-border/60 bg-muted/50 rounded-xl border px-5 py-2.5 text-[16.5px] transition-transform duration-300 hover:-translate-y-0.5 hover:border-violet-400/45'
                >
                  {t(c)}
                </span>
              ))}
            </div>
          </AnimateInView>

          <BeamDown />

          {/* 平台层(核心) */}
          <AnimateInView
            delay={120}
            className='arch-core rounded-3xl p-6 md:p-7'
          >
            <LayerTag
              name='平台层'
              sub='算力调度和 Token 服务'
              badge='OPENAI 兼容'
            />
            <div className='grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4'>
              {CORE_MODULES.map((m) => (
                <div
                  key={m.title}
                  className='border-violet-400/30 bg-primary/[0.07] hover:bg-primary/[0.16] hover:border-violet-400/55 rounded-2xl border p-4.5 transition-all duration-300 hover:-translate-y-1'
                >
                  <b className='text-lg font-semibold'>{t(m.title)}</b>
                  {m.lines.map((line) => (
                    <span
                      key={line}
                      className='text-muted-foreground mt-2 block text-sm leading-6'
                    >
                      {t(line)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </AnimateInView>

          <BeamUp />

          {/* 算力层 */}
          <AnimateInView
            delay={240}
            className='border-border/60 bg-card/50 rounded-3xl border p-6 backdrop-blur-md md:p-7'
          >
            <LayerTag name='算力层' sub='一切皆渠道' badge='可插拔 · 可扩展' />
            <div className='flex flex-wrap gap-3'>
              {COMPUTE_CHIPS.map((c) => (
                <span
                  key={c}
                  className='border-border/60 bg-muted/50 rounded-xl border px-5 py-2.5 text-[16.5px] transition-transform duration-300 hover:-translate-y-0.5 hover:border-violet-400/45'
                >
                  {c}
                </span>
              ))}
              <span className='text-muted-foreground/70 border-border/60 border-dashed rounded-xl border px-5 py-2.5 text-[16.5px]'>
                {t('私有算力 · 规划中')}
              </span>
            </div>
          </AnimateInView>
        </div>

        <AnimateInView delay={300} className='mx-auto mt-11 w-full'>
          <p className='text-muted-foreground text-center text-lg leading-relaxed tracking-wide text-balance md:text-2xl'>
            {t('对上，一个标准入口；对下，一切算力皆可调度。')}
            <br />
            {t('业务方始终只需要 ——')}
            <b className='text-foreground font-bold'>
              {t('一个域名，一把密钥。')}
            </b>
          </p>
        </AnimateInView>
      </div>
    </section>
  )
}

/* Vertical connector beams between layers (decorative, CSS-animated dots). */
function BeamDown() {
  return (
    <div aria-hidden className='beam-v h-14 w-full'>
      <i />
      <i />
      <i />
    </div>
  )
}

function BeamUp() {
  return (
    <div aria-hidden className='beam-v beam-up h-14 w-full'>
      <i />
      <i />
      <i />
    </div>
  )
}

export { BeamDown, BeamUp }
