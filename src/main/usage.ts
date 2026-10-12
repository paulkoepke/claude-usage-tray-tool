import type { UsageResponse } from '../shared/types'

const USAGE_ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'

/**
 * Calls the undocumented internal Anthropic endpoint.
 * Do not call more often than every 180s (see CLAUDE.md, rate-limit risk).
 */
export async function fetchUsage(accessToken: string): Promise<UsageResponse> {
  const res = await fetch(USAGE_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'claude-code/2.1.296'
    }
  })

  if (!res.ok) {
    throw new Error(`Usage endpoint responded with status ${res.status}`)
  }

  const data = (await res.json()) as {
    five_hour?: { utilization: number; resets_at: string }
    seven_day?: { utilization: number; resets_at: string }
    extra_usage?: {
      is_enabled?: boolean
      monthly_limit?: number | null
      used_credits?: number | null
      currency?: string | null
      decimal_places?: number | null
    } | null
  }

  if (!data.five_hour || !data.seven_day) {
    throw new Error('Unexpected response from usage endpoint')
  }

  const extra = data.extra_usage
  const extraUsage = extra
    ? {
        enabled: !!extra.is_enabled,
        usedMinor: extra.used_credits ?? 0,
        limitMinor: extra.monthly_limit ?? null,
        currency: extra.currency ?? 'USD',
        decimalPlaces: extra.decimal_places ?? 2
      }
    : undefined

  return {
    fiveHour: { utilization: data.five_hour.utilization, resetsAt: data.five_hour.resets_at },
    sevenDay: { utilization: data.seven_day.utilization, resetsAt: data.seven_day.resets_at },
    ...(extraUsage && { extraUsage })
  }
}
