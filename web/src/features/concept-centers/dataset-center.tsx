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
import { Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  ConceptCenterLayout,
  ConceptSample,
} from './components/concept-center-layout'

export function DatasetCenterConcept() {
  const { t } = useTranslation()
  return (
    <ConceptCenterLayout
      title={t('Dataset Center')}
      description={t(
        'Use platform models to draft distillation examples, review them, and prepare training datasets.'
      )}
      boundary={t(
        'The records are fictional. This preview does not generate, upload, or train on data.'
      )}
      icon={Database}
      steps={[
        {
          title: t('Generate candidates'),
          description: t(
            'Use a platform model as a teacher to propose prompt and response pairs.'
          ),
        },
        {
          title: t('Review and curate'),
          description: t(
            'Remove duplicates and check answers for quality, safety, and coverage.'
          ),
        },
        {
          title: t('Hand off for fine-tuning'),
          description: t(
            'Send a reviewed dataset version to the Compute Center and keep evaluation examples separate.'
          ),
        },
      ]}
      related={[
        { href: '/compute-center', label: t('Compute Center') },
        { href: '/knowledge-base', label: t('Knowledge Base') },
      ]}
    >
      <ConceptSample
        title={t('Dataset review walkthrough')}
        description={t(
          'Compare a teacher-model draft with a record ready for evaluation or training.'
        )}
      >
        <Tabs defaultValue='draft'>
          <TabsList
            aria-label={t('Dataset review stage')}
            className='max-w-full'
          >
            <TabsTrigger value='draft' className='px-2.5'>
              {t('Draft sample')}
            </TabsTrigger>
            <TabsTrigger value='reviewed' className='px-2.5'>
              {t('Reviewed sample')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='draft' className='pt-3'>
            <DatasetExample
              answer={t('Restart the application and try again.')}
              review={t(
                'The draft suggests an action before gathering enough information.'
              )}
            />
          </TabsContent>
          <TabsContent value='reviewed' className='pt-3'>
            <DatasetExample
              answer={t(
                'Ask when the error appeared and what changed. Request the error message without account details.'
              )}
              review={t(
                'The reviewed answer gathers context and avoids collecting personal information.'
              )}
            />
          </TabsContent>
        </Tabs>
      </ConceptSample>
    </ConceptCenterLayout>
  )
}

function DatasetExample(props: { answer: string; review: string }) {
  const { t } = useTranslation()
  return (
    <dl className='space-y-4 text-sm/relaxed'>
      <div>
        <dt className='text-muted-foreground text-xs font-medium'>
          {t('Question')}
        </dt>
        <dd className='mt-1 font-medium'>
          {t('How should a support agent respond to an unexplained error?')}
        </dd>
      </div>
      <div>
        <dt className='text-muted-foreground text-xs font-medium'>
          {t('Answer')}
        </dt>
        <dd className='mt-1'>{props.answer}</dd>
      </div>
      <div className='border-border border-t pt-4'>
        <dt className='font-medium'>{t('Review note')}</dt>
        <dd className='text-muted-foreground mt-1'>{props.review}</dd>
      </div>
    </dl>
  )
}
