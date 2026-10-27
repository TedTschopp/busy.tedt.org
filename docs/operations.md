# Operations

## Refresh or publish

Run **Refresh and Publish** from GitHub Actions, or:

```sh
gh workflow run publish.yml --repo TedTschopp/busy.tedt.org
```

The job fetches the upstream default branch, pins the commit, stages and validates every complete app folder, refreshes Discussions and counts, runs tests and the production build, and publishes the validated artifact. The pushed source commit is included in `/version.json` and verified after deployment.

Publication is serialized. If main advances during validation, the job fails without pushing unvalidated changes. Rerun the workflow against current main. Required fetch, validation, or build failures preserve the last successful website. Never force-push to resolve a publication conflict.

GitHub schedules are best effort and can be disabled after extended repository inactivity. Check the Actions history if a daily run is missing and re-enable the workflow when necessary. A manual run does not prove the scheduled trigger worked.

## Discussion administration

GitHub Discussions is the system of record. The Ideas category uses its YAML discussion form. Apply `idea:proposed`, `idea:planned`, `idea:building`, `idea:shipped`, or `idea:closed` labels. If multiple status labels remain, Closed, Shipped, Building, and Planned take precedence in that order. No status label means Proposed.

Keep App Discussions restricted to maintainers and giscus. Its term is exactly `app:<source>/<slug>`, with strict matching. Installing giscus for this public repository is required for the embedded panel; the site has a direct GitHub fallback until installation is verified.

Discussion edits, label changes, transfers, deletion, and comments dispatch a read-model refresh. Daily synchronization reconciles votes and missed events. Successful snapshots replace old data, including removal of deleted ideas. A failed fetch never replaces existing totals with zeroes.

## Counter deployment

The Worker, custom domain, and database are provisioned separately. `wrangler.jsonc` records their public resource identifiers.

For GitHub-driven Worker updates, set repository variable `CLOUDFLARE_ACCOUNT_ID` and secret `CLOUDFLARE_API_TOKEN`. Restrict the token to this Cloudflare account with Workers Scripts Write and D1 Write; include the tedt.org zone with Workers Routes Write and Zone Read for custom-domain deployment. Add DNS Write only if Cloudflare’s deployment error explicitly requires it. Never commit the token or place it in a command argument.

The **Deploy Download Counter** workflow reports a warning and skips deployment until its credential exists. Daily catalog updates use the already deployed public counter and do not need a Cloudflare token.

The Worker can also be deployed with the connected Cloudflare API using the exact committed `worker/index.mjs`, the DB binding, and the RATE_LIMITER binding. Apply SQL migrations before deploying code that requires them. The initial migration is idempotent.

## Recovery

For an importer failure, inspect the failed app and the pinned upstream commit in the run logs. Fix the importer or upstream data, rerun tests, and dispatch a fresh run. Original payload bytes should never be rewritten to fix site rendering.

To roll back a site release, revert the faulty source commit through a reviewed Git commit and publish it. When rolling back imported apps, restore both the app folders and matching import-state records together. A subsequent import will resume tracking the current upstream version.

Keep D1 counters during a website rollback. Deploy the previous Worker source when reversing API changes; use additive migrations so older versions remain compatible.

## Qualification

Track local tests, browser QA, hosted CI, public verification, and the first actual scheduled run independently. The schedule is verified only after an Actions run whose event is `schedule` succeeds. Catalog/software validation does not establish that every mirrored app works on physical hardware.
