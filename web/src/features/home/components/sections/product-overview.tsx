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
  AiInnovation01Icon,
  ArrowUpRight01Icon,
  CodeSquareIcon,
  CpuIcon,
  Database02Icon,
  Folder01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  RELEASE_STAGE_LABEL_KEYS,
  type CatalogProduct,
} from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

const productIcons = {
  aitoken: CodeSquareIcon,
  'model-library': CpuIcon,
  workbench: Folder01Icon,
  'agent-scheduling': AiInnovation01Icon,
  datasets: Database02Icon,
} satisfies Record<CatalogProduct['id'], typeof CpuIcon>

const productColors = {
  aitoken: {
    panel: 'border-violet-500/25 from-violet-500/12 hover:border-violet-400/60',
    icon: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  },
  'model-library': {
    panel: 'border-cyan-500/25 from-cyan-500/12 hover:border-cyan-400/60',
    icon: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300',
  },
  workbench: {
    panel:
      'border-fuchsia-500/25 from-fuchsia-500/12 hover:border-fuchsia-400/60',
    icon: 'bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300',
  },
  'agent-scheduling': {
    panel:
      'border-emerald-500/25 from-emerald-500/12 hover:border-emerald-400/60',
    icon: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  },
  datasets: {
    panel: 'border-amber-500/25 from-amber-500/12 hover:border-amber-400/60',
    icon: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
} satisfies Record<CatalogProduct['id'], { panel: string; icon: string }>

export function ProductOverview(props: { products: CatalogProduct[] }) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='platform-products'
      className='w-full px-5 py-12 sm:px-8 lg:px-12 lg:py-16 2xl:px-16'
    >
      <div className='mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-3'>
        <h2
          id='platform-products'
          className='text-3xl font-semibold tracking-tight sm:text-4xl'
        >
          {t('Products')}
        </h2>
        <p className='text-muted-foreground max-w-2xl text-base leading-relaxed'>
          {t('Find the right capability and see what you can use today.')}
        </p>
      </div>
      <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        {props.products.map((product) => (
          <li key={product.id}>
            <Link
              to='/products/$productId'
              params={{ productId: product.id }}
              className={cn(
                'group to-card focus-visible:ring-ring flex h-full min-h-64 flex-col rounded-2xl border bg-linear-to-br p-5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:p-6 motion-reduce:transition-none',
                productColors[product.id].panel
              )}
            >
              <div className='mb-5 flex w-full items-center justify-between gap-3'>
                <span
                  className={cn(
                    'grid size-12 place-items-center rounded-xl',
                    productColors[product.id].icon
                  )}
                >
                  <HugeiconsIcon
                    icon={productIcons[product.id]}
                    aria-hidden='true'
                    className='size-6'
                  />
                </span>
                <HugeiconsIcon
                  icon={ArrowUpRight01Icon}
                  aria-hidden='true'
                  className='text-muted-foreground group-hover:text-primary size-5 shrink-0'
                />
              </div>
              <div className='mb-6 min-w-0'>
                <h3 className='text-lg font-semibold'>{t(product.titleKey)}</h3>
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {t(product.descriptionKey)}
                </p>
              </div>
              <Badge
                variant={
                  product.releaseStage === 'available' ? 'secondary' : 'outline'
                }
                className='mt-auto h-auto min-h-6 max-w-full whitespace-normal'
              >
                {t(RELEASE_STAGE_LABEL_KEYS[product.releaseStage])}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
