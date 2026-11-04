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

import { workspaceNameFilterSchema } from './workspace-list-search'

const descriptionEncoder = new TextEncoder()

export const workspaceCreateSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)

const fields = {
  name: workspaceNameFilterSchema.pipe(z.string().min(1)),
  description: z
    .string()
    .refine(
      (value) =>
        value.length <= 4096 &&
        !value.includes('\0') &&
        !/[\uD800-\uDFFF]/u.test(value) &&
        descriptionEncoder.encode(value).byteLength <= 4096
    ),
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
  const random = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const key = [...random]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return { key: `ws-create-${key}`, scope, input: normalized }
}
