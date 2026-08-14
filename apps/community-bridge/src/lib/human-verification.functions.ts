import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { beginHumanTransaction, completeHumanTransaction } from "@/lib/human-verification.server";

const identity = z.string().trim().max(80).optional();

export const startHumanVerification = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ slug: identity, brandId: identity }).parse(data))
  .handler(async ({ data }) => ({ context: await beginHumanTransaction(data) }));

export const finishHumanVerification = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    grant: z.string().min(32).max(4096),
    context: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  }).parse(data))
  .handler(async ({ data }) => completeHumanTransaction(data));
