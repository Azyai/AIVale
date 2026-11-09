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
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { WorkspaceDate } from '../../components/workspace-display'
import { useWorkspaceDateFormat } from '../../hooks/use-workspace-date-format'
import type { AgentHistorySearch } from '../history-search'
import type { AgentVersionPage, AgentVersionSummary } from '../release-schemas'

export function AgentVersionTable(props: {
  page: AgentVersionPage
  currentVersionId: string | null
  search: AgentHistorySearch
  canReadContent: boolean
  onChange: (search: AgentHistorySearch) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const dateFormat = useWorkspaceDateFormat()
  const columns = useMemo<ColumnDef<AgentVersionSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'version_no',
        header: t('Version'),
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <div className='flex flex-wrap items-center gap-2'>
            <span>
              {t('Version {{version}}', {
                version: formatNumber(row.original.version_no, locale),
              })}
            </span>
            {row.original.id === props.currentVersionId && (
              <Badge variant='secondary'>{t('Current')}</Badge>
            )}
            {row.original.revoked_at !== null && (
              <Badge variant='destructive'>{t('Revoked')}</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'source_draft_revision',
        header: t('Source draft revision'),
        cell: ({ row }) =>
          formatNumber(row.original.source_draft_revision, locale),
      },
      {
        accessorKey: 'published_at',
        header: t('Published at'),
        cell: ({ row }) => (
          <WorkspaceDate
            timestamp={row.original.published_at}
            format={dateFormat}
          />
        ),
      },
      {
        accessorKey: 'published_by',
        header: t('Publisher ID'),
        cell: ({ row }) => (
          <span className='font-mono text-xs'>{row.original.published_by}</span>
        ),
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) =>
          props.canReadContent ? (
            <div className='flex flex-wrap gap-2'>
              <Button
                size='sm'
                variant='ghost'
                onClick={() =>
                  props.onChange({
                    ...props.search,
                    selected_version: row.original.id,
                  })
                }
              >
                {t('View version')}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                disabled={
                  !props.search.selected_version ||
                  props.search.selected_version === row.original.id
                }
                onClick={() =>
                  props.onChange({
                    ...props.search,
                    compare_version: row.original.id,
                  })
                }
              >
                {t('Compare version')}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, locale, dateFormat, props]
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
      props.onChange({
        ...props.search,
        version_page: next.pageIndex + 1,
        version_page_size: next.pageSize,
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
