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

import { CopyButton } from '@/components/copy-button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const EXAMPLE_REQUEST = `curl "$AIVALE_BASE_URL/v1/chat/completions" \\
  -H "Authorization: Bearer $AIVALE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "YOUR_MODEL_ID",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`

const API_STEPS = [
  'Create an API key in the console and store it securely.',
  'Choose a model available to your account and configure the gateway address in your API client.',
  'After the request, check usage and charges in the console.',
] as const

const FAQ_ITEMS = [
  {
    questionKey: 'How do I get started?',
    answerKeys: [
      'Register an account, top up or subscribe to a plan in the wallet, create an API key, then point your tool at the API address shown on the token page.',
    ],
  },
  {
    questionKey: 'What is the difference between plans and pay-as-you-go?',
    answerKeys: [
      'Subscriptions provide quota according to the configured plan. Wallet charges follow the model pricing and billing rules configured for this site.',
      "Plans, quotas, and prices are determined by this site's configuration.",
    ],
  },
  {
    questionKey: 'How do team plans work?',
    answerKeys: [
      'Team plans are billed per seat and share one quota pool across team tokens.',
    ],
  },
  {
    questionKey: 'Which tools can I connect?',
    answerKeys: [
      'Configure a compatible API address and key in your client.',
      'Client compatibility depends on the protocol and features supported by that client.',
    ],
  },
] as const

export function AITokenGuide() {
  const { t } = useTranslation()

  return (
    <>
      <section
        id='api-access'
        aria-labelledby='aitoken-api-guide-title'
        className='scroll-mt-24 px-5 py-12 sm:px-8 md:py-16 lg:px-12 2xl:px-16'
      >
        <div className='grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12'>
          <div>
            <h2
              id='aitoken-api-guide-title'
              className='text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl'
            >
              {t('API access guide')}
            </h2>
            <p className='text-muted-foreground mt-4 max-w-xl text-base leading-relaxed'>
              {t(
                'Choose a model, create an API key, and make your first request through AIToken.'
              )}
            </p>
            <ol className='mt-7 space-y-5'>
              {API_STEPS.map((step, index) => (
                <li key={step} className='flex items-start gap-4'>
                  <span className='border-primary/25 bg-primary/8 text-primary flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm'>
                    {index + 1}
                  </span>
                  <p className='text-muted-foreground pt-1 text-sm leading-relaxed sm:text-base'>
                    {t(step)}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          <div className='min-w-0 overflow-hidden rounded-2xl border border-violet-400/25 bg-[#151329] text-slate-100 shadow-[0_16px_60px_#7c5cff12]'>
            <div className='flex items-center justify-between gap-3 border-b border-violet-400/20 bg-violet-400/5 px-5 py-4'>
              <h3 className='text-sm font-medium'>{t('Example request')}</h3>
              <CopyButton
                value={EXAMPLE_REQUEST}
                size='sm'
                variant='outline'
                className='border-violet-300/25 bg-violet-300/10 text-slate-100 hover:bg-violet-300/20 hover:text-white'
              >
                {t('Copy')}
              </CopyButton>
            </div>
            <pre
              className='overflow-x-auto p-5 text-xs leading-7 text-cyan-200 sm:p-6 sm:text-sm'
              tabIndex={0}
            >
              <code>{EXAMPLE_REQUEST}</code>
            </pre>
            <p className='border-t border-violet-400/15 px-5 py-4 text-xs leading-relaxed text-slate-300 sm:px-6'>
              {t(
                'Replace the placeholders with your gateway address, API key, and an available model.'
              )}
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby='aitoken-faq-title'
        className='border-primary/10 grid gap-6 border-t bg-linear-to-br from-violet-500/5 to-cyan-400/5 px-5 py-12 sm:px-8 md:py-16 lg:grid-cols-[1fr_2fr] lg:gap-12 lg:px-12 2xl:px-16'
      >
        <div>
          <h2
            id='aitoken-faq-title'
            className='text-2xl font-semibold tracking-tight text-balance sm:text-3xl'
          >
            {t('Frequently asked questions')}
          </h2>
        </div>
        <Accordion defaultValue={['How do I get started?']}>
          {FAQ_ITEMS.map((item) => (
            <AccordionItem
              key={item.questionKey}
              value={item.questionKey}
              className='border-primary/15'
            >
              <AccordionTrigger className='gap-5 py-5 text-base'>
                {t(item.questionKey)}
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground pb-5 text-sm leading-relaxed sm:text-base'>
                {item.answerKeys.map((answer) => (
                  <p key={answer}>{t(answer)}</p>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </>
  )
}
