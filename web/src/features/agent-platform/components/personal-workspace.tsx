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
import { Link, useLocation } from '@tanstack/react-router'
import { FolderLock, LockKeyhole } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { useWorkspaceWriteAttempt } from '../hooks/use-workspace-write-attempt'
import {
  workspaceWriteDescriptionSchema,
  workspaceWriteNameSchema,
} from '../lib/workspace-write-fields'
import type { WorkspaceWriteSession } from '../lib/workspace-write-transport'
import {
  PersonalWorkspaceWriteError,
  savePersonalWorkspace,
} from '../personal-workspace-api'
import { usePersonalWorkspace } from '../queries'

export function PersonalWorkspacePage() {
  const { t } = useTranslation()
  const { scope, query } = usePersonalWorkspace()
  const href = useLocation({ select: (location) => location.href })
  const result =
    query.isFetchedAfterMount && query.fetchStatus === 'idle'
      ? query.data
      : undefined

  let content: ReactNode
  if (
    !scope.signedIn ||
    scope.userId == null ||
    !scope.sessionId ||
    result?.kind === 'auth-required'
  ) {
    content = (
      <EmptyState
        icon={FolderLock}
        title={t('Sign in to view workspaces')}
        action={
          <Button
            variant='outline'
            render={<Link to='/sign-in' search={{ redirect: href }} />}
          >
            {t('Sign in')}
          </Button>
        }
      />
    )
  } else if (result?.kind === 'error' || query.fetchStatus === 'paused') {
    content = (
      <div role='alert'>
        <ErrorState
          title={t('Unable to load workspace')}
          description={t('Check your connection and try again.')}
          onRetry={() => void query.refetch()}
        />
      </div>
    )
  } else {
    content = (
      <PersonalWorkspaceEditor
        key={JSON.stringify([scope.userId, scope.sessionId])}
        query={query}
        session={{ userId: scope.userId, sessionId: scope.sessionId }}
      />
    )
  }

  return (
    <section
      aria-labelledby='personal-workspace-title'
      className='mt-6 border-t pt-5'
    >
      <div className='flex flex-wrap items-center gap-3'>
        <h2 id='personal-workspace-title' className='text-xl font-semibold'>
          {t('Personal workspace')}
        </h2>
        <Badge variant='outline'>
          <LockKeyhole aria-hidden='true' />
          {t('Only you')}
        </Badge>
      </div>
      <p className='text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed'>
        {t(
          'Your personal workspace stays with your account when you join or leave a team.'
        )}
      </p>
      {content}
    </section>
  )
}

