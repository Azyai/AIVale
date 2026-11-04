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
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { toIntlLocale } from '@/i18n/languages'

import type {
  AgentWorkspacePage,
  AgentWorkspaceSummary,
} from '../workspace-list-api'
import type { WorkspaceListControls } from './workspace-list-filters'

export function WorkspaceListTable(
  props: WorkspaceListControls & { page: AgentWorkspacePage }
) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale]
  )
  const columns = useMemo<ColumnDef<AgentWorkspaceSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Workspace name'),
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <span className='font-medium [overflow-wrap:anywhere] whitespace-normal'>
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: 'current_role',
        header: t('Role'),
        cell: ({ row }) => {
          switch (row.original.current_role) {
            case 'admin':
              return t('Workspace administrator')
            case 'developer':
              return t('Workspace developer')
            case 'operator':
              return t('Operator')
            case 'viewer':
              return t('Workspace viewer')
          }
        },
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        cell: ({ row }) =>
          row.original.status === 'active' ? (
            <Badge variant='secondary'>{t('Active')}</Badge>
          ) : (
            <Badge variant='outline'>{t('Suspended')}</Badge>
          ),
      },
      {
        accessorKey: 'updated_at',
        header: t('Last updated'),
        cell: ({ row }) => {
          const date = new Date(row.original.updated_at)
          return Number.isNaN(date.getTime()) ? (
            <span aria-label={t('Not available')}>—</span>
          ) : (
            <time dateTime={date.toISOString()}>{dateFormat.format(date)}</time>
          )
        },
      },
    ],
    [t, dateFormat]
  )
  // Data is already filtered, sorted and paginated by the server.
  const table = useReactTable({
    data: props.page.items,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    rowCount: props.page.total,
    enableSorting: false,
    manualPagination: true,
    state: {
      pagination: {
        pageIndex: props.page.page - 1,
        pageSize: props.page.page_size,
      },
    },
    onPaginationChange: (update) => {
      const next =
        typeof update === 'function'
          ? update(table.getState().pagination)
          : update
      props.onSearchChange({ ...props.search, page: next.pageIndex + 1 })
    },
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      fixedHeight={false}
      paginationInFooter={false}
      compactPagination
    />
  )
}
