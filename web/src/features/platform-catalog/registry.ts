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
export const PRODUCT_GROUPS = [
  { id: 'models', titleKey: 'Model services' },
  { id: 'agents', titleKey: 'Agent platform' },
  { id: 'data', titleKey: 'Data and knowledge' },
] as const

export type ProductGroupId = (typeof PRODUCT_GROUPS)[number]['id']
export type ProductId =
  | 'aitoken'
  | 'model-library'
  | 'workbench'
  | 'agent-scheduling'
  | 'datasets'

export type ReleaseStage = 'available' | 'limited' | 'planned'

export const RELEASE_STAGE_LABEL_KEYS: Record<ReleaseStage, string> = {
  available: 'Available',
  limited: 'Limited availability',
  planned: 'Planned',
}

export type ProductDefinition = {
  readonly id: ProductId
  readonly group: ProductGroupId
  readonly titleKey: string
  readonly descriptionKey: string
  readonly overviewHref: `/products/${ProductId}`
  readonly releaseStage: ReleaseStage
  readonly aliases: readonly string[]
}

export const PRODUCTS: readonly ProductDefinition[] = [
  {
    id: 'aitoken',
    group: 'models',
    titleKey: 'AIToken',
    descriptionKey: 'Connect to model APIs and manage keys, usage, and costs.',
    overviewHref: '/products/aitoken',
    releaseStage: 'available',
    aliases: ['Token', 'API gateway', '模型网关', '模型閘道'],
  },
  {
    id: 'model-library',
    group: 'models',
    titleKey: 'Model library',
    descriptionKey: 'Compare available models, capabilities, and pricing.',
    overviewHref: '/products/model-library',
    releaseStage: 'available',
    aliases: ['Model Square', '模型库', '模型庫', '模型广场', '模型廣場'],
  },
  {
    id: 'workbench',
    group: 'agents',
    titleKey: 'Agent workbench',
    descriptionKey: 'Manage workspaces, members, and agent access.',
    overviewHref: '/products/workbench',
    releaseStage: 'limited',
    aliases: ['Workspace', '智能体工作台', '智慧體工作台', '工作区', '工作區'],
  },
  {
    id: 'agent-scheduling',
    group: 'agents',
    titleKey: 'Agent scheduling',
    descriptionKey:
      'Plan task triggers and manage agent runs when scheduling opens.',
    overviewHref: '/products/agent-scheduling',
    releaseStage: 'planned',
    aliases: [
      'Agent execution',
      'Agent 智能调度',
      'Agent 智能調度',
      '任务调度',
      '任務調度',
    ],
  },
  {
    id: 'datasets',
    group: 'data',
    titleKey: 'Datasets',
    descriptionKey:
      'Organize data for retrieval and evaluation in a future release.',
    overviewHref: '/products/datasets',
    releaseStage: 'planned',
    aliases: ['Dataset Center', '数据集', '資料集'],
  },
]

export const BUSINESS_AREAS = [
  {
    id: 'tasks',
    titleKey: 'Task center',
    descriptionKey: 'Follow requests, runs, and delivery.',
    releaseStage: 'planned',
  },
  {
    id: 'dispatch',
    titleKey: 'Dispatch console',
    descriptionKey: 'Set up triggers and track scheduling history.',
    releaseStage: 'planned',
  },
  {
    id: 'approvals',
    titleKey: 'Approval center',
    descriptionKey: 'Review actions that require approval.',
    releaseStage: 'planned',
  },
  {
    id: 'bounties',
    titleKey: 'Team request board',
    descriptionKey: 'Publish and take on requests within a workspace.',
    releaseStage: 'planned',
  },
] as const
