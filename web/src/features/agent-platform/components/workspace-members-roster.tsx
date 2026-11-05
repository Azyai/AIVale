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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import {
  canManageWorkspaceMember,
  type WorkspaceMember,
} from '../workspace-members-api'
import { WorkspaceRole } from './workspace-display'

export function WorkspaceMembersRoster(props: {
  members: WorkspaceMember[]
  owner: boolean | undefined
  actorId: string
  busy: boolean
  onEdit: (member: WorkspaceMember) => void
  onRemove: (member: WorkspaceMember) => void
}) {
  const { t } = useTranslation()
  if (props.members.length === 0) {
    return (
      <p className='text-muted-foreground py-3 text-sm'>
        {t('No workspace members')}
      </p>
    )
  }

  return (
    <ul className='divide-border divide-y border-y'>
      {props.members.map((member) => (
        <li
          key={member.user_id}
          className='grid min-w-0 gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center'
        >
          <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
            <span className='font-medium tabular-nums'>
              <span className='text-muted-foreground mr-1 font-normal'>
                {t('User ID')}
              </span>
              {member.user_id}
            </span>
            <WorkspaceRole role={member.role} />
            <Badge
              variant={member.status === 'active' ? 'secondary' : 'outline'}
            >
              {member.status === 'active' ? t('Active') : t('Blocked')}
            </Badge>
          </div>
          {canManageWorkspaceMember(member, props.actorId, props.owner) && (
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={props.busy}
                onClick={() => props.onEdit(member)}
              >
                {member.status === 'active'
                  ? t('Change role')
                  : t('Restore access')}
              </Button>
              {member.status === 'active' && (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={props.busy}
                  onClick={() => props.onRemove(member)}
                >
                  {t('Remove member')}
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
