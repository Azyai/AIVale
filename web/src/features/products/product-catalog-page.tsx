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

import {
  ProductArrow,
  ProductIcon,
  ProductPortal,
  ProductStage,
} from './product-portal'

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
      <div className='divide-border divide-y'>
        {PRODUCT_GROUPS.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`product-group-${group.id}`}
            className='grid gap-4 py-6 md:grid-cols-[minmax(10rem,1fr)_3fr] md:gap-8 md:py-8'
          >
            <h2
              id={`product-group-${group.id}`}
              className='text-lg font-semibold md:pt-3'
            >
              {t(group.titleKey)}
            </h2>
            <ul className='divide-border divide-y'>
              {products
                .filter((product) => product.group === group.id)
                .map((product) => (
                  <li key={product.id}>
                    <Link
                      to='/products/$productId'
                      params={{ productId: product.id }}
                      className='group hover:bg-muted/50 focus-visible:ring-ring/70 flex min-h-11 items-start gap-3 rounded-lg px-3 py-4 outline-none focus-visible:ring-2 sm:items-center sm:gap-4'
                    >
                      <ProductIcon id={product.id} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                          <span className='font-semibold'>
                            {t(product.titleKey)}
                          </span>
                          <ProductStage stage={product.releaseStage} />
                        </div>
                        <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
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
