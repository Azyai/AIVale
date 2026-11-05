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
import { DialogFooter } from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { useWorkspaceWriteAttempt } from '../hooks/use-workspace-write-attempt'
import { workspaceNameFilterSchema } from '../lib/workspace-list-search'
import {
  workspaceEditFormSchema,
  type WorkspaceUpdateInput,
} from '../lib/workspace-management-form'
import type { AgentWorkspaceDetail } from '../workspace-detail-api'
import {
  AgentWorkspaceManagementError,
  updateAgentWorkspace,
} from '../workspace-management-api'
import type { WorkspaceManagementScope } from './workspace-management-actions'
import { WorkspaceRevisionReview } from './workspace-revision-review'

export function WorkspaceEditForm(
  props: WorkspaceManagementScope & {
    base: AgentWorkspaceDetail
    onSaved: () => void
    onClose: () => void
    onBusy: (busy: boolean) => void
  }
) {
  const { t } = useTranslation()
  const id = useId()
  const [base, setBase] = useState(props.base)
  const [failure, setFailure] = useState<'revision' | 'error' | 'no-changes'>()
  const [requested, setRequested] = useState(false)
  const latest = useRef(props.workspace)
  useLayoutEffect(() => {
    latest.current = props.workspace
  }, [props.workspace])
  const attempt = useWorkspaceWriteAttempt(props.session)
  const form = useForm<{ name: string; description: string }>({
    resolver: zodResolver(workspaceEditFormSchema),
    defaultValues: { name: base.name, description: base.description },
  })
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    gcTime: 0,
    meta: { errorToast: false, errorRedirect: false },
    mutationFn: ({
      input,
      signal,
    }: {
      input: WorkspaceUpdateInput
      signal: AbortSignal
    }) => updateAgentWorkspace(base.id, input, props.session, signal),
  })
  const busy = form.formState.isSubmitting || mutation.isPending
  const needsReview =
    failure === 'revision' ||
    (props.workspace != null && props.workspace.revision !== base.revision)
  const review =
    requested && props.workspace && props.workspace.revision !== base.revision
      ? props.workspace
      : undefined
  const submit = form.handleSubmit(async (values) => {
    if (
      !latest.current ||
      latest.current.revision !== base.revision ||
      needsReview
    ) {
      return
    }
    const input: WorkspaceUpdateInput = {
      expected_revision: base.revision,
      ...(values.name !== base.name ? { name: values.name } : {}),
      ...(values.description !== base.description
        ? { description: values.description }
        : {}),
    }
    if (input.name == null && input.description == null) {
      setFailure('no-changes')
      return
    }
    const controller = attempt.begin()
    if (!controller) return
    props.onBusy(true)
    setFailure(undefined)
    try {
      await mutation.mutateAsync({ input, signal: controller.signal })
      if (!attempt.current(controller)) return
      props.onSaved()
      props.onClose()
    } catch (error) {
      if (!attempt.current(controller)) return
      if (error instanceof AgentWorkspaceManagementError) {
        if (
          error.status === 401 ||
          error.status === 403 ||
          error.status === 404
        ) {
          props.onAccessLost()
          return
        }
        if (error.status === 409) {
          setFailure('revision')
          setRequested(false)
          return
        }
        const fields = error.fields.filter(
          (field) => field === 'name' || field === 'description'
        )
        if (fields.length > 0) {
          for (const field of fields) form.setError(field, { type: 'server' })
          return
        }
      }
      setFailure('error')
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
      {props.workspace ? (
        <FieldGroup className='gap-4'>
          <Field data-invalid={Boolean(form.formState.errors.name)}>
            <FieldLabel htmlFor={`${id}-name`}>
              {t('Workspace name')}
            </FieldLabel>
            <Input
              id={`${id}-name`}
              disabled={busy}
              aria-required='true'
              aria-invalid={Boolean(form.formState.errors.name)}
              aria-describedby={
                form.formState.errors.name ? `${id}-name-error` : undefined
              }
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <FieldError id={`${id}-name-error`}>
                {t('Enter a workspace name of up to 128 characters.')}
              </FieldError>
            )}
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.description)}>
            <FieldLabel htmlFor={`${id}-description`}>
              {t('Description')}
            </FieldLabel>
            <Textarea
              id={`${id}-description`}
              rows={3}
              disabled={busy}
              aria-invalid={Boolean(form.formState.errors.description)}
              aria-describedby={
                form.formState.errors.description
                  ? `${id}-description-error`
                  : undefined
              }
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <FieldError id={`${id}-description-error`}>
                {t('Enter a description of up to 4096 bytes.')}
              </FieldError>
            )}
          </Field>
        </FieldGroup>
      ) : null}
      {(needsReview || !props.workspace) && (
        <WorkspaceRevisionReview
          latest={review}
          conflict={needsReview}
          busy={busy}
          onReload={() => {
            setRequested(true)
            void props.onReload()
          }}
          onUseLatest={(current) => {
            const draft = form.getValues()
            const normalizedName = workspaceNameFilterSchema.safeParse(
              draft.name
            )
            form.reset({
              name:
                normalizedName.success && normalizedName.data === base.name
                  ? current.name
                  : draft.name,
              description:
                draft.description === base.description
                  ? current.description
                  : draft.description,
            })
            setBase(current)
            setFailure(undefined)
            setRequested(false)
          }}
        />
      )}
      {failure === 'error' && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Unable to save workspace changes.')}
        </p>
      )}
      {failure === 'no-changes' && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('No changes to save.')}
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
          disabled={busy || !props.workspace || needsReview}
        >
          {t('Save changes')}
        </Button>
      </DialogFooter>
    </form>
  )
}
