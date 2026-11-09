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
import { useTranslation } from 'react-i18next'

import { BUSINESS_AREAS } from '@/features/platform-catalog'

import { ProductPortal, ProductStage } from './product-portal'

export function BusinessOverviewPage() {
  const { t } = useTranslation()

  return (
    <ProductPortal>
      <header className='border-border border-b pb-8 sm:pb-10'>
        <div className='flex items-center gap-3'>
          <ProductStage stage='planned' />
        </div>
        <h1 className='mt-5 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl'>
          {t('Business hall')}
        </h1>
        <p className='text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed sm:text-lg'>
          {t(
            'Follow team requests from intake through execution, review, and delivery. The business hall is being introduced in stages.'
          )}
        </p>
      </header>
      <div className='grid gap-9 py-8 md:grid-cols-[minmax(14rem,1fr)_2fr] md:gap-14 md:py-12'>
        <section aria-labelledby='business-flow-heading'>
          <h2 id='business-flow-heading' className='text-xl font-semibold'>
            {t('Planned workflow')}
          </h2>
          <ol className='border-border mt-5 grid gap-4 border-l pl-5 text-sm leading-relaxed sm:text-base'>
            <li>{t('Describe the work and its expected deliverable.')}</li>
            <li>{t('Follow runs and check their results.')}</li>
            <li>{t('Review requests that need approval.')}</li>
            <li>
              {t('Confirm the delivered work separately from the run result.')}
            </li>
          </ol>
        </section>
        <section aria-labelledby='business-areas-heading'>
          <h2 id='business-areas-heading' className='text-xl font-semibold'>
            {t('Planned areas')}
          </h2>
          <ul className='divide-border mt-3 divide-y'>
            {BUSINESS_AREAS.map((area) => (
              <li key={area.id} className='py-4'>
                <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                  <h3 className='font-semibold'>{t(area.titleKey)}</h3>
                  <ProductStage stage={area.releaseStage} />
                </div>
                <p className='text-muted-foreground mt-1 text-sm leading-relaxed sm:text-base'>
                  {t(area.descriptionKey)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ProductPortal>
  )
}
