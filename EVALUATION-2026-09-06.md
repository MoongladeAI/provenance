# Independent evaluation of MoongladeAI/provenance

Evaluation date: 6 September 2026. Repository snapshot: [`bb744c45e1141161a22f99ecfab9a0cece3a6e2c`](https://github.com/MoongladeAI/provenance/tree/bb744c45e1141161a22f99ecfab9a0cece3a6e2c), package 2.0.0.

## Executive assessment

**The library demonstrates useful signature binding and correct tested Merkle construction. The supplied agent-facing verification paths do not establish the hard cryptographic boundaries they advertise. The reported cognitive and efficiency benefits remain inconclusive.**

The independent fixtures demonstrate that a hash-only sidecar clears the MCP gate, including through the actual stdio server; an unsigned identity string earns a human-verified label; the Obsidian verifier accepts an empty attestation list; and a fabricated non-CMS timestamp response passes the timestamp validator. These are failures of claimed enforcement, not attacks on Ed25519 or SHA-256.

There are also substantive positive results. The core verifier rejects content changes, wrong keys, modified signed fields, and an invalid sibling signature. An independent recursive Merkle implementation matched 66 tree sizes, with 2,145 generated inclusion proofs verifying. OpenSSL verified the published epoch-67 timestamp and certificate chain against a separately installed CA bundle; a wrong-subject control failed.

No controlled live-model comparison or historical token telemetry was available in the supplied material. This evaluation therefore does **not** establish either a behavioral benefit or its absence. It does establish that an experiment treating the current MCP gate as cryptographic enforcement would misclassify its treatment.

No tracked project source was changed. Findings concern this snapshot, not an unavailable private vault, Python implementation, or future revision. The user clarified that rollback protection is external through Git. Accordingly, local acceptance of an old signature is a component boundary, not a demonstrated failure of the deployed rollback mechanism. That external integration remains unvalidated here.

## Evidence conventions and scope

- **FACT:** directly established implementation behavior, source content, or reproduced experiment. A statement appearing in documentation is a fact about the documentation, not validation of the statement.
- **OBSERVATION:** measured behavior without established causal interpretation. No live-agent behavioral observations were collected here.
- **HYPOTHESIS:** a proposed causal explanation that remains to be tested.

Evidence grades are attached to narrowly worded claims: **Demonstrated**, **Strongly supported**, **Suggestive**, **Inconclusive**, **Unsupported**, or **Refuted**. Refuting an advertised integration guarantee does not refute the general research hypothesis.

Executed: package build and 118 original tests; 49 independent cases, including 2,145 proof checks inside one case; unchanged plugin engine execution through TypeScript transpilation; one MCP subprocess test; independent OpenSSL anchor verification and negative control. Plugin UI, Claude Code, Antigravity, private Python tools, live provider benchmarks, external Git rollback enforcement, and hostile concurrent filesystem scheduling were not exercised.

## Actual architecture

### Core library

`sealDocument` reads a file as UTF-8, replaces CRLF with LF, hashes the resulting bytes, and signs a framed payload containing a fixed v2 domain string, scope, SHA-256 digest, and signer string. It writes an adjacent JSON sidecar. Optional timestamp acquisition operates over the **artifact digest**, not the structured signing payload or signature. `created`, `git_commit`, top-level artifact name, update time, and timestamp metadata are outside the signed claim.

`verifyDocument` recomputes the canonical digest, checks a v2 marker, requires at least one supported signature, and verifies every supported signature against the **same caller-supplied key**. It reports unknown methods without validating them. It verifies the recorded scope string's integrity, but does not compare it with the file's current location or an expected scope. It returns timestamp fields from JSON without timestamp validation. [Core source](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/src/index.ts#L144)

### Vault and Merkle tree

The scanner walks non-hidden directories, excludes `node_modules`, follows `fs.stat`, and hashes file bytes **without the signing canonicalization**. Sidecars and ordinary hidden files are included; hidden directories are excluded. Leaves commit to `digest + two spaces + relative POSIX path`, sorted using JavaScript string ordering. Leaves use SHA-256 with prefix 0x00; internal nodes prefix 0x01; odd nodes are promoted; an empty tree is SHA-256 of empty bytes.

`scanAndAudit` computes a current snapshot. It neither retrieves an old root nor authenticates a root, identifies a latest epoch, or compares history. `proveInclusion` rescans the vault on each call. `verifyProof` folds a supplied leaf hash and supplied siblings into a root and compares it with the root inside the same object. [Merkle source](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/src/merkle.ts#L128)

### Agent-facing MCP layer

Four tools expose verification, scanning, sealing, and gate status. Supplying a public key selects real core signature verification. Omitting it selects a hash-only path, yet both produce positive verification language. `required_scope` is advertised but unused. The gate itself does not take a key and checks only the current hash against editable JSON. Its result is text; the server does not mediate subsequent file writes, code generation, or merges. [MCP source](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/src/mcp.ts#L68)

### Obsidian path

This is a separate engine. It applies NFC as well as CRLF normalization, checks hashes, optionally compares scope against a configured vault, and assigns human/agent status using signer strings and registry roles. Its `verifyFile` path does not perform signature verification. Timestamp checks look for DER-like bytes and the digest, not a verified CMS signature. Detail fields acknowledge indeterminate token and registry trust while positive headline verdicts can still imply verification. `sealAgentNote` writes an unsigned `moonglade-agent-attestation-v2` record and returns `verified: true`. The reconcile command finds duplicate basenames; it does not compare propositions for contradictions. [Plugin engine](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/obsidian-plugin/src/engine.ts#L180), [reconcile implementation](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/obsidian-plugin/src/commands/reconcile.ts)

### Trust boundaries

| Boundary | Controller and actual responsibility | Guarantee class / remaining assumption |
|---|---|---|
| Artifact and sidecar | Filesystem writer can replace both, delete either, copy pairs, or restore history | Environmental integrity is needed for hash-only verdicts; they do not resist that writer |
| Private signing key | Key holder can attest arbitrary text and signer labels | Cryptographic possession; truthful identity and responsible signing require human policy |
| Public key selection | Caller supplies the core/MCP verification key | Authenticated distribution and identity authorization are external human/environmental assumptions |
| Core verifier | Installed package and Node/OpenSSL implement verification | Software checks signed fields; trusted runtime and dependencies are assumed |
| MCP arguments/output | Caller chooses path, optional key, and tool invocation; MCP emits labels | Tool output is software behavior; obeying it and invoking it are agent behavioral assumptions |
| Agent | Depending on deployment, may have file-writing tools and may receive signing keys through MCP arguments | No supplied enforcement separates memory reading from all later actions; key access defeats separation of duties |
| Obsidian registry | Local JSON names identities and roles; root signature presence is reported but not verified | Registry authenticity remains unauthenticated in this path |
| TSA | TSA controls claimed time; a trusted, validated token authenticates that assertion | Authority correctness, key security, time accuracy, and revocation policy remain trust assumptions |
| TSA transport | Defaults include HTTP; some endpoints and network Date probes use HTTPS | Default HTTP supplies no TLS protection; structural matching cannot replace authentication |
| Published root | Repository maintainer publishes an anchor; verifier chooses which root to trust | Git identifies retained snapshots; trusted reference selection and repository policy establish which history is authoritative |
| Local vault history | Scanner sees the current filesystem; user identifies external Git as the rollback protection layer | Git comparison/checkpoint workflow is an external system responsibility, not a required feature of the signature primitive; deployed enforcement not supplied |
| Source truth | Authors and upstream evidence determine factual accuracy | Neither signatures nor Merkle inclusion certify factual correctness |

Cryptographic guarantees apply to authenticated keys and exact committed representations. Software-enforced policy must separately choose authorized signers, acceptable scopes, freshness, and minimum evidence. Environmental assumptions protect the runtime, keys, roots, and filesystem. Agent behavior determines whether voluntary tools are called. Human trust determines which authorities and sources deserve reliance.

## Cryptographic assessment and evidence grading

| Narrow claim | Implementation status | Evidence grade / result |
|---|---|---|
| Core detects changed canonical text with a fixed trusted key | Implemented and demonstrated | **Demonstrated** for tested valid UTF-8 inputs |
| Signer and scope fields cannot be edited without invalidating the signature | Implemented and demonstrated | **Demonstrated**; both mutations rejected |
| Signer label identifies a real authorized person | Claimed by some labels, not established | **Unsupported** without trusted key-to-identity policy; **Refuted** for unsigned human verdicts |
| Verification enforces the current path/required scope | Core not implemented; plugin conditional check | **Refuted** for core/MCP; copied pair accepted and requested scope ignored |
| Canonical representation is identical across supplied paths | Partial, inconsistent implementation | **Refuted**; library rejects NFD/NFC substitution while plugin normalizes it |
| Arbitrary binary integrity | Draft claim not implemented in library | **Refuted**; 0x80 changed to 0x81 verifies after lossy UTF-8 decoding |
| Signature authenticates creation time and git commit | Not implemented | **Refuted** if inferred from returned metadata; editing either passes |
| RFC 3161 response semantic binding | Partial implementation, insufficient validation | **Refuted** as a full structural/binding check; unsigned non-CMS structure accepted |
| TypeScript verifies TSA signature and chain | Not implemented, disclosed in part of documentation | **Refuted** for MCP tool description; **not implemented** in timestamp module |
| Published epoch-67 timestamp authenticates its root payload | External verification demonstrated | **Demonstrated**, subject to installed CA trust and time-validation caveats below |
| Merkle hash construction follows RFC tree recurrence | Implemented and demonstrated on bounded cases | **Demonstrated** for 66 tree sizes; not a proof of every possible input |
| `verifyProof` authenticates the named artifact and trusted epoch | Not established by this API alone | **Refuted** as a self-contained artifact/epoch verifier |
| Vault root commits to included path/raw-byte snapshot | Implemented and demonstrated | **Demonstrated**, limited by exclusions and non-atomic scan |
| Audit tool detects drift/deletion by comparing history | Not implemented | **Refuted**; deletion still receives PRISTINE |
| Core signature verification alone rejects old signed state | Not implemented in this component | **Demonstrated boundary**: old signature accepted; not a finding against external Git protection |
| Deployed rollback protection through external Git | User identifies this external mechanism; integration not supplied | **Inconclusive** pending the actual comparison/enforcement workflow |
| Merkle consistency proofs / epoch chaining inside the package | Not implemented | **Demonstrated absence**, explicitly disclosed; Git may provide history protection separately |
| Cross-runtime cryptographic interoperability | Incomplete and incompatible paths | **Inconclusive** for private Python; **Refuted** for uniform semantics across tested library/plugin paths |
| Improved cognitive auditing | No controlled results supplied or collected | **Inconclusive** |
| Reduced tokens/tools at equal quality due to cryptography | No usable A/B telemetry | **Inconclusive** |

Ed25519 is invoked through Node's standard cryptographic API, not reimplemented. The RFC 8032 empty-message vector verified; project round trips and independent negative cases support correct ordinary use. This is not comprehensive malformed-key/signature conformance testing or a proof of the platform implementation. [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html)

The tree recurrence matches the RFC construction, but the package is not a Certificate Transparency implementation: no consistency proofs, signed tree heads, or CT protocol are supplied. Its proof verifier ignores tree size and leaf index rather than performing the corresponding bounded inclusion validation. [RFC 9162, section 2](https://www.rfc-editor.org/rfc/rfc9162.html#section-2)

RFC 3161 requires examining the token and validating the relevant signature and trust properties. Finding byte strings anywhere in a buffer does not establish that they occupy the messageImprint and nonce fields. This package's validator does not check the messageImprint algorithm OID. [RFC 3161, sections 2.4.1–2.4.2](https://www.rfc-editor.org/rfc/rfc3161.html#section-2.4.1)

The repository's draft also differs from execution: it requires BOM removal, NFC, binary preservation, timestamps over signed attestation payloads, and an L3 NTS/NTP quorum. The library strips neither BOM nor Unicode decomposition, decodes all files as UTF-8, timestamps the artifact digest, and selects an HTTPS Date response rather than computing a quorum. A draft filename and RFC references do not establish standards compliance. These are source-to-draft discrepancies, not evidence of IETF acceptance.

## Adversarial findings

### F1 — High: unsigned content clears the asserted cryptographic gate

**FACT.** A sidecar containing only `sha256_at_last_write` with the correct hash passes `assert_gate_status`. No version, signature, signer, or timestamp is necessary. Both a direct Gate A call and a stdio Gate B call returned a cleared cryptographic verdict. An attacker who writes memory and adjacent JSON needs no secret key.

Evidence: `minimal_unsigned_gate`, `stdio_unsigned_gate_b`; [gate implementation](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/src/mcp.ts#L144). The server only reports status and does not intercept other tools. Thus there are two separate gaps: false acceptance even when invoked, and no mandatory mediation when skipped.

### F2 — High: attacker-controlled identity strings become human verification

**FACT.** With no public key argument, an unsigned `openpgp` record whose signer is `moongladeai@gmail.com` produces `[HUMAN_VERIFIED (Zen)]`. A minimal hash-only record produces `[VERIFIED]` and defaults to L1/DigiCert/Sectigo labels even with no timestamp. The plugin independently returns verified human status for the same unsigned assertion, and accepts empty attestations.

Evidence: `forged_human_mcp`, `minimal_unsigned_mcp`, `plugin_forged_human`, `plugin_empty_attestations`. No claim is made about an actual human's identity or conduct: that address was used only as the code's literal test trigger. Impact is authority spoofing at the interface an agent or human reads.

### F3 — High: timestamp verification accepts fabricated structure and metadata

**FACT.** An evaluator-generated ASN.1 sequence containing status 0, a digest OCTET STRING, a nonce INTEGER, and a chosen 2099 GeneralizedTime returns `valid: true`. It contains no CMS SignedData, signer, certificate, or signature. Wrong digest and wrong nonce controls fail. This isolates the defect: matching byte patterns is performed, but it is insufficient validation.

Separately, injecting `tsa_time: 2099-01-01T00:00:00Z`, an L1 tier, and a non-token string into a valid file's sidecar leaves `verifyDocument` verified and changes its returned timestamp. Default primary TSA endpoints are HTTP, so the documentation's fallback reliance on TLS does not even hold for those requests. A malicious endpoint or an active attacker on that HTTP path can construct matching digest/nonce strings after seeing the request; nonce freshness does not authenticate the response.

Evidence: `unsigned_non_cms_timestamp`, negative controls, `timestamp_injection`; [validator](https://github.com/MoongladeAI/provenance/blob/bb744c45e1141161a22f99ecfab9a0cece3a6e2c/src/timestamp.ts#L500). No live interception or attack against a real TSA was attempted.

### F4 — High when treated as a complete verifier: proofs do not bind caller intent

**FACT.** Modifying `artifact`, `leaf_index`, `tree_size`, or `algorithm` does not affect proof acceptance. A caller-selected leaf/root with an empty path also passes. The API neither accepts actual artifact bytes nor an independently trusted root argument. It does correctly reject the tested altered root, leaf hash, and invalid path.

This is not a hash collision or a forgery against a fixed trusted root. The implementation is a hash-path consistency helper. A caller must independently hash the artifact and path into the leaf, validate proof metadata, and compare against a trusted root. An old valid proof remains valid for its old root; substituting the current different root makes it fail. Evidence: all `proof_*` cases and `stale_proof_vs_new_root`.

### F5 — Medium/high depending on policy: signed scope does not enforce scope usage

**FACT.** Copying a valid file/sidecar to a different directory passes core verification; supplying an incompatible MCP `required_scope` also passes. Altering the signed scope itself fails, which is a useful narrower property. The plugin rejects the tested mismatch when a vault is registered, but its scope handling is not a substitute for cryptographic verification. Scope lacks a unique vault identity, and out-of-root files fall back to basename.

Evidence: `copied_to_different_scope`, `required_scope_ignored`, `mutate_scope`, `plugin_scope_mismatch`. `SPEC.md` already acknowledges the core location gap. It still contradicts stronger agent-facing enforcement language.

### F6 — Medium: audit verdict overstates drift detection; rollback is external

**FACT.** Deleting a vault file produces a different live root, but the MCP audit still says PRISTINE. Adding memory inside a hidden directory leaves the root unchanged. These test the audit tool's own drift and coverage claims.

**FACT / component boundary.** Restoring a previously valid file and sidecar after creating a newer seal verifies successfully (`rollback`). A valid old signature should remain mathematically valid; whether that state is currently authorized is a separate policy question. The user states that Git supplies rollback protection externally. The experiment bypassed that layer, so it cannot establish a failure of the deployed rollback architecture.

Evidence: `rollback`, `vault_deletion_pristine`, `vault_hidden_directory_excluded`. Whole-vault restoration, branch divergence, and selective old-pair restoration were not tested against the external Git workflow. No internal epoch chaining is present, but duplicating Git's responsibility inside this package is not a necessary design requirement.

To evaluate the composed system, identify the authoritative Git ref/checkpoint, when it is refreshed, how the working tree and relevant untracked/excluded files are compared, and what action rejects an unauthorized older state. Fetch obtains remote objects/refs; ancestry checks can distinguish older or divergent commits relative to a chosen trusted reference. These are available Git mechanisms, not evidence that a particular deployment invokes them. [Git fetch](https://git-scm.com/docs/git-fetch), [Git merge-base](https://git-scm.com/docs/git-merge-base)

### F7 — Medium: canonicalization breaks cross-path and binary guarantees

**FACT.** CRLF substitution survives file signature verification but changes a vault root because the scanner hashes raw bytes. NFC/NFD substitution fails the library signature check and is normalized by the plugin. BOM addition fails library verification. Distinct invalid UTF-8 bytes 0x80 and 0x81 both decode to replacement characters, so a binary-byte mutation verifies.

The binary finding matters for the draft's binary claim; it is not a bypass of integrity defined solely over canonical valid UTF-8 Markdown. CRLF normalization is intentional. Evidence: `crlf_equivalence`, `vault_crlf_changes_root`, `unicode_nfc_equivalence`, `plugin_nfc_equivalence`, `bom_equivalence`, `invalid_utf8_byte_mutation`.

### Additional limits established by inspection

All supported sibling signatures use one key, so genuine different-key countersigning is not resolved. Unknown methods can coexist with a valid core signature and are returned as unknown, not authenticated; MCP's positive output suppresses that detail. Signer compromise permits new valid false claims; no core revocation or expiry mechanism exists. Sequential reads and following filesystem links do not provide an atomic vault snapshot or containment against adversarial link changes. Resource-exhaustion, link loops, race exploits, and malformed DER fuzzing were not executed, so no specific exploit outcome is asserted for them.

## Merkle and temporal anchor assessment

**FACT.** `anchors/epoch-67.json` contains root `e0c43c7629dc43e174acfd06903f25b84e2a89920ef3331879a90c4216a1ee27` and a GlobalSign response. The timestamp subject is the 64 lowercase ASCII root characters, without newline. Its SHA-256 is `35ed55905a51e4fc4d8b50b182d510664e70a27cb4668c87b3b3bda968f9ad83`.

OpenSSL 3.2.4 returned **Verification: OK** with the separately installed Git CA bundle. An unrelated subject returned **Verification: FAILED**, message imprint mismatch. The token states 3 September 2026, 17:22:19 GMT, with accuracy one second. This supports existence of the root commitment by the TSA time within its declared accuracy, assuming the TSA and CA trust are sound. It does not show that a particular agent signed a claim by that time, that content is true, or that the archive was the latest authorized archive.

The private 505-artifact registry and a matching artifact proof were not supplied. Therefore the count and claimed archive membership were not independently reconstructed. The timestamp covers the root payload, not the surrounding JSON's counts, epoch ID, or git commit label. Historical roots retained in Git can be independently checked; the scanner itself does not select the authoritative Git state. The user identifies that as an external responsibility. No revocation retrieval, historical revocation reconstruction, or long-term evidence renewal was performed in the OpenSSL check.

The Python path is described as using `openssl ts -verify`, but its source and CA-selection policy are absent here. A valid published token is evidence for that token, not a security audit of the unseen Python pipeline. The documented SSHSIG format also differs from the core's bare Ed25519 v2 payload; core verification expressly rejects an SSHSIG-only bundle.

L3 is one selected successful HTTPS Date result, even when multiple probes are requested; there is no consensus calculation or dispersion bound. L4 uses JavaScript `Date`, a wall clock, not a monotonic clock. The default fan-out awaits all selected probes. It establishes neither zero latency nor a universal no-stall guarantee. The local-only fallback case did return the explicitly unauthenticated L4 tier.

## Memory, provenance, and cognitive auditing

**FACT.** Signing commits to a document's representation and declared signer/scope; it does not record a structured derivation graph connecting source evidence, inference, and conclusion. No semantic truth test, automatic supersession policy, source corroboration rule, contradiction detector, confidence calibration algorithm, or unsupported-assertion classifier is implemented in the core. The plugin's duplicate-basename check is not contradiction detection.

The signed false arithmetic fixture verifies. This is the correct behavior for signature integrity, and a falsification of the stronger inference that a valid seal makes the proposition usable as factual truth. Evidence reuse still requires relevance, source reliability, freshness, scope, and applicability judgments unless an independently justified policy has already resolved them.

Memory contamination has at least three distinct threat models:

| Contamination route | Result |
|---|---|
| Modify canonical text without the trusted signing key | Core detects it in executed cases |
| Write arbitrary memory plus matching unsigned sidecar | Current MCP gate and plugin accept tested cases |
| Induce an authorized agent/key holder to seal a false or hostile claim | Cryptography alone cannot distinguish this from legitimate sealing |

Absent provenance yields a core failure/MCP UNATTESTED or blocked missing-sidecar gate. Malformed JSON fails. Invalid content with an unchanged hash record is detected. However, invalid or absent signatures do not prevent the tested hash-only gate verdict. Conflicts with retrieved source text, unsupported assertions inside signed content, superseded memories, and conflicting factual attestations require additional policy/model behavior that is not demonstrated here.

**HYPOTHESIS.** Reliable provenance could reduce redundant integrity checking while supporting better attribution. **Competing hypothesis:** authoritative labels reduce checking through overconfidence, decreasing cost while increasing undetected error. Another competitor is that explicit source-aware instructions or better retrieval—not cryptography—produce the benefit. This artifact supplies no controlled evidence separating them.

## Behavioral and efficiency evaluation

**Result: Inconclusive.** The handover reports subjective experiences but provides no raw sessions, fixed model identifiers, prompts, matched tasks, corpus snapshots, or token accounting. Those are reported anecdotes, not independently observed reductions. This evaluation did not run a live-model A/B trial. Tool-unit results are not a proxy for hallucination rate or token savings.

| Requested measurement | Available result |
|---|---|
| Total/input/output tokens and quota | Unavailable; no treatment/control telemetry |
| Tool/search counts, repeats, file reads, identical retrieval | Unavailable for agent sessions |
| Context reconstruction and verification loops | No traces to classify |
| Completion time and quality | No matched agent-task runs |
| Correction rate, attribution, audit precision/recall, calibration | No blinded behavioral scoring |
| Failed verification, provenance lookups, gate invocations | Deterministic fixtures exercise these paths; no agent-session rates |
| Package correctness timing | Original Jest run reported 7.308 seconds; not an agent efficiency measurement |

The central A/B comparison is not validly instantiated by turning the current gate on: its treatment does not require signatures. Running the unchanged system could measure its combined tool/prompt effect, but would not isolate cryptographic enforcement. Repairing it for the experiment would evaluate a different artifact and was deliberately not done.

The accompanying [experimental protocol](./BEHAVIORAL-PROTOCOL.md) specifies A–E conditions, adversarial and low-memory controls, paired randomization, quality criteria, telemetry, and analysis. It is an unexecuted protocol, not an empirical result.

### Confounder audit

| Alternative explanation | What could distinguish it | Current disposition |
|---|---|---|
| Model/version changes, including reported Gemini 3.8 rollout, Claude runtime changes | Exact served model/build IDs and contemporaneous randomized trials | No historical records; rollout occurrence/impact not independently verified |
| Hidden routing/infrastructure updates | Routing/build metadata; block randomization by time/provider | Unresolved even with advertised model names |
| Provider quota accounting | Separate raw token counters, cache counters, cost, and quota observations | No evidence that quota corresponds to unchanged token accounting |
| Context-window behavior, accumulation, session length | Fixed starting histories and matched multi-session schedules | Uncontrolled anecdote |
| Prompt/system-instruction changes | Hash and retain every prompt, tool schema, memory instruction | Unavailable |
| MCP/tool implementation and retrieval changes | Pin package, adapter, index, retrieval parameters, schemas | This repository pinned; historical environments absent |
| Caching | Record cache hits/tokens; independent cold and warm strata | Unavailable |
| Task composition/difficulty and memory dependence | Preregister tasks, objective rubrics, low-memory controls | Unavailable historical matching |
| Parallelism and agent-specific behavior | Fixed concurrency; paired trials within agent, replication across agents | Uncontrolled anecdote |
| Temperature/sampling | Fix parameters and supported seeds; repeated trials | Unavailable |
| Throttling, network latency, time-of-day | Record retries, rate limits, latency, concurrent load | Unavailable |

No confounder has been ruled out by the anecdote. The same evaluator running these deterministic fixtures does not control model-provider differences for the claimed long-session effect.

## Cross-agent and runtime assessment

**FACT.** The stdio tool responds through a fresh Node subprocess, so basic transport operation was demonstrated. It also reproduces unsigned Gate B acceptance through that boundary. This is not a Claude Code/Antigravity interoperability trial.

The core and plugin disagree on NFC normalization, acceptable attestations, signature validation, and scope enforcement. The Python path is unavailable and uses a different documented signature format. Consequently, stable provenance semantics across those paths are not established. The supplied evidence supports a potentially portable file format and ordinary JSON transport, not a demonstrated model-independent epistemic substrate.

## Reproducibility

Environment: Windows, Node 24.16.0, npm 11.13.0, TypeScript 5.9.3, Jest 29.7.0, OpenSSL 3.2.4 (11 February 2025). Detailed Node component versions are in `evidence/results.json`. The tracked checkout was clean after tests. Locked dependency installation used `npm ci --ignore-scripts`; the subsequent explicit test command builds and invokes Jest. No project source patch was applied.

From this deliverable directory, using PowerShell:

```powershell
git clone https://github.com/MoongladeAI/provenance.git ../work/provenance-reproduction
git -C ../work/provenance-reproduction checkout bb744c45e1141161a22f99ecfab9a0cece3a6e2c
Push-Location ../work/provenance-reproduction
npm ci --ignore-scripts
npm test -- --runInBand
Pop-Location
node ./evaluate.cjs ../work/provenance-reproduction ./reproduction-evidence
```

The runner creates fresh fixture directories, temporary test keys in memory, and a JSON result for each named case. Its observations intentionally include successful attacks: a boolean true is not necessarily a security success. The Merkle cross-check asserts equality to a separately written recursive reference. It transpiles unchanged plugin engine/type modules in memory; it does not launch or mock a full Obsidian UI. It uses no external TSA network calls.

To reproduce the published-anchor check, decode `anchor.token_b64` from the pinned `anchors/epoch-67.json` as bytes and write `merkle_root_sha256` as ASCII without newline, or use the supplied `epoch.tsr` and `root.txt`. Run:

```powershell
& 'C:\Program Files\Git\usr\bin\openssl.exe' ts -verify -data ./evidence/root.txt -in ./evidence/epoch.tsr -CAfile 'C:\Program Files\Git\usr\ssl\certs\ca-bundle.crt'
& 'C:\Program Files\Git\usr\bin\openssl.exe' ts -verify -data ./evaluate.cjs -in ./evidence/epoch.tsr -CAfile 'C:\Program Files\Git\usr\ssl\certs\ca-bundle.crt'
```

The first returned OK; the second failed on message imprint. CA bundle SHA-256: `11ee82febf9057ba28b6d4dc3ba14020492bd612a245c70c2a9cd6e2408829a6`. Changing CA stores/time may change validation; the trust store was not derived from the token. OpenSSL logs are included. The initial package suite result was 5/5 suites and 118/118 tests; these are project-authored coverage, not independent validation by themselves.

The initial sandbox shell failed to enter the requested directory; subsequent inspection and execution explicitly set the absolute working directory under approved elevated execution. This is an environment limitation, not a repository finding. External tests affected only disposable evaluator fixtures.

## Novelty assessment

Established primitives: Ed25519, SHA-256, RFC timestamping, and domain-separated Merkle construction are not novel. Established provenance models already distinguish entities, activities, and agents; authenticated attestation followed by policy evaluation is also established. [W3C PROV](https://www.w3.org/TR/prov-overview/), [in-toto validation model](https://github.com/in-toto/attestation/blob/main/docs/validation.md)

The composition—local Markdown sidecars, archive commitments, timestamps, and agent-facing gates—is an identifiable integration choice. This evaluation does not establish priority or a novel cryptographic construction. The explicit epistemic vocabulary may be a product/protocol contribution, but its authority labels presently exceed what the checks establish.

The broad concept of provenance controlling persistent-agent memory has closely related prior work. The June 2026 SMSR preprint describes write-time HMAC provenance plus a separate retrieval defense. The July 2026 memory-provenance-laundering preprint describes platform-maintained provenance and action authorization. These are related claimed designs, not independently replicated findings here. [SMSR abstract](https://arxiv.org/abs/2606.12703), [Memory Provenance Laundering abstract](https://arxiv.org/abs/2607.29167)

Those sources weaken a broad claim that deterministic provenance as an agent control mechanism is itself new. They do not settle whether this project's specific composition or earlier private work has priority. The public snapshot contains insufficient historical evidence for that determination. Literature review here is targeted, not exhaustive or a patent novelty search.

**HYPOTHESIS:** reduced redundant verification at maintained audit quality could be a useful behavioral result. It remains unmeasured in this evaluation and cannot yet be called a new demonstrated effect.

## Open questions

1. What source, trust store, and rejection tests establish the private Python verification pipeline?
2. Are real deployed gates mandatory, and are signing keys inaccessible to agents that consume untrusted content?
3. Which exact models, runtimes, prompts, memory states, and usage counters produced the reported savings?
4. Which external Git ref/checkpoint and comparison/enforcement workflow implements the stated rollback protection, including partial working-tree restoration and branch divergence?
5. What is the intended single cross-runtime canonicalization and signature format?
6. Can a controlled comparison separate instruction effects, retrieval improvements, and cryptographic checking without reducing quality?
7. Do UI users or agents interpret indeterminate detail fields correctly when headline labels say verified?

## Recommendations, following evaluation

First, align verdicts with executed checks: require an authorized key and signature for cryptographic gates, stop deriving human verification from identity strings, and distinguish hash match, signature validity, identity authorization, timestamp validity, and freshness. Enforce required scope at the decision boundary and keep keys/trust policy outside untrusted memory control.

Second, use semantic RFC 3161 parsing plus signature and trust validation, and verify timestamp evidence again when consuming it. Bind the intended subject and report actual assurance. Do not label one Date header as consensus or absent evidence as L1.

Third, make artifact proof verification accept an expected root and actual subject, validate proof metadata, and align vault audit verdicts with the external Git comparison result and explicit coverage rules. Document and test the Git rollback/supersession boundary; internal epoch chaining is not required merely to duplicate it. Unify canonicalization and distinguish valid text from raw binary.

Finally, evaluate this unchanged snapshot as its own treatment, record its enforcement failures, and preregister any later repaired version separately. Run the A–E protocol with blinded quality scoring before attributing token reductions to cryptography. There is a defensible research question here; the supplied evidence does not yet answer it positively or negatively.
