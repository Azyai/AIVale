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
import { BookOpen, Quote } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  ConceptCenterLayout,
  ConceptSample,
} from './components/concept-center-layout'

export function KnowledgeBaseConcept() {
  const { t } = useTranslation()
  return (
    <ConceptCenterLayout
      title={t('Knowledge Base')}
      description={t(
        'Give agents trusted documents to search and cite when they answer questions.'
      )}
      boundary={t(
        'This preview uses fictional documents. It does not upload files or call a model.'
      )}
      icon={BookOpen}
      steps={[
        {
          title: t('Collect sources'),
          description: t(
            'Organize approved documents in a library for your team.'
          ),
        },
        {
          title: t('Index and retrieve'),
          description: t(
            'Split documents into passages and find relevant excerpts at question time.'
          ),
        },
        {
          title: t('Ground agent answers'),
          description: t(
            'Attach the library to an agent and include citations in its answers.'
          ),
        },
      ]}
      related={[
        { href: '/agent-demo', label: t('Try the agent demo') },
        { href: '/dataset-center', label: t('Dataset Center') },
      ]}
    >
      <ConceptSample
        title={t('RAG retrieval walkthrough')}
        description={t(
          'Choose a sample question to see the retrieved passage and how an agent could cite it.'
        )}
      >
        <Tabs defaultValue='handoff'>
          <TabsList aria-label={t('Sample question')} className='max-w-full'>
            <TabsTrigger value='handoff' className='px-2.5'>
              {t('Support handoff')}
            </TabsTrigger>
            <TabsTrigger value='launch' className='px-2.5'>
              {t('Launch review')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='handoff' className='pt-3'>
            <KnowledgeAnswer
              question={t(
                'What should an agent include when handing off a support case?'
              )}
              answer={t(
                'Include the customer’s goal, the steps already tried, and the next action.'
              )}
              source={t('Support handbook')}
              passage={t(
                'A handoff must state the customer’s goal, attempted steps, and the next action.'
              )}
            />
          </TabsContent>
          <TabsContent value='launch' className='pt-3'>
            <KnowledgeAnswer
              question={t('What must be checked before launching an agent?')}
              answer={t(
                'Review sample answers and confirm that the agent cites the right sources.'
              )}
              source={t('Agent launch checklist')}
              passage={t(
                'Before launch, review sample answers and verify the sources cited.'
              )}
            />
          </TabsContent>
        </Tabs>
      </ConceptSample>
    </ConceptCenterLayout>
  )
}

function KnowledgeAnswer(props: {
  question: string
  answer: string
  source: string
  passage: string
}) {
  const { t } = useTranslation()
  return (
    <dl className='space-y-4 text-sm/relaxed'>
      <div>
        <dt className='text-muted-foreground text-xs font-medium'>
          {t('Question')}
        </dt>
        <dd className='mt-1 font-medium'>{props.question}</dd>
      </div>
      <div>
        <dt className='text-muted-foreground text-xs font-medium'>
          {t('Answer')}
        </dt>
        <dd className='mt-1'>
          {props.answer} <sup className='text-primary font-medium'>[1]</sup>
        </dd>
      </div>
      <div className='border-border border-t pt-4'>
        <dt className='flex items-center gap-2 font-medium'>
          <Quote className='text-primary size-4' aria-hidden='true' />
          <span>[1] {props.source}</span>
        </dt>
        <dd className='text-muted-foreground mt-1'>{props.passage}</dd>
      </div>
    </dl>
  )
}
