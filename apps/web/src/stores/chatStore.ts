import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RecentQuery {
  id: string
  title: string
  sql: string
  chart_type: string
  dataset_id: string
  row_count: number
  created_at: string
}

interface ChatStore {
  recentQueries: RecentQuery[]
  addQuery: (q: RecentQuery) => void
  clearQueries: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      recentQueries: [],
      addQuery: (q) =>
        set((state) => ({
          recentQueries: [q, ...state.recentQueries.filter((r) => r.id !== q.id)].slice(0, 20),
        })),
      clearQueries: () => set({ recentQueries: [] }),
    }),
    { name: 'mh-recent-queries' }
  )
)
