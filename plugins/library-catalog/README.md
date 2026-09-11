# LibraryCatalog integration and provenance

Register this local plugin using `source: ./plugins/library-catalog`, category `pageType`, enabled. Its default export and named `LibraryCatalog` export are the same factory; the returned page type is `LibraryCatalog`, priority 100, layout `catalog`. Disable the packaged `folder-page` and `tag-page` generators: both generate conflicting virtual routes. Configure the `catalog` layout (or the loader's per-page-type override for `LibraryCatalog`) with the reader frame, title and catalog body, without the old folder/tag PageList or source membership body. The plugin itself supplies `body`; do not add a second body component. Build with `npm --prefix plugins/library-catalog run build` before the parent Quartz build/bootstrap.

Generated pages are `unlisted: true`: ContentIndex respects this and excludes them from its ordinary search/RSS/sitemap projection. They remain linked from catalog pagination/filter navigation. Search post-processing synthesizes consolidated topic entries separately and suppresses their members only from search; all original entity and series routes and graph records remain available. Original shell titles are updated in memory, not Markdown. Only source readings/entities/series enter membership; index shells and pagination paths do not. All source membership counts must reconcile; reduced fixtures must explicitly supply matching membership metadata, never silently truncate declared counts.

## Portable reconstruction

Normal site builds need only checked-in `data/complete-memberships.json`, not the external builder. Regeneration requires the exact external inputs recorded individually by SHA-256 in `data/membership-provenance.json`: builder Python modules, complete enrichment JSON records, entity lexicon, literal index, and source reading/entity Markdown. These inputs are not distributed by this plugin. The provenance uses logical relative names, not machine-specific paths.

From the site root, with Python 3 and the original builder sources available:

```sh
python3 plugins/library-catalog/regenerate-memberships.py \
  --builder "$BUILDER" \
  --enrichment "$ENRICHMENT" \
  --lexicon "$CORPUS/entity_lexicon.json" \
  --literal-index "$VAULT/.cayce-build/literal_entity_index.json" \
  --content content
```

The default is read-only verification: reproduce all memberships, validate all capped entity counts/source link prefixes/reading targets, then compare exact provenance and deterministic artifact bytes. Add `--write` to rewrite only the two plugin data artifacts after membership equivalence is established. The script calls the builder's pure canonicalization/planning functions, never its source-writing main routine; Python bytecode writes are disabled. No source Markdown is modified. A changed corpus requires deliberate review of the membership equivalence guard rather than quietly blessing changed counts.

Verified reconstruction: 111 capped entities, including Atlantis 875; 39,366 source input hashes. Artifact SHA-256: `5267f4d52e8c30d975084e368cd01127177b7e2fc71cf1dd6ce46ff1dc09dc4e`.

## Reviewed topic consolidation

`data/topic-groups.json` is the versioned editorial manifest. Each group has a unique lowercase-hyphen `id`, a reader-facing `label`, a `kind` (`equivalent` or `umbrella`), a review `reason`, and at least two exact Git-tracked `entities/<filename>.md` source paths. Reasons document editorial decisions in the manifest; page introductions show concise counts instead of internal review notes. Do not replace this review process with runtime fuzzy matching or transitive unions of overlapping proposals.

`buildTopicGroups` in `quartz/components/library/topics.ts` resolves every member through `sourceRoute`, rejects missing or multiply owned sources and route collisions, and unions memberships by exact reading identity, including `_id` suffixes. Root and type-filter entity directories project one row per consolidated heading. Tags retain their source-record organization.

Each `/topics/<id>` page is unlisted and retains `libraryCatalog: true` to avoid eager retained HAST. It previews at most eight source terms; groups with more terms receive 40-row `/topics/<id>/source-terms` pagination. Reading unions retain existing number/date pagination. Every original member page keeps its original title and membership, with a link to the combined topic.

`scripts/strip-content-index.mjs` uses `scripts/topic-search.mjs` to create canonical search records after validating source paths and emitted topic pages. Original labels remain searchable beyond the normal excerpt cutoff. The graph projection is built from the original index, before search-only suppression. Reduced fixtures use `verifyCorpus: false` and explicit `topicGroups`; without explicit fixture groups they default to none. The search CLI's optional sixth positional argument supplies its fixture manifest.

## Historical pre-consolidation verification checkpoint

`node_modules/.bin/tsx --test quartz/components/library/catalog.test.ts plugins/library-catalog/src/index.test.ts` passes 8 focused tests. Three regression assertions first failed for search exclusion, stale shell titles and reading 1-1's approximate date, then passed after fixes. Uncertain source dates are excluded from exact-date ordering and shown using the source-year fallback. This conservative text recognizer is not a comprehensive archival uncertainty annotation system.

Full corpus model verification (not a Quartz build) now requires 25,056 distinct source identities: 14,306 readings, 10,731 entities and 19 series. It validates every entity/series membership before reducing records into catalogs. The model produces 18,472 unique virtual routes. Reading page 358 has 26 rows; Atlantis page 22 has 35 rows and total 875; series 364 has 13 rows. Full emission, browser tests and output-cost checks remain separate gates.

## Collision-safe source routes

Quartz's default normalization collapses spaces and hyphens. The explicit mapping in `quartz/util/sourceRouteCollisions.json` keeps 42 historical canonical routes and gives the 42 displaced source entities deterministic suffix routes. `quartz/util/sourceRoutes.ts` resolves exact parsed wikilink identities before packaged OFM normalization and is shared by parser, build inventory and catalog recovery. Do not use the packaged slugifier alone for corpus identity checks. Never merge colliding entity memberships or rewrite archival filenames to make counts match.

Full corpus count checking is enabled by default. A deliberately reduced test fixture may set plugin option `verifyCorpus: false` only in its isolated configuration; every included entity and series must still have its complete declared membership. Production configuration must retain the default full-coverage guard.
