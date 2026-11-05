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
import { UsersRound } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { WorkspaceWriteSession } from '../lib/workspace-write-transport'
import { WorkspaceMembersPanel } from './workspace-members-panel'

export function WorkspaceMembersSection(props: {
  workspaceId: string
  session: WorkspaceWriteSession
  verified: boolean
  onSelfChange: () => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const panelId = useId()
  const [open, setOpen] = useState(false)

  return (
    <section aria-labelledby={titleId} className='mt-8 border-t pt-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h3 id={titleId} className='text-lg font-semibold'>
          {t('Workspace members')}
        </h3>
        <Button
          type='button'
          variant='outline'
          aria-expanded={open}
          aria-controls={panelId}
          disabled={!props.verified}
          onClick={() => setOpen(!open)}
        >
          <UsersRound aria-hidden='true' />
          {t('Manage members')}
        </Button>
      </div>
      <div id={panelId} hidden={!open}>
        {open && (
          <WorkspaceMembersPanel
            workspaceId={props.workspaceId}
            session={props.session}
            verified={props.verified}
            onSelfChange={props.onSelfChange}
          />
        )}
      </div>
    </section>
  )
}
