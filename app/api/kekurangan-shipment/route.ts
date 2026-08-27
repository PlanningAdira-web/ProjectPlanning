import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KekuranganSizeRow = {
  size             : string
  qty_shipment_pcs : number
  shipped          : number
  kk_dst           : number
  kk_glove         : number
  qty_shipment_date: number
}

export type KekuranganSPOGroup = {
  spo      : string
  sizes    : KekuranganSizeRow[]
  // Env/Inner/Carton = kekurangan SET (bukan per size) - hanya diisi di 1 baris (size pertama) per SPO di sheet,
  // di sini dijumlah per SPO (baris lain bernilai 0, jadi hasil penjumlahan = nilai set itu sendiri)
  kk_env   : number
  kk_inner : number
  kk_carton: number
}

export type KekuranganShipmentData = {
  bySpo        : Record<string, KekuranganSPOGroup>
  fetched_at   : string
  fetched_epoch: number
}

const CACHE_KEY  = "kekurangan_shipment_data"
const SHEET_NAME = "Kekurangan Shipment"

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

function parseNum(val: any): number {
  const s = String(val ?? "").trim().replace(/[.,\s]/g, "")
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

async function fetchKekuranganShipment(): Promise<KekuranganShipmentData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : SHEET_NAME,
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 2) throw new Error(`Sheet '${SHEET_NAME}' kosong atau tidak ditemukan`)

  // Cari baris header secara dinamis (baris yang punya cell "SPO"), karena di atasnya ada
  // baris judul sheet + baris info update + baris Total yang jumlahnya bisa berubah-ubah
  let headerRowIdx = -1
  for (let r = 0; r < Math.min(8, raw.length); r++) {
    const rowVals = (raw[r] ?? []).map(function(v: any) { return String(v ?? "").trim().toLowerCase() })
    if (rowVals.includes("spo")) { headerRowIdx = r; break }
  }
  if (headerRowIdx < 0) throw new Error(`Baris header (kolom 'SPO') tidak ditemukan di sheet '${SHEET_NAME}'`)

  const header = raw[headerRowIdx].map(function(h: any) { return String(h ?? "").trim().toLowerCase() })

  function findCol(keywords: string[]): number {
    for (const kw of keywords) {
      const i = header.findIndex(function(h: string) { return h.includes(kw.toLowerCase()) })
      if (i >= 0) return i
    }
    return -1
  }

  const iSPO     = findCol(["spo"])
  const iSize    = findCol(["size"])
  const iQtyPcs  = header.findIndex(function(h: string) { return h.includes("qty") && h.includes("shipment") && h.includes("pcs") })
  const iShipped = findCol(["shipped"])
  const iKKDST   = findCol(["kk dst","kk_dst"])
  const iKKGlove = findCol(["kk glove","kk_glove"])
  const iQtyDate = header.findIndex(function(h: string) { return h.includes("qty") && h.includes("shipment") && h.includes("date") })
  const iKKEnv   = findCol(["kekurangan env","env / pcs","env/pcs"])
  const iKKInner = findCol(["kekurangan inner","inner / pcs","inner/pcs"])
  const iKKCarton= findCol(["kekurangan carton","carton / pcs","carton/pcs"])

  // Fallback posisi berdasar screenshot struktur sheet (huruf kolom asli: D,E,F,G,H,I,L,O,P,Q,U,Y,Z,AA)
  const ci = {
    spo     : iSPO     >= 0 ? iSPO     : 3,
    size    : iSize    >= 0 ? iSize    : 5,
    qtyPcs  : iQtyPcs  >= 0 ? iQtyPcs  : 11,
    shipped : iShipped >= 0 ? iShipped : 14,
    kk_dst  : iKKDST   >= 0 ? iKKDST   : 15,
    kk_glove: iKKGlove >= 0 ? iKKGlove : 16,
    qtyDate : iQtyDate >= 0 ? iQtyDate : 20,
    kk_env  : iKKEnv   >= 0 ? iKKEnv   : 24,
    kk_inner: iKKInner >= 0 ? iKKInner : 25,
    kk_carton:iKKCarton>= 0 ? iKKCarton: 26,
  }

  const bySpo: Record<string, KekuranganSPOGroup> = {}

  for (let r = headerRowIdx + 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const spo  = String(row[ci.spo]  ?? "").trim()
    const size = String(row[ci.size] ?? "").trim()
    if (!spo) continue
    if (spo.toLowerCase() === "total") continue

    if (!bySpo[spo]) {
      bySpo[spo] = { spo, sizes:[], kk_env:0, kk_inner:0, kk_carton:0 }
    }

    bySpo[spo].sizes.push({
      size,
      qty_shipment_pcs : parseNum(row[ci.qtyPcs]),
      shipped          : parseNum(row[ci.shipped]),
      kk_dst           : parseNum(row[ci.kk_dst]),
      kk_glove         : parseNum(row[ci.kk_glove]),
      qty_shipment_date: parseNum(row[ci.qtyDate]),
    })

    // Env/Inner/Carton cuma diisi di 1 baris (size pertama) per SPO - baris lain 0,
    // jadi cukup dijumlah per SPO untuk dapat nilai kekurangan set-nya
    bySpo[spo].kk_env    += parseNum(row[ci.kk_env])
    bySpo[spo].kk_inner  += parseNum(row[ci.kk_inner])
    bySpo[spo].kk_carton += parseNum(row[ci.kk_carton])
  }

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })

  return { bySpo, fetched_at:wibStr, fetched_epoch:now }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"
  if (!forceRefresh) {
    const cached = await cacheGet<KekuranganShipmentData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }
  try {
    const data = await fetchKekuranganShipment()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
