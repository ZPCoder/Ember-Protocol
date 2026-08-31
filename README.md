# ember-protocol

Public, versioned contracts shared by Ember Protocol clients, the SDK and
backend services. This package contains no gameplay implementation.

## Contract policy

- `schema/contracts.schema.json` is the canonical JSON Schema 2020-12 source.
- `src/generated/contracts.ts` is generated from that schema and checked for
  drift in CI.
- `openapi/openapi.json` is the OpenAPI 3.1 HTTP surface.
- Runtime validation rejects unknown fields on authority-sensitive messages.
- `CommandEnvelope<T>` remains generic in generated TypeScript; HTTP binds
  `/v1/player/commands` to `PlayerCommandEnvelope` and PVP to
  `BattleCommandEnvelope`, so command families cannot cross authority domains.
- A server supports the current and previous protocol minor. A major mismatch
  returns `PROTOCOL_MAJOR_UNSUPPORTED`; clients must stop entering the game and
  request an update.
- Breaking changes require a new protocol major. Existing required fields or
  enum members cannot disappear within a major.

## Commands

```sh
npm install
npm test
npm run build
```

Use `validateContract("ChannelLoginRequest", value)` at an untrusted boundary.
Use `assertContract(...)` when an exception is the desired failure path.

The OpenAPI surface exposes:

- `POST /v1/auth/channel/exchange`
- `GET /v1/player`
- `POST /v1/player/commands`
- `POST /v1/pvp/sessions`
- `POST /v1/pvp/commands`
- `GET /v1/pvp/events`
- `POST /v1/admin/legacy-save-imports/preview`
- `POST /v1/admin/legacy-save-imports/{migrationId}/apply`

Publishing is configured for the private `ZPCoder` GitHub Packages scope.
