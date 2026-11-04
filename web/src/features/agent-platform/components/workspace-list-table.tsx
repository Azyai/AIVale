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
import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage } from '@/components/data-table'

import { useWorkspaceDateFormat } from '../hooks/use-workspace-date-format'
import type { WorkspaceListSearch } from '../lib/workspace-list-search'
import type {
  AgentWorkspacePage,
  AgentWorkspaceSummary,
} from '../workspace-list-api'
import {
  WorkspaceDate,
  WorkspaceRole,
  WorkspaceStatus,
} from './workspace-display'
import type { WorkspaceListControls } from './workspace-list-filters'

export function WorkspaceListTable(
  props: WorkspaceListControls & {
    page: AgentWorkspacePage
    returnSearch?: WorkspaceListSearch
    onWorkspaceSelect?: () => void
  }
) {
  const { t } = useTranslation()
  const dateFormat = useWorkspaceDateFormat()
  const returnSearch = props.returnSearch ?? props.search
  const onWorkspaceSelect = props.onWorkspaceSelect
  const columns = useMemo<ColumnDef<AgentWorkspaceSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Workspace name'),
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <Link
            to='/agent-platform/w/$workspace_id'
            params={{ workspace_id: row.original.id }}
            search={returnSearch}
            activeOptions={{ exact: true, includeSearch: false }}
            onClick={(event) => {
              if (
                !event.defaultPrevented &&
                event.button === 0 &&
                !event.altKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey
              ) {
                onWorkspaceSelect?.()
              }
            }}
            className='text-primary focus-visible:ring-ring rounded-sm font-medium [overflow-wrap:anywhere] whitespace-normal underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'current_role',
        header: t('Role'),
        cell: ({ row }) => <WorkspaceRole role={row.original.current_role} />,
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        cell: ({ row }) => <WorkspaceStatus status={row.original.status} />,
      },
      {
        accessorKey: 'updated_at',
        header: t('Last updated'),
        cell: ({ row }) => (
          <WorkspaceDate
            timestamp={row.original.updated_at}
            format={dateFormat}
          />
        ),
      },
    ],
    [t, dateFormat, returnSearch, onWorkspaceSelect]
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
