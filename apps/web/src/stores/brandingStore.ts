import { create } from 'zustand'
import axios from 'axios'
import type { PublicBranding } from '../types'
import { applyColorRamp } from '../utils/colorUtils'

interface BrandingStore {
  platformName: string
  logoLightUrl: string | null
  logoDarkUrl: string | null
  faviconUrl: string | null
  primaryColor: string
  loginTagline: string
  loaded: boolean
  load: () => Promise<void>
  apply: (data: Partial<PublicBranding>) => void
}

export const useBrandingStore = create<BrandingStore>((set, get) => ({
  platformName: 'MetadataHub',
  logoLightUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  primaryColor: '#6C5CE7',
  loginTagline: 'AI 驱动的数据分析平台',
  loaded: false,

  load: async () => {
    try {
      const res = await axios.get<PublicBranding>('/api/v1/config/branding/public', {
        withCredentials: false,
      })
      get().apply(res.data)
    } catch {
      // Non-fatal — keep defaults
    } finally {
      set({ loaded: true })
    }
  },

  apply: (data) => {
    set({
      platformName:  data.platform_name  ?? get().platformName,
      logoLightUrl:  data.logo_light_url  !== undefined ? data.logo_light_url  : get().logoLightUrl,
      logoDarkUrl:   data.logo_dark_url   !== undefined ? data.logo_dark_url   : get().logoDarkUrl,
      faviconUrl:    data.favicon_url     !== undefined ? data.favicon_url     : get().faviconUrl,
      primaryColor:  data.primary_color  ?? get().primaryColor,
      loginTagline:  data.login_tagline  ?? get().loginTagline,
    })

    // Update DOM
    if (data.platform_name) document.title = data.platform_name
    if (data.primary_color) applyColorRamp(data.primary_color)
    if (data.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = data.favicon_url
    }
  },
}))
