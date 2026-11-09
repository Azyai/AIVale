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
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { Bot, FolderLock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

import type { WorkspaceWriteSession } from '../lib/workspace-write-transport'
import { getAgent, getAgentDraft, listAgents } from './api'
import { AgentTable } from './components/agent-table'
import { CreateAgent } from './components/create-agent'
import { AgentEditorForm } from './components/editor-form'
import { AgentListFilters } from './components/list-filters'
import { useAgentPageContext, usePrivateAgentQuery } from './queries'
import type { AgentListSearch } from './schemas'

export function AgentsPage(props: {
  workspaceId: string
  search: AgentListSearch
}) {
  const context = useAgentPageContext(props.workspaceId)
  return (
    <AgentListSession
      key={JSON.stringify([
        context.session?.userId,
        context.session?.sessionId,
        props.workspaceId,
      ])}
      {...props}
      context={context}
    />
  )
}

function AgentListSession(props: {
  workspaceId: string
  search: AgentListSearch
  context: ReturnType<typeof useAgentPageContext>
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const context = props.context
  const query = usePrivateAgentQuery(
    ['list', props.workspaceId, props.search],
    context.session,
    context.verified,
    (signal) => listAgents(props.workspaceId, props.search, signal)
  )
  const onChange = (search: AgentListSearch) => {
    void navigate({
      to: '/agent-platform/w/$workspace_id/agents',
      params: { workspace_id: props.workspaceId },
      search,
    })
  }
  const data =
    context.verified &&
    query.fetchStatus === 'idle' &&
    query.isFetchedAfterMount &&
    query.data?.kind === 'ready'
      ? query.data.data
      : undefined
  let content: ReactNode
  if (context.denied || query.data?.kind === 'unavailable') {
    content = <AgentAccessState signedIn={Boolean(context.session)} />
  } else if (
    context.query.isError ||
    context.query.data?.kind === 'error' ||
    query.isError ||
    query.fetchStatus === 'paused'
  ) {
    content = (
      <ErrorState
        title={t('Unable to load Agents')}
        description={t('Check your connection and try again.')}
        onRetry={() => {
          void context.query.refetch()
          void query.refetch()
        }}
      />
    )
  } else if (!data) {
    content = <LoadingState message={t('Loading Agents...')} />
  } else {
    content = (
      <>
        <AgentListFilters
          key={JSON.stringify(props.search)}
          search={props.search}
          onChange={onChange}
        />
        {data.items.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={t('No Agents found')}
            description={t('Create an Agent or change your filters.')}
          />
        ) : (
          <AgentTable
            workspaceId={props.workspaceId}
            page={data}
            search={props.search}
            mayWrite={context.canWrite}
            onSearchChange={onChange}
          />
        )}
      </>
    )
  }
  return (
    <section className='mt-7 min-w-0' aria-label={t('Agents')}>
      <AgentPageBack workspaceId={props.workspaceId} />
      <Separator className='my-5' />
      <header className='mb-5 flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-semibold'>{t('Agents')}</h2>
          <p className='text-muted-foreground mt-1 max-w-prose text-sm'>
            {t('Create and configure text Agents in this workspace.')}
          </p>
        </div>
        {context.session && context.canWrite && (
          <CreateAgent
            workspaceId={props.workspaceId}
            session={context.session}
            verified={context.canWrite}
            onCreated={(agentId) => {
              void navigate({
                to: '/agent-platform/w/$workspace_id/agents/$agent_id/edit',
                params: { workspace_id: props.workspaceId, agent_id: agentId },
                search: props.search,
              })
            }}
            onAccessLost={() => {
              void context.query.refetch()
            }}
          />
        )}
      </header>
      {content}
    </section>
  )
}

export function AgentEditorPage(props: {
  workspaceId: string
  agentId: string
  returnSearch: AgentListSearch
}) {
  const { t } = useTranslation()
  const context = useAgentPageContext(props.workspaceId)
  let content: ReactNode
  if (
    context.denied ||
    (context.verified && !context.canWrite) ||
    !context.session
  ) {
    content = <AgentAccessState signedIn={Boolean(context.session)} />
  } else {
    content = (
      <EditorSession
        key={JSON.stringify([
          context.session.userId,
          context.session.sessionId,
          props.workspaceId,
          props.agentId,
        ])}
        workspaceId={props.workspaceId}
        agentId={props.agentId}
        session={context.session}
        context={context}
        returnSearch={props.returnSearch}
      />
    )
  }
  return (
    <section className='mt-7 min-w-0' aria-label={t('Agent editor')}>
      <EditorBack workspaceId={props.workspaceId} search={props.returnSearch} />
      <Separator className='my-5' />
      {content}
    </section>
  )
}

function EditorSession(props: {
  workspaceId: string
  agentId: string
  session: WorkspaceWriteSession
  context: ReturnType<typeof useAgentPageContext>
  returnSearch: AgentListSearch
}) {
  const { t } = useTranslation()
  const [lost, setLost] = useState(false)
  const metadata = usePrivateAgentQuery(
    ['metadata', props.workspaceId, props.agentId],
    props.session,
    props.context.canWrite && !lost,
    (signal) => getAgent(props.workspaceId, props.agentId, signal)
  )
  const draft = usePrivateAgentQuery(
    ['draft', props.workspaceId, props.agentId],
    props.session,
    props.context.canWrite && !lost,
    (signal) => getAgentDraft(props.workspaceId, props.agentId, signal),
    30_000
  )
  const unavailable =
    lost ||
    metadata.data?.kind === 'unavailable' ||
    draft.data?.kind === 'unavailable' ||
    (metadata.data?.kind === 'ready' &&
      metadata.data.data.status === 'archived')
  if (unavailable) return <AgentAccessState signedIn />
  const currentMetadata =
    metadata.data?.kind === 'ready' ? metadata.data.data : undefined
  const currentDraft =
    draft.data?.kind === 'ready' ? draft.data.data : undefined
  const verified =
    props.context.canWrite &&
    metadata.fetchStatus === 'idle' &&
    draft.fetchStatus === 'idle' &&
    metadata.isFetchedAfterMount &&
    draft.isFetchedAfterMount &&
    !metadata.isError &&
    !draft.isError
  const error =
    props.context.query.data?.kind === 'error' ||
    metadata.isError ||
    draft.isError ||
    metadata.fetchStatus === 'paused' ||
    draft.fetchStatus === 'paused'
  if (
    currentMetadata &&
    currentDraft?.config &&
    currentMetadata.name !== currentDraft.config.name
  ) {
    return (
      <ErrorState
        title={t('Unable to load Agent draft')}
        onRetry={() => {
          void metadata.refetch()
          void draft.refetch()
        }}
      />
    )
  }
  return (
    <>
      {!verified &&
        (error ? (
          <ErrorState
            title={t('Unable to confirm access to this draft')}
            description={t(
              'Your local changes are kept while access is checked. Reconnect and try again.'
            )}
            onRetry={() => {
              void props.context.query.refetch()
              void metadata.refetch()
              void draft.refetch()
            }}
          />
        ) : (
          <LoadingState message={t('Loading Agent draft...')} />
        ))}
      {currentMetadata && currentDraft && (
        <div hidden={!verified} inert={!verified}>
          <div className='mb-5 flex justify-end'>
            <Link
              to='/agent-platform/w/$workspace_id/agents/$agent_id/versions'
              params={{
                workspace_id: props.workspaceId,
                agent_id: props.agentId,
              }}
              search={{
                ...props.returnSearch,
                version_page: 1,
                version_page_size: 20,
              }}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {t('Version history')}
            </Link>
          </div>
          <AgentEditorForm
            workspaceId={props.workspaceId}
            agentId={props.agentId}
            name={currentMetadata.name}
            draft={currentDraft}
            session={props.session}
            verified={verified}
            canPublish={props.context.canPublish}
            agentStatus={currentMetadata.status}
            onAccessLost={() => setLost(true)}
            onSaved={() => {
              void metadata.refetch()
              void draft.refetch()
            }}
          />
        </div>
      )}
    </>
  )
}

function AgentAccessState(props: { signedIn: boolean }) {
  const { t } = useTranslation()
  const href = useLocation({ select: (location) => location.href })
  return (
    <EmptyState
      icon={FolderLock}
      title={
        props.signedIn
          ? t('Agent access is unavailable')
          : t('Sign in to manage Agents')
      }
      description={
        props.signedIn
          ? t(
              'This workspace or Agent may be unavailable, or your permissions may have changed.'
            )
          : undefined
      }
      action={
        !props.signedIn ? (
          <Link
            to='/sign-in'
            search={{ redirect: href }}
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('Sign in')}
          </Link>
        ) : undefined
      }
    />
  )
}
function AgentPageBack(props: { workspaceId: string }) {
  const { t } = useTranslation()
  return (
    <Link
      to='/agent-platform/w/$workspace_id'
      params={{ workspace_id: props.workspaceId }}
      search={{
        page: 1,
        page_size: 20,
        sort: 'created_at:desc,id:desc',
        q: '',
      }}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      {t('Back to workspace')}
    </Link>
  )
}
function EditorBack(props: { workspaceId: string; search: AgentListSearch }) {
  const { t } = useTranslation()
  return (
    <Link
      to='/agent-platform/w/$workspace_id/agents'
      params={{ workspace_id: props.workspaceId }}
      search={props.search}
      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
    >
      {t('Back to Agents')}
    </Link>
  )
}
