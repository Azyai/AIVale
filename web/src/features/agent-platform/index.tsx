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
import { FolderLock, Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export function AgentPlatformWorkspaces() {
  const { t } = useTranslation()

  return (
    <section aria-label={t('Workspaces')}>
      <EmptyState
        icon={Layers}
        title={t('The agent workbench is being prepared.')}
        description={t(
          'Workspace management will be available here once it is ready.'
        )}
      />
    </section>
  )
}

/** This shell neither resolves a workspace nor grants access to its resources. */
export function AgentPlatformWorkspace() {
  const { t } = useTranslation()

  return (
    <section aria-label={t('Workspace')}>
      <EmptyState
        icon={FolderLock}
        title={t('Workspace details are not available yet')}
        description={t('Return to the workspace list to continue.')}
        action={
          <Button
            variant='outline'
            render={<Link to='/agent-platform/workspaces' />}
          >
            {t('Back to workspaces')}
          </Button>
        }
      />
    </section>
  )
}
