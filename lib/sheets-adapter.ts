/**
 * Adapter: convert Record<string,string> dari getAllSheetsData()
 * ke format {dst, prepo, shipment} yang diterima claude.ts
 *
 * Mapping berdasarkan struktur aktual "Project AI Planning":
 * - dst      : Data_Plan_DST, Data_Plan_SEW, Analyst_WIP_Weekly, Analyst_WIPSET_(total)
 * - prepo    : WIP_MaterialSET_(total), Pre-Prod
 * - shipment : Analyst_DataExport, Alerts
 */

export function toClaudeCSV(
  data: Record<string, string>
): { dst?: string; prepo?: string; shipment?: string } {

  const dst_sheets: string[]      = []
  const prepo_sheets: string[]    = []
  const shipment_sheets: string[] = []

  const SKIP = new Set(["AI_Cache", "Info_Factory", "Pre-Prod 2", "KPI&Scorecard"])

  for (const [name, csv] of Object.entries(data)) {
    if (!csv || !csv.trim()) continue
    if (SKIP.has(name)) continue

    const n = name.toLowerCase()

    // DST / Planning / WIP produksi
    if (
      n.includes("data_plan") ||
      n.includes("plan_dst") ||
      n.includes("plan_sew") ||
      n.includes("wip_weekly") ||
      n.includes("wipset") ||
      n.includes("analyst_wip")
    ) {
      dst_sheets.push("-- Sheet: " + name + " --\n" + csv)
      continue
    }

    // Material / Pre-Prod
    if (
      n.includes("material") ||
      n.includes("pre-prod") ||
      n.includes("preprod") ||
      n.includes("pre_prod")
    ) {
      prepo_sheets.push("-- Sheet: " + name + " --\n" + csv)
      continue
    }

    // Export / Shipment / Alerts
    if (
      n.includes("export") ||
      n.includes("shipment") ||
      n.includes("alerts") ||
      n.includes("stock")
    ) {
      shipment_sheets.push("-- Sheet: " + name + " --\n" + csv)
      continue
    }
  }

  return {
    dst     : dst_sheets.length      > 0 ? dst_sheets.join("\n\n")      : undefined,
    prepo   : prepo_sheets.length    > 0 ? prepo_sheets.join("\n\n")    : undefined,
    shipment: shipment_sheets.length > 0 ? shipment_sheets.join("\n\n") : undefined,
  }
}
