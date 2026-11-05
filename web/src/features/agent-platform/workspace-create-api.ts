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
  workspaceCreateInputSchema,
  workspaceCreateSlugSchema,
  type WorkspaceCreateField,
  type WorkspaceCreateInput,
} from './lib/workspace-create-form'
import {
  AgentWorkspaceReadError,
  fetchWorkspaceRead,
  workspaceIdSchema,
  workspaceReadResponseSchema,
} from './lib/workspace-read-transport'
import { workspaceWriteKeySchema } from './lib/workspace-write-fields'
import {
  AgentWorkspaceWriteError,
  assertWorkspaceWriteSession,
  isCurrentWorkspaceWriteSession,
  sendWorkspaceWrite,
  workspaceWriteReceiptExpiry,
  workspaceWriteReceiptHeadersMatch,
  type WorkspaceWriteErrorFactory,
  type WorkspaceWriteSession,
} from './lib/workspace-write-transport'

const workspaceCreateEligibilityResponse = workspaceReadResponseSchema(
  z.discriminatedUnion('can_create', [
    z.strictObject({ can_create: z.literal(true), team_id: workspaceIdSchema }),
    z.strictObject({ can_create: z.literal(false), team_id: z.null() }),
  ])
)

export type AgentWorkspaceCreateEligibility = z.output<
  typeof workspaceCreateEligibilityResponse
>['data']

export class AgentWorkspaceCreateEligibilityError extends AgentWorkspaceReadError {
  readonly name = 'AgentWorkspaceCreateEligibilityError'
}

export async function getWorkspaceCreateEligibility(
  signal?: AbortSignal
): Promise<AgentWorkspaceCreateEligibility> {
  const response = await fetchWorkspaceRead(
    '/api/agent-platform/workspaces/create-eligibility',
    { signal, ErrorType: AgentWorkspaceCreateEligibilityError }
  )
  const parsed = workspaceCreateEligibilityResponse.safeParse(response.data)
  if (response.status !== 200 || !parsed.success) {
    throw new AgentWorkspaceCreateEligibilityError(
      'INVALID_RESPONSE',
      response.status
    )
  }
  return parsed.data.data
}

const createReceiptSchema = z.strictObject({
  id: workspaceIdSchema,
  slug: workspaceCreateSlugSchema,
  status: z.literal('active'),
  revision: z.literal(1),
  created_at: z.number().int().positive(),
})
const createResponseSchema = workspaceReadResponseSchema(createReceiptSchema)

export type AgentWorkspaceCreateReceipt = z.output<
  typeof createReceiptSchema
> & {
  idempotencyExpiresAt: number
}

export type WorkspaceCreateSession = WorkspaceWriteSession &
  Readonly<{ teamId: string }>

export class AgentWorkspaceCreateError extends AgentWorkspaceWriteError<WorkspaceCreateField> {
  readonly name = 'AgentWorkspaceCreateError'
}

const makeCreateError: WorkspaceWriteErrorFactory = (
  code,
  status,
  paths = [],
  retryable
) =>
  new AgentWorkspaceCreateError(
    code,
    status,
    [
      ...new Set(
        paths.filter(
          (path) => path === 'name' || path === 'description' || path === 'slug'
        )
      ),
    ],
    retryable
  )

export function isCurrentWorkspaceCreateSession(
  session: WorkspaceCreateSession
): boolean {
  return (
    isCurrentWorkspaceWriteSession(session) &&
    workspaceIdSchema.safeParse(session.teamId).success
  )
}

/** Submit a single attempt, fenced to the observed session and expected live Team. */
export async function createAgentWorkspace(
  input: WorkspaceCreateInput,
  intentKey: string,
  session: WorkspaceCreateSession,
  signal?: AbortSignal
): Promise<AgentWorkspaceCreateReceipt> {
  assertWorkspaceWriteSession(session, signal, makeCreateError)
  if (!workspaceIdSchema.safeParse(session.teamId).success) {
    throw makeCreateError('AG_AUTH_REQUIRED', 401)
  }

  const normalized = workspaceCreateInputSchema.safeParse(input)
  if (
    !normalized.success ||
    !workspaceWriteKeySchema.safeParse(intentKey).success
  ) {
    throw makeCreateError(
      'AG_INVALID_ARGUMENT',
      400,
      normalized.success
        ? []
        : normalized.error.issues.map(({ path }) => path[0])
    )
  }

  const response = await sendWorkspaceWrite({
    method: 'post',
    path: '/api/agent-platform/workspaces',
    body: normalized.data,
    headers: {
      'Idempotency-Key': intentKey,
      'X-Agent-Expected-Team-Id': session.teamId,
    },
    session,
    signal,
    makeError: makeCreateError,
  })
  const parsed = createResponseSchema.safeParse(response.data)
  const expires = workspaceWriteReceiptExpiry(response.headers)
  if (
    response.status !== 201 ||
    !parsed.success ||
    expires === undefined ||
    expires <= parsed.data.data.created_at ||
    (normalized.data.slug !== undefined &&
      normalized.data.slug !== parsed.data.data.slug) ||
    !workspaceWriteReceiptHeadersMatch(response.headers, parsed.data.request_id)
  ) {
    // An invalid receipt cannot prove a failed write. Keep the intent for retry.
    throw makeCreateError('INVALID_RESPONSE', response.status, [], true)
  }
  return { ...parsed.data.data, idempotencyExpiresAt: expires }
}
