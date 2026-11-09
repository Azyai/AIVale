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
import {
  usePlatformCatalog,
  type ProductDefinition,
} from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

import { AITokenLanding } from './aitoken-landing'
import {
  ProductCapabilityVisual,
  type CapabilityProductId,
} from './product-capability-visual'
import { PRODUCT_SCOPE, OPERATION_STATUS_KEYS } from './product-copy'
import {
  ProductArrow,
  ProductIcon,
  ProductPortal,
  ProductStage,
} from './product-portal'

const PREVIEW_LINKS = {
  workbench: { href: '/agent-demo', titleKey: 'View agent demo' },
  datasets: { href: '/dataset-center', titleKey: 'View dataset concept' },
} as const

const PRODUCT_ACCENTS = {
  'model-library': {
    text: 'text-cyan-800 dark:text-cyan-200',
    surface:
      'from-cyan-100/80 via-background to-violet-100/50 dark:from-cyan-950/45 dark:via-background dark:to-violet-950/35',
    border: 'border-cyan-300/70 dark:border-cyan-400/25',
    wash: 'bg-cyan-500/8',
  },
  workbench: {
    text: 'text-violet-800 dark:text-violet-200',
    surface:
      'from-violet-100/90 via-background to-cyan-100/50 dark:from-violet-950/55 dark:via-background dark:to-cyan-950/30',
    border: 'border-violet-300/70 dark:border-violet-400/25',
    wash: 'bg-violet-500/8',
  },
  'agent-scheduling': {
    text: 'text-emerald-800 dark:text-emerald-200',
    surface:
      'from-emerald-100/70 via-background to-violet-100/60 dark:from-emerald-950/40 dark:via-background dark:to-violet-950/40',
    border: 'border-emerald-300/70 dark:border-emerald-400/25',
    wash: 'bg-emerald-500/8',
  },
  datasets: {
    text: 'text-amber-900 dark:text-amber-200',
    surface:
      'from-amber-100/75 via-background to-violet-100/60 dark:from-amber-950/35 dark:via-background dark:to-violet-950/40',
    border: 'border-amber-300/70 dark:border-amber-400/25',
    wash: 'bg-amber-500/8',
  },
} as const

const PRODUCT_PRESENTATION = {
  'model-library': {
    benefitKey: 'Find the right model for every idea.',
    journeyKey: 'From discovery to your first request',
    steps: ['Models', 'Capabilities', 'Pricing', 'Model API access'],
    relatedLink: {
      to: '/products/$productId',
      params: { productId: 'aitoken' },
      hash: 'api-access',
    },
    relatedTitleKey: 'Connect to the API',
  },
  workbench: {
    benefitKey: 'A shared home for your Agents.',
    journeyKey: 'From workspace to controlled access',
    steps: ['Workspace management', 'Workspace members', 'API keys', 'Agents'],
    relatedLink: { to: '/business' },
    relatedTitleKey: 'Business hall',
  },
  'agent-scheduling': {
    benefitKey: 'Connect triggers, runs, and decisions.',
    journeyKey: 'From request to a reviewed result',
    steps: ['Task center', 'Agent scheduling', 'Approval center', 'Deliver'],
    relatedLink: { to: '/business' },
    relatedTitleKey: 'Business hall',
  },
  datasets: {
    benefitKey: 'A versioned foundation for your AI data.',
    journeyKey: 'From source files to reusable knowledge',
    steps: ['File', 'Versions', 'Data and knowledge'],
    relatedLink: {
      to: '/products/$productId',
      params: { productId: 'workbench' },
    },
    relatedTitleKey: 'Agent workbench',
  },
} as const satisfies Record<
  CapabilityProductId,
  {
    benefitKey: string
    journeyKey: string
    steps: readonly string[]
    relatedLink:
      | { to: '/business' }
      | {
          to: '/products/$productId'
          params: { productId: ProductDefinition['id'] }
          hash?: string
        }
    relatedTitleKey: string
  }
>

