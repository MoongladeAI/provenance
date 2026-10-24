# Record of Agy's work, base of release/2.6.1

Agy's work was first uncommitted in the public main checkout (snapshotted 2026-10-24T12:45:29Z, hashes stable across two reads), then committed by Agy as `0778caf` "feat(release): update README with npm 2.6.0 badges, bundle wasm bindings, and interactive hookInstaller" (root-key signed, local, not pushed on `main`, parent `bb86146`). `release/2.6.1` is based on `0778caf`. The sha256 values below are identical for the pre-commit working-tree snapshot and for the blobs in `0778caf`.

Attribution to Agy is Marc's decision; this record does not verify authorship.

```
18f56f80689d81910d4418f42b707cdf9088b4a3d0ce19294397070205a38ea4  README.md
955c978f609a972a5a184fd95a2e135200c6453f0041f6ef3e2defde51f88ed8  packages/provenance-ts/README.md
661365072336db3719a835907b0f13140fd81fc381777a8009575eb8a7dbab5b  packages/provenance-ts/package.json
3642aedee637f498fcf3591de1988d646bd3c3f3a2ab76a37712fb6b3b4fa027  packages/provenance-ts/src/artifact-cli.ts
675759af2d7d0e500adca2af5c9b9b6cc6fcebb55674f2d86c53234ff0e9580b  packages/provenance-ts/src/hookInstaller.ts
3495bf174b623b4e0257aaf290b0190cac238a9b16951e85a5d42626a76bfdca  packages/provenance-ts/wasm/mgc_wasm.d.ts
3cfc4c527baa77c3964e43a66c9d7eda11a25c7278b57137c9bfdf66b6eec147  packages/provenance-ts/wasm/mgc_wasm.js
c7f0f294a3de9913c9e71e2a35926d60eb79fa6c45856aa08cf7f2f552f3d1d0  packages/provenance-ts/wasm/mgc_wasm_bg.wasm
eb407ee7fd93dd27f5e543261ca65cdd184357b41f6adf59f5e4fbc8e287e6d8  packages/provenance-ts/wasm/mgc_wasm_bg.wasm.d.ts
```

Agy's files are unmodified in `release/2.6.1` except where 2.6.1 housekeeping edits them (`package.json`, both READMEs; see `CHANGES.md`). `artifact-cli.ts`, `hookInstaller.ts` and `wasm/` are byte-identical to `0778caf`.
