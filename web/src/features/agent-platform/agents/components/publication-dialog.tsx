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
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useWorkspaceWriteAttempt } from '../../hooks/use-workspace-write-attempt'
import { generateWorkspaceWriteKey } from '../../lib/workspace-write-fields'
import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import { AgentApiError, getAgent, getAgentDraft } from '../api'
import { publishAgentVersion } from '../release-api'
import type {
  AgentPublicationReceipt,
  AgentPublishInput,
} from '../release-schemas'
import { isAgentText, type AgentDraft } from '../schemas'

const noteSchema = z.object({
  releaseNote: z.string().refine((value) => isAgentText(value, 4096)),
})
type PublishPreview = { name: string; draft: AgentDraft }
type PublishIntent = { input: AgentPublishInput; key: string }

export function PublicationDialog(props: {
  workspaceId: string
  agentId: string
  session: WorkspaceWriteSession
  draftRevision: number
  verified: boolean
  disabled?: boolean
  onAccessLost: () => void
  onPublished: (receipt: AgentPublicationReceipt) => void
  onRevisionConflict?: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<PublishPreview>()
  const [failure, setFailure] = useState<
    'unknown' | 'conflict' | 'dependency' | 'error'
  >()
  const [receipt, setReceipt] = useState<AgentPublicationReceipt>()
  const [preparing, setPreparing] = useState(false)
  const intent = useRef<PublishIntent | null>(null)
  const verified = useRef(props.verified)
  verified.current = props.verified
  const attempt = useWorkspaceWriteAttempt(props.session)
  const form = useForm<z.infer<typeof noteSchema>>({
    defaultValues: { releaseNote: '' },
    resolver: zodResolver(noteSchema),
  })
  const publication = useMutation({
    mutationFn: (operation: { intent: PublishIntent; signal: AbortSignal }) =>
      publishAgentVersion(
        props.workspaceId,
        props.agentId,
        operation.intent.input,
        operation.intent.key,
        props.session,
        operation.signal
      ),
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    meta: { errorToast: false, errorRedirect: false },
  })
  const busy = preparing || publication.isPending || form.formState.isSubmitting

  function reject(error: unknown, writing: boolean) {
    if (error instanceof AgentApiError) {
      if (
        [401, 403, 404].includes(error.status ?? 0) ||
        error.code === 'AG_RUNTIME_UNAVAILABLE' ||
        (!writing && error.status === 503)
      ) {
        setOpen(false)
        props.onAccessLost()
        return
      }
      if (error.code === 'AG_DRAFT_REVISION_CONFLICT') {
        setFailure('conflict')
        props.onRevisionConflict?.()
        return
      }
      if (error.code === 'AG_DEPENDENCY_UNAVAILABLE') {
        setFailure('dependency')
        return
      }
      if (
        writing &&
        (error.retryable ||
          error.code === 'INVALID_RESPONSE' ||
          (error.status ?? 0) >= 500)
      ) {
        setFailure('unknown')
        return
      }
      intent.current = null
      setFailure('error')
      return
    }
    setFailure(writing ? 'unknown' : 'error')
  }

  async function prepare() {
    if (!props.verified || props.disabled || busy) return
    const controller = attempt.begin()
    if (!controller) return
    setOpen(true)
    setPreparing(true)
    setFailure(undefined)
    setPreview(undefined)
    setReceipt(undefined)
    intent.current = null
    try {
      const [metadata, draft] = await Promise.all([
        getAgent(props.workspaceId, props.agentId, controller.signal),
        getAgentDraft(props.workspaceId, props.agentId, controller.signal),
      ])
      if (!attempt.current(controller) || !verified.current) return
      if (metadata.status !== 'active' || !draft.config) {
        setFailure('error')
        return
      }
      if (draft.revision !== props.draftRevision) {
        setFailure('conflict')
        props.onRevisionConflict?.()
        return
      }
      setPreview({ name: metadata.name, draft })
    } catch (error) {
      if (attempt.current(controller)) reject(error, false)
    } finally {
      if (attempt.current(controller)) setPreparing(false)
      attempt.finish(controller)
    }
  }

  async function commit(operation: PublishIntent) {
    if (!verified.current || preparing || publication.isPending) return
    const controller = attempt.begin()
    if (!controller) return
    try {
      const result = await publication.mutateAsync({
        intent: operation,
        signal: controller.signal,
      })
      if (!attempt.current(controller)) return
      setReceipt(result)
      setFailure(undefined)
      intent.current = null
      props.onPublished(result)
    } catch (error) {
      if (attempt.current(controller)) reject(error, true)
    } finally {
      attempt.finish(controller)
    }
  }
  const submit = form.handleSubmit(async (values) => {
    if (
      !preview?.draft.config ||
      props.disabled ||
      !verified.current ||
      failure ||
      intent.current ||
      preparing ||
      publication.isPending
    ) {
      return
    }
    const operation = {
      input: {
        draft_revision: preview.draft.revision,
        release_note: values.releaseNote.trim(),
      },
      key: generateWorkspaceWriteKey('publish'),
    }
    intent.current = operation
    await commit(operation)
  })
  const config = preview?.draft.config
  function failureTitle() {
    if (failure === 'unknown') return t('Publication result is unknown')
    if (failure === 'conflict') {
      return t('The saved draft changed before publication')
    }
    if (failure === 'dependency') {
      return t('This version cannot be published under current policy')
    }
    return t('Unable to prepare or publish this draft')
  }
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={
          !props.verified || busy || (props.disabled && failure !== 'unknown')
        }
        onClick={() => {
          if (failure === 'unknown' && intent.current) setOpen(true)
          else void prepare()
        }}
      >
        {t('Publish')}
      </Button>
      <Dialog
        open={open && props.verified}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
        title={t('Publish saved draft')}
        description={t(
          'Review the exact saved configuration before creating an immutable version.'
        )}
        contentClassName='sm:max-w-xl'
      >
        {preparing && <p role='status'>{t('Checking the saved draft...')}</p>}
        {receipt && (
          <Alert>
            <AlertTitle>
              {t('Version {{version}} published', {
                version: formatNumber(receipt.version_no, locale),
              })}
            </AlertTitle>
            <AlertDescription>
              {t(
                'The current version is read from the server. Recovering an older receipt does not switch it back.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {failure && (
          <Alert variant='destructive'>
            <AlertTitle>{failureTitle()}</AlertTitle>
            <AlertDescription>
              {failure === 'unknown'
                ? t(
                    'Keep this original request. Retrying recovers its original version without publishing again.'
                  )
                : t(
                    'Review the saved draft and current permissions before preparing another publication.'
                  )}
            </AlertDescription>
          </Alert>
        )}
        {failure === 'unknown' && intent.current && (
          <div className='mt-4 flex justify-end'>
            <Button
              type='button'
              disabled={busy || !props.verified}
              onClick={() => {
                const current = intent.current
                if (current) void commit(current)
              }}
            >
              {t('Retry same publication')}
            </Button>
          </div>
        )}
        {!receipt && preview && config && (
          <form
            noValidate
            onSubmit={(event) => {
              event.stopPropagation()
              void submit(event)
            }}
            className='mt-4 space-y-5'
          >
            <dl className='grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm'>
              <dt>{t('Agent name')}</dt>
              <dd className='[overflow-wrap:anywhere]'>{preview.name}</dd>
              <dt>{t('Draft revision')}</dt>
              <dd>{formatNumber(preview.draft.revision, locale)}</dd>
              <dt>{t('Model')}</dt>
              <dd className='[overflow-wrap:anywhere]'>
                {config.model_policy.model}
              </dd>
              <dt>{t('Budget limit (quota)')}</dt>
              <dd>
                {formatNumber(Number(config.limits.max_cost_quota), locale)}
              </dd>
              <dt>{t('Timeout (seconds)')}</dt>
              <dd>{formatNumber(config.limits.timeout_seconds, locale)}</dd>
              <dt>{t('Maximum output tokens')}</dt>
              <dd>
                {formatNumber(config.model_policy.max_output_tokens, locale)}
              </dd>
              {config.model_policy.temperature !== undefined && (
                <>
                  <dt>{t('Temperature')}</dt>
                  <dd>
                    {formatNumber(config.model_policy.temperature, locale)}
                  </dd>
                </>
              )}
              <dt>{t('Maximum steps')}</dt>
              <dd>{formatNumber(config.limits.max_steps, locale)}</dd>
              <dt>{t('Maximum model calls')}</dt>
              <dd>{formatNumber(config.limits.max_model_calls, locale)}</dd>
              <dt>{t('Maximum tool calls')}</dt>
              <dd>{formatNumber(config.limits.max_tool_calls, locale)}</dd>
              <dt>{t('Dependencies')}</dt>
              <dd>{t('No tools or skills are bound to this text Agent.')}</dd>
            </dl>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Publishing changes the version selected by future runs. It does not execute a model or change historical versions.'
              )}
            </p>
            <Field data-invalid={Boolean(form.formState.errors.releaseNote)}>
              <FieldLabel htmlFor='agent-release-note'>
                {t('Release note')}
              </FieldLabel>
              <Textarea
                id='agent-release-note'
                rows={3}
                disabled={busy || failure === 'unknown'}
                {...form.register('releaseNote')}
              />
              {form.formState.errors.releaseNote && (
                <FieldError>
                  {t('Enter a release note of up to 4096 UTF-8 bytes.')}
                </FieldError>
              )}
            </Field>
            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='submit'
                disabled={
                  busy || !props.verified || Boolean(failure) || props.disabled
                }
              >
                {publication.isPending
                  ? t('Publishing...')
                  : t('Publish version')}
              </Button>
            </div>
          </form>
        )}
        {receipt && (
          <div className='mt-4 flex justify-end'>
            <Button type='button' onClick={() => setOpen(false)}>
              {t('Close')}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  )
}