function PersonalWorkspaceEditor(props: {
  query: ReturnType<typeof usePersonalWorkspace>['query']
  session: WorkspaceWriteSession
}) {
  const { t } = useTranslation()
  const id = useId()
  const attempt = useWorkspaceWriteAttempt(props.session)
  const [draft, setDraft] = useState<{
    name: string
    description: string
    revision: number
  }>()
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<'conflict' | 'failure' | 'saved'>()
  const [invalid, setInvalid] = useState({ name: false, description: false })
  const { query } = props
  const ready =
    query.isFetchedAfterMount &&
    query.fetchStatus === 'idle' &&
    query.data?.kind === 'ready'
  const current =
    ready && query.data?.kind === 'ready' ? query.data.workspace : undefined
  const revision = current?.revision ?? 0
  const conflict =
    notice === 'conflict' ||
    (draft !== undefined && draft.revision !== revision)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !ready || conflict) return
    const name = workspaceWriteNameSchema.safeParse(draft.name)
    const description = workspaceWriteDescriptionSchema.safeParse(
      draft.description
    )
    setInvalid({ name: !name.success, description: !description.success })
    if (!name.success || !description.success) return
    const controller = attempt.begin()
    if (!controller) return
    setPending(true)
    setNotice(undefined)
    try {
      await savePersonalWorkspace(
        {
          name: name.data,
          description: description.data,
          expected_revision: draft.revision,
        },
        props.session,
        controller.signal
      )
      if (!attempt.current(controller)) return
      setDraft(undefined)
      setNotice('saved')
      await query.refetch({ cancelRefetch: true })
    } catch (error) {
      if (!attempt.current(controller)) return
      if (
        error instanceof PersonalWorkspaceWriteError &&
        error.status === 409
      ) {
        setNotice('conflict')
        void query.refetch()
      } else if (
        error instanceof PersonalWorkspaceWriteError &&
        [401, 403, 404].includes(error.status ?? 0)
      ) {
        setDraft(undefined)
        void query.refetch()
      } else {
        setNotice('failure')
      }
    } finally {
      if (attempt.current(controller)) setPending(false)
      attempt.finish(controller)
    }
  }

  if (!ready) {
    return (
      <div role='status'>
        <LoadingState message={t('Loading workspace...')} />
      </div>
    )
  }

  let content: ReactNode
  if (draft) {
    content = (
      <form
        onSubmit={(event) => void submit(event)}
        className='space-y-4'
        noValidate
      >
        <Field data-invalid={invalid.name}>
          <FieldLabel htmlFor={`${id}-name`}>{t('Workspace name')}</FieldLabel>
          <Input
            id={`${id}-name`}
            required
            value={draft.name}
            disabled={pending}
            aria-invalid={invalid.name}
            aria-describedby={invalid.name ? `${id}-name-error` : undefined}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          {invalid.name && (
            <FieldError id={`${id}-name-error`}>
              {t('Enter a workspace name of up to 128 characters.')}
            </FieldError>
          )}
        </Field>
        <Field data-invalid={invalid.description}>
          <FieldLabel htmlFor={`${id}-description`}>
            {t('Description')}
          </FieldLabel>
          <Textarea
            id={`${id}-description`}
            rows={3}
            value={draft.description}
            disabled={pending}
            aria-invalid={invalid.description}
            aria-describedby={
              invalid.description ? `${id}-description-error` : undefined
            }
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
          {invalid.description && (
            <FieldError id={`${id}-description-error`}>
              {t('Enter a description of up to 4096 bytes.')}
            </FieldError>
          )}
        </Field>
        {notice === 'failure' && (
          <p className='text-destructive text-sm' role='alert'>
            {t('Unable to save workspace changes.')}
          </p>
        )}
        {conflict && (
          <p className='text-destructive text-sm' role='alert'>
            {t(
              'This workspace changed in another tab. Cancel editing to review the latest version.'
            )}
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          <Button type='submit' disabled={pending || conflict}>
            {draft.revision === 0
              ? t('Create personal workspace')
              : t('Save changes')}
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={pending}
            onClick={() => {
              setDraft(undefined)
              setNotice(undefined)
              setInvalid({ name: false, description: false })
            }}
          >
            {t('Cancel')}
          </Button>
        </div>
      </form>
    )
  } else if (current) {
    content = (
      <div className='border-border rounded-lg border px-5 py-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <h3 className='min-w-0 text-lg font-semibold break-words'>
            {current.name}
          </h3>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              setDraft(current)
              setNotice(undefined)
            }}
          >
            {t('Edit workspace')}
          </Button>
        </div>
        {current.description && (
          <p className='text-muted-foreground mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap'>
            {current.description}
          </p>
        )}
      </div>
    )
  } else {
    content = (
      <div className='bg-muted/30 border-border rounded-lg border p-5'>
        <p className='text-muted-foreground mb-4 text-sm'>
          {t('Create a private workspace to get started on your own.')}
        </p>
        <Button
          onClick={() => setDraft({ name: '', description: '', revision: 0 })}
        >
          {t('Create personal workspace')}
        </Button>
      </div>
    )
  }

  return (
    <div className='mt-6 max-w-2xl space-y-4'>
      {notice === 'saved' && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Workspace saved.')}
        </p>
      )}
      {content}
    </div>
  )
}
