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

import { FAQ, HeroHeading, PricingSection, SellingPoints, ToolsWall } from './components'

/**
 * Marketing landing page (京西智谷), qianwen Token-Plan style: compact hero →
 * selling points → pricing → tools → FAQ. Plan cards are driven live by the
 * public plans API.
 */
export function Home() {
  return (
    <PublicLayout showMainContainer={false}>
      <HeroHeading />
      <SellingPoints />
      <PricingSection />
      <ToolsWall />
      <FAQ />
      <Footer />
    </PublicLayout>
  )
}
