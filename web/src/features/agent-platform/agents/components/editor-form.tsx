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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useWorkspaceWriteAttempt } from '../../hooks/use-workspace-write-attempt'
import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import {
  AgentApiError,
  getAgentDraft,
  saveAgentDraft,
  validateAgentDraft,
} from '../api'
import {
  agentEditorFormSchema,
  configToEditorValues,
  editorValuesToConfig,
  pendingEditorValues,
  type AgentEditorValues,
} from '../form'
import type { AgentDraft, AgentValidationReport } from '../schemas'
import { AgentEditorFields } from './editor-fields'
import { PublicationDialog } from './publication-dialog'

export function AgentEditorForm(props: {
  workspaceId: string
  agentId: string
  name: string
  draft: AgentDraft
  session: WorkspaceWriteSession
  verified: boolean
  canPublish?: boolean
  agentStatus?: 'active' | 'disabled' | 'archived'
  onAccessLost: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [base, setBase] = useState(props.draft)
  const [failure, setFailure] = useState<'conflict' | 'unknown' | 'error'>()
  const [review, setReview] = useState<AgentDraft>()
  const [report, setReport] = useState<AgentValidationReport>()
  const [reading, setReading] = useState(false)
  const [saved, setSaved] = useState(false)
  const form = useForm<AgentEditorValues>({
    resolver: zodResolver(agentEditorFormSchema),
    defaultValues: base.config
      ? configToEditorValues(base.config)
      : pendingEditorValues(props.name),
  })
  const attempt = useWorkspaceWriteAttempt(props.session)
  const currentVerified = useRef(props.verified)
  currentVerified.current = props.verified
  const mutation = useMutation({
    mutationFn: async (operation: {
      values: AgentEditorValues
      signal: AbortSignal
    }) =>
      saveAgentDraft(
        props.workspaceId,
        props.agentId,
        base.revision,
        editorValuesToConfig(operation.values, props.name),
        props.session,
        operation.signal
      ),
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    meta: { errorToast: false, errorRedirect: false },
  })
  const validation = useMutation({
    mutationFn: (signal: AbortSignal) =>
      validateAgentDraft(
        props.workspaceId,
        props.agentId,
        base.revision,
        props.session,
        signal
      ),
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    meta: { errorToast: false, errorRedirect: false },
  })
  const busy =
    mutation.isPending ||
    validation.isPending ||
    reading ||
    form.formState.isSubmitting
  const conflict =
    failure === 'conflict' || props.draft.revision > base.revision
  const blocked = useBlocker({
    shouldBlockFn: () => form.formState.isDirty,
    enableBeforeUnload: form.formState.isDirty,
    withResolver: true,
  })
  useEffect(() => {
    const subscription = form.watch(() => {
      setReport(undefined)
      setSaved(false)
    })
    return () => subscription.unsubscribe()
  }, [form])

  function rejected(error: unknown, writeOutcome = false) {
    if (error instanceof AgentApiError) {
      if ([401, 403, 404, 503].includes(error.status ?? 0)) {
        props.onAccessLost()
        return
      }
      if (error.code === 'AG_DRAFT_REVISION_CONFLICT') {
        setFailure('conflict')
        setReview(undefined)
        return
      }
      const names: Record<string, keyof AgentEditorValues> = {
        instructions: 'instructions',
        'config.instructions': 'instructions',
        'model_policy.model': 'model',
        'config.model_policy.model': 'model',
        'model_policy.max_output_tokens': 'maxOutputTokens',
        'limits.max_steps': 'maxSteps',
        'limits.timeout_seconds': 'timeoutSeconds',
        'limits.max_cost_quota': 'maxCostQuota',
        input_schema: 'inputSchema',
        output_schema: 'outputSchema',
      }
      for (const path of error.fields) {
        if (names[path]) form.setError(names[path], { type: 'server' })
      }
      if (error.code === 'AG_DEPENDENCY_UNAVAILABLE') {
        form.setError('model', { type: 'server' })
      }
      setFailure(
        writeOutcome &&
          (error.retryable ||
            error.code === 'INVALID_RESPONSE' ||
            (error.status != null && error.status >= 500))
          ? 'unknown'
          : 'error'
      )
      return
    }
    setFailure('error')
  }
  const submit = form.handleSubmit(async (values) => {
    if (
      !currentVerified.current ||
      conflict ||
      mutation.isPending ||
      validation.isPending ||
      reading ||
      failure === 'unknown'
    ) {
      return
    }
    const controller = attempt.begin()
    if (!controller) return
    setFailure(undefined)
    setReport(undefined)
    try {
      const next = await mutation.mutateAsync({
        values,
        signal: controller.signal,
      })
      if (!attempt.current(controller)) return
      setBase(next)
      if (!next.config) {
        setFailure('unknown')
        return
      }
      form.reset(configToEditorValues(next.config))
      setReview(undefined)
      setSaved(true)
      props.onSaved()
    } catch (error) {
      if (attempt.current(controller)) rejected(error, true)
    } finally {
      attempt.finish(controller)
    }
  })
  async function loadLatest() {
    if (!currentVerified.current || busy) return
    const controller = attempt.begin()
    if (!controller) return
    setReading(true)
    try {
      const latest = await getAgentDraft(
        props.workspaceId,
        props.agentId,
        controller.signal
      )
      if (attempt.current(controller)) setReview(latest)
    } catch (error) {
      if (attempt.current(controller)) rejected(error)
    } finally {
      if (attempt.current(controller)) setReading(false)
      attempt.finish(controller)
    }
  }
  async function validate() {
    if (
      !currentVerified.current ||
      busy ||
      form.formState.isDirty ||
      conflict ||
      !base.config
    ) {
      return
    }
    const controller = attempt.begin()
    if (!controller) return
    setFailure(undefined)
    try {
      const data = await validation.mutateAsync(controller.signal)
      if (attempt.current(controller)) setReport(data)
    } catch (error) {
      if (attempt.current(controller)) rejected(error)
    } finally {
      attempt.finish(controller)
    }
  }
  return (
    <>
      <form
        className='min-w-0'
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <header className='mb-6 flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h2 className='text-xl font-semibold [overflow-wrap:anywhere]'>
              {props.name}
            </h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('Configure the saved draft before publishing.')}
            </p>
          </div>
          <Badge variant='secondary'>
            {t('Draft revision {{revision}}', {
              revision: formatNumber(base.revision, locale),
            })}
          </Badge>
        </header>
        {!base.config && (
          <Alert className='mb-6'>
            <AlertTitle>{t('Complete this draft')}</AlertTitle>
            <AlertDescription>
              {t(
                'Choose a model and add instructions. No model has been selected automatically.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {(conflict || failure === 'unknown') && (
          <Alert className='mb-6'>
            <AlertTitle>
              {conflict
                ? t('This draft has changed')
                : t('The save result is unknown')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'Your changes are kept here. Review the server draft before choosing what to save.'
              )}
              <div className='mt-3'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy || !props.verified}
                  onClick={() => void loadLatest()}
                >
                  {t('Review latest draft')}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        {review && (
          <section
            aria-label={t('Server draft')}
            className='mb-6 min-w-0 rounded-lg border p-4'
          >
            <h3 className='font-medium'>{t('Server draft')}</h3>
            <p className='text-muted-foreground mb-3 text-sm'>
              {t(
                'Compare this version with your changes. Merge the fields you need before continuing.'
              )}
            </p>
            <pre
              tabIndex={0}
              className='bg-muted mb-4 max-h-80 overflow-auto rounded-md p-3 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'
            >
              {JSON.stringify(review.config, null, 2)}
            </pre>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => {
                  setBase(review)
                  form.reset(
                    review.config
                      ? configToEditorValues(review.config)
                      : pendingEditorValues(props.name)
                  )
                  setFailure(undefined)
                  setReview(undefined)
                  setReport(undefined)
                }}
              >
                {t('Use server version')}
              </Button>
              <Button
                type='button'
                variant='secondary'
                disabled={busy}
                onClick={() => {
                  const local = form.getValues()
                  setBase(review)
                  form.reset(
                    review.config
                      ? configToEditorValues(review.config)
                      : pendingEditorValues(props.name)
                  )
                  for (const field of Object.keys(
                    local
                  ) as (keyof AgentEditorValues)[]) {
                    form.setValue(field, local[field], { shouldDirty: true })
                  }
                  setFailure(undefined)
                  setReview(undefined)
                  setReport(undefined)
                }}
              >
                {t('I have merged my changes')}
              </Button>
            </div>
          </section>
        )}
        {failure === 'error' && (
          <p role='alert' className='text-destructive mb-5 text-sm'>
            {t(
              'Unable to save or validate this draft. Check the highlighted fields and try again.'
            )}
          </p>
        )}
        <AgentEditorFields
          form={form}
          workspaceId={props.workspaceId}
          session={props.session}
          verified={props.verified}
          disabled={busy || !props.verified}
          onAccessLost={props.onAccessLost}
        />
        <Separator className='my-6' />
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p
            role='status'
            aria-live='polite'
            className='text-muted-foreground text-sm'
          >
            {saved ? t('Draft saved') : null}
            {!saved && form.formState.isDirty ? t('Unsaved changes') : null}
            {!saved && !form.formState.isDirty ? t('Saved draft') : null}
          </p>
          <div className='flex flex-wrap gap-2'>
            <PublicationDialog
              workspaceId={props.workspaceId}
              agentId={props.agentId}
              session={props.session}
              draftRevision={base.revision}
              verified={props.verified && props.canPublish === true}
              disabled={
                busy ||
                form.formState.isDirty ||
                conflict ||
                failure === 'unknown' ||
                !base.config ||
                props.agentStatus !== 'active'
              }
              onAccessLost={props.onAccessLost}
              onPublished={() => props.onSaved()}
              onRevisionConflict={() => setFailure('conflict')}
            />
            <Button
              type='button'
              variant='outline'
              disabled={
                busy ||
                !props.verified ||
                form.formState.isDirty ||
                conflict ||
                !base.config
              }
              onClick={() => void validate()}
            >
              {t('Validate saved draft')}
            </Button>
            <Button
              type='submit'
              disabled={
                busy ||
                !props.verified ||
                conflict ||
                failure === 'unknown' ||
                !form.formState.isDirty
              }
            >
              {mutation.isPending ? t('Saving...') : t('Save draft')}
            </Button>
          </div>
        </div>
        {report &&
          !conflict &&
          !form.formState.isDirty &&
          report.draft_revision === base.revision && (
            <Alert
              className='mt-6'
              variant={report.valid ? 'default' : 'destructive'}
            >
              <AlertTitle>
                {report.valid
                  ? t('Saved draft is valid')
                  : t('Saved draft needs changes')}
              </AlertTitle>
              <AlertDescription>
                {report.errors.length > 0 && (
                  <ul className='list-inside list-disc'>
                    {report.errors.map((issue) => (
                      <li key={`${issue.path}:${issue.code}:${issue.message}`}>
                        {issue.path}: {t(issue.message)}
                      </li>
                    ))}
                  </ul>
                )}
                {report.valid &&
                  t(
                    'Validation checks configuration only. It does not run a model or publish this Agent.'
                  )}
              </AlertDescription>
            </Alert>
          )}
      </form>
      <ConfirmDialog
        open={blocked.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocked.reset?.()
        }}
        title={t('Unsaved changes')}
        desc={t('You have unsaved changes. Are you sure you want to leave?')}
        confirmText={t('Leave')}
        cancelBtnText={t('Stay')}
        handleConfirm={() => blocked.proceed?.()}
      />
    </>
  )
}
