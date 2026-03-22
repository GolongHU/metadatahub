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

// ── Dashboard types ───────────────────────────────────────────────────────────

export interface DashboardListItem {
  id: string
  name: string
  dataset_id: string
  is_default: boolean
  created_at: string
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
  dataset_id: string
  config: DashboardConfig
  is_default: boolean
  created_at: string
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  // assistant-only fields
  sql?: string
  explanation?: string
  chart_type?: ChartType
  data?: QueryData
  loading?: boolean
  error?: string
}
