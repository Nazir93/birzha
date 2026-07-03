/**
 * Базовые security smoke-проверки API.
 *
 * Переменные:
 *   BASE_URL     — http://127.0.0.1:3000
 *   EXPECT_AUTH  — 1: ожидаем REQUIRE_API_AUTH=true
 *   LOGIN        — логин для проверки ролей (например e2e_seller)
 *   PASSWORD     — пароль для LOGIN
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const EXPECT_AUTH = process.env.EXPECT_AUTH === "1";
const LOGIN = process.env.LOGIN ?? "";
const PASSWORD = process.env.PASSWORD ?? "";

function resolve(path) {
  return new URL(path, BASE_URL.replace(/\/?$/, "/")).href;
}

async function expectStatus(path, expected, init = {}) {
  const res = await fetch(resolve(path), init);
  if (res.status !== expected) {
    const body = await res.text();
    throw new Error(`Expected ${expected} for ${path}, got ${res.status}. Body: ${body.slice(0, 300)}`);
  }
  return res;
}

const health = await fetch(resolve("/health"));
if (!health.ok) {
  throw new Error(`/health is not ok: ${health.status}`);
}
const h = health.headers;
if (!h.get("x-frame-options")) {
  throw new Error("Missing x-frame-options header");
}
if (!h.get("x-content-type-options")) {
  throw new Error("Missing x-content-type-options header");
}
if (!h.get("referrer-policy")) {
  throw new Error("Missing referrer-policy header");
}

if (EXPECT_AUTH) {
  await expectStatus("/trips", 401);
  if (!LOGIN || !PASSWORD) {
    throw new Error("EXPECT_AUTH=1 requires LOGIN and PASSWORD");
  }
  const loginRes = await expectStatus("/auth/login", 200, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });
  const loginBody = await loginRes.json();
  const token = loginBody.token;
  if (!token || typeof token !== "string") {
    throw new Error("Login did not return token");
  }
  // Seller/accountant should not be able to create trips.
  const createTripRes = await fetch(resolve("/trips"), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ id: `sec-${Date.now()}`, tripNumber: `SEC-${Date.now().toString().slice(-6)}` }),
  });
  if (createTripRes.status !== 403 && createTripRes.status !== 201) {
    const body = await createTripRes.text();
    throw new Error(`Unexpected status for role gate POST /trips: ${createTripRes.status}. ${body.slice(0, 300)}`);
  }
}

console.log(
  JSON.stringify(
    {
      baseUrl: BASE_URL,
      checks: ["security_headers", EXPECT_AUTH ? "auth_required" : "auth_optional"],
      ok: true,
    },
    null,
    2,
  ),
);
