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
import { safeServerErrorMessage } from '@/lib/server-error-message'

import { isWorkspaceNameText } from './workspace-list-search'

// API-001 and API-003: .agents/agent-platform/contracts/v1/workspaces.schema.json.
export const workspaceIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((id) => id.length < 19 || id <= '9223372036854775807')

const workspaceStatusSchema = z.enum(['active', 'suspended'])
const workspaceRoleSchema = z.enum(['admin', 'developer', 'operator', 'viewer'])
const workspacePermissionSchema = z.enum([
  'workspace:read',
  'workspace:manage',
  'member:manage',
  'agent:read',
  'agent:write',
  'agent:publish',
  'skill:read',
  'skill:write',
  'skill:publish',
  'mcp:read',
  'mcp:manage',
  'credential:manage',
  'run:read',
  'schedule:read',
  'schedule:manage',
])

export const workspaceSummarySchema = z.strictObject({
  id: workspaceIdSchema,
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().min(1).refine(isWorkspaceNameText),
  status: workspaceStatusSchema,
  current_role: workspaceRoleSchema,
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
  revision: z.number().int().min(1),
  effective_permissions: z
    .array(workspacePermissionSchema)
    .max(workspacePermissionSchema.options.length)
    .refine(
      (permissions) =>
        permissions.includes('workspace:read') &&
        new Set(permissions).size === permissions.length
    ),
})

export type AgentWorkspaceSummary = z.infer<typeof workspaceSummarySchema>
export type AgentWorkspaceRole = z.infer<typeof workspaceRoleSchema>
export type AgentWorkspaceStatus = z.infer<typeof workspaceStatusSchema>

const requestIdSchema = z.string().regex(/^[a-zA-Z0-9_.:-]{1,64}$/)

export function workspaceReadResponseSchema<T>(data: z.ZodType<T>) {
  return z.strictObject({
    success: z.literal(true),
    code: z.literal('OK'),
    message: z.literal(''),
    request_id: requestIdSchema,
    data,
  })
}

const workspaceReadErrorStatuses = {
  AG_INVALID_ARGUMENT: 400,
  AG_AUTH_REQUIRED: 401,
  AG_PERMISSION_DENIED: 403,
  AG_RESOURCE_NOT_FOUND: 404,
  AG_INTERNAL_ERROR: 500,
  AG_RUNTIME_UNAVAILABLE: 503,
} as const
type WorkspaceReadWireErrorCode = keyof typeof workspaceReadErrorStatuses
type WorkspaceReadErrorCode =
  | WorkspaceReadWireErrorCode
  | 'INVALID_RESPONSE'
  | 'REQUEST_FAILED'

const workspaceReadErrorSchema = z.strictObject({
  success: z.literal(false),
  code: z.enum(
    Object.keys(workspaceReadErrorStatuses) as WorkspaceReadWireErrorCode[]
  ),
  message: z.string().max(512),
  request_id: requestIdSchema,
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

export abstract class AgentWorkspaceReadError extends Error {
  readonly [safeServerErrorMessage] = true

  constructor(
    readonly code: WorkspaceReadErrorCode,
    readonly status?: number
  ) {
    super('Request failed')
  }
}

type WorkspaceReadRequest = {
  signal?: AbortSignal
  params?: Record<string, string | number>
  ErrorType: new (
    code: WorkspaceReadErrorCode,
    status?: number
  ) => AgentWorkspaceReadError
}

/** Preserve shared auth refresh, without retaining a raw body or request config. */
export async function fetchWorkspaceRead(
  path: string,
  { signal, params, ErrorType }: WorkspaceReadRequest
): Promise<AxiosResponse<unknown>> {
  if (signal?.aborted) throw new CanceledError()
  let response: AxiosResponse<unknown>
  try {
    response = await api.get<unknown>(path, {
      ...(params ? { params } : {}),
      signal,
      // Query owns sharing and cancellation. The workbench owns its inline errors.
      disableDuplicate: true,
      skipErrorHandler: true,
    })
  } catch (error) {
    if (signal?.aborted || isCancel(error)) throw new CanceledError()
    const reply = isAxiosError<unknown>(error) ? error.response : undefined
    const problem = workspaceReadErrorSchema.safeParse(reply?.data)
    if (
      reply &&
      problem.success &&
      workspaceReadErrorStatuses[problem.data.code] === reply.status
    ) {
      throw new ErrorType(problem.data.code, reply.status)
    }
    throw new ErrorType('REQUEST_FAILED', reply?.status)
  }
  if (signal?.aborted) throw new CanceledError()
  return response
}
