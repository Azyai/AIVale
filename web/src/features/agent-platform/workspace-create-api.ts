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
  CanceledError,
  isAxiosError,
  isCancel,
  type AxiosResponse,
} from 'axios'
import { z } from 'zod'

import { api } from '@/lib/api'
import { getFreshAuthHeaders } from '@/lib/auth-session'
import { safeServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

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
const receiptExpirySchema = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/)
  .transform(Number)
  .pipe(z.number().int().positive())
const idempotencyKeySchema = z.string().regex(/^[\x21-\x7e]{16,128}$/)

export type AgentWorkspaceCreateReceipt = z.output<
  typeof createReceiptSchema
> & {
  idempotencyExpiresAt: number
}

export type WorkspaceCreateSession = Readonly<{
  userId: number
  sessionId: string
  teamId: string
}>

const errorStatuses = {
  AG_INVALID_ARGUMENT: 400,
  AG_AUTH_REQUIRED: 401,
  AG_PERMISSION_DENIED: 403,
  AG_RESOURCE_NOT_FOUND: 404,
  AG_IDEMPOTENCY_CONFLICT: 409,
  AG_REQUEST_IN_PROGRESS: 409,
  AG_RESOURCE_IN_USE: 409,
  AG_INVALID_STATE: 409,
  AG_PAYLOAD_TOO_LARGE: 413,
  AG_INTERNAL_ERROR: 500,
  AG_RUNTIME_UNAVAILABLE: 503,
} as const
type WireCreateErrorCode = keyof typeof errorStatuses
const createErrorSchema = z.strictObject({
  success: z.literal(false),
  code: z.enum(Object.keys(errorStatuses) as WireCreateErrorCode[]),
  message: z.string().max(512),
  request_id: z.string().regex(/^[a-zA-Z0-9_.:-]{1,64}$/),
  data: z.strictObject({
    field_errors: z
      .array(
        z.strictObject({
          path: z.string().max(256),
          message: z.string().max(256),
        })
      )
      .max(100),
    retryable: z.boolean(),
  }),
})

export class AgentWorkspaceCreateError extends Error {
  readonly name = 'AgentWorkspaceCreateError'
  readonly [safeServerErrorMessage] = true

  constructor(
    readonly code: WireCreateErrorCode | 'INVALID_RESPONSE' | 'REQUEST_FAILED',
    readonly status?: number,
    readonly fields: readonly WorkspaceCreateField[] = [],
    readonly retryable = false
  ) {
    super('Request failed')
  }
}

function workspaceCreateFields(paths: unknown[]): WorkspaceCreateField[] {
  return [
    ...new Set(
      paths.filter(
        (path) => path === 'name' || path === 'description' || path === 'slug'
      )
    ),
  ]
}

function currentWorkspaceCreateBearer(
  session: WorkspaceCreateSession
): string | null {
  const { auth } = useAuthStore.getState()
  if (
    Number.isSafeInteger(session.userId) &&
    session.userId > 0 &&
    typeof session.sessionId === 'string' &&
    session.sessionId !== '' &&
    auth.user?.id === session.userId &&
    auth.session?.sid === session.sessionId &&
    workspaceIdSchema.safeParse(session.teamId).success
  ) {
    return auth.accessToken || null
  }
  return null
}

export function isCurrentWorkspaceCreateSession(
  session: WorkspaceCreateSession
): boolean {
  return currentWorkspaceCreateBearer(session) !== null
}

function requireCurrentWorkspaceCreateBearer(
  session: WorkspaceCreateSession,
  signal?: AbortSignal
): string {
  if (signal?.aborted) throw new CanceledError()
  const token = currentWorkspaceCreateBearer(session)
  if (!token) throw new AgentWorkspaceCreateError('AG_AUTH_REQUIRED', 401)
  return token
}

