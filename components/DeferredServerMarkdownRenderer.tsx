interface Props {
  content: string
}

export async function DeferredServerMarkdownRenderer({ content }: Props) {
  const { ServerMarkdownRenderer } = await import('./ServerMarkdownRenderer')

  return <ServerMarkdownRenderer content={content} />
}
