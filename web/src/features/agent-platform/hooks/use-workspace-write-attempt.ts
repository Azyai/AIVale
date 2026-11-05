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
import { useLayoutEffect, useRef } from 'react'

import {
  isCurrentWorkspaceWriteSession,
  type WorkspaceWriteSession,
} from '../workspace-management-api'

export function useWorkspaceWriteAttempt(session: WorkspaceWriteSession) {
  const live = useRef(false)
  const active = useRef<AbortController | null>(null)
  useLayoutEffect(() => {
    live.current = true
    return () => {
      live.current = false
      active.current?.abort()
    }
  }, [])

  return {
    begin() {
      if (
        !live.current ||
        active.current ||
        !isCurrentWorkspaceWriteSession(session)
      ) {
        return null
      }
      const controller = new AbortController()
      active.current = controller
      return controller
    },
    current(controller: AbortController) {
      return (
        live.current &&
        active.current === controller &&
        !controller.signal.aborted &&
        isCurrentWorkspaceWriteSession(session)
      )
    },
    finish(controller: AbortController) {
      if (active.current === controller) active.current = null
    },
  }
}
