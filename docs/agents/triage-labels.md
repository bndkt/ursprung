# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

This repo tracks issues as local markdown, so a "label" is the value of the `Status:` line near the top of the issue file — see `issue-tracker.md`.

**`/wayfinder` tickets are the exception.** They use the same `Status:` line for a different vocabulary — `open`, `claimed`, `resolved` — because a wayfinder ticket is a question one agent claims and answers, not an issue a maintainer triages. Every ticket under `.scratch/ursprung-v0/` is one of these, so none of them carries a label from the table above. Read the `Type:` line to tell the two apart: if it is present, the ticket is a wayfinder child and the lifecycle vocabulary applies.
