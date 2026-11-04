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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  agentWorkspaceListQueryKey,
  useWorkspaceCreateEligibility,
} from '../queries'
import { isCurrentWorkspaceCreateSession } from '../workspace-create-api'
import { WorkspaceCreateDialog } from './workspace-create-dialog'

export function WorkspaceCreateAction(props: {
  onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const { scope, query, queryKey } = useWorkspaceCreateEligibility()
  const [unavailableSession, setUnavailableSession] = useState<string>()
  const eligibility = query.data

  if (!scope.signedIn || scope.userId == null || !scope.sessionId) return null
  if (!eligibility?.can_create || !query.isFetchedAfterMount) {
    return unavailableSession === scope.sessionId ? (
      <p role='status' className='text-muted-foreground text-sm'>
        {t('Workspace creation is no longer available.')}
      </p>
    ) : null
  }

  const session = {
    userId: scope.userId,
    sessionId: scope.sessionId,
    teamId: eligibility.team_id,
  }
  return (
    <WorkspaceCreateDialog
      key={JSON.stringify(session)}
      session={session}
      verified={query.isSuccess && query.fetchStatus === 'idle'}
      checking={query.isFetching}
      onRecheck={() => void query.refetch()}
      onAccessLost={async () => {
        setUnavailableSession(session.sessionId)
        await client.cancelQueries({ queryKey, exact: true })
        if (isCurrentWorkspaceCreateSession(session)) {
          client.setQueryData(queryKey, { can_create: false, team_id: null })
        }
      }}
      onCreated={(id) => {
        void client.invalidateQueries({ queryKey: agentWorkspaceListQueryKey })
        props.onCreated(id)
      }}
    />
  )
}
