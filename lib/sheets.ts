import { google } from "googleapis"

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

export async function getSheetNames(): Promise<{ name: string; gid: number }[]> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() })
  const res = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
  })
  return (res.data.sheets ?? []).map(s => ({
    name: s.properties?.title ?? "",
    gid:  s.properties?.sheetId ?? 0,
  }))
}

export async function readSheetAsCSV(sheetName: string, maxRows = 200): Promise<string> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() })
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `${sheetName}!A1:Z${maxRows + 1}`,
  })
  const rows = res.data.values ?? []
  if (rows.length < 2) return "(sheet kosong)"
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? "")
      return s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s
    }).join(",")
  ).join("\n")
}

export async function getAllSheetsData(): Promise<Record<string, string>> {
  const list = await getSheetNames()
  const results = await Promise.all(
    list.map(async s => [s.name, await readSheetAsCSV(s.name, 200)] as [string, string])
  )
  return Object.fromEntries(results)
}
