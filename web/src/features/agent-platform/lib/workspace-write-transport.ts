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
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { z } from 'zod'

import { api } from '@/lib/api'
import { getFreshAuthHeaders } from '@/lib/auth-session'
import { safeServerErrorMessage } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export type WorkspaceWriteSession = Readonly<{
  userId: number
  sessionId: string
}>

const errorStatuses = {
  AG_INVALID_ARGUMENT: 400,
  AG_AUTH_REQUIRED: 401,
  AG_PERMISSION_DENIED: 403,
  AG_RESOURCE_NOT_FOUND: 404,
  AG_DRAFT_REVISION_CONFLICT: 409,
  AG_IDEMPOTENCY_CONFLICT: 409,
  AG_REQUEST_IN_PROGRESS: 409,
  AG_RESOURCE_IN_USE: 409,
  AG_INVALID_STATE: 409,
  AG_PAYLOAD_TOO_LARGE: 413,
  AG_DEPENDENCY_UNAVAILABLE: 422,
  AG_INTERNAL_ERROR: 500,
  AG_RUNTIME_UNAVAILABLE: 503,
} as const
type WireWriteErrorCode = keyof typeof errorStatuses
export type WorkspaceWriteErrorCode =
  | WireWriteErrorCode
  | 'INVALID_RESPONSE'
  | 'REQUEST_FAILED'

const workspaceWriteErrorSchema = z.strictObject({
  success: z.literal(false),
  code: z.enum(Object.keys(errorStatuses) as WireWriteErrorCode[]),
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

export abstract class AgentWorkspaceWriteError<
  Field extends string,
> extends Error {
  readonly [safeServerErrorMessage] = true

  constructor(
    readonly code: WorkspaceWriteErrorCode,
    readonly status?: number,
    readonly fields: readonly Field[] = [],
    readonly retryable = false
  ) {
    super('Request failed')
  }
}

export type WorkspaceWriteErrorFactory = (
  code: WorkspaceWriteErrorCode,
  status?: number,
  paths?: readonly unknown[],
  retryable?: boolean
) => Error

function currentWorkspaceWriteBearer(
  session: WorkspaceWriteSession
): string | null {
  const { auth } = useAuthStore.getState()
  if (
    Number.isSafeInteger(session.userId) &&
    session.userId > 0 &&
    typeof session.sessionId === 'string' &&
    session.sessionId !== '' &&
    auth.user?.id === session.userId &&
    auth.session?.sid === session.sessionId
  ) {
    return auth.accessToken || null
  }
  return null
}

export function isCurrentWorkspaceWriteSession(
  session: WorkspaceWriteSession
): boolean {
  return currentWorkspaceWriteBearer(session) !== null
}

function requireCurrentBearer(
  session: WorkspaceWriteSession,
  signal: AbortSignal | undefined,
  makeError: WorkspaceWriteErrorFactory
): string {
  if (signal?.aborted) throw new CanceledError()
  const token = currentWorkspaceWriteBearer(session)
  if (!token) throw makeError('AG_AUTH_REQUIRED', 401)
  return token
}

export function assertWorkspaceWriteSession(
  session: WorkspaceWriteSession,
  signal: AbortSignal | undefined,
  makeError: WorkspaceWriteErrorFactory
): void {
  requireCurrentBearer(session, signal, makeError)
}

function receiptHeader(
  headers: AxiosResponse<unknown>['headers'],
  name: string
): unknown {
  const matches = Object.entries(headers ?? {}).filter(
    ([key]) => key.toLowerCase() === name
  )
  return matches.length === 1 ? matches[0]?.[1] : undefined
}

export function workspaceWriteReceiptHeadersMatch(
  headers: AxiosResponse<unknown>['headers'],
  requestId: string
): boolean {
  return (
    receiptHeader(headers, 'x-oneapi-request-id') === requestId &&
    receiptHeader(headers, 'cache-control') === 'no-store'
  )
}

const receiptExpirySchema = z
  .string()
  .regex(/^[1-9][0-9]{0,15}$/)
  .transform(Number)
  .pipe(z.number().int().positive())

export function workspaceWriteReceiptExpiry(
  headers: AxiosResponse<unknown>['headers']
): number | undefined {
  return receiptExpirySchema.safeParse(
    receiptHeader(headers, 'idempotency-key-expires-at')
  ).data
}

type WorkspaceWriteRequest = {
  path: string
  session: WorkspaceWriteSession
  headers?: Record<string, string>
  signal?: AbortSignal
  makeError: WorkspaceWriteErrorFactory
} & (
  | { method: 'patch' | 'post' | 'put'; body: Record<string, unknown> }
  | { method: 'delete'; body?: never }
)

/** Fence each attempt to its original principal; refresh before dispatch and never replay a write. */
export async function sendWorkspaceWrite(
  options: WorkspaceWriteRequest
): Promise<AxiosResponse<unknown>> {
  const { method, path, body, session, signal, makeError } = options
  requireCurrentBearer(session, signal, makeError)
  try {
    await getFreshAuthHeaders()
  } catch {
    requireCurrentBearer(session, signal, makeError)
    throw makeError('REQUEST_FAILED', undefined, [], true)
  }
  requireCurrentBearer(session, signal, makeError)

  let response: AxiosResponse<unknown>
  try {
    const config: AxiosRequestConfig = {
      headers: {
        ...(method !== 'delete' ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      signal,
      skipAuthRefresh: true,
      skipErrorHandler: true,
      transformRequest: [
        (data, headers) => {
          const bearer = requireCurrentBearer(session, signal, makeError)
          headers.set('Authorization', `Bearer ${bearer}`)
          return method === 'delete' ? undefined : JSON.stringify(data)
        },
      ],
    }
    response =
      method === 'delete'
        ? await api.delete<unknown>(path, config)
        : await api[method]<unknown>(path, body, config)
  } catch (error) {
    requireCurrentBearer(session, signal, makeError)
    if (isCancel(error)) throw new CanceledError()
    if (error instanceof AgentWorkspaceWriteError) throw error
    const reply = isAxiosError<unknown>(error) ? error.response : undefined
    const parsed = workspaceWriteErrorSchema.safeParse(reply?.data)
    if (
      reply &&
      parsed.success &&
      errorStatuses[parsed.data.code] === reply.status
    ) {
      throw makeError(
        parsed.data.code,
        reply.status,
        parsed.data.data.field_errors.map(({ path }) => path),
        parsed.data.data.retryable
      )
    }
    throw makeError(
      'REQUEST_FAILED',
      reply?.status,
      [],
      !reply || reply.status >= 500
    )
  }

  requireCurrentBearer(session, signal, makeError)
  return response
}
