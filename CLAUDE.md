# House rules

Twelve rules, so they get applied rather than rediscovered. Short on purpose.

This file is deliberately near-identical to the one in `AreThePackersUndefeated`.
The two sites are one codebase that forked and drifted, and the rules are the
part that should never have diverged. Only the closing section differs. When a
shared repo exists, everything above it becomes that repo's file unchanged.

## Measure, don't assert

If a claim can be checked against the running thing, check it before writing it
down. The bugs that actually shipped here all read correctly in the source.

The records page rendered as one tall column at every viewport above 600px, on
both sites, for months. The grid rule was right. `body` is a column flexbox with
`align-items: center`, so a container carrying only a `max-width` is sized
shrink-to-fit, and an `auto-fit` track list resolves to exactly one repetition
against an indefinite inline size. None of that is visible in the stylesheet.
Rendering it at 1400px and looking is what found it.

That is cheap enough to be the default now: start the server on a spare port,
`chrome --headless --screenshot --window-size=1400,1600`, and look at the image.
Do it before and after, so the pair is evidence rather than hope.

Corollary: a test that reads the source proves the source, not the behaviour.
Keep both, and know which one you just wrote.

## Don't jump to conclusions

The failure mode here is not being wrong about hard things. It is taking a
plausible reading and stating it as established when the check was one command
away.

The precomputed indices were reported as loading in a 174MB heap. That number
came from loading them in isolation, where nothing else is on the heap; in the
server they blew past the 400MB cap and wanted about 600MB. Same code, different
question, and the wrong one had been answered.

The same pass claimed the copy line for a season with no losses was "genuinely
needed by the Brewers." It is unreachable on both sites. And the football site's
Tuesday-cron reasoning was borrowed wholesale to explain this site's data
cadence, which is refreshed by hand and whose workflow only validates.

So: **if a claim is checkable in one command, run the command before saying the
thing.** When it is not checkable, say which kind of claim it is.

Never pipe a command whose exit code matters. `set -o pipefail`, or do not pipe.
That rule was already written down in a sibling repo and then broken here in the
same week, by piping a test run through `tail` and reading the pipe's status.

## Comments explain why, never what

When a value was chosen by measurement, record the number **and** the rejected
alternative.

A comment must never assert an outcome the code cannot produce. `.records-grid`
carried this for months:

> The container caps at 900px (836px inner), so this always yields one or two
> comfortable columns.

It yielded one. The 836px was never reached, because nothing gave the container
a definite width. That comment was worse than no comment: it answered the
question a reader would otherwise have gone and checked.

## Reversals stay visible

When a decision is overturned, mark the old one and say what changed. Do not
quietly edit it away. `ROADMAP.md` keeps its measured numbers and annotates the
ones that have since moved rather than correcting them in place — a document
that only ever agreed with itself is not evidence of anything.

## State the limit of the claim

Say what a thing does *not* do, in the same breath. The artifact loader's
comment now reads "measuring that load in isolation suggested it was fine; it is
not, because in isolation nothing else is on the heap." The wrong number stays,
with the reason it was wrong, because the next person will be tempted to measure
it exactly the same way.

## Tests assert rules, and fail on the old code

Verify a new test fails before the fix, by reverting. A test that never failed
has proved nothing, and this pair of repos has shipped several that could not:

- A sort test using `0001`, `0002`, `0010`. Zero-padding makes lexical order and
  numeric order identical, so it passed under the bug it was written for. It had
  to become 9999 versus 10000 before it could fail.
- A test asserting `'2 clashs'` — the expectation contorted to match a
  pluralisation bug instead of the bug being fixed.

Green suites prove only what they cover. 118 tests passed on the football site
while every past season rendered a 0-0 record and a schedule of 0-0 ties,
because its `main.js` fetches its own CSV in the browser and `lib/seasons.js`
reads the file at import and calls ESPN. Neither is reachable from `node --test`.
Know which files your suite cannot see, and say so out loud.

Two layers, on purpose. Unit tests build their own rows and pin exact numbers.
Tests against the real data assert relations and floors — ordered, distinct, at
least this many — and never snapshots, because the data is refreshed and a
snapshot fails for reasons that are not defects.

**An invariant claimed in a commit message is not an invariant.** The rename that
introduced neutral row keys announced that "one function owns the CSV's own
names." That was false as written: fourteen consumers still read
`g['Packers Win']` and `g.packers_score`, each silently yielding `undefined`
rather than throwing. If a property is worth asserting in prose, write the test
that fails when it stops being true.

## Derived data stays derived

