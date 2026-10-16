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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { useStatus } from '@/hooks/use-status'

function resolveBaseUrl(status: unknown): string {
  const record = status as { server_address?: unknown } | null
  const address =
    typeof record?.server_address === 'string'
      ? record.server_address.trim()
      : ''
  const origin =
    typeof window === 'undefined' ? '' : window.location.origin || ''
  return (address || origin).replace(/\/+$/, '')
}

export function ApiKeysBaseUrl() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const openaiCompatibleUrl = `${resolveBaseUrl(status)}/v1`

  return (
    <div className='space-y-3'>
      <div className='text-xs font-medium'>{t('按量付费 Base URL')}</div>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground w-20 shrink-0 text-xs'>
          {t('OpenAI 兼容')}
        </span>
        <div className='bg-muted/40 flex h-9 min-w-0 flex-1 items-center rounded-full px-4'>
          <code className='text-foreground/90 truncate text-[13px]'>
            {openaiCompatibleUrl}
          </code>
        </div>
        <CopyButton
          value={openaiCompatibleUrl}
          variant='outline'
          size='icon'
          aria-label={t('Copy to clipboard')}
          tooltip={t('Copy to clipboard')}
          className='size-9 shrink-0 rounded-full'
        />
      </div>
    </div>
  )
}
