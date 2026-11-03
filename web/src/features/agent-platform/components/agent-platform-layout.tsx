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
import { Link, Outlet } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'

import {
  isAgentPlatformAvailable,
  useAgentPlatformCapabilities,
} from '../queries'

export function AgentPlatformLayout() {
  const { t } = useTranslation()
  const capabilities = useAgentPlatformCapabilities()
  let content: ReactNode
  if (capabilities.isError || capabilities.fetchStatus === 'paused') {
    content = (
      <div role='alert'>
        <ErrorState
          title={t('Unable to check agent workbench availability')}
          description={t('Check your connection and try again.')}
          onRetry={() => void capabilities.refetch()}
        />
      </div>
    )
  } else if (capabilities.isPending || !capabilities.isFetchedAfterMount) {
    content = (
      <div role='status' aria-live='polite'>
        <LoadingState message={t('Checking agent workbench availability...')} />
      </div>
    )
  } else if (isAgentPlatformAvailable(capabilities)) {
    content = <Outlet />
  } else {
    content = (
      <EmptyState
        icon={LockKeyhole}
        title={t('Agent workbench is unavailable')}
        description={t(
          'The agent workbench has not been enabled. Contact your administrator for access.'
        )}
        action={
          <Button
            variant='outline'
            disabled={capabilities.isFetching}
            onClick={() => void capabilities.refetch()}
          >
            {t('Check availability')}
          </Button>
        }
      />
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Agent workbench')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='ghost'
          render={
            <Link to='/dashboard/$section' params={{ section: 'overview' }} />
          }
        >
          {t('Back to Dashboard')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
