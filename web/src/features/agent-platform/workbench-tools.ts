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
import { Bot, LibraryBig, Plug } from 'lucide-react'

export const workbenchTools = [
  {
    id: 'agents',
    title: 'Agent builder',
    description: 'Configure models, instructions, and tools for an agent.',
    icon: Bot,
  },
  {
    id: 'skills',
    title: 'Skill library',
    description: 'Reuse and version skills across agents.',
    icon: LibraryBig,
  },
  {
    id: 'mcp',
    title: 'MCP connections',
    description: 'Connect agents to tools and data sources.',
    icon: Plug,
  },
] as const
