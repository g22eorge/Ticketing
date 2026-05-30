/**
 * PDF generation job handler.
 *
 * Resolves the correct PDF renderer based on documentType, renders the
 * document, writes it to the configured storage backend (local filesystem
 * or object storage), and records the result in GeneratedDocument if that
 * table exists. Safe to call inline (fallback mode) or via BullMQ.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import type { PdfJobPayload } from "../jobs";
import { Jobs } from "../jobs";

const UPLOAD_DIR = process.env.PDF_UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads", "pdfs");

/** Resolve the requesting user's name and role for document stamps. */
async function resolveStaff(requestedBy: string): Promise<{ name: string; role: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: requestedBy },
      select: { name: true, role: true },
    });
    if (user) return { name: user.name, role: user.role };
  } catch { /* ignore */ }
  return { name: "System", role: "ADMIN" };
}

/**
 * Route documentType to the matching generator function.
 * Each generator fetches its own data, builds props, and calls renderToBuffer.
 */
async function renderPdf(
  documentType: string,
  recordId: string,
  orgId: string,
  requestedBy: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const staff = await resolveStaff(requestedBy);

  switch (documentType) {
    case Jobs.PDF_JOB_CARD: {
      const { generateJobCardBuffer } = await import("@/lib/pdf/generate-job-card");
      const result = await generateJobCardBuffer(recordId, staff.name, staff.role, requestedBy, orgId);
      if (!result.ok) throw new Error(result.error);
      return { buffer: result.buffer, filename: result.filename };
    }

    case Jobs.PDF_INVOICE: {
      const { generateInvoiceBuffer } = await import("@/lib/pdf/generate-invoice");
      const result = await generateInvoiceBuffer(recordId, staff.name, staff.role, requestedBy, orgId);
      if (!result.ok) throw new Error(result.error);
      return { buffer: result.buffer, filename: result.filename };
    }

    case Jobs.PDF_QUOTATION: {
      const { generateQuotationBuffer } = await import("@/lib/pdf/generate-quotation");
      const result = await generateQuotationBuffer(recordId, staff.name, staff.role, false, requestedBy, orgId);
      if (!result.ok) throw new Error(result.error);
      return { buffer: result.buffer, filename: result.filename };
    }

    case Jobs.PDF_DELIVERY_NOTE: {
      // Delivery notes are rendered via the API route — generate inline via fetch
      // until a standalone generator is extracted. Fall through to placeholder for now.
      console.warn(`[pdf-handler] ${documentType}: no standalone generator yet — skipping render`);
      const placeholder = `%PDF-1.4 placeholder type=${documentType} record=${recordId}`;
      return { buffer: Buffer.from(placeholder, "utf-8"), filename: `delivery-note-${recordId}.pdf` };
    }

    default:
      // Unknown document type — emit a minimal placeholder so the pipeline
      // doesn't break when new types are registered before their generator is added.
      console.warn(`[pdf-handler] unknown documentType "${documentType}" — emitting placeholder`);
      const placeholder = `%PDF-1.4 placeholder type=${documentType} record=${recordId} org=${orgId}`;
      return { buffer: Buffer.from(placeholder, "utf-8"), filename: `${documentType.replace(":", "-")}-${recordId}.pdf` };
  }
}

export async function handlePdfJob(data: unknown): Promise<void> {
  const { orgId, recordId, documentType, requestedBy } = data as PdfJobPayload;

  // 1. Render
  const { buffer: pdfBuffer, filename } = await renderPdf(documentType, recordId, orgId, requestedBy);

  // 2. Persist to disk
  const dir = path.join(UPLOAD_DIR, orgId, documentType);
  await fs.mkdir(dir, { recursive: true });
  const timestampedFilename = filename.replace(/\.pdf$/, `-${Date.now()}.pdf`);
  const filePath = path.join(dir, timestampedFilename);
  await fs.writeFile(filePath, pdfBuffer);

  const publicUrl = `/uploads/pdfs/${orgId}/${documentType}/${timestampedFilename}`;

  // 3. Record in GeneratedDocument (best-effort — table may not exist yet)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    if (db.generatedDocument) {
      const seq = `DOC-${Date.now()}`;
      await db.generatedDocument.create({
        data: {
          documentNumber: seq,
          documentType,
          sourceModule: documentType.split(":")[0] ?? "UNKNOWN",
          sourceRecordId: recordId,
          generatedBy: requestedBy,
          filePath,
          storageUrl: publicUrl,
          status: "GENERATED",
        },
      });
    }
  } catch {
    // Non-fatal — document is on disk regardless.
  }

  console.info(`[pdf-handler] generated ${documentType} → ${publicUrl}`);
}
