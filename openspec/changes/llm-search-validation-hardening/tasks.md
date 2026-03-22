## 1. Validation foundation

- [x] 1.1 Add shared validation utilities for loading env, formatting results, and classifying failures
- [x] 1.2 Add direct validation scripts for LLM config, one-shot chat, streaming chat, and search provider health
- [x] 1.3 Add package script entrypoints so validation can be run before feature development

## 2. Capability and smoke checks

- [x] 2.1 Add prompt-level capability checks for translate, summarize, and brainstorm/tool-call flows
- [x] 2.2 Add an end-to-end smart-reading translate smoke test that creates and polls a task
- [x] 2.3 Ensure validation output distinguishes provider/config failures from app regressions

## 3. Provider hardening

- [x] 3.1 Probe the current LLM provider/model path and identify at least one accessible runtime model
- [x] 3.2 Harden runtime model selection/configuration so translate no longer depends on an inaccessible model
- [x] 3.3 Verify one live translate request succeeds with the hardened configuration

## 4. Final verification

- [x] 4.1 Run the full validation suite and capture the pass/fail summary
- [x] 4.2 Review affected smart-reading runtime paths for regressions and summarize remaining operational risks
