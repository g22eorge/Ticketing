import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

async function main() {
  if (!url || !authToken) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
    process.exit(1);
  }

  try {
    const client = createClient({ url, authToken });
    const result = await client.execute("SELECT 1 as test");
    console.log("✅ Turso connected successfully:", result.rows);
    process.exit(0);
  } catch (error) {
    console.error("❌ Turso connection failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
