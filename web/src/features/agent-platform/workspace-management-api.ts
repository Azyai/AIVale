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
  workspaceArchiveInputSchema,
  workspaceUpdateInputSchema,
  type WorkspaceArchiveInput,
  type WorkspaceManagementField,
  type WorkspaceUpdateInput,
} from './lib/workspace-management-form'
import {
  workspaceIdSchema,
  workspaceReadResponseSchema,
} from './lib/workspace-read-transport'
import {
  workspaceWriteKeySchema,
  workspaceWriteRevisionSchema,
} from './lib/workspace-write-fields'
import {
  AgentWorkspaceWriteError,
  assertWorkspaceWriteSession,
  sendWorkspaceWrite,
  workspaceWriteReceiptExpiry,
  workspaceWriteReceiptHeadersMatch,
  type WorkspaceWriteErrorFactory,
  type WorkspaceWriteSession,
} from './lib/workspace-write-transport'
import {
  workspaceDetailSchema,
  type AgentWorkspaceDetail,
} from './workspace-detail-api'

export {
  isCurrentWorkspaceWriteSession,
  type WorkspaceWriteSession,
} from './lib/workspace-write-transport'

const collection = '/api/agent-platform/workspaces'
const updateResponseSchema = workspaceReadResponseSchema(workspaceDetailSchema)
const archiveReceiptSchema = z.strictObject({
  id: workspaceIdSchema,
  status: z.literal('archived'),
  revision: workspaceWriteRevisionSchema,
  archived_at: z.number().int().positive(),
  blocking_run_count: z.literal(0),
})
const archiveResponseSchema = workspaceReadResponseSchema(archiveReceiptSchema)

export type AgentWorkspaceArchiveReceipt = z.output<
  typeof archiveReceiptSchema
> & {
  idempotencyExpiresAt: number
}

export class AgentWorkspaceManagementError extends AgentWorkspaceWriteError<WorkspaceManagementField> {
  readonly name = 'AgentWorkspaceManagementError'
}

const makeManagementError: WorkspaceWriteErrorFactory = (
  code,
  status,
  paths = [],
  retryable
) =>
  new AgentWorkspaceManagementError(
    code,
    status,
    [
      ...new Set(
        paths.filter(
          (path) =>
            path === 'name' ||
            path === 'description' ||
            path === 'reason' ||
            path === 'expected_revision'
        )
      ),
    ],
    retryable
  )

export async function updateAgentWorkspace(
  workspaceId: string,
  input: WorkspaceUpdateInput,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentWorkspaceDetail> {
  assertWorkspaceWriteSession(session, signal, makeManagementError)
  const target = workspaceIdSchema.safeParse(workspaceId)
  const normalized = workspaceUpdateInputSchema.safeParse(input)
  if (!target.success || !normalized.success) {
    throw makeManagementError(
      'AG_INVALID_ARGUMENT',
      400,
      normalized.success
        ? []
        : normalized.error.issues.map(({ path }) => path[0])
    )
  }
  const response = await sendWorkspaceWrite({
    method: 'patch',
    path: `${collection}/${target.data}`,
    body: normalized.data,
    session,
    signal,
    makeError: makeManagementError,
  })
  const result = updateResponseSchema.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.id !== target.data ||
    result.data.data.revision !== normalized.data.expected_revision + 1 ||
    (normalized.data.name !== undefined &&
      result.data.data.name !== normalized.data.name) ||
    (normalized.data.description !== undefined &&
      result.data.data.description !== normalized.data.description) ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    throw makeManagementError('INVALID_RESPONSE', response.status)
  }
  return result.data.data
}

export async function archiveAgentWorkspace(
  workspaceId: string,
  input: WorkspaceArchiveInput,
  intentKey: string,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentWorkspaceArchiveReceipt> {
  assertWorkspaceWriteSession(session, signal, makeManagementError)
  const target = workspaceIdSchema.safeParse(workspaceId)
  const normalized = workspaceArchiveInputSchema.safeParse(input)
  if (
    !target.success ||
    !normalized.success ||
    !workspaceWriteKeySchema.safeParse(intentKey).success
  ) {
    throw makeManagementError(
      'AG_INVALID_ARGUMENT',
      400,
      normalized.success
        ? []
        : normalized.error.issues.map(({ path }) => path[0])
    )
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: `${collection}/${target.data}/archive`,
    body: normalized.data,
    headers: { 'Idempotency-Key': intentKey },
    session,
    signal,
    makeError: makeManagementError,
  })
  const result = archiveResponseSchema.safeParse(response.data)
  const expiry = workspaceWriteReceiptExpiry(response.headers)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.id !== target.data ||
    result.data.data.revision !== normalized.data.expected_revision + 1 ||
    expiry === undefined ||
    expiry <= result.data.data.archived_at ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    // A malformed reply cannot prove that the server did not commit the archive.
    throw makeManagementError('INVALID_RESPONSE', response.status, [], true)
  }
  return { ...result.data.data, idempotencyExpiresAt: expiry }
}
