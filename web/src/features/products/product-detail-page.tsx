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

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { PricingSection, TokenFlowTheater } from '@/features/home/components'
import {
  usePlatformCatalog,
  type ProductDefinition,
} from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

import { PRODUCT_SCOPE, OPERATION_STATUS_KEYS } from './product-copy'
import { ProductIcon, ProductPortal, ProductStage } from './product-portal'

const PREVIEW_LINKS = {
  workbench: { href: '/agent-demo', titleKey: 'View agent demo' },
  datasets: { href: '/dataset-center', titleKey: 'View dataset concept' },
} as const

export function ProductDetailPage(props: { product: ProductDefinition }) {
  const { t } = useTranslation()
  const { products } = usePlatformCatalog()
  const product = props.product
  const access = products.find((item) => item.id === product.id)
  const scope = PRODUCT_SCOPE[product.id]
  const preview =
    product.id === 'workbench' || product.id === 'datasets'
      ? PREVIEW_LINKS[product.id]
      : null

  return (
    <ProductPortal>
      <Breadcrumb aria-label={t('Breadcrumb')}>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to='/products' />}>
              {t('Product catalog')}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t(product.titleKey)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <header className='border-border mt-8 border-b pb-8 sm:mt-10 sm:pb-12'>
        <div className='flex items-center gap-3'>
          <ProductIcon id={product.id} />
          <ProductStage stage={product.releaseStage} />
        </div>
        <h1 className='mt-5 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl'>
          {t(product.titleKey)}
        </h1>
        <p className='text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed sm:text-lg'>
          {t(product.descriptionKey)}
        </p>
        {(access?.operation || preview) && (
          <div className='mt-6 flex flex-wrap items-center gap-3'>
            {access?.operation && (
              <Link
                to={access.operation.href}
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'h-auto min-h-11 max-w-full px-4 py-2 whitespace-normal'
                )}
              >
                {t(access.operation.titleKey)}
              </Link>
            )}
            {preview && (
              <Link
                to={preview.href}
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'outline' }),
                  'h-auto min-h-11 max-w-full px-4 py-2 whitespace-normal'
                )}
              >
                {t(preview.titleKey)}
              </Link>
            )}
          </div>
        )}
        {access &&
          !access.operation &&
          access.operationStatus !== 'planned' && (
            <p role='status' className='text-muted-foreground mt-3 text-sm'>
              {t(OPERATION_STATUS_KEYS[access.operationStatus])}
            </p>
          )}
      </header>
      <section
        aria-labelledby='product-scope-heading'
        className='grid gap-5 py-8 md:grid-cols-[minmax(10rem,1fr)_3fr] md:gap-8 md:py-12'
      >
        <h2 id='product-scope-heading' className='text-xl font-semibold'>
          {t('Product scope')}
        </h2>
        <dl className='divide-border divide-y'>
          {scope.map((item) => (
            <div key={item.titleKey} className='py-4 first:pt-0 last:pb-0'>
              <dt className='font-semibold'>{t(item.titleKey)}</dt>
              <dd className='text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed sm:text-base'>
                {t(item.descriptionKey)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {product.id === 'aitoken' && <AITokenGuide />}
    </ProductPortal>
  )
}

function AITokenGuide() {
  const { t } = useTranslation()

  return (
    <>
      <section
        id='api-access'
        aria-labelledby='api-access-heading'
        className='border-border scroll-mt-24 border-y py-8 sm:py-10'
      >
        <h2 id='api-access-heading' className='text-xl font-semibold'>
          {t('Connect to the API')}
        </h2>
        <ol className='mt-4 list-decimal pl-5 text-sm leading-relaxed sm:text-base'>
          <li>
            {t('Create an API key in the console and store it securely.')}
          </li>
          <li>
            {t(
              'Choose a model available to your account and configure the gateway address in your API client.'
            )}
          </li>
          <li>
            {t('After the request, check usage and charges in the console.')}
          </li>
        </ol>
      </section>
      <TokenFlowTheater />
      <PricingSection />
    </>
  )
}
