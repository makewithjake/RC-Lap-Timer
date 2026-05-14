# Prompt Notes Guide

A living reference of reusable prompts and conventions for working with AI coding agents on this project.

---

## Prompts

### Plan Generation

Use this prompt to generate a detailed implementation plan for a new phase before any code is written.

```
Do not write code yet. Reference phase [N-1] in plan.md and create a detailed
implementation plan for phase [N]. Save it to phase[N]plan.md.

Identify which tasks can be worked independently or in parallel so that work
can be distributed across multiple agents.

Use prompt_notes_guide for additional formatting/instructions for setting up the detailed phase [N] plan
```

**Notes:**
- Always reference the prior phase milestone as the prerequisite baseline.
- The resulting plan file must follow the Plan Style Guide below.
- Agents must verify prior-phase deliverables exist before starting any task.

---

## Plan Style Guide

> Reference implementation: `phase2plan.md`

### File Naming

```
phase[N]plan.md
```

### Top-Level Structure

```md
# Phase [N] Implementation Plan – [Short Phase Title]

## Overview
## Phase [N-1] Prerequisite Checklist
## File Structure – New Files Created in Phase [N]
## Detailed Task Breakdown
  ### Task Group [Letter] — [Module Name] ([file path])
```

### Overview Section

- **Goal:** One sentence describing the infrastructure concern for this phase.
- **Milestone (from plan.md):** The exact acceptance criteria copied from the master plan.

### Prerequisite Checklist

Use a three-column Markdown table:

| Deliverable | File/Location | Notes |
|---|---|---|
| Short name | `path/to/file` | Status or constraint |

Follow with an `> Agent Rule:` blockquote reminding agents not to start work against placeholders.

### File Structure Block

Use a fenced code block to show only the new files being created. Note any directories that already exist.

### Task Groups

Each task group is an `H3` with this metadata immediately below the heading:

```md
**Assignable to:** Agent [Letter] (independent / depends on X)
**Depends on:** [prerequisite]
**Blocks:** [what downstream work is blocked]
```

Tasks within a group are `H4` items (`#### A1 — Description`). Use bullet lists for implementation details. End each group with a **public API surface** in a fenced code block.

### Tone & Constraints

- Be prescriptive — specify exact class names, attribute values, color tokens, and fallback behaviors.
- No vague tasks. Every item must be actionable by an agent with no follow-up questions.
- All modifications to existing Phase 1 files must be labeled **additive** — no deletions.
- Reference CSS custom properties by token name (e.g., `--color-accent`) not raw hex.

