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
import type { TFunction } from 'i18next'
import { Check, Coins, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { PillTabs } from '@/components/pill-tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  availableCycles,
  formatDuration,
  formatResetPeriod,
  groupPlansByTier,
  isPricingCycle,
  PRICING_CYCLE_ORDER,
  resolveCyclePlan,
  type PlanTierGroup,
  type PricingCycle,
} from '@/features/subscriptions/lib'
import type { PublicSubscriptionPlan } from '@/features/subscriptions/types'
import { useAuthStore } from '@/stores/auth-store'

import { usePublicPlans } from '../../hooks'

function getCycleLabel(cycle: PricingCycle, t: (key: string) => string) {
  switch (cycle) {
    case 'quarter':
      return t('季付')
    case 'year':
      return t('年付')
    default:
      return t('月付')
  }
}

function getCycleUnit(cycle: PricingCycle, t: (key: string) => string) {
  switch (cycle) {
    case 'quarter':
      return t('/ 季')
    case 'year':
      return t('/ 年')
    default:
      return t('/ 月')
  }
}

export function PricingSection() {
  const { t } = useTranslation()
  const { plans, isLoaded } = usePublicPlans()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const purchaseHref = isAuthenticated ? '/wallet' : '/sign-up'

  // Plans without an explicit tier fall back to their title as the tier, so
  // every plan joins the unified cycle-grouped card layout.
  const normalizedPlans = useMemo(
    () =>
      (plans || []).map((p) => ({
        ...p,
        tier: (p.tier || '').trim() || (p.title || '').trim(),
      })),
    [plans]
  )
  const { groups, standalone } = useMemo(
    () => groupPlansByTier(normalizedPlans),
    [normalizedPlans]
  )
  const personalGroups = useMemo(
    () => groups.filter((g) => g.planType === 'personal'),
    [groups]
  )
  const teamGroups = useMemo(
    () => groups.filter((g) => g.planType === 'team'),
    [groups]
  )
  const personalStandalone = useMemo(
    () => standalone.filter((p) => p.plan_type !== 'team'),
    [standalone]
  )
  const teamStandalone = useMemo(
    () => standalone.filter((p) => p.plan_type === 'team'),
    [standalone]
  )
  const hasTeamPlans = teamGroups.length > 0 || teamStandalone.length > 0

  const [planType, setPlanType] = useState<'personal' | 'team'>('personal')
  const activeGroups = planType === 'team' ? teamGroups : personalGroups
  const activeStandalone =
    planType === 'team' ? teamStandalone : personalStandalone

  const cycles = useMemo(() => {
    const set = new Set<PricingCycle>()
    for (const g of activeGroups) {
      for (const c of availableCycles(g)) set.add(c)
    }
    return PRICING_CYCLE_ORDER.filter((c) => set.has(c))
  }, [activeGroups])
  const [cycle, setCycle] = useState<PricingCycle>('month')
  const activeCycle = cycles.includes(cycle)
    ? cycle
    : ((cycles[0] ?? 'month') as PricingCycle)

  const noPlansAtAll = isLoaded && plans.length === 0

  // When multiple cycles exist (tabs visible), the selected cycle FILTERS the
  // cards: only tiers offering that cycle are shown.
  const cycleFilterActive = cycles.length > 1
  const visibleGroups = useMemo(
    () =>
      cycleFilterActive
        ? activeGroups.filter((g) => availableCycles(g).includes(activeCycle))
        : activeGroups,
    [activeGroups, cycleFilterActive, activeCycle]
  )
  const visibleStandalone = useMemo(
    () =>
      cycleFilterActive
        ? activeStandalone.filter(
            (p) => isPricingCycle(p.duration_unit) && p.duration_unit === activeCycle
          )
        : activeStandalone,
    [activeStandalone, cycleFilterActive, activeCycle]
  )
  const visibleCardCount = visibleGroups.length + visibleStandalone.length
  // The pay-as-you-go card always occupies one slot.
  const totalCardSlots = visibleCardCount + 1

  // Reserve the benefit area to the tallest card across the VISIBLE cards,
  // so switching cycles never changes card height.
  const reservedBenefitHeight = useMemo(() => {
    let maxRows = 3 // pay-as-you-go card
    for (const g of visibleGroups) {
      for (const c of availableCycles(g)) {
        const p = g.byCycle[c]
        if (p) maxRows = Math.max(maxRows, planBenefitRows(p, g.planType === 'team'))
      }
    }
    for (const p of visibleStandalone) {
      maxRows = Math.max(maxRows, planBenefitRows(p, p.plan_type === 'team'))
    }
    return benefitAreaHeight(maxRows)
  }, [visibleGroups, visibleStandalone])

  return (
    <section
      id='pricing'
      className='relative overflow-hidden px-[5%] py-12 md:py-16'
    >
      {/* Soft gradient wash behind the pricing area */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 opacity-20 dark:opacity-10'
        style={{
          background: [
            'radial-gradient(ellipse 50% 40% at 50% 0%, oklch(0.72 0.16 270 / 70%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 30% at 20% 60%, oklch(0.75 0.12 200 / 40%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />

      <div className='mx-auto w-full'>
        {/* Heading */}
        <div className='mb-8 text-center'>
          <h2 className='text-[clamp(2rem,3.5vw,3rem)] leading-tight font-bold tracking-tight'>
            {t('选择适合你的计费方式')}
          </h2>
          <p className='text-muted-foreground/70 mx-auto mt-3 w-[90%] text-base leading-relaxed md:text-lg'>
            {t('订阅套餐享更优单价，按量付费灵活兜底；个人与团队均支持两种模式。')}
          </p>
        </div>

        {/* Framed pricing panel: toggles + cards in one outlined box */}
        <div className='from-violet-500/10 via-violet-500/5 to-cyan-500/10 rounded-3xl bg-gradient-to-br p-4 shadow-xs backdrop-blur-sm sm:p-6 md:p-8'>
          {/* Plan type tabs with the cycle row stacked below */}
          <div className='mb-8 flex flex-col items-center gap-3'>
            {hasTeamPlans && (
              <PillTabs
                size='md'
                options={[
                  { value: 'personal' as const, label: t('个人版') },
                  { value: 'team' as const, label: t('团队版') },
                ]}
                value={planType}
                onChange={setPlanType}
              />
            )}
            {cycles.length > 1 && (
              <PillTabs
                size='sm'
                className='border-border/40 bg-muted/30'
                options={cycles.map((c) => ({
                  value: c,
                  label: getCycleLabel(c, t),
                }))}
                value={activeCycle}
                onChange={setCycle}
              />
            )}
          </div>

          {/* Loading skeleton */}
          {!isLoaded && (
            <div className='grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4'>
              {['a', 'b', 'c', 'd'].map((k) => (
                <Skeleton key={k} className='h-80 w-full rounded-3xl' />
              ))}
            </div>
          )}

          {/* Cards — filtered by the selected billing cycle */}
          {isLoaded && (
            <div
              className={cn(
                'grid grid-cols-1 items-stretch gap-5',
                totalCardSlots >= 3
                  ? 'md:grid-cols-2 lg:grid-cols-4'
                  : 'md:grid-cols-2 lg:grid-cols-3'
              )}
            >
              {visibleGroups.map((group) => (
                <PlanCard
                  key={group.key}
                  group={group}
                  cycle={activeCycle}
                  t={t}
                  href={purchaseHref}
                  benefitMinHeight={reservedBenefitHeight}
                />
              ))}

              {visibleStandalone.map((plan) => (
                <StandalonePlanCard
                  key={plan.id}
                  plan={plan}
                  t={t}
                  href={purchaseHref}
                  benefitMinHeight={reservedBenefitHeight}
                />
              ))}

              {/* Pay-as-you-go card */}
              <PayAsYouGoCard
                t={t}
                isAuthenticated={isAuthenticated}
                benefitMinHeight={reservedBenefitHeight}
              />
            </div>
          )}

          {noPlansAtAll && (
            <p className='text-muted-foreground/60 py-6 text-center text-sm'>
              {t(
                'No subscription plans configured yet — pay-as-you-go is always available.'
              )}
            </p>
          )}
        </div>

      </div>
    </section>
  )
}

interface CardT {
  t: TFunction
}

function PlanPrice({
  price,
  unit,
  perSeat,
}: {
  price: string
  unit: string
  perSeat: string | null
}) {
  return (
    <div className='flex items-baseline gap-1.5 py-4'>
      <span className='text-primary text-[clamp(2.25rem,3.5vw,3rem)] leading-none font-bold tracking-tight'>
        {price}
      </span>
      <span className='text-muted-foreground text-[15px] font-medium'>
        {unit}
        {perSeat ? ` / ${perSeat}` : ''}
      </span>
    </div>
  )
}

function BenefitList({
  items,
  minHeight,
}: {
  items: (string | null)[]
  /** Reserved height (px) so cards don't jump when cycles change row counts. */
  minHeight?: number
}) {
  const benefits = items.filter(Boolean) as string[]
  return (
    <ul
      className='flex-1 space-y-2.5'
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
    >
      {benefits.map((label) => (
        <li
          key={label}
          className='text-muted-foreground flex items-start gap-2.5 text-[15px] leading-relaxed'
        >
          <Check className='text-primary mt-0.5 size-4 shrink-0' />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Mirrors the card benefit construction — row count per plan. */
function planBenefitRows(
  plan: PublicSubscriptionPlan,
  isTeam: boolean
): number {
  let rows = 2 // Total Quota + Validity
  if (plan.quota_reset_period && plan.quota_reset_period !== 'never') rows++
  if (isTeam) rows++
  if (plan.upgrade_group) rows++
  return rows
}

const BENEFIT_ROW_PX = 38 // 24px line + 10px gap + wrap headroom
const benefitAreaHeight = (rows: number) =>
  Math.max(3, rows) * BENEFIT_ROW_PX - 10

/** Qianwen-style pricing card: pill CTA, hot tier with accent treatment. */
function PlanCard({
  group,
  cycle,
  t,
  href,
  benefitMinHeight,
}: CardT & {
  group: PlanTierGroup<PublicSubscriptionPlan>
  cycle: PricingCycle
  href: string
  benefitMinHeight?: number
}) {
  const resolved = resolveCyclePlan(group, cycle)
  const plan = resolved.plan
  if (!plan) return null
  const isTeam = group.planType === 'team'

  const benefits = [
    `${isTeam ? t('每人额度') : t('Total Quota')}: ${
      plan.total_amount > 0 ? formatQuota(plan.total_amount) : t('Unlimited')
    }`,
    formatResetPeriod(plan, t) !== t('No Reset')
      ? `${t('Quota Reset')}: ${formatResetPeriod(plan, t)}`
      : null,
    `${t('Validity Period')}: ${formatDuration(plan, t)}`,
    isTeam
      ? `${t('Seats')}: ${
          plan.team_max_seats > 0
            ? `${plan.team_min_seats} ~ ${plan.team_max_seats}`
            : `${plan.team_min_seats}+`
        }`
      : null,
    plan.upgrade_group
      ? `${t('Upgrade Group')}: ${plan.upgrade_group}`
      : null,
  ]

  return (
    <div
      className={cn(
        'bg-card relative flex flex-col rounded-3xl border p-7 transition-all duration-300',
        plan.is_hot
          ? 'border-primary/60 shadow-lg shadow-primary/10 ring-1 ring-primary/20'
          : 'border-border/70 hover:border-border hover:shadow-md'
      )}
    >
      {/* Hot ribbon */}
      {plan.is_hot && (
        <span className='from-primary to-primary/70 text-primary-foreground absolute -top-3 right-5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-semibold shadow-md'>
          <Zap className='size-3' />
          {t('Hot')}
        </span>
      )}

      {/* Tier header */}
      <div className='mb-1'>
        <h3 className='text-xl font-semibold tracking-tight'>{group.tier}</h3>
        {plan.subtitle && (
          <p className='text-muted-foreground/70 mt-1.5 text-sm leading-relaxed'>
            {plan.subtitle}
          </p>
        )}
      </div>

      {/* Cycle hint row */}
      <div className='mt-1 flex items-center gap-2'>
        <span className='text-muted-foreground/70 text-xs'>
          {getCycleLabel(resolved.cycle, t)}
        </span>
        {isTeam && (
          <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium'>
            {t('团队版')}
          </span>
        )}
      </div>

      <PlanPrice
        price={formatBillingCurrencyFromUSD(Number(plan.price_amount || 0))}
        unit={getCycleUnit(resolved.cycle, t)}
        perSeat={isTeam ? t('seat') : null}
      />

      <BenefitList items={benefits} minHeight={benefitMinHeight} />

      <div className='mt-6'>
        <Button
          className={cn(
            'h-12 w-full rounded-full text-[15px] font-medium',
            plan.is_hot
              ? 'shadow-primary/25 shadow-md'
              : 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          variant={plan.is_hot ? 'default' : 'ghost'}
          render={<Link to={href} />}
        >
          {t('Subscribe Now')}
        </Button>
      </div>
    </div>
  )
}

function StandalonePlanCard({
  plan,
  t,
  href,
  benefitMinHeight,
}: CardT & {
  plan: PublicSubscriptionPlan
  href: string
  benefitMinHeight?: number
}) {
  const isTeam = plan.plan_type === 'team'
  const benefits = [
    `${isTeam ? t('每人额度') : t('Total Quota')}: ${
      plan.total_amount > 0 ? formatQuota(plan.total_amount) : t('Unlimited')
    }`,
    formatResetPeriod(plan, t) !== t('No Reset')
      ? `${t('Quota Reset')}: ${formatResetPeriod(plan, t)}`
      : null,
    `${t('Validity Period')}: ${formatDuration(plan, t)}`,
    isTeam
      ? `${t('Seats')}: ${
          plan.team_max_seats > 0
            ? `${plan.team_min_seats} ~ ${plan.team_max_seats}`
            : `${plan.team_min_seats}+`
        }`
      : null,
    plan.upgrade_group
      ? `${t('Upgrade Group')}: ${plan.upgrade_group}`
      : null,
  ]

  return (
    <div
      className={cn(
        'bg-card relative flex flex-col rounded-3xl border p-7 transition-all duration-300',
        plan.is_hot
          ? 'border-primary/60 shadow-lg shadow-primary/10 ring-1 ring-primary/20'
          : 'border-border/70 hover:border-border hover:shadow-md'
      )}
    >
      {plan.is_hot && (
        <span className='from-primary to-primary/70 text-primary-foreground absolute -top-3 right-5 inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-semibold shadow-md'>
          <Zap className='size-3' />
          {t('Hot')}
        </span>
      )}

      <div className='mb-1'>
        <h3 className='text-xl font-semibold tracking-tight'>
          {plan.title}
        </h3>
        {plan.subtitle && (
          <p className='text-muted-foreground/70 mt-1.5 text-sm leading-relaxed'>
            {plan.subtitle}
          </p>
        )}
      </div>

      {isTeam && (
        <div className='mt-1 flex items-center gap-2'>
          <span className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium'>
            {t('团队版')}
          </span>
        </div>
      )}

      <PlanPrice
        price={formatBillingCurrencyFromUSD(Number(plan.price_amount || 0))}
        unit={formatDuration(plan, t)}
        perSeat={null}
      />

      <BenefitList items={benefits} minHeight={benefitMinHeight} />

      <div className='mt-6'>
        <Button
          className={cn(
            'h-12 w-full rounded-full text-[15px] font-medium',
            plan.is_hot
              ? 'shadow-primary/25 shadow-md'
              : 'bg-primary/10 text-primary hover:bg-primary/15'
          )}
          variant={plan.is_hot ? 'default' : 'ghost'}
          render={<Link to={href} />}
        >
          {t('Subscribe Now')}
        </Button>
      </div>
    </div>
  )
}

function PayAsYouGoCard({
  t,
  isAuthenticated,
  benefitMinHeight,
}: CardT & { isAuthenticated: boolean; benefitMinHeight?: number }) {
  const benefits = [
    t('无需订阅，充值即用'),
    t('按 Token 用量计费，覆盖全部支持模型'),
    t('实时用量追踪与余额提醒'),
  ]
  return (
    <div className='bg-card relative flex flex-col rounded-3xl border border-border/70 p-7 transition-all duration-300 hover:border-border hover:shadow-md'>
      <span className='bg-muted text-muted-foreground absolute -top-3 right-5 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold'>
        {t('Flexible')}
      </span>

      <div className='mb-1 flex items-center gap-2'>
        <Coins className='text-primary size-5' />
        <h3 className='text-xl font-semibold tracking-tight'>
          {t('Pay-as-you-go')}
        </h3>
      </div>

      <div className='flex items-baseline gap-1.5 py-4'>
        <span className='text-primary text-[clamp(2.25rem,3.5vw,3rem)] leading-none font-bold tracking-tight'>
          {t('按用量')}
        </span>
        <span className='text-muted-foreground text-[15px] font-medium'>
          {t('/ 计费')}
        </span>
      </div>

      <BenefitList items={benefits} minHeight={benefitMinHeight} />

      <div className='mt-6'>
        <Button
          className='bg-primary/10 text-primary hover:bg-primary/15 h-12 w-full rounded-full text-[15px] font-medium'
          variant='ghost'
          render={<Link to={isAuthenticated ? '/wallet' : '/sign-up'} />}
        >
          {t('Top Up Now')}
        </Button>
      </div>
    </div>
  )
}

