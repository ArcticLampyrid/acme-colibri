import type { Context } from "hono";
import type { z } from "zod";
import { HttpError } from "./errors";

const formatIssues = (error: z.ZodError): string =>
  error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");

/** Validate `data`; throws a 400 `HttpError` describing the problems. */
export function validate<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, formatIssues(result.error));
  return result.data;
}

export const readJson = (c: Context): Promise<unknown> =>
  c.req.json().catch(() => {
    throw new HttpError(400, "request body must be JSON");
  });

export const parseJson = async <T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> =>
  validate(schema, await readJson(c));

export const isHttps = (c: Context): boolean => new URL(c.req.url).protocol === "https:";
