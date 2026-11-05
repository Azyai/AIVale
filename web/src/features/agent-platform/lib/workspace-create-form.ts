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
  generateWorkspaceWriteKey,
  workspaceWriteDescriptionSchema,
  workspaceWriteNameSchema,
} from './workspace-write-fields'

export const workspaceCreateSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)

const fields = {
  name: workspaceWriteNameSchema,
  description: workspaceWriteDescriptionSchema,
}

export const workspaceCreateInputSchema = z.strictObject({
  ...fields,
  description: fields.description.default(''),
  slug: workspaceCreateSlugSchema.optional(),
})

export const workspaceCreateFormSchema = z
  .strictObject({
    ...fields,
    slug: z.union([z.literal(''), workspaceCreateSlugSchema]),
  })
  .transform(({ name, description, slug }) => ({
    name,
    description,
    ...(slug === '' ? {} : { slug }),
  }))

export type WorkspaceCreateFormValues = z.input<
  typeof workspaceCreateFormSchema
>
export type WorkspaceCreateInput = z.output<typeof workspaceCreateInputSchema>
export type WorkspaceCreateField = keyof WorkspaceCreateFormValues

export type WorkspaceCreateIntent = {
  key: string
  scope: string
  input: WorkspaceCreateInput
}

/** Keep one logical intent in memory; never reuse a key for a different scope or body. */
export function newWorkspaceCreateIntent(
  input: WorkspaceCreateInput,
  scope: string,
  previous?: WorkspaceCreateIntent | null
): WorkspaceCreateIntent {
  const normalized = workspaceCreateInputSchema.parse(input)
  if (
    previous?.scope === scope &&
    previous.input.name === normalized.name &&
    previous.input.description === normalized.description &&
    previous.input.slug === normalized.slug
  ) {
    return previous
  }
  return { key: generateWorkspaceWriteKey('create'), scope, input: normalized }
}
