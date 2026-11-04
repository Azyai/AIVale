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
import { Bot, LibraryBig, Plug, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import { WorkspaceList } from './components/workspace-list'
import type { WorkspaceListControls } from './components/workspace-list-filters'

function WorkbenchTool(props: {
  icon: LucideIcon
  name: string
  description: string
}) {
  return (
    <li className='flex items-start gap-4 py-4'>
      <span className='bg-muted text-foreground grid size-9 shrink-0 place-items-center rounded-lg'>
        <props.icon aria-hidden='true' className='size-4' />
      </span>
      <div className='min-w-0'>
        <h3 className='text-sm font-semibold'>{props.name}</h3>
        <p className='text-muted-foreground mt-1 text-sm/relaxed'>
          {props.description}
        </p>
      </div>
    </li>
  )
}

export function AgentPlatformWorkspaces(props: WorkspaceListControls) {
  const { t } = useTranslation()

  return (
    <>
      <p className='text-muted-foreground mt-4 max-w-xl text-base/relaxed sm:text-lg/relaxed'>
        {t('Build and manage agents with your team in a shared workspace.')}
      </p>

      <WorkspaceList {...props} />
      <section
        aria-labelledby='agent-tools-heading'
        className='mt-10 min-w-0 border-t pt-6'
      >
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
          <h2 id='agent-tools-heading' className='text-lg font-semibold'>
            {t('Workbench tools')}
          </h2>
          <Badge variant='secondary'>{t('In development')}</Badge>
        </div>
        <ul className='divide-border mt-3 divide-y md:grid md:grid-cols-3 md:gap-8 md:divide-y-0'>
          <WorkbenchTool
            icon={Bot}
            name={t('Agent builder')}
            description={t(
              'Configure models, instructions, and tools for an agent.'
            )}
          />
          <WorkbenchTool
            icon={LibraryBig}
            name={t('Skill library')}
            description={t('Reuse and version skills across agents.')}
          />
          <WorkbenchTool
            icon={Plug}
            name={t('MCP connections')}
            description={t('Connect agents to tools and data sources.')}
          />
        </ul>
      </section>
    </>
  )
}
