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
import { useTranslation } from 'react-i18next'

import { PRODUCT_GROUPS, usePlatformCatalog } from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

import {
  ProductArrow,
  ProductIcon,
  ProductPortal,
  ProductStage,
} from './product-portal'

const groupColors = {
  models: 'border-violet-500/25 from-violet-500/12 hover:border-violet-400/60',
  agents: 'border-cyan-500/25 from-cyan-500/12 hover:border-cyan-400/60',
  data: 'border-emerald-500/25 from-emerald-500/12 hover:border-emerald-400/60',
}

export function ProductCatalogPage() {
  const { t } = useTranslation()
  const { products } = usePlatformCatalog()

  return (
    <ProductPortal>
      <header className='border-border border-b pb-8 sm:pb-10'>
        <h1 className='text-4xl leading-tight font-semibold tracking-tight sm:text-5xl'>
          {t('Product catalog')}
        </h1>
        <p className='text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed sm:text-lg'>
          {t(
            'Explore model access, agent workspaces, and the capabilities planned for the platform.'
          )}
        </p>
      </header>
      <div className='grid items-stretch gap-8 pt-8 lg:gap-6 xl:grid-cols-3 xl:pt-10'>
        {PRODUCT_GROUPS.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`product-group-${group.id}`}
            className='flex min-w-0 flex-col gap-4'
          >
            <h2
              id={`product-group-${group.id}`}
              className='text-primary text-xl font-semibold'
            >
              {t(group.titleKey)}
            </h2>
            <ul className='grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-1'>
              {products
                .filter((product) => product.group === group.id)
                .map((product) => (
                  <li key={product.id} className='min-w-0 only:col-span-full'>
                    <Link
                      to='/products/$productId'
                      params={{ productId: product.id }}
                      className={cn(
                        'group to-card focus-visible:ring-ring/70 flex h-full min-h-44 items-start gap-4 rounded-2xl border bg-linear-to-br p-6 outline-none focus-visible:ring-2 sm:gap-5',
                        groupColors[group.id]
                      )}
                    >
                      <ProductIcon id={product.id} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                          <span className='text-lg font-semibold text-balance'>
                            {t(product.titleKey)}
                          </span>
                          <ProductStage stage={product.releaseStage} />
                        </div>
                        <p className='text-muted-foreground mt-3 max-w-prose text-sm leading-relaxed'>
                          {t(product.descriptionKey)}
                        </p>
                      </div>
                      <span className='text-muted-foreground group-hover:text-foreground mt-1 shrink-0 sm:mt-0'>
                        <ProductArrow />
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </ProductPortal>
  )
}
