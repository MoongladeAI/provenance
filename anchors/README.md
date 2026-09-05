# Published epoch anchors

Each file here is one **epoch root** and the RFC 3161 timestamp token taken over it.

An epoch root is the RFC 6962 Merkle root across an entire sealed archive. Because the root commits
to every leaf, a single token over it makes the whole collection tamper-evident — including
artifacts that carry no signature of their own. Publishing the root here puts that evidence outside
the repository holding the artifacts, which is the point: an operator who can rewrite an archive and
its own recorded hashes cannot reach a copy that lives somewhere else.

**A root hash discloses nothing.** No filename, path, title or content is recoverable from it. That
is what makes publication safe for a private archive.

---

## Verifying one

You need only the JSON file. No access to the sealed archive is required.

```bash
ROOT=$(jq -r .merkle_root_sha256 epoch-67.json)

printf %s "$ROOT" > root.txt
jq -r .anchor.token_b64 epoch-67.json | base64 -d > epoch.tsr

# 1. The token must commit to this exact root.
openssl ts -reply -in epoch.tsr -text        # messageImprint == sha256(root.txt)

# 2. The TSA must have signed it.
openssl ts -verify -data root.txt -in epoch.tsr -CAfile <tsa-ca-bundle>
```

The timestamped payload is the **64-character lowercase hex root as ASCII, with no trailing
newline** — `printf %s`, not `echo`. A trailing newline changes the digest and the check fails.

## Proving one artifact belongs

An inclusion proof verifies a single document against a published root in ~log₂(n) hashes, without
revealing any other artifact. See `verifyProof` in [`../src/merkle.ts`](../src/merkle.ts); it needs
the leaf, its audit path, and the root from this directory, and nothing else.

## What this does and does not establish

| | |
|---|---|
| ✅ | The root existed no later than `tsa_time` |
| ✅ | Every artifact under that root is fixed as of that moment |
| ❌ | **Append-only history.** Epochs are published latest-only and are not chained |

Chaining is specified and deliberately not built — see `EPOCH_CHAINING.md`. Until it lands, each
anchor stands alone: it fixes one root at one time, and says nothing about what preceded it.

The token's own limitation applies too. `openssl ts -verify` performs the certificate-chain check
that this package's TypeScript path does not; see the warning in [`../README.md`](../README.md) and
[FINDINGS.md §8](../FINDINGS.md).
