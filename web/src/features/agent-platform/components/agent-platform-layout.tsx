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
import { Outlet } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { AppHeader } from '@/components/layout/components/app-header'
import { LoadingState } from '@/components/loading-state'
import { SkipToMain } from '@/components/skip-to-main'
import { Button } from '@/components/ui/button'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { getCookie } from '@/lib/cookies'
import { useAuthStore } from '@/stores/auth-store'

import {
  isAgentPlatformAvailable,
  useAgentPlatformCapabilities,
} from '../queries'
import { AgentPlatformSidebar } from './agent-platform-sidebar'

export function AgentPlatformLayout() {
  const { t } = useTranslation()
  const capabilities = useAgentPlatformCapabilities()
  const available = isAgentPlatformAvailable(capabilities)
  const session = useAuthStore((state) => {
    const auth = state.auth
    return auth.accessToken && auth.user && auth.session?.sid
      ? `${auth.user.id}:${auth.session.sid}`
      : null
  })
  // A failed public availability refresh must hide the workbench without
  // discarding unsaved forms. Explicit disablement or identity loss unmounts it.
  const retainOutlet =
    session !== null &&
    capabilities.isFetchedAfterMount &&
    capabilities.data?.enabled === true
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
  } else if (available) {
    content = null
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
    <SidebarProvider
      defaultOpen={getCookie('sidebar_state') !== 'false'}
      className='console-root flex-col'
    >
      <SkipToMain />
      <AppHeader />
      <div className='flex min-h-0 w-full flex-1'>
        {available && <AgentPlatformSidebar />}
        <SidebarInset
          id='content'
          tabIndex={-1}
          className='@container/content min-w-0 scroll-mt-24'
        >
          {available && (
            <div className='border-border/60 flex items-center border-b px-3 py-1.5 md:hidden'>
              <SidebarTrigger
                className='size-10'
                aria-label={t('Toggle workbench navigation')}
              />
              <span className='text-muted-foreground ml-2 text-sm font-medium'>
                {t('Agent workbench')}
              </span>
            </div>
          )}
          <div className='mx-auto w-full max-w-6xl px-5 pt-7 pb-14 sm:px-8 md:pt-10'>
            <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
              {t('Agent workbench')}
            </h1>
            {content}
            {retainOutlet && (
              <div hidden={!available} inert={!available}>
                <Outlet key={session} />
              </div>
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
