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
import { useLocation } from '@tanstack/react-router'
import { Menu, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { usePlatformCatalog } from '@/features/platform-catalog'

import {
  BusinessMenuContent,
  CatalogNavLink,
  CatalogSearch,
  DeveloperMenuContent,
  ProductMenuContent,
} from './catalog-nav-content'

const desktopBreakpoint = '(min-width: 64rem)'

function PlatformNavigationMenu(props: {
  pathname: string
  showLanguageSwitcher: boolean
  catalog: ReturnType<typeof usePlatformCatalog>
}) {
  const { t } = useTranslation()
  const catalog = props.catalog
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeDesktop = () => setOpenMenu(null)
  const closeMobile = () => setMobileOpen(false)

  const isProducts =
    /^\/(products|pricing|keys|agent-platform|agent-demo|dataset-center)(\/|$)/.test(
      props.pathname
    )
  const isBusiness = /^\/business(\/|$)/.test(props.pathname)
  const docs = catalog.developerLinks.filter((link) => link.id !== 'rankings')
  const searchableProducts = catalog.showProducts ? catalog.products : []
  const showSearch = searchableProducts.length > 0 || docs.length > 0
  const panelClassName =
    'max-h-[calc(100dvh-5rem)] overflow-y-auto border-t-2 border-primary/60 p-0 motion-reduce:transition-none'

  useEffect(() => {
    const media = window.matchMedia(desktopBreakpoint)
    const closeHiddenMenu = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false)
      else setOpenMenu(null)
    }
    media.addEventListener('change', closeHiddenMenu)
    return () => media.removeEventListener('change', closeHiddenMenu)
  }, [])

  return (
    <>
      <NavigationMenu
        aria-label={t('Platform navigation')}
        positionMethod='fixed'
        value={openMenu}
        onValueChange={setOpenMenu}
        delay={140}
        closeDelay={150}
        className='hidden max-w-none min-w-0 flex-1 justify-start lg:flex'
      >
        <NavigationMenuList className='justify-start gap-1'>
          {catalog.showProducts && (
            <NavigationMenuItem value='products'>
              <NavigationMenuTrigger
                aria-current={isProducts ? true : undefined}
                className='aria-current:text-primary'
              >
                {t('Products')}
              </NavigationMenuTrigger>
              <NavigationMenuContent
                className={`w-[min(76rem,calc(100vw-3rem))] ${panelClassName}`}
              >
                <ProductMenuContent
                  products={catalog.products}
                  onSelect={closeDesktop}
                />
              </NavigationMenuContent>
            </NavigationMenuItem>
          )}
          {catalog.showBusiness && (
            <NavigationMenuItem value='business'>
              <NavigationMenuTrigger
                aria-current={isBusiness ? true : undefined}
                className='aria-current:text-primary'
              >
                {t('Business Hall')}
              </NavigationMenuTrigger>
              <NavigationMenuContent
                className={`w-[min(48rem,calc(100vw-3rem))] ${panelClassName}`}
              >
                <BusinessMenuContent onSelect={closeDesktop} />
              </NavigationMenuContent>
            </NavigationMenuItem>
          )}
          {catalog.developerLinks.length > 0 && (
            <NavigationMenuItem value='developers'>
              <NavigationMenuTrigger>{t('Developers')}</NavigationMenuTrigger>
              <NavigationMenuContent className={`w-64 ${panelClassName}`}>
                <DeveloperMenuContent
                  links={catalog.developerLinks}
                  onSelect={closeDesktop}
                />
              </NavigationMenuContent>
            </NavigationMenuItem>
          )}
          {catalog.aboutLink && (
            <NavigationMenuItem>
              <CatalogNavLink
                link={catalog.aboutLink}
                onSelect={closeDesktop}
                className='hover:bg-muted data-[status=active]:text-primary flex h-9 items-center rounded-lg px-2.5 text-sm font-medium'
              />
            </NavigationMenuItem>
          )}
          {showSearch && (
            <NavigationMenuItem value='search' className='ms-auto'>
              <NavigationMenuTrigger
                aria-label={t('Search products and docs')}
                className='size-9 px-0 [&>svg:last-child]:hidden'
              >
                <Search className='size-4' aria-hidden />
              </NavigationMenuTrigger>
              <NavigationMenuContent className={`w-88 ${panelClassName}`}>
                <CatalogSearch
                  products={searchableProducts}
                  docs={docs}
                  onSelect={closeDesktop}
                />
              </NavigationMenuContent>
            </NavigationMenuItem>
          )}
        </NavigationMenuList>
      </NavigationMenu>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              className='size-11 shrink-0 lg:hidden'
            />
          }
          aria-label={t('Toggle navigation menu')}
        >
          <Menu className='size-5' aria-hidden />
        </SheetTrigger>
        <SheetContent
          className='w-full max-w-96 gap-0 motion-reduce:transition-none'
          showCloseButton={false}
        >
          <SheetHeader className='border-border flex min-h-16 flex-row items-center justify-between border-b px-5 py-2'>
            <SheetTitle>{t('Platform navigation')}</SheetTitle>
            <SheetClose
              render={
                <Button variant='ghost' size='icon' className='size-11' />
              }
              aria-label={t('Close')}
            >
              <X className='size-5' aria-hidden />
            </SheetClose>
          </SheetHeader>
          <nav
            aria-label={t('Platform navigation')}
            className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4'
          >
            {catalog.homeLink && (
              <CatalogNavLink
                link={catalog.homeLink}
                className='flex min-h-11 items-center text-sm font-medium'
                onSelect={closeMobile}
              />
            )}
            <Accordion>
              {showSearch && (
                <AccordionItem value='search'>
                  <AccordionTrigger className='min-h-11 items-center'>
                    {t('Search products and docs')}
                  </AccordionTrigger>
                  <AccordionContent className='[&_a]:no-underline'>
                    <CatalogSearch
                      products={searchableProducts}
                      docs={docs}
                      onSelect={closeMobile}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}
              {catalog.showProducts && (
                <AccordionItem value='products'>
                  <AccordionTrigger
                    aria-current={isProducts ? true : undefined}
                    className='aria-current:text-primary min-h-11 items-center'
                  >
                    {t('Products')}
                  </AccordionTrigger>
                  <AccordionContent className='[&_a]:no-underline'>
                    <ProductMenuContent
                      products={catalog.products}
                      onSelect={closeMobile}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}
              {catalog.showBusiness && (
                <AccordionItem value='business'>
                  <AccordionTrigger
                    aria-current={isBusiness ? true : undefined}
                    className='aria-current:text-primary min-h-11 items-center'
                  >
                    {t('Business Hall')}
                  </AccordionTrigger>
                  <AccordionContent className='[&_a]:no-underline'>
                    <BusinessMenuContent onSelect={closeMobile} />
                  </AccordionContent>
                </AccordionItem>
              )}
              {catalog.developerLinks.length > 0 && (
                <AccordionItem value='developers'>
                  <AccordionTrigger className='min-h-11 items-center'>
                    {t('Developers')}
                  </AccordionTrigger>
                  <AccordionContent className='[&_a]:no-underline'>
                    <DeveloperMenuContent
                      links={catalog.developerLinks}
                      onSelect={closeMobile}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
            {[catalog.aboutLink, catalog.consoleLink].map(
              (link) =>
                link && (
                  <CatalogNavLink
                    key={link.id}
                    link={link}
                    className='flex min-h-11 items-center text-sm font-medium'
                    onSelect={closeMobile}
                  />
                )
            )}
          </nav>
          {props.showLanguageSwitcher && (
            <div className='border-border flex items-center justify-end border-t px-5 py-2'>
              <LanguageSwitcher />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

export function PlatformNavigation(props: { showLanguageSwitcher?: boolean }) {
  const location = useLocation()
  const catalog = usePlatformCatalog()
  return (
    <PlatformNavigationMenu
      key={location.href}
      pathname={location.pathname}
      catalog={catalog}
      showLanguageSwitcher={props.showLanguageSwitcher !== false}
    />
  )
}
