import { Worker } from "bullmq";
import { prisma } from "@psf/db";
import { createPrismaMissionStorage } from "@psf/orchestrator-api/storage";
import { QueueWorkerJobSchema } from "@psf/worker-runtime";
import { createDefaultJobHandler } from "./handlers.js";
import { processWorkerJob } from "./runner.js";

type RunnerMode = "start" | "once";

async function main(): Promise<void> {
  const mode = parseMode(process.argv[2] ?? "start");
  const redisUrl = process.env.PSF_REDIS_URL ?? "redis://127.0.0.1:6379";
  const prefix = process.env.PSF_QUEUE_PREFIX ?? "psf";
  const queueName = `${prefix}-worker-jobs`;
  const concurrency = Number.parseInt(process.env.PSF_WORKER_CONCURRENCY ?? "2", 10);
  const storage = createPrismaMissionStorage(prisma);
  const handler = createDefaultJobHandler(process.cwd());

  const worker = new Worker(queueName, async (bullJob) => {
    const parsed = QueueWorkerJobSchema.parse(bullJob.data.job ?? bullJob.data);
    return processWorkerJob({ job: parsed, storage, handler });
  }, {
    connection: buildRedisConnection(redisUrl),
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 2,
    prefix,
  });

  worker.on("error", (error) => {
    console.error(safeMessage(error));
  });

  if (mode === "once") {
    await runOnce(worker);
    await shutdown(worker);
    return;
  }

  process.once("SIGINT", () => {
    void shutdown(worker).then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown(worker).then(() => process.exit(0));
  });
  console.log(`Worker Runner listening on ${queueName} with concurrency ${concurrency}.`);
}

function parseMode(value: string): RunnerMode {
  if (value === "start" || value === "once") return value;
  throw new Error("Usage: pnpm --filter @psf/worker-runner <dev|once>");
}

async function runOnce(worker: Worker): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(), 1000);
    worker.once("completed", () => {
      clearTimeout(timeout);
      resolve();
    });
    worker.once("failed", (_job, error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function shutdown(worker: Worker): Promise<void> {
  await worker.close();
  await prisma.$disconnect();
}

function buildRedisConnection(redisUrl: string): Record<string, unknown> {
  const parsed = new URL(redisUrl);
  const dbText = parsed.pathname.replace("/", "");
  const connection: Record<string, unknown> = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    maxRetriesPerRequest: null,
  };
  if (parsed.username) connection.username = decodeURIComponent(parsed.username);
  if (parsed.password) connection.password = decodeURIComponent(parsed.password);
  if (dbText) connection.db = Number(dbText);
  return connection;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/:\/\/([^:@/\s]+):([^@/\s]+)@/g, "://$1:[REDACTED]@")
    .replace(/(token|password|secret|authorization)\s+[^\s]+/gi, "$1 [REDACTED]");
}

main().catch(async (error) => {
  console.error(safeMessage(error));
  await prisma.$disconnect();
  process.exit(1);
});
