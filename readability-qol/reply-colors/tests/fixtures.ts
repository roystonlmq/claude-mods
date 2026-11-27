export const SAMPLE_REPLY = `The simple readability prompt works and reads well on the dev bot, but it hasn't merged. In 2 of 3 runs it made one small formatting slip. The screenshot above is from the dev bot: short, plain sentences, but the first line, "The gap is too big to be chance.", came out as a stray bullet in the middle of an explanation.

What's done
- The readability prompt is now a few lines: about 80% ASD-STE100, short sentences, one idea each, keep the meaning, add nothing.
- The comparison check and the length limit are gone.
- The security fix for hidden characters and the duplicate-title fix are kept.
- The ticket is updated to match your decision, quoting you.

Why it stopped short of merging
The pass rule says an explanation must stay as prose. Without being told, the prompt sometimes turns a sentence into a bullet.

Your call
- Add two short lines to the prompt and test once more (I recommend this): "Keep prose as prose and points as points" and "Leave out file paths and raw ids". The prompt stays simple, and these restore your earlier rule that the type of content decides prose or bullets. The retest is about 11 runs, under US$1.
- Ship as it is: an odd stray bullet now and then.

One small side effect to know about
The simple prompt sometimes firms up wording. "Should be considered" became "We will consider". If you'd rather it kept the draft's exact tone, I can add that as a third line.

Spend
- The runs so far cost under US$1. Each time a worker raises the test cap, it records the raise under your standing "just auto approve".
- The wider meter: this month is about 94% of the US$5,000 cap, and this week was 83% of US$1,500 when last read.`

export const READABLE_REPORT_SUMMARY = `### Done
- Cleared 10 old Beta bot changes, each saved first and restorable for 30 days.
- Runs every hour. First run deleted nothing and skipped 9 protected changes.

### Caught
- Two bot changes had no "keep" mark and would have been deleted on 29/11.`

export const MIXED_MARKDOWN = `## Deploy plan

1. Promote the **fix** to live on 26/11 at 4pm.
2. If it fails, roll back with \`git revert abc123\` and see [the runbook](https://example.com/runbook).

> Note: do not force push to main.

\`\`\`bash
git push --force
\`\`\`

| Step | Result |
| --- | --- |
| tests | 46 of 48 passed |

The fix is live and all tests passed. Nothing failed.`

export const PLAIN_REPLY = `Here is where the three worker jobs stand after tonight's runs, with what each one means for tomorrow.
- Cancelled, then not cancelled: the cleanup worker was stopped at 21:40 because it looked stuck, but its last batch had already finished, so the stop came after the work was done. Nothing was lost, and the next run at 09:00 picks up from the saved point without any manual step.
- Report worker: it wrote the weekly summary twice because the first copy timed out on the upload step and the retry did not check for the earlier file. Both copies are the same, so I kept the newer one and moved the older one to the archive folder.
- Watcher: it flagged 4 of 52 chats tonight, all for slow replies during the 22:00 peak, and none for wrong answers. That matches last week, so there is no new problem to chase.

If you want, I can add a check so the report worker skips the upload when a copy already exists, which would stop the duplicate from happening again.`
