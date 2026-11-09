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
import { CancelledError, useQuery } from '@tanstack/react-query'

import { useAuthStore } from '@/stores/auth-store'

import {
  isCurrentWorkspaceWriteSession,
  type WorkspaceWriteSession,
} from '../lib/workspace-write-transport'
import {
  isAgentPlatformAvailable,
  useAgentPlatformCapabilities,
  useAgentWorkspace,
} from '../queries'
import { AgentApiError } from './api'

export function useAgentPageContext(workspaceId: string) {
  const workspace = useAgentWorkspace(workspaceId)
  const capability = useAgentPlatformCapabilities()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const token = useAuthStore((state) => Boolean(state.auth.accessToken))
  const session =
    userId != null && sessionId && token ? { userId, sessionId } : undefined
  const available = isAgentPlatformAvailable(capability)
  const verified =
    available &&
    workspace.query.isFetchedAfterMount &&
    workspace.query.fetchStatus === 'idle' &&
    workspace.query.data?.kind === 'ready'
  const detail =
    workspace.query.data?.kind === 'ready'
      ? workspace.query.data.workspace
      : undefined
  const denied =
    !session ||
    !workspace.validId ||
    capability.data?.enabled === false ||
    workspace.query.data?.kind === 'unavailable' ||
    workspace.query.data?.kind === 'auth-required'
  return {
    ...workspace,
    session,
    verified,
    detail,
    denied,
    available,
    canWrite:
      verified &&
      detail?.status === 'active' &&
      detail.effective_permissions.includes('agent:write') === true,
    canPublish:
      verified &&
      detail?.status === 'active' &&
      detail.effective_permissions.includes('agent:publish') === true,
  }
}

export function usePrivateAgentQuery<T>(
  key: readonly unknown[],
  session: WorkspaceWriteSession | undefined,
  enabled: boolean,
  fetcher: (signal: AbortSignal) => Promise<T>,
  interval: number | false = false
) {
  return useQuery({
    queryKey: [
      'agent-platform',
      'agents',
      session?.userId,
      session?.sessionId,
      ...key,
    ],
    enabled: Boolean(session && enabled),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    meta: { errorToast: false, errorRedirect: false },
    queryFn: async ({ signal }) => {
      if (
        !session ||
        signal.aborted ||
        !isCurrentWorkspaceWriteSession(session)
      ) {
        throw new CancelledError({ silent: true })
      }
      try {
        const data = await fetcher(signal)
        if (signal.aborted || !isCurrentWorkspaceWriteSession(session)) {
          throw new CancelledError({ silent: true })
        }
        return { kind: 'ready', data } as const
      } catch (error) {
        if (signal.aborted || !isCurrentWorkspaceWriteSession(session)) {
          throw new CancelledError({ silent: true })
        }
        if (
          error instanceof AgentApiError &&
          [401, 403, 404, 503].includes(error.status ?? 0)
        ) {
          return { kind: 'unavailable' } as const
        }
        throw error
      }
    },
  })
}
