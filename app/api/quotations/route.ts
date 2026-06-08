import { NextResponse } from "next/server";

import { createQuotationRecord } from "@/lib/sales/quotation-service";

function errorStatus(message: string) {
  if (message === "Unauthorized") return 403;
  if (message.endsWith("not found") || message.includes("not found")) return 404;
  return 400;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const quotation = await createQuotationRecord(payload);
    return NextResponse.json(
      { id: quotation.id, href: `/sales/quotations/${quotation.id}` },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create quotation";
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
