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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getPublicPlans,
  getSelfSubscriptionFull,
} from '@/features/subscriptions/api'
import type { UserSubscriptionRecord } from '@/features/subscriptions/types'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

function usePersonalActiveSubscriptions() {
  return useQuery({
    queryKey: ['self-subscription-full', 'keys-banner'],
    queryFn: async () => {
      const res = await getSelfSubscriptionFull()
      if (!res.success) return null
      return res.data ?? null
    },
    staleTime: 60_000,
    select: (data) => {
      const list = Array.isArray(data?.subscriptions)
        ? data.subscriptions
        : []
      return list.filter(
        (record) => !record.subscription?.team_id
      ) as UserSubscriptionRecord[]
    },
  })
}

function usePlanTitleMap() {
  return useQuery({
    queryKey: ['public-plans'],
    queryFn: async () => {
      const res = await getPublicPlans()
      if (!res.success) return []
      return Array.isArray(res.data) ? res.data : []
    },
    staleTime: 5 * 60_000,
    select: (plans) => {
      const map = new Map<number, string>()
      for (const plan of plans) {
        if (plan?.plan?.id) map.set(plan.plan.id, plan.plan.title || '')
      }
      return map
    },
  })
}

function getRemainingDays(endTime: number) {
  if (!endTime) return 0
  const now = Date.now() / 1000
  return Math.max(0, Math.ceil((endTime - now) / 86400))
}

function SubscriptionCard({
  title,
  record,
}: {
  title: string
  record: UserSubscriptionRecord
}) {
  const { t } = useTranslation()
  const sub = record.subscription
  const total = Number(sub?.amount_total || 0)
  const used = Number(sub?.amount_used || 0)
  const remain = Math.max(0, total - used)
  const percent = total > 0 ? Math.round((used / total) * 100) : 0
  const days = getRemainingDays(sub?.end_time || 0)

  return (
    <Link
      to='/wallet'
      className='bg-card hover:border-primary/40 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-4 transition-colors'
    >
      <span className='text-sm font-semibold'>{title}</span>
      <div className='flex min-w-40 flex-1 items-center gap-3'>
        <Progress value={percent} className='h-1.5 flex-1' />
        <span className='text-muted-foreground text-xs whitespace-nowrap'>
          {t('Remaining')} {formatQuotaWithCurrency(remain)}
        </span>
      </div>
      <span className='text-muted-foreground text-xs whitespace-nowrap'>
        {days > 0
          ? t('{{days}} 天后到期', { days })
          : t('到期时间')}{' '}
        {formatTimestampToDate(sub?.end_time || 0)}
      </span>
    </Link>
  )
}

export function TokenPlanSection() {
  const { t } = useTranslation()
  const subsQuery = usePersonalActiveSubscriptions()
  const plansQuery = usePlanTitleMap()

  const subscriptions = subsQuery.data || []
  const planTitles = plansQuery.data

  let body: React.ReactNode
  if (subsQuery.isLoading) {
    body = <Skeleton className='h-16 w-full rounded-xl' />
  } else if (subscriptions.length > 0) {
    body = (
      <div className='space-y-3'>
        {subscriptions.map((record) => {
          const planId = record.subscription?.plan_id
          const title =
            (typeof planId === 'number' && planTitles?.get(planId)) ||
            t('订阅套餐')
          return (
            <SubscriptionCard
              key={record.subscription?.id ?? planId}
              title={title}
              record={record}
            />
          )
        })}
      </div>
    )
  } else {
    body = (
      <p className='text-muted-foreground text-sm leading-6'>
        {t(
          'Token Plan 是订阅制计费服务，订阅后享更优单价与专属额度池，适合稳定高频调用。'
        )}
      </p>
    )
  }

  return (
    <section className='space-y-4'>
      <div className='flex items-baseline justify-between gap-4'>
        <h2 className='text-lg font-semibold'>{t('订阅 Token Plan')}</h2>
        <Link to='/pricing' className='text-sm font-medium hover:underline'>
          {t('查看全部')}
        </Link>
      </div>
      {body}
    </section>
  )
}
