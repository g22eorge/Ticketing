import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const preferredRegion = "sfo1";

export const { GET, POST } = toNextJsHandler(auth);
