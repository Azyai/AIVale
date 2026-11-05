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
  AgentWorkspaceReadError,
  fetchWorkspaceRead,
  workspaceIdSchema,
  workspaceReadResponseSchema,
  workspaceSummarySchema,
} from './lib/workspace-read-transport'

const descriptionEncoder = new TextEncoder()
export const workspaceDetailSchema = workspaceSummarySchema.extend({
  description: z
    .string()
    .refine(
      (description) =>
        description.length <= 4096 &&
        !description.includes('\0') &&
        !/[\uD800-\uDFFF]/u.test(description) &&
        descriptionEncoder.encode(description).byteLength <= 4096
    ),
})
const workspaceDetailResponseSchema = workspaceReadResponseSchema(
  workspaceDetailSchema
)

export type AgentWorkspaceDetail = z.infer<typeof workspaceDetailSchema>

export class AgentWorkspaceDetailError extends AgentWorkspaceReadError {
  override name = 'AgentWorkspaceDetailError'
}

export function isAgentWorkspaceId(value: string): boolean {
  return workspaceIdSchema.safeParse(value).success
}

/** Fetch current authorized metadata for exactly the requested workspace. */
export async function getAgentWorkspace(
  workspaceId: string,
  signal?: AbortSignal
): Promise<AgentWorkspaceDetail> {
  if (!isAgentWorkspaceId(workspaceId)) {
    throw new AgentWorkspaceDetailError('AG_INVALID_ARGUMENT')
  }
  const response = await fetchWorkspaceRead(
    `/api/agent-platform/workspaces/${workspaceId}`,
    {
      signal,
      ErrorType: AgentWorkspaceDetailError,
    }
  )
  const result = workspaceDetailResponseSchema.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.id !== workspaceId
  ) {
    throw new AgentWorkspaceDetailError('INVALID_RESPONSE', response.status)
  }
  return result.data.data
}
