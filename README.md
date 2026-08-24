# The Edgar Cayce Readings Wiki

[![Live site](https://img.shields.io/badge/live-cayce--wiki.vercel.app-000?logo=vercel)](https://cayce-wiki.vercel.app)
[![Deploy](https://github.com/Nostem/cayce-wiki/actions/workflows/deploy.yml/badge.svg)](https://github.com/Nostem/cayce-wiki/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE.txt)

A searchable, linked edition of the complete Edgar Cayce readings corpus. The project turns **14,306 readings** from the A.R.E. Complete Readings CD-ROM into an Obsidian-compatible Markdown vault and publishes it as a [Quartz v5](https://quartz.jzhao.xyz/) knowledge site.

**Live site:** https://cayce-wiki.vercel.app

## What is included

The repository contains **24,301 Markdown notes**:

| Collection          |  Notes | Purpose                                                                                                   |
| ------------------- | -----: | --------------------------------------------------------------------------------------------------------- |
| `content/readings/` | 14,306 | One note per Cayce reading, including transcript text, metadata, reports, background, and linked mentions |
| `content/entities/` |  9,975 | People, places, concepts, remedies, organizations, and other linked entities                              |
| `content/series/`   |     19 | Reading-series indexes organized by subject and reading-number range                                      |
| `content/index.md`  |      1 | Site home page and high-level corpus index                                                                |

The published site provides:

- full-text search across reading titles, tags, and compact excerpts;
- Obsidian-style internal links and backlinks;
- local graphs for individual notes;
- a curated global graph of prominent entities and reading series;
- reading metadata such as reading number, series, year, sex, entities, and tags;
- RSS and sitemap output;
- responsive light, dark, and reader modes.

## Corpus and editorial notes

The source corpus covers readings dated **1901–1944** and was extracted from the A.R.E. Complete Readings CD-ROM.

Entity notes and links are partly machine-generated. Surface-form linking and LLM-assisted extraction are useful navigation aids, but they are not scholarly authority. **Verify quotations, entity identifications, dates, and interpretive claims against the reading text before citing them.**

The repository currently reports some slug collisions among similarly named entity notes. Quartz uses the last processed note for a collided URL and prints the complete collision list during builds. These warnings do not stop deployment, but contributors should avoid introducing new collisions and should consolidate existing duplicates carefully.

## Repository layout

```text
.
├── content/                         # Published Markdown vault
│   ├── readings/                    # 14,306 reading notes
│   ├── entities/                    # Linked entity notes
│   ├── series/                      # 19 series indexes
│   └── index.md                     # Site home page
├── quartz/                          # Quartz framework source
├── quartz.config.yaml               # Site, theme, plugin, and layout configuration
├── scripts/
│   ├── patch-quartz-performance.mjs # Exact, guarded patches for large-vault clients
│   ├── strip-content-index.mjs      # Splits and compacts search/graph data
│   ├── vercel-build.mjs             # Canonical optimized production build
│   └── prepare-vercel-output.mjs    # Creates a Vercel Build Output API artifact
├── .github/workflows/deploy.yml     # GitHub Actions build and prebuilt Vercel deploy
├── vercel.json                      # Clean-URL and Vercel build configuration
└── public/                          # Generated site output; ignored by Git
```

## Requirements

- Node.js **22 or newer**
- npm **10.9.2 or newer**
- Git

A full build processes more than 24,000 Markdown files. Expect high CPU and memory use and a build time of roughly **35–50 minutes** on a two-core CI runner.

## Local development

Install the pinned dependencies:

```bash
npm ci
```

Run the complete test suite:

```bash
npm test
```

Run TypeScript and formatting checks:

```bash
npm run check
```

Start Quartz's local development server:

```bash
npx quartz build --serve
```

The development server is useful for content and layout work, but it does not apply the production-only large-vault patches described below.

## Production build

Use the canonical production command:

```bash
VERCEL_PROJECT_PRODUCTION_URL=cayce-wiki.vercel.app npm run vercel-build
```

This command performs the following steps in order:

1. rewrites Quartz's build-time `baseUrl` to the deployment host;
2. applies guarded performance patches to the installed Quartz search and graph clients;
3. builds all Markdown content into `public/`;
4. compacts `public/static/contentIndex.json` for lazy search;
5. creates `public/static/graphIndex.json` for lazy local and global graphs.

The build-time `baseUrl` rewrite updates the working copy of `quartz.config.yaml`. In CI this happens in an ephemeral checkout. After a local production build, restore the file before committing:

```bash
git restore quartz.config.yaml
```

### Why the custom build exists

Quartz's standard content index is too expensive to parse and traverse on every page when the vault contains more than 24,000 notes and hundreds of thousands of graph links. This project therefore:

- initializes search only after the first query;
- coalesces concurrent search initialization and discards stale results;
- keeps excerpts short in the search index;
- downloads graph data only when a graph is requested;
- precomputes bidirectional local adjacency at build time;
- limits the global graph to prominent entities and series;
- requires an explicit click before rendering a local graph.

`scripts/patch-quartz-performance.mjs` uses exact, count-checked replacements. If an upstream Quartz package changes, the build fails instead of silently publishing an unoptimized site.

## Deployment architecture

Production deployment has one authoritative path:

```text
push to main
    ↓
GitHub Actions
    ↓
npm ci → optimized Quartz build → compact indexes
    ↓
Vercel Build Output API artifact
    ↓
prebuilt, compressed deployment to Vercel
    ↓
https://cayce-wiki.vercel.app
```

The Vercel project's direct Git integration is intentionally disconnected. A direct Vercel Git build repeats the full Quartz build inside Vercel and can exceed Vercel's 45-minute build limit. GitHub Actions builds the site first and uploads the completed static artifact with `vercel deploy --prebuilt --archive=tgz`.

### Required repository secret

The GitHub repository must define:

| Secret         | Purpose                                       |
| -------------- | --------------------------------------------- |
| `VERCEL_TOKEN` | Authorizes the prebuilt production deployment |

The Vercel organization and project IDs are non-secret identifiers defined in `.github/workflows/deploy.yml`.

### Manual deployment

To redeploy the current `main` revision without another commit:

```bash
gh workflow run deploy.yml --repo Nostem/cayce-wiki --ref main
```

Then watch the run:

```bash
gh run watch --repo Nostem/cayce-wiki
```

## Tests and verification

Run all tests before pushing:

```bash
npm test
npm run check
git diff --check
```

Focused deployment and index tests can be run directly:

```bash
node --test scripts/vercel-build.test.mjs
node --test scripts/strip-content-index.test.mjs
node --test scripts/patch-quartz-performance.test.mjs
```

After deployment, verify at minimum:

- `/` loads successfully;
- a representative reading such as `/readings/3744-1` loads;
- an entity page such as `/entities/atlantis` loads;
- search returns results after normal multi-keystroke input;
- result navigation remains client-side and responsive;
- `/static/contentIndex.json` and `/static/graphIndex.json` return `200`;
- generated HTML contains no retired `/cayce-wiki/` deployment prefix.

## Contributing

1. Create a focused branch.
2. Make content or code changes without modifying generated `public/` output.
3. Preserve frontmatter, reading identifiers, and existing wikilink conventions.
4. Run the relevant focused tests and the complete suite.
5. Check the build output for new slug collisions.
6. Open a pull request describing the source and verification for content changes.

For corpus corrections, include the reading number and quote enough surrounding text to make the correction auditable. Avoid turning generated entity summaries into uncited factual claims.

## Licensing and rights

The Quartz software in this repository is distributed under the [MIT License](LICENSE.txt).

The Edgar Cayce readings, A.R.E. source media, transcriptions, names, and related archival material may have separate copyright, trademark, or usage restrictions. The MIT license for the software does **not** grant rights to third-party corpus material. Users are responsible for determining whether their use of the content is permitted.

## Acknowledgments

- [Quartz](https://quartz.jzhao.xyz/) by Jacky Zhao and its contributors
- The Association for Research and Enlightenment (A.R.E.) as the source publisher of the Complete Readings collection
- The archivists, transcribers, indexers, and researchers who preserved and organized the Cayce material

---

Created by [Nostem](https://github.com/Nostem).
