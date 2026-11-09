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
  AiBrain01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  Layers01Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { BUSINESS_AREAS } from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

import { ProductPortal, ProductStage } from './product-portal'

const BUSINESS_FLOW = [
  {
    titleKey: 'Request',
    descriptionKey: 'Describe the work and its expected deliverable.',
    icon: Folder01Icon,
    color: 'text-violet-800 dark:text-violet-200',
    surface: 'border-violet-400/40 bg-violet-100 dark:bg-violet-950',
  },
  {
    titleKey: 'Execute',
    descriptionKey: 'Follow runs and check their results.',
    icon: WorkflowSquare01Icon,
    color: 'text-cyan-800 dark:text-cyan-200',
    surface: 'border-cyan-400/40 bg-cyan-100 dark:bg-cyan-950',
  },
  {
    titleKey: 'Approve',
    descriptionKey: 'Review requests that need approval.',
    icon: Layers01Icon,
    color: 'text-amber-900 dark:text-amber-200',
    surface: 'border-amber-400/40 bg-amber-100 dark:bg-amber-950',
  },
  {
    titleKey: 'Deliver',
    descriptionKey:
      'Confirm the delivered work separately from the run result.',
    icon: ArrowRight01Icon,
    color: 'text-emerald-800 dark:text-emerald-200',
    surface: 'border-emerald-400/40 bg-emerald-100 dark:bg-emerald-950',
  },
] as const

const AREA_PRESENTATION = {
  tasks: { icon: Folder01Icon, color: 'text-violet-800 dark:text-violet-200' },
  dispatch: {
    icon: WorkflowSquare01Icon,
    color: 'text-cyan-800 dark:text-cyan-200',
  },
  approvals: {
    icon: Layers01Icon,
    color: 'text-amber-900 dark:text-amber-200',
  },
  bounties: {
    icon: AiBrain01Icon,
    color: 'text-emerald-800 dark:text-emerald-200',
  },
} as const

export function BusinessOverviewPage() {
  const { t } = useTranslation()

  return (
    <ProductPortal fullBleed>
      <header className='border-primary/15 via-primary/5 relative isolate overflow-hidden border-b bg-linear-to-br from-violet-500/15 to-cyan-500/12 px-5 pt-24 pb-12 sm:px-8 lg:px-12 lg:pt-32 lg:pb-16 2xl:px-16'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute -top-40 right-0 -z-10 size-[36rem] rounded-full bg-cyan-500/10 blur-3xl'
        />
        <div className='grid items-end gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16'>
          <div>
            <ProductStage stage='planned' />
            <h1 className='mt-5 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl'>
              {t('Business hall')}
            </h1>
            <p className='mt-5 max-w-3xl text-2xl leading-snug font-medium text-balance text-violet-800 sm:text-3xl dark:text-violet-200'>
              {t('From request to a reviewed result')}
            </p>
          </div>
          <p className='text-foreground/75 max-w-2xl text-base leading-relaxed sm:text-lg'>
            {t(
              'Follow team requests from intake through execution, review, and delivery. The business hall is being introduced in stages.'
            )}
          </p>
        </div>
        <section
          aria-labelledby='business-flow-heading'
          className='border-primary/20 mt-10 border-t pt-8 sm:mt-14'
        >
          <h2 id='business-flow-heading' className='text-xl font-semibold'>
            {t('Planned workflow')}
          </h2>
          <ol className='relative mt-7 grid gap-7 lg:grid-cols-4 lg:gap-8'>
            {BUSINESS_FLOW.map((step, index) => (
              <li
                key={step.titleKey}
                className='relative min-w-0 pl-16 lg:pl-0'
              >
                {index < BUSINESS_FLOW.length - 1 && (
                  <span
                    aria-hidden='true'
                    className='border-primary/25 absolute top-12 -bottom-7 left-6 border-l lg:top-6 lg:right-0 lg:bottom-auto lg:left-12 lg:w-full lg:border-t lg:border-l-0'
                  />
                )}
                <span
                  className={cn(
                    'absolute top-0 left-0 z-10 flex size-12 items-center justify-center rounded-full border lg:relative',
                    step.color,
                    step.surface
                  )}
                >
                  <HugeiconsIcon
                    icon={step.icon}
                    className='size-6'
                    aria-hidden='true'
                  />
                </span>
                <h3
                  className={cn(
                    'pt-1.5 text-xl font-semibold lg:mt-4 lg:pt-0',
                    step.color
                  )}
                >
                  {t(step.titleKey)}
                </h3>
                <p className='text-foreground/75 mt-2 max-w-xl text-sm leading-relaxed sm:text-base'>
                  {t(step.descriptionKey)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </header>
      <section
        aria-labelledby='business-areas-heading'
        className='grid gap-7 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16 lg:px-12 2xl:px-16'
      >
        <div>
          <h2
            id='business-areas-heading'
            className='text-2xl font-semibold tracking-tight sm:text-3xl'
          >
            {t('Planned areas')}
          </h2>
          <p className='text-foreground/75 mt-4 max-w-xl text-base leading-relaxed'>
            {t(
              'Agent scheduling and approval flows are planned. The public Business Hall describes the workflow.'
            )}
          </p>
        </div>
        <ul className='grid gap-x-9 gap-y-7 md:grid-cols-2'>
          {BUSINESS_AREAS.map((area) => (
            <li
              key={area.id}
              className='border-primary/20 min-w-0 border-t pt-6'
            >
              <HugeiconsIcon
                icon={AREA_PRESENTATION[area.id].icon}
                className={cn('size-8', AREA_PRESENTATION[area.id].color)}
                aria-hidden='true'
              />
              <div className='mt-4 flex flex-wrap items-center gap-x-3 gap-y-2'>
                <h3
                  className={cn(
                    'text-xl font-semibold',
                    AREA_PRESENTATION[area.id].color
                  )}
                >
                  {t(area.titleKey)}
                </h3>
                <ProductStage stage={area.releaseStage} />
              </div>
              <p className='text-foreground/75 mt-3 max-w-xl text-sm leading-relaxed sm:text-base'>
                {t(area.descriptionKey)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </ProductPortal>
  )
}
