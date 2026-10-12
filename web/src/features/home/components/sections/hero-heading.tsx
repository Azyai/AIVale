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

/**
 * Compact qianwen-style hero: one huge headline, one supporting line, two
 * CTAs. Replaces the former terminal-demo hero (deleted).
 */
export function HeroHeading() {
  const { t } = useTranslation()

  return (
    <section className='relative overflow-hidden px-[5%] pt-20 pb-6 md:pt-28 md:pb-8'>
      {/* Soft gradient glows */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 opacity-25 dark:opacity-[0.12]'
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 30% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 40% at 75% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 50% 85%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      <div className='mx-auto w-full text-center'>
        <div className='border-border/60 bg-muted/40 text-muted-foreground mb-5 inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm'>
          <span className='bg-primary relative flex size-2'>
            <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60' />
            <span className='relative inline-flex size-2 rounded-full' />
          </span>
          {t('京西智谷 · 企业级 AI 服务平台')}
        </div>

        <h1 className='text-[clamp(2.75rem,6vw,3.75rem)] leading-[1.1] font-bold tracking-tight'>
          {t('Token Plan')}
          <span className='bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500 bg-clip-text text-transparent'>
            {t('重磅升级')}
          </span>
        </h1>

        <p className='text-muted-foreground mx-auto mt-5 max-w-3xl text-lg leading-relaxed md:text-xl'>
          {t('价格不变，权益加码。一站式覆盖模型调用！')}
        </p>

      </div>
    </section>
  )
}
