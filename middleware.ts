import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

const SECRET      = new TextEncoder().encode(process.env.JWT_SECRET ?? "planning-ai-secret-ganti-ini")
const COOKIE_NAME = "planning_session"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Halaman publik — tidak perlu login
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next()
  }

  // Halaman yang perlu login: /dashboard dan /api/*
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/")) {
    const token = req.cookies.get(COOKIE_NAME)?.value
    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error:"Unauthorized — silakan login" }, { status:401 })
      }
      return NextResponse.redirect(new URL("/login", req.url))
    }
    try {
      await jwtVerify(token, SECRET)
      return NextResponse.next()
    } catch {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error:"Sesi expired — silakan login kembali" }, { status:401 })
      }
      const res = NextResponse.redirect(new URL("/login", req.url))
      res.cookies.delete(COOKIE_NAME)
      return res
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/login"],
}
