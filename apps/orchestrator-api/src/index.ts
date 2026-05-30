import { prisma } from "@psf/db";
import { buildServer } from "./server.js";
import { createPrismaMissionStorage } from "./storage.js";

const host = process.env.ORCHESTRATOR_HOST ?? "127.0.0.1";
const port = Number(process.env.ORCHESTRATOR_PORT ?? "3000");
const server = buildServer({ storage: createPrismaMissionStorage(prisma) });

try {
  await server.listen({ host, port });
  console.log("Orchestrator API listening on http://" + host + ":" + port);
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
