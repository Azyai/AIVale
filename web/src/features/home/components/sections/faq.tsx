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
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { FAQ_KEYS } from '../../constants'

export function FAQ() {
  const { t } = useTranslation()
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className='px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-[90%] max-w-5xl'>
        <div className='mb-8 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('常见问题')}
          </h2>
        </div>

        <div className='space-y-3'>
          {FAQ_KEYS.map((item, index) => {
            const isOpen = openIndex === index
            return (
              <div
                key={item.questionKey}
                className='border-border/60 bg-card/60 rounded-2xl border'
              >
                <button
                  type='button'
                  className='flex w-full items-center justify-between gap-4 px-6 py-5 text-left'
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                >
                  <span className='text-base font-medium'>
                    {t(item.questionKey)}
                  </span>
                  <ChevronDown
                    className={cn(
                      'text-muted-foreground size-4 shrink-0 transition-transform duration-200',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
                <div
                  className={cn(
                    'text-muted-foreground/80 grid transition-all duration-200',
                    isOpen
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className='overflow-hidden'>
                    <p className='px-6 pb-5 text-[15px] leading-relaxed'>
                      {t(item.answerKey)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
