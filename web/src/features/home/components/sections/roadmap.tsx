/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied WARRANTY OF
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'

type PhaseStatus = 'done' | 'going' | 'plan' | 'idea'

const PHASES: {
  no: string
  status: PhaseStatus
  statusLabel: string
  title: string
  text: string
  chips: string[]
}[] = [
  {
    no: 'PHASE 1',
    status: 'done',
    statusLabel: '已交付',
    title: '统一服务底座',
    text: '网关、调度、计量、租户运营全部就绪，平台进入稳定运行期。',
    chips: ['OpenAI 兼容网关', '多渠道调度', 'Token 计量', '多租户钱包'],
  },
  {
    no: 'PHASE 2',
    status: 'going',
    statusLabel: '调研就绪 · 推进中',
    title: '模型自部署',
    text: '基于国产算力集群私有化部署推理，数据不出平台，安全合规，成本自主可控。',
    chips: ['千问 125B', 'Qwen3.8-Flash', 'MiniMax H3 文生图', '接入统一调度'],
  },
  {
    no: 'PHASE 3',
    status: 'plan',
    statusLabel: '规划中',
    title: '在线微调',
    text: '场景语料沉淀为专属模型，微调产物直接上架平台，能力差异化。',
    chips: ['数据集管理', 'LoRA 微调', '训练-评测-发布', '专属渠道上架'],
  },
  {
    no: 'PHASE 4',
    status: 'idea',
    statusLabel: '构想',
    title: '学习平台',
    text: '把「用好模型」的能力交到每个团队手里，人才反哺平台生态。',
    chips: ['AI 学堂课程', '在线沙箱', '微调训练营', '认证与激励'],
  },
]

const FLY_NODES = [
  { pos: 'top', big: '算力', small: '自部署 · 降本' },
  { pos: 'right', big: '模型', small: '微调 · 沉淀' },
  { pos: 'bottom', big: '数据', small: '场景 · 积累' },
  { pos: 'left', big: '人才', small: '学堂 · 放大' },
] as const

const LOGIC_STEPS = [
  {
    title: '自部署先行',
    text: '把算力成本与数据安全握在自己手里，国产算力调研已完成，轻负载场景成本立降，并以普通渠道身份接入调度，业务方零感知。',
  },
  {
    title: '微调接续',
    text: '业务在使用中沉淀场景语料，经数据集管理 → LoRA 训练 → 评测发布，产出企业专属模型，直接上架模型广场。',
  },
  {
    title: '学习平台放大',
    text: '工具再好，也要人会用。课程 + 沙箱 + 认证激励，把 AI 能力交到每个团队手里。',
  },
] as const

const STATUS_CLASS: Record<PhaseStatus, string> = {
  done: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/[0.08]',
  going: 'text-violet-300 border-violet-400/40 bg-violet-400/10',
  plan: 'text-cyan-600 dark:text-cyan-300 border-cyan-500/35 bg-cyan-500/[0.07]',
  idea: 'text-muted-foreground/70 border-border/60 bg-transparent',
}

