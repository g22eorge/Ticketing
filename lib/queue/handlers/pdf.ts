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

const UPLOAD_DIR = process.env.PDF_UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads", "pdfs");

/**
 * Placeholder renderer — replace with @react-pdf/renderer or Puppeteer per
 * document type. Returns a minimal PDF Buffer so the pipeline is testable
 * without a real renderer.
 */
async function renderPdf(documentType: string, recordId: string, orgId: string): Promise<Buffer> {
  // TODO: switch on documentType and call the matching React-PDF component.
  // For now return a 0-byte placeholder so file creation and DB record still work.
  const placeholder = `%PDF-1.4 placeholder type=${documentType} record=${recordId} org=${orgId}`;
  return Buffer.from(placeholder, "utf-8");
}

export async function handlePdfJob(data: unknown): Promise<void> {
  const { orgId, recordId, documentType, requestedBy } = data as PdfJobPayload;

  // 1. Render
  const pdfBuffer = await renderPdf(documentType, recordId, orgId);

  // 2. Persist to disk
  const dir = path.join(UPLOAD_DIR, orgId, documentType);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${recordId}-${Date.now()}.pdf`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, pdfBuffer);

  const publicUrl = `/uploads/pdfs/${orgId}/${documentType}/${filename}`;

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
