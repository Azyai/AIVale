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
import { Link } from '@tanstack/react-router'
import { BookOpen, Check, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export const runCompleteStep = 3

type DemoRunProps = {
  step: number | null
  includeKnowledge: boolean
  reply: string
  sourceTitle: string
  sourceExcerpt: string
}

export function DemoRun(props: DemoRunProps) {
  const { t } = useTranslation()
  const complete = props.step === runCompleteStep
  const steps = [
    t('Read sample question'),
    t('Check sample knowledge'),
    t('Compose sample reply'),
  ]
  return (
    <section
      aria-label={t('Run trace')}
      className='border-border min-w-0 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-9'
    >
      <h2 className='text-lg font-semibold'>{t('Run trace')}</h2>
      <ol className='border-border mt-3 divide-y border-y'>
        {steps.map((label, index) => {
          const current = props.step === index
          const done = props.step !== null && props.step > index
          const skipped =
            !props.includeKnowledge && index === 1 && (current || done)
          let status = t('Waiting')
          let icon: ReactNode = index + 1
          if (skipped) {
            status = t('Skipped')
            icon = <Minus className='size-3' />
          } else if (done) {
            status = t('Completed')
            icon = <Check className='size-3' />
          } else if (current) {
            status = t('In progress')
          }
          return (
            <li
              key={label}
              aria-current={current && !skipped ? 'step' : undefined}
              className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm'
            >
              <span className='flex min-w-0 items-center gap-2'>
                <span
                  className={cn(
                    'border-border text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums',
                    (done || current) &&
                      !skipped &&
                      'text-primary border-primary/40'
                  )}
                  aria-hidden='true'
                >
                  {icon}
                </span>
                {label}
              </span>
              <span
                className={cn(
                  'text-muted-foreground text-xs',
                  current && !skipped && 'text-primary font-medium'
                )}
              >
                {status}
              </span>
            </li>
          )
        })}
      </ol>

      <div className='mt-6'>
        <h3 className='text-base font-semibold'>{t('Sample reply')}</h3>
        <div
          aria-live='polite'
          className='text-muted-foreground mt-2 space-y-4 text-sm leading-relaxed'
        >
          {props.step === null && (
            <p>{t('Run the example to see a reply and its sources here.')}</p>
          )}
          {props.step !== null && !complete && (
            <p>{t('The example is running.')}</p>
          )}
          {complete && !props.includeKnowledge && (
            <p>
              {t(
                'No sample source is selected. Enable sample knowledge and run the example again to see a cited reply.'
              )}
            </p>
          )}
          {complete && props.includeKnowledge && (
            <>
              <p className='text-foreground'>{props.reply}</p>
              <div className='border-border bg-muted/30 rounded-md border px-4 py-3'>
                <p className='flex items-center gap-2 text-xs font-medium'>
                  <BookOpen className='size-4' aria-hidden='true' />{' '}
                  {t('Sample source')}
                </p>
                <p className='text-foreground mt-1.5 font-medium'>
                  [1] {props.sourceTitle}
                </p>
                <blockquote className='mt-1'>{props.sourceExcerpt}</blockquote>
              </div>
            </>
          )}
        </div>
        <Link
          to='/knowledge-base'
          className='text-primary mt-4 inline-flex min-h-8 items-center text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4'
        >
          {t('Explore the knowledge base')}
        </Link>
      </div>
    </section>
  )
}
