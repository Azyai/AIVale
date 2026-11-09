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
import { CanceledError } from 'axios'
import type { z } from 'zod'

import {
  AgentWorkspaceReadError,
  fetchWorkspaceRead,
  workspaceIdSchema,
  workspaceReadResponseSchema,
} from '../lib/workspace-read-transport'
import {
  AgentWorkspaceWriteError,
  sendWorkspaceWrite,
  workspaceWriteReceiptExpiry,
  workspaceWriteReceiptHeadersMatch,
  type WorkspaceWriteSession,
} from '../lib/workspace-write-transport'
import {
  agentConfigInputSchema,
  agentCreateInputSchema,
  agentDetailSchema,
  agentDraftSchema,
  agentPageDataSchema,
  agentRevisionSchema,
  modelOptionsSchema,
  validationReportSchema,
  isAgentText,
  type AgentConfigInput,
  type AgentCreateInput,
  type AgentListSearch,
} from './schemas'

export class AgentApiError extends AgentWorkspaceWriteError<string> {
  readonly name = 'AgentApiError'
}
class AgentReadError extends AgentWorkspaceReadError {}
const makeError = (
  code: ConstructorParameters<typeof AgentApiError>[0],
  status?: number,
  fields: readonly unknown[] = [],
  retryable?: boolean
) =>
  new AgentApiError(
    code,
    status,
    fields.filter(
      (field): field is string =>
        typeof field === 'string' &&
        [
          'name',
          'description',
          'kind',
          'config',
          'config.name',
          'schema_version',
          'instructions',
          'config.instructions',
          'model_policy',
          'model_policy.model',
          'config.model_policy.model',
          'model_policy.temperature',
          'model_policy.max_output_tokens',
          'input_schema',
          'output_schema',
          'skill_bindings',
          'tool_bindings',
          'limits',
          'limits.max_steps',
          'limits.max_model_calls',
          'limits.max_tool_calls',
          'limits.timeout_seconds',
          'limits.max_cost_quota',
          'expected_revision',
          'draft_revision',
          'release_note',
          'version_id',
          'reason',
          'status',
        ].includes(field)
    ),
    retryable
  )
function collection(workspaceId: string) {
  if (!workspaceIdSchema.safeParse(workspaceId).success) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  return `/api/agent-platform/workspaces/${workspaceId}/agents`
}
function itemPath(workspaceId: string, agentId: string) {
  if (!workspaceIdSchema.safeParse(agentId).success) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  return `${collection(workspaceId)}/${agentId}`
}
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  params?: Record<string, string | number>
): Promise<T> {
  try {
    const response = await fetchWorkspaceRead(path, {
      ErrorType: AgentReadError,
      signal,
      params,
    })
    const result = workspaceReadResponseSchema(schema).safeParse(response.data)
    if (
      !result.success ||
      response.status !== 200 ||
      !workspaceWriteReceiptHeadersMatch(
        response.headers,
        result.data.request_id
      )
    ) {
      throw makeError('INVALID_RESPONSE', response.status)
    }
    return result.data.data
  } catch (error) {
    if (error instanceof AgentReadError) {
      throw makeError(error.code, error.status)
    }
    throw error
  }
}
export async function listAgents(
  workspaceId: string,
  search: AgentListSearch,
  signal?: AbortSignal
) {
  if (
    !Number.isSafeInteger(search.page) ||
    search.page < 1 ||
    !Number.isSafeInteger(search.page_size) ||
    search.page_size < 1 ||
    search.page_size > 100 ||
    ![
      'created_at:desc,id:desc',
      'created_at:asc,id:asc',
      'id:asc',
      'id:desc',
    ].includes(search.sort) ||
    !['', 'active', 'disabled', 'archived'].includes(search.status) ||
    !isAgentText(search.q, 512, 128) ||
    !isAgentText(search.tag, 256, 64)
  ) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  const params: Record<string, string | number> = {
    page: search.page,
    page_size: search.page_size,
    sort: search.sort,
  }
  for (const field of ['q', 'status', 'tag'] as const) {
    if (search[field]) params[field] = search[field]
  }
  const page = await read(
    collection(workspaceId),
    agentPageDataSchema,
    signal,
    params
  )
  if (
    page.page !== search.page ||
    page.page_size !== search.page_size ||
    page.total < page.items.length
  ) {
    throw makeError('INVALID_RESPONSE')
  }
  return page
}
export async function getAgent(
  workspaceId: string,
  agentId: string,
  signal?: AbortSignal
) {
  const data = await read(
    itemPath(workspaceId, agentId),
    agentDetailSchema,
    signal
  )
  if (data.id !== agentId) throw makeError('INVALID_RESPONSE')
  return data
}

