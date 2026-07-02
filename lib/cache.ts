/**
 * Cache sederhana in-memory untuk hasil analisis AI.
 * Data disimpan di server memory — semua user baca dari sini.
 * Hanya Admin/Analyst yang bisa memperbarui cache.
 *
 * TTL default: 3 jam (10800 detik)
 */

const CACHE_TTL_MS = 3 * 60 * 60 * 1000 // 3 jam

type CacheEntry<T> = {
  data        : T
  cached_at   : number   // timestamp ms
  cached_by   : string   // username yang trigger refresh
  expires_at  : number   // timestamp ms
}

// Store global (reset saat cold start / redeploy)
const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expires_at) {
    // Expired — jangan hapus, biarkan data lama masih bisa dibaca
    // (tandai dengan flag expired)
    return { ...entry, _expired: true } as any
  }
  return entry
}

export function cacheSet<T>(key: string, data: T, cachedBy: string): CacheEntry<T> {
  const now = Date.now()
  const entry: CacheEntry<T> = {
    data,
    cached_at  : now,
    cached_by  : cachedBy,
    expires_at : now + CACHE_TTL_MS,
  }
  store.set(key, entry)
  return entry
}

export function cacheInfo(key: string): {
  has_cache   : boolean
  is_expired  : boolean
  cached_at   : string | null
  cached_by   : string | null
  expires_at  : string | null
  minutes_ago : number | null
} {
  const entry = store.get(key) as CacheEntry<unknown> | undefined
  if (!entry) {
    return { has_cache:false, is_expired:false, cached_at:null, cached_by:null, expires_at:null, minutes_ago:null }
  }
  const isExpired   = Date.now() > entry.expires_at
  const minutesAgo  = Math.round((Date.now() - entry.cached_at) / 60000)
  return {
    has_cache  : true,
    is_expired : isExpired,
    cached_at  : new Date(entry.cached_at).toLocaleString("id-ID"),
    cached_by  : entry.cached_by,
    expires_at : new Date(entry.expires_at).toLocaleString("id-ID"),
    minutes_ago: minutesAgo,
  }
}

export const CACHE_KEYS = {
  DASHBOARD : "dashboard_kpi",
  ALERTS    : "dashboard_alerts",
}
