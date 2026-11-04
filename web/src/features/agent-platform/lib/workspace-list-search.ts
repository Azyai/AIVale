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

export const workspaceNameMaxCodePoints = 128

/** Go and JSON Schema count Unicode scalars, rather than UTF-16 code units. */
export function isWorkspaceNameText(value: string): boolean {
  return (
    value.length <= workspaceNameMaxCodePoints * 2 &&
    !value.includes('\0') &&
    !/[\uD800-\uDFFF]/u.test(value) &&
    [...value].length <= workspaceNameMaxCodePoints
  )
}

// Match Go's TrimSpace (Unicode White_Space), preserving case and literal punctuation.
export const workspaceNameFilterSchema = z
  .string()
  .refine(isWorkspaceNameText)
  .transform((value) =>
    value.replaceAll(/^\p{White_Space}+|\p{White_Space}+$/gu, '')
  )

export const workspaceListSortValues = [
  'created_at:desc,id:desc',
  'created_at:asc,id:desc',
  'created_at:desc,id:asc',
  'created_at:asc,id:asc',
  'id:asc',
  'id:desc',
] as const

export type WorkspaceListSort = (typeof workspaceListSortValues)[number]

const workspaceListSortSchema = z
  .enum([...workspaceListSortValues, 'created_at:asc', 'created_at:desc'])
  .transform((value): WorkspaceListSort => {
    if (value === 'created_at:asc') return 'created_at:asc,id:desc'
    if (value === 'created_at:desc') return 'created_at:desc,id:desc'
    return value
  })

export const workspaceListPageNumberSchema = z.number().int().min(1)
export const workspaceListPageSizeSchema =
  workspaceListPageNumberSchema.max(100)

export const workspaceListRequestSchema = z.strictObject({
  page: workspaceListPageNumberSchema,
  page_size: workspaceListPageSizeSchema,
  sort: workspaceListSortSchema,
  q: workspaceNameFilterSchema,
})

export type WorkspaceListSearch = z.output<typeof workspaceListRequestSchema>

export const defaultWorkspaceListSearch = {
  page: 1,
  page_size: 20,
  sort: 'created_at:desc,id:desc',
  q: '',
} as const satisfies WorkspaceListSearch

const routeNumberSchema = z.union([
  z.number(),
  z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .transform(Number),
])

/** Route input may be invalid; normalize only recognized keys to a valid request. */
export const workspaceListSearchSchema = z.object({
  page: routeNumberSchema.pipe(workspaceListPageNumberSchema).catch(1),
  page_size: routeNumberSchema.pipe(workspaceListPageSizeSchema).catch(20),
  sort: workspaceListSortSchema.catch(defaultWorkspaceListSearch.sort),
  q: workspaceNameFilterSchema.catch(''),
})
