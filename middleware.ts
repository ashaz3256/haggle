import { NextRequest, NextResponse } from "next/server";

/**
 * Demo access gate. Active only when ACCESS_CODE is set (it is on the public instance, not in local dev).
 * Three ways in:
 *   - cookie `haggle_access` already holds the code (set for 7 days)
 *   - any URL with `?code=<ACCESS_CODE>` — share this with judges; the code is stripped and a cookie set
 *   - the /gate page form
 * API calls without the cookie get 401, pages redirect to /gate.
 */
const COOKIE = "haggle_access";

export function middleware(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname, searchParams } = req.nextUrl;
  if (pathname === "/gate" || pathname === "/api/gate") return NextResponse.next();

  const fromQuery = searchParams.get("code");
  if (fromQuery !== null) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("code");
    if (fromQuery === code) {
      const res = NextResponse.redirect(url);
      res.cookies.set(COOKIE, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
      return res;
    }
  }

  if (req.cookies.get(COOKIE)?.value === code) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Access code required" }, { status: 401 });

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
