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
} from './lib/workspace-read-transport'
import {
  AgentWorkspaceWriteError,
  assertWorkspaceWriteSession,
  sendWorkspaceWrite,
  workspaceWriteReceiptHeadersMatch,
  type WorkspaceWriteErrorFactory,
  type WorkspaceWriteSession,
} from './lib/workspace-write-transport'

export const workspaceMemberRoleSchema = z.enum([
  'admin',
  'developer',
  'operator',
  'viewer',
])
const memberSchema = z
  .strictObject({
    user_id: workspaceIdSchema,
    role: workspaceMemberRoleSchema,
    status: z.enum(['active', 'blocked']),
    revision: z.number().int().positive(),
    created_at: z.number().int().positive(),
    updated_at: z.number().int().positive(),
  })
  .refine((member) => member.updated_at >= member.created_at)
const memberListResponse = workspaceReadResponseSchema(
  z
    .strictObject({
      items: z.array(memberSchema).max(100),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      page_size: z.number().int().min(1).max(100),
    })
    .refine(
      (page) =>
        page.items.length <= Math.min(page.total, page.page_size) &&
        new Set(page.items.map((member) => member.user_id)).size ===
          page.items.length
    )
)
const memberPutResponse = workspaceReadResponseSchema(memberSchema)
const memberRemovalResponse = workspaceReadResponseSchema(
  z.strictObject({
    user_id: workspaceIdSchema,
    revoked: z.literal(true),
  })
)
const memberPutSchema = z.strictObject({
  role: workspaceMemberRoleSchema,
  expected_revision: z.number().int().nonnegative(),
})
export type WorkspaceMember = z.output<typeof memberSchema>
export type WorkspaceMemberRole = z.output<typeof workspaceMemberRoleSchema>

export function canManageWorkspaceMember(
  member: WorkspaceMember,
  actorId: string,
  owner: boolean | undefined
) {
  if (member.user_id === actorId) return owner === false
  return owner === true || member.role !== 'admin'
}

export class WorkspaceMembersReadError extends AgentWorkspaceReadError {
  readonly name = 'WorkspaceMembersReadError'
}

export class WorkspaceMembersWriteError extends AgentWorkspaceWriteError<never> {
  readonly name = 'WorkspaceMembersWriteError'
}

const makeWriteError: WorkspaceWriteErrorFactory = (
  code,
  status,
  _paths,
  retryable
) => new WorkspaceMembersWriteError(code, status, [], retryable)

const membersPath = (workspaceId: string) =>
  `/api/agent-platform/workspaces/${workspaceId}/members`
export const workspaceMembersPageSize = 10

export async function listAgentWorkspaceMembers(
  workspaceId: string,
  page: number,
  signal?: AbortSignal
) {
  if (
    !workspaceIdSchema.safeParse(workspaceId).success ||
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    throw new WorkspaceMembersReadError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await fetchWorkspaceRead(membersPath(workspaceId), {
    params: { page, page_size: workspaceMembersPageSize },
    signal,
    ErrorType: WorkspaceMembersReadError,
  })
  const result = memberListResponse.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.page !== page ||
    result.data.data.page_size !== workspaceMembersPageSize ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    throw new WorkspaceMembersReadError('INVALID_RESPONSE', response.status)
  }
  return result.data.data
}

export async function putAgentWorkspaceMember(
  workspaceId: string,
  userId: string,
  input: z.input<typeof memberPutSchema>,
  session: WorkspaceWriteSession,
  signal: AbortSignal
): Promise<WorkspaceMember> {
  assertWorkspaceWriteSession(session, signal, makeWriteError)
  const payload = memberPutSchema.safeParse(input)
  if (
    !workspaceIdSchema.safeParse(workspaceId).success ||
    !workspaceIdSchema.safeParse(userId).success ||
    !payload.success
  ) {
    throw makeWriteError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'put',
    path: `${membersPath(workspaceId)}/${userId}`,
    body: payload.data,
    session,
    signal,
    makeError: makeWriteError,
  })
  const result = memberPutResponse.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.user_id !== userId ||
    result.data.data.role !== input.role ||
    result.data.data.status !== 'active' ||
    !(
      result.data.data.revision === input.expected_revision + 1 ||
      (input.expected_revision > 0 &&
        result.data.data.revision === input.expected_revision)
    ) ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    throw makeWriteError('INVALID_RESPONSE', response.status)
  }
  return result.data.data
}

export async function removeAgentWorkspaceMember(
  workspaceId: string,
  userId: string,
  session: WorkspaceWriteSession,
  signal: AbortSignal
): Promise<void> {
  assertWorkspaceWriteSession(session, signal, makeWriteError)
  if (
    !workspaceIdSchema.safeParse(workspaceId).success ||
    !workspaceIdSchema.safeParse(userId).success
  ) {
    throw makeWriteError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'delete',
    path: `${membersPath(workspaceId)}/${userId}`,
    session,
    signal,
    makeError: makeWriteError,
  })
  const result = memberRemovalResponse.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.user_id !== userId ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    throw makeWriteError('INVALID_RESPONSE', response.status)
  }
}
