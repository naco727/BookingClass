import { createClient } from '@supabase/supabase-js'

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}
const url = env.VITE_SUPABASE_URL
// Supabase now calls the browser-safe anon key a publishable key.
// Keep the old variable as a fallback for existing deployments.
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && key)
// Supabase may clear the invitation fragment before React mounts.
export const initialAuthUrl = typeof window === 'undefined' ? null : new URL(window.location.href)
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null
