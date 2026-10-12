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
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

// ~30 platforms split across three marquee rows. Missing icons degrade
// gracefully to a monogram circle via getLobeIcon's fallback.
const MARQUEE_ROWS: { icon: string; label: string }[][] = [
  [
    { icon: 'CherryStudio', label: 'Cherry Studio' },
    { icon: 'Cline', label: 'Cline' },
    { icon: 'Cursor', label: 'Cursor' },
    { icon: 'Claude', label: 'Claude Code' },
    { icon: 'OpenAI', label: 'ChatGPT / Codex' },
    { icon: 'Qwen', label: 'Qwen Code' },
    { icon: 'DeepSeek', label: 'DeepSeek' },
    { icon: 'LobeHub', label: 'LobeHub' },
    { icon: 'Dify', label: 'Dify' },
    { icon: 'OpenWebUI', label: 'Open WebUI' },
  ],
  [
    { icon: 'Gemini', label: 'Gemini CLI' },
    { icon: 'Windsurf', label: 'Windsurf' },
    { icon: 'Trae', label: 'Trae' },
    { icon: 'Bolt', label: 'Bolt' },
    { icon: 'Vercel', label: 'Vercel v0' },
    { icon: 'Copilot', label: 'GitHub Copilot' },
    { icon: 'Ollama', label: 'Ollama' },
    { icon: 'FastGPT', label: 'FastGPT' },
    { icon: 'Coze', label: 'Coze' },
    { icon: 'HuggingFace', label: 'HuggingFace' },
  ],
  [
    { icon: 'Doubao', label: '豆包' },
    { icon: 'Kimi', label: 'Kimi' },
    { icon: 'Zhipu', label: '智谱 GLM' },
    { icon: 'Wenxin', label: '文心一言' },
    { icon: 'Moonshot', label: 'Moonshot' },
    { icon: 'Grok', label: 'Grok' },
    { icon: 'Mistral', label: 'Mistral' },
    { icon: 'Meta', label: 'Llama' },
    { icon: 'Midjourney', label: 'Midjourney' },
    { icon: 'Suno', label: 'Suno' },
  ],
]

function MarqueeItem({ icon, label }: { icon: string; label: string }) {
  return (
    <div className='group border-border/60 bg-card/60 flex shrink-0 items-center gap-3 rounded-xl border px-5 py-3 shadow-xs backdrop-blur-sm transition-all duration-300 hover:border-border hover:shadow-md'>
      <div className='flex size-8 shrink-0 items-center justify-center opacity-70 transition-opacity duration-300 group-hover:opacity-100'>
        {getLobeIcon(icon, 30)}
      </div>
      <span className='text-muted-foreground/80 group-hover:text-foreground text-[15px] font-medium whitespace-nowrap transition-colors duration-300'>
        {label}
      </span>
    </div>
  )
}

/**
 * Siliconflow-style customer/tool wall: three rows of platforms scrolling
 * horizontally in alternating directions with edge fades; pauses on hover.
 */
export function ToolsWall() {
  const { t } = useTranslation()

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-full'>
        <div className='mb-8 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('兼容你正在使用的工具')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 max-w-2xl text-base leading-relaxed md:text-lg'>
            {t('OpenAI 兼容接口——配置一次，所有客户端即用即通。')}
          </p>
        </div>

        <div className='marquee-container space-y-5 rounded-3xl bg-muted/45 p-5 md:p-7'>
          {MARQUEE_ROWS.map((row, i) => (
            <div
              key={i}
              className='overflow-hidden py-1'
              style={{
                maskImage:
                  'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
              }}
            >
              <div
                className={cn(
                  'flex w-max gap-12 pr-12',
                  i % 2 === 0 ? 'animate-marquee-left' : 'animate-marquee-right'
                )}
              >
                {row.map((item) => (
                  <MarqueeItem key={item.label} {...item} />
                ))}
                {/* Duplicate set for the seamless infinite loop */}
                {row.map((item) => (
                  <MarqueeItem key={`dup-${item.label}`} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
