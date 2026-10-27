# BUSY Bar Apps

A public library of complete BUSY Bar apps and community ideas at **https://busy.tedt.org**.

The site uses AI.Tedt.org’s Public Workbench design. The community catalog is imported from [maxswinkels/busybar-apps](https://github.com/maxswinkels/busybar-apps); direct submissions live separately. This is an unofficial project, unaffiliated with Flipper Devices.

## Development

Use Node 26 (or Node 22.23.4 and newer):

```sh
npm ci
npm test
npm run build
npm run dev
```

`npm run build` validates every app, builds exact downloads and catalog JSON, generates the static site, and verifies its published files. It never runs an imported app.

The browser suite uses an isolated Google Chrome session against a production preview:

```sh
npm run preview
npm run test:browser
```

Set `BUSY_TEST_URL` when the preview runs on a different port. The suite checks search, filters, sorting, themes, mobile layout, reduced motion, download acknowledgment, and counter failure.

## Content

- `apps/community/`: imported app folders; change these through the importer.
- `apps/tedt/`: local app submissions, maintained through pull requests.
- `src/data/import-state.json`: source commits, hashes, dates, and archive state.
- `src/data/community.json`: GitHub Discussions read model.
- `src/data/downloads.json`: last successful download-start snapshot.

Generated downloads, previews, social cards, and catalog files are build artifacts. Original app files retain their bytes and paths. Community ZIPs additionally include the upstream MIT license notice under `LICENSES/UPSTREAM-MIT.txt`.

Individual payloads are served with a `.bin` suffix and a download filename. This keeps source HTML and SVG from becoming executable pages on this website’s origin.

## Updates and Community

**Refresh and Publish** imports new and updated apps daily at 3 a.m. America/Los_Angeles, with daylight-saving changes, and supports manual dispatch. GitHub may deliver scheduled jobs late. Discussion activity refreshes the ideas board and engagement snapshots; reactions reconcile on the daily run. Unchanged snapshots cause no commit or deployment.

App identities are `community/<slug>` or `tedt/<slug>`. Their stable routes, discussion terms, and counters survive payload updates. Upstream removals archive the last complete copy.

Ideas are GitHub Discussions in the repository’s Ideas category. App comments use App Discussions with exact `app:<source>/<slug>` titles through giscus. Do not copy votes or comments from unrelated repositories.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [operations](docs/operations.md).

## Download API

The `busy-apps-api` Cloudflare Worker uses the `busy-apps-metrics` D1 database:

- `GET https://api.busy.tedt.org/v1/downloads` returns `{ "downloads": { "community/clock": 12 } }`.
- `POST /v1/downloads/{encoded-app-id}` accepts `{ "eventId": "<UUID v4>" }` from the site’s origin and returns HTTP 202.
- `GET /health` confirms database access.

Each new event increments its app’s total atomically. Retries of the same event do not count twice. Requests are rate limited; unknown apps and untrusted origins are rejected. Download links point directly to static ZIPs, so counter failures never block them.

These are best-effort package-download starts, not completed transfers or installations. Source downloads and clipboard actions are excluded. The service stores app IDs, random event IDs, and timestamps; it does not persist visitor IP addresses or identities.

## License and Attribution

Gallery code and contributed apps are MIT licensed. App authors and original notices are retained. See [LICENSE](LICENSE), [upstream license](docs/UPSTREAM-LICENSE), and [third-party attribution](docs/UPSTREAM-ATTRIBUTION.md). The design and masthead come from TedT.org and AI.Tedt.org. BUSY brand/device artwork is © Flipper Devices, CC BY 4.0. Fonts retain their open-font licenses.
