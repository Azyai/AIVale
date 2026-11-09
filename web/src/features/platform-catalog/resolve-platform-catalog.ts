/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { isAgentPlatformAvailable } from '@/features/agent-platform/queries'
import { isHttpUrl } from '@/lib/content-format'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'

import { PRODUCTS, type ProductDefinition } from './registry'

export type CatalogLink = {
  id: string
  href: string
  hash?: string
  titleKey: string
  external?: boolean
  requiresAuth?: boolean
}

type OperationState =
  | { operationStatus: 'available'; operation: CatalogLink }
  | {
      operationStatus: 'planned' | 'disabled' | 'checking' | 'unavailable'
      operation: null
    }

export type CatalogProduct = ProductDefinition & OperationState

export type PlatformCatalog = {
  products: CatalogProduct[]
  developerLinks: CatalogLink[]
  consoleLink: CatalogLink | null
  homeLink: CatalogLink | null
  aboutLink: CatalogLink | null
  showProducts: boolean
  showBusiness: boolean
}

type AgentCapabilitySnapshot = Parameters<
  typeof isAgentPlatformAvailable
>[0] & {
  isError: boolean
}

export function resolvePlatformCatalog(
  status: Record<string, unknown> | null,
  authenticated: boolean,
  agent: AgentCapabilitySnapshot
): PlatformCatalog {
  const modules = parseHeaderNavModulesFromStatus(status)
  const products = PRODUCTS.map<CatalogProduct>((product) => {
    switch (product.id) {
      case 'aitoken':
        if (!modules.console) {
          return { ...product, operationStatus: 'disabled', operation: null }
        }
        return {
          ...product,
          operationStatus: 'available',
          operation: {
            id: 'keys',
            href: '/keys',
            titleKey: 'Manage API keys',
            requiresAuth: !authenticated,
          },
        }
      case 'model-library':
        if (!modules.pricing.enabled) {
          return { ...product, operationStatus: 'disabled', operation: null }
        }
        return {
          ...product,
          operationStatus: 'available',
          operation: {
            id: 'pricing',
            href: '/pricing',
            titleKey: 'View models',
            requiresAuth: modules.pricing.requireAuth && !authenticated,
          },
        }
      case 'workbench':
        if (agent.isError || agent.fetchStatus === 'paused') {
          return { ...product, operationStatus: 'unavailable', operation: null }
        }
        if (!agent.isFetchedAfterMount || !agent.isSuccess) {
          return { ...product, operationStatus: 'checking', operation: null }
        }
        // Runtime readiness is not required for workspace management.
        if (!isAgentPlatformAvailable(agent)) {
          return { ...product, operationStatus: 'disabled', operation: null }
        }
        return {
          ...product,
          operationStatus: 'available',
          operation: {
            id: 'agent-platform',
            href: '/agent-platform',
            titleKey: 'Open workbench',
            requiresAuth: !authenticated,
          },
        }
      case 'agent-scheduling':
      case 'datasets':
        return { ...product, operationStatus: 'planned', operation: null }
    }
  })

  const developerLinks: CatalogLink[] = []
  if (modules.docs) {
    const configuredDocs =
      typeof status?.docs_link === 'string' ? status.docs_link.trim() : ''
    const relativeDocs = /^\/(?![\\/])[^\\\s]*$/.test(configuredDocs)
    const absoluteDocs =
      /^https?:\/\//i.test(configuredDocs) && isHttpUrl(configuredDocs)
    const hasConfiguredDocs = absoluteDocs || relativeDocs
    if (hasConfiguredDocs) {
      // Keep configured documentation independent of the SPA router.
      developerLinks.push({
        id: 'docs',
        href: configuredDocs,
        titleKey: 'Docs',
        external: true,
      })
    }
    // The first-party guide also supplies a destination when docs_link is unset.
    developerLinks.push({
      id: hasConfiguredDocs ? 'api-guide' : 'docs',
      href: '/products/aitoken',
      hash: 'api-access',
      titleKey: 'API access guide',
    })
  }
  if (modules.rankings.enabled) {
    developerLinks.push({
      id: 'rankings',
      href: '/rankings',
      titleKey: 'Rankings',
      requiresAuth: modules.rankings.requireAuth && !authenticated,
    })
  }

  return {
    products,
    developerLinks,
    consoleLink: modules.console
      ? { id: 'console', href: '/dashboard', titleKey: 'Console' }
      : null,
    homeLink: modules.home ? { id: 'home', href: '/', titleKey: 'Home' } : null,
    aboutLink: modules.about
      ? { id: 'about', href: '/about', titleKey: 'About' }
      : null,
    showProducts: modules.products !== false,
    showBusiness: modules.business !== false,
  }
}
