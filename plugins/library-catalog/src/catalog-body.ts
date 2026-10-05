import { h } from "preact"
import type { ComponentChild } from "preact"
import type { QuartzComponent } from "../../../quartz/components/types"
import { resolveRelative } from "../../../quartz/util/path"
import type { FullSlug } from "../../../quartz/util/path"
import { paginate, pageSlug } from "../../../quartz/components/library/catalog"
import { catalogPages, outputSlug } from "./catalog-state"

export function createCatalogBody(): QuartzComponent {
  const Body: QuartzComponent = ({ fileData }) => {
    const key = String(fileData.slug).replace(/\/index$/, "")
    const state = catalogPages.get(key)
    if (!state) throw new Error(`Catalog page not prepared: ${key}`)
    const { collection, sort, number, preferredSort } = state
    const result = paginate(collection.rows, number)
    const href = (target: string) => resolveRelative(fileData.slug!, outputSlug(target) as FullSlug)
    const link = (target: string, label: string, extra = {}) =>
      h("a", { href: href(target), class: "internal", ...extra }, label)
    const navigation = h(
      "nav",
      { "aria-label": "Catalog pagination" },
      number > 1 && link(pageSlug(collection.base, 1, sort, preferredSort), "First page"),
      " ",
      number > 1 &&
        link(pageSlug(collection.base, number - 1, sort, preferredSort), "Previous page", {
          rel: "prev",
        }),
      " ",
      h("span", { "aria-current": "page" }, `Page ${number} of ${result.pages}`),
      " ",
      number < result.pages &&
        link(pageSlug(collection.base, number + 1, sort, preferredSort), "Next page", {
          rel: "next",
        }),
      " ",
      number < result.pages &&
        link(pageSlug(collection.base, result.pages, sort, preferredSort), "Last page"),
    )
    const sortLinks: ComponentChild[] = []
    if (catalogPages.has(pageSlug(collection.base, 1, "count", preferredSort))) {
      sortLinks.push(
        link(pageSlug(collection.base, 1, "count", preferredSort), "Most readings", {
          "aria-current": sort === "count" ? "true" : undefined,
        }),
      )
    }
    if (catalogPages.has(pageSlug(collection.base, 1, "id", preferredSort))) {
      if (sortLinks.length) sortLinks.push(" · ")
      sortLinks.push(
        link(
          pageSlug(collection.base, 1, "id", preferredSort),
          collection.base === "readings" || collection.rows.some((r) => r.kind === "readings")
            ? preferredSort === "count"
              ? "Name (A–Z)"
              : "Reading number"
            : "Name (A–Z)",
          { "aria-current": sort === "id" ? "true" : undefined },
        ),
      )
    }
    if (catalogPages.has(pageSlug(collection.base, 1, "date", preferredSort))) {
      if (sortLinks.length) sortLinks.push(" · ")
      sortLinks.push(
        link(pageSlug(collection.base, 1, "date", preferredSort), "Original date (oldest first)", {
          "aria-current": sort === "date" ? "true" : undefined,
        }),
      )
    }
    return h(
      "section",
      { class: "library-catalog", "aria-label": collection.title },
      h("p", null, collection.description),
      collection.base === "readings" &&
        number === 1 &&
        sort === preferredSort &&
        h(
          "form",
          {
            class: "catalog-jump",
            "data-catalog-jump": "true",
            action: href("readings"),
            method: "get",
          },
          h("label", { for: "catalog-jump-input" }, "Jump to reading"),
          h("input", {
            id: "catalog-jump-input",
            name: "q",
            type: "text",
            inputmode: "numeric",
            autocomplete: "off",
            spellcheck: false,
            placeholder: "1527-2 or series 364",
            "aria-describedby": "catalog-jump-hint",
          }),
          h("button", { type: "submit" }, "Go"),
          h(
            "p",
            { id: "catalog-jump-hint", class: "catalog-jump-hint" },
            "Enter a reading number (e.g. 1527-2) or a series id (e.g. 364).",
          ),
        ),
      collection.combined &&
        h(
          "p",
          { class: "catalog-combined" },
          h(
            "strong",
            null,
            link(
              collection.combined.row.slug,
              `View combined topic: ${collection.combined.row.label}`,
            ),
          ),
        ),
      collection.topic &&
        number === 1 &&
        sort === preferredSort &&
        h(
          "section",
          { "aria-label": "Source terms" },
          h("h2", null, "Source terms"),
          h(
            "ul",
            null,
            collection.topic.sources
              .slice(0, 8)
              .map((source) =>
                h(
                  "li",
                  { class: "topic-source", key: source.slug },
                  link(source.slug, source.label),
                  ` · ${source.count ?? 0} readings`,
                ),
              ),
          ),
          collection.topic.sources.length > 8 &&
            link(
              `${collection.topic.row.slug}/source-terms`,
              `View all ${collection.topic.sources.length} source terms`,
            ),
        ),
      h(
        "p",
        { class: "catalog-count" },
        `${result.start}–${result.end} of ${result.total.toLocaleString("en-US")} records`,
      ),
      sortLinks.length > 0 && h("nav", { "aria-label": "Sort catalog" }, ...sortLinks),
      collection.preferredFilters?.length
        ? h(
            "nav",
            { class: "catalog-preferred-filters", "aria-label": "Browse by type" },
            h("span", null, "Start with: "),
            ...collection.preferredFilters.flatMap((f, i) => [
              i > 0 ? " · " : null,
              link(f.base, f.label),
            ]),
          )
        : null,
      collection.filters?.length
        ? h(
            "details",
            { class: "catalog-filters" },
            h("summary", null, "Filter this collection"),
            h(
              "ul",
              null,
              collection.filters.map((f) => h("li", { key: f.base }, link(f.base, f.label))),
            ),
          )
        : null,
      navigation,
      h(
        "ol",
        { class: "catalog-rows", start: result.start || 1 },
        result.rows.map((row) =>
          h(
            "li",
            { key: row.slug, class: "catalog-row" },
            h(
              "h3",
              { style: { overflowWrap: "anywhere" } },
              link(row.slug, row.kind === "readings" ? `Reading ${row.label}` : row.label),
            ),
            h(
              "p",
              { class: "catalog-context" },
              [
                row.date
                  ? `Original date: ${row.date}`
                  : row.kind === "readings"
                    ? row.year
                      ? `Source year: ${row.year}; full date unavailable`
                      : "Original date unavailable"
                    : undefined,
                row.readingType ? `Type: ${row.readingType}` : undefined,
                row.context,
                row.count === undefined
                  ? undefined
                  : `${row.count.toLocaleString("en-US")} readings`,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
            (row.literalCount !== undefined ||
              row.semanticCount !== undefined ||
              row.association) &&
              h(
                "p",
                { class: "catalog-association-badges" },
                row.association === "literal" &&
                  h(
                    "span",
                    { class: "catalog-badge catalog-badge-literal" },
                    "Strong match (about this subject)",
                  ),
                row.association === "semantic" &&
                  h(
                    "span",
                    { class: "catalog-badge catalog-badge-semantic" },
                    "Indexed mention (verify)",
                  ),
                row.association === "name-only" &&
                  h(
                    "span",
                    {
                      class: "catalog-badge catalog-badge-name-only",
                      title:
                        "The reading’s only links to this entry used the given name for a different person.",
                    },
                    "Name match only (likely a different person)",
                  ),
                " ",
                row.literalCount !== undefined &&
                  h(
                    "span",
                    { class: "catalog-badge catalog-badge-literal" },
                    `Literal ${row.literalCount.toLocaleString("en-US")}`,
                  ),
                " ",
                row.semanticCount !== undefined &&
                  h(
                    "span",
                    { class: "catalog-badge catalog-badge-semantic" },
                    `Semantic ${row.semanticCount.toLocaleString("en-US")}`,
                  ),
              ),
            row.summary &&
              h(
                "p",
                { class: "catalog-summary" },
                h("strong", null, "Generated synopsis: "),
                row.summary,
              ),
          ),
        ),
      ),
      result.pages > 1 && navigation,
      h(
        "p",
        { class: "catalog-fallback" },
        "All records are available through these pages. Pagination and filters work without JavaScript.",
      ),
    )
  }
  Body.afterDOMLoaded = `
document.addEventListener("nav", () => {
  const form = document.querySelector("form[data-catalog-jump]");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    const raw = (input && "value" in input ? String(input.value) : "").trim();
    if (!raw) return;
    const reading = raw.match(/^(\\d+(?:-\\d+)?)$/);
    if (reading) {
      const id = reading[1];
      if (!id.includes("-")) {
        window.location.assign("/series/" + encodeURIComponent(id));
        return;
      }
      window.location.assign("/readings/" + encodeURIComponent(id));
      return;
    }
    if (input) input.setCustomValidity("Use a reading number like 1527-2 or a series id like 364.");
    form.reportValidity?.();
  });
});
`
  return Body
}
