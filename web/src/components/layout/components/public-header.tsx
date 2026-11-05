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
import { Link, useNavigate } from '@tanstack/react-router'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { DEFAULT_LOGO, SHOW_SYSTEM_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { BrandLockup, BrandOrb, HeaderLogo } from './header-logo'

const AUTH_PROMPT_SECONDS = 5

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileNavId = useId()
  const mobileNavTrigger = useRef<HTMLButtonElement>(null)
  const mobileNavPanel = useRef<HTMLDivElement>(null)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
  } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  // The shipped brand is a mark + wordmark lockup; an admin-configured logo
  // keeps its own aspect ratio (object-contain, never cropped). `/api/status`
  // appends a cache-busting query to the default path, so compare paths only.
  const usesBrandLockup =
    !customLogo && systemLogo.split('?')[0] === DEFAULT_LOGO
  let logoContent: ReactNode = usesBrandLockup ? (
    <BrandLockup />
  ) : (
    <HeaderLogo
      src={systemLogo}
      loading={loading}
      logoLoaded={logoLoaded}
      className='size-full object-contain'
    />
  )
  if (customLogo) logoContent = customLogo
  if (loading) {
    logoContent = usesBrandLockup ? (
      <Skeleton className='h-full w-36 rounded-lg' />
    ) : (
      <Skeleton className='size-full rounded-lg' />
    )
  }

  let authContent = (
    <Button
      size='sm'
      className='bg-foreground text-background hover:bg-foreground/90 h-11 shrink-0 rounded-full px-4 text-sm font-medium 2xl:px-6 2xl:text-base'
      render={<Link to='/sign-in' />}
    >
      {t('Sign in')}
    </Button>
  )
  if (isAuthenticated) authContent = <ProfileDropdown />
  if (loading) authContent = <Skeleton className='h-11 w-24 rounded-full' />

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const desktop = window.matchMedia('(min-width: 80rem)')
    if (desktop.matches) {
      setMobileOpen(false)
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mobileNavPanel.current
      ?.querySelector<HTMLAnchorElement>('nav a[href]')
      ?.focus({ preventScroll: true })

    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      document.body.style.overflow = previousOverflow
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const handleNavLinkClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      link: TopNavLink,
      closeMobile = false
    ) => {
      if (link.disabled) {
        event.preventDefault()
        return
      }

      if (closeMobile) {
        setMobileOpen(false)
        mobileNavTrigger.current?.focus({ preventScroll: true })
      }

      if (link.requiresAuth) {
        event.preventDefault()
        setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
        setAuthPromptTarget({
          title: t(link.title),
          href: link.href,
        })
      }
    },
    [t]
  )

  function handleMobileNavEscape(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !mobileOpen) return
    setMobileOpen(false)
    mobileNavTrigger.current?.focus()
  }

  return (
    <>
      {/* Full-width pinned top bar (qianwen models style): stays fixed with a
          blurred backdrop; a hairline border fades in after scrolling. The
          brand anchors to the far left, links center in the remaining space,
          controls hug the right edge. */}
      <header
        className='pointer-events-none fixed inset-x-0 top-0 z-50'
        onKeyDown={handleMobileNavEscape}
      >
        <div
          className={cn(
            'pointer-events-auto bg-background/70 border-border/60 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300 dark:border-white/15 dark:bg-white/5',
            scrolled &&
              'bg-background/90 border-b shadow-[0_1px_16px_-8px_rgba(0,0,0,0.15)] dark:bg-white/10'
          )}
        >
          <nav className='flex h-16 w-full items-center justify-between gap-3 px-5 md:h-24 2xl:px-8'>
            <div className='flex min-w-0 items-center xl:shrink-0'>
              <Link
                to={homeUrl}
                aria-label={displaySiteName}
                className='group flex min-w-0 items-center gap-3 md:gap-4'
              >
                {SHOW_SYSTEM_LOGO &&
                  (usesBrandLockup ? (
                    <>
                      <div className='flex h-11 shrink-0 items-center transition-transform duration-300 group-hover:scale-105 md:h-16 xl:hidden 2xl:flex'>
                        {logoContent}
                      </div>
                      <BrandOrb className='hidden size-9 transition-transform duration-300 group-hover:scale-105 xl:block 2xl:hidden' />
                    </>
                  ) : (
                    <div className='flex size-9 shrink-0 items-center justify-center transition-transform duration-300 group-hover:scale-105 md:size-14 xl:size-9 2xl:size-14'>
                      {logoContent}
                    </div>
                  ))}
                {/* The brand lockup already carries the wordmark, so the
                    configured platform name is assistive-tech only there; an
                    admin-configured logo keeps its visible name. */}
                {usesBrandLockup ? (
                  <span className='sr-only'>{displaySiteName}</span>
                ) : (
                  <span
                    className='max-w-56 truncate text-base font-bold tracking-tight md:max-w-xs md:text-[1.375rem] xl:hidden 2xl:block 2xl:max-w-40'
                    title={displaySiteName}
                  >
                    {loading ? (
                      <Skeleton className='h-6 w-28' />
                    ) : (
                      displaySiteName
                    )}
                  </span>
                )}
              </Link>
            </div>

            {/* Desktop nav + controls — hugging the right edge */}
            <div className='hidden min-w-0 items-center gap-1 xl:flex'>
              <div className='flex min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain'>
                {links.map((link) => {
                  if (link.external) {
                    return (
                      <a
                        key={`${link.title}:${link.href}`}
                        href={link.href}
                        title={t(link.title)}
                        target='_blank'
                        rel='noopener noreferrer'
                        aria-disabled={link.disabled}
                        tabIndex={link.disabled ? -1 : undefined}
                        onClick={(event) => handleNavLinkClick(event, link)}
                        className={cn(
                          'text-muted-foreground hover:text-foreground shrink-0 rounded-lg px-1.5 py-3 text-sm whitespace-nowrap transition-colors duration-200 2xl:px-2.5 2xl:text-base',
                          link.disabled && 'pointer-events-none opacity-50'
                        )}
                      >
                        {t(link.title)}
                      </a>
                    )
                  }
                  return (
                    <Link
                      key={`${link.title}:${link.href}`}
                      to={link.href}
                      activeOptions={{
                        exact: !link.matchDescendants,
                        includeSearch: false,
                      }}
                      title={t(link.title)}
                      disabled={link.disabled}
                      onClick={(event) => handleNavLinkClick(event, link)}
                      className={cn(
                        'text-muted-foreground hover:text-foreground data-[status=active]:text-primary shrink-0 rounded-lg px-1.5 py-3 text-sm whitespace-nowrap transition-colors duration-200 data-[status=active]:font-medium 2xl:px-2.5 2xl:text-base',
                        link.disabled && 'pointer-events-none opacity-50'
                      )}
                    >
                      {t(link.title)}
                    </Link>
                  )
                })}
              </div>

              <div className='bg-border/40 mx-1.5 h-6 w-px shrink-0 2xl:mx-2.5' />

              {showLanguageSwitcher && <LanguageSwitcher />}
              {showThemeSwitch && <ThemeSwitch />}
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

              {showAuthButtons && (
                <>
                  <div className='bg-border/40 mx-1.5 h-6 w-px' />
                  {authContent}
                </>
              )}
            </div>

            {/* Mobile: compact actions + hamburger */}
            <div className='flex shrink-0 items-center gap-2 xl:hidden'>
              {showThemeSwitch && <ThemeSwitch />}
              {showAuthButtons && !loading && isAuthenticated && (
                <ProfileDropdown />
              )}
              <Button
                ref={mobileNavTrigger}
                type='button'
                variant='ghost'
                size='icon'
                className='size-11'
                onClick={() => setMobileOpen((v) => !v)}
                aria-label={t('Toggle navigation menu')}
                aria-expanded={mobileOpen}
                aria-controls={mobileNavId}
              >
                <div className='relative size-5'>
                  <span
                    className={cn(
                      'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'top-[9px] rotate-45' : 'top-[4px]'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute inset-x-0 top-[9px] block h-[1.5px] rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
                    )}
                  />
                  <span
                    className={cn(
                      'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300',
                      mobileOpen ? 'top-[9px] -rotate-45' : 'top-[14px]'
                    )}
                  />
                </div>
              </Button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile full-screen overlay */}
      <div
        ref={mobileNavPanel}
        id={mobileNavId}
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        onKeyDown={handleMobileNavEscape}
        className={cn(
          'bg-background/98 fixed inset-0 z-40 overflow-y-auto backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] xl:pointer-events-none xl:hidden',
          mobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div className='flex min-h-full flex-col justify-between gap-4 px-8 pt-24 pb-10'>
          <nav className='flex flex-col gap-1'>
            {links.map((link, i) => {
              const linkClassName = cn(
                'text-muted-foreground data-[status=active]:text-foreground flex items-center gap-3 py-3 text-base font-medium tracking-tight transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                mobileOpen
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-4 opacity-0',
                link.disabled && 'pointer-events-none opacity-50'
              )
              const transitionStyle = {
                transitionDelay: mobileOpen ? `${100 + i * 50}ms` : '0ms',
              }
              if (link.external) {
                return (
                  <a
                    key={`${link.title}:${link.href}`}
                    href={link.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-disabled={link.disabled}
                    tabIndex={link.disabled ? -1 : undefined}
                    onClick={(event) => handleNavLinkClick(event, link, true)}
                    className={linkClassName}
                    style={transitionStyle}
                  >
                    {t(link.title)}
                  </a>
                )
              }
              return (
                <Link
                  key={`${link.title}:${link.href}`}
                  to={link.href}
                  activeOptions={{
                    exact: !link.matchDescendants,
                    includeSearch: false,
                  }}
                  disabled={link.disabled}
                  onClick={(event) => handleNavLinkClick(event, link, true)}
                  className={linkClassName}
                  style={transitionStyle}
                >
                  {t(link.title)}
                </Link>
              )
            })}
          </nav>

          <div
            className={cn(
              'flex flex-col gap-3 transition-all duration-500',
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0'
            )}
            style={{ transitionDelay: mobileOpen ? '250ms' : '0ms' }}
          >
            {showAuthButtons && (
              <Link
                to={isAuthenticated ? '/dashboard' : '/sign-in'}
                onClick={() => setMobileOpen(false)}
                className='bg-foreground text-background inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-80'
              >
                {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
              </Link>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}
