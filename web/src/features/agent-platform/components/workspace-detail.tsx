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
import { ArrowLeft, FolderLock } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { buttonVariants } from '@/components/ui/button'

import { useWorkspaceDateFormat } from '../hooks/use-workspace-date-format'
import type { WorkspaceListSearch } from '../lib/workspace-list-search'
import { useAgentWorkspace } from '../queries'
import type { AgentWorkspaceDetail } from '../workspace-detail-api'
import {
  WorkspaceDate,
  WorkspaceRole,
  WorkspaceStatus,
} from './workspace-display'
import { WorkspaceSwitcher } from './workspace-switcher'

export function WorkspaceDetail(props: {
  workspaceId: string
  returnSearch: WorkspaceListSearch
}) {
  const { t } = useTranslation()
  const href = useLocation({ select: (location) => location.href })
  const { signedIn, validId, query } = useAgentWorkspace(props.workspaceId)
  const region = useRef<HTMLElement>(null)

  useEffect(() => {
    region.current?.focus({ preventScroll: true })
  }, [props.workspaceId])

  // A stale cached result is never used while confirming the current grant.
  const result =
    query.fetchStatus === 'idle' && query.isFetchedAfterMount
      ? query.data
      : undefined
  const showSwitcher =
    signedIn &&
    validId &&
    query.data?.kind === 'ready' &&
    (query.fetchStatus === 'fetching' || result?.kind === 'ready')
  let content: ReactNode
  if (!signedIn || result?.kind === 'auth-required') {
    content = (
      <EmptyState
        icon={FolderLock}
        title={t('Sign in to view workspaces')}
        action={
          <Link
            to='/sign-in'
            search={{ redirect: href }}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('Sign in')}
          </Link>
        }
      />
    )
  } else if (!validId || result?.kind === 'unavailable') {
    content = (
      <div role='status'>
        <EmptyState
          icon={FolderLock}
          title={t('Workspace is unavailable')}
          description={t(
            'It may have been archived, or you may no longer have access.'
          )}
        />
      </div>
    )
  } else if (
    query.isError ||
    query.fetchStatus === 'paused' ||
    result?.kind === 'error'
  ) {
    content = (
      <div role='alert'>
        <ErrorState
          title={t('Unable to load workspace')}
          description={t('Check your connection and try again.')}
          onRetry={() => void query.refetch()}
        />
      </div>
    )
  } else if (result?.kind === 'ready') {
    content = <WorkspaceOverview workspace={result.workspace} />
  } else {
    content = (
      <div role='status' aria-live='polite'>
        <LoadingState message={t('Loading workspace...')} />
      </div>
    )
  }

  return (
    <section
      aria-label={t('Workspace')}
      tabIndex={-1}
      ref={region}
      className='mt-8 min-w-0 border-t pt-5 outline-none'
    >
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Link
          to='/agent-platform/workspaces'
          search={props.returnSearch}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft aria-hidden='true' />
          {t('Back to workspaces')}
        </Link>
        {showSwitcher && (
          <WorkspaceSwitcher
            key={props.workspaceId}
            returnSearch={props.returnSearch}
            verified={result?.kind === 'ready'}
          />
        )}
      </div>
      {content}
    </section>
  )
}

function WorkspaceOverview(props: { workspace: AgentWorkspaceDetail }) {
  const { t } = useTranslation()
  const format = useWorkspaceDateFormat()
  const workspace = props.workspace
  return (
    <div className='mt-6'>
      <header className='min-w-0 border-b pb-6'>
        <h2 className='text-2xl font-semibold [overflow-wrap:anywhere] sm:text-3xl'>
          {workspace.name}
        </h2>
        <div className='mt-2'>
          <WorkspaceStatus status={workspace.status} />
        </div>
      </header>
      <dl className='divide-border divide-y text-sm'>
        <WorkspaceDetailField label={t('Description')}>
          {workspace.description ? (
            <p className='max-w-prose [overflow-wrap:anywhere] whitespace-pre-wrap'>
              {workspace.description}
            </p>
          ) : (
            <span className='text-muted-foreground'>{t('No description')}</span>
          )}
        </WorkspaceDetailField>
        <WorkspaceDetailField label={t('Role')}>
          <WorkspaceRole role={workspace.current_role} />
        </WorkspaceDetailField>
        <WorkspaceDetailField label={t('Slug')}>
          <span className='[overflow-wrap:anywhere]'>{workspace.slug}</span>
        </WorkspaceDetailField>
        <WorkspaceDetailField label={t('Created')}>
          <WorkspaceDate timestamp={workspace.created_at} format={format} />
        </WorkspaceDetailField>
        <WorkspaceDetailField label={t('Last updated')}>
          <WorkspaceDate timestamp={workspace.updated_at} format={format} />
        </WorkspaceDetailField>
      </dl>
    </div>
  )
}

function WorkspaceDetailField(props: { label: string; children: ReactNode }) {
  return (
    <div className='grid gap-1 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4'>
      <dt className='text-muted-foreground font-medium'>{props.label}</dt>
      <dd className='min-w-0'>{props.children}</dd>
    </div>
  )
}
