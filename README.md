# Moonglade Provenance 2.7.0

[![npm version](https://img.shields.io/npm/v/@moonglade/provenance.svg)](https://www.npmjs.com/package/@moonglade/provenance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Moonglade provenance signs files and checks their integrity. It combines Ed25519 signatures, RFC 3161 timestamp verification, and Merkle inclusion proofs in an isomorphic Node.js library, CLI, and read-only MCP server.

Available on npm as `@moonglade/provenance`:
```sh
npm install @moonglade/provenance
```

This repository is the open-source staging distribution of `@moonglade/provenance` v2.7.0.

## Installation & Quick Start

Install directly via npm:
```sh
npm install @moonglade/provenance
```

Or install globally to use the CLI and stdio MCP server:
```sh
npm install -g @moonglade/provenance
provenance --help
# Start the stdio JSON-RPC 2.0 MCP server (reads from stdin):
provenance-gate # or via npx: npx -y --package=@moonglade/provenance provenance-gate
```

## Build and test from source

Use Node 22 or 24 on Windows or Linux. From the repository root:

```sh
npm ci
npm test
npm run self-test
```

[TESTING.md](TESTING.md) describes the suites, recorded results and coverage limits. The [package README](packages/provenance-ts/README.md) has the API and CLI quickstart, including an example that uses caller-supplied keys.

## What a seal establishes

A valid signature binds the signed payload to a supplied key. It establishes integrity under that key; it cannot establish whether the content is true, who actually wrote it, or whether an AI performs better because it uses provenance.

Text checks normalize the encodings listed in the [specification](packages/provenance-ts/SPEC.md). Binary files retain their exact bytes. Keyless sidecar checks (`HASH_ONLY` badges) confirm unmutated file hashes against an editable sidecar but provide zero cryptographic signature assurance and MUST NOT be used for authorization decisions. Timestamp trust requires caller-supplied certificate anchors. Certificate revocation is not checked.

No controlled evaluation in this release demonstrates improved agent behavior or performance. Standing instructions and operator choices would need to be controlled in such a study.

## Release information

See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md) and [AI-DISCLOSURE.md](AI-DISCLOSURE.md).

The staging repository is [MoongladeAI/provenance](https://github.com/MoongladeAI/provenance). Private security reporting must be checked before publication. The candidate documentation has no provenance sidecars, and the root release signature remains a separate human act. The private development monorepo remains the development home; its earlier history and integration code are excluded here.

## Dedication

> *Dedicated to my Godchildren. The promise of a better future for you begins with Provenance.*

The dedication, thanks and intellectual influences are in [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md).
