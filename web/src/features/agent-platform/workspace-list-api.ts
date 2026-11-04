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
import { z } from 'zod'

import {
  workspaceListPageNumberSchema,
  workspaceListPageSizeSchema,
  workspaceListRequestSchema,
  type WorkspaceListSearch,
} from './lib/workspace-list-search'
import {
  AgentWorkspaceReadError,
  fetchWorkspaceRead,
  workspaceReadResponseSchema,
  workspaceSummarySchema,
} from './lib/workspace-read-transport'

export type {
  AgentWorkspaceSummary,
  AgentWorkspaceRole,
  AgentWorkspaceStatus,
} from './lib/workspace-read-transport'

const workspacePageSchema = z
  .strictObject({
    items: z.array(workspaceSummarySchema).max(100),
    total: z.number().int().nonnegative(),
    page: workspaceListPageNumberSchema,
    page_size: workspaceListPageSizeSchema,
    empty_reason: z
      .enum(['no_team', 'no_results', 'page_out_of_range'])
      .nullable(),
  })
  .refine((value) => {
    const { items, total, page_size, empty_reason } = value
    if (items.length > page_size || items.length > total) return false
    if (items.length > 0) {
      return (
        empty_reason === null &&
        new Set(items.map((item) => item.id)).size === items.length
      )
    }
    return total > 0
      ? empty_reason === 'page_out_of_range'
      : empty_reason === 'no_results' || empty_reason === 'no_team'
  })

const workspaceListResponseSchema =
  workspaceReadResponseSchema(workspacePageSchema)

export type AgentWorkspacePage = z.infer<typeof workspacePageSchema>

export class AgentWorkspaceListError extends AgentWorkspaceReadError {
  override name = 'AgentWorkspaceListError'
}

/** Fetch only the live, visible page. Never keep the raw body or Axios config in errors. */
export async function listAgentWorkspaces(
  search: WorkspaceListSearch,
  signal?: AbortSignal
): Promise<AgentWorkspacePage> {
  const parsed = workspaceListRequestSchema.safeParse(search)
  if (!parsed.success) throw new AgentWorkspaceListError('AG_INVALID_ARGUMENT')
  const { q, ...page } = parsed.data
  const response = await fetchWorkspaceRead('/api/agent-platform/workspaces', {
    params: q ? { ...page, q } : page,
    signal,
    ErrorType: AgentWorkspaceListError,
  })
  const result = workspaceListResponseSchema.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.page !== page.page ||
    result.data.data.page_size !== page.page_size
  ) {
    throw new AgentWorkspaceListError('INVALID_RESPONSE', response.status)
  }
  return result.data.data
}