/** 未来蓝图:四阶段时间线 + 生态飞轮 + 推进逻辑。 */
export function Roadmap() {
  const { t } = useTranslation()

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <AnimateInView className='mb-10 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('未来蓝图 · 三步走')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 w-[90%] text-base leading-relaxed md:text-lg'>
            {t('从「用平台」，到「有模型」，再到「育人才」—— 一条递进的路线。')}
          </p>
        </AnimateInView>

        {/* Phase timeline */}
        <AnimateInView className='roadmap-grid grid grid-cols-1 gap-4.5 sm:grid-cols-2 xl:grid-cols-4'>
          {PHASES.map((p) => (
            <article
              key={p.no}
              className={cn(
                'border-border/60 bg-card/50 rounded-3xl border p-6.5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:border-violet-400/50 hover:shadow-[0_14px_44px_rgba(60,40,180,0.3)]',
                p.status === 'done' && 'border-emerald-400/40'
              )}
            >
              <div className='mb-3.5 flex items-center gap-3'>
                <span className='text-muted-foreground/70 font-mono text-sm font-bold tracking-widest'>
                  {p.no}
                </span>
                <span
                  className={cn(
                    'ml-auto rounded-full border px-3.5 py-1 text-xs font-medium tracking-wider',
                    STATUS_CLASS[p.status]
                  )}
                >
                  {t(p.statusLabel)}
                </span>
              </div>
              <h3 className='text-2xl font-bold tracking-tight'>{t(p.title)}</h3>
              <p className='text-muted-foreground mt-2.5 min-h-21 text-base leading-7'>
                {t(p.text)}
              </p>
              <div className='mt-4 flex flex-wrap gap-2'>
                {p.chips.map((c) => (
                  <span
                    key={c}
                    className='border-violet-400/25 bg-primary/[0.09] rounded-lg border px-3.5 py-1.5 text-sm'
                  >
                    {t(c)}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </AnimateInView>

        {/* Flywheel + reasoning */}
        <div className='mt-14 grid grid-cols-1 items-center gap-12 xl:grid-cols-[1fr_1.1fr]'>
          <AnimateInView className='flex justify-center'>
            <div
              role='img'
              aria-label={t('生态飞轮：算力-模型-数据-人才循环')}
              className='fly-wheel relative aspect-square w-full max-w-125'
            >
              <div aria-hidden className='fly-ring' />
              {FLY_NODES.map((n) => (
                <div key={n.pos} className={cn('fly-node', `fn-${n.pos}`)}>
                  <b className='text-foreground text-lg font-bold tracking-wide'>
                    {t(n.big)}
                  </b>
                  <span className='text-muted-foreground text-[13.5px]'>
                    {t(n.small)}
                  </span>
                </div>
              ))}
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  aria-hidden
                  className={cn('fly-arrow', `fa-${n}`)}
                >
                  <ChevronRight className='size-full stroke-[2.4] text-violet-500 drop-shadow-[0_0_5px_rgba(139,92,246,0.7)]' />
                </span>
              ))}
              <div className='fly-core absolute top-1/2 left-1/2 z-1 -translate-x-1/2 -translate-y-1/2 text-center'>
                <b className='hero-grad-text text-2xl font-extrabold tracking-[0.2em]'>
                  {t('企业 AI 闭环')}
                </b>
                <span className='text-muted-foreground/70 mt-2 block font-mono text-[11.5px] font-semibold tracking-[0.32em]'>
                  {t('ECOSYSTEM LOOP')}
                </span>
              </div>
            </div>
          </AnimateInView>

          <AnimateInView delay={120}>
            <h3 className='text-[clamp(1.5rem,2.6vw,2rem)] font-bold tracking-tight'>
              {t('为什么是这个顺序')}
            </h3>
            <div className='mt-6 flex flex-col gap-4.5'>
              {LOGIC_STEPS.map((s, i) => (
                <div key={s.title} className='flex gap-4'>
                  <span className='text-primary bg-primary/15 border-primary/40 flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold'>
                    {i + 1}
                  </span>
                  <p className='text-muted-foreground text-base leading-8'>
                    <b className='text-foreground font-semibold'>
                      {t(s.title)}：
                    </b>
                    {t(s.text)}
                  </p>
                </div>
              ))}
            </div>
            <div className='border-cyan-500/30 bg-cyan-500/[0.05] text-muted-foreground mt-6 rounded-2xl border border-dashed p-5 text-[15px] tracking-wide'>
              <b className='text-cyan-600 dark:text-cyan-300 font-semibold'>
                {t('飞轮')}：
              </b>
              {t('算力支撑模型 → 模型沉淀数据 → 数据培养人才 → 人才反哺算力')}
            </div>
          </AnimateInView>
        </div>
      </div>
    </section>
  )
}
