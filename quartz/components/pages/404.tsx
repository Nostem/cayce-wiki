import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

const NotFound: QuartzComponent = ({ cfg, ctx }: QuartzComponentProps) => {
  const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
  const baseDir = ctx.argv.serve ? "/" : `${url.pathname.replace(/\/$/, "")}/`

  return (
    <main class="popover-hint library-not-found">
      <h1>Page not found</h1>
      <p>This address does not point to a page in The Cayce Readings.</p>
      <p>
        Check the reading number and any suffix. You can search from the home page or return to a
        collection below.
      </p>
      <nav aria-label="Find another page">
        <ul>
          <li>
            <a href={baseDir}>Home and search</a>
          </li>
          <li>
            <a href={`${baseDir}readings`}>Browse readings</a>
          </li>
          <li>
            <a href={`${baseDir}entities`}>Explore topics</a>
          </li>
          <li>
            <a href={`${baseDir}help`}>Reading and citation guide</a>
          </li>
        </ul>
      </nav>
    </main>
  )
}

export default (() => NotFound) satisfies QuartzComponentConstructor
