import { attachAnnotationControl } from "./annotations"

// Register this once through a registered component's afterDOMLoaded resource.
let cleanup = () => {}
function setupAnnotations() {
  cleanup()
  const scope = document.querySelector(".reader-main")
  cleanup = scope ? attachAnnotationControl(scope) : () => {}
  window.addCleanup(() => {
    cleanup()
    cleanup = () => {}
  })
}
document.addEventListener("nav", setupAnnotations)
