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

import {
  Achievements,
  FAQ,
  HeroHeading,
  PlatformArchitecture,
  PricingSection,
  Roadmap,
  SellingPoints,
  ToolsWall,
  TokenFlowTheater,
} from './components'

/**
 * Marketing landing page, keynote (index3) bloodline: deep-space hero with
 * orbiting model chips → selling points → architecture → token-flow theater
 * → pricing → achievements → tools → roadmap → FAQ. Pricing cards stay
 * driven live by the public plans API.
 */
export function Home() {
  return (
    <PublicLayout showMainContainer={false}>
      <HeroHeading />
      <SellingPoints />
      <PlatformArchitecture />
      <TokenFlowTheater />
      <PricingSection />
      <Achievements />
      <ToolsWall />
      <Roadmap />
      <FAQ />
      <Footer />
    </PublicLayout>
  )
}
