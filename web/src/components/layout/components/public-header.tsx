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
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO, SHOW_SYSTEM_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { BrandLockup, HeaderLogo } from './header-logo'
import { PlatformNavigation } from './platform-navigation'

export interface PublicHeaderProps {
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { systemName, logo, loading, logoLoaded } = useSystemConfig()
  const notifications = useNotifications()
  const name = props.siteName || systemName
  const usesBrandLockup = !props.logo && logo.split('?')[0] === DEFAULT_LOGO

  let authContent = (
    <Link
      to='/sign-in'
      className={buttonVariants({
        size: 'sm',
        className: 'hero-cta h-11 rounded-full px-5 lg:h-10',
      })}
    >
      {t('Sign in')}
    </Link>
  )
  if (user) authContent = <ProfileDropdown />
  if (loading) authContent = <Skeleton className='h-9 w-14' />

  return (
    <header
      className={cn(
        'bg-background/85 text-foreground border-primary/15 fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl dark:bg-background/75',
        props.className
      )}
    >
      <div className='flex h-16 w-full items-center gap-1 px-5 sm:gap-2 sm:px-8 lg:gap-6 lg:px-12 2xl:px-16'>
        <div className='me-auto min-w-0 lg:me-0 lg:max-w-56'>
          <Link
            to={props.homeUrl || '/'}
            aria-label={name}
            className='focus-visible:ring-ring inline-flex min-h-11 max-w-full items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:outline-none'
          >
            {SHOW_SYSTEM_LOGO && (
              <>
                {props.logo}
                {usesBrandLockup && <BrandLockup className='h-10 md:h-12' />}
                {!usesBrandLockup && !props.logo && (
                  <span className='size-8 shrink-0'>
                    <HeaderLogo
                      src={logo}
                      alt=''
                      loading={loading}
                      logoLoaded={logoLoaded}
                    />
                  </span>
                )}
              </>
            )}
            {(!usesBrandLockup || !SHOW_SYSTEM_LOGO) && (
              <span className='truncate text-sm font-semibold'>{name}</span>
            )}
          </Link>
        </div>
        {props.showNavigation !== false &&
          (props.navContent ?? (
            <PlatformNavigation
              showLanguageSwitcher={props.showLanguageSwitcher}
            />
          ))}
        <div className='ms-auto flex shrink-0 items-center gap-1'>
          {props.showLanguageSwitcher !== false && (
            <div className='hidden lg:block'>
              <LanguageSwitcher />
            </div>
          )}
          {props.showThemeSwitch !== false && <ThemeSwitch />}
          {props.showNotifications !== false && (
            <div className='hidden lg:block'>
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
            </div>
          )}
          {props.showAuthButtons !== false && authContent}
        </div>
      </div>
    </header>
  )
}
