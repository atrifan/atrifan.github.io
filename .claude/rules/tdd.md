---
description: Test-Driven Development — write a behavior-only failing test with a QA agent first
appliesTo: ["**"]
alwaysApply: true
---

# TDD Rule

For any behavior change (new endpoint, new UI flow, changed response shape), **write the test first** —
and write it from the *behavior*, not the implementation.

## Workflow

1. **Spec the behavior.** Capture the observable contract: endpoint URL + method + auth, request/response
   shape and status codes, or UI acceptance criteria (roles/labels/visible text). No internal details.
2. **Delegate to a QA agent.** Dispatch a general-purpose agent to write a **failing** Playwright test
   under `tests/`, giving it ONLY the contract from step 1 and the shared fixtures
   (`tests/fixtures/seed.ts`). Instruct it explicitly **not to read the route/component source** — it
   tests behavior, not code. This keeps tests honest and implementation-agnostic.
3. **Red.** Run the test; confirm it fails for the right reason.
4. **Green.** Implement until it passes.
5. **Refactor.** Clean up with the test as a safety net.

## Why

A test written by someone who has seen the implementation tends to assert what the code *does*, not what
it *should do*. A behavior-only author catches contract violations the implementer would rationalize away.

## Applies to

New/changed API routes, marketplace/plugin flows, and control-panel UI. Pure refactors with no behavior
change don't require a new test but must keep existing ones green. See [[testing]] for layout and how to run.
