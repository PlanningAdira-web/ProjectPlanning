/**
 * Cache in-memory TANPA EXPIRE.
 * Data hanya diperbarui saat Admin/Analyst klik "Refresh Analisis AI".
 * Reset hanya terjadi saat Vercel cold start / redeploy.
 */

type CacheEntry<T> = {
  data      : T
  cached_at : number   // ms timestamp
  cached_by : string   // username yang trigger
}

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): CacheEntry<T> | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  return entry ?? null
}

export function cacheSet<T>(key: string, data: T, cachedBy: string): CacheEntry<T> {
  const entry: CacheEntry<T> = {
    data,
    cached_at : Date.now(),
    cached_by : cachedBy,
  }
  store.set(key, entry)
  return entry
}

export function cacheInfo(key: string) {
  const entry = store.get(key) as CacheEntry<unknown> | undefined
  if (!entry) return { has_cache: false, cached_at: null, cached_by: null, minutes_ago: null }
  const minutesAgo = Math.round((Date.now() - entry.cached_at) / 60000)
  const hoursAgo   = Math.round(minutesAgo / 60)
  return {
    has_cache  : true,
    cached_at  : new Date(entry.cached_at).toLocaleString("id-ID"),
    cached_by  : entry.cached_by,
    minutes_ago: minutesAgo,
    hours_ago  : hoursAgo,
    age_label  : minutesAgo < 60
      ? `${minutesAgo} menit lalu`
      : `${hoursAgo} jam lalu`,
  }
}

export const CACHE_KEYS = {
  DASHBOARD : "dashboard_kpi",
  ALERTS    : "dashboard_alerts",
  BALANCING : "balancing_lines",
  TODO      : "todo_items",
}
