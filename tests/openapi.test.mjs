import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openapi = JSON.parse(await readFile(new URL("../openapi/openapi.json", import.meta.url), "utf8"));

function resolveLocalReference(document, reference) {
  if (!reference.startsWith("#/")) return true;
  return reference
    .slice(2)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => value?.[part], document) !== undefined;
}

function collectReferences(value, references = []) {
  if (value === null || typeof value !== "object") return references;
  if (typeof value.$ref === "string") references.push(value.$ref);
  for (const child of Object.values(value)) collectReferences(child, references);
  return references;
}

test("contains no unresolved local OpenAPI references", () => {
  const unresolved = collectReferences(openapi).filter((reference) => !resolveLocalReference(openapi, reference));
  assert.deepEqual(unresolved, []);
});

test("publishes the required OpenAPI 3.1 authority surface", () => {
  assert.equal(openapi.openapi, "3.1.0");
  for (const path of [
    "/v1/auth/channel/exchange",
    "/v1/player",
    "/v1/player/commands",
    "/v1/pvp/sessions",
    "/v1/pvp/commands",
    "/v1/pvp/events",
  ]) {
    assert.ok(openapi.paths[path], `missing ${path}`);
  }
  assert.deepEqual(openapi.paths["/v1/auth/channel/exchange"].post.security, []);
  assert.ok(openapi.paths["/v1/pvp/commands"].post.parameters.some((parameter) => parameter.$ref?.includes("IdempotencyKey")));
  assert.equal(
    openapi.paths["/v1/player/commands"].post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/PlayerCommandEnvelope",
  );
  assert.equal(
    openapi.paths["/v1/pvp/commands"].post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/BattleCommandEnvelope",
  );
  assert.ok(openapi.paths["/v1/pvp/commands"].post.parameters.some((parameter) => parameter.name === "matchId"));
});

test("admin migration writes require the admin security scheme", () => {
  const operation = openapi.paths["/v1/admin/legacy-save-imports/{migrationId}/apply"].post;
  assert.deepEqual(operation.security, [{ adminBearerAuth: [] }]);
  assert.equal(operation.requestBody.content["application/json"].schema.properties.confirmed.const, true);
});
