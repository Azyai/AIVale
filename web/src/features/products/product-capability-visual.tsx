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
  ApiIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Database01Icon,
  Folder01Icon,
  Layers01Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import type { ProductDefinition } from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

export type CapabilityProductId = Exclude<ProductDefinition['id'], 'aitoken'>

export function ProductCapabilityVisual(props: {
  id: CapabilityProductId
  accent: { surface: string; border: string; text: string }
}) {
  const { t } = useTranslation()

  return (
    <figure className='relative min-w-0 py-5 sm:px-5 lg:px-0'>
      <div
        aria-hidden='true'
        className={cn(
          'pointer-events-none absolute inset-x-4 inset-y-8 -z-10 rounded-full bg-linear-to-br opacity-80 blur-3xl',
          props.accent.surface
        )}
      />
      <div className='relative mx-auto flex min-h-80 w-full max-w-2xl items-center justify-center py-3 sm:min-h-96'>
        {props.id === 'model-library' && <ModelLibraryVisual />}
        {props.id === 'workbench' && <WorkbenchVisual />}
        {props.id === 'agent-scheduling' && <SchedulingVisual />}
        {props.id === 'datasets' && <DatasetVisual />}
      </div>
      <figcaption
        className={cn(
          'mt-6 text-center text-xs leading-relaxed',
          props.accent.text
        )}
      >
        {t('Static capability diagram')}
      </figcaption>
    </figure>
  )
}

function ConceptNode(props: {
  titleKey: string
  icon: typeof Layers01Icon
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'relative z-10 flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-current/15 bg-background/75 px-3 py-5 text-center shadow-lg shadow-primary/5 sm:px-5',
        props.className
      )}
    >
      <HugeiconsIcon
        icon={props.icon}
        className='size-7 shrink-0'
        aria-hidden='true'
      />
      <span className='max-w-full text-sm leading-snug font-medium wrap-break-word'>
        {t(props.titleKey)}
      </span>
    </div>
  )
}

function ModelLibraryVisual() {
  const { t } = useTranslation()

  return (
    <div className='w-full text-cyan-800 dark:text-cyan-200'>
      <div className='relative mx-auto mb-8 w-44 sm:w-52'>
        <div
          aria-hidden='true'
          className='absolute inset-0 translate-y-3 -rotate-6 rounded-3xl border border-violet-400/40 bg-violet-500/10'
        />
        <div
          aria-hidden='true'
          className='absolute inset-0 translate-y-1 rotate-6 rounded-3xl border border-cyan-400/40 bg-cyan-500/10'
        />
        <div className='bg-background relative flex aspect-square flex-col items-center justify-center gap-4 rounded-3xl border border-cyan-400/40 shadow-xl shadow-cyan-950/10'>
          <HugeiconsIcon
            icon={Layers01Icon}
            className='size-16'
            strokeWidth={1.3}
            aria-hidden='true'
          />
          <span className='text-lg font-semibold'>{t('Models')}</span>
        </div>
      </div>
      <div className='relative grid grid-cols-3 gap-2 pt-5 sm:gap-4'>
        <div
          aria-hidden='true'
          className='absolute inset-x-[16.67%] top-0 h-5 rounded-t-xl border-x border-t border-cyan-500/35'
        />
        <div
          aria-hidden='true'
          className='absolute top-0 left-1/2 h-5 border-l border-cyan-500/35'
        />
        <ConceptNode titleKey='Capabilities' icon={AiBrain01Icon} />
        <ConceptNode titleKey='Pricing' icon={Layers01Icon} />
        <ConceptNode titleKey='Model API access' icon={ApiIcon} />
      </div>
    </div>
  )
}

function WorkbenchVisual() {
  return (
    <div className='relative grid w-full grid-cols-2 items-center gap-x-5 gap-y-4 text-violet-800 sm:gap-x-10 dark:text-violet-200'>
      <div
        aria-hidden='true'
        className='absolute top-[16.67%] right-1/4 bottom-[16.67%] left-1/4 rounded-xl border border-violet-400/40'
      />
      <ConceptNode
        titleKey='Workspace management'
        icon={Folder01Icon}
        className='row-span-3 aspect-square rounded-full border-violet-400/40 bg-violet-100/80 px-3 sm:gap-5 dark:bg-violet-950/80 [&>svg]:size-10'
      />
      <ConceptNode titleKey='Workspace members' icon={AiBrain01Icon} />
      <ConceptNode titleKey='API keys' icon={ApiIcon} />
      <ConceptNode titleKey='Agents' icon={WorkflowSquare01Icon} />
    </div>
  )
}

const SCHEDULING_STEPS = [
  { titleKey: 'Task center', icon: Folder01Icon, className: '' },
  { titleKey: 'Agent scheduling', icon: WorkflowSquare01Icon, className: '' },
  {
    titleKey: 'Approval center',
    icon: Layers01Icon,
    className: 'col-start-2 row-start-2',
  },
  {
    titleKey: 'Deliver',
    icon: AiBrain01Icon,
    className: 'col-start-1 row-start-2',
  },
] as const

function SchedulingVisual() {
  return (
    <div className='relative w-full text-emerald-800 dark:text-emerald-200'>
      <ol className='grid grid-cols-2 gap-8 sm:gap-10'>
        {SCHEDULING_STEPS.map((step) => (
          <li key={step.titleKey} className={cn('min-w-0', step.className)}>
            <ConceptNode
              titleKey={step.titleKey}
              icon={step.icon}
              className='h-full min-h-32 sm:min-h-36'
            />
          </li>
        ))}
      </ol>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className='absolute top-[calc(25%-0.5rem)] left-[calc(50%-0.5rem)] size-4'
        aria-hidden='true'
      />
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        className='absolute top-[calc(50%-0.5rem)] right-[calc(25%-0.5rem)] size-4'
        aria-hidden='true'
      />
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className='absolute top-[calc(75%-0.5rem)] left-[calc(50%-0.5rem)] size-4 rotate-180'
        aria-hidden='true'
      />
    </div>
  )
}

const DATASET_STEPS = [
  { titleKey: 'File', icon: Folder01Icon },
  { titleKey: 'Versions', icon: Layers01Icon },
  { titleKey: 'Data and knowledge', icon: Database01Icon },
] as const

function DatasetVisual() {
  const { t } = useTranslation()

  return (
    <div className='w-full text-amber-900 dark:text-amber-200'>
      <p className='mb-6 text-center text-lg font-semibold'>
        {t('Versioned data flow')}
      </p>
      <ol className='space-y-3'>
        {DATASET_STEPS.map((step, index) => (
          <li key={step.titleKey}>
            <div className='flex min-h-20 items-center gap-5 border-b border-amber-400/35 px-3 py-4 sm:px-7'>
              <span className='flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10'>
                <HugeiconsIcon
                  icon={step.icon}
                  className='size-7'
                  aria-hidden='true'
                />
              </span>
              <span className='min-w-0 text-base font-medium wrap-break-word'>
                {t(step.titleKey)}
              </span>
            </div>
            {index < DATASET_STEPS.length - 1 && (
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className='mx-auto mt-3 size-4'
                aria-hidden='true'
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
