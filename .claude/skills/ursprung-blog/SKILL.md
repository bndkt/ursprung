---
name: ursprung-blog
description: Write a post for the Ursprung dev-log blog as a markdown file. Use when asked for a blog post, a dev log or daily development update, or a deep dive explaining how Ursprung handles a topic or why a design decision was made.
---

Write one markdown post for the Ursprung dev log — the blog that reports how this
monorepo is developing. The invocation carries the subject; this skill decides the
shape, the voice, and where the file lands.

## What you produce

Exactly one file:

```
apps/web/public/posts/YYYY-MM-DD-slug.md
```

- `YYYY-MM-DD` — the date the post *covers*, not necessarily today. For a daily
  update that is the day whose work is being reported.
- `slug` — lowercase, hyphen-separated, two to five words, no date repeated in it.
  Name the subject, not the genre: `zero-build-package-exports`, not `dev-update`.

Nothing else changes. No index files, no rendering, no routes — how posts get
displayed is not this skill's problem yet.

Every post starts with YAML front matter, then the body:

```markdown
---
title: "The package that never builds"
description: "Why ursprung ships TypeScript source instead of a dist folder, and what that buys the dev loop."
date: "2026-08-07"
---

Body starts here, first paragraph, no repeated H1.
```

- `title` — the headline. Sentence case, no trailing period. Concrete over clever.
- `description` — one sentence, 15–30 words. This is the teaser shown in the post
  list, so it must make sense with no other context and must not just restate the
  title. It is a hook, not a summary of the summary.
- `date` — same ISO date as the filename, quoted so parsers hand back a string.

Quote all three values. Escape any `"` inside them.

## Steps

**1. Decide which of the two posts this is.**

- **Deep dive** — explains how Ursprung handles one topic, or why one design
  decision went the way it did. Triggered by a subject ("write about the workspace
  layout", "explain the zero-build setup").
- **Daily development update** — reports what happened in the monorepo on one day.
  Triggered by a date or a stretch of work ("dev update for yesterday").

If the instruction fits neither cleanly, treat it as a deep dive on whatever subject
it names.

**2. Gather the material. Do not write from memory of the conversation alone.**

For a **deep dive**, read the code the post is about — the actual files, not just
their names. Read `CLAUDE.md` for the constraints already written down, and use
`git log -p` on the relevant paths to find when and why the decision landed. You
need at least one concrete detail a reader could not have guessed: a real file path,
a real config value, a real trade-off that was live.

For a **daily update**, start from the commits:

```bash
git log --since="YYYY-MM-DD 00:00" --until="YYYY-MM-DD 23:59" --stat
```

Then read the diffs that matter (`git show <sha>`). Group the day into two to four
themes — a theme is "the package boundary got settled", not "three files changed".
A commit that only moves whitespace is not a theme; a one-line commit that changed
what the project is, is. If the day produced nothing worth a theme, say so in the
post rather than inflating it.

**3. Check the target.** List `apps/web/public/posts/` first. If a post for the same
date and subject already exists, update that file instead of creating a near
duplicate. If two genuinely different posts share a date, that is fine — the slugs
keep them apart.

**4. Write the post**, following the shape and voice rules below.

**5. Verify before you finish:** the file is in `apps/web/public/posts/`, the
filename date matches the front-matter `date`, all three front-matter keys are
present and quoted, and the body reads in under five minutes. Then report the path
and title back.

## Shape

600–1000 words. That is the three-to-five minute read, and it is a ceiling worth
respecting — a post that needs 2000 words is two posts.

Four beats, in order:

1. **The hook** — one or two paragraphs. Open on the tension, the surprise, or the
   thing that broke. Never open with "In this post we will" or with a restatement of
   the title.
2. **Why it matters** — the constraint, the problem, or the fork in the road. A
   reader who does not work on Ursprung should still care by the end of this beat.
3. **What actually happened** — the substance. Real names, real paths, real numbers.
   Code blocks are welcome when a few lines say what a paragraph cannot; keep them
   short and never paste a whole file.
4. **Where it leaves things** — the consequence, the open question, or what is next.
   Land it; do not trail off into a summary of what you just said.

Use two or three `##` headings to break the middle up. No `#` heading in the body —
the title lives in front matter.

## Voice

The audience is developers who follow web application frameworks. They know what a
monorepo, a bundler, and a type checker are. They do not know Ursprung.

- **Explain the decision, not the diff.** "The `exports` map points at `src/index.ts`,
  so there is no build step to run before the server boots" beats "changed exports
  field in package.json".
- **Assume the general, explain the specific.** Never define `workspace`. Always
  explain what `workspace:*` means *here*.
- **Entertaining means having a point of view**, not jokes bolted onto a changelog.
  Trade-offs that were genuinely hard, things that turned out to be wrong, the
  moment a constraint became obvious — that is the entertainment.
- **Be honest about scope.** Ursprung is early. A post that presents a scaffold as a
  finished framework reads as marketing and burns the reader's trust. Small progress
  described accurately is more interesting than small progress inflated.
- **Prefer plain words.** "Idiomatic", "leverage", "robust", "seamless",
  "under the hood", "it's worth noting" — cut them. If a sentence works with a
  shorter word, use the shorter word.
- **Avoid the list-of-bullets post.** Prose carries the argument; bullets are for
  genuine enumerations, three or four at a time, not for the body's structure.
- **No em dash pileups, no rhetorical question openers, no "let's dive in".**

Write in first person plural or impersonal, whichever fits — but stay consistent
inside one post.
