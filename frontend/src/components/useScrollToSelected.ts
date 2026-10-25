import { useEffect } from 'react'
import type { Selection } from '../types'

/** When an item is picked on the map or calendar, scroll its row (id `prefix-<id>`) into view. */
export function useScrollToSelected(selection: Selection | null, prefix: string) {
  useEffect(() => {
    if (!selection || selection.source === 'list') return
    document
      .getElementById(`${prefix}-${selection.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selection, prefix])
}
