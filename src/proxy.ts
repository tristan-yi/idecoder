import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

const protect = auth.middleware({ loginUrl: "/login" });

export async function proxy(request: NextRequest) {
  const response = await protect(request);
  if (response.status < 300 || response.status >= 400) return response;

  const location = response.headers.get("location");
  if (!location) return response;

  const url = new URL(location, request.url);
  if (url.pathname !== "/login") return response;

  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next && next !== "/" && !next.startsWith("/login")) {
    url.searchParams.set("next", next);
  }

  const redirected = NextResponse.redirect(url);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") redirected.headers.append(key, value);
  });
  return redirected;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|login).*)"],
};
