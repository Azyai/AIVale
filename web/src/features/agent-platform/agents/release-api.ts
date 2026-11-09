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
import { CanceledError, type AxiosResponse } from 'axios'
import type { z } from 'zod'

import { workspaceReadResponseSchema } from '../lib/workspace-read-transport'
import {
  sendWorkspaceWrite,
  workspaceWriteReceiptExpiry,
  workspaceWriteReceiptHeadersMatch,
  type WorkspaceWriteSession,
} from '../lib/workspace-write-transport'
import { agentItemPath, makeAgentError, readAgentResource } from './api'
import {
  agentActivateInputSchema,
  agentArchiveInputSchema,
  agentLifecycleStateSchema,
  agentPublishedVersionSchema,
  agentPublishInputSchema,
  agentRestoreInputSchema,
  agentStatusInputSchema,
  agentVersionDetailSchema,
  agentVersionListSearchSchema,
  agentVersionPageSchema,
  releaseIdSchema,
  type AgentActivateInput,
  type AgentArchiveInput,
  type AgentLifecycleState,
  type AgentPublicationReceipt,
  type AgentPublishInput,
  type AgentRestoreInput,
  type AgentStatusInput,
  type AgentVersionDetail,
  type AgentVersionListSearch,
  type AgentVersionPage,
} from './release-schemas'
import { agentDraftSchema, type AgentDraft } from './schemas'

function releasePath(workspaceId: string, agentId: string): string {
  if (
    !releaseIdSchema.safeParse(workspaceId).success ||
    !releaseIdSchema.safeParse(agentId).success
  ) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  return agentItemPath(workspaceId, agentId)
}

function commandResponse<T>(
  response: AxiosResponse<unknown>,
  schema: z.ZodType<T>,
  status: number
): T {
  const parsed = workspaceReadResponseSchema(schema).safeParse(response.data)
  if (
    !parsed.success ||
    response.status !== status ||
    !workspaceWriteReceiptHeadersMatch(response.headers, parsed.data.request_id)
  ) {
    throw makeAgentError('INVALID_RESPONSE', response.status)
  }
  return parsed.data.data
}

export async function listAgentVersions(
  workspaceId: string,
  agentId: string,
  search: AgentVersionListSearch,
  signal?: AbortSignal
): Promise<AgentVersionPage> {
  const path = releasePath(workspaceId, agentId)
  if (!agentVersionListSearchSchema.safeParse(search).success) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const page = await readAgentResource(
    `${path}/versions`,
    agentVersionPageSchema,
    signal,
    { page: search.page, page_size: search.page_size, sort: search.sort }
  )
  if (
    page.page !== search.page ||
    page.page_size !== search.page_size ||
    page.items.some((version) => version.agent_id !== agentId)
  ) {
    throw makeAgentError('INVALID_RESPONSE')
  }
  return page
}

export async function getAgentVersion(
  workspaceId: string,
  agentId: string,
  versionId: string,
  signal?: AbortSignal
): Promise<AgentVersionDetail> {
  const path = releasePath(workspaceId, agentId)
  if (!releaseIdSchema.safeParse(versionId).success) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const data = await readAgentResource(
    `${path}/versions/${versionId}`,
    agentVersionDetailSchema,
    signal
  )
  if (data.id !== versionId || data.agent_id !== agentId) {
    throw makeAgentError('INVALID_RESPONSE')
  }
  return data
}

