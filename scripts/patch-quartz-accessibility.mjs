#!/usr/bin/env node
/** Run AFTER patch-quartz-performance.mjs. Validate every copy before writing any. */
import { readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Plain linked-results region, not a listbox: selection is actual DOM focus.
// Serialized into the packaged client template literal; avoid template literals.
export function accessibilitySearch(n, i, f, select, next, previous) {
  f.setAttribute("role", "region")
  const help = document.createElement("p")
  help.className = "search-examples"
  help.textContent =
    "Try a reading ID (1527-2) or topic (Atlantis). Use arrow keys to explore results; Tab to follow links."
  help.id =
    "cayce-search-help-" + Array.from(document.querySelectorAll(".search-container")).indexOf(n)
  i.setAttribute("aria-describedby", help.id)
  i.parentElement.insertBefore(help, i.nextSibling)
  function keys(event) {
    if (event.target === i || !event.target.closest(".result-card")) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      event.key === "ArrowDown" ? next() : previous()
    }
  }
  function focused(event) {
    const link = event.target.closest("a.result-card")
    if (link) select(link)
  }
  n.addEventListener("keydown", keys)
  f.addEventListener("focusin", focused)
  return function () {
    n.removeEventListener("keydown", keys)
    f.removeEventListener("focusin", focused)
    help.remove()
  }
}

export function accessibilityGraphOpen(outer, close) {
  if (outer.__cayceAccessibility) return
  const trigger = document.activeElement
  outer.setAttribute("role", "dialog")
  outer.setAttribute("aria-modal", "true")
  outer.setAttribute("aria-label", "Global graph")
  const controls = document.createElement("div")
  controls.className = "cayce-graph-controls"
  controls.style.cssText =
    "position:absolute;top:1rem;left:1rem;right:1rem;z-index:2;padding:0.5rem;background:var(--light);color:var(--darkgray)"
  const button = document.createElement("button")
  button.type = "button"
  button.textContent = "Close global graph"
  button.addEventListener("click", close)
  const fallback = document.createElement("a")
  fallback.href = "/entities"
  fallback.textContent = "Browse topics as text instead"
  const note = document.createElement("p")
  note.textContent =
    "The graph is a visual overview. For keyboard-accessible records, browse the topic catalog."
  controls.append(button, note, fallback)
  outer.appendChild(controls)
  function focusables() {
    return Array.from(outer.querySelectorAll("button, a[href], input, [tabindex]")).filter(
      function (el) {
        return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length
      },
    )
  }
  function keys(event) {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    } else if (event.key === "Tab") {
      const items = focusables()
      const index = items.indexOf(document.activeElement)
      if (
        (event.shiftKey && index <= 0) ||
        (!event.shiftKey && (index < 0 || index === items.length - 1))
      ) {
        event.preventDefault()
        ;(event.shiftKey ? items[items.length - 1] : items[0])?.focus()
      }
    }
  }
  function focus(event) {
    if (!outer.contains(event.target)) button.focus()
  }
  document.addEventListener("keydown", keys, true)
  document.addEventListener("focusin", focus)
  outer.__cayceAccessibility = function () {
    document.removeEventListener("keydown", keys, true)
    document.removeEventListener("focusin", focus)
    controls.remove()
    outer.removeAttribute("aria-modal")
    delete outer.__cayceAccessibility
    const target = trigger?.isConnected ? trigger : document.querySelector(".global-graph-icon")
    target?.focus()
  }
  button.focus()
}

export function replaceChecked(source, before, after, label) {
  const count = (text) => source.split(text).length - 1
  const oldCount = count(before),
    newCount = count(after)
  if (newCount === 1 && oldCount === (after.includes(before) ? 1 : 0)) return source
  if (oldCount !== 1 || newCount !== 0)
    throw new Error(label + ": unexpected source/count (" + oldCount + "," + newCount + ")")
  return source.replace(before, () => after)
}

