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
import { FolderSearch, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'

import { useAgentWorkspaces } from '../queries'
import type { AgentWorkspacePage } from '../workspace-list-api'
import {
  WorkspaceListFilters,
  type WorkspaceListControls,
} from './workspace-list-filters'
import { WorkspaceListTable } from './workspace-list-table'

export function WorkspaceList(props: WorkspaceListControls) {
  const { t } = useTranslation()
  const href = useLocation({ select: (location) => location.href })
  const { signedIn, query } = useAgentWorkspaces(props.search)

  let content
  if (!signedIn) {
    content = (
      <EmptyState
        icon={Layers}
        title={t('Sign in to view workspaces')}
        action={
          <Button
            variant='outline'
            render={<Link to='/sign-in' search={{ redirect: href }} />}
          >
            {t('Sign in')}
          </Button>
        }
        className='min-h-48'
      />
    )
  } else if (query.isError || query.fetchStatus === 'paused') {
    content = (
      <div role='alert'>
        <ErrorState
          title={t('Unable to load workspaces')}
          description={t('Check your connection and try again.')}
          onRetry={() => void query.refetch()}
          className='min-h-48'
        />
      </div>
    )
  } else if (!query.isSuccess || !query.isFetchedAfterMount) {
    content = (
      <div role='status' aria-live='polite'>
        <LoadingState message={t('Loading workspaces...')} />
      </div>
    )
  } else if (query.data.empty_reason !== null) {
    content = <WorkspaceListEmpty {...props} reason={query.data.empty_reason} />
  } else {
    content = <WorkspaceListTable {...props} page={query.data} />
  }

  return (
    <section
      aria-labelledby='agent-workspaces-heading'
      className='mt-8 min-w-0 border-t pt-6'
    >
      <h2 id='agent-workspaces-heading' className='mb-4 text-xl font-semibold'>
        {t('Workspaces')}
      </h2>
      {signedIn && <WorkspaceListFilters {...props} />}
      {content}
    </section>
  )
}

function WorkspaceListEmpty(
  props: WorkspaceListControls & {
    reason: NonNullable<AgentWorkspacePage['empty_reason']>
  }
) {
  const { t } = useTranslation()
  let title: string
  let description: string
  let action
  switch (props.reason) {
    case 'no_team':
      title = t('No team yet')
      description = t('Join a team before viewing its workspaces.')
      break
    case 'no_results':
      if (props.search.q !== '') {
        title = t('No matching workspaces')
        description = t('Try a different name or clear the search.')
      } else {
        title = t('No accessible workspaces')
        description = t('Ask a workspace administrator for access.')
      }
      break
    case 'page_out_of_range':
      title = t('This page is out of range')
      description = t('Go back to the first page to see available workspaces.')
      action = (
        <Button
          variant='outline'
          size='sm'
          onClick={() => props.onSearchChange({ ...props.search, page: 1 })}
        >
          {t('Go to first page')}
        </Button>
      )
      break
  }
  return (
    <div role='status' aria-live='polite'>
      <EmptyState
        icon={FolderSearch}
        title={title}
        description={description}
        action={action}
        className='min-h-48'
      />
    </div>
  )
}