export async function publishAgentVersion(
  workspaceId: string,
  agentId: string,
  input: AgentPublishInput,
  key: string,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentPublicationReceipt> {
  const path = releasePath(workspaceId, agentId)
  const parsed = agentPublishInputSchema.safeParse(input)
  if (
    !parsed.success ||
    typeof key !== 'string' ||
    key.length < 16 ||
    key.length > 128 ||
    key !== key.trim() ||
    !/^[\x21-\x7e]+$/.test(key)
  ) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: `${path}/publish`,
    body: parsed.data,
    session,
    signal,
    headers: { 'Idempotency-Key': key },
    makeError: makeAgentError,
  })
  if (signal?.aborted) throw new CanceledError()
  const version = commandResponse(response, agentPublishedVersionSchema, 201)
  const expiry = workspaceWriteReceiptExpiry(response.headers)
  if (
    version.agent_id !== agentId ||
    version.source_draft_revision !== parsed.data.draft_revision ||
    !expiry ||
    !Number.isSafeInteger(expiry)
  ) {
    throw makeAgentError('INVALID_RESPONSE', response.status, [], true)
  }
  // This receipt describes the original accepted publication. A later
  // publication may already be current, so callers must refetch metadata.
  return { ...version, idempotencyExpiresAt: expiry }
}

export async function restoreAgentVersion(
  workspaceId: string,
  agentId: string,
  input: AgentRestoreInput,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentDraft> {
  const path = releasePath(workspaceId, agentId)
  const parsed = agentRestoreInputSchema.safeParse(input)
  if (!parsed.success) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: `${path}/restore-draft`,
    body: parsed.data,
    session,
    signal,
    makeError: makeAgentError,
  })
  const draft = commandResponse(response, agentDraftSchema, 200)
  if (
    draft.id !== agentId ||
    draft.revision !== parsed.data.expected_revision + 1 ||
    draft.config === null
  ) {
    throw makeAgentError('INVALID_RESPONSE', response.status)
  }
  return draft
}

export async function activateAgentVersion(
  workspaceId: string,
  agentId: string,
  input: AgentActivateInput,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentLifecycleState> {
  const path = releasePath(workspaceId, agentId)
  const parsed = agentActivateInputSchema.safeParse(input)
  if (!parsed.success) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: `${path}/activate-version`,
    body: parsed.data,
    session,
    signal,
    makeError: makeAgentError,
  })
  const state = commandResponse(response, agentLifecycleStateSchema, 200)
  if (
    state.id !== agentId ||
    state.revision !== parsed.data.expected_revision + 1 ||
    state.current_version_id !== parsed.data.version_id ||
    state.status === 'archived'
  ) {
    throw makeAgentError('INVALID_RESPONSE', response.status)
  }
  return state
}

export async function setAgentStatus(
  workspaceId: string,
  agentId: string,
  input: AgentStatusInput,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentLifecycleState> {
  const path = releasePath(workspaceId, agentId)
  const parsed = agentStatusInputSchema.safeParse(input)
  if (!parsed.success) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'patch',
    path: `${path}/status`,
    body: parsed.data,
    session,
    signal,
    makeError: makeAgentError,
  })
  const state = commandResponse(response, agentLifecycleStateSchema, 200)
  if (
    state.id !== agentId ||
    state.status !== parsed.data.status ||
    (state.revision !== parsed.data.expected_revision &&
      state.revision !== parsed.data.expected_revision + 1)
  ) {
    throw makeAgentError('INVALID_RESPONSE', response.status)
  }
  return state
}

export async function archiveAgent(
  workspaceId: string,
  agentId: string,
  input: AgentArchiveInput,
  session: WorkspaceWriteSession,
  signal?: AbortSignal
): Promise<AgentLifecycleState> {
  const path = releasePath(workspaceId, agentId)
  const parsed = agentArchiveInputSchema.safeParse(input)
  if (!parsed.success) {
    throw makeAgentError('AG_INVALID_ARGUMENT', 400)
  }
  const response = await sendWorkspaceWrite({
    method: 'post',
    path: `${path}/archive`,
    body: parsed.data,
    session,
    signal,
    makeError: makeAgentError,
  })
  const state = commandResponse(response, agentLifecycleStateSchema, 200)
  if (
    state.id !== agentId ||
    state.revision !== parsed.data.expected_revision + 1 ||
    state.status !== 'archived'
  ) {
    throw makeAgentError('INVALID_RESPONSE', response.status)
  }
  return state
}
