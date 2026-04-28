import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { normalizeMarkdownContent } from "./markdownNormalize";

const markdownComponents: Components = {
  a({ children, href }) {
    return (
      <a href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  }
};

export function MarkdownContent({ className, content }: { className?: string; content: string }) {
  const classes = ["markdown-content", className].filter(Boolean).join(" ");
  const normalizedContent = normalizeMarkdownContent(content);

  return (
    <div className={classes}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
