/**
 * Adapter: convert output getAllSheetsData() (Record<string,string>)
 * menjadi format yang diterima askClaude/askClaudeStream ({dst,prepo,shipment})
 *
 * Nama sheet disesuaikan dengan spreadsheet PT Adira Semesta Industry.
 * Jika nama sheet berubah, update mapping di bawah.
 */
export function toClaudeCSV(data: Record<string, string>): { dst?: string; prepo?: string; shipment?: string } {
  // Cari sheet yang cocok secara flexible (case-insensitive, partial match)
  const find = (keywords: string[]): string | undefined => {
    const key = Object.keys(data).find(k =>
      keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
    )
    return key ? data[key] : undefined
  }

  // Gabungkan semua data sebagai dst jika tidak ada mapping spesifik
  const allData = Object.entries(data)
    .map(([name, csv]) => `=== SHEET: ${name} ===\n${csv}`)
    .join("\n\n")

  return {
    dst     : find(["DST", "Planning", "PlanningProduction", "Data_Plan"]) ?? allData,
    prepo   : find(["PreProd", "Pre-Prod", "PreProduction", "Material"]),
    shipment: find(["Ship", "SPO", "Stock", "Export"]),
  }
}
