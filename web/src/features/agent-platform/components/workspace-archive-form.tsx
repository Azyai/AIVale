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
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

import { useWorkspaceWriteAttempt } from '../hooks/use-workspace-write-attempt'
import {
  newWorkspaceArchiveIntent,
  workspaceArchiveFormSchema,
  type WorkspaceArchiveIntent,
} from '../lib/workspace-management-form'
import type { AgentWorkspaceDetail } from '../workspace-detail-api'
import {
  AgentWorkspaceManagementError,
  archiveAgentWorkspace,
} from '../workspace-management-api'
import type { WorkspaceManagementScope } from './workspace-management-actions'
import { WorkspaceRevisionReview } from './workspace-revision-review'

type ArchiveFailure = 'revision' | 'blocked' | 'protected' | 'unknown' | 'error'

export function WorkspaceArchiveForm(
  props: WorkspaceManagementScope & {
    base: AgentWorkspaceDetail
    onArchiveHold: (active: boolean, recheck?: boolean) => void
    onArchived: () => void
    onClose: () => void
    onBusy: (busy: boolean) => void
  }
) {
  const { t } = useTranslation()
  const id = useId()
  const [base, setBase] = useState(props.base)
  const [confirmed, setConfirmed] = useState(false)
  const [failure, setFailure] = useState<ArchiveFailure>()
  const [requested, setRequested] = useState(false)
  const intent = useRef<WorkspaceArchiveIntent | null>(null)
  const latest = useRef(props.workspace)
  useLayoutEffect(() => {
    latest.current = props.workspace
  }, [props.workspace])
  const attempt = useWorkspaceWriteAttempt(props.session)
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(workspaceArchiveFormSchema),
    defaultValues: { reason: '' },
  })
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    meta: { errorToast: false, errorRedirect: false },
    mutationFn: ({
      entry,
      signal,
    }: {
      entry: WorkspaceArchiveIntent
      signal: AbortSignal
    }) =>
      archiveAgentWorkspace(
        base.id,
        entry.input,
        entry.key,
        props.session,
        signal
      ),
  })
  const busy = form.formState.isSubmitting || mutation.isPending
  const uncertain = failure === 'unknown'
  const needsReview =
    !uncertain &&
    (failure === 'revision' ||
      (props.workspace != null && props.workspace.revision !== base.revision))
  const review =
    requested && props.workspace && props.workspace.revision !== base.revision
      ? props.workspace
      : undefined
  const submit = form.handleSubmit(async ({ reason }) => {
    if (
      !confirmed ||
      needsReview ||
      (!uncertain && latest.current?.revision !== base.revision)
    ) {
      return
    }
    const controller = attempt.begin()
    if (!controller) return
    props.onBusy(true)
    try {
      const entry = uncertain
        ? intent.current
        : newWorkspaceArchiveIntent(
            base.id,
            { expected_revision: base.revision, reason },
            JSON.stringify(props.session),
            intent.current
          )
      if (!entry) return
      intent.current = entry
      setFailure(undefined)
      props.onArchiveHold(true)
      await mutation.mutateAsync({ entry, signal: controller.signal })
      if (attempt.current(controller)) props.onArchived()
    } catch (error) {
      if (!attempt.current(controller)) return
      const failure =
        error instanceof AgentWorkspaceManagementError ? error : undefined
      if (
        failure?.status === 401 ||
        failure?.status === 403 ||
        failure?.status === 404
      ) {
        props.onAccessLost()
        return
      }
      if (failure?.code === 'AG_RESOURCE_IN_USE') {
        setFailure('blocked')
      } else if (failure?.code === 'AG_RUNTIME_UNAVAILABLE') {
        setFailure('protected')
      } else if (failure?.code === 'AG_DRAFT_REVISION_CONFLICT') {
        setFailure('revision')
        setRequested(false)
      } else if (failure?.fields.includes('reason')) {
        form.setError('reason', { type: 'server' })
      } else if (
        intent.current &&
        (!failure?.status ||
          failure.status >= 500 ||
          failure.code === 'INVALID_RESPONSE' ||
          failure.code === 'AG_REQUEST_IN_PROGRESS')
      ) {
        setFailure('unknown')
        return
      } else {
        setFailure('error')
      }
      props.onArchiveHold(false)
    } finally {
      const live = attempt.current(controller)
      attempt.finish(controller)
      if (live) props.onBusy(false)
    }
  })

  return (
    <form
      className='space-y-4'
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      {(props.workspace || uncertain) && (
        <Field data-invalid={Boolean(form.formState.errors.reason)}>
          <FieldLabel htmlFor={`${id}-reason`}>
            {t('Archive reason')}
          </FieldLabel>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            readOnly={uncertain}
            disabled={busy}
            aria-required='true'
            aria-invalid={Boolean(form.formState.errors.reason)}
            aria-describedby={
              form.formState.errors.reason ? `${id}-reason-error` : undefined
            }
            {...form.register('reason')}
          />
          {form.formState.errors.reason && (
            <FieldError id={`${id}-reason-error`}>
              {t('Enter an archive reason of up to 512 characters.')}
            </FieldError>
          )}
        </Field>
      )}
      {(props.workspace || uncertain) && (
        <div className='flex items-start gap-3'>
          <Checkbox
            id={`${id}-confirm`}
            className='mt-0.5'
            checked={confirmed}
            disabled={busy || uncertain}
            onCheckedChange={setConfirmed}
          />
          <FieldLabel htmlFor={`${id}-confirm`}>
            {t('I confirm that I want to archive this workspace.')}
          </FieldLabel>
        </div>
      )}
      {(needsReview || (!props.workspace && !uncertain)) && (
        <WorkspaceRevisionReview
          latest={review}
          conflict={needsReview}
          busy={busy}
          onReload={() => {
            setRequested(true)
            void props.onReload()
          }}
          onUseLatest={(current) => {
            setBase(current)
            setConfirmed(false)
            setRequested(false)
            setFailure(undefined)
          }}
        />
      )}
      {failure === 'blocked' && (
        <p role='alert' className='text-destructive text-sm'>
          {t('This workspace has active runs and cannot be archived.')}
        </p>
      )}
      {failure === 'protected' && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Archiving is unavailable while runtime resources are protected.')}
        </p>
      )}
      {failure === 'error' && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Unable to archive workspace.')}
        </p>
      )}
      {uncertain && (
        <p role='alert' className='text-destructive text-sm'>
          {t('The archive result is unknown. Retry to check the same request.')}
        </p>
      )}
      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={props.onClose}
        >
          {t('Cancel')}
        </Button>
        <Button
          type='submit'
          variant='destructive'
          disabled={
            busy ||
            !confirmed ||
            needsReview ||
            (!props.workspace && !uncertain)
          }
        >
          {t('Archive workspace')}
        </Button>
      </DialogFooter>
    </form>
  )
}
