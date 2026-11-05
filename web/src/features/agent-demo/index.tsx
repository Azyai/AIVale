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
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Play, RotateCcw } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { SkipToMain } from '@/components/skip-to-main'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { DemoRun, runCompleteStep } from './demo-run'

type Scenario = 'recovery' | 'refund'

export function AgentDemo() {
  const { t } = useTranslation()
  const selectId = useId()
  const knowledgeId = useId()
  const [scenario, setScenario] = useState<Scenario>('recovery')
  const [includeKnowledge, setIncludeKnowledge] = useState(true)
  const [step, setStep] = useState<number | null>(null)
  const scenarios = [
    { value: 'recovery', label: t('Account recovery') },
    { value: 'refund', label: t('Subscription refund') },
  ] as const

  const running = step !== null && step < runCompleteStep
  const example =
    scenario === 'recovery'
      ? {
          question: t('I forgot my password. How do I regain access?'),
          reply: t(
            'Use “Forgot password” on the sign-in page. The recovery link expires after 30 minutes. [1]'
          ),
          title: t('Account access guide'),
          excerpt: t(
            'Recovery links expire after 30 minutes. Use the most recent email if you requested more than one link.'
          ),
        }
      : {
          question: t('Can I get a refund for a new subscription?'),
          reply: t(
            'For this fictional service, request a refund within 14 days of your first purchase. Renewals are excluded. [1]'
          ),
          title: t('Refund policy sample'),
          excerpt: t(
            'First subscription purchases may be refunded within 14 days. Renewals are excluded.'
          ),
        }

  useEffect(() => {
    if (!running || step === null) return
    const timer = window.setTimeout(() => setStep(step + 1), 280)
    return () => window.clearTimeout(timer)
  }, [running, step])

  function reset() {
    setScenario('recovery')
    setIncludeKnowledge(true)
    setStep(null)
  }

  return (
    <>
      <SkipToMain />
      <PublicLayout showMainContainer={false}>
        <main
          id='content'
          tabIndex={-1}
          className='mx-auto w-full max-w-6xl scroll-mt-24 px-5 pt-28 pb-16 sm:px-8 md:pt-36 md:pb-24'
        >
          <Link
            to='/agent-platform'
            className={buttonVariants({
              variant: 'ghost',
              size: 'sm',
              className: '-ml-2',
            })}
          >
            <ArrowLeft aria-hidden='true' />
            {t('Agent workbench')}
          </Link>
          <div className='mt-4 flex flex-wrap items-center gap-x-4 gap-y-2'>
            <h1 className='text-3xl font-semibold tracking-tight sm:text-5xl'>
              {t('Agent workbench demo')}
            </h1>
            <Badge variant='outline'>{t('Sample data only')}</Badge>
          </div>
          <p className='text-muted-foreground mt-4 max-w-[68ch] text-base/relaxed'>
            {t(
              'Try a support agent with sample questions, a reference lookup, and a visible run trace.'
            )}
          </p>
          <p className='text-muted-foreground mt-2 text-sm/relaxed'>
            {t(
              'This preview runs in your browser without model calls, uploads, or billing.'
            )}
          </p>

          <div className='border-border mt-8 grid grid-cols-1 gap-y-8 border-t pt-7 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-x-9'>
            <form
              className='min-w-0 space-y-5'
              onSubmit={(event) => {
                event.preventDefault()
                if (!running) setStep(0)
              }}
            >
              <h2 className='text-lg font-semibold'>
                {t('Set up the example')}
              </h2>
              <div className='space-y-2'>
                <Label htmlFor={selectId}>{t('Scenario')}</Label>
                <Select
                  disabled={running}
                  items={scenarios}
                  value={scenario}
                  onValueChange={(value) => {
                    if (value === null) return
                    setScenario(value)
                    setStep(null)
                  }}
                >
                  <SelectTrigger id={selectId} className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {scenarios.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='border-border bg-muted/30 space-y-1.5 rounded-md border p-4'>
                <p className='text-muted-foreground text-xs font-medium'>
                  {t('Sample question')}
                </p>
                <p className='text-sm leading-relaxed'>{example.question}</p>
              </div>

              <div className='flex items-start gap-3'>
                <Checkbox
                  className='mt-0.5'
                  id={knowledgeId}
                  aria-describedby={`${knowledgeId}-hint`}
                  checked={includeKnowledge}
                  disabled={running}
                  onCheckedChange={(next) => {
                    setIncludeKnowledge(next)
                    setStep(null)
                  }}
                />
                <div className='min-w-0 space-y-1'>
                  <Label htmlFor={knowledgeId}>
                    {t('Include sample knowledge')}
                  </Label>
                  <p
                    id={`${knowledgeId}-hint`}
                    className='text-muted-foreground text-sm/relaxed'
                  >
                    {t(
                      'Add a sample document so the reply can cite its source.'
                    )}
                  </p>
                </div>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <Button type='submit' disabled={running}>
                  <Play aria-hidden='true' />
                  {t('Run example')}
                </Button>
                <Button type='button' variant='ghost' onClick={reset}>
                  <RotateCcw aria-hidden='true' />
                  {t('Reset example')}
                </Button>
              </div>
            </form>

            <DemoRun
              step={step}
              includeKnowledge={includeKnowledge}
              reply={example.reply}
              sourceTitle={example.title}
              sourceExcerpt={example.excerpt}
            />
          </div>
        </main>
      </PublicLayout>
    </>
  )
}
