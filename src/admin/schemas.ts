import { z } from "zod";

/** User-defined ids (Zone Provider ID, Access ID). Safe in Basic auth and URLs. */
export const idSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "must be 1-64 chars of a-z, 0-9, '-' or '_', starting with a letter or digit");
