import type { Metadata } from "next"
export const metadata: Metadata = {
  title: "Production Planning AI",
  description: "AI-powered production planning dashboard",
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.x/dist/tabler-icons.min.css"/>
      </head>
      <body style={{ margin:0, fontFamily:"system-ui,sans-serif", background:"#f9f9f8" }}>
        {children}
      </body>
    </html>
  )
}
