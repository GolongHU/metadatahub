import api from './api'
import type { AdminDashboardData, RegionDashboardData, ManagerDashboardData, SelfDashboardData, PartnerDetailData, PartnerListItem, PartnerProfileData } from '../types/partner'

export const partnerApi = {
  getAdminDashboard:  () => api.get<AdminDashboardData>('/partner/dashboard/admin'),
  getRegionDashboard: () => api.get<RegionDashboardData>('/partner/dashboard/region'),
  getManagerDashboard:() => api.get<ManagerDashboardData>('/partner/dashboard/manager'),
  getSelfDashboard:   () => api.get<SelfDashboardData>('/partner/dashboard/self'),
  getPartnerDetail:   (id: string) => api.get<PartnerDetailData>(`/partner/${id}/detail`),
  searchPartners:     (q: string, limit = 20) => api.get<PartnerListItem[]>(`/partners?q=${encodeURIComponent(q)}&limit=${limit}`),
  getPartnerProfile:  (id: string) => api.get<PartnerProfileData>(`/partner/${id}/profile`),
}
