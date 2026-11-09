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
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import { FAQ_KEYS } from './aitoken-legacy-content'

export function AITokenGuide() {
  const { t } = useTranslation()

  return (
    <section id='api-access' className='scroll-mt-24 px-[5%] py-12 md:py-16'>
      <div className='mx-auto w-[90%] max-w-5xl'>
        <div className='mb-8 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('常见问题')}
          </h2>
        </div>

        <Accordion defaultValue={[FAQ_KEYS[0].questionKey]} className='gap-3'>
          {FAQ_KEYS.map((item) => (
            <AccordionItem
              key={item.questionKey}
              value={item.questionKey}
              className='border-border/60 bg-card/60 rounded-2xl border'
            >
              <AccordionTrigger className='items-center gap-4 rounded-2xl border-0 px-6 py-5 hover:no-underline [&_[data-slot=accordion-trigger-icon]]:hidden'>
                <span className='text-base font-medium'>
                  {t(item.questionKey)}
                </span>
                <ChevronDown
                  aria-hidden='true'
                  className='text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-180 motion-reduce:transition-none'
                />
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground/80 pb-0'>
                <p className='px-6 pb-5 text-[15px] leading-relaxed'>
                  {t(item.answerKey)}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
