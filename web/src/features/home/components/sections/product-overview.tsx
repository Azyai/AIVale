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

const productIcons = {
  aitoken: CodeSquareIcon,
  'model-library': CpuIcon,
  workbench: Folder01Icon,
  'agent-scheduling': AiInnovation01Icon,
  datasets: Database02Icon,
} satisfies Record<CatalogProduct['id'], typeof CpuIcon>

export function ProductOverview(props: { products: CatalogProduct[] }) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='platform-products'
      className='mx-auto grid max-w-[90rem] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.25fr)] lg:gap-16 lg:px-10 lg:py-20'
    >
      <div>
        <h2
          id='platform-products'
          className='text-3xl font-semibold tracking-tight'
        >
          {t('Products')}
        </h2>
        <p className='text-muted-foreground mt-3 max-w-sm text-base leading-relaxed'>
          {t('Find the right capability and see what you can use today.')}
        </p>
      </div>
      <ul className='divide-border divide-y border-y'>
        {props.products.map((product) => (
          <li key={product.id}>
            <Link
              to='/products/$productId'
              params={{ productId: product.id }}
              className='group hover:bg-muted/60 focus-visible:ring-ring grid min-h-21 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-2 py-4 focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-4 sm:px-4'
            >
              <HugeiconsIcon
                icon={productIcons[product.id]}
                aria-hidden='true'
                className='text-primary mt-0.5 size-5 sm:mt-0'
              />
              <div className='min-w-0'>
                <h3 className='font-semibold'>{t(product.titleKey)}</h3>
                <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                  {t(product.descriptionKey)}
                </p>
              </div>
              <Badge
                variant={
                  product.releaseStage === 'available' ? 'secondary' : 'outline'
                }
                className='col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto'
              >
                {t(RELEASE_STAGE_LABEL_KEYS[product.releaseStage])}
              </Badge>
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                aria-hidden='true'
                className='text-muted-foreground group-hover:text-foreground col-start-3 row-start-1 mt-0.5 size-4 sm:col-start-auto sm:row-start-auto sm:mt-0'
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