export const transforms = {
  search: [
    ['f.setAttribute("role","listbox")', 'f.setAttribute("role","region")', "linked result region"],
    [
      "L.id=E.slug,L.href=Me(E.slug)",
      'L.id="cayce-result-"+Array.from(document.querySelectorAll(".search-container")).indexOf(n)+"-"+encodeURIComponent(E.slug),L.dataset.slug=E.slug,L.href=Me(E.slug)',
      "unique result IDs",
    ],
    ["let E=_.id,L=++v", "let E=_.dataset.slug,L=++v", "preview uses record slug"],
    [
      'y.scrollIntoView({block:"nearest"})',
      'y.scrollIntoView({block:"nearest"})',
      "selection anchor",
    ],
    ["et(E[L]??null)", "et(E[L]??null),y&&y.focus()", "arrows move DOM focus"],
    [
      'if(_.key==="ArrowUp"||_.shiftKey&&_.key==="Tab"){_.preventDefault(),ot();return}',
      'if(_.key==="ArrowUp"){_.preventDefault(),ot();return}',
      "native backward Tab",
    ],
    [
      'if(_.key==="ArrowDown"||_.key==="Tab"){_.preventDefault(),Wt();return}',
      'if(_.key==="ArrowDown"){_.preventDefault(),Wt();return}',
      "native forward Tab",
    ],
    [
      "let jn=xn(n,T);Ft(jn)",
      "Ft((" + accessibilitySearch.toString() + ")(n,i,f,et,Wt,ot));let jn=xn(n,T);Ft(jn)",
      "linked result keyboard lifecycle",
    ],
    [
      "L.appendChild(S),E.tags.length>0",
      'L.appendChild(S),(()=>{let cayceType=document.createElement("p");cayceType.className="result-type";cayceType.textContent=E.slug.startsWith("readings/")?"Reading · "+E.slug.slice(9):E.slug.startsWith("entities/")?"Topic":E.slug.startsWith("series/")?"Series":"Library page";L.appendChild(cayceType)})(),E.tags.length>0',
      "source-grounded record type",
    ],
  ],
  graph: [
    [
      "function G(){b();",
      "function G(){for(var cayceOuter of S)cayceOuter.__cayceAccessibility&&cayceOuter.__cayceAccessibility();b();",
      "close restores focus without replacing teardown",
    ],
    [
      'g.classList.add("active");var m=',
      'g.classList.add("active");(' + accessibilityGraphOpen.toString() + ")(g,G);var m=",
      "modal controls and focus lifecycle",
    ],
    [
      'var q=m.target.closest(".global-graph-container"),x=',
      'var q=m.target.closest(".global-graph-container, .cayce-graph-controls"),x=',
      "controls are not backdrop",
    ],
    [
      "function(){E++;f(),b()}",
      "function(){E++;G();f(),b()}",
      "navigation removes modal listeners",
    ],
  ],
  "table-of-contents": [
    [
      "u2(OverflowList, { ...props, id })",
      'u2(OverflowList, { ...props, id: props.id ?? id, "data-cayce-overflow": id })',
      "preserve caller TOC ID at actual spread override",
    ],
    [
      'const ul = document.getElementById("${id}")',
      "const ul = document.querySelector('[data-cayce-overflow=\"${id}\"]')",
      "overflow observer follows preserved ID",
    ],
  ],
}

export function patchSource(source, name) {
  const required =
    name === "search"
      ? ["cayceSearchInitPromise", "cayceRequest!==window.__cayceSearchRequest"]
      : name === "graph"
        ? ["await cayceLoadGraphLibraries()", "releaseGlobalResources:!1", "cayceGlobalGeneration"]
        : []
  for (const marker of required)
    if (!source.includes(marker))
      throw new Error(name + ": run performance patch first; missing " + marker)
  for (const [before, after, label] of transforms[name])
    source = replaceChecked(source, before, after, name + " / " + label)
  return source
}
export function patch(root = process.cwd()) {
  const pending = []
  for (const name of Object.keys(transforms))
    for (const file of ["dist/index.js", "dist/components/index.js"]) {
      const path = join(root, "node_modules/@quartz-community", name, file)
      pending.push([path, patchSource(readFileSync(path, "utf8"), name)])
    }
  for (const [path, source] of pending) writeFileSync(path, source)
  console.log(
    "Quartz accessibility patches validated and applied to " + pending.length + " packaged copies",
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) patch()
