import { z } from "zod";

export const CustomerInput = z.object({
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().email("invalid email").optional().nullable(),
  phone: z.string().trim().min(1).optional().nullable(),
  city: z.string().trim().min(1).optional().nullable(),
  optedOut: z.boolean().optional().default(false),
  attributes: z.record(z.string(), z.any()).optional().default({}),
});
export type CustomerInputT = z.infer<typeof CustomerInput>;

export const OrderInput = z.object({
  customerId: z.string().min(1, "customerId is required"),
  amount: z.number().nonnegative("amount must be >= 0"),
  products: z.union([z.array(z.any()), z.record(z.string(), z.any())]),
  channel: z.string().trim().min(1, "channel is required"),
  orderedAt: z.coerce.date(), // accepts ISO string or Date
  externalId: z.string().trim().min(1).optional().nullable(), // for dedup
});
export type OrderInputT = z.infer<typeof OrderInput>;
