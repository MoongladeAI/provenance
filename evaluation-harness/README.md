# Provenance evaluation harness

Local, dependency-free Node harness for diagnostic A/B runs against the unchanged public provenance package. Version 0.1.0. Requires Node 22+, Git, authenticated Codex CLI, and the pinned built repository.

## Non-interference rule

The recorder, scorer, hidden answer keys, and independent verifier must not advise the tested agent. Scoring starts only after the agent process closes. No score, correction, answer key, or independent provenance judgment is fed back. Raw results from the system under test are preserved. The common task prompt is identical across A/B; there is no added instruction to trust seals or reduce checking.

All built-in smoke runs are **DIAGNOSTIC, NOT PASSIVE BENCHMARK EVIDENCE**. They use synthetic tasks, an evaluator-created memory/provenance adapter, and a synthetic Git reference tool. This does not reproduce Marc’s actual Git deployment. Passive mode is deliberately not offered until the real deployment inputs and allowed treatment differences are frozen and reviewed. Do not relabel these runs as passive or infer causal efficiency benefits from them.

## Run

From this directory:

```powershell
npm test
npm run smoke
node src/cli.mjs report <absolute-batch-directory>
```

The smoke command schedules 2 tasks × A/B × 2 repetitions, with paired randomized order and one process at a time. It stops on a failed/invalid run rather than repeating until successful. Every attempt remains in its batch directory. Each run has a two-minute wall limit and 24-call MCP budget. The batch stops after observing 120,000 raw tokens; the CLI only exposes completed-turn usage, so this is **not a hard token cap**. No token total or dollar cost is invented when provider counters are missing.

The default fixed model is `gpt-6-astra`, low reasoning, available in the inspected local catalog. `EXPERIMENT_MODEL`, `CODEX_EXE`, `PROVENANCE_REPO`, and `EXPERIMENT_SEED` can be set explicitly. Different settings are different experiments. Credentials stay in the existing CLI authentication store and are never copied into the harness.

Codex runs read-only, with shell/unified-exec and web search disabled, user configuration ignored, and only the explicitly configured experiment MCP server required. Unexpected command/web/file-write events stop the run. These measures are not a certification of hostile-process isolation; confirm full tool/instruction visibility before passive trials. The served backend model revision is not exposed by the observed event schema and remains unknown.

A receives document listing/reading/search and synthetic Git state. B additionally receives the unchanged package’s verification and gate results. Signature verification uses an evaluator-generated fixture public key as the fixed treatment configuration. The gate is not repaired or supplemented. All text documents, including mistaken summaries, are signed so that factual truth is not encoded by signature presence. D tool behavior is implemented but not part of the eight-run smoke schedule; its instruction treatment is not yet defined, so it must not be used as a completed prompting ablation.

## Outputs

`runs/<batch>/comparison.html` is a self-contained side-by-side trace viewer. It needs no server, network, or build. Each run includes manifest, prompt, separate hash-chained agent/tool logs, raw final output, stderr, and post-exit scores. `comparison.json` contains summaries. Fixture copies and public keys are included; private keys exist only in controller memory.

Hash chains detect edits against retained chain heads; they do not authenticate a recorder that an attacker controls. Repeated-read metrics count identical returned content, not whether the repetition was unjustified. Final numeric/source scoring is mechanical; explanatory audit quality still needs blinded human scoring. Diagnostic debugger replays must receive fresh run IDs.

## Current boundaries

- Live smoke tests demonstrate plumbing, not the claimed long-session savings.
- Deployed Git policy, production prompts, and existing wrappers are still required for the real-system trial.
- Eight short runs are not a powered efficacy study or cross-model replication.
- Task answer keys are controller-side; the agent sees only task inputs through its tools.
- Independent verification must remain post-action. If any observer injects a result, mark the run diagnostic and exclude it from passive analysis.

The CLI event adapter follows the installed `codex exec --help` and [official non-interactive documentation](https://learn.chatgpt.com/docs/non-interactive-mode). Configuration restrictions follow the [official reference](https://learn.chatgpt.com/docs/config-file/config-reference).
