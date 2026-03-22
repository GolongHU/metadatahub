import { create } from 'zustand'
import type { User } from '../types'

interface AuthState {
  accessToken: string | null
  user: User | null
  expiresAt: number | null // epoch ms

  setAuth: (token: string, user: User, expiresIn: number) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  expiresAt: null,

  setAuth: (token, user, expiresIn) =>
    set({
      accessToken: token,
      user,
      expiresAt: Date.now() + expiresIn * 1000,
    }),

  logout: () => set({ accessToken: null, user: null, expiresAt: null }),

  isAuthenticated: () => {
    const { accessToken, expiresAt } = get()
    return !!accessToken && !!expiresAt && Date.now() < expiresAt
  },
}))
