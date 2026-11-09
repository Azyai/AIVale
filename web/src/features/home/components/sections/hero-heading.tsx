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
import {
  AiInnovation01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  CodeSquareIcon,
  Folder01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type HeroHeadingProps = {
  showProducts: boolean
  showConsole: boolean
}

export function HeroHeading(props: HeroHeadingProps) {
  const { t } = useTranslation()

  const steps = [
    {
      id: 'model-access',
      icon: CodeSquareIcon,
      title: t('Model access'),
      description: t('Model library and API access'),
      status: t('Available'),
      offset: 'sm:mr-[16%]',
    },
    {
      id: 'workspace',
      icon: Folder01Icon,
      title: t('Workspace setup'),
      description: t('Workspaces and member roles'),
      status: t('Requires enablement'),
      offset: 'sm:mx-[8%]',
    },
    {
      id: 'execution',
      icon: AiInnovation01Icon,
      title: t('Execution and governance'),
      description: t('Task scheduling and approvals'),
      status: t('Planned'),
      offset: 'sm:ml-[16%]',
    },
  ]

  return (
    <section aria-labelledby='platform-title' className='bg-muted/35 border-b'>
      <div className='mx-auto grid max-w-[90rem] items-center gap-10 px-5 pt-29 pb-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.94fr)] lg:gap-16 lg:px-10 lg:pt-36 lg:pb-20'>
        <div className='min-w-0'>
          <h1
            id='platform-title'
            className='text-[clamp(2.375rem,5.25vw,5rem)] leading-[1.08] font-semibold tracking-[-0.04em] text-balance'
          >
            {t('AI Capability Orchestration Platform')}
          </h1>
          <p className='text-muted-foreground mt-5 max-w-[42rem] text-base leading-relaxed sm:text-lg'>
            {t(
              'Discover and use AI capabilities in AIVale, from model access to agent workspaces. Task scheduling and data services will open in stages.'
            )}
          </p>
          {(props.showProducts || props.showConsole) && (
            <div className='mt-7 flex flex-wrap items-center gap-3'>
              {props.showProducts && (
                <Link
                  to='/products'
                  className={buttonVariants({
                    size: 'lg',
                    className:
                      'bg-foreground text-background [a]:hover:bg-foreground/90 min-h-11 max-w-full px-4 whitespace-normal',
                  })}
                >
                  {t('Explore products')}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    aria-hidden='true'
                    data-icon='inline-end'
                  />
                </Link>
              )}
              {props.showConsole && (
                <Link
                  to='/dashboard'
                  className={buttonVariants({
                    size: 'lg',
                    variant: 'outline',
                    className: 'min-h-11 max-w-full px-4 whitespace-normal',
                  })}
                >
                  {t('Open console')}
                </Link>
              )}
            </div>
          )}
        </div>

        <figure className='bg-background/75 relative isolate overflow-hidden rounded-xl border px-4 pt-5 pb-6 sm:px-7 sm:pt-6 sm:pb-8'>
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] bg-size-[18px_18px] opacity-60'
          />
          <figcaption className='text-muted-foreground mb-4 text-sm font-medium'>
            {t('Capability map')}
          </figcaption>
          <ol className='flex flex-col'>
            {steps.map((step, index) => (
              <li key={step.id} className={step.offset}>
                {index > 0 && (
                  <div
                    aria-hidden='true'
                    className='text-primary flex h-7 items-center pl-5'
                  >
                    <HugeiconsIcon icon={ArrowDown01Icon} className='size-4' />
                  </div>
                )}
                <div
                  className={cn(
                    'bg-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-lg border p-3 sm:p-3.5 xl:grid-cols-[auto_minmax(0,1fr)_auto]',
                    step.id === 'execution' && 'border-dashed'
                  )}
                >
                  <span className='text-primary bg-primary/10 grid size-8 shrink-0 place-items-center rounded-md'>
                    <HugeiconsIcon
                      icon={step.icon}
                      className='size-4'
                      aria-hidden='true'
                    />
                  </span>
                  <div className='min-w-0'>
                    <p className='text-sm leading-snug font-semibold'>
                      {step.title}
                    </p>
                    <p className='text-muted-foreground mt-0.5 text-xs leading-snug'>
                      {step.description}
                    </p>
                  </div>
                  <Badge
                    variant={
                      step.id === 'model-access' ? 'secondary' : 'outline'
                    }
                    className='col-start-2 xl:col-start-auto'
                  >
                    {step.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  )
}
