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

const GROUP_PRESENTATION = {
  models: {
    productId: 'aitoken',
    text: 'text-violet-800 dark:text-violet-200',
    descriptionKey:
      'Choose a model, create an API key, and make your first request through AIToken.',
  },
  agents: {
    productId: 'workbench',
    text: 'text-cyan-800 dark:text-cyan-200',
    descriptionKey:
      'Manage personal or team workspaces, members, and key permissions where your account has access.',
  },
  data: {
    productId: 'datasets',
    text: 'text-emerald-800 dark:text-emerald-200',
    descriptionKey:
      'The dataset demo uses example data. Dataset storage, versioning, and upload are planned.',
  },
} as const

export function ProductCatalogPage() {
  const { t } = useTranslation()
  const { products } = usePlatformCatalog()

  return (
    <ProductPortal fullBleed>
      <header className='border-primary/15 via-background relative isolate overflow-hidden border-b bg-linear-to-br from-violet-500/12 to-cyan-500/10 px-5 pt-24 pb-6 sm:px-8 lg:px-12 lg:pt-32 2xl:px-16'>
        <div className='grid items-end gap-7 pb-10 sm:pb-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16'>
          <div>
            <h1 className='text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl'>
              {t('Product catalog')}
            </h1>
            <p className='mt-5 max-w-3xl text-xl leading-snug font-medium text-balance text-violet-800 sm:text-2xl dark:text-violet-200'>
              {t('Find the right capability and see what you can use today.')}
            </p>
          </div>
          <p className='text-foreground/75 max-w-2xl text-base leading-relaxed sm:text-lg'>
            {t(
              'Explore model access, agent workspaces, and the capabilities planned for the platform.'
            )}
          </p>
        </div>
        <nav aria-label={t('Product catalog')}>
          <ul className='border-primary/20 grid border-t sm:grid-cols-3'>
            {PRODUCT_GROUPS.map((group) => (
              <li key={group.id} className='min-w-0'>
                <a
                  href={`#product-group-${group.id}`}
                  className='focus-visible:ring-ring hover:text-primary flex min-h-16 items-center justify-between gap-4 px-1 py-4 text-base font-medium outline-none focus-visible:ring-2 sm:pr-7'
                >
                  {t(group.titleKey)}
                  <ProductArrow />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <div className='px-5 sm:px-8 lg:px-12 2xl:px-16'>
        {PRODUCT_GROUPS.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`product-group-${group.id}`}
            className='border-primary/15 grid min-w-0 gap-7 border-b py-10 last:border-0 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] lg:gap-16'
          >
            <div>
              <ProductIcon id={GROUP_PRESENTATION[group.id].productId} />
              <h2
                id={`product-group-${group.id}`}
                className={cn(
                  'mt-4 scroll-mt-28 text-2xl font-semibold tracking-tight sm:text-3xl',
                  GROUP_PRESENTATION[group.id].text
                )}
              >
                {t(group.titleKey)}
              </h2>
              <p className='text-foreground/75 mt-4 max-w-xl text-sm leading-relaxed sm:text-base'>
                {t(GROUP_PRESENTATION[group.id].descriptionKey)}
              </p>
            </div>
            <ul className='divide-primary/15 min-w-0 divide-y'>
              {products
                .filter((product) => product.group === group.id)
                .map((product) => (
                  <li key={product.id} className='min-w-0'>
                    <Link
                      to='/products/$productId'
                      params={{ productId: product.id }}
                      className={cn(
                        'group focus-visible:ring-ring/70 flex min-h-40 items-start gap-4 rounded-xl px-4 py-6 outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 sm:gap-5 sm:px-6 sm:py-7 motion-reduce:transition-none',
                        product.id === 'aitoken' &&
                          'bg-linear-to-br from-violet-500/10 to-cyan-500/5'
                      )}
                    >
                      <ProductIcon id={product.id} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                          <h3 className='text-xl font-semibold text-balance sm:text-2xl'>
                            {t(product.titleKey)}
                          </h3>
                          <ProductStage stage={product.releaseStage} />
                        </div>
                        <p className='text-foreground/75 mt-3 max-w-2xl text-sm leading-relaxed sm:text-base'>
                          {t(product.descriptionKey)}
                        </p>
                      </div>
                      <span className='text-primary mt-1 shrink-0'>
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
