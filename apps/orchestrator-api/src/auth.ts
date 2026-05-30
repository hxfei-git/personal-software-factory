import type { FastifyInstance } from "fastify";
import { unauthorized } from "./errors.js";

export interface ApiAuthOptions {
  token?: string;
  disabled?: boolean;
}

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function registerApiAuth(server: FastifyInstance, options: ApiAuthOptions): void {
  server.addHook("preHandler", async (request) => {
    if (!writeMethods.has(request.method)) {
      return;
    }
    if (request.url === "/health" || options.disabled === true) {
      return;
    }
    const token = options.token;
    const header = request.headers.authorization ?? "";
    if (!token || header !== `Bearer ${token}`) {
      throw unauthorized();
    }
  });
}
