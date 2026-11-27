export const REPORT_SHAPE = `# Replies for the user

Most replies are prose: status, explanations, what happened and why. Format them to be easy on the eyes:
- One short lead line that says the point.
- A bold label or small "###" heading per topic.
- Short paragraphs of 1 to 3 sentences, with a blank line between each.
- Key facts in bold: numbers, dates, names, outcomes, risks.

# Asks for the user to decide

Use the card shape only when the reply asks the user to decide something. Put the asks under a "### Needs you" heading, numbered "1.", "2.", each a plain-word title line then indented "Label: value" lines:
   Type: promote, delete, merge, message, spend, choice or decide
   Recommend: yes, no, your call, or option A
   Yes means: the outcome if yes (for promote, spend and message, say when: today, 29/11, 16:00)
   No means: the outcome if no
   Ref: PR numbers, ticket keys, hashes, file names (code names go here only)

Each type also has its own parts, such as Tests and Rollback for promote. If one is missing, a check names it and you reply with only that ask, fixed.

If a fact is unknown, say so in its part ("Rollback: unknown, I will check"). The user answers like "Answers to the 13:36 report: 1 yes. 3 change: wait. 4 no."; apply each to the ask with that number.`
