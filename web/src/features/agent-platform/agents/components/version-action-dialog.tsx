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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { useWorkspaceWriteAttempt } from '../../hooks/use-workspace-write-attempt'
import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import { AgentApiError, getAgent, getAgentDraft } from '../api'
import {
  activateAgentVersion,
  archiveAgent,
  restoreAgentVersion,
  setAgentStatus,
} from '../release-api'
import type { AgentLifecycleState } from '../release-schemas'
import { type AgentDraft, isAgentText } from '../schemas'

export type AgentVersionAction =
  | 'restore'
  | 'activate'
  | 'disable'
  | 'enable'
  | 'archive'
const labels = {
  restore: 'Restore version',
  activate: 'Set current version',
  disable: 'Disable Agent',
  enable: 'Enable Agent',
  archive: 'Archive Agent',
} as const
type PreparedAction = {
  workspaceId: string
  agentId: string
  session: WorkspaceWriteSession
  action: AgentVersionAction
  versionId?: string
  revision: number
  currentVersionId: string | null
  reason: string
}

export function AgentVersionActionDialog(props: {
  workspaceId: string
  agentId: string
  session: WorkspaceWriteSession
  action: AgentVersionAction
  versionId?: string
  verified: boolean
  disabled?: boolean
  onAccessLost: () => void
  onChanged: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [open, setOpen] = useState(false)
  const [activeAction, setActiveAction] = useState(props.action)
  const [activeVersionId, setActiveVersionId] = useState(props.versionId)
  const [confirm, setConfirm] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [snapshot, setSnapshot] = useState<PreparedAction>()
  const [failure, setFailure] = useState<'conflict' | 'unknown' | 'error'>()
  const [done, setDone] = useState(false)
  const pendingIntent = useRef<PreparedAction | null>(null)
  const verified = useRef(props.verified)
  verified.current = props.verified
  const attempt = useWorkspaceWriteAttempt(props.session)
  const schema = z.object({
    reason: z
      .string()
      .refine(
        (value) =>
          activeAction === 'restore' ||
          (value.trim() !== '' && isAgentText(value, 1024))
      ),
  })
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  })
  const mutation = useMutation({
    mutationFn: ({
      prepared,
      signal,
    }: {
      prepared: PreparedAction
      signal: AbortSignal
    }): Promise<AgentDraft | AgentLifecycleState> => {
      const expected_revision = prepared.revision
      const reason = prepared.reason
      if (prepared.action === 'restore' && prepared.versionId) {
        return restoreAgentVersion(
          prepared.workspaceId,
          prepared.agentId,
          { version_id: prepared.versionId, expected_revision },
          prepared.session,
          signal
        )
      }
      if (prepared.action === 'activate' && prepared.versionId) {
        return activateAgentVersion(
          prepared.workspaceId,
          prepared.agentId,
          { version_id: prepared.versionId, expected_revision, reason },
          prepared.session,
          signal
        )
      }
      if (prepared.action === 'archive') {
        return archiveAgent(
          prepared.workspaceId,
          prepared.agentId,
          { expected_revision, reason },
          prepared.session,
          signal
        )
      }
      if (prepared.action !== 'disable' && prepared.action !== 'enable') {
        return Promise.reject(new Error('Invalid Agent action'))
      }
      return setAgentStatus(
        prepared.workspaceId,
        prepared.agentId,
        {
          status: prepared.action === 'enable' ? 'active' : 'disabled',
          expected_revision,
          reason,
        },
        prepared.session,
        signal
      )
    },
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    meta: { errorToast: false, errorRedirect: false },
  })
  const busy = preparing || mutation.isPending
  function rejected(error: unknown, writing: boolean) {
    setConfirm(false)
    pendingIntent.current = null
    setSnapshot(undefined)
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
      if (error.status === 409) {
        setFailure('conflict')
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
    }
    setFailure(
      writing && !(error instanceof AgentApiError) ? 'unknown' : 'error'
    )
  }
  async function prepare(reset: boolean) {
    if (!verified.current || (reset && props.disabled) || busy) return
    const controller = attempt.begin()
    if (!controller) return
    const target = {
      workspaceId: props.workspaceId,
      agentId: props.agentId,
      session: props.session,
      action: reset ? props.action : activeAction,
      versionId: reset ? props.versionId : activeVersionId,
    }
    setActiveAction(target.action)
    setActiveVersionId(target.versionId)
    setOpen(true)
    setPreparing(true)
    setSnapshot(undefined)
    setConfirm(false)
    setFailure(undefined)
    setDone(false)
    pendingIntent.current = null
    if (reset) form.reset({ reason: '' })
    try {
      if (target.action === 'restore') {
        const draft = await getAgentDraft(
          props.workspaceId,
          props.agentId,
          controller.signal
        )
        if (attempt.current(controller) && verified.current) {
          setSnapshot({
            ...target,
            revision: draft.revision,
            currentVersionId: null,
            reason: '',
          })
        }
      } else {
        const metadata = await getAgent(
          props.workspaceId,
          props.agentId,
          controller.signal
        )
        if (attempt.current(controller) && verified.current) {
          if (metadata.status === 'archived') {
            props.onAccessLost()
            return
          }
          setSnapshot({
            ...target,
            revision: metadata.revision,
            currentVersionId: metadata.current_version_id,
            reason: '',
          })
        }
      }
    } catch (error) {
      if (attempt.current(controller)) rejected(error, false)
    } finally {
      if (attempt.current(controller)) setPreparing(false)
      attempt.finish(controller)
    }
  }
  const review = form.handleSubmit((values) => {
    if (!snapshot || busy || !verified.current || failure) return
    pendingIntent.current = { ...snapshot, reason: values.reason.trim() }
    setConfirm(true)
  })
  async function commit() {
    const prepared = pendingIntent.current
    if (!prepared || busy || !verified.current) return
    if (
      prepared.workspaceId !== props.workspaceId ||
      prepared.agentId !== props.agentId ||
      prepared.session.userId !== props.session.userId ||
      prepared.session.sessionId !== props.session.sessionId
    ) {
      return
    }
    const controller = attempt.begin()
    if (!controller) return
    try {
      await mutation.mutateAsync({ prepared, signal: controller.signal })
      if (!attempt.current(controller)) return
      setConfirm(false)
      setDone(true)
      setSnapshot(undefined)
      pendingIntent.current = null
      props.onChanged()
    } catch (error) {
      if (attempt.current(controller)) rejected(error, true)
    } finally {
      attempt.finish(controller)
    }
  }
  function description() {
    if (activeAction === 'restore') {
      return t(
        'Copy this immutable version into the draft. This does not publish or change the current version.'
      )
    }
    if (activeAction === 'activate') {
      return t(
        'Choose the version for future runs. The draft and disabled status are preserved.'
      )
    }
    return t('Review the current Agent state before changing its lifecycle.')
  }
  function failureTitle() {
    if (failure === 'conflict') return t('The Agent changed before this action')
    if (failure === 'unknown') return t('The action result is unknown')
    return t('Unable to prepare or complete this action')
  }
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={!props.verified || props.disabled || busy}
        onClick={() => void prepare(true)}
      >
        {t(labels[props.action])}
      </Button>
      <Dialog
        open={open && props.verified}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
        title={t(labels[activeAction])}
        description={description()}
      >
        {preparing && <p role='status'>{t('Reading current state...')}</p>}
        {done && (
          <Alert>
            <AlertTitle>{t('Action completed')}</AlertTitle>
            <AlertDescription>
              {t('The latest state is read from the server.')}
            </AlertDescription>
          </Alert>
        )}
        {failure && (
          <Alert variant='destructive'>
            <AlertTitle>{failureTitle()}</AlertTitle>
            <AlertDescription>
              {t(
                'Your reason is kept. Reload the current state, review it, and confirm a new action. The previous write will not be retried.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {failure && (
          <Button
            className='mt-4'
            type='button'
            variant='outline'
            disabled={busy || !props.verified}
            onClick={() => void prepare(false)}
          >
            {t('Reload current state')}
          </Button>
        )}
        {!done && (
          <form
            noValidate
            onSubmit={(event) => void review(event)}
            className='mt-4 space-y-4'
          >
            {snapshot && (
              <p className='text-muted-foreground text-sm'>
                {activeAction === 'restore'
                  ? t('Current draft revision: {{revision}}', {
                      revision: formatNumber(snapshot.revision, locale),
                    })
                  : t('Current metadata revision: {{revision}}', {
                      revision: formatNumber(snapshot.revision, locale),
                    })}
              </p>
            )}
            {activeVersionId && (
              <p className='text-sm'>
                {t('Version ID')}:{' '}
                <span className='font-mono'>{activeVersionId}</span>
              </p>
            )}
            {snapshot && activeAction !== 'restore' && (
              <p className='text-sm'>
                {t('Current version ID')}:{' '}
                <span className='font-mono'>
                  {snapshot.currentVersionId ?? t('Not published')}
                </span>
              </p>
            )}
            {activeAction !== 'restore' && (
              <Field data-invalid={Boolean(form.formState.errors.reason)}>
                <FieldLabel htmlFor={`agent-action-reason-${activeAction}`}>
                  {t('Reason')}
                </FieldLabel>
                <Textarea
                  id={`agent-action-reason-${activeAction}`}
                  rows={3}
                  disabled={busy || confirm}
                  {...form.register('reason')}
                />
                {form.formState.errors.reason && (
                  <FieldError>
                    {t('Enter a reason of 1 to 1024 UTF-8 bytes.')}
                  </FieldError>
                )}
              </Field>
            )}
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
                  !snapshot || busy || Boolean(failure) || !props.verified
                }
              >
                {t('Review action')}
              </Button>
            </div>
          </form>
        )}
        {done && (
          <div className='mt-4 flex justify-end'>
            <Button type='button' onClick={() => setOpen(false)}>
              {t('Close')}
            </Button>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={open && confirm && props.verified}
        onOpenChange={(next) => {
          if (!busy) setConfirm(next)
        }}
        title={t(labels[activeAction])}
        desc={
          <div className='space-y-2'>
            <p>
              {t('Confirm this action against the state you just reviewed.')}
            </p>
            {activeAction !== 'restore' && (
              <p className='[overflow-wrap:anywhere] whitespace-pre-wrap'>
                {pendingIntent.current?.reason}
              </p>
            )}
          </div>
        }
        confirmText={t('Confirm action')}
        disabled={!props.verified}
        isLoading={mutation.isPending}
        destructive={activeAction === 'archive' || activeAction === 'disable'}
        handleConfirm={() => void commit()}
      />
    </>
  )
}
