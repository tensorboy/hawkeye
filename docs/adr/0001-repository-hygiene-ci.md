# ADR 0001: Repository hygiene CI — SHA-pinned actions, no tracked secrets

- Status: accepted
- Date: 2026-07-18

## Context

Our workflows referenced external GitHub Actions by mutable tags (`@v4`,
`@v5.0.0`). A tag can be moved by the upstream maintainer — or by an attacker
who compromises the upstream repo — after we adopted it, silently swapping the
code that runs with our repository secrets (the tj-actions/changed-files
incident is the canonical example). Separately, nothing prevented an `.env`
file or a private key from being committed by accident.

## Decision

Adopt the repository-hygiene pattern from
[open-software-network/os-june](https://github.com/open-software-network/os-june/blob/main/.github/workflows/repository-hygiene.yml):

1. A `repository-hygiene` workflow runs on every PR and push to `main`. It
   fails when any `uses:` reference in `.github/workflows` or
   `.github/actions` is not pinned to a full 40-character commit SHA, and when
   any `.env*` file (except `.env.example`), key file (`.pem`, `.p8`, `.p12`,
   `.key`, SSH identities), or inline `BEGIN PRIVATE KEY` block is tracked.
2. All existing action references are pinned to the commit SHA their tag
   resolved to at adoption time, with the human-readable version kept as a
   trailing comment.

## Consequences

- Upgrading an action now means changing a SHA deliberately (Dependabot can
  automate this), not silently receiving whatever the tag points at.
- New workflows that use tag references will fail CI until pinned.
- Committing env files or key material fails CI instead of leaking.
- We do not adopt os-june's release-age (package cooldown) checks yet; that is
  a possible follow-up if supply-chain exposure grows.

## Template for future ADRs

Copy this file, bump the number, keep it short: Context (why), Decision
(what), Consequences (trade-offs accepted). 40 lines is plenty.
