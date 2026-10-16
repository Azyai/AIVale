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
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Database, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { createServerError } from '@/lib/server-error-message'
import { formatTimestampToDate } from '@/lib/format'

import { getApiKeys, searchApiKeys } from '../api'
import { ERROR_MESSAGES } from '../constants'
import type { ApiKey } from '../types'
import { ApiKeyRowActions } from './api-key-row-actions'
import { ApiKeyStatusSwitch } from './api-key-status-switch'
import { useApiKeys } from './api-keys-provider'
import { ApiKeysMobileList } from './api-keys-mobile-list'
import { ApiKeyCell } from './api-keys-cells'

const PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 500

const DESKTOP_SKELETON_IDS = Array.from(
  { length: 6 },
  (_, index) => `api-key-desktop-skeleton-${index + 1}`
)

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(intervalId)
  }, [intervalMs])

  return now
}

function ApiKeysDesktopSkeleton() {
  return (
    <tbody>
      {DESKTOP_SKELETON_IDS.map((id) => (
        <tr key={id} className='border-border/70 border-b last:border-b-0'>
          <td className='py-3.5'>
            <Skeleton className='h-4 w-12' />
          </td>
          <td className='py-3.5'>
            <Skeleton className='h-4 w-40' />
          </td>
          <td className='py-3.5'>
            <Skeleton className='h-4 w-24' />
          </td>
          <td className='py-3.5'>
            <Skeleton className='h-4 w-32' />
          </td>
          <td className='py-3.5'>
            <Skeleton className='h-4 w-14' />
          </td>
          <td className='py-3.5'>
            <Skeleton className='h-5 w-9 rounded-full' />
          </td>
          <td className='py-3.5'>
            <Skeleton className='ml-auto h-4 w-28' />
          </td>
        </tr>
      ))}
    </tbody>
  )
}

export function ApiKeysTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refreshTrigger, setOpen } = useApiKeys()
  const now = useNow()
  const isMobile = useMediaQuery('(max-width: 767px)')

  const [keyword, setKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [keyword])

  const shouldSearch = Boolean(debouncedKeyword)

  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const { data, isLoading } = useQuery({
    queryKey: ['keys', page, PAGE_SIZE, debouncedKeyword, refreshTrigger],
    queryFn: async () => {
      const result = shouldSearch
        ? await searchApiKeys({
            keyword: debouncedKeyword,
            p: page,
            size: PAGE_SIZE,
          })
        : await getApiKeys({ p: page, size: PAGE_SIZE })

      if (!result.success) {
        throw createServerError(
          result,
          t(
            shouldSearch ? ERROR_MESSAGES.SEARCH_FAILED : ERROR_MESSAGES.LOAD_FAILED
          )
        )
      }

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const apiKeys = useMemo(() => data?.items || [], [data])
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showPagination = total > PAGE_SIZE

  const handleViewSpend = (apiKey: ApiKey) => {
    navigate({
      to: '/usage-logs/$section',
      params: { section: 'common' },
      search: { token: apiKey.name },
    })
  }

  let tableBody: React.ReactNode
  if (isLoading) {
    tableBody = <ApiKeysDesktopSkeleton />
  } else if (apiKeys.length === 0) {
    tableBody = (
      <tbody>
        <tr>
          <td colSpan={7} className='py-16'>
            <Empty className='border-none p-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <Database className='size-6' />
                </EmptyMedia>
                <EmptyTitle>{t('No API Keys Found')}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    'No API keys available. Create your first API key to get started.'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </td>
        </tr>
      </tbody>
    )
  } else {
    tableBody = (
      <tbody>
        {apiKeys.map((apiKey) => (
          <tr
            key={apiKey.id}
            className='border-border/70 hover:bg-muted/30 border-b transition-colors last:border-b-0'
          >
            <td className='text-muted-foreground py-3.5 align-middle'>
              {apiKey.id}
            </td>
            <td className='max-w-0 py-3.5 align-middle'>
              <ApiKeyCell apiKey={apiKey} />
            </td>
            <td className='max-w-0 py-3.5 align-middle'>
              <div className='flex items-center gap-1.5'>
                <span className='truncate font-medium'>{apiKey.name}</span>
                {(apiKey.team_id ?? 0) > 0 && (
                  <span className='bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
                    {t('Team')}
                  </span>
                )}
              </div>
            </td>
            <td className='text-muted-foreground py-3.5 align-middle whitespace-nowrap'>
              {formatTimestampToDate(apiKey.created_time)}
            </td>
            <td className='py-3.5 align-middle whitespace-nowrap'>
              <button
                type='button'
                onClick={() => handleViewSpend(apiKey)}
                className='text-primary hover:underline cursor-pointer'
                aria-label={t('查看费用')}
              >
                {formatQuotaWithCurrency(apiKey.used_quota)}
              </button>
            </td>
            <td className='py-3.5 align-middle'>
              <ApiKeyStatusSwitch apiKey={apiKey} />
            </td>
            <td className='py-3.5 align-middle'>
              <ApiKeyRowActions apiKey={apiKey} />
            </td>
          </tr>
        ))}
      </tbody>
    )
  }

  return (
    <div className='space-y-4'>
      {/* 搜索 + 创建 */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='relative'>
          <Search
            aria-hidden='true'
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2'
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t('搜索 API Key 名称')}
            aria-label={t('搜索 API Key 名称')}
            className='bg-background h-9 w-64 rounded-full pr-4 pl-9'
          />
        </div>
        <Button
          onClick={() => setOpen('create')}
          className='bg-foreground text-background hover:bg-foreground/90 h-9 rounded-full px-5 text-[13px] font-medium'
        >
          <Plus aria-hidden='true' />
          {t('创建 API Key')}
        </Button>
      </div>

      {/* 桌面表格（千问式） / 移动端卡片列表 */}
      {isMobile ? (
        <ApiKeysMobileList apiKeys={apiKeys} isLoading={isLoading} now={now} />
      ) : (
        <div className='w-full overflow-x-auto'>
          <table className='w-full min-w-[880px] table-fixed text-[13px]'>
            <colgroup>
              <col className='w-20' />
              <col className='w-64' />
              <col />
              <col className='w-44' />
              <col className='w-28' />
              <col className='w-20' />
              <col className='w-40' />
            </colgroup>
            <thead>
              <tr className='text-muted-foreground text-left text-xs'>
                <th className='h-10 font-normal'>ID</th>
                <th className='h-10 font-normal'>API Key</th>
                <th className='h-10 font-normal'>{t('描述')}</th>
                <th className='h-10 font-normal'>{t('Created')}</th>
                <th className='h-10 font-normal'>{t('Cost')}</th>
                <th className='h-10 font-normal'>{t('Status')}</th>
                <th className='h-10 text-right font-normal'>{t('Actions')}</th>
              </tr>
            </thead>
            {tableBody}
          </table>
        </div>
      )}

      {/* 简易分页 */}
      {showPagination && !isLoading && (
        <div className='flex items-center justify-end gap-3 pt-2'>
          <span className='text-muted-foreground text-xs'>
            {t('第 {{page}} / {{totalPages}} 页', { page, totalPages })}
          </span>
          <Button
            variant='outline'
            size='icon-sm'
            disabled={page <= 1}
            onClick={() => setPage((previous) => Math.max(1, previous - 1))}
            aria-label={t('Previous page')}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant='outline'
            size='icon-sm'
            disabled={page >= totalPages}
            onClick={() =>
              setPage((previous) => Math.min(totalPages, previous + 1))
            }
            aria-label={t('Next page')}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
