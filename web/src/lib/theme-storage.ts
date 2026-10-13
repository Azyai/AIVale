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
export const THEME_STORAGE_KEYS = {
  // Personal light/dark choice (theme switch + command menu). Kept on v1 so
  // existing preferences survive the site-default rollout.
  mode: 'newapi:theme:v1:mode',
  // Personalization axes bumped to v2 when the theme settings drawer was
  // removed: v1 entries were personal picks made in the removed drawer, and
  // the admin-configured site defaults should now win for everyone.
  preset: 'newapi:theme:v2:preset',
  font: 'newapi:theme:v2:font',
  radius: 'newapi:theme:v2:radius',
  scale: 'newapi:theme:v2:scale',
  contentLayout: 'newapi:theme:v2:content-layout',
} as const

/**
 * Whether a personal preference exists for `key`. Providers use this to know
 * when a freshly loaded site default (from /api/status) may replace the
 * boot-time fallback: personal preference wins, otherwise the site default is
 * followed live.
 */
export function hasThemePreference(key: string): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(key) !== null
  } catch {
    // Unreadable storage behaves like no preference (readThemePreference
    // also falls back), so let the site default through.
    return false
  }
}

export function readThemePreference<T extends string>(
  key: string,
  allowed: ReadonlySet<T>,
  fallback: T
): T {
  if (typeof window === 'undefined') return fallback

  try {
    // Legacy cookies are shared across ports, so importing them would restore
    // preferences that may belong to another local instance.
    const value = window.localStorage.getItem(key)
    return value && allowed.has(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

export function writeThemePreference(key: string, value: string | null): void {
  if (typeof window === 'undefined') return

  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // Keep theme controls usable when storage is blocked or full.
  }
}
