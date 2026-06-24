/**
 * Queue facade.
 *
 * When Redis is available (REDIS_URL is set):
 *   - Uses BullMQ Queue for durable, retryable background jobs.
 *
 * When Redis is not available:
 *   - Falls back to an immediate in-process executor that runs the handler
 *     synchronously (best-effort, no retry). Safe for SQLite-only dev
 *     environments and CI where Redis is absent.
 *
 * Usage from any server module:
 *   import { enqueue } from "@/lib/queue";
 *   import { Jobs } from "@/lib/queue/jobs";
 *   await enqueue(Jobs.PDF_JOB_CARD, { orgId, recordId, ... });
 */
import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis";
import { QUEUE_NAME, type JobName } from "./jobs";

// ── BullMQ queue instance (created lazily) ───────────────────────────────────

let _queue: Queue | null = null;

function getQueue(): Queue | null {
  if (_queue) return _queue;
  const conn = getRedisConnection();
  if (!conn) return null;
  _queue = new Queue(QUEUE_NAME, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: conn as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  return _queue;
}

// ── In-process fallback registry ─────────────────────────────────────────────

type Handler = (data: unknown) => Promise<void>;
const _fallbackRegistry = new Map<JobName, Handler>();

export function registerFallbackHandler(jobName: JobName, handler: Handler) {
  _fallbackRegistry.set(jobName, handler);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enqueue<T>(
  jobName: JobName,
  data: T,
  opts?: JobsOptions,
): Promise<string | null> {
  const queue = getQueue();

  if (queue) {
    const job = await queue.add(jobName, data, opts);
    return job.id ?? null;
  }

  // Fallback: run inline, swallow errors so callers are unaffected.
  const handler = _fallbackRegistry.get(jobName);
  if (handler) {
    try {
      await handler(data);
    } catch (err) {
      console.error(`[queue/fallback] ${jobName} failed:`, err);
    }
  } else {
    // No handler registered and Redis unavailable — silent no-op.
  }

  return null;
}

/**
 * Schedule a job to run after a delay.
 * @param delayMs Milliseconds from now.
 */
export async function enqueueDelayed<T>(
  jobName: JobName,
  data: T,
  delayMs: number,
  opts?: JobsOptions,
): Promise<string | null> {
  return enqueue(jobName, data, { ...opts, delay: delayMs });
}

/**
 * Schedule a repeating job using a cron expression.
 * No-op when Redis is not available.
 */
export async function enqueueRecurring<T>(
  jobName: JobName,
  data: T,
  pattern: string,
): Promise<void> {
  const queue = getQueue();
  if (!queue) return;
  await queue.add(jobName, data, { repeat: { pattern } });
}

export { getQueue };
