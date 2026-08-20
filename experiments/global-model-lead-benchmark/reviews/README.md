# Blinded human review

This directory is the local working area for Codex-normalized candidates and the
single human reviewer's decisions. Candidate files can contain public business
contacts and are ignored by Git.

Codex prepares one evidence packet per deduplicated company from every system's
top 20 answer positions. The packet retains the exact answer excerpt, cited URLs,
and Codex pre-verification notes, but replaces provider, model, product, and run
identities with salted blind IDs. The secret salt remains local.

The reviewer assigns exactly one class: confirmed current Cudy channel,
qualified tier-1, important downstream, or invalid. Invalid records must use a
specific rejection reason. Every scored contact and public contact method is
reviewed. After the first pass, Codex deterministically selects 15 percent of
the decisions, shuffles them without prior decisions, and asks the same reviewer
to judge them again. Differences enter a final adjudication queue.

Only aggregate, redacted metrics may be committed. Raw answers, candidate names,
contact details, blind-ID salts, reviewer working files, and adjudication notes
remain local.
