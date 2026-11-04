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
import { defaultParseSearch } from '@tanstack/react-router'

/** Keep the workbench's literal name filter before the router rewrites the URL. */
export function parseAppSearch(searchString: string): Record<string, unknown> {
  const search: Record<string, unknown> = defaultParseSearch(searchString)
  if (Object.hasOwn(search, 'q') && typeof search.q !== 'string') {
    const values = new URLSearchParams(searchString).getAll('q')
    if (values.length === 1) search.q = values[0]
  }
  return search
}
