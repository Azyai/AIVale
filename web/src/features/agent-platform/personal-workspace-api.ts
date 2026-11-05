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
  workspaceReadResponseSchema,
} from './lib/workspace-read-transport'
import {
  workspaceWriteDescriptionSchema,
  workspaceWriteNameSchema,
  workspaceWriteRevisionSchema,
} from './lib/workspace-write-fields'
import {
  AgentWorkspaceWriteError,
  sendWorkspaceWrite,
  workspaceWriteReceiptHeadersMatch,
  type WorkspaceWriteErrorFactory,
  type WorkspaceWriteSession,
} from './lib/workspace-write-transport'

const path = '/api/agent-platform/personal-workspace'
const workspace = z.strictObject({
  name: workspaceWriteNameSchema,
  description: workspaceWriteDescriptionSchema,
  revision: workspaceWriteRevisionSchema,
  updated_at: z.number().int().positive(),
})
const readResponse = workspaceReadResponseSchema(
  z.strictObject({ workspace: workspace.nullable() })
)
const writeResponse = workspaceReadResponseSchema(z.strictObject({ workspace }))
export type PersonalWorkspace = z.output<typeof workspace>

export class PersonalWorkspaceReadError extends AgentWorkspaceReadError {}
export class PersonalWorkspaceWriteError extends AgentWorkspaceWriteError<never> {}

const makeWriteError: WorkspaceWriteErrorFactory = (
  code,
  status,
  _paths,
  retryable
) => new PersonalWorkspaceWriteError(code, status, [], retryable)

export async function getPersonalWorkspace(signal: AbortSignal) {
  const response = await fetchWorkspaceRead(path, {
    signal,
    ErrorType: PersonalWorkspaceReadError,
  })
  const result = readResponse.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    throw new PersonalWorkspaceReadError('INVALID_RESPONSE', response.status)
  }
  return result.data.data.workspace
}

export async function savePersonalWorkspace(
  input: { name: string; description: string; expected_revision: number },
  session: WorkspaceWriteSession,
  signal: AbortSignal
) {
  const response = await sendWorkspaceWrite({
    method: 'put',
    path,
    body: input,
    session,
    signal,
    makeError: makeWriteError,
  })
  const result = writeResponse.safeParse(response.data)
  if (
    response.status !== 200 ||
    !result.success ||
    result.data.data.workspace.revision !== input.expected_revision + 1 ||
    !workspaceWriteReceiptHeadersMatch(response.headers, result.data.request_id)
  ) {
    throw makeWriteError('INVALID_RESPONSE', response.status)
  }
  return result.data.data.workspace
}
