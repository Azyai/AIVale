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
import { create } from 'zustand'

/** Maximum number of models that can be compared side by side. */
export const MAX_COMPARE_MODELS = 4

type CompareState = {
  selected: string[]
  /** Toggle a model by name; returns false when the limit blocked the add. */
  toggle: (modelName: string) => boolean
  remove: (modelName: string) => void
  clear: () => void
}

export const useCompareStore = create<CompareState>()((set, get) => ({
  selected: [],
  toggle: (modelName) => {
    const { selected } = get()
    if (selected.includes(modelName)) {
      set({ selected: selected.filter((name) => name !== modelName) })
      return true
    }
    if (selected.length >= MAX_COMPARE_MODELS) {
      return false
    }
    set({ selected: [...selected, modelName] })
    return true
  },
  remove: (modelName) =>
    set((state) => ({
      selected: state.selected.filter((name) => name !== modelName),
    })),
  clear: () => set({ selected: [] }),
}))
