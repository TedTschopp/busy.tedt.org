# Security and Source Integrity

The website importer reads Git objects and validates and packages files. It never runs an imported app, its tests, or its dependency installers.

Mirroring is not an audit of app behavior or dependencies. Original files and lockfiles remain unchanged so that provenance and downloads are verifiable. Dependency alerts inside imported app folders belong to those original projects; do not silently patch their files in this mirror.

For an imported app problem, follow its source or author-project link. For a website problem, open a repository issue without including credentials or personal configuration. Report a sensitive vulnerability privately through GitHub’s security reporting features when available.

Rendered documentation is sanitized and active HTML is rejected. Download payloads remain inert on the website’s origin. The download counter validates app IDs, checks browser origins, deduplicates event IDs atomically, and rate limits writes. No secret belongs in the public site or catalog.
