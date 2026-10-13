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
import { SidebarTrigger } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  /** Show the sidebar trigger (console body owns it since the top bar went
   *  uniform across public and console pages). */
  showSidebarTrigger?: boolean
}

export function Header({
  className,
  children,
  showSidebarTrigger = true,
  ...props
}: HeaderProps) {
  return (
    <header
      className={cn(
        'bg-background/70 border-border/60 backdrop-blur-xl border-b dark:border-white/15 dark:bg-white/5',
        'sticky top-0 z-40 h-[var(--app-header-height,4.5rem)] w-full shrink-0',
        className
      )}
      {...props}
    >
      <div className='flex h-full items-center gap-1.5 px-5 sm:gap-2 md:px-8'>
        {showSidebarTrigger && <SidebarTrigger variant='ghost' className='size-11' />}
        {children}
      </div>
    </header>
  )
}