If it can be rebuilt from sources, rebuild it; never store it and hand-edit.
Committed is fine — generated and committed is the normal case on both sites.
The baseball site's `data/indices/` is written by `scripts/build-indices.mjs`,
and CI re-derives it and compares digests, so a hand-refresh of the Retrosheet
files cannot leave stale artifacts behind. The football site's
`data/packers_games.csv` is written by `update-data.js` from the upstream feeds
and never edited by hand, which is what lets its columns be renamed at all.

Round-tripping is where derivations break, and the break is quiet. Three of the
thirteen indices are Maps of Maps, and an early version tagged only the top
level. The server booted cleanly, logged success, served every page, and threw
`gameFirstPa?.get is not a function` on every box score. Four of the thirteen had
been spot-checked. Diffing artifact output against CSV output is what found it —
check every one, or check none and say which you did.

## The vocabulary lives in `site.js`, and substitution is not translation

`site.js` is the manifest: the nouns, the rules, the record list, the team ids,
and whole-sentence copy overrides. Code reads it rather than naming a team.

The trap is assuming one site's sentence becomes the other's by swapping a word:

- `meetingPlural` exists because "clash" plus "s" is "clashs".
- `scoreForLabel` exists because "Points For" and "Runs Scored" are not one
  phrase with a different noun — the verb changes too.
- `losslessSeasonNoun` exists because in football *perfect* means no losses and
  no ties. 1929 went 12–0–1. It was undefeated; it was not perfect.

Where the two sites genuinely disagree, declare it and test the declaration
against the behaviour. `streaksSpanSeasons` is the live example: streaks end at
the season boundary here and span seasons on the football site, whose longest
run — 15 games — crossed from December 2010 into December 2011. Merging those
two implementations without noticing would silently rewrite one record book.

A flag that exists must be honoured. `SITE.records` is the list deciding which
cards appear, and `records.js` ignored it and iterated a hardcoded array instead,
so publishing a slug did nothing at all.

## Colour and theme

Colour belongs in CSS custom properties. Neither stylesheet has any: there are
**282 hardcoded hex literals** across the two repos, and four brand values are
the only real difference between the palettes — the status colours are already
identical. Extracting them is roadmap work. Until then, do not add a literal
where a neighbouring rule already names the same colour.

## Dependencies default to none

Both sites run on Node's standard library and `node --test`. A new runtime
dependency needs a reason in the PR.

The lockfile is part of that. The football site's `package-lock.json` locked
`vite` and nothing else, while `package.json` had declared `@resvg/resvg-js` and
`opentype.js` all along. Render's `npm install` resolved them fresh, so nothing
broke and nothing was pinned either. After any install, confirm the lockfile
actually contains what the manifest declares.

## Docs are part of the change, not a follow-up

Every PR updates the documents the change made wrong: `ROADMAP.md`, this file,
and the module headers describing the thing being changed. A claim written when
it was true does not announce that it stopped being true — no test fails, no
build breaks, no page renders wrong.

`ROADMAP.md` covers both repositories, because most of what is left is about the
two converging. It lives in the football repo because that is where the work
started, and it moves if a shared repo appears.

## Commits and branches

A subject line stating what the change makes true — no conventional-commit
prefixes, no ticket refs. The body runs as long as the reasoning needs,
including what was measured and what was rejected. Do not claim an invariant
there that a test could assert instead.

### Work branches into `dev`. `dev` goes into `main`.

Work happens on a branch off `dev` and PRs into `dev`, and that branch is deleted
on merge. Releases are a PR from `dev` into `main`. **`dev` and `main` are
permanent and are never deleted.**

**Merge commits, never squash.** `dev` was once squashed into `main` and then
recreated. The local branch kept the pre-squash commits while the remote had the
squashed one, and the two looked like unrelated work. The residue was 220 commits
that `main` carried and `dev` did not, so every release PR afterwards computed
its diff against a base missing most of `main`'s history.

**Branch from `dev`, not from another work branch.** A stacked PR was merged 21
seconds after its own base, before GitHub retargeted it, and landed on the wrong
branch.

**Back-merge `main` into `dev` after each release.** Every release leaves `main`
one merge commit that `dev` never sees, and that is what accumulated into the
220. The merge is a no-op on the tree and takes one command.

## Files

Extract when a file stops being readable, not at a line count. Known exception:
`main.js` is far past that on both sites and should be reduced by extraction
rather than a rewrite. It is also the file least covered by tests, which is not
a coincidence.

---

*This site: Retrosheet game logs, box scores and play-by-play, refreshed by hand
— the workflow validates rather than fetches, and `plays.lfs.csv` is Git LFS.
Streaks end at the season boundary. A perfect season is not a plausible outcome
here and the copy says so: of every MLB season above .700, two have happened
since 1955.*
