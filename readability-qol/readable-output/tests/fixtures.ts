export const GOOD_REPORT = `Needs you: Acme cleanup job is live with the 4-day rule

### Done
- Clears Acme bot changes left idle for 4 days, and test-only changes after about 2 days. Changes marked keep, waiting for approval, being rolled out or owned by Acme are never touched.
- Cleared 10 old Beta bot changes, each saved first and restorable for 30 days. Beta now uses 4 of its 20 change slots, down from 14.
- Runs every hour. First run deleted nothing and skipped 9 protected changes.

### Caught
- Two bot changes waiting for Sam had no "keep" mark and would have been deleted on 29/11. See ask 1.

### Not possible
- The platform's own cleanup setting can't do the 4-day rule safely. See ask 2.

### Needs you (reply like "1 yes, 2 yes, 5 change: wait for the third batch")
1. Stop the cleanup job deleting two Acme bot changes that are waiting for Sam
   Type: merge
   Recommend: yes
   Yes means: on 29/11 these two changes stay, protected until 15/12.
   No means: on 29/11 they are deleted and the rider-fee work has to be rebuilt.
   Behaviour change: the job skips any change waiting for a named reviewer.
   Tests: 12 of 12 passed
   Still open: nothing
   Ref: PR app#901 · WP9
2. Switch off the platform's built-in cleanup and let our job do it
   Type: decide
   Recommend: yes
   Yes means: from today only our job deletes old changes, and it skips the protected ones.
   No means: it stays at 30 days; on 29/11 a 4-day setting would delete the change waiting for your go-live.
   Ref: platform stale-changeset setting
3. Put the approved Acme fix batch live
   Type: promote
   Recommend: your call
   Yes means: the batch goes live on Acme chats today at 16:00.
   No means: it waits until 01/12, and the cleanup job keeps protecting it.
   Tests: 46 of 48 passed
   Failed: a rider asking for a refund in Tagalog got the English article. Why: the Tagalog article is still in review. Safe because: today Tagalog riders already get the English article, so nothing gets worse.
   Failed: a timeout on the order lookup in the test sandbox. Why: the sandbox order service was down for 3 minutes. Safe because: the same test passed on the rerun at 14:10 and live lookups are unchanged.
   Customer change: riders asking why they were charged a cancellation fee now get the fee rule and a refund check, instead of a generic apology.
   Example: Rider: "Why was I charged 50 pesos?" Bot: "You cancelled 6 minutes after the driver accepted, so the fee applies. If the driver was late, I can check for a refund."
   Rollback: re-promote yesterday's version from the change history; takes about 5 minutes.
   Ref: changeset 1e2d3c4b
4. Delete an old Acme bot change nobody uses
   Type: delete
   Recommend: your call
   Yes means: today it is removed and frees one of 20 change slots.
   No means: it stays and keeps the slot; the next cleanup run on 26/11 skips it again.
   What goes: a draft of the driver-rating flow from August that was never put live.
   Restorable: yes, for 30 days from the saved copy.
   If wrong: nothing live breaks; the August draft work would have to be redone from the saved copy.
   Ref: changeset 9c8b7a6f
5. Give Sam the ops note in her 01/12 update
   Type: message
   Recommend: yes
   Yes means: no extra message now; she reads it on 01/12.
   No means: I send it today as a separate message.
   To: Sam (Acme ops lead)
   Draft:
   > Hi Sam, two bot changes waiting for you are now protected until 15/12, so nothing you are reviewing will be cleared.
   Why now: her weekly update goes out on 01/12 and this fits there.
6. Start a worker that watches the first live rollout's chats
   Type: spend
   Recommend: your call
   Yes means: from tomorrow a worker reads live chats every hour and flags problems to you here.
   No means: I check the rollout by hand on 27/11.
   Cost: about 3 dollars a day in model calls for 3 days.
   Delivers: a short list of chats that went wrong, with the reason for each.
   When: first list on 27/11 at 09:00.
7. Show one help article to 4-wheel drivers only
   Type: choice
   Recommend: option A
   Option A: only 4-wheel drivers see the article. Example: a motorbike rider asking about tolls gets the motorbike toll answer.
   Option B: everyone sees it with a note at the top. Example: a motorbike rider sees "For cars only" above the toll article.

### Running
- The first and third work batches.
`

