/**
 * Cache dua lapis: in-memory (cepat) + Google Sheets AI_Cache (persisten).
 * 
 * Behaviour:
 * - GET: tunggu load dari sheet selesai (sekali saja), lalu baca memory
 * - SET: tulis ke memory SYNC, tulis ke sheet ASYNC (fire & forget)
 * - Semua error ditangkap, tidak pernah throw ke caller
 */

import { google } from "googleapis"

type CacheEntry<T> = {
  data      : T
  cached_at : number
  cached_by : string
}

const store = new Map<string, CacheEntry<unknown>>()

// Promise load sheet -- null = belum dimulai, resolved = sudah selesai
let _loadPromise: Promise<void> | null = null

export const CACHE_KEYS = {
  DASHBOARD : "dashboard_kpi",
  ALERTS    : "dashboard_alerts",
  BALANCING : "balancing_lines",
  TODO      : "todo_items",
  PLANNING  : "planning_dst",
}

const CACHE_SHEET = "AI_Cache"

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
}

function loadFromSheet(): Promise<void> {
  if (_loadPromise) return _loadPromise
  _loadPromise = (async function() {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID
    if (!spreadsheetId) return
    try {
      const sheets = google.sheets({ version:"v4", auth:getAuth() })
      const res    = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CACHE_SHEET + "!A:B",
      })
      const rows = res.data.values ?? []
      let loaded = 0
      for (const [key, value] of rows) {
        if (!key || !value) continue
        try {
          const entry = JSON.parse(value) as CacheEntry<unknown>
          store.set(key, entry)
          loaded++
        } catch { /* skip baris rusak */ }
      }
      console.log("[cache] Loaded " + loaded + " entries from AI_Cache")
    } catch (e: any) {
      // Sheet belum ada saat pertama kali = normal
      console.log("[cache] loadFromSheet: " + (e.message ?? "skipped"))
    }
  })()
  return _loadPromise
}

async function writeToSheet(key: string, entry: CacheEntry<unknown>): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) return
  try {
    const sheets = google.sheets({ version:"v4", auth:getAuth() })

    // Buat sheet AI_Cache jika belum ada
    try {
      const meta   = await sheets.spreadsheets.get({ spreadsheetId })
      const exists = (meta.data.sheets ?? []).some(function(s: any) {
        return s.properties?.title === CACHE_SHEET
      })
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests:[{ addSheet:{ properties:{ title:CACHE_SHEET } } }] },
        })
      }
    } catch { /* abaikan */ }

    // Cari baris existing
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CACHE_SHEET + "!A:A",
    })
    const rows   = res.data.values ?? []
    const rowIdx = rows.findIndex(function(r: string[]) { return r[0] === key })
    const rowNum = rowIdx >= 0 ? rowIdx + 1 : rows.length + 1

    const value = JSON.stringify({
      data      : entry.data,
      cached_at : entry.cached_at,
      cached_by : entry.cached_by,
    })

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range           : CACHE_SHEET + "!A" + rowNum + ":B" + rowNum,
      valueInputOption: "RAW",
      requestBody     : { values:[[key, value]] },
    })
  } catch (e: any) {
    console.log("[cache] writeToSheet failed: " + (e.message ?? "unknown"))
  }
}

// ── Public API ──────────────────────────────────────────────────

// Async: tunggu load selesai baru return data
export async function cacheGet<T>(key: string): Promise<CacheEntry<T> | null> {
  await loadFromSheet()
  return (store.get(key) as CacheEntry<T>) ?? null
}

export async function cacheSet<T>(
  key      : string,
  data     : T,
  cachedBy : string
): Promise<CacheEntry<T>> {
  const entry: CacheEntry<T> = {
    data,
    cached_at: Date.now(),
    cached_by: cachedBy,
  }
  store.set(key, entry)
  writeToSheet(key, entry as CacheEntry<unknown>).catch(function() {})
  return entry
}

export async function cacheInfo(key: string) {
  await loadFromSheet()
  const entry = store.get(key) as CacheEntry<unknown> | undefined
  if (!entry) {
    return { has_cache:false, cached_at:null, cached_by:null, age_label:null, minutes_ago:null }
  }
  const minutesAgo = Math.round((Date.now() - entry.cached_at) / 60000)
  const hoursAgo   = Math.round(minutesAgo / 60)
  return {
    has_cache  : true,
    cached_at  : new Date(entry.cached_at).toLocaleString("id-ID"),
    cached_by  : entry.cached_by,
    minutes_ago: minutesAgo,
    hours_ago  : hoursAgo,
    age_label  : minutesAgo < 60
      ? minutesAgo + " menit lalu"
      : hoursAgo + " jam lalu",
  }
}
