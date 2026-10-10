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
import { Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TitledCard } from '@/components/ui/titled-card'
import { useSystemConfig } from '@/hooks/use-system-config'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { DEFAULT_CURRENCY_CONFIG } from '@/stores/system-config-store'

import {
  adminListTeams,
  adminUpdateTeamQuota,
  type AdminTeamSummary,
} from './api'

export function AdminTeams() {
  const { t } = useTranslation()
  const { currency } = useSystemConfig()
  const quotaPerUnit =
    currency?.quotaPerUnit && currency.quotaPerUnit > 0
      ? currency.quotaPerUnit
      : DEFAULT_CURRENCY_CONFIG.quotaPerUnit
  const [teams, setTeams] = useState<AdminTeamSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [quotaDrafts, setQuotaDrafts] = useState<Record<number, string>>({})

  const fetchTeams = useCallback(async () => {
    try {
      const res = await adminListTeams({ page: 1, page_size: 100 })
      if (res.success) {
        setTeams(res.data || [])
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  const handleApplyQuota = async (team: AdminTeamSummary) => {
    const raw = quotaDrafts[team.id]
    const delta = Number.parseInt(raw || '', 10)
    if (Number.isNaN(delta) || delta === 0) {
      toast.error(t('请输入非零的调整额度（单位：美元）'))
      return
    }
    // The input is in display currency; convert to quota units.
    const deltaQuota = Math.round(delta * quotaPerUnit)
    try {
      const res = await adminUpdateTeamQuota(team.id, deltaQuota)
      if (res.success) {
        toast.success(t('Updated successfully'))
        setQuotaDrafts((d) => ({ ...d, [team.id]: '' }))
        fetchTeams()
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
    }
  }

  return (
    <TitledCard
      title={t('团队管理')}
      description={t('查看团队、调整团队钱包额度')}
      icon={<Users className='h-4 w-4' />}
      iconTone='chart-2'
      disableHoverEffect
      contentClassName='space-y-4'
    >
      <div className='flex max-w-sm gap-2'>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('搜索团队名称或邀请码')}
        />
      </div>

      {loading ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          {t('Loading...')}
        </p>
      ) : teams.length === 0 ? (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          {t('暂无团队')}
        </p>
      ) : (
        <Card data-card-hover='false'>
          <CardContent className='p-0'>
            <div className='divide-y overflow-x-auto'>
              <div className='text-muted-foreground bg-muted/40 hidden grid-cols-[1.2fr_0.7fr_0.9fr_0.6fr_0.6fr_1.4fr] gap-3 px-4 py-3 text-xs font-medium md:grid'>
                <span>{t('团队')}</span>
                <span>{t('Owner ID')}</span>
                <span>{t('团队钱包')}</span>
                <span>{t('成员数')}</span>
                <span>{t('团队令牌')}</span>
                <span>{t('调整额度（美元）')}</span>
              </div>
              {teams
                .filter(
                  (tm) =>
                    !keyword ||
                    tm.name.includes(keyword) ||
                    tm.invite_code.includes(keyword)
                )
                .map((team) => (
                  <div
                    key={team.id}
                    className='grid grid-cols-1 gap-3 px-4 py-3 text-sm md:grid-cols-[1.2fr_0.7fr_0.9fr_0.6fr_0.6fr_1.4fr] md:items-center'
                  >
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>{team.name}</span>
                      {team.active_sub_count > 0 && (
                        <StatusBadge
                          label={t('Active')}
                          variant='success'
                          copyable={false}
                        />
                      )}
                      <span className='text-muted-foreground text-xs'>
                        #{team.id}
                      </span>
                    </div>
                    <span className='text-muted-foreground'>
                      {team.owner_user_id}
                    </span>
                    <span className='font-medium'>
                      {formatQuota(team.quota)}
                    </span>
                    <span className='text-muted-foreground'>
                      {team.member_count}
                    </span>
                    <span className='text-muted-foreground'>
                      {team.token_count}
                    </span>
                    <div className='flex items-center gap-2'>
                      <Input
                        className='h-8 w-24'
                        type='number'
                        value={quotaDrafts[team.id] || ''}
                        onChange={(e) =>
                          setQuotaDrafts((d) => ({
                            ...d,
                            [team.id]: e.target.value,
                          }))
                        }
                        placeholder='+10 / -10'
                      />
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => handleApplyQuota(team)}
                      >
                        {t('Apply')}
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </TitledCard>
  )
}
