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
  queryOptions,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query'

import { getAgentPlatformCapabilities } from './api'
import type { AgentPlatformCapabilities } from './types'

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
