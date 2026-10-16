# Tasks

## 1. Contract and module fixes

- [x] 1.1 Add `suspectedPromptInjectionCount` to `ReviewMetadata` and update the fixtures that build one. Verify with `bun test src/shared src/report src/benchmark`
- [x] 1.2 Show the suspected prompt injection count in the report header. Verify with `bun test src/report`
- [x] 1.3 Skip and list added lines over 4,000 characters in the secrets detector. Verify with `bun test src/secrets`
- [x] 1.4 Point the benchmark's default advisory cache at `benchmark/fixtures`. Verify with `bun test src/benchmark`
- [x] 1.5 Add the limits and `reviewPromptVersion` to `config/review.json`. Verify with the review config test in 2.1

## 2. Pipeline foundations

- [x] 2.1 Review config reader and settings builder with the api key check. Verify with `bun test src/pipeline/review-settings.test.ts`
- [x] 2.2 Stable value hash, run record and `runStep` with fatal and degraded paths. Verify with `bun test src/pipeline/run-step.test.ts`
- [x] 2.3 Metered llm client with the cost limit. Verify with `bun test src/pipeline/metered-llm-client.test.ts`

## 3. Pipeline steps

- [x] 3.1 Describe and collect files with the file limits. Verify with `bun test src/pipeline/collect-files-step.test.ts`
- [x] 3.2 Lockfile parse and diff, advisory load with refresh. Verify with `bun test src/pipeline/lockfile-step.test.ts`
- [x] 3.3 Placeholder matching, reachability to `ScaFinding`, secrets with the overlong note, placeholder code review. Verify with `bun test src/pipeline/reachability-step.test.ts`
- [x] 3.4 Cross-detector dedupe. Verify with `bun test src/pipeline/dedupe-step.test.ts`
- [x] 3.5 Summarize with the model or templates, assemble the result. Verify with the end-to-end test in 3.6
- [x] 3.6 `runReview` with the end-to-end snapshot test, the degraded-run test and the abort test. Verify with `bun test src/pipeline/run-review.test.ts`

## 4. CLI

- [x] 4.1 Terminal text sanitizer and fail-on check. Verify with `bun test src/cli`
- [x] 4.2 Program with review, benchmark run, benchmark show and refresh-advisories, and argument parsing tests. Verify with `bun test src/cli/program.test.ts`
- [x] 4.3 Review command handler with report writing and exit codes, benchmark handlers. Verify with `bun test src/cli`
- [x] 4.4 `index.ts` on the program and its test. Verify with `bun test index.test.ts`

## 5. Vulnerability matcher

- [x] 5.1 Sync with main after `add-vulnerability-matcher` landed and keep the cli reference in `tsconfig.root-files.json`. Verify with `bun check`
- [x] 5.2 Wire the matcher and the osv-scanner cross-check into the matching step, with the base comparison for introduced findings. Verify with `bun test src/pipeline/matching-step.test.ts`
- [x] 5.3 Drop a vulnerable version a second lockfile repeats. Verify with `bun test src/pipeline/dedupe-step.test.ts`
- [x] 5.4 Build the corpus advisory cache for `benchmark run` and review the sca-01 case against it. Verify with `bun test src/cli/benchmark-command.test.ts`
- [x] 5.5 Add the `validate-matcher` command. Verify with `bun test src/cli` and `bun index.ts validate-matcher`

## 6. Code reviewer

- [x] 6.1 Sync with main after `add-code-review-detector` landed. Verify with `bun check`
- [x] 6.2 Add `promptVersion` to `reviewCode`. Verify with `bun test src/code-review/prompt-version.test.ts`
- [x] 6.3 Run the reviewer in the code-review step and count its rejections and injection attempts. Verify with `bun test src/pipeline/run-review.test.ts`
- [x] 6.4 Send no temperature to anthropic models and fill the model prices. Verify with `bun test src/llm`

## 7. Verification

- [x] 7.1 Review two real public pull requests with the model and keep both reports. Verify with `docs/examples/axios-11294-code-change.html` and `docs/examples/axios-11321-lockfile-bump.html`
- [x] 7.2 Record the baseline on both splits with a cold cache and confirm a warm rerun gives the same counts on every case. Verify with `benchmark/results/baseline-dev.json`, `benchmark/results/baseline-test.json` and `bun index.ts benchmark show`
- [x] 7.3 Run the dev split three times with `--no-cache` and record F1 mean and spread. Verify by reading `docs/benchmark.md`
- [x] 7.4 README How to run and Results hold the commands, the models, the cost per pull request and the baseline. Verify by reading `README.md`

## 8. Documentation

- [x] 8.1 `.env.example`, README How to run, `docs/decisions.md`. Verify by reading them against the commands
- [x] 8.2 bun run verify passes. Verify with `bun run verify`
- [x] 8.3 module AGENTS.md updated for pipeline, cli, secrets, report, benchmark, advisories, code-review, llm and shared. Verify by reading each against its files