export const BAD_REPORT = `Acme cleanup job update

### Done
- Cleanup job live (PR app#901), 10 Beta changesets cleared.

### Needs you
1. Merge WP9 keep-marker fix
   Type: merge
   Recommend: yes
   Yes means: changes waiting for Sam stay.
   Tests: 12 of 12 passed
   Behaviour change: the job skips any change waiting for a named reviewer.
   Still open: nothing
2. Put the approved Acme fix batch live
   Type: promote
   Recommend: your call
   Yes means: the batch goes live on Acme chats today.
   No means: it waits until 01/12.
   Tests: 46 of 48 passed
   Customer change: riders get the fee rule and a refund check.
3. Delete an old Acme bot change nobody uses
   Type: delete
   Recommend: your call
   Yes means: today it is removed.
   No means: it stays; the next run on 26/11 skips it.
4. Tell Sam about the ops note
   Type: message
   Recommend: yes
   Yes means: I send it today.
   No means: she reads it on 01/12.
   To: Sam
5. Pick which drivers see the toll article
   Recommend: option A
   Option A: only 4-wheel drivers.
   Option B: everyone, with a note.

### Running
- WP2 and WP3.
`

export const PROMOTE_NO_FAILURE_REASON = `Needs you: Acme fix batch is ready to go live

### Done
- The fix batch passed review.

### Needs you
1. Put the approved Acme fix batch live
   Type: promote
   Recommend: yes
   Yes means: the batch goes live on Acme chats today at 16:00.
   No means: it waits until 01/12.
   Tests: 46 of 48 passed
   Customer change: riders asking about a cancellation fee get the fee rule and a refund check.
   Example: Rider: "Why was I charged 50 pesos?" Bot: "You cancelled 6 minutes after the driver accepted, so the fee applies."
   Rollback: re-promote yesterday's version; about 5 minutes.
`

export const PLAIN_CHAT = `Sure, the cleanup job is running. I'll check back on it at 16:00.`

export const SAMPLE_ASK = `Needs you: the approved Acme fix batch is ready to go live

### Done
- The fix batch passed review on 26/11.

### Needs you
1. Put the approved Acme fix batch live
   Type: promote
   Recommend: your call
   Yes means: the batch goes live on Acme chats today at 16:00.
   No means: it waits until 01/12, and the cleanup job keeps protecting it.
   Tests: 46 of 48 passed
   Failed: a rider asking for a refund in Tagalog got the English article. Why: the Tagalog article is still in review. Safe because: today Tagalog riders already get the English article, so nothing gets worse.
   Failed: a timeout on the order lookup in the test sandbox. Why: the sandbox order service was down for 3 minutes. Safe because: the same test passed on the rerun at 14:10 and live lookups are unchanged.
   Customer change: riders asking why they were charged a cancellation fee now get the fee rule and a refund check, instead of a generic apology.
   Example: Rider: "Why was I charged 50 pesos?" Bot: "You cancelled 6 minutes after the driver accepted, so the fee applies. If the driver was late, I can check for a refund."
   Rollback: re-promote yesterday's version from the change history; takes about 5 minutes.
   Ref: changeset 1e2d3c4b
2. Stop the cleanup job deleting two Acme bot changes that are waiting for Sam
   Type: merge
   Recommend: yes
   Yes means: on 29/11 these two changes stay, protected until 15/12.
   No means: on 29/11 they are deleted and the rider-fee work has to be rebuilt.
   Behaviour change: the job skips any change waiting for a named reviewer.
   Tests: 12 of 12 passed
   Still open: nothing
   Ref: PR app#901 · WP9
3. Switch off the platform's built-in cleanup and let our job do it
   Type: decide
   Recommend: yes
   Yes means: from today only our job deletes old changes, and it skips the protected ones.
   No means: it stays at 30 days; on 29/11 a 4-day setting would delete the change waiting for your go-live.
   Ref: platform stale-changeset setting
`

