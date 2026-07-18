import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type PlanSEWRow = {
  line_baru : string
  spo       : string
  style     : string
  qty_order : number
  qty_plan  : number
  fprc      : string
  fact_baru : string
  dates     : Record<string, number | "F" | "">
}

export type PlanSEWData = {
  factories   : string[]
  date_headers: string[]
  rows        : Record<string, PlanSEWRow[]>
  fetched_at  : string
  fetched_epoch: number
}

const CACHE_KEY       = "plan_sew_data"
const VALID_FACTORIES = new Set(["A","F","K"])

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

async function fetchPlanSEW(): Promise<PlanSEWData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Plan SEW",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 2) throw new Error("Sheet 'Plan SEW' kosong atau tidak ditemukan")

  const header = raw[0].map(function(h: any) { return String(h ?? "").trim() })

  // Posisi kolom tetap berdasar screenshot:
  // A=LINE BARU, B=SPO, C=STYLE, D=QTY ORDER, E=QTY PLAN, F=RENCANA F.PR, G=Fact Baru
  const iLine = 0  // A - LINE BARU
  const iSPO  = 1  // B - SPO
  const iStyle= 2  // C - STYLE
  const iQtyO = 3  // D - QTY ORDER
  const iQtyP = 4  // E - QTY PLAN
  const iFPRC = 5  // F - RENCANA F.PR
  const iFact = 6  // G - Fact Baru
  // H (index 7) dan seterusnya = kolom tanggal

  const firstDateCol = 7  // H

  // Kumpulkan header tanggal dari kolom H ke kanan
  const dateHeaders: string[] = []
  const dateColMap : Record<number, string> = {}

  for (let c = firstDateCol; c < header.length; c++) {
    const h = header[c].trim()
    if (!h) continue
    const isDate =
      /^\d{1,2}-[A-Za-z]{3}(-\d{2,4})?$/.test(h) ||
      /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(h)
    if (!isDate) continue
    if (!dateHeaders.includes(h)) dateHeaders.push(h)
    dateColMap[c] = h
  }

  // Parse data rows
  const factoryRows: Record<string, PlanSEWRow[]> = {}

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const line  = String(row[iLine]  ?? "").trim()
    const spo   = String(row[iSPO]   ?? "").trim()
    const style = String(row[iStyle] ?? "").trim()
    const fact  = String(row[iFact]  ?? "").trim()

    // Stop di baris History
    if (fact.toLowerCase() === "history" || line.toLowerCase() === "history") break

    // Skip baris kosong
    if (!line || !spo || !style) continue

    // Ambil satu huruf pertama dari fact untuk filter
    const factKey = fact.replace(/[^AFK]/g,"").charAt(0)
    if (!VALID_FACTORIES.has(factKey)) continue

    const qty_order = parseFloat(String(row[iQtyO] ?? "0").replace(/[.,]/g,"")) || 0
    const qty_plan  = parseFloat(String(row[iQtyP] ?? "0").replace(/[.,]/g,"")) || 0
    const fprc      = String(row[iFPRC] ?? "").trim()

    const dates: Record<string, number | "F" | ""> = {}
    for (const [colStr, label] of Object.entries(dateColMap)) {
      const c   = parseInt(colStr)
      const val = String(row[c] ?? "").trim()
      if (!val || val === "0") {
        dates[label] = ""
      } else if (val.toUpperCase() === "F") {
        dates[label] = "F"
      } else {
        const n = parseFloat(val.replace(/[.,]/g,""))
        dates[label] = isNaN(n) ? "" : n
      }
    }

    if (!factoryRows[factKey]) factoryRows[factKey] = []
    factoryRows[factKey].push({ line_baru:line, spo, style, qty_order, qty_plan, fprc, fact_baru:fact, dates })
  }

  const factories = Object.keys(factoryRows).sort()
  for (const f of factories) {
    factoryRows[f].sort(function(a, b) {
      return a.line_baru.localeCompare(b.line_baru, undefined, { numeric:true })
    })
  }

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })

  return {
    factories,
    date_headers : dateHeaders,
    rows         : factoryRows,
    fetched_at   : wibStr,
    fetched_epoch: now,
  }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (!forceRefresh) {
    const cached = await cacheGet<PlanSEWData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }

  try {
    const data = await fetchPlanSEW()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
