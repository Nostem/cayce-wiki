import { PageFrame, PageFrameProps } from "./types"
import HeaderConstructor from "../Header"
import { ReaderHeader, ReaderEndMatter } from "../library/ReaderHeader"
import { readerTree } from "../library/reading"

const Header = HeaderConstructor()

/**
 * The default page frame — three-column layout with left sidebar, center
 * content (header + body + afterBody), and right sidebar, followed by a footer.
 *
 * This is the original Quartz layout, extracted from renderPage.tsx.
 */
export const DefaultFrame: PageFrame = {
  name: "default",
  render({
    componentData,
    header,
    beforeBody,
    pageBody: Content,
    afterBody,
    left,
    right,
    footer,
  }: PageFrameProps) {
    const readerData = {
      ...componentData,
      tree: readerTree(
        componentData.tree,
        componentData.fileData.frontmatter,
        componentData.fileData.slug,
      ),
    }
    return (
      <>
        <a class="reader-skip" href="#main-content">
          Skip to content
        </a>
        <div class="left sidebar">
          {left.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
        </div>
        <main class="center reader-main" id="main-content" tabIndex={-1}>
          <div class="page-header">
            <Header {...componentData}>
              {header.map((HeaderComponent) => (
                <HeaderComponent {...componentData} />
              ))}
            </Header>
            <div class="popover-hint">
              {beforeBody.map((BodyComponent) => (
                <BodyComponent {...componentData} />
              ))}
            </div>
            <ReaderHeader {...componentData} />
          </div>
          <Content {...readerData} />
          <ReaderEndMatter {...componentData} />
          <hr />
          <div class="page-footer">
            {afterBody.map((BodyComponent) => (
              <BodyComponent {...componentData} />
            ))}
          </div>
        </main>
        <aside class="right sidebar reader-research" aria-label="Related research">
          {right.length > 0 && (
            <details class="reader-research-disclosure">
              <summary>Research tools</summary>
              <div class="reader-research-content">
                {right.map((BodyComponent) => (
                  <BodyComponent {...componentData} />
                ))}
              </div>
            </details>
          )}
        </aside>
        {footer.map((FooterComponent) => (
          <FooterComponent {...componentData} />
        ))}
      </>
    )
  },
}
