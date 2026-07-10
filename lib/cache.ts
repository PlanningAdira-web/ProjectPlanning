/**
 * Cache dua lapis: in-memory (cepat) + Google Sheets AI_Cache (persisten).
 * 
 * Fix race condition: write menggunakan antrian (queue) sequential,
 * bukan concurrent, agar tidak saling timpa saat multiple key ditulis bersamaan.
 */

import { google } from "googleapis"

type CacheEntry<T> = {
  data      : T
  cached_at : number
  cached_by : string
}

const store = new Map<string, CacheEntry<unknown>>()
let _loadPromise: Promise<void> | null = null
let _loadedAt  : number = 0
const LOAD_TTL_MS = 30 * 1000        // Re-load dari sheet setiap 30 detik

// Write queue: proses satu per satu agar tidak race condition
let _writeQueue: Promise<void> = Promise.resolve()

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
  // Reset singleton jika TTL expired (default 30 detik)
  if (_loadPromise && (Date.now() - _loadedAt) > LOAD_TTL_MS) {
    _loadPromise = null
    store.clear()
    console.log("[cache] TTL expired, reloading from sheet")
  }
  if (_loadPromise) return _loadPromise
  _loadedAt    = Date.now()
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
      console.log("[cache] loadFromSheet: " + (e.message ?? "skipped"))
    }
  })()
  return _loadPromise
}

// Tulis satu key ke sheet secara sequential (antrian)
function enqueueWrite(key: string, entry: CacheEntry<unknown>): void {
  _writeQueue = _writeQueue.then(function() {
    return writeToSheet(key, entry)
  }).catch(function() {})
}

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
        console.log("[cache] Sheet AI_Cache dibuat")
      }
    } catch { /* abaikan */ }

    // Baca semua baris kolom A untuk cari posisi key
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CACHE_SHEET + "!A:A",
    })
    const rows   = (res.data.values ?? []) as string[][]
    const rowIdx = rows.findIndex(function(r) { return r[0] === key })
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
    console.log("[cache] Wrote key '" + key + "' to row " + rowNum)
  } catch (e: any) {
    console.log("[cache] writeToSheet '" + key + "' failed: " + (e.message ?? "unknown"))
  }
}

// Public API

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
  // Enqueue write agar sequential, tidak race condition
  enqueueWrite(key, entry as CacheEntry<unknown>)
  // Reset TTL timer agar loadAt menjadi sekarang
  // Sehingga instance lain yang load ulang akan dapat data terbaru dari sheet
  _loadedAt = Date.now()
  return entry
}

export async function cacheInfo(key: string) {
  await loadFromSheet()
  const entry = store.get(key) as CacheEntry<unknown> | undefined
  if (!entry) {
    return { has_cache:false, cached_at:null, cached_by:null, age_label:null, minutes_ago:null }
  }
  const minutesAgo = Math.round((Date.now() - entry.cached_at) / 60000)
  const hoursAgo   = Math.floor(minutesAgo / 60)
  const minsRest   = minutesAgo % 60

  // Tampilkan waktu dalam WIB (UTC+7)
  const wibDate     = new Date(entry.cached_at + 7 * 60 * 60 * 1000)
  const cachedAtWIB = wibDate.toLocaleString("id-ID", { timeZone:"UTC" })

  let ageLabel: string
  if (minutesAgo < 1) {
    ageLabel = "baru saja"
  } else if (minutesAgo < 60) {
    ageLabel = minutesAgo + " menit lalu"
  } else if (hoursAgo < 24) {
    ageLabel = hoursAgo + " jam " + (minsRest > 0 ? minsRest + " menit " : "") + "lalu"
  } else {
    const daysAgo = Math.floor(hoursAgo / 24)
    ageLabel = daysAgo + " hari lalu"
  }

  return {
    has_cache  : true,
    cached_at  : cachedAtWIB,
    cached_by  : entry.cached_by,
    minutes_ago: minutesAgo,
    hours_ago  : hoursAgo,
    age_label  : ageLabel,
  }
}
