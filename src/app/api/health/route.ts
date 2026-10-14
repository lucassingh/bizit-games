import { connection } from "next/server";

/** Chequeo simple para saber si hay salida a internet desde el kiosco. */
export async function GET() {
  await connection();
  return Response.json({ ok: true, odoo: process.env.ODOO_MODE || "mock", at: new Date().toISOString() });
}