export const PROSE_ANSWER_WITH_ASK = `Needs you: here is what the five tickets do, in plain words, so you can answer whether to start them.

- **First ticket:** the bot wakes when containment or CSAT drops and tells you which topic moved.
- **Second ticket:** edits made in the editor can be undone once their judged tests pass.
- **Third ticket:** nightly runs move onto the built-in scheduler, so they stop failing at 02:00.
- **Fourth ticket:** waits on the Acme pricing answer, so it cannot start today.
- **Fifth ticket:** waits on your call about the weekly spend limit.

Three of the five can move today. The other two stay where they are until their answers arrive.

### Needs you
1. Start workers on the three tickets that can move today
   Type: spend
   Recommend: yes, because all three have green plans
   Yes means: I start three workers today, 27/11, one per ticket, and merge each change once its checks pass.
   No means: all three stay where they are from today, 27/11, until you ask.
   Cost: unknown until each worker finishes. Three workers, billed to the API key.
   Delivers: the bot also wakes on containment and CSAT drops, edits with Undo pass their judged tests, and nightly runs are rebuilt on the built-in feature.
   When: today, 27/11, if you say yes.
   Tests: 9 of 9 plans reviewed
   Failed: nothing yet.
   The fourth and fifth tickets are not part of this ask.
   Ref: APAC-101 · APAC-102 · APAC-103
`

export const PROSE_STATUS = `The cleanup job ran cleanly overnight and nothing needs you.

### Done
The job cleared **10 old Beta changes**, each saved first and restorable for **30 days**.

### Running
The next run starts at **16:00**. I will check its log then.

**Why it skipped 9 changes:** they were waiting for a named reviewer, which the new rule protects.
`

export const INCOMPLETE_ASK = `The August draft is the only stale change left, and removing it frees a slot.

### Needs you
1. Delete the August driver-rating draft
   Type: delete
   Recommend: yes
   Yes means: it is removed and frees one of 20 change slots.
   No means: it stays and keeps the slot.
   What goes: a draft of the driver-rating flow from August that was never put live.
   If wrong: nothing live breaks; the draft would be rebuilt by hand.
2. Keep the hourly schedule
   Type: decide
   Recommend: yes
   Yes means: the job keeps running every hour.
   No means: it runs once a day instead.
`

const ASK_TITLE = /^\d{1,2}\.\s+(.*)$/

export const toFenced = (report: string) => {
  const [before, needs = ''] = report.split(/^### Needs you.*$/m)
  const [askPart = '', ...after] = needs.split(/^### /m)
  const asks = askPart
    .split(/^(?=\d{1,2}\.\s)/m)
    .filter(chunk => ASK_TITLE.test(chunk.split('\n')[0]!))
    .map(chunk => {
      const [title, ...rest] = chunk.trimEnd().split('\n')
      return ['```ask', ASK_TITLE.exec(title!)![1]!, ...rest.map(line => line.replace(/^ {3}/, ''))].join('\n') + '\n```'
    })
  return [before!.trimEnd(), '', asks.join('\n\n'), ...after.map(section => `\n### ${section.trimEnd()}`)].join('\n').trim() + '\n'
}

export const GOOD_FENCED = toFenced(GOOD_REPORT)
export const BAD_FENCED = toFenced(BAD_REPORT)
export const SAMPLE_FENCED = toFenced(SAMPLE_ASK)
export const PROMOTE_NO_FAILURE_FENCED = toFenced(PROMOTE_NO_FAILURE_REASON)

export const SPLIT_ORIGINAL = `The old exports are archived and one ask needs you.

### Needs you
1. Delete the archived exports
   Type: delete
   Recommend: yes
   Yes means: the archived exports go away today.
   No means: they stay.
   What goes: archived exports from the spring trial.
`

export const SPLIT_FOLLOW_UP = `### Needs you
1. Delete the archived exports
   Type: delete
   Recommend: yes
   Yes means: the archived exports go away today.
   No means: they stay.
   What goes: archived exports from the spring trial.
   Restorable: yes, for 30 days from the trash.
   If wrong: we restore them from the trash.
`
