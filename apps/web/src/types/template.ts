export interface WidgetPosition {
  row: number
  col: number
  col_span: number
  row_span: number
}

export interface WidgetConfig {
  id: string
  type: string
  title: string
  position: WidgetPosition
  config: Record<string, unknown>
}

export interface TemplateLayout {
  columns: number
  row_height: number
}

export interface TemplateConfigData {
  layout: TemplateLayout
  widgets: WidgetConfig[]
  filters: unknown[]
}

export interface TemplateOut {
  id: string
  name: string
  template_type: string
  assigned_roles: string[]
  tags: string[]
  version: number
  is_published: boolean
  thumbnail_url: string | null
  config: TemplateConfigData
  created_by: string | null
  created_at: string
  updated_at: string
  widget_count: number
}

export interface TemplateDetail extends TemplateOut {
  source_dataset_ids: string[]
}

export interface WidgetLibraryItem {
  id: string
  name: string
  description: string | null
  category: string
  config_schema: Record<string, unknown>
  default_config: Record<string, unknown> | null
  sort_order: number
}

export interface WidgetData {
  columns?: string[]
  rows?: unknown[][]
  row_count?: number
  error?: string
}

export interface RenderResponse {
  template_id: string
  widgets: Record<string, WidgetData>
}

export interface MarketplaceItem {
  id: string
  name: string
  tags: string[]
  version: number
  thumbnail_url: string | null
  widget_count: number
  created_at: string
}
