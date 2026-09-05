# `timestamp.ts` — a standalone RFC 3161 client

**Status:** part of `@moonglade/provenance`, but written to be lifted out and used on its own.
**Dependencies:** none. `node:http`, `node:https`, `node:crypto` only.
**Size:** one file, ~980 lines, no build step required beyond your own TypeScript compile.

> [!warning] ‼️ **Read this before relying on it**
> **This module obtains and structurally validates RFC 3161 timestamps. It does not
> cryptographically verify them.** *There is no signature check over the timestamp token and no
> certificate chain validation anywhere in this file — `grep -c "createVerify\|\.verify("` returns
> zero, deliberately.*
>
> **What that means in practice:** the time you get back is trusted on the strength of TLS and the
> TSA's good behaviour, not proven by mathematics you performed. **See §3 before treating a
> `genTime` as evidence.**

---

## 1. Why it is separable

It began as the RFC 3161 half of a larger provenance package and turned out to have nothing to do
with the rest of it. It takes a SHA-256 digest and returns a timestamp; it neither knows nor cares
what produced the digest.

⭐ **So it is kept isolatable rather than spun into its own repository:** copy `src/timestamp.ts`
into your project, import what you need, and delete the rest. *There is no package to install, no
transitive dependency to audit, and nothing to keep in sync.*

**It is useful on its own to anyone who needs to prove a file existed by a certain moment** and does
not want a certificate toolchain to do it.

## 2. What it does

### RFC 3161 protocol

| | |
|---|---|
| `buildTimeStampReq(digest, opts)` | Builds a `TimeStampReq` in ASN.1 DER. Optional `nonce` and `certReq` |
| `queryTsa(url, tsq, timeoutMs)` | POSTs to a TSA over `application/timestamp-query`, returns the raw response |
| `parsePkiStatus(resp)` | RFC 3161 §2.4.2 `PKIStatusInfo` — the accept/reject code and its text |
| `validateTimeStampResp(resp, opts)` | Structural validation: status granted, digest matches, nonce matches |
| `extractGenTime(tsr)` | The asserted time, as an ISO string |

**ASN.1 DER encode and decode are hand-rolled** — `encodeDerLength`, `encodeDerSequence`,
`decodeDerLength` — which is why there are no dependencies. *They implement only what RFC 3161
needs, not a general ASN.1 library.*

### Availability, which is most of the file

**A single TSA is a single point of failure, and public ones are unreliable in ordinary use** — rate
limits, cooldowns, outages, and slow responses are the normal case rather than the exception.

- **Concurrent fan-out** across multiple TSAs, taking the first good response
- **Tiered endpoints** — `TIER_CONFIGS`, with primary and fallback sets
- **Per-server policies** — `DEFAULT_SERVER_POLICIES` carries per-endpoint cooldowns
  *(FreeTSA, for instance, wants 15 seconds between requests)*
- **Circuit breaker** — `EndpointCircuitBreaker` tracks endpoint health and stops hammering a TSA
  that is failing
- **Round-robin rotation** so load spreads rather than always hitting the first entry

## 3. ‼️ Limitations, stated plainly

### 3.1 It does not verify the timestamp's signature

**This is the one that matters.** A `TimeStampToken` is a CMS/PKCS#7 signed structure. This module
parses it and reads the time out of it. **It never checks that the TSA actually signed it.**

**Consequences:**

- ❌ **The asserted time is not proven.** *Anything able to return a well-formed response — a
  compromised TSA, a MITM able to break TLS, a mistyped URL pointing somewhere hostile — can assert
  any `genTime` it likes and this module will return it.*
- ❌ **No certificate chain validation, no revocation checking, no trust anchors.**
- ✅ **What you do get:** the response is well-formed, was granted rather than rejected, covers *your*
  digest, and matches *your* nonce. **That is meaningful** — it rules out replay and
  wrong-subject responses — *but none of it establishes authenticity of the time.*

⭐ **Verify separately before relying on a timestamp as evidence.** *OpenSSL does it in one command:*

```bash
openssl ts -verify -in token.tsr -data file.txt -CAfile tsa-cacert.pem
```

*The Python implementation in this project takes exactly that route. The TypeScript path stores
tokens for later verification rather than verifying them inline.*

### 3.2 Node only

`node:http`, `node:https` and `node:crypto` are hard requirements. **It will not run in a browser,
in a Cloudflare Worker, or on any edge runtime** without replacing the transport and the digest
calls.

### 3.3 Scope of the ASN.1 code

The DER helpers cover the structures RFC 3161 uses and nothing more. ⚠️ *Do not reach for them as a
general-purpose ASN.1 library — they will silently mishandle constructs this protocol never
produces.*

### 3.4 What it does not do

- **No token storage or format.** *It returns bytes; where they live is yours to decide.*
- **No hashing of your content.** *You supply a SHA-256 digest.*
- **No long-term validation (LTV), no timestamp renewal, no archive timestamps.**

## 4. Minimal use

```ts
import { createHash } from 'node:crypto';
import { buildTimeStampReq, queryTsa, validateTimeStampResp, extractGenTime } from './timestamp';

const digest = createHash('sha256').update(fileBytes).digest();
const nonce = crypto.randomBytes(8);

const tsq  = buildTimeStampReq(digest, { nonce, certReq: true });
const resp = await queryTsa('https://freetsa.org/tsr', tsq);

const result = validateTimeStampResp(resp, { expectedDigest: digest, expectedNonce: nonce });
if (!result.valid) throw new Error(result.error);

console.log('asserted time:', extractGenTime(resp));
// ‼️ Asserted, not verified. Keep `resp` and verify the signature separately.
```

## 5. Honest summary

**Use it when** you want RFC 3161 timestamps from Node with no dependency footprint, and you will
either verify the tokens elsewhere or you are recording time for operational rather than evidential
purposes.

**Do not use it alone when** the timestamp has to stand up to a hostile reader. *For that you need
signature verification over the token, and this module does not provide it.*

⭐ **The distinction is deliberate and it is the same one the rest of this project is built on:
obtaining a claim and proving a claim are different operations, and a tool that conflates them
teaches its users to trust something they have not checked.**

---

‼️ **Tracked as [finding 8](./FINDINGS.md) and open.** *Signature verification is intended — parsing
CMS `SignedData` and checking the signature belongs in this module. Trust-anchor and revocation
policy does not, and will stay with the caller.* **This document will change when that lands; until
it does, the limitation above is current.**
