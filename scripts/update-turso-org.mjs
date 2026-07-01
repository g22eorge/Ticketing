import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({ url, authToken: token });

try {
  const res = await client.execute(
    `UPDATE "Organization" SET name = 'Techserve ICT Solutions', slug = 'techserve' WHERE name = 'Eagle Info Solutions' OR slug = 'eagle-info'`
  );
  console.log(`✅ Organization updated (rows affected: ${res.rowsAffected || 0})`);
} catch (err) {
  console.error("❌ Failed to update Organization:", err);
  process.exit(1);
} finally {
  await client.close();
}