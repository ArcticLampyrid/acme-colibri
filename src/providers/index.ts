import { z } from "zod";
import { decryptJson } from "../lib/crypto";
import { cloudflare } from "./cloudflare";
import type { DnsProvider, ProviderDefinition, ProviderField } from "./types";

/** Register new providers here; everything else (validation, encryption, UI form) derives from `fields`. */
const definitions: readonly ProviderDefinition[] = [cloudflare];

export const listProviderTypes = () =>
  definitions.map(({ type, label, fields }) => ({ type, label, fields }));

export const getProviderDefinition = (type: string): ProviderDefinition | undefined =>
  definitions.find((d) => d.type === type);

/** Associated data binding a secrets ciphertext to its zone provider row. */
export const secretsAad = (zoneProviderId: string) => `zone-provider:${zoneProviderId}`;

/** Decrypt a stored zone provider and build its upstream client. */
export async function instantiateProvider(
  secretKey: string,
  row: { id: string; type: string; config: Record<string, string>; secretsEnc: string },
): Promise<DnsProvider> {
  const def = getProviderDefinition(row.type);
  if (!def) throw new Error(`zone provider "${row.id}" has unknown type "${row.type}"`);
  const secrets = (await decryptJson(secretKey, secretsAad(row.id), row.secretsEnc)) as Record<string, string>;
  return def.create({ ...row.config, ...secrets });
}

const fieldValue = z.string().trim().min(1).max(2048);
const shapeOf = (fields: readonly ProviderField[]) =>
  Object.fromEntries(fields.map((f) => [f.name, fieldValue]));

type FieldValues = z.ZodType<Record<string, string>>;

/**
 * Zod schemas for the non-secret (`config`) and secret (`secrets`) halves of a provider's fields.
 * With `partial`, any subset of the fields is accepted (parsed objects never contain undefined values).
 */
export function fieldSchemas(
  def: ProviderDefinition,
  { partial }: { partial: boolean },
): { config: FieldValues; secrets: FieldValues } {
  const build = (secret: boolean): FieldValues => {
    const obj = z.object(shapeOf(def.fields.filter((f) => f.secret === secret))).strict();
    return (partial ? obj.partial() : obj) as FieldValues;
  };
  return { config: build(false), secrets: build(true) };
}
