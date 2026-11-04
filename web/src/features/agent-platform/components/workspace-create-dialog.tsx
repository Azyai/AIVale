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
import { Plus } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import {
  newWorkspaceCreateIntent,
  workspaceCreateFormSchema,
  type WorkspaceCreateFormValues,
  type WorkspaceCreateInput,
  type WorkspaceCreateIntent,
} from '../lib/workspace-create-form'
import {
  AgentWorkspaceCreateError,
  createAgentWorkspace,
  getWorkspaceCreateEligibility,
  isCurrentWorkspaceCreateSession,
  type WorkspaceCreateSession,
} from '../workspace-create-api'
import { WorkspaceCreateFields } from './workspace-create-fields'

const defaults: WorkspaceCreateFormValues = {
  name: '',
  description: '',
  slug: '',
}

export function WorkspaceCreateDialog(props: {
  session: WorkspaceCreateSession
  verified: boolean
  checking: boolean
  onCreated: (id: string) => void
  onAccessLost: () => Promise<void>
  onRecheck: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const openForm = useRef<object | null>(null)
  const [submissionError, setSubmissionError] = useState(false)
  const attempt = useRef<AbortController | null>(null)
  const intent = useRef<WorkspaceCreateIntent | null>(null)
  const form = useForm<
    WorkspaceCreateFormValues,
    unknown,
    WorkspaceCreateInput
  >({
    defaultValues: defaults,
    resolver: zodResolver(workspaceCreateFormSchema),
  })
  const { session } = props
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    meta: { errorToast: false, errorRedirect: false },
    mutationFn: async (operation: {
      intent: WorkspaceCreateIntent
      signal: AbortSignal
    }) => {
      const eligibility = await getWorkspaceCreateEligibility(operation.signal)
      if (!eligibility.can_create || eligibility.team_id !== session.teamId) {
        return null
      }
      return createAgentWorkspace(
        operation.intent.input,
        operation.intent.key,
        session,
        operation.signal
      )
    },
  })
  const busy = form.formState.isSubmitting || mutation.isPending

  useLayoutEffect(
    () => () => {
      openForm.current = null
      attempt.current?.abort()
    },
    []
  )

  function changeOpen(next: boolean) {
    openForm.current = next ? {} : null
    setOpen(next)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const submittingForm = openForm.current
    if (!submittingForm) {
      event.preventDefault()
      return
    }
    // The resolver is asynchronous; leaving or reopening this form invalidates its callback.
    void form.handleSubmit(async (input) => {
      if (
        openForm.current !== submittingForm ||
        !props.verified ||
        attempt.current ||
        !isCurrentWorkspaceCreateSession(session)
      ) {
        return
      }
      const controller = new AbortController()
      attempt.current = controller
      setSubmissionError(false)
      form.clearErrors()
      try {
        intent.current = newWorkspaceCreateIntent(
          input,
          JSON.stringify(session),
          intent.current
        )
        const receipt = await mutation.mutateAsync({
          intent: intent.current,
          signal: controller.signal,
        })
        if (
          openForm.current !== submittingForm ||
          controller.signal.aborted ||
          !isCurrentWorkspaceCreateSession(session)
        ) {
          return
        }
        if (receipt === null) {
          await props.onAccessLost()
          return
        }
        changeOpen(false)
        props.onCreated(receipt.id)
      } catch (error) {
        if (
          openForm.current !== submittingForm ||
          controller.signal.aborted ||
          !isCurrentWorkspaceCreateSession(session)
        ) {
          return
        }
        if (error instanceof AgentWorkspaceCreateError) {
          if (
            error.status === 401 ||
            error.status === 403 ||
            error.code === 'AG_INVALID_STATE'
          ) {
            await props.onAccessLost()
            return
          }
          if (error.code === 'AG_RESOURCE_IN_USE' && input.slug) {
            form.setError('slug', { type: 'conflict' })
            return
          }
          if (error.fields.length > 0) {
            for (const field of error.fields) {
              form.setError(field, { type: 'server' })
            }
            return
          }
        }
        setSubmissionError(true)
      } finally {
        if (attempt.current === controller) attempt.current = null
      }
    })(event)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (attempt.current) return
        changeOpen(next)
        if (next) {
          form.reset(defaults)
          intent.current = null
          setSubmissionError(false)
        }
      }}
    >
      {props.verified && (
        <DialogTrigger render={<Button />}>
          <Plus aria-hidden='true' />
          {t('Create workspace')}
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={false} className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Create workspace')}</DialogTitle>
          <DialogDescription>
            {t('Create a workspace for your team.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className='space-y-4' noValidate>
          <WorkspaceCreateFields
            register={form.register}
            errors={form.formState.errors}
            disabled={busy}
          />
          {submissionError && (
            <p role='alert' className='text-destructive text-sm'>
              {t('Unable to create workspace. Retry with the same values.')}
            </p>
          )}
          {!props.verified && !busy && (
            <div
              role='status'
              className='flex items-center justify-between gap-3'
            >
              <p className='text-muted-foreground text-sm'>
                {t('Checking whether you can create workspaces...')}
              </p>
              {!props.checking && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={props.onRecheck}
                >
                  {t('Retry')}
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={!props.verified || busy}>
              {busy ? t('Creating workspace...') : t('Create workspace')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
