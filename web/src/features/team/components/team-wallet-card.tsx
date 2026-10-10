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
import { Wallet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TitledCard } from '@/components/ui/titled-card'
import {
  requestPayment,
  requestStripePayment,
} from '@/features/wallet/api'
import { useTopupInfo } from '@/features/wallet/hooks'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import type { TeamSelfData } from '../types'

type T = ReturnType<typeof useTranslation>['t']

function isApiSuccess(res: { message?: string; success?: boolean }) {
  return res.message === 'success' || res.success === true
}

/**
 * Team wallet top-up for team owners. Supports the online (epay) and Stripe
 * channels; other gateways can be added by extending the request payload —
 * the backend already accepts team_id for every channel.
 */
export function TeamWalletCard({
  data,
  onChanged,
  t,
}: {
  data: TeamSelfData
  onChanged: () => void
  t: T
}) {
  const { topupInfo } = useTopupInfo()
  const [amount, setAmount] = useState('')
  const [paying, setPaying] = useState<string | null>(null)

  if (data.role !== 'owner') {
    return null
  }

  const onlineMethods = (topupInfo?.pay_methods || []).filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem'
  )
  const stripeEnabled = !!topupInfo?.enable_stripe_topup
  const hasChannel = onlineMethods.length > 0 || stripeEnabled

  const parsedAmount = Number.parseInt(amount, 10) || 0

  const submitEpayForm = (url: string, params: Record<string, unknown>) => {
    const form = document.createElement('form')
    form.action = url
    form.method = 'POST'
    Object.entries(params || {}).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = String(value)
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  const handleEpay = async (methodType: string) => {
    if (parsedAmount <= 0) {
      toast.error(t('请输入充值金额'))
      return
    }
    setPaying(methodType)
    try {
      const res = await requestPayment({
        amount: parsedAmount,
        payment_method: methodType,
        team_id: data.team.id,
      })
      if (isApiSuccess(res) && res.data && res.url) {
        submitEpayForm(res.url, res.data as Record<string, unknown>)
        toast.success(t('Redirecting to payment page...'))
      } else {
        handleServerError(res, t('Payment request failed'))
      }
    } catch (error) {
      handleServerError(error, t('Payment request failed'))
    } finally {
      setPaying(null)
    }
  }

  const handleStripe = async () => {
    if (parsedAmount <= 0) {
      toast.error(t('请输入充值金额'))
      return
    }
    setPaying('stripe')
    try {
      const res = await requestStripePayment({
        amount: parsedAmount,
        payment_method: 'stripe',
        team_id: data.team.id,
      })
      if (isApiSuccess(res) && res.data?.pay_link) {
        window.open(res.data.pay_link as string, '_blank')
        toast.success(t('Redirecting to payment page...'))
        onChanged()
      } else {
        handleServerError(res, t('Payment request failed'))
      }
    } catch (error) {
      handleServerError(error, t('Payment request failed'))
    } finally {
      setPaying(null)
    }
  }

  return (
    <TitledCard
      title={t('团队钱包')}
      description={t('团队令牌的按量消费从团队钱包扣费，与个人余额严格隔离')}
      icon={<Wallet className='h-4 w-4' />}
      iconTone='chart-2'
      disableHoverEffect
      contentClassName='space-y-4'
    >
      <div className='flex items-baseline justify-between rounded-xl border bg-muted/40 p-4'>
        <span className='text-muted-foreground text-sm'>{t('当前余额')}</span>
        <span className='text-xl font-bold'>{formatQuota(data.quota)}</span>
      </div>

      {hasChannel ? (
        <>
          <div className='flex max-w-md gap-2'>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type='number'
              min={1}
              placeholder={t('输入充值金额')}
            />
          </div>
          <div className='flex flex-wrap gap-2'>
            {onlineMethods.map((m) => (
              <Button
                key={m.type}
                variant='outline'
                onClick={() => handleEpay(m.type)}
                disabled={paying !== null}
              >
                {paying === m.type ? t('Pay') : m.name || m.type}
              </Button>
            ))}
            {stripeEnabled && (
              <Button
                variant='outline'
                onClick={handleStripe}
                disabled={paying !== null}
              >
                {paying === 'stripe' ? t('Pay') : 'Stripe'}
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {t('当前管理员未配置在线支付方式，请联系管理员调整团队额度。')}
        </p>
      )}
    </TitledCard>
  )
}
