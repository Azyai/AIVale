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
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { FolderLock, History } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

import type { WorkspaceWriteSession } from '../lib/workspace-write-transport'
import { getAgent } from './api'
import { AgentVersionActionDialog } from './components/version-action-dialog'
import { AgentVersionContent } from './components/version-content'
import { AgentVersionTable } from './components/version-table'
import type { AgentHistorySearch } from './history-search'
import { useAgentPageContext, usePrivateAgentQuery } from './queries'
import { listAgentVersions } from './release-api'
import { agentListSearchSchema } from './schemas'

export function AgentVersionHistoryPage(props: {
  workspaceId: string
  agentId: string
  search: AgentHistorySearch
}) {
  const { t } = useTranslation()
  const context = useAgentPageContext(props.workspaceId)
  return (
    <section className='mt-7 min-w-0' aria-label={t('Version history')}>
      <Link
        to='/agent-platform/w/$workspace_id/agents'
        params={{ workspace_id: props.workspaceId }}
        search={agentListSearchSchema.parse(props.search)}
        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
      >
        {t('Back to Agents')}
      </Link>
      <Separator className='my-5' />
      {context.denied || !context.session ? (
        <HistoryAccessState />
      ) : (
        <HistorySession
          key={JSON.stringify([
            context.session.userId,
            context.session.sessionId,
            props.workspaceId,
            props.agentId,
          ])}
          {...props}
          session={context.session}
          context={context}
        />
      )}
    </section>
  )
}

