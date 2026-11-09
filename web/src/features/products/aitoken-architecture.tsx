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
  ApiIcon,
  ArrowRight01Icon,
  Layers01Icon,
  Shield01Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { BrandOrb } from '@/components/layout/components/header-logo'
import { getLobeIcon } from '@/lib/lobe-icon'

const GATEWAY_MODULES = [
  { titleKey: 'Model API access', icon: ApiIcon },
  { titleKey: 'Authentication', icon: Shield01Icon },
  { titleKey: 'Channels', icon: WorkflowSquare01Icon },
  { titleKey: 'Usage and billing', icon: Layers01Icon },
] as const

export function AITokenArchitecture() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='aitoken-architecture-title'
      className='relative overflow-hidden px-5 py-12 sm:px-8 md:py-16 lg:px-12 2xl:px-16'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_60%,#7c5cff12,transparent_65%)]'
      />
      <div className='mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end'>
        <h2
          id='aitoken-architecture-title'
          className='text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl'
        >
          {t('One gateway, from application to model')}
        </h2>
        <p className='text-muted-foreground max-w-xl text-sm leading-relaxed sm:text-base'>
          {t(
            'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
          )}
        </p>
      </div>

      <div className='grid gap-3'>
        <div className='border-primary/15 bg-background/80 grid gap-4 rounded-2xl border p-5 sm:p-6 lg:grid-cols-[12rem_1fr] lg:items-center'>
          <p className='text-primary text-sm font-semibold'>
            {t('Your applications')}
          </p>
          <ul className='grid grid-cols-2 gap-3 md:grid-cols-4'>
            {['Code', 'Text', 'Image', 'Audio'].map((label) => (
              <li
                key={label}
                className='border-primary/10 bg-primary/4 rounded-lg border px-4 py-3 text-center text-sm font-medium'
              >
                {t(label)}
              </li>
            ))}
          </ul>
        </div>

        <div aria-hidden='true' className='flex justify-center'>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='text-primary/55 size-6 rotate-90'
          />
        </div>

        <div className='via-background relative overflow-hidden rounded-2xl border border-violet-400/35 bg-linear-to-r from-violet-500/12 to-cyan-400/10 p-5 shadow-[0_12px_48px_#7c5cff0a] sm:p-7 lg:p-8'>
          <div className='flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8'>
            <div className='flex shrink-0 items-center gap-4 lg:w-48 lg:flex-col lg:gap-3'>
              <BrandOrb className='size-14 lg:size-20' />
              <p className='hero-grad-text text-2xl font-bold tracking-tight'>
                {t('AIToken')}
              </p>
            </div>
            <ul className='grid flex-1 grid-cols-2 gap-3 xl:grid-cols-4'>
              {GATEWAY_MODULES.map((module) => (
                <li
                  key={module.titleKey}
                  className='border-primary/15 bg-background/75 flex flex-col items-start gap-4 rounded-xl border p-4 sm:p-5'
                >
                  <HugeiconsIcon
                    icon={module.icon}
                    className='text-primary size-6'
                    aria-hidden='true'
                  />
                  <span className='text-sm leading-relaxed font-medium'>
                    {t(module.titleKey)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div aria-hidden='true' className='flex justify-center'>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className='size-6 rotate-90 text-cyan-600/65 dark:text-cyan-300/65'
          />
        </div>

        <div className='bg-background/80 grid gap-4 rounded-2xl border border-cyan-400/25 p-5 sm:p-6 lg:grid-cols-[12rem_1fr] lg:items-center'>
          <p className='text-sm font-semibold text-cyan-700 dark:text-cyan-300'>
            {t('Model providers')}
          </p>
          <ul className='grid grid-cols-2 gap-3 md:grid-cols-4'>
            {['OpenAI', 'Claude', 'Gemini', 'DeepSeek'].map((provider) => (
              <li
                key={provider}
                className='flex min-w-0 items-center justify-center gap-3 rounded-lg bg-cyan-400/5 px-3 py-3'
              >
                <span aria-hidden='true'>{getLobeIcon(provider, 24)}</span>
                <span className='truncate text-sm font-medium'>{provider}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className='text-muted-foreground mt-5 text-sm leading-relaxed'>
        {t(
          'Model availability and supported routes depend on your account and the configured channels.'
        )}
      </p>
    </section>
  )
}
