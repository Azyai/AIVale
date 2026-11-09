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
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { BrandOrb } from '@/components/layout/components/header-logo'
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
import { HeroParticles } from '@/features/home/components/sections/hero-visuals'
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
        className='relative isolate flex min-h-svh w-full flex-col overflow-hidden px-5 pt-24 pb-8 sm:px-8 sm:pt-28 lg:px-12 2xl:px-16'
      >
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_80%_30%,#7c5cff25,transparent_55%),radial-gradient(ellipse_at_15%_80%,#22d3ee20,transparent_55%)] dark:bg-[radial-gradient(ellipse_at_80%_30%,#7c5cff30,transparent_55%),radial-gradient(ellipse_at_15%_80%,#22d3ee15,transparent_55%)]'
        />
        <HeroParticles />
        <Breadcrumb className='relative z-10' aria-label={t('Breadcrumb')}>
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

        <div className='relative z-10 grid flex-1 items-center gap-8 py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:py-16'>
          <div>
            <div className='flex flex-wrap items-center gap-3'>
              <ProductStage stage={product.releaseStage} />
            </div>
            <h1
              id='aitoken-title'
              className='mt-6 font-extrabold tracking-[-0.035em]'
            >
              <span className='hero-grad-text block text-[clamp(3.5rem,7vw,7.5rem)] leading-none'>
                {t('AIToken')}
              </span>
              <span className='mt-4 block text-[clamp(2rem,3.4vw,3.75rem)] leading-[1.2] text-balance'>
                {t('Token service platform')}
              </span>
            </h1>
            <p className='text-foreground/85 mt-7 max-w-2xl text-lg leading-relaxed text-balance sm:text-xl'>
              {t('AI compute, as accessible as water and electricity.')}
            </p>
            <p className='text-muted-foreground mt-3 max-w-2xl text-base leading-relaxed'>
              {t('Model access, keys, usage, and plans in one place.')}
            </p>
            <div className='mt-8 flex flex-wrap gap-3'>
              {access?.operation && (
                <Link
                  to={access.operation.href}
                  className={cn(
                    buttonVariants({ size: 'lg' }),
                    'hero-cta h-auto min-h-12 max-w-full rounded-xl px-6 py-3 whitespace-normal'
                  )}
                >
                  {t(access.operation.titleKey)}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon='inline-end'
                    aria-hidden='true'
                  />
                </Link>
              )}
              <a
                href='#plans'
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'outline' }),
                  'border-primary/25 bg-background/60 h-auto min-h-12 max-w-full rounded-xl px-6 py-3 whitespace-normal'
                )}
              >
                {t('Compare plans')}
              </a>
              <a
                href='#api-access'
                className={cn(
                  buttonVariants({ size: 'lg', variant: 'ghost' }),
                  'h-auto min-h-12 max-w-full rounded-xl px-4 py-3 whitespace-normal'
                )}
              >
                {t('Use the API')}
              </a>
            </div>
            {access &&
              !access.operation &&
              access.operationStatus !== 'planned' && (
                <p role='status' className='text-muted-foreground mt-4 text-sm'>
                  {t(OPERATION_STATUS_KEYS[access.operationStatus])}
                </p>
              )}
          </div>

          <div
            aria-hidden='true'
            className='relative mx-auto flex aspect-[1.2] w-full max-w-2xl items-center justify-center'
          >
            <div className='absolute size-[72%] rounded-full bg-violet-500/15 blur-3xl' />
            <div className='absolute h-[56%] w-[94%] rotate-[-24deg] rounded-[50%] border border-violet-400/35 shadow-[0_0_45px_#7c5cff18,inset_0_0_40px_#7c5cff12]' />
            <div className='absolute h-[56%] w-[94%] rotate-[24deg] rounded-[50%] border border-cyan-400/35 shadow-[0_0_45px_#22d3ee18,inset_0_0_40px_#22d3ee12]' />
            <div className='absolute size-[70%] rounded-full border border-violet-400/15' />
            <BrandOrb className='size-[48%] shadow-[0_0_90px_#7c5cff40]' />
            <span className='bg-background/85 text-foreground absolute top-[14%] left-[8%] rounded-xl border border-violet-400/35 px-4 py-2.5 font-mono text-sm shadow-lg backdrop-blur-sm sm:text-base'>
              /v1/chat/completions
            </span>
            <span className='bg-background/85 text-foreground absolute top-[28%] right-0 rounded-xl border border-cyan-400/35 px-4 py-2.5 font-mono text-sm shadow-lg backdrop-blur-sm sm:text-base'>
              API key
            </span>
            <span className='bg-background/85 text-foreground absolute bottom-[18%] left-0 rounded-xl border border-violet-400/35 px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm sm:text-base'>
              {t('Model API access')}
            </span>
            <span className='bg-background/85 text-foreground absolute right-[4%] bottom-[11%] rounded-xl border border-cyan-400/35 px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm sm:text-base'>
              {t('Usage and billing')}
            </span>
          </div>
        </div>

        <nav
          aria-label={t('AIToken')}
          className='border-primary/15 relative z-10 grid grid-cols-2 gap-2 border-t pt-5 md:grid-cols-4 md:gap-4'
        >
          {[
            { label: 'Model API access', href: '#capabilities' },
            { label: 'Concept preview only', href: '#request-flow' },
            { label: 'Compare plans', href: '#plans' },
            { label: 'API access guide', href: '#api-access' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className='text-muted-foreground hover:text-primary focus-visible:ring-ring flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2'
            >
              {t(item.label)}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className='size-4 shrink-0'
                aria-hidden='true'
              />
            </a>
          ))}
        </nav>
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
