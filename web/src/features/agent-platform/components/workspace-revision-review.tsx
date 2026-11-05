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

import { Button } from '@/components/ui/button'

import type { AgentWorkspaceDetail } from '../workspace-detail-api'

export function WorkspaceRevisionReview(props: {
  latest?: AgentWorkspaceDetail
  conflict: boolean
  busy: boolean
  onReload: () => void
  onUseLatest: (workspace: AgentWorkspaceDetail) => void
}) {
  const { t } = useTranslation()
  const latest = props.latest
  return (
    <div className='bg-muted/50 space-y-2 rounded-md border p-3 text-sm'>
      <p role='status'>
        {props.conflict
          ? t(
              'This workspace changed. Reload the latest version before continuing.'
            )
          : t('Check workspace access before continuing.')}
      </p>
      {latest && (
        <dl className='space-y-1 [overflow-wrap:anywhere]'>
          <dt className='font-medium'>{t('Latest saved values')}</dt>
          <dd>{latest.name}</dd>
          <dd className='text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap'>
            {latest.description || t('No description')}
          </dd>
        </dl>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          type='button'
          disabled={props.busy}
          onClick={props.onReload}
        >
          {t('Reload latest version')}
        </Button>
        {latest && (
          <Button
            size='sm'
            type='button'
            disabled={props.busy}
            onClick={() => props.onUseLatest(latest)}
          >
            {t('Use latest version')}
          </Button>
        )}
      </div>
    </div>
  )
}
