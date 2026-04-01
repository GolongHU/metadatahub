export interface User {
  user_id: string
  name: string
  email: string
  role: string
  region: string | null
  partner_id: string | null
}

export interface Dataset {
  id: string
  name: string
  source_type: string
  row_count: number
  column_count: number
  created_at: string
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  null_ratio: number
  distinct_count: number
  sample_values: unknown[]
  min_value?: unknown
  max_value?: unknown
  description: string
}

export interface DatasetDetail {
  id: string
  name: string
  source_type: string
  row_count: number
  schema_info: {
    columns: ColumnInfo[]
    row_count: number
  }
  created_at: string
}

export interface QueryData {
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
}

export interface AskResponse {
  sql: string
  explanation: string
  chart_type: 'bar' | 'line' | 'pie' | 'table'
  data: QueryData
  dataset_id: string
  scope_desc?: string
  debug_sql?: string
}

// ── Admin types ───────────────────────────────────────────────────────────────

export interface UserListItem {
  id: string
  name: string
  email: string
  role: string
  region: string | null
  partner_id: string | null
  department: string | null
  is_active: boolean
  created_at: string
}

export interface UserListResponse {
  items: UserListItem[]
  total: number
  page: number
  page_size: number
}

export interface CreateUserRequest {
  name: string
  email: string
  password: string
  role: string
  region?: string
  partner_id?: string
  department?: string
}

export interface UpdateUserRequest {
  name?: string
  role?: string
  region?: string
  partner_id?: string
  department?: string
  is_active?: boolean
}

export interface DatasetAccessItem {
  id: string
  dataset_id: string
  grantee_type: 'role' | 'user'
  grantee_id: string
  access_level: string
  created_at: string
}

export interface CreateAccessRequest {
  grantee_type: 'role' | 'user'
  grantee_id: string
  access_level?: string
}

export interface CreateRlsRuleRequest {
  name: string
  field: string
  condition_type: string
  operator: string
  value_source: string
  description?: string
  applies_to_roles?: string[]
  exempt_roles?: string[]
}

export interface RlsRuleItem {
  id: string
  dataset_id: string
  name: string
  field: string
  condition_type: string
  operator: string
  value_source: string
  applies_to_roles: string[] | null
  exempt_roles: string[] | null
  is_active: boolean
  created_at: string
}

export type ChartType = 'bar' | 'bar_horizontal' | 'line' | 'pie' | 'table'

// ── Platform config types ─────────────────────────────────────────────────────

export interface PublicBranding {
  platform_name: string
  logo_light_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string
  login_tagline: string
}

export interface ModelInfo {
  id: string
  name: string
  context_window: number
}

export interface AIProviderOut {
  id: string
  name: string
  provider_type: string
  base_url: string
  api_key_masked: string
  models: ModelInfo[]
  is_active: boolean
  sort_order: number
}

export interface AIProviderCreate {
  name: string
  provider_type: string
  base_url: string
  api_key: string
  models: ModelInfo[]
  sort_order?: number
}

export interface AIProviderUpdate {
  name?: string
  provider_type?: string
  base_url?: string
  api_key?: string
  models?: ModelInfo[]
  is_active?: boolean
  sort_order?: number
}

export interface ProviderTestResponse {
  success: boolean
  latency_ms: number
  response: string | null
  error: string | null
}

export interface TaskRoutingItem {
  task_type: string
  primary_provider_id: string | null
  primary_model: string
  fallback_provider_id: string | null
  fallback_model: string | null
  temperature: number
  max_tokens: number
  is_active: boolean
}

export interface TaskRoutingOut extends TaskRoutingItem {
  id: string
  primary_provider_name: string | null
  fallback_provider_name: string | null
}

// ── Dashboard types ───────────────────────────────────────────────────────────

export interface DashboardListItem {
  id: string
  name: string
  dataset_id: string | null
  dataset_name: string
  dashboard_type: 'fixed' | 'auto' | 'personal'
  is_pinned: boolean
  widget_count: number
  updated_at: string
}

export interface DashboardWidget {
  id: string
  type: 'kpi' | 'chart'
  chart_type?: ChartType
  title: string
  position: { row: number; col: number; width: number; height: number }
  query: string
  format?: 'number' | 'currency'
}

export interface DashboardFilter {
  id: string
  type: string
  field: string
  label: string
  options: string
}

export interface DashboardConfig {
  title: string
  dataset_id: string
  table_name: string
  filters: DashboardFilter[]
  widgets: DashboardWidget[]
}

export interface DashboardDetail {
  id: string
  name: string
  dataset_id: string | null
  config: DashboardConfig
  dashboard_type: 'fixed' | 'auto' | 'personal'
  owner_id: string | null
  is_pinned: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface SaveToDashboardRequest {
  dashboard_id?: string
  new_dashboard_name?: string
  dataset_id: string
  title: string
  sql: string
  chart_type: string
  explanation?: string
}

export interface SaveToDashboardResponse {
  dashboard_id: string
  widget_id: string
  dashboard_name: string
}

export interface WidgetResult {
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
  error?: string
}

export interface DashboardQueryResponse {
  widgets: Record<string, WidgetResult>
}

export interface PreviewRequest {
  dataset_id: string
  sql: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  // assistant-only fields
  sql?: string
  explanation?: string
  chart_type?: ChartType
  data?: QueryData
  dataset_id?: string
  loading?: boolean
  error?: string
}

// ── Conversation history ───────────────────────────────────────────────────

export interface ConversationListItem {
  id: string
  dataset_id: string | null
  title: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  query_sql: string | null
  chart_type: string | null
  data: QueryData | null
  created_at: string
}

export interface ConversationDetail {
  id: string
  dataset_id: string | null
  title: string
  messages: ConversationMessage[]
  created_at: string
  updated_at: string
}
