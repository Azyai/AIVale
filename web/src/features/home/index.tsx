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
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { usePlatformCatalog } from '@/features/platform-catalog'

import { HeroHeading } from './components/sections/hero-heading'
import { PlatformGuide } from './components/sections/platform-guide'
import {
  BusinessHallOverview,
  PlatformPathways,
} from './components/sections/platform-pathways'
import { ProductOverview } from './components/sections/product-overview'

export function Home() {
  const catalog = usePlatformCatalog()
  const workbench = catalog.products.find(
    (product) => product.id === 'workbench'
  )

  return (
    <PublicLayout showMainContainer={false}>
      <main id='main-content' className='relative isolate w-full'>
        <HeroHeading
          showProducts={catalog.showProducts}
          showConsole={Boolean(catalog.consoleLink)}
          products={catalog.products}
        />
        {catalog.showProducts && (
          <ProductOverview products={catalog.products} />
        )}
        <PlatformPathways
          showProducts={catalog.showProducts}
          showBusiness={catalog.showBusiness}
          canOpenWorkbench={Boolean(workbench?.operation)}
        />
        {catalog.showBusiness && <BusinessHallOverview />}
        <PlatformGuide
          documentation={catalog.developerLinks.find(
            (link) => link.id === 'docs'
          )}
        />
      </main>
      <Footer />
    </PublicLayout>
  )
}
