import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type ShipmentRow = {
  export_date : string
  week        : number
  spo         : string
  style       : string
  buyer       : string
  dest_country: string
  qty_shipment: number
  shipped     : number
  kk_dst      : number
  kk_glove    : number
  qty_shipment2: number
  kk_env      : number
  kk_inner    : number
  kk_carton   : number
}

export type ShipmentData = {
  update_info  : string
  rows         : ShipmentRow[]
  buyers       : string[]
  weeks        : number[]
  fetched_at   : string
  fetched_epoch: number
}

const CACHE_KEY = "shipment_set_data"

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

async function fetchShipmentSet(): Promise<ShipmentData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Shipment Set",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 3) throw new Error("Sheet 'Shipment Set' kosong atau tidak ditemukan")

  // Baris 1 (index 0) = update info (cell A1)
  const update_info = String(raw[0]?.[0] ?? "").trim()

  // Baris 2 (index 1) = DIABAIKAN (baris total/header palsu)
  // Baris 3 (index 2) = header kolom
  const header = raw[2].map(function(h: any) { return String(h ?? "").trim().toLowerCase() })

  // Deteksi index kolom berdasar header baris 3
  // Kolom: Export, Week, SPO, Style, Buyer, Dest. Country,
  //        Qty Shipment/pcs, Shipped, KK DST, KK Glove,
  //        Qty Shipment/Date, Kekurangan Env/pcs, Kekurangan Inner/pcs, Kekurangan Carton/pcs
  function findCol(keywords: string[]): number {
    for (const kw of keywords) {
      const i = header.findIndex(function(h: string) { return h.includes(kw.toLowerCase()) })
      if (i >= 0) return i
    }
    return -1
  }

  const iExport  = findCol(["export"])
  const iWeek    = findCol(["week"])
  const iSPO     = findCol(["spo"])
  const iStyle   = findCol(["style"])
  const iBuyer   = findCol(["buyer"])
  const iDest    = findCol(["dest"])
  const iQtyS1   = header.findIndex(function(h: string, i: number) {
    return h.includes("qty") && h.includes("shipment") && i < 10
  })
  const iShipped = findCol(["shipped"])
  const iKKDST   = findCol(["kk dst","kk_dst"])
  const iKKGlove = findCol(["kk glove","kk_glove"])
  const iQtyS2   = header.findIndex(function(h: string, i: number) {
    return h.includes("qty") && h.includes("shipment") && i >= 10
  })
  const iKKEnv   = findCol(["kekurangan env","env / pcs","env/pcs"])
  const iKKInner = findCol(["kekurangan inner","inner / pcs","inner/pcs"])
  const iKKCarton= findCol(["kekurangan carton","carton / pcs","carton/pcs"])

  // Fallback ke posisi berdasar screenshot jika deteksi gagal
  // A=0 Export, B=1 Week, C=2 SPO, D=3 Style, E=4 Buyer, F=5 Dest.Country
  // G=6 Qty Shipment, H=7 Shipped, I=8 KK DST, J=9 KK Glove
  // K=10 Qty Shipment/Date, L=11 Kekurangan Env, M=12 Kekurangan Inner, N=13 Kekurangan Carton
  const ci = {
    export  : iExport   >= 0 ? iExport   : 0,
    week    : iWeek     >= 0 ? iWeek     : 1,
    spo     : iSPO      >= 0 ? iSPO      : 2,
    style   : iStyle    >= 0 ? iStyle    : 3,
    buyer   : iBuyer    >= 0 ? iBuyer    : 4,
    dest    : iDest     >= 0 ? iDest     : 5,
    qty1    : iQtyS1    >= 0 ? iQtyS1    : 6,
    shipped : iShipped  >= 0 ? iShipped  : 7,
    kk_dst  : iKKDST    >= 0 ? iKKDST    : 8,
    kk_glove: iKKGlove  >= 0 ? iKKGlove  : 9,
    qty2    : iQtyS2    >= 0 ? iQtyS2    : 10,
    kk_env  : iKKEnv    >= 0 ? iKKEnv    : 11,
    kk_inner: iKKInner  >= 0 ? iKKInner  : 12,
    kk_carton:iKKCarton >= 0 ? iKKCarton : 13,
  }

  const rows: ShipmentRow[] = []

  // Data mulai dari baris ke-4 (index 3)
  for (let r = 3; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const spo   = String(row[ci.spo]   ?? "").trim()
    const style = String(row[ci.style] ?? "").trim()
    const buyer = String(row[ci.buyer] ?? "").trim()

    // Skip baris kosong atau baris total
    if (!spo || !buyer) continue
    if (spo.toLowerCase() === "total" || buyer.toLowerCase() === "total") continue

    const weekRaw = parseNum(row[ci.week])
    if (weekRaw === 0) continue

    rows.push({
      export_date  : String(row[ci.export]   ?? "").trim(),
      week         : weekRaw,
      spo,
      style,
      buyer,
      dest_country : String(row[ci.dest]    ?? "").trim(),
      qty_shipment : parseNum(row[ci.qty1]),
      shipped      : parseNum(row[ci.shipped]),
      kk_dst       : parseNum(row[ci.kk_dst]),
      kk_glove     : parseNum(row[ci.kk_glove]),
      qty_shipment2: parseNum(row[ci.qty2]),
      kk_env       : parseNum(row[ci.kk_env]),
      kk_inner     : parseNum(row[ci.kk_inner]),
      kk_carton    : parseNum(row[ci.kk_carton]),
    })
  }

  const buyers = [...new Set(rows.map(function(r) { return r.buyer }))].sort()
  const weeks  = [...new Set(rows.map(function(r) { return r.week  }))].sort(function(a,b){return a-b})

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })

  return { update_info, rows, buyers, weeks, fetched_at:wibStr, fetched_epoch:now }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (!forceRefresh) {
    const cached = await cacheGet<ShipmentData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }

  try {
    const data = await fetchShipmentSet()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
