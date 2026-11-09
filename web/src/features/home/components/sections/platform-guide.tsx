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
import { LinkSquare01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { buttonVariants } from '@/components/ui/button'
import type { CatalogLink } from '@/features/platform-catalog'

export function PlatformGuide(props: {
  documentation: CatalogLink | undefined
}) {
  const { t } = useTranslation()
  const governance = [
    {
      id: 'identity',
      label: t('Identity and roles'),
      description: t(
        'Use your existing account. Workspace roles control who can view and manage workspace resources.'
      ),
    },
    {
      id: 'keys',
      label: t('API keys'),
      description: t(
        'Create and manage credentials for model API requests in the console.'
      ),
    },
    {
      id: 'usage',
      label: t('Usage and billing'),
      description: t(
        'Review model usage and manage your balance and subscriptions in the console.'
      ),
    },
  ]
  const questions = [
    {
      id: 'start',
      question: t('What can I use today?'),
      answer: t(
        'You can call models through AIToken. Workspace management is available when the workbench is enabled and your account has access.'
      ),
    },
    {
      id: 'run',
      question: t('Can I schedule Agent runs now?'),
      answer: t(
        'Agent scheduling and approval flows are planned. The public Business Hall describes the workflow.'
      ),
    },
    {
      id: 'datasets',
      question: t('Can I upload datasets?'),
      answer: t(
        'The dataset demo uses example data. Dataset storage, versioning, and upload are planned.'
      ),
    },
  ]
  const documentation = props.documentation
  const documentationClassName = buttonVariants({
    variant: 'link',
    className:
      'text-foreground mt-2 min-h-11 max-w-full px-0 text-start whitespace-normal',
  })
  const documentationContent = documentation && (
    <>
      {t(documentation.titleKey)}
      <HugeiconsIcon
        icon={LinkSquare01Icon}
        aria-hidden='true'
        data-icon='inline-end'
      />
    </>
  )

  return (
    <div className='mx-auto grid max-w-[90rem] gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-20'>
      <section aria-labelledby='platform-governance'>
        <h2
          id='platform-governance'
          className='text-3xl font-semibold tracking-tight'
        >
          {t('Platform governance')}
        </h2>
        <dl className='divide-border mt-6 divide-y border-y'>
          {governance.map((item) => (
            <div
              key={item.id}
              className='grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5'
            >
              <dt className='text-sm font-semibold'>{item.label}</dt>
              <dd className='text-muted-foreground text-sm leading-relaxed'>
                {item.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby='platform-guide'>
        <h2
          id='platform-guide'
          className='text-3xl font-semibold tracking-tight'
        >
          {t('Getting started')}
        </h2>
        <Accordion className='mt-6 border-y'>
          {questions.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className='min-h-11 items-center'>
                {item.question}
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground leading-relaxed'>
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {documentation &&
          (documentation.external ? (
            <a
              href={documentation.href}
              target='_blank'
              rel='noopener noreferrer'
              className={documentationClassName}
            >
              {documentationContent}
            </a>
          ) : (
            <Link
              to={documentation.href}
              hash={documentation.hash}
              className={documentationClassName}
            >
              {documentationContent}
            </Link>
          ))}
      </section>
    </div>
  )
}
