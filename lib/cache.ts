/**
 * Cache dua lapis:
 * 1. In-memory (cepat) — hilang saat cold start
 * 2. Google Sheets "AI_Cache" (persisten) — tetap ada setelah restart
 *
 * Saat GET: coba memory dulu → jika kosong, baca dari Sheets
 * Saat SET: simpan ke memory DAN ke Sheets secara bersamaan
 */

import { google } from "googleapis"

// ── In-memory store ──────────────────────────────────────────────
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

// ── Google Sheets helpers ─────────────────────────────────────────
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

/** Pastikan sheet AI_Cache ada, buat jika belum */
async function ensureCacheSheet(sheetsApi: any, spreadsheetId: string) {
  try {
    const meta = await sheetsApi.spreadsheets.get({ spreadsheetId })
    const exists = meta.data.sheets?.some(
      (s: any) => s.properties?.title === CACHE_SHEET
    )
    if (!exists) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: CACHE_SHEET } } }],
        },
      })
    }
  } catch { /* abaikan jika gagal */ }
}

/** Simpan satu entry ke baris di sheet AI_Cache */
async function writeToSheet(key: string, entry: CacheEntry<unknown>) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const auth          = getAuth()
    const sheets        = google.sheets({ version: "v4", auth })
    await ensureCacheSheet(sheets, spreadsheetId)

    // Baca semua baris untuk cari baris yang sudah ada dengan key ini
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CACHE_SHEET}!A:A`,
    })
    const rows   = res.data.values ?? []
    const rowIdx = rows.findIndex(r => r[0] === key)
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
  } catch (e) {
    console.error("[cache] writeToSheet error:", e)
  }
}

/** Baca semua entry dari sheet AI_Cache ke memory */
async function loadFromSheet(): Promise<void> {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!
    const auth          = getAuth()
    const sheets        = google.sheets({ version: "v4", auth })

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CACHE_SHEET}!A:B`,
    })
    const rows = res.data.values ?? []
    for (const [key, value] of rows) {
      if (!key || !value) continue
      try {
        const entry = JSON.parse(value) as CacheEntry<unknown>
        store.set(key, entry)
      } catch { /* skip baris rusak */ }
    }
  } catch {
    /* Sheet belum ada atau error — abaikan, pakai memory kosong */
  }
}

// Flag agar loadFromSheet hanya dipanggil sekali per cold start
let _loaded = false
async function ensureLoaded() {
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
  // Simpan ke Sheets di background — tidak await agar response tetap cepat
  writeToSheet(key, entry).catch(console.error)
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
