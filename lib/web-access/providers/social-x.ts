import { type WebAccessProvider } from '@/lib/web-access/types'
import { fetchViaJinaReader } from '@/lib/web-access/providers/jina-reader'

export const socialXProvider: WebAccessProvider = {
  id: 'social-x',
  execute(request) {
    return fetchViaJinaReader(request, 'social-x')
  },
}
