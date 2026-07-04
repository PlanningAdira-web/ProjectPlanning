/**
 * Cache dua lapis:
 * 1. In-memory — cepat, hilang saat cold start
 * 2. Google Sheets "AI_Cache" — persisten, tetap ada setelah restart
 */

import { google } from "googleapis"

type CacheEntry<T> = {
  data      : T
  cached_at : number
  cached_by : string
}

const store = new Map<string, CacheEntry<unknown>>()

export const CACHE_KEYS = {
  DASHBOARD : "dashboard_kpi",
  ALERTS    : "dashboard_alerts",
  BALANCING : "balancing_lines",
  TODO      : "todo_items",
}

const CACHE_SHEET = "AI_Cache"

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    // PENTING: scope harus include spreadsheets (bukan hanya readonly)
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
}

async function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: "v4", auth })
}

/** Buat sheet AI_Cache jika belum ada */
async function ensureCacheSheet(sheets: any, spreadsheetId: string): Promise<boolean> {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const exists = (meta.data.sheets ?? []).some(
      (s: any) => s.properties?.title === CACHE_SHEET
    )
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: CACHE_SHEET } } }],
        },
      })
      console.log("[cache] Sheet AI_Cache berhasil dibuat")
    }
    return true
  } catch (e: any) {
    console.error("[cache] ensureCacheSheet error:", e.message)
    return false
  }
}

/** Simpan entry ke sheet AI_Cache */
async function writeToSheet(key: string, entry: CacheEntry<unknown>): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) {
    console.error("[cache] GOOGLE_SHEET_ID tidak tersedia")
    return
  }

  try {
    const sheets = await getSheets()
    await ensureCacheSheet(sheets, spreadsheetId)

    // Baca kolom A untuk cari baris existing
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CACHE_SHEET}!A:A`,
    })
    const rows   = res.data.values ?? []
    const rowIdx = rows.findIndex((r: string[]) => r[0] === key)
    const rowNum = rowIdx >= 0 ? rowIdx + 1 : rows.length + 1

    const value = JSON.stringify({
      data      : entry.data,
      cached_at : entry.cached_at,
      cached_by : entry.cached_by,
    })

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range           : `${CACHE_SHEET}!A${rowNum}:B${rowNum}`,
      valueInputOption: "RAW",
      requestBody     : { values: [[key, value]] },
    })
    console.log(`[cache] Berhasil tulis key "${key}" ke baris ${rowNum}`)
  } catch (e: any) {
    console.error("[cache] writeToSheet error:", e.message)
  }
}

/** Load semua entry dari sheet AI_Cache ke memory */
async function loadFromSheet(): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  if (!spreadsheetId) return

  try {
    const sheets = await getSheets()
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CACHE_SHEET}!A:B`,
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
    if (loaded > 0) console.log(`[cache] Loaded ${loaded} entries dari sheet AI_Cache`)
  } catch (e: any) {
    // Sheet belum ada = normal untuk pertama kali
    if (!e.message?.includes("Unable to parse range")) {
      console.error("[cache] loadFromSheet error:", e.message)
    }
  }
}

let _loaded = false
async function ensureLoaded(): Promise<void> {
  if (_loaded) return
  _loaded = true
  await loadFromSheet()
}

// ── Public API ────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<CacheEntry<T> | null> {
  await ensureLoaded()
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
  // Tulis ke Sheets di background — tidak blok response
  writeToSheet(key, entry as CacheEntry<unknown>).catch(e =>
    console.error("[cache] background write error:", e.message)
  )
  return entry
}

export async function cacheInfo(key: string) {
  await ensureLoaded()
  const entry = store.get(key) as CacheEntry<unknown> | undefined
  if (!entry) {
    return { has_cache: false, cached_at: null, cached_by: null, age_label: null }
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
      ? `${minutesAgo} menit lalu`
      : `${hoursAgo} jam lalu`,
  }
}
