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
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { useNotifications } from '@/hooks/use-notifications'

import { Header } from './header'
import { PlatformNavigation } from './platform-navigation'
import { SystemBrand } from './system-brand'

type AppHeaderProps = {
  showTopNav?: boolean
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNotifications?: boolean
  showProfileDropdown?: boolean
}

export function AppHeader({
  showTopNav = true,
  leftContent,
  rightContent,
  showNotifications = true,
  showProfileDropdown = true,
}: AppHeaderProps) {
  const notifications = useNotifications()

  return (
    <Header
      showSidebarTrigger={false}
      className='border-primary/15 bg-background/85 dark:bg-background/75'
    >
      <div className='me-auto min-w-0 lg:me-2 lg:max-w-40'>
        <SystemBrand variant='inline' />
      </div>

      {leftContent ?? (showTopNav && <PlatformNavigation />)}

      {rightContent ?? (
        <div className='ms-auto flex shrink-0 items-center gap-1'>
          <div className='hidden lg:block'>
            <LanguageSwitcher />
          </div>
          <ThemeSwitch />
          {showNotifications && (
            <NotificationPopover
              open={notifications.popoverOpen}
              onOpenChange={notifications.setPopoverOpen}
              unreadCount={notifications.unreadCount}
              activeTab={notifications.activeTab}
              onTabChange={notifications.setActiveTab}
              notice={notifications.notice}
              announcements={notifications.announcements}
              loading={notifications.loading}
            />
          )}
          {showProfileDropdown && <ProfileDropdown />}
        </div>
      )}
    </Header>
  )
}
