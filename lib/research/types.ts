export interface ResearchLibraryHit {
  id: string
  title: string
  summary: string | null
  tags: string[]
  sourceUrl: string | null
  sourceType: string
  createdAt: string
  wordCount: number
  score: number
  matchedTerms: string[]
}

export interface ResearchWebHit {
  title: string
  url: string
  snippet: string
}

export interface ResearchResultPayload {
  question: string
  answerMarkdown: string
  followUps: string[]
  strategy: 'library_only' | 'library_plus_web'
  externalStatus: 'not_requested' | 'not_needed' | 'used' | 'unavailable'
  queryPlan: {
    libraryQueries: string[]
    webQuery: string
  }
  internalResults: ResearchLibraryHit[]
  externalResults: ResearchWebHit[]
}