function HistorySession(props: {
  workspaceId: string
  agentId: string
  search: AgentHistorySearch
  session: WorkspaceWriteSession
  context: ReturnType<typeof useAgentPageContext>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [contentLost, setContentLost] = useState(false)
  const metadata = usePrivateAgentQuery(
    ['metadata', props.workspaceId, props.agentId],
    props.session,
    props.context.verified,
    (signal) => getAgent(props.workspaceId, props.agentId, signal)
  )
  const listSearch = {
    page: props.search.version_page,
    page_size: props.search.version_page_size,
    sort: 'created_at:desc,id:desc' as const,
  }
  const versions = usePrivateAgentQuery(
    ['versions', props.workspaceId, props.agentId, listSearch],
    props.session,
    props.context.verified,
    (signal) =>
      listAgentVersions(props.workspaceId, props.agentId, listSearch, signal)
  )
  const changed = () => {
    // Receipts and action responses never replace the server's current pointer.
    void queryClient.invalidateQueries({
      queryKey: [
        'agent-platform',
        'agents',
        props.session.userId,
        props.session.sessionId,
      ],
    })
  }
  const onChange = (search: AgentHistorySearch) => {
    void navigate({
      to: '/agent-platform/w/$workspace_id/agents/$agent_id/versions',
      params: { workspace_id: props.workspaceId, agent_id: props.agentId },
      search,
    })
  }
  const accessLost = () => {
    setContentLost(true)
    void props.context.query.refetch()
  }
  if (
    metadata.data?.kind === 'unavailable' ||
    versions.data?.kind === 'unavailable'
  ) {
    return <HistoryAccessState />
  }
  const error =
    props.context.query.isError ||
    props.context.query.data?.kind === 'error' ||
    metadata.isError ||
    versions.isError ||
    metadata.fetchStatus === 'paused' ||
    versions.fetchStatus === 'paused'
  const loading = error ? (
    <ErrorState
      title={t('Unable to load version history')}
      onRetry={() => {
        void props.context.query.refetch()
        void metadata.refetch()
        void versions.refetch()
      }}
    />
  ) : (
    <LoadingState message={t('Loading version history...')} />
  )
  const current =
    metadata.data?.kind === 'ready' ? metadata.data.data : undefined
  const page = versions.data?.kind === 'ready' ? versions.data.data : undefined
  if (!current || !page) {
    return loading
  }
  const verified =
    props.context.verified &&
    metadata.fetchStatus === 'idle' &&
    metadata.isFetchedAfterMount &&
    versions.fetchStatus === 'idle' &&
    versions.isFetchedAfterMount &&
    !error
  const canReadContent =
    props.context.detail?.status === 'active' &&
    props.context.detail.effective_permissions.includes('agent:write') &&
    !contentLost
  const canMutate = canReadContent && current.status !== 'archived'
  const actionProps = {
    workspaceId: props.workspaceId,
    agentId: props.agentId,
    session: props.session,
    verified: verified && canMutate,
    onAccessLost: accessLost,
    onChanged: changed,
  }
  return (
    <>
      {!verified && loading}
      <div hidden={!verified} inert={!verified}>
        <header className='mb-5 flex flex-wrap items-start justify-between gap-4'>
          <div className='min-w-0'>
            <h2 className='text-xl font-semibold [overflow-wrap:anywhere]'>
              {current.name}
            </h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('Version history')}
            </p>
            <div className='mt-3 flex flex-wrap gap-2'>
              <Badge variant='secondary'>
                {t(
                  {
                    active: 'Active',
                    disabled: 'Disabled',
                    archived: 'Archived',
                  }[current.status]
                )}
              </Badge>
              <span className='text-muted-foreground text-sm'>
                {t('Current version ID')}:{' '}
                <span className='font-mono'>
                  {current.current_version_id ?? t('Not published')}
                </span>
              </span>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {canMutate && (
              <>
                <Link
                  to='/agent-platform/w/$workspace_id/agents/$agent_id/edit'
                  params={{
                    workspace_id: props.workspaceId,
                    agent_id: props.agentId,
                  }}
                  search={agentListSearchSchema.parse(props.search)}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  {t('Edit draft')}
                </Link>
                <AgentVersionActionDialog
                  {...actionProps}
                  action={current.status === 'disabled' ? 'enable' : 'disable'}
                />
                <AgentVersionActionDialog {...actionProps} action='archive' />
              </>
            )}
          </div>
        </header>
        {page.items.length === 0 ? (
          <EmptyState
            icon={History}
            title={t('No published versions')}
            description={t(
              'Publish a saved draft to create its first immutable version.'
            )}
          />
        ) : (
          <AgentVersionTable
            page={page}
            currentVersionId={current.current_version_id}
            search={props.search}
            canReadContent={canReadContent}
            onChange={onChange}
          />
        )}
        {!canReadContent && (
          <p className='text-muted-foreground mt-5 text-sm'>
            {t(
              'Version configuration and comparisons require Agent write access in an active workspace.'
            )}
          </p>
        )}
        {canReadContent && props.search.selected_version && (
          <div
            key={JSON.stringify([
              props.search.selected_version,
              props.search.compare_version,
            ])}
          >
            <div className='mt-6 flex flex-wrap gap-2'>
              <Button
                variant='ghost'
                onClick={() =>
                  onChange({
                    ...props.search,
                    selected_version: undefined,
                    compare_version: undefined,
                  })
                }
              >
                {t('Close version')}
              </Button>
              {props.search.compare_version && (
                <Button
                  variant='ghost'
                  onClick={() =>
                    onChange({ ...props.search, compare_version: undefined })
                  }
                >
                  {t('Clear comparison')}
                </Button>
              )}
            </div>
            <AgentVersionContent
              workspaceId={props.workspaceId}
              agentId={props.agentId}
              session={props.session}
              selectedVersion={props.search.selected_version}
              compareVersion={props.search.compare_version}
              verified={verified && canReadContent}
              onAccessLost={accessLost}
              actions={(version, ready) =>
                canMutate && (
                  <div className='mb-5 flex flex-wrap gap-2'>
                    <AgentVersionActionDialog
                      {...actionProps}
                      verified={actionProps.verified && ready}
                      action='restore'
                      versionId={version.id}
                      disabled={version.revoked_at !== null}
                    />
                    <AgentVersionActionDialog
                      {...actionProps}
                      verified={actionProps.verified && ready}
                      action='activate'
                      versionId={version.id}
                      disabled={
                        !props.context.canPublish ||
                        version.revoked_at !== null ||
                        current.current_version_id === version.id
                      }
                    />
                  </div>
                )
              }
            />
          </div>
        )}
      </div>
    </>
  )
}

function HistoryAccessState() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={FolderLock}
      title={t('Agent access is unavailable')}
      description={t(
        'This workspace or Agent may be unavailable, or your permissions may have changed.'
      )}
    />
  )
}
