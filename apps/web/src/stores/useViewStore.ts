import { create } from 'zustand'
import type { ChartType } from '../types'

export type ViewState =
  | 'dashboard'
  | 'collapsing'
  | 'loading'
  | 'exploding'
  | 'revealing'
  | 'chat_result'
  | 'returning'

export interface ChatResult {
  query: string
  chartType: ChartType
  columns: string[]
  rows: unknown[][]
  sql: string
  dataset_id: string
  explanation?: string
}

interface ViewStore {
  viewState: ViewState
  pendingQuery: string
  pendingDatasetId: string
  result: ChatResult | null
  error: string | null
  isDashboardFullscreen: boolean

  startTransition(query: string, datasetId: string): void
  setLoading(): void
  setExploding(result: ChatResult): void
  setRevealing(): void
  setChatResult(): void
  reset(): void
  keepResultForChat(): void
  finishReturn(): void
  setError(err: string): void
  setDashboardFullscreen(v: boolean): void
}

export const useViewStore = create<ViewStore>((set) => ({
  viewState:             'dashboard',
  pendingQuery:          '',
  pendingDatasetId:      '',
  result:                null,
  error:                 null,
  isDashboardFullscreen: false,

  startTransition: (query, datasetId) =>
    set({ viewState: 'collapsing', pendingQuery: query, pendingDatasetId: datasetId, result: null, error: null }),

  setLoading:    () => set({ viewState: 'loading' }),
  setExploding:  (result) => set({ viewState: 'exploding', result }),
  setRevealing:  () => set({ viewState: 'revealing' }),
  setChatResult:     () => set({ viewState: 'chat_result' }),
  setError:          (err) => set({ viewState: 'dashboard', error: err }),
  reset:             () => set({ viewState: 'returning', pendingQuery: '', pendingDatasetId: '', result: null, error: null }),
  keepResultForChat: () => set({ viewState: 'returning' }),   // keep result, let ChatPage consume it
  finishReturn:      () => set({ viewState: 'dashboard' }),
  setDashboardFullscreen: (v) => set({ isDashboardFullscreen: v }),
}))
