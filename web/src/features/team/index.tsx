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
  Copy,
  Crown,
  KeyRound,
  LogOut,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  getTeamSelf,
  joinTeam,
  leaveTeam,
  refreshTeamInviteCode,
  removeTeamMember,
  updateTeamName,
} from './api'
import { TeamWalletCard } from './components/team-wallet-card'
import type { TeamSelfData } from './types'

export function Team() {
  const { t } = useTranslation()
  const [data, setData] = useState<TeamSelfData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTeam = useCallback(async () => {
    try {
      const res = requireServerSuccess(await getTeamSelf())
      if (res.success) {
        setData((res.data as TeamSelfData | null) ?? null)
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-48 w-full rounded-xl' />
        <Skeleton className='h-64 w-full rounded-xl' />
      </div>
    )
  }

  if (!data) {
    return <JoinTeamCard onJoined={fetchTeam} t={t} />
  }

  return (
    <div className='space-y-4 sm:space-y-6'>
      <TeamOverviewCard data={data} onChanged={fetchTeam} t={t} />
      <TeamWalletCard data={data} onChanged={fetchTeam} t={t} />
      <TeamSubscriptionsCard data={data} t={t} />
      <TeamMembersCard data={data} onChanged={fetchTeam} t={t} />
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

function JoinTeamCard({ onJoined, t }: { onJoined: () => void; t: T }) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleJoin = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      toast.error(t('请输入邀请码'))
      return
    }
    setSubmitting(true)
    try {
      const res = await joinTeam({ invite_code: trimmed })
      if (res.success) {
        toast.success(t('加入团队成功'))
        setCode('')
        onJoined()
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <TitledCard
      title={t('我的团队')}
      description={t('团队成员共享套餐额度与团队钱包，团队令牌与个人令牌严格隔离')}
      icon={<Users className='h-4 w-4' />}
      iconTone='chart-2'
      disableHoverEffect
      contentClassName='space-y-6'
    >
      <p className='text-muted-foreground text-sm leading-relaxed'>
        {t(
          '您当前不在任何团队中。购买团队套餐会自动创建团队，或输入团队邀请码加入现有团队。'
        )}
      </p>
      <div className='flex max-w-md gap-2'>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('请输入团队邀请码')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleJoin()
          }}
        />
        <Button onClick={handleJoin} disabled={submitting}>
          <UserPlus className='size-4' />
          {t('加入团队')}
        </Button>
      </div>
      <div>
        <Button variant='outline' render={<Link to='/wallet' />}>
          {t('购买团队套餐')}
        </Button>
      </div>
    </TitledCard>
  )
}

function TeamOverviewCard({
  data,
  onChanged,
  t,
}: {
  data: TeamSelfData
  onChanged: () => void
  t: T
}) {
  const isOwner = data.role === 'owner'
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(data.team.name)
  const [refreshing, setRefreshing] = useState(false)
  const [inviteCode, setInviteCode] = useState(data.invite_code)

  const handleRename = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === data.team.name) {
      setRenaming(false)
      setName(data.team.name)
      return
    }
    try {
      const res = await updateTeamName({ name: trimmed })
      if (res.success) {
        toast.success(t('Updated successfully'))
        onChanged()
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
    } finally {
      setRenaming(false)
    }
  }

  const handleRefreshCode = async () => {
    setRefreshing(true)
    try {
      const res = await refreshTeamInviteCode()
      if (res.success && res.data?.invite_code) {
        setInviteCode(res.data.invite_code)
        toast.success(t('邀请码已更新'))
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
    } finally {
      setRefreshing(false)
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(t('Copied'))
    } catch {
      toast.error(t('Copy failed'))
    }
  }

  const handleLeave = async () => {
    try {
      const res = await leaveTeam()
      if (res.success) {
        toast.success(t('已退出团队'))
        onChanged()
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
    }
  }

  return (
    <TitledCard
      title={data.team.name}
      description={t('团队成员共享套餐额度与团队钱包，团队令牌与个人令牌严格隔离')}
      icon={<Users className='h-4 w-4' />}
      iconTone='chart-2'
      disableHoverEffect
      contentClassName='space-y-5'
    >
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <div className='bg-muted/40 rounded-xl border p-4'>
          <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <Wallet className='size-3.5' />
            {t('团队钱包')}
          </div>
          <div className='mt-2 text-xl font-bold'>
            {formatQuota(data.quota)}
          </div>
          {isOwner && (
            <div className='text-muted-foreground mt-2 text-xs'>
              {t('在下方「团队钱包」卡片中充值')}
            </div>
          )}
        </div>

        <div className='bg-muted/40 rounded-xl border p-4'>
          <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <Users className='size-3.5' />
            {t('成员数')}
          </div>
          <div className='mt-2 text-xl font-bold'>{data.members.length}</div>
          <div className='text-muted-foreground mt-2 text-xs'>
            {t('我的角色')}：
            {data.role === 'owner' ? t('所有者') : t('成员')}
          </div>
        </div>

        <div className='bg-muted/40 rounded-xl border p-4'>
          <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
            <KeyRound className='size-3.5' />
            {t('团队令牌')}
          </div>
          <div className='mt-2 text-xl font-bold'>{data.token_count}</div>
          <div className='mt-2'>
            <Button variant='outline' size='sm' render={<Link to='/keys' />}>
              {t('管理令牌')}
            </Button>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className='space-y-3'>
          <div className='flex flex-wrap items-center gap-2'>
            {renaming ? (
              <>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className='max-w-xs'
                  autoFocus
                />
                <Button size='sm' onClick={handleRename}>
                  {t('Save changes')}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => {
                    setRenaming(false)
                    setName(data.team.name)
                  }}
                >
                  {t('Cancel')}
                </Button>
              </>
            ) : (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setRenaming(true)}
              >
                {t('重命名团队')}
              </Button>
            )}

            {inviteCode && (
              <>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => copyCode(inviteCode)}
                >
                  <Copy className='size-3.5' />
                  {t('复制邀请码')}: {inviteCode}
                </Button>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={handleRefreshCode}
                  disabled={refreshing}
                >
                  <RefreshCw
                    className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`}
                  />
                  {t('更新邀请码')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {!isOwner && (
        <div className='flex justify-end'>
          <Button variant='outline' size='sm' onClick={handleLeave}>
            <LogOut className='size-3.5' />
            {t('退出团队')}
          </Button>
        </div>
      )}
    </TitledCard>
  )
}

function TeamSubscriptionsCard({ data, t }: { data: TeamSelfData; t: T }) {
  const subs = data.subscriptions || []
  const now = Date.now() / 1000
  const active = subs.filter(
    (s) => s.status === 'active' && s.end_time > now
  )
  const memberName = (userId: number) => {
    const m = (data.members || []).find((x) => x.user_id === userId)
    return m ? m.display_name || m.username : `User #${userId}`
  }
  const seats = active.find((s) => (s.seats ?? 0) > 0)?.seats

  return (
    <TitledCard
      title={t('团队订阅')}
      description={t('团队套餐按人分配额度，每位成员额度相同；额度用尽后自动使用团队钱包按量付费')}
      icon={<Crown className='h-4 w-4' />}
      iconTone='warning'
      disableHoverEffect
      contentClassName='space-y-3'
    >
      {active.length === 0 ? (
        <p className='text-muted-foreground py-4 text-center text-sm'>
          {t('暂无生效的团队订阅')}
        </p>
      ) : (
        <>
          {seats ? (
            <p className='text-muted-foreground/70 text-xs'>
              {t('席位数')}: {seats} · {t('每人额度相同')}
            </p>
          ) : null}
          {active.map((sub) => {
            const total = Number(sub.amount_total || 0)
            const used = Number(sub.amount_used || 0)
            const remain = total > 0 ? Math.max(0, total - used) : 0
            const percent = total > 0 ? Math.round((used / total) * 100) : 0
            const remainDays = Math.max(
              0,
              Math.ceil((sub.end_time - now) / 86400)
            )
            return (
              <div key={sub.id} className='bg-background rounded-md border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                  <span className='font-medium'>
                    {memberName(sub.user_id)}
                  </span>
                  <span className='text-muted-foreground'>
                    {t('{{count}} days remaining', { count: remainDays })}
                  </span>
                </div>
                <div className='text-muted-foreground mt-1.5 text-xs'>
                  {t('每人额度')}:{' '}
                  {total > 0 ? (
                    <>
                      {formatQuota(used)}/{formatQuota(total)} ·{' '}
                      {t('套餐剩余')} {formatQuota(remain)}
                    </>
                  ) : (
                    t('Unlimited')
                  )}
                  {total > 0 && (
                    <span className='ml-2'>
                      {t('Used')} {percent}%
                    </span>
                  )}
                </div>
                {total > 0 && <Progress value={percent} className='mt-2 h-1.5' />}
              </div>
            )
          })}
        </>
      )}
      <div>
        <Button variant='outline' render={<Link to='/wallet' />}>
          {t('购买/升级团队套餐')}
        </Button>
      </div>
    </TitledCard>
  )
}

function TeamMembersCard({
  data,
  onChanged,
  t,
}: {
  data: TeamSelfData
  onChanged: () => void
  t: T
}) {
  const isOwner = data.role === 'owner'
  const [removing, setRemoving] = useState<number | null>(null)
  const members = data.members || []

  const handleRemove = async (userId: number) => {
    setRemoving(userId)
    try {
      const res = await removeTeamMember(userId)
      if (res.success) {
        toast.success(t('已移除成员，其团队令牌已禁用'))
        onChanged()
      } else {
        handleServerError(res)
      }
    } catch (error) {
      handleServerError(error, t('Request failed'))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <TitledCard
      title={t('团队成员')}
      description={t('成员可创建团队令牌，团队令牌只消耗团队额度')}
      icon={<Users className='h-4 w-4' />}
      iconTone='chart-2'
      disableHoverEffect
      contentClassName='space-y-2'
    >
      <Card data-card-hover='false'>
        <CardContent className='p-0'>
          <div className='divide-y'>
            {members.map((m) => (
              <div
                key={m.user_id}
                className='flex items-center justify-between gap-3 px-4 py-3'
              >
                <div className='flex min-w-0 items-center gap-3'>
                  <div className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold'>
                    {(m.display_name || m.username || '?')
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className='min-w-0'>
                    <div className='truncate text-sm font-medium'>
                      {m.display_name || m.username || `User #${m.user_id}`}
                    </div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {m.username}
                    </div>
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  {m.role === 'owner' ? (
                    <span className='bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium'>
                      <Crown className='size-3' />
                      {t('所有者')}
                    </span>
                  ) : (
                    <span className='text-muted-foreground text-[11px]'>
                      {t('成员')}
                    </span>
                  )}
                  {isOwner && m.role !== 'owner' && (
                    <Button
                      size='icon'
                      variant='ghost'
                      className='text-destructive hover:text-destructive h-7 w-7'
                      onClick={() => handleRemove(m.user_id)}
                      disabled={removing === m.user_id}
                      title={t('移除成员')}
                    >
                      <Trash2 className='size-3.5' />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TitledCard>
  )
}
