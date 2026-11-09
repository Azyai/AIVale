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

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { useWorkspaceWriteAttempt } from '../../hooks/use-workspace-write-attempt'
import { generateWorkspaceWriteKey } from '../../lib/workspace-write-fields'
import type { WorkspaceWriteSession } from '../../lib/workspace-write-transport'
import { AgentApiError, createAgent } from '../api'
import { agentCreateInputSchema, type AgentCreateInput } from '../schemas'

export function CreateAgent(props: {
  workspaceId: string
  session: WorkspaceWriteSession
  verified: boolean
  onCreated: (id: string) => void
  onAccessLost: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<'unknown' | 'error'>()
  const intent = useRef<{ input: AgentCreateInput; key: string } | null>(null)
  const attempt = useWorkspaceWriteAttempt(props.session)
  const form = useForm<AgentCreateInput>({
    resolver: zodResolver(agentCreateInputSchema),
    defaultValues: { name: '', description: '', kind: 'single' },
  })
  const mutation = useMutation({
    mutationFn: (operation: {
      input: AgentCreateInput
      key: string
      signal: AbortSignal
    }) =>
      createAgent(
        props.workspaceId,
        operation.input,
        operation.key,
        props.session,
        operation.signal
      ),
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    meta: { errorToast: false, errorRedirect: false },
  })
  const busy = mutation.isPending || form.formState.isSubmitting
  const submit = form.handleSubmit(async (values) => {
    if (!props.verified) return
    const controller = attempt.begin()
    if (!controller) return
    if (
      !intent.current ||
      JSON.stringify(values) !== JSON.stringify(intent.current.input)
    ) {
      intent.current = {
        input: values,
        key: generateWorkspaceWriteKey('create'),
      }
    }
    const operation = intent.current
    try {
      const result = await mutation.mutateAsync({
        ...operation,
        signal: controller.signal,
      })
      if (!attempt.current(controller)) return
      setOpen(false)
      setFailure(undefined)
      intent.current = null
      form.reset()
      props.onCreated(result.id)
    } catch (error) {
      if (!attempt.current(controller)) return
      if (error instanceof AgentApiError) {
        if ([401, 403, 404, 503].includes(error.status ?? 0)) {
          setOpen(false)
          props.onAccessLost()
          return
        }
        for (const field of error.fields) {
          if (field === 'name' || field === 'description') {
            form.setError(field, { type: 'server' })
          }
        }
        setFailure(
          error.retryable ||
            error.code === 'INVALID_RESPONSE' ||
            (error.status != null && error.status >= 500)
            ? 'unknown'
            : 'error'
        )
      } else setFailure('unknown')
    } finally {
      attempt.finish(controller)
    }
  })
  return (
    <>
      <Button
        type='button'
        disabled={!props.verified}
        onClick={() => setOpen(true)}
      >
        {t('Create Agent')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next)
        }}
        title={t('Create Agent')}
        description={t(
          'Create an unconfigured draft, then choose a model and write its instructions.'
        )}
        contentClassName='sm:max-w-lg'
      >
        <form noValidate onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor='agent-create-name'>
                {t('Agent name')}
              </FieldLabel>
              <Input
                id='agent-create-name'
                disabled={busy || failure === 'unknown'}
                aria-required='true'
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <FieldError>
                  {t('Enter an Agent name of up to 128 characters.')}
                </FieldError>
              )}
            </Field>
            <Field data-invalid={Boolean(form.formState.errors.description)}>
              <FieldLabel htmlFor='agent-create-description'>
                {t('Description')}
              </FieldLabel>
              <Textarea
                id='agent-create-description'
                disabled={busy || failure === 'unknown'}
                rows={3}
                aria-invalid={Boolean(form.formState.errors.description)}
                {...form.register('description')}
              />
              {form.formState.errors.description && (
                <FieldError>
                  {t('Enter a description of up to 4096 bytes.')}
                </FieldError>
              )}
            </Field>
          </FieldGroup>
          {failure && (
            <p role='alert' className='text-destructive mt-4 text-sm'>
              {failure === 'unknown'
                ? t(
                    'The creation result is unknown. Retry this same request to recover its result.'
                  )
                : t(
                    'Unable to create this Agent. Check the fields and try again.'
                  )}
            </p>
          )}
          <div className='mt-6 flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={busy || !props.verified}>
              {failure === 'unknown'
                ? t('Retry same request')
                : t('Create Agent')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