function workspaceCreateReceiptHeader(
  headers: AxiosResponse<unknown>['headers'],
  name: string
): unknown {
  const matches = Object.entries(headers ?? {}).filter(
    ([key]) => key.toLowerCase() === name
  )
  return matches.length === 1 ? matches[0]?.[1] : undefined
}

/** Submit a single attempt, fenced to the observed session and expected live Team. */
export async function createAgentWorkspace(
  input: WorkspaceCreateInput,
  intentKey: string,
  session: WorkspaceCreateSession,
  signal?: AbortSignal
): Promise<AgentWorkspaceCreateReceipt> {
  requireCurrentWorkspaceCreateBearer(session, signal)
  const normalized = workspaceCreateInputSchema.safeParse(input)
  if (
    !normalized.success ||
    !idempotencyKeySchema.safeParse(intentKey).success
  ) {
    throw new AgentWorkspaceCreateError(
      'AG_INVALID_ARGUMENT',
      400,
      normalized.success
        ? []
        : workspaceCreateFields(
            normalized.error.issues.map(({ path }) => path[0])
          )
    )
  }

  try {
    // Refresh before dispatch, never replay the write through the shared 401 interceptor.
    await getFreshAuthHeaders()
  } catch {
    requireCurrentWorkspaceCreateBearer(session, signal)
    throw new AgentWorkspaceCreateError('REQUEST_FAILED', undefined, [], true)
  }
  requireCurrentWorkspaceCreateBearer(session, signal)

  let response: AxiosResponse<unknown>
  try {
    response = await api.post<unknown>(
      '/api/agent-platform/workspaces',
      normalized.data,
      {
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': intentKey,
          'X-Agent-Expected-Team-Id': session.teamId,
        },
        signal,
        skipAuthRefresh: true,
        skipErrorHandler: true,
        transformRequest: [
          (data, headers) => {
            const bearer = requireCurrentWorkspaceCreateBearer(session, signal)
            headers.set('Authorization', `Bearer ${bearer}`)
            return JSON.stringify(data)
          },
        ],
      }
    )
  } catch (error) {
    requireCurrentWorkspaceCreateBearer(session, signal)
    if (isCancel(error)) throw new CanceledError()
    if (error instanceof AgentWorkspaceCreateError) throw error
    const reply = isAxiosError<unknown>(error) ? error.response : undefined
    const parsed = createErrorSchema.safeParse(reply?.data)
    if (
      reply &&
      parsed.success &&
      errorStatuses[parsed.data.code] === reply.status
    ) {
      throw new AgentWorkspaceCreateError(
        parsed.data.code,
        reply.status,
        workspaceCreateFields(
          parsed.data.data.field_errors.map(({ path }) => path)
        ),
        parsed.data.data.retryable
      )
    }
    throw new AgentWorkspaceCreateError(
      'REQUEST_FAILED',
      reply?.status,
      [],
      !reply || reply.status >= 500
    )
  }

  requireCurrentWorkspaceCreateBearer(session, signal)
  const parsed = createResponseSchema.safeParse(response.data)
  const expires = receiptExpirySchema.safeParse(
    workspaceCreateReceiptHeader(response.headers, 'idempotency-key-expires-at')
  )
  if (
    response.status !== 201 ||
    !parsed.success ||
    !expires.success ||
    expires.data <= parsed.data.data.created_at ||
    (normalized.data.slug !== undefined &&
      normalized.data.slug !== parsed.data.data.slug) ||
    workspaceCreateReceiptHeader(response.headers, 'x-oneapi-request-id') !==
      parsed.data.request_id ||
    workspaceCreateReceiptHeader(response.headers, 'cache-control') !==
      'no-store'
  ) {
    // An invalid receipt cannot prove a failed write. Keep the intent for retry.
    throw new AgentWorkspaceCreateError(
      'INVALID_RESPONSE',
      response.status,
      [],
      true
    )
  }
  return { ...parsed.data.data, idempotencyExpiresAt: expires.data }
}
