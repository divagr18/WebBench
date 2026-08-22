# Qwen Thinking Preservation Review

Reviewed: 2026-08-20

## Status

Resolved on 2026-08-20. The Qwen adapter now enables native low thinking via
`DASHSCOPE_REASONING_EFFORT=low`, sends `preserve_thinking: true`, captures Qwen
`reasoning_content`, and replays it as a provider-correct assistant field.
The generic runner transport remains provider-neutral.

## Issues

### 1. Qwen thinking is disabled by default (resolved)

`DASHSCOPE_REASONING_EFFORT=low` now enables thinking explicitly for a
Qwen3.8-Max-Preview run while leaving the frozen baseline behavior unchanged
when it is unset.

### 2. ModelScope reasoning content is discarded (resolved)

The response parser now stores `reasoning_content` in a namespaced ModelScope
payload for the runner to retain.

### 3. Generic `extra_content` is not a Qwen replay contract (resolved)

The ModelScope adapter translates only its namespaced payload to
`reasoning_content` and strips generic `extra_content` before sending a Qwen
request.

### 4. Historical-preservation opt-in is absent (resolved)

Thinking-enabled ModelScope requests now include `preserve_thinking: true`.

### 5. Low-thinking is not represented in the ModelScope configuration (resolved)

Qwen3.8-Max-Preview uses the native `reasoning_effort: "low"` control. It must
not be combined with `thinking_budget`.

### 6. Qwen-specific tests are missing (resolved)

The LLM tests now cover low-effort request fields, response capture, and replay
of `reasoning_content` across a tool-call turn without forwarding generic
`extra_content`.

## Recommended implementation boundary

Keep the runner provider-neutral. The Qwen adapter now exposes and consumes a
typed Qwen-thinking payload, enables low thinking deliberately, sends
`preserve_thinking: true`, and translates replayed thinking into the
DashScope/Qwen assistant message format. Verify provider usage accounting on
the live trace before relying on a cost comparison.

## Scope note

Prior elicitation uses a separate conversation from the research loop. Thinking
should be preserved within the research/tool/final-repair conversation, not
implicitly carried from prior elicitation into research.
