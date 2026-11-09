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
import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'

import {
  AgentVersionHistoryPage,
  agentHistorySearchSchema,
  type AgentHistorySearch,
} from '@/features/agent-platform/agents'

export const Route = createFileRoute(
  '/agent-platform/w/$workspace_id_/agents_/$agent_id/versions'
)({
  validateSearch: (search: Partial<AgentHistorySearch> & SearchSchemaInput) =>
    agentHistorySearchSchema.parse(search),
  component: AgentVersionsRoute,
})
function AgentVersionsRoute() {
  const params = Route.useParams()
  const search = Route.useSearch()
  return (
    <AgentVersionHistoryPage
      workspaceId={params.workspace_id}
      agentId={params.agent_id}
      search={search}
    />
  )
}
