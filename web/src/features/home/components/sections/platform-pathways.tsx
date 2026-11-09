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
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, linkOptions } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PlatformPathwaysProps = {
  showProducts: boolean
  showBusiness: boolean
  canOpenWorkbench: boolean
}

export function PlatformPathways(props: PlatformPathwaysProps) {
  const { t } = useTranslation()
  const pathways = [
    ...(props.showProducts
      ? [
          {
            id: 'connect',
            title: t('Connect to models'),
            description: t(
              'Choose a model, create an API key, and make your first request through AIToken.'
            ),
            action: t('Read the API access guide'),
            destination: linkOptions({
              to: '/products/$productId',
              params: { productId: 'aitoken' },
            }),
          },
          {
            id: 'manage',
            title: t('Manage a workspace'),
            description: t(
              'Open an authorized workspace to manage its details and member roles.'
            ),
            action: props.canOpenWorkbench
              ? t('Open Agent workbench')
              : t('Learn about the workbench'),
            destination: props.canOpenWorkbench
              ? linkOptions({ to: '/agent-platform' })
              : linkOptions({
                  to: '/products/$productId',
                  params: { productId: 'workbench' },
                }),
          },
        ]
      : []),
    ...(props.showBusiness
      ? [
          {
            id: 'automate',
            title: t('Explore task automation'),
            description: t(
              'See how tasks, scheduling, and approvals will fit into one workspace flow.'
            ),
            action: t('Explore the Business Hall'),
            destination: linkOptions({ to: '/business' }),
          },
        ]
      : []),
  ]

  if (pathways.length === 0) {
    return null
  }

  return (
    <section
      aria-labelledby='platform-pathways'
      className='w-full px-5 pt-2 pb-12 sm:px-8 lg:px-12 lg:pb-16 2xl:px-16'
    >
      <h2
        id='platform-pathways'
        className='text-3xl font-semibold tracking-tight'
      >
        {t('Where to start')}
      </h2>
      <ul
        className={cn(
          'mt-6 grid gap-4',
          pathways.length > 1 && 'md:grid-cols-2',
          pathways.length > 2 && 'lg:grid-cols-3'
        )}
      >
        {pathways.map((pathway) => (
          <li
            key={pathway.id}
            className='border-primary/20 bg-primary/5 flex min-w-0 flex-col items-start rounded-2xl border p-5 sm:p-6'
          >
            <h3 className='text-lg font-semibold'>{pathway.title}</h3>
            <p className='text-muted-foreground mt-2 max-w-[46ch] text-sm leading-relaxed'>
              {pathway.description}
            </p>
            <Link
              {...pathway.destination}
              className={buttonVariants({
                variant: 'link',
                className:
                  'text-primary mt-auto min-h-11 max-w-full px-0 pt-4 text-start whitespace-normal',
              })}
            >
              {pathway.action}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                aria-hidden='true'
                data-icon='inline-end'
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function BusinessHallOverview() {
  const { t } = useTranslation()
  const steps = [
    {
      id: 'request',
      title: t('Request'),
      description: t('Define the work and its expected outcome.'),
    },
    {
      id: 'execute',
      title: t('Execute'),
      description: t('Run the work in an authorized workspace.'),
    },
    {
      id: 'approve',
      title: t('Approve'),
      description: t('Review actions that need a decision.'),
    },
    {
      id: 'deliver',
      title: t('Deliver'),
      description: t('Submit the result for acceptance.'),
    },
  ]

  return (
    <section
      aria-labelledby='platform-business'
      className='border-primary/15 from-primary/12 via-primary/5 border-y bg-linear-to-r to-cyan-500/10'
    >
      <div className='w-full px-5 py-12 sm:px-8 lg:px-12 lg:py-16 2xl:px-16'>
        <div className='flex flex-wrap items-center gap-3'>
          <h2
            id='platform-business'
            className='text-3xl font-semibold tracking-tight'
          >
            {t('Business Hall')}
          </h2>
          <Badge variant='outline'>{t('Planned')}</Badge>
        </div>
        <p className='text-muted-foreground mt-3 max-w-[65ch] text-base leading-relaxed'>
          {t(
            'The Business Hall will bring tasks, scheduling, approvals, and internal collaboration together. Explore the planned flow today.'
          )}
        </p>
        <ol className='mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {steps.map((step, index) => (
            <li
              key={step.id}
              className='border-primary/15 bg-card/75 relative min-w-0 rounded-xl border p-5'
            >
              <div className='flex items-center gap-3'>
                <h3 className='font-semibold'>{step.title}</h3>
                {index < steps.length - 1 && (
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className='text-primary hidden size-4 lg:block'
                    aria-hidden='true'
                  />
                )}
              </div>
              <p className='text-muted-foreground mt-1 max-w-[32ch] text-sm leading-relaxed'>
                {step.description}
              </p>
            </li>
          ))}
        </ol>
        <Link
          to='/business'
          className={buttonVariants({
            variant: 'outline',
            className: 'mt-6 min-h-11 max-w-full px-4 whitespace-normal',
          })}
        >
          {t('Explore the Business Hall')}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            aria-hidden='true'
            data-icon='inline-end'
          />
        </Link>
      </div>
    </section>
  )
}
