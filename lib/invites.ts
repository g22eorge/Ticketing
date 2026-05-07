/**
 * invites.ts — shared helpers for user invite token logic.
 */

import { Role } from "@prisma/client";
import { z } from "zod";

export const INVITE_TTL_DAYS = 7;

export const inviteSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.nativeEnum(Role).refine((v) => Boolean(v), { message: "Select a valid role" }),
});

export type InviteState = {
  error?: string;
  inviteUrl?: string;
  fieldErrors?: { email?: string[]; role?: string[] };
};
