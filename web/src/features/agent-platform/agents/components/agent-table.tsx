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
import { Badge } from '@/components/ui/badge'

import { WorkspaceDate } from '../../components/workspace-display'
import { useWorkspaceDateFormat } from '../../hooks/use-workspace-date-format'
import type { AgentListSearch, AgentPage, AgentSummary } from '../schemas'

export function AgentTable(props: {
  workspaceId: string
  page: AgentPage
  search: AgentListSearch
  mayWrite: boolean
  onSearchChange: (search: AgentListSearch) => void
}) {
  const { t } = useTranslation()
  const dateFormat = useWorkspaceDateFormat()
  const columns = useMemo<ColumnDef<AgentSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Agent name'),
        meta: { mobileTitle: true },
        cell: ({ row }) =>
          props.mayWrite && row.original.status !== 'archived' ? (
            <Link
              to='/agent-platform/w/$workspace_id/agents/$agent_id/edit'
              params={{
                workspace_id: props.workspaceId,
                agent_id: row.original.id,
              }}
              search={props.search}
              className='text-primary rounded-sm font-medium [overflow-wrap:anywhere] hover:underline focus-visible:outline focus-visible:outline-2'
            >
              {row.original.name}
            </Link>
          ) : (
            <span className='font-medium [overflow-wrap:anywhere]'>
              {row.original.name}
            </span>
          ),
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        cell: ({ row }) => (
          <Badge variant='secondary'>
            {t(
              { active: 'Active', disabled: 'Disabled', archived: 'Archived' }[
                row.original.status
              ]
            )}
          </Badge>
        ),
      },
      {
        accessorKey: 'current_version_id',
        header: t('Published version'),
        cell: ({ row }) =>
          row.original.current_version_id ? t('Published') : t('Not published'),
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
      {
        id: 'history',
        header: t('Actions'),
        cell: ({ row }) => (
          <Link
            to='/agent-platform/w/$workspace_id/agents/$agent_id/versions'
            params={{
              workspace_id: props.workspaceId,
              agent_id: row.original.id,
            }}
            search={{ ...props.search, version_page: 1, version_page_size: 20 }}
            className='text-primary rounded-sm text-sm hover:underline focus-visible:outline focus-visible:outline-2'
          >
            {t('Version history')}
          </Link>
        ),
      },
    ],
    [t, props.workspaceId, props.search, props.mayWrite, dateFormat]
  )
  const table = useReactTable({
    data: props.page.items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    rowCount: props.page.total,
    enableSorting: false,
    manualPagination: true,
    state: {
      pagination: {
        pageIndex: props.page.page - 1,
        pageSize: props.page.page_size,
      },
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater(table.getState().pagination)
          : updater
      props.onSearchChange({
        ...props.search,
        page: next.pageIndex + 1,
        page_size: next.pageSize,
      })
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
