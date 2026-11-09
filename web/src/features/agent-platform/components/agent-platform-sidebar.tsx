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
import { Link, useLocation } from '@tanstack/react-router'
import {
  BookOpen,
  Bot,
  FolderKanban,
  PanelLeft,
  Play,
  UserRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

import { workbenchTools } from '../workbench-tools'

export function AgentPlatformSidebar() {
  const { t } = useTranslation()
  const path = useLocation({ select: (location) => location.pathname })
  const { setOpenMobile, toggleSidebar } = useSidebar()
  const closeMobile = () => setOpenMobile(false)
  const agentsActive = /^\/agent-platform\/w\/[1-9][0-9]*\/agents(?:\/|$)/.test(
    path
  )
  const teamActive =
    path === '/agent-platform/workspaces' ||
    (path.startsWith('/agent-platform/w/') && !agentsActive)
  const selectedWorkspaceId = path.match(
    /^\/agent-platform\/w\/([1-9][0-9]{0,18})(?:\/|$)/
  )?.[1]

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip={t('Toggle workbench navigation')}
              aria-label={t('Toggle workbench navigation')}
            >
              <PanelLeft aria-hidden='true' />
              <span>{t('Agent workbench')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t('Workbench navigation')}>
          <SidebarGroup>
            <SidebarGroupLabel>{t('Workspaces')}</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={path === '/agent-platform/personal'}
                  tooltip={t('Personal workspace')}
                  render={
                    <Link to='/agent-platform/personal' onClick={closeMobile} />
                  }
                >
                  <UserRound aria-hidden='true' />
                  <span>{t('Personal workspace')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {selectedWorkspaceId && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={agentsActive}
                    tooltip={t('Agents')}
                    render={
                      <Link
                        to='/agent-platform/w/$workspace_id/agents'
                        params={{ workspace_id: selectedWorkspaceId }}
                        aria-current={agentsActive ? 'page' : undefined}
                        search={{
                          page: 1,
                          page_size: 20,
                          sort: 'created_at:desc,id:desc',
                          q: '',
                          status: '',
                          tag: '',
                        }}
                        onClick={closeMobile}
                      />
                    }
                  >
                    <Bot aria-hidden='true' />
                    <span>{t('Agents')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={teamActive}
                  tooltip={t('Team workspaces')}
                  render={
                    <Link
                      to='/agent-platform/workspaces'
                      aria-current={teamActive ? 'page' : undefined}
                      onClick={closeMobile}
                    />
                  }
                >
                  <FolderKanban aria-hidden='true' />
                  <span>{t('Team workspaces')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>{t('Workbench tools')}</SidebarGroupLabel>
            <SidebarMenu>
              {workbenchTools.map(({ id, icon: Icon, title }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={path === `/agent-platform/tools/${id}`}
                    tooltip={t(title)}
                    render={
                      <Link
                        to='/agent-platform/tools/$tool'
                        params={{ tool: id }}
                        onClick={closeMobile}
                      />
                    }
                  >
                    <Icon aria-hidden='true' />
                    <span>{t(title)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t('Knowledge Base')}
                  render={<Link to='/knowledge-base' onClick={closeMobile} />}
                >
                  <BookOpen aria-hidden='true' />
                  <span>{t('Knowledge Base')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={t('Try the agent demo')}
                  render={<Link to='/agent-demo' onClick={closeMobile} />}
                >
                  <Play aria-hidden='true' />
                  <span>{t('Try the agent demo')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
