/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { onlineManager } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useAgentPlatformCapabilities } from '@/features/agent-platform/queries'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import {
  resolvePlatformCatalog,
  type PlatformCatalog,
} from './resolve-platform-catalog'

export function usePlatformCatalog(): PlatformCatalog {
  const { status } = useStatus()
  const authenticated = useAuthStore((state) => Boolean(state.auth.user))
  const agent = useAgentPlatformCapabilities()
  const [online, setOnline] = useState(() => onlineManager.isOnline())
  const [lastDisconnect, setLastDisconnect] = useState(0)

  useEffect(
    () =>
      onlineManager.subscribe((isOnline) => {
        setOnline(isOnline)
        if (!isOnline) setLastDisconnect(Date.now())
      }),
    []
  )

  return resolvePlatformCatalog(
    status as Record<string, unknown> | null,
    authenticated,
    {
      ...agent,
      // A query can retain successful data while the browser is offline.
      fetchStatus: online ? agent.fetchStatus : 'paused',
      isFetchedAfterMount:
        agent.isFetchedAfterMount && agent.dataUpdatedAt > lastDisconnect,
    }
  )
}
