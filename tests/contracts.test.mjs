import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT_PROTOCOL_VERSION,
  ERROR_CODES,
  assertContract,
  checkProtocolVersion,
  validateContract,
} from "../dist/index.js";

const contractSchema = JSON.parse(await readFile(new URL("../schema/contracts.schema.json", import.meta.url), "utf8"));

test("contains no unresolved local JSON Schema references", () => {
  const references = [];
  const visit = (value) => {
    if (value === null || typeof value !== "object") return;
    if (typeof value.$ref === "string") references.push(value.$ref);
    for (const child of Object.values(value)) visit(child);
  };
  visit(contractSchema);
  const unresolved = references.filter((reference) => {
    if (!reference.startsWith("#/$defs/")) return false;
    return contractSchema.$defs[reference.slice("#/$defs/".length)] === undefined;
  });
  assert.deepEqual(unresolved, []);
});

test("validates channel login without trusting a client UID", () => {
  const request = {
    platform: "4399",
    ticket: "one-time-platform-ticket",
    clientVersion: "1.2.3",
    protocolVersion: "1.0",
  };
  assert.deepEqual(validateContract("ChannelLoginRequest", request), { ok: true, value: request });

  const forged = { ...request, uid: "forged-client-uid" };
  const result = validateContract("ChannelLoginRequest", forged);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.keyword, "additionalProperties");
});

test("validates a generic command envelope and all authority metadata", () => {
  const envelope = {
    protocolVersion: "1.0",
    requestId: "request-1",
    idempotencyKey: "idem-key-0001",
    expectedVersion: 7,
    command: {
      type: "use-titan-ability",
      player: 0,
      unitId: "unit-4",
      abilityIndex: 2,
    },
  };
  assert.doesNotThrow(() => assertContract("CommandEnvelope", envelope));
  assert.doesNotThrow(() => assertContract("BattleCommandEnvelope", envelope));
  assert.equal(validateContract("PlayerCommandEnvelope", envelope).ok, false);
  assert.equal(validateContract("CommandEnvelope", { ...envelope, expectedVersion: -1 }).ok, false);
});

test("keeps player and battle envelopes distinct while preserving CommandEnvelope<T>", () => {
  const playerEnvelope = {
    protocolVersion: "1.0",
    requestId: "player-command-1",
    idempotencyKey: "player-idem-0001",
    expectedVersion: 3,
    command: {
      type: "save-deck",
      deck: { slot: 2, name: "星火", format: "standard", cardIds: ["sun-dawn-scout"] },
    },
  };
  assert.equal(validateContract("PlayerCommandEnvelope", playerEnvelope).ok, true);
  assert.equal(validateContract("CommandEnvelope", playerEnvelope).ok, true);
  assert.equal(validateContract("BattleCommandEnvelope", playerEnvelope).ok, false);
});

test("redacted snapshots forbid unknown hidden-state fields", () => {
  const publicPlayer = {
    playerId: "player-2",
    heroHealth: 30,
    heroArmor: 0,
    mana: 2,
    maxMana: 2,
    deckCount: 28,
    handCount: 4,
    board: [],
  };
  const snapshot = {
    matchId: "match-1",
    stateVersion: 4,
    cursor: 9,
    phase: "playing",
    turn: 2,
    activePlayerId: "player-1",
    viewer: { ...publicPlayer, playerId: "player-1", hand: [] },
    opponent: { ...publicPlayer, deckOrder: ["secret-card"] },
    winnerId: null,
  };
  assert.equal(validateContract("RedactedMatchSnapshot", snapshot).ok, false);
});

test("validates the cross-repository PVP envelope fixture", async () => {
  const bytes = await readFile(new URL("./fixtures/pvp-event-envelope-1.0.json", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "29cc406cc852da94a71bf6d6a4d834af6faa4528f38c6652a09d73792368c684");
  const fixture = JSON.parse(bytes.toString("utf8"));
  assert.equal(validateContract("PvpEventEnvelope", fixture).ok, true);
  assert.equal(Object.hasOwn(fixture.snapshot.opponent, "hand"), false);
});

test("legacy saves reject negative and over-limit assets", () => {
  const save = {
    schemaVersion: 1,
    commanderName: "测试指挥官",
    collection: { "sun-dawn-scout": 2 },
    gold: 100,
    dust: 50,
    packs: { core: 1 },
    decks: [],
    format: "standard",
    record: { wins: 3, losses: 2, draws: 0 },
  };
  assert.equal(validateContract("LegacyFlutterSaveV1", save).ok, true);
  assert.equal(validateContract("LegacyFlutterSaveV1", { ...save, gold: -1 }).ok, false);
  assert.equal(validateContract("LegacyFlutterSaveV1", { ...save, collection: { bad: 1000 } }).ok, false);
});

test("supports only current and previous protocol minor", () => {
  assert.equal(CURRENT_PROTOCOL_VERSION, "1.0");
  assert.equal(checkProtocolVersion("2.0").reason, "unsupported-major");
  assert.equal(checkProtocolVersion("1.3", "1.3").compatible, true);
  assert.equal(checkProtocolVersion("1.2", "1.3").compatible, true);
  assert.equal(checkProtocolVersion("1.1", "1.3").compatible, false);
  assert.ok(ERROR_CODES.includes("AUTH_TICKET_REPLAYED"));
});

test("telemetry accepts only controlled property names", () => {
  const event = {
    eventId: "event-0000000001",
    schemaVersion: 1,
    sessionId: "session-1",
    occurredAt: "2026-08-31T00:00:00.000Z",
    eventName: "performance_sample",
    properties: { fps: 60, memoryMb: 512 },
  };
  assert.equal(validateContract("GameEvent", event).ok, true);
  assert.equal(validateContract("GameEvent", { ...event, properties: { arbitraryUserText: "leak" } }).ok, false);
});
