import api from './api'
import type { MarketplaceItem, RenderResponse, TemplateDetail, TemplateOut, WidgetLibraryItem } from '../types/template'

export interface TemplateCreateBody {
  name: string
  dataset_ids?: string[]
  config: Record<string, unknown>
  assigned_roles?: string[]
  tags?: string[]
  template_type?: string
}

export interface TemplateUpdateBody {
  name?: string
  config?: Record<string, unknown>
  assigned_roles?: string[]
  tags?: string[]
  is_published?: boolean
}

export const templateApi = {
  list: () => api.get<TemplateOut[]>('/admin/templates'),
  get: (id: string) => api.get<TemplateDetail>(`/admin/templates/${id}`),
  create: (body: TemplateCreateBody) => api.post<TemplateDetail>('/admin/templates', body),
  update: (id: string, body: TemplateUpdateBody) => api.put<TemplateDetail>(`/admin/templates/${id}`, body),
  delete: (id: string) => api.delete(`/admin/templates/${id}`),
  clone: (id: string, body: { new_name: string; assigned_roles?: string[] }) =>
    api.post<TemplateDetail>(`/admin/templates/${id}/clone`, body),
  publish: (id: string) => api.post<TemplateDetail>(`/admin/templates/${id}/publish`),

  marketplace: () => api.get<MarketplaceItem[]>('/templates/marketplace'),
  importFromMarketplace: (id: string) => api.post<TemplateDetail>(`/templates/marketplace/${id}/import`),

  render: (id: string, filters: Record<string, unknown> = {}) =>
    api.post<RenderResponse>(`/templates/${id}/render`, { filters }),

  widgetLibrary: () => api.get<WidgetLibraryItem[]>('/widget-library'),

  generateWidgetSql: (body: { description: string; widget_type: string; current_sql?: string }) =>
    api.post<{ sql: string }>('/ai/generate-widget-sql', body),
}
