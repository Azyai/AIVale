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
import { Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  ConceptCenterLayout,
  ConceptSample,
} from './components/concept-center-layout'

export function ComputeCenterConcept() {
  const { t } = useTranslation()
  return (
    <ConceptCenterLayout
      title={t('Compute Center')}
      description={t(
        'Explore GPU rentals for workloads such as batch inference and model fine-tuning.'
      )}
      boundary={t(
        'The configurations are illustrative. GPU reservations, training jobs, and billing are not available.'
      )}
      icon={Cpu}
      steps={[
        {
          title: t('Plan a GPU rental'),
          description: t(
            'Match GPU memory and capacity to your model and workload.'
          ),
        },
        {
          title: t('Prepare the workload'),
          description: t(
            'Select a model and use a reviewed dataset for fine-tuning.'
          ),
        },
        {
          title: t('Evaluate the result'),
          description: t(
            'Review the training output and compare it with the base model.'
          ),
        },
      ]}
      related={[
        { href: '/dataset-center', label: t('Dataset Center') },
        { href: '/agent-demo', label: t('Try the agent demo') },
      ]}
    >
      <ConceptSample
        title={t('Example GPU configurations')}
        description={t(
          'Switch workloads to compare sample resources, inputs, and outputs.'
        )}
      >
        <Tabs defaultValue='training'>
          <TabsList aria-label={t('Workload')} className='max-w-full'>
            <TabsTrigger value='training' className='px-2.5'>
              {t('Fine-tuning')}
            </TabsTrigger>
            <TabsTrigger value='inference' className='px-2.5'>
              {t('Batch inference')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='training' className='pt-3'>
            <ComputeExample
              memory='2 × 48 GB'
              input={t('A base model and reviewed training records')}
              output={t('A fine-tuned checkpoint and an evaluation report')}
            />
          </TabsContent>
          <TabsContent value='inference' className='pt-3'>
            <ComputeExample
              memory='1 × 24 GB'
              input={t('A model and a batch of sample requests')}
              output={t('Responses for the submitted batch')}
            />
          </TabsContent>
        </Tabs>
      </ConceptSample>
    </ConceptCenterLayout>
  )
}

function ComputeExample(props: {
  memory: string
  input: string
  output: string
}) {
  const { t } = useTranslation()
  return (
    <dl className='divide-border divide-y text-sm/relaxed'>
      <div className='flex flex-wrap items-center justify-between gap-2 py-3'>
        <dt className='text-muted-foreground'>{t('Example GPU memory')}</dt>
        <dd className='font-mono text-base font-medium tabular-nums'>
          {props.memory}
        </dd>
      </div>
      <div className='py-3'>
        <dt className='text-muted-foreground'>{t('Input')}</dt>
        <dd className='mt-1'>{props.input}</dd>
      </div>
      <div className='pt-3'>
        <dt className='text-muted-foreground'>{t('Output')}</dt>
        <dd className='mt-1'>{props.output}</dd>
      </div>
    </dl>
  )
}
