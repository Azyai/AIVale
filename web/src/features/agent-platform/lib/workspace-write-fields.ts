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

const utf8 = new TextEncoder()

function validWorkspaceWriteText(value: string, maxBytes: number): boolean {
  return (
    value.length <= maxBytes &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value) &&
    utf8.encode(value).byteLength <= maxBytes
  )
}

export const workspaceWriteNameSchema = workspaceNameFilterSchema.pipe(
  z.string().min(1)
)
export const workspaceWriteDescriptionSchema = z
  .string()
  .refine((value) => validWorkspaceWriteText(value, 4096))
export const workspaceArchiveReasonSchema = z
  .string()
  .refine(
    (value) =>
      value.length <= 1024 &&
      validWorkspaceWriteText(value, 2048) &&
      [...value].length <= 512
  )
  .transform((value) =>
    value.replaceAll(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
  )
  .pipe(z.string().min(1))
export const workspaceWriteRevisionSchema = z.number().int().positive()
export const workspaceWriteKeySchema = z.string().regex(/^[\x21-\x7e]{16,128}$/)

export function generateWorkspaceWriteKey(
  kind: 'create' | 'archive' | 'publish'
): string {
  const random = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const hex = [...random]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `ws-${kind}-${hex}`
}
