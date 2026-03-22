import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import { MermaidBlock } from './MermaidBlock'
import { ImageViewer } from './ImageViewer'
import { MarkdownCopyButton } from './MarkdownCopyButton'

interface Props {
  content: string
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '')
    const lang = match?.[1]
    const code = String(children).replace(/\n$/, '')

    if (lang === 'mermaid') {
      return <MermaidBlock code={code} />
    }

    if (!className) {
      return (
        <code
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <div className="relative group my-4">
        {lang && (
          <span className="absolute right-3 top-2 text-xs text-zinc-400 font-mono select-none z-10">
            {lang}
          </span>
        )}
        <MarkdownCopyButton code={code} />
        <code className={className} {...props}>{children}</code>
      </div>
    )
  },

  img({ src, alt }) {
    if (!src) return null
    return <ImageViewer src={src} alt={alt ?? ''} />
  },

  a({ href, children }) {
    const isExternal = href?.startsWith('http')
    return (
      <a
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className="break-all"
      >
        {children}
      </a>
    )
  },
}

export function ServerMarkdownRenderer({ content }: Props) {
  return (
    <div className="prose prose-zinc dark:prose-invert max-w-none
      [overflow-wrap:break-word] [word-break:break-word]
      prose-headings:font-semibold
      prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
      prose-p:leading-[1.75] prose-p:mb-5
      prose-pre:bg-[#282c34] prose-pre:rounded-lg prose-pre:p-4
      prose-pre:overflow-x-auto
      prose-code:text-sm
      prose-blockquote:border-l-4 prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-600
      prose-img:rounded-lg prose-img:shadow-sm
      prose-table:text-sm prose-table:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
