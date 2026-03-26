import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/authStore'

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // send httpOnly refresh cookie
})

// ── Request interceptor: attach Bearer token ──────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: 401 → try refresh → retry once ─────────────────────
let refreshing = false
let waitQueue: Array<(token: string | null) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true

    if (refreshing) {
      // Queue this request until refresh resolves
      return new Promise((resolve, reject) => {
        waitQueue.push((token) => {
          if (token) {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          } else {
            reject(error)
          }
        })
      })
    }

    refreshing = true

    try {
      const res = await axios.post<{ access_token: string; expires_in: number }>(
        '/api/v1/auth/refresh',
        {},
        { withCredentials: true }
      )
      const { access_token, expires_in } = res.data
      const { user, setAuth } = useAuthStore.getState()
      if (user) setAuth(access_token, user, expires_in)

      waitQueue.forEach((cb) => cb(access_token))
      waitQueue = []

      original.headers.Authorization = `Bearer ${access_token}`
      return api(original)
    } catch {
      waitQueue.forEach((cb) => cb(null))
      waitQueue = []
      useAuthStore.getState().logout()
      window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      refreshing = false
    }
  }
)

// ── Typed endpoint helpers ────────────────────────────────────────────────────
import type {
  AIProviderCreate,
  AIProviderOut,
  AIProviderUpdate,
  AskResponse,
  CreateAccessRequest,
  CreateRlsRuleRequest,
  CreateUserRequest,
  DashboardConfig,
  DashboardDetail,
  DashboardListItem,
  DashboardQueryResponse,
  Dataset,
  DatasetAccessItem,
  DatasetDetail,
  PreviewRequest,
  ProviderTestResponse,
  PublicBranding,
  QueryData,
  RlsRuleItem,
  SaveToDashboardRequest,
  SaveToDashboardResponse,
  TaskRoutingItem,
  TaskRoutingOut,
  UpdateUserRequest,
  UserListItem,
  UserListResponse,
} from '../types'

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; expires_in: number }>('/auth/login', { email, password }),
  me: () => api.get<{ user_id: string; name: string; email: string; role: string; region: string | null; partner_id: string | null }>('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

export const configApi = {
  getPublicBranding: () =>
    axios.get<PublicBranding>('/api/v1/config/branding/public', { withCredentials: false }),
  getBranding: () => api.get<Record<string, string>>('/admin/config/branding'),
  updateBranding: (data: Record<string, string | null>) =>
    api.put<Record<string, string>>('/admin/config/branding', data),
  uploadLogo: (type: 'light' | 'dark', file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ url: string }>(`/admin/config/branding/logo?type=${type}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  uploadFavicon: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ url: string }>('/admin/config/branding/favicon', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteLogo: (type: 'light' | 'dark') =>
    api.delete(`/admin/config/branding/logo?type=${type}`),
  deleteFavicon: () =>
    api.delete('/admin/config/branding/favicon'),
}

export const aiAdminApi = {
  listProviders: () => api.get<AIProviderOut[]>('/admin/ai/providers'),
  createProvider: (data: AIProviderCreate) => api.post<AIProviderOut>('/admin/ai/providers', data),
  updateProvider: (id: string, data: AIProviderUpdate) =>
    api.put<AIProviderOut>(`/admin/ai/providers/${id}`, data),
  deleteProvider: (id: string) => api.delete(`/admin/ai/providers/${id}`),
  testProvider: (id: string, prompt?: string) =>
    api.post<ProviderTestResponse>(`/admin/ai/providers/${id}/test`, { prompt: prompt ?? '请回复 OK' }),
  getTaskRouting: () => api.get<TaskRoutingOut[]>('/admin/ai/task-routing'),
  updateTaskRouting: (data: TaskRoutingItem[]) =>
    api.put<TaskRoutingOut[]>('/admin/ai/task-routing', data),
}

export const datasetsApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<DatasetDetail>('/datasets/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  list: () => api.get<Dataset[]>('/datasets'),
  get: (id: string) => api.get<DatasetDetail>(`/datasets/${id}`),
  preview: (id: string, limit = 20) => api.get(`/datasets/${id}/preview?limit=${limit}`),
  fieldValues: (id: string, field: string) =>
    api.get<string[]>(`/datasets/${id}/field-values?field=${encodeURIComponent(field)}`),
}

export const queryApi = {
  ask: (question: string, dataset_id: string) =>
    api.post<AskResponse>('/query/ask', { question, dataset_id }),
  preview: (data: PreviewRequest) =>
    api.post<QueryData>('/query/preview', data),
  saveToDashboard: (data: SaveToDashboardRequest) =>
    api.post<SaveToDashboardResponse>('/query/save-to-dashboard', data),
}

export const dashboardApi = {
  list: () => api.get<DashboardListItem[]>('/dashboards'),
  get: (id: string) => api.get<DashboardDetail>(`/dashboards/${id}`),
  query: (id: string, filters?: Record<string, string>) =>
    api.post<DashboardQueryResponse>(`/dashboards/${id}/query`, { filters }),
  autoGenerate: (dataset_id: string) =>
    api.post<DashboardDetail>('/dashboards/auto-generate', { dataset_id }),
  create: (data: { name: string; dataset_id: string; config?: Partial<DashboardConfig> }) =>
    api.post<DashboardDetail>('/dashboards', data),
  update: (id: string, data: { name?: string; config?: Partial<DashboardConfig>; is_pinned?: boolean }) =>
    api.put<DashboardDetail>(`/dashboards/${id}`, data),
  deleteDashboard: (id: string) => api.delete(`/dashboards/${id}`),
  addWidget: (id: string, widget: { type: string; chart_type?: string; title: string; query: string }) =>
    api.post(`/dashboards/${id}/widgets`, widget),
  removeWidget: (id: string, widgetId: string) =>
    api.delete(`/dashboards/${id}/widgets/${widgetId}`),
  importTemplate: (body: { template_id: string; dataset_id?: string; name?: string }) =>
    api.post<{ id: string; name: string; message: string }>('/dashboards/import-template', body),
}

export const adminApi = {
  // Users
  listUsers: (page = 1, pageSize = 50) =>
    api.get<UserListResponse>(`/admin/users?page=${page}&page_size=${pageSize}`),
  createUser: (data: CreateUserRequest) =>
    api.post<UserListItem>('/admin/users', data),
  updateUser: (id: string, data: UpdateUserRequest) =>
    api.put<UserListItem>(`/admin/users/${id}`, data),

  // Dataset access
  listAccess: (datasetId: string) =>
    api.get<DatasetAccessItem[]>(`/admin/datasets/${datasetId}/access`),
  createAccess: (datasetId: string, data: CreateAccessRequest) =>
    api.post<DatasetAccessItem>(`/admin/datasets/${datasetId}/access`, data),
  deleteAccess: (datasetId: string, accessId: string) =>
    api.delete(`/admin/datasets/${datasetId}/access/${accessId}`),

  // RLS rules
  listRlsRules: (datasetId: string) =>
    api.get<RlsRuleItem[]>(`/admin/datasets/${datasetId}/rls-rules`),
  createRlsRule: (datasetId: string, data: CreateRlsRuleRequest) =>
    api.post<RlsRuleItem>(`/admin/datasets/${datasetId}/rls-rules`, data),
  deleteRlsRule: (ruleId: string) =>
    api.delete(`/admin/rls-rules/${ruleId}`),
}

export default api
