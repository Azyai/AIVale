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
import { Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserGroups } from '@/lib/api'
import { useMediaQuery } from '@/hooks'
import { requireServerSuccess } from '@/lib/server-error-message'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { API_KEY_STATUSES } from '../constants'
import type { ApiKey } from '../types'
import { ApiKeyGroupCell } from './api-key-group-cell'
import { ApiKeyQuotaCell } from './api-key-quota-cell'
import { ApiKeyActivityCell } from './api-key-timestamp-cell'
import { ApiKeyRowActions } from './api-key-row-actions'
import { ApiKeyCell, IpRestrictionsCell, ModelLimitsCell } from './api-keys-cells'

const EMPTY_GROUP_RATIOS: Record<string, number | string> = {}

function useGroupRatios(): Record<string, number | string> {
  const { data } = useQuery({
    queryKey: ['user-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
    staleTime: 0,
    select: (res) => {
      if (!res.success || !res.data) return {}
      const ratios: Record<string, number | string> = {}
      for (const [group, info] of Object.entries(res.data)) {
        if (typeof info.ratio === 'number' || typeof info.ratio === 'string') {
          ratios[group] = info.ratio
        }
      }
      return ratios
    },
  })

  return data ?? EMPTY_GROUP_RATIOS
}

const MOBILE_SKELETON_IDS = Array.from(
  { length: 5 },
  (_, index) => `api-key-mobile-skeleton-${index + 1}`
)

function ApiKeysMobileSkeleton() {
  return (
    <div className='min-w-0 space-y-3'>
      {MOBILE_SKELETON_IDS.map((id) => (
        <div
          key={id}
          className='border-border/60 bg-card space-y-2 rounded-xl border p-3.5'
        >
          <div className='flex items-center justify-between'>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-5 w-16 rounded-md' />
          </div>
          <div className='flex items-center justify-between gap-3'>
            <Skeleton className='h-7 w-44' />
            <Skeleton className='h-8 w-16' />
          </div>
          <Skeleton className='h-3 w-28' />
        </div>
      ))}
    </div>
  )
}

function ExpiryValue({ apiKey }: { apiKey: ApiKey }) {
  const { t } = useTranslation()
  const expiredTime = apiKey.expired_time ?? -1
  if (expiredTime === -1) {
    return (
      <StatusBadge
        label={t('Never')}
        variant='neutral'
        copyable={false}
        className='px-0 text-xs font-normal'
      />
    )
  }
  return (
    <span
      className={
        expiredTime * 1000 <= Date.now()
          ? 'text-destructive text-xs'
          : 'text-muted-foreground text-xs'
      }
    >
      {formatTimestampToDate(expiredTime)}
    </span>
  )
}

export function ApiKeysMobileList({
  apiKeys,
  isLoading,
  now,
}: {
  apiKeys: ApiKey[]
  isLoading: boolean
  now: number
}) {
  const { t } = useTranslation()
  const groupRatios = useGroupRatios()
  const shouldReduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  if (isLoading) return <ApiKeysMobileSkeleton />

  if (!apiKeys.length) {
    return (
      <div className='rounded-lg border p-8'>
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
      </div>
    )
  }

  return (
    <div className='min-w-0 space-y-3'>
      {apiKeys.map((apiKey) => {
        const statusConfig = API_KEY_STATUSES[apiKey.status]
        const isDisabled = apiKey.status !== 1

        return (
          <div
            key={apiKey.id}
            className={cn(
              'border-border/60 bg-card min-w-0 space-y-2 rounded-xl border p-3.5 text-xs leading-4',
              isDisabled && 'opacity-60'
            )}
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='flex items-center gap-1.5'>
                  <span className='text-sm leading-5 font-semibold break-words'>
                    {apiKey.name}
                  </span>
                  {(apiKey.team_id ?? 0) > 0 && (
                    <span className='bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium'>
                      {t('Team')}
                    </span>
                  )}
                </div>
              </div>
              {statusConfig && (
                <StatusBadge
                  label={t(statusConfig.label)}
                  variant={statusConfig.variant}
                  copyable={false}
                  className='shrink-0 px-0 text-xs font-normal'
                />
              )}
            </div>

            <div className='flex min-w-0 items-center justify-between gap-2'>
              <div className='min-w-0 flex-1 [&_button:first-child]:max-w-full [&_button:first-child]:truncate [&_button:first-child]:px-0'>
                <ApiKeyCell apiKey={apiKey} />
              </div>
              <ApiKeyRowActions apiKey={apiKey} />
            </div>

            <div className='min-w-0 space-y-3 py-1'>
              <ApiKeyGroupCell
                group={apiKey.group ?? ''}
                ratio={groupRatios[apiKey.group ?? '']}
                crossGroupRetry={Boolean(apiKey.cross_group_retry)}
                shouldReduceMotion={shouldReduceMotion}
              />
              <ApiKeyQuotaCell apiKey={apiKey} now={now} variant='card' />
            </div>

            <div className='flex flex-wrap items-center gap-x-5 gap-y-1'>
              <ModelLimitsCell apiKey={apiKey} detailsTrigger='click' />
              <IpRestrictionsCell apiKey={apiKey} detailsTrigger='click' />
            </div>

            <div className='grid grid-cols-3 items-start gap-3 border-t pt-2'>
              <div className='col-span-2 min-w-0'>
                <ApiKeyActivityCell apiKey={apiKey} now={now} layout='columns' />
              </div>
              <div className='text-muted-foreground min-w-0 space-y-1'>
                <div>{t('Expires')}</div>
                <ExpiryValue apiKey={apiKey} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
