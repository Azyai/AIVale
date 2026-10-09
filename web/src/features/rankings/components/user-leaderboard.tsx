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
import { useTranslation } from 'react-i18next'

import { formatTokens } from '../lib/format'
import type { UserRanking } from '../types'
import { GrowthText } from './growth-text'

type UserLeaderboardSectionProps = {
  rows: UserRanking[]
}

/**
 * "Top Users" card: token usage leaderboard by user for the selected
 * period, capped server-side at 30 rows. Layout mirrors the two-column
 * model leaderboard: "rank · username (share below) · tokens (growth
 * below)".
 */
export function UserLeaderboardSection(props: UserLeaderboardSectionProps) {
  const { t } = useTranslation()
  const rows = props.rows
  const half = Math.ceil(rows.length / 2)
  const left = rows.slice(0, half)
  const right = rows.slice(half)
  const totalTokens = rows.reduce((sum, row) => sum + row.total_tokens, 0)

  return (
    <section className='bg-card overflow-hidden rounded-lg border'>
      <header className='flex items-start justify-between gap-4 px-5 py-4'>
        <div className='min-w-0 flex-1'>
          <h2 className='text-foreground inline-flex items-center gap-2 text-base font-semibold'>
            <Users className='text-primary size-4' />
            {t('Top Users')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Token usage by user in the selected period')}
          </p>
        </div>
        <div className='shrink-0 text-right'>
          <div className='text-foreground font-mono text-2xl font-semibold tabular-nums'>
            {formatTokens(totalTokens)}
          </div>
          <div className='text-muted-foreground/80 text-[10px] font-medium tracking-widest uppercase'>
            {t('tokens')}
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className='text-muted-foreground/80 px-5 pb-5 text-center text-sm'>
          {t('No user usage data')}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-x-8 px-5 pt-1 pb-4 md:grid-cols-2'>
          <UserList rows={left} />
          {right.length > 0 && <UserList rows={right} />}
        </div>
      )}
    </section>
  )
}

function UserList(props: { rows: UserRanking[] }) {
  const { t } = useTranslation()
  return (
    <ul>
      {props.rows.map((row) => (
        <li key={row.user_id} className='flex items-center gap-3 py-2.5'>
          <span className='text-muted-foreground/80 w-6 shrink-0 text-right font-mono text-xs tabular-nums'>
            {row.rank}.
          </span>
          <div className='min-w-0 flex-1'>
            <span className='text-foreground block truncate font-mono text-sm font-medium'>
              {row.username || `#${row.user_id}`}
            </span>
            <p className='text-muted-foreground/80 truncate text-xs'>
              {(row.share * 100).toFixed(1)}%
            </p>
          </div>
          <div className='shrink-0 text-right'>
            <div className='text-foreground font-mono text-sm font-semibold tabular-nums'>
              {formatTokens(row.total_tokens)}{' '}
              <span className='text-muted-foreground/80 font-normal'>
                {t('tokens')}
              </span>
            </div>
            <GrowthText value={row.growth_pct} className='text-[11px]' />
          </div>
        </li>
      ))}
    </ul>
  )
}
