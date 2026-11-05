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
import {
  CancelledError,
  queryOptions,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useAuthStore } from '@/stores/auth-store'

import { getAgentPlatformCapabilities } from './api'
import type { WorkspaceListSearch } from './lib/workspace-list-search'
import {
  getPersonalWorkspace,
  PersonalWorkspaceReadError,
} from './personal-workspace-api'
import type { AgentPlatformCapabilities } from './types'
import { getWorkspaceCreateEligibility } from './workspace-create-api'
import {
  AgentWorkspaceDetailError,
  getAgentWorkspace,
  isAgentWorkspaceId,
  type AgentWorkspaceDetail,
} from './workspace-detail-api'
import { listAgentWorkspaces } from './workspace-list-api'

export const agentPlatformCapabilitiesQueryKey = [
  'agent-platform',
  'capabilities',
] as const

export const agentPlatformCapabilitiesQueryOptions = queryOptions({
  queryKey: agentPlatformCapabilitiesQueryKey,
  queryFn: ({ signal }) => getAgentPlatformCapabilities(signal),
  staleTime: 0,
  gcTime: 0,
  retry: false,
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  meta: { errorToast: false, errorRedirect: false },
})

export function useAgentPlatformCapabilities(): UseQueryResult<AgentPlatformCapabilities> {
  return useQuery(agentPlatformCapabilitiesQueryOptions)
}

function useWorkspaceSession() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const hasAccessToken = useAuthStore((state) =>
    Boolean(state.auth.accessToken)
  )
  const signedIn = userId != null && Boolean(sessionId) && hasAccessToken
  return { userId, sessionId, signedIn }
}

function assertCurrentWorkspaceSession(
  scope: ReturnType<typeof useWorkspaceSession>,
  signal: AbortSignal
) {
  const { auth } = useAuthStore.getState()
  if (
    !scope.signedIn ||
    signal.aborted ||
    !auth.accessToken ||
    auth.user?.id !== scope.userId ||
    auth.session?.sid !== scope.sessionId
  ) {
    throw new CancelledError({ silent: true })
  }
}

const privateWorkspaceQueryOptions = {
  staleTime: 0,
  gcTime: 0,
  retry: false,
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
  meta: { errorToast: false, errorRedirect: false },
} as const

export function usePersonalWorkspace() {
  const scope = useWorkspaceSession()
  const queryKey = [
    'agent-platform',
    'personal-workspace',
    scope.userId,
    scope.sessionId,
  ] as const
  const query = useQuery({
    ...privateWorkspaceQueryOptions,
    queryKey,
    enabled: scope.signedIn,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      assertCurrentWorkspaceSession(scope, signal)
      try {
        const workspace = await getPersonalWorkspace(signal)
        assertCurrentWorkspaceSession(scope, signal)
        return { kind: 'ready', workspace } as const
      } catch (error) {
        assertCurrentWorkspaceSession(scope, signal)
        return {
          kind:
            error instanceof PersonalWorkspaceReadError && error.status === 401
              ? 'auth-required'
              : 'error',
        } as const
      }
    },
  })
  return { scope, query, queryKey }
}

export const agentWorkspaceListQueryKey = [
  'agent-platform',
  'workspaces',
] as const

export function useWorkspaceCreateEligibility() {
  const scope = useWorkspaceSession()
  const queryKey = [
    'agent-platform',
    'workspace-create-eligibility',
    scope.userId,
    scope.sessionId,
  ] as const
  const query = useQuery({
    ...privateWorkspaceQueryOptions,
    queryKey,
    enabled: scope.signedIn,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }) => {
      assertCurrentWorkspaceSession(scope, signal)
      const eligibility = await getWorkspaceCreateEligibility(signal)
      assertCurrentWorkspaceSession(scope, signal)
      return eligibility
    },
  })
  return { scope, query, queryKey }
}

export function useAgentWorkspaces(search: WorkspaceListSearch) {
  const scope = useWorkspaceSession()

  const query = useQuery({
    ...privateWorkspaceQueryOptions,
    queryKey: [
      ...agentWorkspaceListQueryKey,
      scope.userId,
      scope.sessionId,
      search,
    ],
    enabled: scope.signedIn,
    queryFn: async ({ signal }) => {
      assertCurrentWorkspaceSession(scope, signal)
      const page = await listAgentWorkspaces(search, signal)
      assertCurrentWorkspaceSession(scope, signal)
      return page
    },
  })

  return { signedIn: scope.signedIn, query }
}

type WorkspaceDetailResult =
  | { kind: 'ready'; workspace: AgentWorkspaceDetail }
  | { kind: 'unavailable' | 'auth-required' | 'error' }

export type WorkspaceReadHold = {
  userId: number
  sessionId: string
  workspaceId: string
}

export function useAgentWorkspace(
  workspaceId: string,
  hold?: WorkspaceReadHold | null
) {
  const scope = useWorkspaceSession()
  const validId = isAgentWorkspaceId(workspaceId)
  const held =
    scope.signedIn &&
    hold?.workspaceId === workspaceId &&
    hold.userId === scope.userId &&
    hold.sessionId === scope.sessionId
  const queryKey = [
    'agent-platform',
    'workspace',
    scope.userId,
    scope.sessionId,
    validId ? workspaceId : null,
  ] as const
  const query = useQuery({
    ...privateWorkspaceQueryOptions,
    queryKey,
    enabled: scope.signedIn && validId,
    refetchInterval: held ? false : 30_000,
    refetchOnWindowFocus: held ? false : 'always',
    refetchOnReconnect: held ? false : 'always',
    refetchIntervalInBackground: false,
    queryFn: async ({ signal }): Promise<WorkspaceDetailResult> => {
      assertCurrentWorkspaceSession(scope, signal)
      try {
        const workspace = await getAgentWorkspace(workspaceId, signal)
        assertCurrentWorkspaceSession(scope, signal)
        return { kind: 'ready', workspace }
      } catch (error) {
        assertCurrentWorkspaceSession(scope, signal)
        // Replace the former result with a data-free verdict even on refetch failure.
        if (error instanceof AgentWorkspaceDetailError) {
          if (error.status === 401) return { kind: 'auth-required' }
          if (error.status === 403 || error.status === 404) {
            return { kind: 'unavailable' }
          }
        }
        return { kind: 'error' }
      }
    },
  })

  return { signedIn: scope.signedIn, validId, scope, query, queryKey, held }
}

/**
 * Each mounted consumer must verify the current server state before admission.
 * A refresh may keep a value verified during this mount, but a failed refresh
 * revokes admission even when React Query retains older enabled data. A paused
 * offline refresh cannot establish current availability either.
 * Runtime readiness is separate: an enabled platform can still show its shell.
 */
export function isAgentPlatformAvailable(
  query: Pick<
    UseQueryResult<AgentPlatformCapabilities>,
    'data' | 'isSuccess' | 'isFetchedAfterMount' | 'fetchStatus'
  >
): boolean {
  return (
    query.isSuccess &&
    query.isFetchedAfterMount &&
    query.fetchStatus !== 'paused' &&
    query.data?.enabled === true
  )
}
