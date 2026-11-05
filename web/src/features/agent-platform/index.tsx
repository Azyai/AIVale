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
import { Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'

import { WorkspaceCreateAction } from './components/workspace-create-action'
import { WorkspaceList } from './components/workspace-list'
import type { WorkspaceListControls } from './components/workspace-list-filters'

export function AgentPlatformWorkspaces(
  props: WorkspaceListControls & {
    onWorkspaceCreated: (id: string) => void
  }
) {
  const { t } = useTranslation()

  return (
    <>
      <div className='mt-4 flex flex-wrap items-center justify-between gap-4'>
        <p className='text-muted-foreground max-w-xl text-base/relaxed sm:text-lg/relaxed'>
          {t('Build and manage agents with your team in a shared workspace.')}
        </p>
        <Link
          to='/agent-demo'
          className={buttonVariants({ variant: 'outline' })}
        >
          <Play aria-hidden='true' />
          {t('Try the agent demo')}
        </Link>
      </div>

      <WorkspaceList
        {...props}
        action={<WorkspaceCreateAction onCreated={props.onWorkspaceCreated} />}
      />
    </>
  )
}
