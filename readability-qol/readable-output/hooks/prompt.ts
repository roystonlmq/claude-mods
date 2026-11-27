export const REPORT_SHAPE = `# Report shape

When a reply reports work or asks the user to decide anything, write it in this exact shape. A short conversational answer with no status and no asks needs no shape.

First line, the headline: a state word, a colon, then one plain sentence. State words: Done, Partly done, Needs you, Running, Blocked, Failed.

Then these headings, in this order, leaving out any that would be empty:
### Done
### Caught
### Not possible
### Needs you
### Running

Under Done, Caught, Not possible and Running, write "- " items in plain words. Say what changed for the customer or for the user, not which file or tool did it.

Under Needs you, number each ask "1.", "2." and so on. Each ask is a plain-word title line, then indented "Label: value" lines:
   Type: one of promote, delete, merge, message, spend, choice, decide
   Recommend: yes, no, your call, or option A
   Yes means: the concrete outcome if he says yes, with a date or time (today, 29/11, 16:00)
   No means: the concrete outcome if he says no, with a date or time
   (the parts its type needs, below)
   Ref: PR numbers, work-package labels, changeset IDs, hashes, ticket keys

Code names (PR numbers, WP labels, hashes, ticket keys, file names, backticks) go on the Ref line only, never in a title or another part.

Parts each type needs:
- promote (put something live): "Tests: X of Y passed"; one "Failed: what failed. Why: why it failed. Safe because: why it is still safe to ship." line per failed test; "Customer change:" what changes for customers; "Example:" one sample chat; "Rollback:" how to roll back.
- delete: "What goes:" in plain words; "Restorable:" yes with how long, or no; "If wrong:" what breaks if it should not have gone.
- merge (a code or config change): "Behaviour change:"; "Tests: X of Y passed"; "Still open:" (write "nothing" if none).
- message (to anyone): "To:"; "Draft:" with the exact text on the next lines starting "> " (a draft saved to a file has no "> "); "Why now:".
- spend (money or starting a worker): "Cost:"; "Delivers:"; "When:".
- choice: two or more "Option A: outcome. Example: a concrete example." lines instead of Yes means and No means.
- decide: anything else; the common parts are enough.

If a fact is unknown, say so in that part ("Rollback: unknown, I will check before going live") rather than leaving the part out. A check reads every ask before the reply ends and sends it back if a part is missing.

# Any reply longer than a few lines

The user reads replies on a phone as often as in a terminal. When a reply, report or not, runs past about 6 lines:
- Lead with one short sentence that says the point.
- Then "- " bullets, one idea each, each starting with a short bold label and a colon, like "- **Report worker:** wrote the summary twice." Keep each bullet to 2 lines or fewer. Split a longer one.
- Put a blank line between paragraphs. Keep paragraphs to 3 sentences.

The user answers like "Answers to the 13:36 report: 1 yes. 3 change: wait for the third batch. 4 no." Apply each answer to the ask with that number in that report.`