// Shared within this feature so release commands retain the same session,
// transport validation and static error-field boundary as the draft editor.
export {
  makeError as makeAgentError,
  itemPath as agentItemPath,
  read as readAgentResource,
}
export async function getAgentDraft(
  workspaceId: string,
  agentId: string,
  signal?: AbortSignal
) {
  const data = await read(
    `${itemPath(workspaceId, agentId)}/draft`,
    agentDraftSchema,
    signal
  )
  if (data.id !== agentId || (data.config === null && data.revision !== 1)) {
    throw makeError('INVALID_RESPONSE')
  }
  return data
}
export async function createAgent(
  workspaceId: string,
  input: AgentCreateInput,
  key: string,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
) {
  if (
    !agentCreateInputSchema.safeParse(input).success ||
    !/^[\x21-\x7e]{16,128}$/.test(key)
  ) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: collection(workspaceId),
    body: input,
    session,
    signal,
    headers: { 'Idempotency-Key': key },
    makeError,
  })
  if (signal?.aborted) throw new CanceledError()
  const data = workspaceReadResponseSchema(agentDraftSchema).safeParse(
    response.data
  )
  const expiry = workspaceWriteReceiptExpiry(response.headers)
  if (
    !data.success ||
    response.status !== 201 ||
    data.data.data.revision !== 1 ||
    data.data.data.config !== null ||
    !Number.isSafeInteger(expiry) ||
    !expiry ||
    !workspaceWriteReceiptHeadersMatch(response.headers, data.data.request_id)
  ) {
    throw makeError('INVALID_RESPONSE', response.status, [], true)
  }
  return { ...data.data.data, idempotencyExpiresAt: expiry }
}
export async function saveAgentDraft(
  workspaceId: string,
  agentId: string,
  revision: number,
  config: AgentConfigInput,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
) {
  if (
    !agentRevisionSchema.safeParse(revision).success ||
    !agentConfigInputSchema.safeParse(config).success
  ) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'put',
    path: `${itemPath(workspaceId, agentId)}/draft`,
    body: { expected_revision: revision, config },
    session,
    signal,
    makeError,
  })
  const parsed = workspaceReadResponseSchema(agentDraftSchema).safeParse(
    response.data
  )
  if (
    !parsed.success ||
    response.status !== 200 ||
    parsed.data.data.id !== agentId ||
    parsed.data.data.revision !== revision + 1 ||
    !parsed.data.data.config ||
    parsed.data.data.config.name !== config.name ||
    parsed.data.data.config.model_policy.model !== config.model_policy.model ||
    parsed.data.data.config.instructions !== config.instructions ||
    !workspaceWriteReceiptHeadersMatch(response.headers, parsed.data.request_id)
  ) {
    throw makeError('INVALID_RESPONSE', response.status)
  }
  return parsed.data.data
}
export async function validateAgentDraft(
  workspaceId: string,
  agentId: string,
  draftRevision: number,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
) {
  if (!agentRevisionSchema.safeParse(draftRevision).success) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: `${itemPath(workspaceId, agentId)}/validate`,
    body: { draft_revision: draftRevision },
    session,
    signal,
    makeError,
  })
  const parsed = workspaceReadResponseSchema(validationReportSchema).safeParse(
    response.data
  )
  if (
    !parsed.success ||
    response.status !== 200 ||
    parsed.data.data.id !== agentId ||
    parsed.data.data.draft_revision !== draftRevision ||
    !workspaceWriteReceiptHeadersMatch(response.headers, parsed.data.request_id)
  ) {
    throw makeError('INVALID_RESPONSE', response.status)
  }
  return parsed.data.data
}
export async function listAgentModelOptions(
  workspaceId: string,
  search: { page: number; page_size: number; q: string },
  signal?: AbortSignal
) {
  collection(workspaceId)
  if (
    !Number.isSafeInteger(search.page) ||
    search.page < 1 ||
    !Number.isSafeInteger(search.page_size) ||
    search.page_size < 1 ||
    search.page_size > 100 ||
    !isAgentText(search.q, 512, 128)
  ) {
    throw makeError('AG_INVALID_ARGUMENT', 400)
  }
  const data = await read(
    `/api/agent-platform/workspaces/${workspaceId}/model-options`,
    modelOptionsSchema,
    signal,
    search
  )
  if (
    data.page !== search.page ||
    data.page_size !== search.page_size ||
    data.total < data.items.length
  ) {
    throw makeError('INVALID_RESPONSE')
  }
  return data
}
