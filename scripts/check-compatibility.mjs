import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(await readFile(path.join(root, "schema/contracts.schema.json"), "utf8"));
const baseline = JSON.parse(await readFile(path.join(root, "compat/1.0.0.surface.json"), "utf8"));
const errors = [];

for (const [name, frozen] of Object.entries(baseline.definitions)) {
  const current = schema.$defs[name];
  if (!current) {
    errors.push(`${name}: public definition was removed`);
    continue;
  }

  for (const value of frozen.enum ?? []) {
    if (!current.enum?.includes(value)) errors.push(`${name}: enum member ${JSON.stringify(value)} was removed`);
  }

  const currentProperties = Object.keys(current.properties ?? {});
  for (const property of frozen.properties ?? []) {
    if (!currentProperties.includes(property)) errors.push(`${name}: property ${property} was removed`);
  }

  const frozenRequired = new Set(frozen.required ?? []);
  const currentRequired = new Set(current.required ?? []);
  for (const property of frozenRequired) {
    if (!currentRequired.has(property)) errors.push(`${name}: required property ${property} was loosened; publish a reviewed contract revision`);
  }
  for (const property of currentRequired) {
    if (!frozenRequired.has(property)) errors.push(`${name}: new required property ${property} breaks 1.0 senders`);
  }

  const currentVariants = new Set(
    (current.oneOf ?? []).map((item) => item.$ref).filter(Boolean),
  );
  for (const variant of frozen.oneOfRefs ?? []) {
    if (!currentVariants.has(variant)) errors.push(`${name}: union variant ${variant} was removed`);
  }
}

if (errors.length > 0) {
  console.error(["Protocol compatibility check failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Protocol remains compatible with frozen surface ${baseline.protocolVersion}.`);
}
