import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({
  url,
  authToken: token,
});

const sql = `
CREATE TABLE IF NOT EXISTS "Survey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 5,
  "comment" TEXT,
  "orgId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE ("ticketId")
);
`;

try {
  await client.execute(sql);
  console.log("✅ Survey table ensured on Turso");
} catch (err) {
  console.error("❌ Failed to create Survey table:", err);
  process.exit(1);
} finally {
  await client.close();
}