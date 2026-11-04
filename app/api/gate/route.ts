import { NextResponse } from "next/server";

/** Gate form target: checks the code, sets the access cookie, and sends the visitor on. */
export async function POST(req: Request) {
  const form = await req.formData();
  const code = String(form.get("code") ?? "").trim();
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const expected = process.env.ACCESS_CODE;

  if (!expected || code !== expected) {
    return NextResponse.redirect(new URL(`/gate?bad=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set("haggle_access", expected, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}