export function ProductDetailPage(props: { product: ProductDefinition }) {
  const { t } = useTranslation()
  const { products } = usePlatformCatalog()
  const product = props.product
  const access = products.find((item) => item.id === product.id)
  const productId = product.id

  if (productId === 'aitoken') {
    return <AITokenLanding product={product} access={access} />
  }

  const scope = PRODUCT_SCOPE[productId]
  const presentation = PRODUCT_PRESENTATION[productId]
  const accent = PRODUCT_ACCENTS[productId]
  const preview =
    productId === 'workbench' || productId === 'datasets'
      ? PREVIEW_LINKS[productId]
      : null

  return (
    <ProductPortal fullBleed>
      <header
        className={cn(
          'relative isolate overflow-hidden border-b border-primary/15 bg-linear-to-br px-5 pt-24 pb-12 sm:px-8 lg:px-12 lg:pt-28 lg:pb-16 2xl:px-16',
          accent.surface
        )}
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute -top-24 -left-32 -z-10 size-[32rem] rounded-full bg-violet-500/10 blur-3xl'
        />
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
        <div className='grid items-center gap-10 pt-10 sm:pt-12 lg:min-h-[38rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 xl:gap-20'>
          <div className='min-w-0 py-2 lg:py-10'>
            <div className='flex flex-wrap items-center gap-3'>
              <ProductIcon id={productId} />
              <ProductStage stage={product.releaseStage} />
            </div>
            <h1 className='mt-6 text-4xl leading-tight font-semibold tracking-tight wrap-break-word sm:text-5xl xl:text-6xl'>
              {t(product.titleKey)}
            </h1>
            <p
              className={cn(
                'mt-5 max-w-2xl text-2xl leading-snug font-medium text-balance sm:text-3xl',
                accent.text
              )}
            >
              {t(presentation.benefitKey)}
            </p>
            <p className='text-foreground/75 mt-5 max-w-2xl text-base leading-relaxed sm:text-lg'>
              {t(product.descriptionKey)}
            </p>
            <div className='mt-8 flex flex-wrap items-center gap-3'>
              {access?.operation && (
                <Link
                  to={access.operation.href}
                  hash={access.operation.hash}
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    'hero-cta h-auto min-h-12 max-w-full gap-3 px-5 py-3 whitespace-normal'
                  )}
                >
                  {t(access.operation.titleKey)}
                  <ProductArrow />
                </Link>
              )}
              {preview && (
                <Link
                  to={preview.href}
                  className={cn(
                    buttonVariants({ size: 'lg', variant: 'outline' }),
                    'h-auto min-h-12 max-w-full gap-3 px-5 py-3 whitespace-normal'
                  )}
                >
                  {t(preview.titleKey)}
                  <ProductArrow />
                </Link>
              )}
              {!access?.operation && !preview && (
                <a
                  href='#product-scope-heading'
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    'hero-cta h-auto min-h-12 max-w-full gap-3 px-5 py-3 whitespace-normal'
                  )}
                >
                  {t('Product scope')}
                  <ProductArrow />
                </a>
              )}
            </div>
            {access &&
              !access.operation &&
              access.operationStatus !== 'planned' && (
                <p role='status' className='text-foreground/75 mt-4 text-sm'>
                  {t(OPERATION_STATUS_KEYS[access.operationStatus])}
                </p>
              )}
          </div>
          <ProductCapabilityVisual id={productId} accent={accent} />
        </div>
      </header>
      <section
        aria-labelledby='product-scope-heading'
        className='px-5 py-12 sm:px-8 sm:py-16 lg:px-12 2xl:px-16'
      >
        <h2
          id='product-scope-heading'
          className='scroll-mt-24 text-2xl font-semibold tracking-tight sm:text-3xl'
        >
          {t('Product scope')}
        </h2>
        <dl className='mt-7 grid gap-5 lg:grid-cols-2 lg:gap-8'>
          {scope.map((item, index) => (
            <div
              key={item.titleKey}
              className={cn(
                'rounded-2xl border px-6 py-7 sm:px-8 sm:py-9',
                accent.border,
                index === 0 && accent.wash
              )}
            >
              <dt
                className={cn(
                  'text-xl leading-snug font-semibold sm:text-2xl',
                  accent.text
                )}
              >
                {t(item.titleKey)}
              </dt>
              <dd className='text-foreground/75 mt-4 max-w-2xl text-base leading-relaxed'>
                {t(item.descriptionKey)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        aria-labelledby='product-path-heading'
        className={cn(
          'border-y border-primary/10 px-5 py-12 sm:px-8 sm:py-16 lg:px-12 2xl:px-16',
          accent.wash
        )}
      >
        <h2
          id='product-path-heading'
          className='max-w-3xl text-2xl leading-snug font-semibold tracking-tight sm:text-3xl'
        >
          {t(presentation.journeyKey)}
        </h2>
        <ol className='mt-8 grid gap-4 sm:grid-cols-2 xl:flex xl:gap-0'>
          {presentation.steps.map((step, index) => (
            <li
              key={step}
              className='border-primary/20 flex min-w-0 items-center gap-4 border-t pt-5 xl:flex-1 xl:pr-6'
            >
              <span className={cn('size-2 shrink-0 rounded-full', accent.wash)}>
                <span className='block size-2 rounded-full bg-current' />
              </span>
              <span className='min-w-0 flex-1 text-base leading-snug font-medium'>
                {t(step)}
              </span>
              {index < presentation.steps.length - 1 && (
                <span className={cn('shrink-0', accent.text)}>
                  <ProductArrow />
                </span>
              )}
            </li>
          ))}
        </ol>
        <div className='mt-10 flex flex-wrap items-center gap-3'>
          <Link
            {...presentation.relatedLink}
            className={cn(
              buttonVariants({ size: 'lg' }),
              'h-auto min-h-11 max-w-full gap-3 px-5 py-3 whitespace-normal'
            )}
          >
            {t(presentation.relatedTitleKey)}
            <ProductArrow />
          </Link>
          <Link
            to='/products'
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'h-auto min-h-11 max-w-full px-5 py-3 whitespace-normal'
            )}
          >
            {t('View all products')}
          </Link>
        </div>
      </section>
    </ProductPortal>
  )
}
