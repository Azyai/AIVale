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
  HeroBrandSystem,
  HeroParticles,
} from '@/features/home/components/sections/hero-visuals'
import type {
  CatalogProduct,
  ProductDefinition,
} from '@/features/platform-catalog'
import { cn } from '@/lib/utils'

import { AITokenArchitecture } from './aitoken-architecture'
import { AITokenCapabilities, AITokenClients } from './aitoken-capabilities'
import { AITokenGuide } from './aitoken-guide'
import { OPERATION_STATUS_KEYS } from './product-copy'
import { ProductPortal, ProductStage } from './product-portal'

const AITOKEN_ORBIT_LABELS = [
  'OpenAI',
  'Claude',
  'Gemini',
  'Qwen',
  'DeepSeek',
  'GLM',
  'Kimi',
  'MiniMax',
  'Grok',
  'OpenAI API',
  'Claude API',
  'Gemini API',
] as const

export function AITokenLanding(props: {
  product: ProductDefinition
  access?: CatalogProduct
}) {
  const { t } = useTranslation()
  const { product, access } = props

  return (
    <ProductPortal fullBleed>
      <section
        aria-labelledby='aitoken-title'
        className='relative isolate flex min-h-svh w-full flex-col items-center justify-center overflow-hidden px-[5%] pt-36 pb-16 text-center sm:pt-40'
      >
        <HeroBrandSystem labels={AITOKEN_ORBIT_LABELS} />
        <HeroParticles />
        <div className='absolute inset-x-[5%] top-24 z-10 flex items-start justify-between gap-3 text-left sm:top-28'>
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
          <ProductStage stage={product.releaseStage} />
        </div>

        <div className='relative z-10 mx-auto w-full py-8'>
          <p className='text-primary mb-9 text-sm font-semibold tracking-[0.3em] sm:tracking-[0.5em]'>
            {t('Enterprise AI compute and Token services')}
          </p>
          <h1
            id='aitoken-title'
            className='text-[clamp(2.75rem,7vw,6.5rem)] leading-[1.12] font-extrabold tracking-[-0.035em]'
          >
            {t('Compute orchestration and')}
            <br />
            <span className='hero-grad-text'>
              {t('Token service platform')}
            </span>
          </h1>
          <p className='text-muted-foreground mx-auto mt-9 max-w-3xl text-lg leading-relaxed md:text-2xl'>
            {t(
              'Make large-model compute as easy as water and electricity — on tap, metered.'
            )}
          </p>

          <div className='mt-11 flex flex-wrap items-center justify-center gap-4'>
            {access?.operation && (
              <Link
                to={access.operation.href}
                className={cn(
                  buttonVariants({ size: 'lg' }),
                  'hero-cta h-auto min-h-13 max-w-full rounded-full px-9 py-3 text-base font-semibold whitespace-normal'
                )}
              >
                {t(access.operation.titleKey)}
              </Link>
            )}
            <a
              href='#plans'
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'bg-background/60 h-auto min-h-13 max-w-full rounded-full px-9 py-3 text-base whitespace-normal'
              )}
            >
              {t('Compare plans')}
            </a>
          </div>
          {access &&
            !access.operation &&
            access.operationStatus !== 'planned' && (
              <p role='status' className='text-muted-foreground mt-4 text-sm'>
                {t(OPERATION_STATUS_KEYS[access.operationStatus])}
              </p>
            )}

          <div className='mt-11 flex flex-wrap items-center justify-center gap-3 sm:gap-4'>
            {[
              { dot: 'bg-violet-400', label: 'Model API access' },
              { dot: 'bg-cyan-400', label: 'API keys' },
              { dot: 'bg-amber-400', label: 'Usage and billing' },
              { dot: 'bg-emerald-400', label: 'Channels' },
            ].map((item) => (
              <span
                key={item.label}
                className='border-border/60 bg-card/60 flex items-center gap-2.5 rounded-full border px-5 py-3 text-sm backdrop-blur-md sm:px-7 sm:text-[17px]'
              >
                <span
                  aria-hidden='true'
                  className={cn('size-1.75 shrink-0 rounded-full', item.dot)}
                />
                {t(item.label)}
              </span>
            ))}
          </div>
        </div>
      </section>

      <AITokenCapabilities />
      <AITokenArchitecture />

      <div
        id='request-flow'
        className='scroll-mt-24 border-y border-violet-400/15'
      >
        <div className='flex flex-col gap-3 px-5 pt-10 sm:px-8 lg:flex-row lg:items-start lg:gap-6 lg:px-12 2xl:px-16'>
          <p className='border-primary/20 bg-primary/8 text-primary w-fit shrink-0 rounded-full border px-3 py-1 text-sm font-medium'>
            {t('Concept preview only')}
          </p>
          <p className='text-muted-foreground max-w-5xl text-sm leading-relaxed'>
            {t(
              'This is an illustrative request flow. The values and channels shown are examples, not live usage or a performance guarantee.'
            )}
          </p>
        </div>
        <TokenFlowTheater />
      </div>

      <div id='plans' className='scroll-mt-24'>
        <PricingSection />
      </div>
      <AITokenClients />
      <AITokenGuide />
    </ProductPortal>
  )
}
