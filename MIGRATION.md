# Migration provenance

This repository was extracted from the Ember Protocol monolith after its
verified freeze.

- Source repository: `ZPCoder/Ember-Protocol`
- Source tag: `monolith-freeze-v1`
- Source commit: `ba8610c7664f0f8a7cfdd70f479e61c8c41a77d1`
- Extraction policy: contracts are intentionally rewritten as a standalone,
  versioned public surface; no client or server implementation is authoritative
  here.

Every initial migration commit must retain this file so a published contract
can be traced to the frozen monolith.
