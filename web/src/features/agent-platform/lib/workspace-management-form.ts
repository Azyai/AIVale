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

import { workspaceIdSchema } from './workspace-read-transport'
import {
  generateWorkspaceWriteKey,
  workspaceArchiveReasonSchema,
  workspaceWriteDescriptionSchema,
  workspaceWriteNameSchema,
  workspaceWriteRevisionSchema,
} from './workspace-write-fields'

export const workspaceEditFormSchema = z.strictObject({
  name: workspaceWriteNameSchema,
  description: workspaceWriteDescriptionSchema,
})

export const workspaceUpdateInputSchema = workspaceEditFormSchema
  .partial()
  .extend({ expected_revision: workspaceWriteRevisionSchema })
  .refine((data) => data.name !== undefined || data.description !== undefined)

export const workspaceArchiveFormSchema = z.strictObject({
  reason: workspaceArchiveReasonSchema,
})

export const workspaceArchiveInputSchema = workspaceArchiveFormSchema.extend({
  expected_revision: workspaceWriteRevisionSchema,
})

export type WorkspaceEditFormValues = z.input<typeof workspaceEditFormSchema>
export type WorkspaceArchiveFormValues = z.input<
  typeof workspaceArchiveFormSchema
>
export type WorkspaceUpdateInput = z.output<typeof workspaceUpdateInputSchema>
export type WorkspaceArchiveInput = z.output<typeof workspaceArchiveInputSchema>
export type WorkspaceManagementField =
  | 'name'
  | 'description'
  | 'reason'
  | 'expected_revision'

export type WorkspaceArchiveIntent = {
  key: string
  scope: string
  workspaceId: string
  input: WorkspaceArchiveInput
}

/** Retain a key only for the original target, revision, reason and caller scope. */
export function newWorkspaceArchiveIntent(
  workspaceId: string,
  input: WorkspaceArchiveInput,
  scope: string,
  previous?: WorkspaceArchiveIntent | null
): WorkspaceArchiveIntent {
  const id = workspaceIdSchema.parse(workspaceId)
  const normalized = workspaceArchiveInputSchema.parse(input)
  if (
    previous?.scope === scope &&
    previous.workspaceId === id &&
    previous.input.expected_revision === normalized.expected_revision &&
    previous.input.reason === normalized.reason
  ) {
    return previous
  }
  return {
    key: generateWorkspaceWriteKey('archive'),
    scope,
    workspaceId: id,
    input: normalized,
  }
}
