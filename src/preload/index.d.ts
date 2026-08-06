import type { ClaudeUsageApi } from './index'

declare global {
  interface Window {
    claudeUsage: ClaudeUsageApi
  }
}
