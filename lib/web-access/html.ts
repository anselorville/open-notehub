export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
}

export function pickPrimaryHtml(html: string) {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
  if (articleMatch) {
    return articleMatch[0]
  }

  const mainMatch = html.match(/<main[\s\S]*?<\/main>/i)
  if (mainMatch) {
    return mainMatch[0]
  }

  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
  return bodyMatch?.[0] ?? html
}

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function extractTitleFromHtml(html: string, fallbackUrl: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return titleMatch?.[1]?.trim() || new URL(fallbackUrl).hostname
}
