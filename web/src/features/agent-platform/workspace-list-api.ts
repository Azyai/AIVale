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

import {
  isWorkspaceNameText,
  workspaceListPageNumberSchema,
  workspaceListPageSizeSchema,
  workspaceListRequestSchema,
  type WorkspaceListSearch,
} from './lib/workspace-list-search'

// API-001: .agents/agent-platform/contracts/v1/workspaces.schema.json.
const workspaceIdSchema = z
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

const workspaceSummarySchema = z.strictObject({
  id: workspaceIdSchema,
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().min(1).refine(isWorkspaceNameText),
  status: workspaceStatusSchema,
  current_role: workspaceRoleSchema,
  created_at: z.number().int().nonnegative(),
  updated_at: z.number().int().nonnegative(),
  revision: workspaceListPageNumberSchema,
  effective_permissions: z
    .array(workspacePermissionSchema)
    .max(workspacePermissionSchema.options.length)
    .refine(
      (permissions) =>
        permissions.includes('workspace:read') &&
        new Set(permissions).size === permissions.length
    ),
})

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

const requestIdSchema = z.string().regex(/^[a-zA-Z0-9_.:-]{1,64}$/)
const workspaceListResponseSchema = z.strictObject({
  success: z.literal(true),
  code: z.literal('OK'),
  message: z.literal(''),
  request_id: requestIdSchema,
  data: workspacePageSchema,
})

const workspaceListErrorStatuses = {
  AG_INVALID_ARGUMENT: 400,
  AG_AUTH_REQUIRED: 401,
  AG_PERMISSION_DENIED: 403,
  AG_RESOURCE_NOT_FOUND: 404,
  AG_INTERNAL_ERROR: 500,
  AG_RUNTIME_UNAVAILABLE: 503,
} as const
type WorkspaceListWireErrorCode = keyof typeof workspaceListErrorStatuses

const workspaceListErrorSchema = z.strictObject({
  success: z.literal(false),
  code: z.enum(
    Object.keys(workspaceListErrorStatuses) as WorkspaceListWireErrorCode[]
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

export type AgentWorkspacePage = z.infer<typeof workspacePageSchema>
export type AgentWorkspaceSummary = z.infer<typeof workspaceSummarySchema>
export type AgentWorkspaceRole = z.infer<typeof workspaceRoleSchema>
export type AgentWorkspaceStatus = z.infer<typeof workspaceStatusSchema>

export class AgentWorkspaceListError extends Error {
  readonly [safeServerErrorMessage] = true

  constructor(
    readonly code:
      | WorkspaceListWireErrorCode
      | 'INVALID_RESPONSE'
      | 'REQUEST_FAILED',
    readonly status?: number
  ) {
    super('Request failed')
    this.name = 'AgentWorkspaceListError'
  }
}

/** Fetch only the live, visible page. Never keep the raw body or Axios config in errors. */
export async function listAgentWorkspaces(
  search: WorkspaceListSearch,
  signal?: AbortSignal
): Promise<AgentWorkspacePage> {
  const parsed = workspaceListRequestSchema.safeParse(search)
  if (!parsed.success) throw new AgentWorkspaceListError('AG_INVALID_ARGUMENT')
  const { q, ...page } = parsed.data
  let response: AxiosResponse<unknown>
  try {
    response = await api.get<unknown>('/api/agent-platform/workspaces', {
      params: q ? { ...page, q } : page,
      signal,
      // Query owns sharing and cancellation. The workbench owns its inline errors.
      disableDuplicate: true,
      skipErrorHandler: true,
    })
  } catch (error) {
    if (signal?.aborted || isCancel(error)) throw new CanceledError()
    const reply = isAxiosError<unknown>(error) ? error.response : undefined
    const problem = workspaceListErrorSchema.safeParse(reply?.data)
    if (
      reply &&
      problem.success &&
      workspaceListErrorStatuses[problem.data.code] === reply.status
    ) {
      throw new AgentWorkspaceListError(problem.data.code, reply.status)
    }
    throw new AgentWorkspaceListError('REQUEST_FAILED', reply?.status)
  }
  if (signal?.aborted) throw new CanceledError()
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
