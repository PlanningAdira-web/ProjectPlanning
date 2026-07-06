/**
 * Cache dua lapis: in-memory (cepat) + Google Sheets AI_Cache (persisten).
 * cacheGet: sync dari memory, tidak pernah throw
 * cacheSet: sync ke memory + async write ke Sheets (fire and forget)
 * loadFromSheet: dipanggil sekali saat startup
 */

import { google } from "googleapis"

type CacheEntry<T> = {
  data      : T
  cached_at : number
  cached_by : string
}

const store = new Map<string, CacheEntry<unknown>>()
let _loadAttempted = false

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

// Load dari sheet — dipanggil sekali, tidak throw
async function loadFromSheet(): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) return

  try {
    const sheets = google.sheets({ version:"v4", auth:getAuth() })
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CACHE_SHEET + "!A:B",
    })
    const rows = res.data.values ?? []
    for (const [key, value] of rows) {
      if (!key || !value) continue
      try {
        const entry = JSON.parse(value) as CacheEntry<unknown>
        store.set(key, entry)
      } catch { /* skip baris rusak */ }
    }
    console.log("[cache] Loaded " + store.size + " entries from AI_Cache sheet")
  } catch (e: any) {
    // Sheet belum ada = normal, abaikan saja
    console.log("[cache] loadFromSheet skipped: " + (e.message ?? "unknown"))
  }
}

// Write ke sheet — fire and forget, tidak throw
async function writeToSheet(key: string, entry: CacheEntry<unknown>): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) return

  try {
    const sheets = google.sheets({ version:"v4", auth:getAuth() })

    // Pastikan sheet AI_Cache ada
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
    } catch { /* abaikan jika gagal cek sheet */ }

    // Cari baris existing dengan key ini
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
    console.log("[cache] Written key '" + key + "' to row " + rowNum)
  } catch (e: any) {
    console.log("[cache] writeToSheet failed: " + (e.message ?? "unknown"))
  }
}

// Trigger load satu kali (non-blocking)
function triggerLoad() {
  if (_loadAttempted) return
  _loadAttempted = true
  loadFromSheet().catch(function() {})
}

// Public API
export function cacheGet<T>(key: string): CacheEntry<T> | null {
  triggerLoad()
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
  // Fire and forget -- tidak await, tidak throw
  writeToSheet(key, entry as CacheEntry<unknown>).catch(function() {})
  return entry
}

export function cacheInfo(key: string) {
  triggerLoad()
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
