import { createCookieSessionStorage, redirect } from "@remix-run/node";
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || "admin-fallback-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ReverseBundle@Admin2026!";

const adminSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__admin_session",
    httpOnly: true,
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
    sameSite: "lax",
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
  },
});

function getAdminSession(request: Request) {
  return adminSessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAdmin(request: Request) {
  const session = await getAdminSession(request);
  const isAuthenticated = session.get("isAdmin");
  if (!isAuthenticated) {
    throw redirect("/admin/login");
  }
  return session;
}

export async function adminLogin(request: Request, password: string) {
  const isValid = crypto.timingSafeEqual(
    Buffer.from(password),
    Buffer.from(ADMIN_PASSWORD)
  );

  if (!isValid) {
    return { error: "Invalid password" };
  }

  const session = await getAdminSession(request);
  session.set("isAdmin", true);
  session.set("loginAt", new Date().toISOString());

  return {
    success: true,
    headers: {
      "Set-Cookie": await adminSessionStorage.commitSession(session),
    },
  };
}

export async function adminLogout(request: Request) {
  const session = await getAdminSession(request);
  return redirect("/admin/login", {
    headers: {
      "Set-Cookie": await adminSessionStorage.destroySession(session),
    },
  });
}
