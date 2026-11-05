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
import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { SkipToMain } from '@/components/skip-to-main'
import { Badge } from '@/components/ui/badge'

type ConceptCenterLink = {
  href:
    | '/knowledge-base'
    | '/compute-center'
    | '/dataset-center'
    | '/agent-demo'
  label: string
}

type ConceptCenterProps = {
  title: string
  description: string
  boundary: string
  icon: LucideIcon
  steps: { title: string; description: string }[]
  related: ConceptCenterLink[]
  children: ReactNode
}

export function ConceptCenterLayout(props: ConceptCenterProps) {
  const { t } = useTranslation()
  const Icon = props.icon

  return (
    <>
      <SkipToMain />
      <PublicLayout showMainContainer={false}>
        <main
          id='content'
          tabIndex={-1}
          className='mx-auto w-full max-w-6xl scroll-mt-24 px-5 pt-28 pb-16 sm:px-8 md:pt-36 md:pb-24'
        >
          <header className='border-border border-b pb-9 sm:pb-12'>
            <div className='flex flex-wrap items-center gap-x-5 gap-y-3'>
              <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl'>
                {props.title}
              </h1>
              <Badge variant='outline' className='text-primary'>
                <Icon aria-hidden='true' />
                {t('Concept preview')}
              </Badge>
            </div>
            <p className='text-foreground mt-4 max-w-2xl text-base/relaxed sm:text-lg/relaxed'>
              {props.description}
            </p>
            <p className='text-muted-foreground mt-2 max-w-2xl text-sm/relaxed'>
              {props.boundary}
            </p>
          </header>

          <div className='mt-8 grid items-start gap-9 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:gap-12'>
            {props.children}

            <section
              aria-labelledby='concept-workflow-heading'
              className='min-w-0'
            >
              <h2
                id='concept-workflow-heading'
                className='text-xl font-semibold'
              >
                {t('How it would work')}
              </h2>
              <ol className='divide-border mt-3 divide-y'>
                {props.steps.map((step, index) => (
                  <li
                    key={step.title}
                    className='grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-4'
                  >
                    <span
                      aria-hidden='true'
                      className='bg-muted text-muted-foreground grid size-8 place-items-center rounded-lg text-sm font-medium tabular-nums'
                    >
                      {index + 1}
                    </span>
                    <div>
                      <h3 className='text-sm font-semibold'>{step.title}</h3>
                      <p className='text-muted-foreground mt-1 text-sm/relaxed'>
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <nav
            aria-label={t('Related previews')}
            className='border-border mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-5'
          >
            <span className='text-muted-foreground text-sm'>
              {t('Related previews')}
            </span>
            {props.related.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className='text-primary focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
              >
                {item.label}
                <ArrowRight aria-hidden='true' className='size-3.5' />
              </Link>
            ))}
          </nav>
        </main>
      </PublicLayout>
    </>
  )
}

export function ConceptSample(props: {
  title: string
  description: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='concept-sample-heading'
      className='border-border bg-card text-card-foreground min-w-0 overflow-hidden rounded-xl border'
    >
      <header className='border-border bg-primary/5 border-b px-5 py-5 sm:px-6'>
        <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
          <h2 id='concept-sample-heading' className='text-xl font-semibold'>
            {props.title}
          </h2>
          <Badge variant='secondary'>{t('Sample data')}</Badge>
        </div>
        <p className='text-muted-foreground mt-2 text-sm/relaxed'>
          {props.description}
        </p>
      </header>
      <div className='p-5 sm:p-6'>{props.children}</div>
    </section>
  )
}
