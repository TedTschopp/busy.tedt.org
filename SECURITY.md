# Security and Source Integrity

The website importer reads Git objects and validates and packages files. It never runs an imported app, its tests, or its dependency installers.

Mirroring is not an audit of app behavior or dependencies. Imports retain their upstream commit and content hash. Reviewed local dependency fixes are allowed through `patches/community/<slug>/series.json`: ordered SHA-256-bound text patches are applied to staged upstream bytes, then validated and recorded with a separate effective content hash. Downloads and app pages disclose these local patches. Unrecorded edits, modified patch files, unsafe paths, and upstream drift fail validation. The importer never executes app code, tests, dependency installers, or patch hooks.

For an imported app problem, follow its source or author-project link. For a website problem, open a repository issue without including credentials or personal configuration. Report a sensitive vulnerability privately through GitHub’s security reporting features when available.

Rendered documentation is sanitized and active HTML is rejected. Download payloads remain inert on the website’s origin. The download counter validates app IDs, checks browser origins, deduplicates event IDs atomically, and rate limits writes. No secret belongs in the public site or catalog.
