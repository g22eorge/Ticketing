import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Loads the TIIS logo from public/tiis-logo.png as a base64 data URI. */
export function loadTiisLogo(): string | null {
  try {
    const buf = readFileSync(join(process.cwd(), "public", "tiis-logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
