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
  'function uu(){f();var d=++E,w=u();c(w);for(var g=document.querySelectorAll(".graph-container"),m=0;m<g.length;m++)(function(q){ke(q);q.style.display="flex";q.style.alignItems="center";q.style.justifyContent="center";var x=document.createElement("button");x.type="button";x.className="graph-load-button";x.textContent="Load local graph";x.style.padding="0.45rem 0.75rem";x.style.border="1px solid var(--lightgray)";x.style.borderRadius="6px";x.style.background="var(--light)";x.style.color="var(--darkgray)";x.style.cursor="pointer";x.addEventListener("click",function(){ke(q);q.style.display="block";D(q,w,d).then(function(L){d===E&&_.push(L)}).catch(function(L){console.error("[Graph] Local render error:",L);q.textContent="Graph could not load."})},{once:!0});q.appendChild(x)})(g[m])}'

const graphTransforms = [
  [graphFetchBefore, graphFetchAfter, "load the dedicated graph index only when rendering"],
  [graphAlgorithmBefore, graphAlgorithmAfter, "scope local traversal and global entity graph"],
  [lazyLocalBefore, lazyLocalAfter, "render local graph only after user click"],
]

patchFile("node_modules/@quartz-community/search/dist/index.js", searchTransforms)
patchFile("node_modules/@quartz-community/search/dist/components/index.js", searchTransforms)
patchFile("node_modules/@quartz-community/graph/dist/index.js", graphTransforms)
patchFile("node_modules/@quartz-community/graph/dist/components/index.js", graphTransforms)

console.log("Quartz large-vault performance patches applied")
