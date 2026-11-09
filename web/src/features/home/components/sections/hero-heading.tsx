/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied WARRANTY of
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

import { buttonVariants } from '@/components/ui/button'
import type { CatalogProduct } from '@/features/platform-catalog'
import { ProductIcon, ProductStage } from '@/features/products/product-portal'

import { HeroBrandSystem, HeroParticles } from './hero-visuals'

type HeroHeadingProps = {
  showProducts: boolean
  showConsole: boolean
  products?: CatalogProduct[]
}

export function HeroHeading(props: HeroHeadingProps) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby='platform-title'
      className='relative isolate flex min-h-svh w-full flex-col items-center justify-center overflow-hidden px-5 pt-28 pb-6 text-center sm:px-8 sm:pt-32 sm:pb-8 lg:px-[5%]'
    >
      <div
        aria-hidden='true'
        className='via-background/60 dark:via-background/30 pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-violet-500/10 to-cyan-400/10 dark:from-violet-500/10 dark:to-cyan-400/5'
      />
      <HeroBrandSystem />
      <HeroParticles />

      <div className='relative z-10 flex w-full flex-1 flex-col items-center justify-center py-10 sm:py-14'>
        <h1
          id='platform-title'
          className='hero-grad-text w-full text-[clamp(2.75rem,6.8vw,6.5rem)] leading-[1.12] font-extrabold tracking-[-0.035em] text-balance'
        >
          {t('AI Capability Orchestration Platform')}
        </h1>
        <p className='text-muted-foreground mt-7 max-w-4xl text-base leading-relaxed text-balance sm:text-xl'>
          {t(
            'Discover and use AI capabilities in AIVale, from model access to agent workspaces. Task scheduling and data services will open in stages.'
          )}
        </p>
        {(props.showProducts || props.showConsole) && (
          <div className='mt-9 flex w-full flex-wrap items-center justify-center gap-4'>
            {props.showProducts && (
              <Link
                to='/products'
                className={buttonVariants({
                  size: 'lg',
                  className:
                    'hero-cta min-h-13 max-w-full rounded-full px-8 text-base font-semibold whitespace-normal',
                })}
              >
                {t('Explore products')}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  aria-hidden='true'
                  data-icon='inline-end'
                />
              </Link>
            )}
            {props.showConsole && (
              <Link
                to='/dashboard'
                className={buttonVariants({
                  size: 'lg',
                  variant: 'outline',
                  className:
                    'min-h-13 max-w-full rounded-full border-primary/30 bg-background/65 px-8 text-base whitespace-normal',
                })}
              >
                {t('Open console')}
              </Link>
            )}
          </div>
        )}
      </div>

      {props.showProducts && Boolean(props.products?.length) && (
        <ul className='relative z-10 grid w-full gap-3 text-start sm:grid-cols-2 lg:grid-cols-5'>
          {props.products?.map((product) => (
            <li key={product.id} className='min-w-0'>
              <Link
                to='/products/$productId'
                params={{ productId: product.id }}
                className='group border-primary/15 bg-card/75 hover:border-primary/45 hover:bg-card/95 focus-visible:ring-ring flex h-full min-h-26 items-center gap-3 rounded-2xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:flex-wrap xl:flex-nowrap'
              >
                <ProductIcon id={product.id} />
                <span className='flex min-w-0 flex-1 flex-col items-start gap-2'>
                  <span className='text-sm font-semibold text-balance sm:text-base'>
                    {t(product.titleKey)}
                  </span>
                  <ProductStage stage={product.releaseStage} />
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className='text-primary size-4 shrink-0 opacity-60 group-hover:opacity-100'
                  aria-hidden='true'
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
