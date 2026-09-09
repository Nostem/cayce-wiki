#!/usr/bin/env node
/**
 * Patch Quartz v5's packaged Search and Graph client scripts for large vaults.
 *
 * npm ci restores node_modules on every CI run, so this patch is deliberately
 * reapplied before each build. Every replacement is exact and count-checked:
 * an upstream package change fails the build instead of silently regressing.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  const last = source.lastIndexOf(before)
  if (first < 0) throw new Error(`${label}: expected source fragment was not found`)
  if (first !== last) throw new Error(`${label}: source fragment was not unique`)
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function patchFile(relativePath, transforms) {
  const path = join(root, relativePath)
  let source = readFileSync(path, "utf8")
  for (const [before, after, label] of transforms) {
    source = replaceOnce(source, before, after, `${relativePath} / ${label}`)
  }
  writeFileSync(path, source)
  console.log(`patched ${relativePath}`)
}

const searchInitBefore = "var Rt=!1;async function Ti(){Rt||(Z=await bi(),await ki(),Rt=!0)}"
export const searchInitAfter =
  "var Rt=!1,cayceSearchInitPromise;async function Ti(){Rt||(cayceSearchInitPromise||(cayceSearchInitPromise=(async()=>{Z=await bi(),await ki(),Rt=!0})().catch(t=>{cayceSearchInitPromise=void 0;throw t})),await cayceSearchInitPromise)}"

const searchInputBefore = "nt=async _=>{let E=_.target.value;"
export const searchInputAfter =
  'nt=async _=>{let E=_.target.value,cayceRequest=window.__cayceSearchRequest=(window.__cayceSearchRequest||0)+1;E.trim()!==""&&(s.classList.add("display-results"),f.textContent="Loading search…");await Ti();if(cayceRequest!==window.__cayceSearchRequest)return;'
const searchResultsBefore = ":K=[];let ct="
export const searchResultsAfter =
  ":K=[];if(cayceRequest!==window.__cayceSearchRequest)return;let ct="

const searchTransforms = [
  [searchInitBefore, searchInitAfter, "coalesce concurrent search initialization"],
  [
    "async function Mn(){Ai(),await Ti(),await wi(),Li()}",
    "async function Mn(){Ai(),await wi(),Li()}",
    "do not build FlexSearch during page startup",
  ],
  [searchInputBefore, searchInputAfter, "initialize search once and keep only the latest query"],
  [searchResultsBefore, searchResultsAfter, "discard stale asynchronous search results"],
]

const graphFetchBefore = "var Ku=await fetchData;eu=new Map;for(var Ju in Ku)eu.set(Fu(Ju),Ku[Ju])"
const graphFetchAfter =
  'var Ku=await(window.__cayceGraphData||(window.__cayceGraphData=fetch($u("/static/graphIndex.json")).then(function(i){if(!i.ok)throw new Error("graph index "+i.status);return i.json()})));eu=new Map;for(var Ju in Ku)eu.set(Fu(Ju),Ku[Ju])'

const graphAlgorithmBefore =
  'var R=d.offsetWidth,O=Math.max(d.offsetHeight,250),tu=[],hu=[],Xu=new Set(eu.keys());eu.forEach(function(i,l){for(var F=i.links||[],A=0;A<F.length;A++){var v=Fu(F[A]);Xu.has(v)&&tu.push({source:l,target:v})}if(Re)for(var j=i.tags||[],A=0;A<j.length;A++){var N=j[A];if(Ue.indexOf(N)===-1){var K=Fu("tags/"+N);hu.indexOf(K)===-1&&hu.push(K),tu.push({source:l,target:K})}}});var ru=new Set;if(Vu>=0)for(var pu=[m],Cu=new Set([m]),Yu=0;Yu<=Vu&&pu.length>0;Yu++){for(var wu=[],ku=0;ku<pu.length;ku++){var Lu=pu[ku];ru.add(Lu);for(var Pu=0;Pu<tu.length;Pu++){var W=tu[Pu];W.source===Lu&&!Cu.has(W.target)&&(Cu.add(W.target),wu.push(W.target)),W.target===Lu&&!Cu.has(W.source)&&(Cu.add(W.source),wu.push(W.source))}}pu=wu}else{Xu.forEach(function(i){ru.add(i)});for(var k=0;k<hu.length;k++)ru.add(hu[k])}'

const graphAlgorithmAfter =
  'var R=d.offsetWidth,O=Math.max(d.offsetHeight,250),tu=[],hu=[],Xu=new Set(eu.keys()),ru=new Set;if(Vu>=0){for(var pu=[m],Cu=new Set([m]),Yu=0;Yu<=Vu&&pu.length>0;Yu++){for(var wu=[],ku=0;ku<pu.length;ku++){var Lu=pu[ku];ru.add(Lu);var Pu=eu.get(Lu),XuLinks=Pu&&Pu.links||[];for(var Zi=0;Zi<XuLinks.length;Zi++){var Wi=Fu(XuLinks[Zi]);Xu.has(Wi)&&!Cu.has(Wi)&&(Cu.add(Wi),wu.push(Wi))}}pu=wu}ru.forEach(function(l){var i=eu.get(l);for(var F=i&&i.links||[],A=0;A<F.length;A++){var v=Fu(F[A]);ru.has(v)&&tu.push({source:l,target:v})}})}else{eu.forEach(function(i,l){i.global===!0&&ru.add(l)});ru.forEach(function(l){var i=eu.get(l);for(var F=i&&i.globalLinks||[],A=0;A<F.length;A++){var v=Fu(F[A]);ru.has(v)&&tu.push({source:l,target:v})}})}if(Re)ru.forEach(function(l){var i=eu.get(l);for(var F=i&&i.tags||[],A=0;A<F.length;A++){var N=F[A];if(Ue.indexOf(N)===-1){var K=Fu("tags/"+N);hu.indexOf(K)===-1&&hu.push(K),tu.push({source:l,target:K})}}});for(var k=0;k<hu.length;k++)ru.add(hu[k]);'

const lazyLocalBefore =
  'function uu(){f();var d=++E,w=u();c(w);for(var g=document.querySelectorAll(".graph-container"),m=0;m<g.length;m++)(function(q){D(q,w,d).then(function(x){d===E&&_.push(x)}).catch(function(x){console.error("[Graph] Local render error:",x)})})(g[m])}'
const lazyLocalAfter =
  'function uu(){f();var d=++E,w=u();c(w);for(var g=document.querySelectorAll(".graph-container"),m=0;m<g.length;m++)(function(q){ke(q);q.style.display="flex";q.style.alignItems="center";q.style.justifyContent="center";var x=document.createElement("button");x.type="button";x.className="graph-load-button";x.textContent="Load local graph";x.style.padding="0.45rem 0.75rem";x.style.border="1px solid var(--lightgray)";x.style.borderRadius="6px";x.style.background="var(--light)";x.style.color="var(--darkgray)";x.style.cursor="pointer";x.addEventListener("click",function(){cayceRender(q,w,d)},{once:!0});q.appendChild(x)})(g[m])}'

// Exact CDN aliases resolved via x-jsd-version headers: D3 7.9.0, Pixi 8.20.1.
// This function is serialized into the package's template literal. Keep it free
// of template literals/backslash escapes and of dependencies on build-time scope.
export function cayceLoadGraphLibraries() {
  const pending = window.__cayceGraphLibraries || (window.__cayceGraphLibraries = {})
  return Promise.all(
    [
      ["d3", "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"],
      ["PIXI", "https://cdn.jsdelivr.net/npm/pixi.js@8.20.1/dist/pixi.min.js"],
    ].map(function ([name, url]) {
      if (window[name]) return Promise.resolve()
      if (!pending[name]) {
        pending[name] = new Promise(function (resolve, reject) {
          const script = document.createElement("script")
          const timer = setTimeout(function () {
            fail()
          }, 30000)
          function fail() {
            clearTimeout(timer)
            script.onload = script.onerror = null
            script.remove()
            reject(new Error("Could not load graph library: " + name))
          }
          script.src = url
          script.crossOrigin = "anonymous"
          script.onload = function () {
            if (!window[name]) return fail()
            clearTimeout(timer)
            script.onload = script.onerror = null
            resolve()
          }
          script.onerror = fail
          document.head.appendChild(script)
        }).catch(function (error) {
          delete pending[name]
          throw error
        })
      }
      return pending[name]
    }),
  )
}

const graphLibrariesBefore =
  'function e(a){var o=document.querySelector(\'script[src="\'+a+\'"]\');return o?Promise.resolve():new Promise(function(n,s){var c=document.createElement("script");c.src=a,c.crossOrigin="anonymous",c.onload=n,c.onerror=s,document.head.appendChild(c)})}Promise.all([e("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"),e("https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.js")]).then(function(){t()}).catch(function(a){console.error("[Graph] Failed to load libraries:",a);for(var o=document.querySelectorAll(".graph-container"),n=0;n<o.length;n++)o[n].textContent="Graph could not load. Check your network connection.",o[n].style.display="flex",o[n].style.alignItems="center",o[n].style.justifyContent="center",o[n].style.color="var(--gray)",o[n].style.fontSize="0.9rem"});function t(){var a=window.d3,o=window.PIXI;if(!a||!o){console.error("[Graph] Libraries not loaded");return}'
const graphLibrariesAfter =
  cayceLoadGraphLibraries.toString() + ";t();function t(){var a,o,cayceGlobalGeneration=0;"

// UI handlers are installed before dependencies exist. Each attempt captures
// both route and overlay generations; old work cannot touch a replacement DOM.
const graphRenderUI =
  'function cayceRender(d,w,g){var route=E,global=cayceGlobalGeneration;function valid(){return d.isConnected&&route===E&&(g!==void 0||global===cayceGlobalGeneration)}if(!valid())return;ke(d);d.style.display="flex";d.style.alignItems="center";d.style.justifyContent="center";var status=document.createElement("span");status.setAttribute("role","status");status.textContent="Loading graph…";d.appendChild(status);D(d,w,g).then(function(cleanup){if(valid()){(g===void 0?r:_).push(cleanup)}else cleanup()}).catch(function(error){if(!valid())return;console.error("[Graph] Render error:",error);ke(d);var retry=document.createElement("button");retry.type="button";retry.textContent="Graph could not load. Retry graph";retry.addEventListener("click",function(){cayceRender(d,w,g)},{once:!0});d.appendChild(retry)})}'
const graphRenderBefore = "async function D(d,w,g){var m=Fu(w);"
const graphRenderAfter =
  graphRenderUI +
  "async function D(d,w,g){var cayceRoute=E,cayceGlobal=cayceGlobalGeneration;function cayceValid(){return d.isConnected&&cayceRoute===E&&(g!==void 0||cayceGlobal===cayceGlobalGeneration)}await cayceLoadGraphLibraries();if(!cayceValid())return function(){};a=window.d3;o=window.PIXI;var m=Fu(w);"

// Pixi 8.20.1 treats renderer destroy(true) as releaseGlobalResources too.
// Its global batch pool retains references to checked-out batches: releasing it
// nulls textures still used by the other graph's live renderer. Remove only this
// app's view/resources; Application.destroy already tears down its own ticker.
const graphDestroyOptions = "{removeView:!0,releaseGlobalResources:!1},{children:!0}"

const graphTransforms = [
  [graphLibrariesBefore, graphLibrariesAfter, "install graph controls without fetching libraries"],
  [graphRenderBefore, graphRenderAfter, "load libraries on render with retry feedback"],
  [
    "function b(){for(var d=0;",
    "function b(){cayceGlobalGeneration++;for(var d=0;",
    "invalidate pending global renders on close or reopen",
  ],
  [
    "function(){f(),b()}",
    "function(){E++;f(),b()}",
    "invalidate pending renders before SPA navigation",
  ],
  [
    'D(x,d,void 0).then(function(fu){r.push(fu)}).catch(function(fu){console.error("[Graph] Global render error:",fu)})',
    "cayceRender(x,d,void 0)",
    "global graph loading and retry controls",
  ],
  [
    'catch(i){return console.error("[Graph] Error loading data:",i),function(){}}var R=',
    "catch(i){window.__cayceGraphData=void 0;throw i}if(!cayceValid())return function(){};var R=",
    "discard stale graph data and permit retry",
  ],
  [
    "}),d.appendChild(Z.canvas);var ou=",
    '});if(!cayceValid()){Z.destroy(!0);return function(){}}ke(d);d.style.display="block";d.appendChild(Z.canvas);var ou=',
    "destroy stale Pixi applications before canvas attachment",
  ],
  [
    "if(ke(d),g!==void 0&&g!==E)",
    "if(g!==void 0&&g!==E)",
    "retain loading feedback until canvas is ready",
  ],
  [
    "if(!cayceValid()){Z.destroy(!0);return function(){}}",
    "if(!cayceValid()){Z.destroy(" + graphDestroyOptions + ");return function(){}}",
    "dispose stale applications without releasing another graph's resources",
  ],
  [
    "try{Z.destroy(!0)}catch{}",
    "try{Z.destroy(" + graphDestroyOptions + ")}catch{}",
    "dispose graph children and renderer without clearing global Pixi pools",
  ],
  [graphFetchBefore, graphFetchAfter, "load the dedicated graph index only when rendering"],
  [graphAlgorithmBefore, graphAlgorithmAfter, "scope local traversal and global entity graph"],
  [lazyLocalBefore, lazyLocalAfter, "render local graph only after user click"],
]

patchFile("node_modules/@quartz-community/search/dist/index.js", searchTransforms)
patchFile("node_modules/@quartz-community/search/dist/components/index.js", searchTransforms)
patchFile("node_modules/@quartz-community/graph/dist/index.js", graphTransforms)
patchFile("node_modules/@quartz-community/graph/dist/components/index.js", graphTransforms)

console.log("Quartz large-vault performance patches applied")
