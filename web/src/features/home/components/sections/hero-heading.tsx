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

import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

import { HeroOrbit, HeroParticles } from './hero-visuals'

/**
 * Deep-space hero in the keynote (index3) bloodline: starfield canvas,
 * orbiting model chips, one huge gradient headline and two pill CTAs.
 */
export function HeroHeading() {
  const { t } = useTranslation()

  return (
    <section className='relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-[5%] pt-24 pb-16 text-center md:pt-28'>
      {/* Starfield canvas + orbiting model chips (decorative) */}
      <HeroParticles />
      <HeroOrbit />

      <div className='relative z-10 mx-auto w-full'>
        <p className='text-primary mb-9 text-sm font-semibold tracking-[0.5em]'>
          {t('企业级 AI 算力与 Token 服务')}
        </p>

        <h1 className='text-[clamp(2.75rem,7vw,6.5rem)] leading-[1.12] font-extrabold tracking-tight'>
          {t('算力调度与')}
          <br />
          <span className='hero-grad-text'>{t('Token 服务平台')}</span>
        </h1>

        <p className='text-muted-foreground mt-9 mx-auto max-w-3xl text-lg leading-relaxed md:text-2xl'>
          {t('让大模型算力，像水与电一样 —— 随取随用，按表计量。')}
        </p>

        <div className='mt-11 flex flex-wrap items-center justify-center gap-4'>
          <Button
            size='lg'
            className='hero-cta h-13 rounded-full px-9 text-base font-semibold'
            render={<Link to='/pricing' />}
          >
            {t('查看套餐')}
          </Button>
          <Button
            size='lg'
            variant='outline'
            className='h-13 rounded-full px-9 text-base'
            render={<Link to='/dashboard/$section' params={{ section: 'models' }} />}
          >
            {t('数据看板')}
          </Button>
        </div>

        <div className='mt-11 flex flex-wrap items-center justify-center gap-4'>
          {[
            { dot: 'bg-violet-400', label: t('统一接入') },
            { dot: 'bg-cyan-400', label: t('智能调度') },
            { dot: 'bg-amber-400', label: t('精确计量') },
            { dot: 'bg-emerald-400', label: t('安全运营') },
          ].map((b) => (
            <span
              key={b.label}
              className='border-border/60 bg-card/60 flex items-center gap-2.5 rounded-full border px-7 py-3 text-[17px] backdrop-blur-md'
            >
              <i className={`size-1.75 rounded-full ${b.dot}`} />
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
