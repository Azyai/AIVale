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
import type { ProductDefinition } from '@/features/platform-catalog'

export const PRODUCT_SCOPE = {
  aitoken: [
    {
      titleKey: 'Model API access',
      descriptionKey:
        'Use a single gateway address to connect supported models. Keep keys, usage, and charges in the existing console.',
    },
    {
      titleKey: 'Usage and plans',
      descriptionKey:
        'Compare the plans configured for this site and use the existing wallet and subscription flows.',
    },
  ],
  'model-library': [
    {
      titleKey: 'Compare available models',
      descriptionKey:
        'Browse model capabilities and pricing in the Model Square. The site settings determine whether sign-in is required.',
    },
    {
      titleKey: 'Use a model',
      descriptionKey:
        'Choose a model and use your API key to send requests through AIToken.',
    },
  ],
  workbench: [
    {
      titleKey: 'Workspace management',
      descriptionKey:
        'Manage personal or team workspaces, members, and key permissions where your account has access.',
    },
    {
      titleKey: 'Execution under development',
      descriptionKey:
        'The workbench demo illustrates the experience. It does not create workspaces or run real agent tasks.',
    },
  ],
  'agent-scheduling': [
    {
      titleKey: 'Planned run management',
      descriptionKey:
        'The planned service will track runs and their outcomes, with schedules, triggers, and approvals introduced in phases.',
    },
    {
      titleKey: 'Current availability',
      descriptionKey:
        'Agent execution is not open to customers yet. Workspace management remains a separate capability.',
    },
  ],
  datasets: [
    {
      titleKey: 'Planned dataset management',
      descriptionKey:
        'The planned service will organize dataset versions and files for retrieval and evaluation.',
    },
    {
      titleKey: 'Concept preview only',
      descriptionKey:
        'The dataset preview uses examples. Uploads, processing, and training are not available there.',
    },
  ],
} as const satisfies Record<
  ProductDefinition['id'],
  readonly { titleKey: string; descriptionKey: string }[]
>

export const OPERATION_STATUS_KEYS = {
  available: 'Available',
  disabled: 'This entry is disabled on this site.',
  checking: 'Checking whether this entry is available…',
  unavailable: 'Availability could not be confirmed. Try again later.',
} as const
