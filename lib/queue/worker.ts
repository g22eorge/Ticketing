/**
 * BullMQ Worker — intended to be run as a standalone process.
 *
 * Start it alongside the Next.js server:
 *   bun lib/queue/worker.ts
 *
 * Or add to render.yaml / Dockerfile as a separate service.
 * When Redis is absent the process exits cleanly (no-op).
 */
import { Worker } from "bullmq";
import { getRedisConnection } from "./redis";
import { QUEUE_NAME, Jobs } from "./jobs";
import { handlePdfJob } from "./handlers/pdf";
import { handleSlaEscalate, handleSlaRepairOverdue, handleSlaPoOverdue } from "./handlers/sla";
import { handleApprovalReminder } from "./handlers/approval-reminder";
import { handleLandedCostRecalc } from "./handlers/landed-cost";
import { registerFallbackHandler } from "./index";

// Register in-process fallback handlers (used when Redis is absent).
registerFallbackHandler(Jobs.PDF_JOB_CARD, handlePdfJob);
registerFallbackHandler(Jobs.PDF_INVOICE, handlePdfJob);
registerFallbackHandler(Jobs.PDF_QUOTATION, handlePdfJob);
registerFallbackHandler(Jobs.PDF_STOCK_TRANSFER, handlePdfJob);
registerFallbackHandler(Jobs.PDF_PURCHASE_ORDER, handlePdfJob);
registerFallbackHandler(Jobs.PDF_PARTS_REQUEST, handlePdfJob);
registerFallbackHandler(Jobs.PDF_DELIVERY_NOTE, handlePdfJob);
registerFallbackHandler(Jobs.PDF_SUPPLIER_STATEMENT, handlePdfJob);
registerFallbackHandler(Jobs.SLA_APPROVAL_ESCALATE, handleSlaEscalate);
registerFallbackHandler(Jobs.SLA_REPAIR_OVERDUE, handleSlaRepairOverdue);
registerFallbackHandler(Jobs.SLA_PO_OVERDUE, handleSlaPoOverdue);
registerFallbackHandler(Jobs.APPROVAL_REMINDER, handleApprovalReminder);
registerFallbackHandler(Jobs.APPROVAL_FINAL_NOTICE, handleApprovalReminder);
registerFallbackHandler(Jobs.LANDED_COST_RECALC, handleLandedCostRecalc);

// Only spin up a BullMQ Worker when Redis is configured.
const conn = getRedisConnection();

if (!conn) {
  process.exit(0);
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const name = job.name as keyof typeof Jobs;
    console.info(`[worker] processing ${job.name} id=${job.id}`);

    switch (job.name) {
      // PDF
      case Jobs.PDF_JOB_CARD:
      case Jobs.PDF_INVOICE:
      case Jobs.PDF_QUOTATION:
      case Jobs.PDF_STOCK_TRANSFER:
      case Jobs.PDF_PURCHASE_ORDER:
      case Jobs.PDF_PARTS_REQUEST:
      case Jobs.PDF_DELIVERY_NOTE:
      case Jobs.PDF_SUPPLIER_STATEMENT:
        return handlePdfJob(job.data);

      // SLA
      case Jobs.SLA_APPROVAL_ESCALATE:
        return handleSlaEscalate(job.data);
      case Jobs.SLA_REPAIR_OVERDUE:
        return handleSlaRepairOverdue(job.data);
      case Jobs.SLA_PO_OVERDUE:
        return handleSlaPoOverdue(job.data);

      // Approvals
      case Jobs.APPROVAL_REMINDER:
      case Jobs.APPROVAL_FINAL_NOTICE:
        return handleApprovalReminder(job.data);

      // Landed cost
      case Jobs.LANDED_COST_RECALC:
      case Jobs.LANDED_COST_ALLOCATE:
        return handleLandedCostRecalc(job.data);

      default:
        console.warn(`[worker] unhandled job name: ${name}`);
    }
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: conn as any,
    concurrency: 4,
  },
);

worker.on("completed", (job) => {
  console.info(`[worker] completed ${job.name} id=${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] failed ${job?.name} id=${job?.id}:`, err.message);
});

process.on("SIGTERM", async () => {
  console.info("[worker] SIGTERM — draining...");
  await worker.close();
  process.exit(0);
});
