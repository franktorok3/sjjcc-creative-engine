import { z } from "zod";

export const basecampPostSmokeBodySchema = z.object({
  subject: z.string().min(1),
  content: z.string().min(1),
});
