export interface KPISummary { total_revenue: number; avg_score: number; active_partners: number; risk_partners: number; observation_partners: number; collection_rate: number; partner_count?: number }
export interface TierCount { tier: string; count: number; pct: number }
export interface RegionComparison { region: string; avg_score: number; partner_count: number; total_revenue: number }
export interface MonthlyPoint { period: string; avg_score: number; by_region: Record<string, number> }
export interface RiskAlert { partner_id: string; partner_name: string; region: string; tier: string; score: number; manager_name?: string }
export interface PartnerRankRow { rank: number; partner_id: string; name: string; region: string; manager_name?: string; performance: number; growth: number; engagement: number; health: number; activity: number; total_score: number; tier: string; tier_change: string }
export interface AdminDashboardData { kpis: KPISummary; tier_distribution: TierCount[]; region_comparison: RegionComparison[]; monthly_trend: MonthlyPoint[]; risk_alerts: RiskAlert[]; partner_rankings: PartnerRankRow[]; radar_global: Record<string, number> }
export interface ActionItem { partner_name: string; dimension: string; message: string; severity: string }
export interface ManagerComparison { manager_name: string; partner_count: number; avg_score: number; total_revenue: number }
export interface RegionDashboardData { kpis: KPISummary; global_avg_score: number; region_rank: number; tier_distribution: TierCount[]; manager_comparison: ManagerComparison[]; radar_region: Record<string, number>; radar_global: Record<string, number>; action_items: ActionItem[]; partner_rankings: PartnerRankRow[]; monthly_trend: MonthlyPoint[] }
export interface PartnerHealthCard { partner_id: string; name: string; tier: string; total_score: number; performance: number; growth: number; engagement: number; health: number; activity: number; key_metrics: any[]; alerts: string[]; dimensions?: DimDetail[] }
export interface ManagerDashboardData { partners: PartnerHealthCard[]; manager_name: string; region: string }
export interface DimDetail { dimension: string; dim_label: string; score: number; global_avg: number; percentile: number; change: number; metrics: any[] }
export interface ImprovementSuggestion { icon: string; title: string; current_value: string; target_value: string; expected_gain: string }
export interface SelfDashboardData { partner_id: string; partner_name: string; region: string; manager_name?: string; tier: string; total_score: number; next_tier?: string; score_to_next?: number; progress_pct: number; global_rank: number; total_partners: number; radar_self: Record<string, number>; radar_global: Record<string, number>; dimensions: DimDetail[]; monthly_trend: any[]; suggestions: ImprovementSuggestion[] }
export interface MetricRow { key: string; name: string; value: number; unit: string; trend: string; change_pct: number }
export interface DimSection { dimension: string; dim_label: string; score: number; metrics: MetricRow[] }
export interface PartnerDetailData { partner_id: string; partner_name: string; region: string; manager_name?: string; tier: string; total_score: number; score_change: number; radar: Record<string, number>; dimensions: DimSection[]; monthly_trend: any[] }

export type DimScore = DimDetail
