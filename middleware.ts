import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

const SECRET      = new TextEncoder().encode(process.env.JWT_SECRET ?? "planning-adira-secret-2024")
const COOKIE_NAME = "planning_session"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) return NextResponse.next()
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/")) {
    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error:"Unauthorized" }, { status:401 })
      return NextResponse.redirect(new URL("/login", req.url))
    }
    try { await jwtVerify(token, SECRET); return NextResponse.next() }
    catch {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error:"Sesi expired" }, { status:401 })
      const res = NextResponse.redirect(new URL("/login", req.url))
      res.cookies.delete(COOKIE_NAME)
      return res
    }
  }
  return NextResponse.next()
}

export const config = { matcher:["/dashboard/:path*","/api/:path*","/login"] }
