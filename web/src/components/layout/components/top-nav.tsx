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
import { Menu } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'

type TopNavProps = React.HTMLAttributes<HTMLElement> & {
  links: TopNavLink[]
}

/**
 * 顶部导航栏组件
 * 在大屏幕显示水平导航，在小屏幕显示下拉菜单
 */
export function TopNav({ className, links, ...props }: TopNavProps) {
  const { t } = useTranslation()
  // 规范化链接，确保所有可选属性都有默认值
  const normalizedLinks = useMemo(
    () =>
      links.map((link) => ({
        isActive: false,
        disabled: false,
        external: false,
        ...link,
      })),
    [links]
  )

  return (
    <>
      {/* 移动端下拉菜单 */}
      <div className='xl:hidden'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            aria-label={t('Toggle navigation menu')}
            render={<Button size='icon' variant='outline' className='size-7' />}
          >
            <Menu aria-hidden='true' />
          </DropdownMenuTrigger>
          <DropdownMenuContent side='bottom' align='start'>
            {normalizedLinks.map(
              ({
                title,
                href,
                isActive,
                disabled,
                external,
                matchDescendants,
              }) => (
                <DropdownMenuItem
                  key={`${title}-${href}`}
                  render={
                    external ? (
                      <a
                        href={href}
                        target='_blank'
                        rel='noopener noreferrer'
                        className={!isActive ? 'text-muted-foreground' : ''}
                      >
                        {title}
                      </a>
                    ) : (
                      <Link
                        to={href}
                        activeOptions={{
                          exact: !matchDescendants,
                          includeSearch: false,
                        }}
                        className={
                          !isActive
                            ? 'text-muted-foreground data-[status=active]:text-primary'
                            : undefined
                        }
                        disabled={disabled}
                      >
                        {title}
                      </Link>
                    )
                  }
                />
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 桌面端水平导航 */}
      <nav
        className={cn(
          'hidden min-w-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain xl:flex',
          className
        )}
        {...props}
      >
        {normalizedLinks.map(
          ({ title, href, isActive, disabled, external, matchDescendants }) =>
            external ? (
              <a
                key={`${title}-${href}`}
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                className={`shrink-0 rounded-lg px-1 py-3 text-sm whitespace-nowrap transition-colors duration-200 2xl:px-2.5 2xl:text-base ${isActive ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {title}
              </a>
            ) : (
              <Link
                key={`${title}-${href}`}
                to={href}
                disabled={disabled}
                activeOptions={{
                  exact: !matchDescendants,
                  includeSearch: false,
                }}
                className={cn(
                  'shrink-0 rounded-lg px-1 py-3 text-sm whitespace-nowrap transition-colors duration-200 2xl:px-2.5 2xl:text-base',
                  isActive
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground data-[status=active]:text-primary data-[status=active]:font-medium'
                )}
              >
                {title}
              </Link>
            )
        )}
      </nav>
    </>
  )
}
