/**
 * Action Detection Utility
 *
 * Analyzes event/task content to detect contextual actions that can be surfaced to the user.
 */

export interface DetectedAction {
  type: 'recipe' | 'video-call' | 'directions' | 'call' | 'text' | 'link'
  label: string
  url?: string
  phoneNumber?: string
  icon: 'recipe' | 'video' | 'map' | 'phone' | 'message' | 'link'
}

// Common recipe website domains
const RECIPE_DOMAINS = [
  'allrecipes.com',
  'foodnetwork.com',
  'epicurious.com',
  'bonappetit.com',
  'seriouseats.com',
  'budgetbytes.com',
  'delish.com',
  'tasty.co',
  'simplyrecipes.com',
  'food52.com',
  'cookinglight.com',
  'myrecipes.com',
  'thekitchn.com',
  'skinnytaste.com',
  'halfbakedharvest.com',
  'pinchofyum.com',
  'minimalistbaker.com',
  'smittenkitchen.com',
  'triedandtruerecipe.com',
  'recipes.com',
]

// Video conferencing URL patterns
const VIDEO_CALL_PATTERNS = [
  { pattern: /https?:\/\/[\w.-]*zoom\.us\/[^\s<]+/gi, service: 'Zoom' },
  { pattern: /https?:\/\/meet\.google\.com\/[^\s<]+/gi, service: 'Google Meet' },
  { pattern: /https?:\/\/teams\.microsoft\.com\/[^\s<]+/gi, service: 'Microsoft Teams' },
  { pattern: /https?:\/\/[\w.-]*webex\.com\/[^\s<]+/gi, service: 'Webex' },
  { pattern: /https?:\/\/[\w.-]*gotomeeting\.com\/[^\s<]+/gi, service: 'GoToMeeting' },
  { pattern: /https?:\/\/[\w.-]*whereby\.com\/[^\s<]+/gi, service: 'Whereby' },
]

// General URL pattern
const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi

// Phone number pattern (US format primarily)
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g

/**
 * Extract all URLs from text, handling both HTML anchor tags and plain URLs
 */
function extractUrls(text: string): string[] {
  const urls: string[] = []

  // Extract from HTML anchor tags
  const htmlLinkRegex = /<a\s+href=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = htmlLinkRegex.exec(text)) !== null) {
    urls.push(match[1])
  }

  // Extract plain URLs (avoiding duplicates from anchor tags)
  const plainUrls = text.match(URL_PATTERN) || []
  for (const url of plainUrls) {
    // Clean up URL (remove trailing punctuation)
    const cleanUrl = url.replace(/[.,;:!?)]+$/, '')
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl)
    }
  }

  return urls
}

/**
 * Check if a URL is from a recipe website
 */
function isRecipeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '')
    return RECIPE_DOMAINS.some((domain) => hostname.includes(domain))
  } catch {
    return false
  }
}

/**
 * Check if a URL is a video call link and return the service name
 */
function getVideoCallService(url: string): string | null {
  for (const { pattern, service } of VIDEO_CALL_PATTERNS) {
    // Reset pattern lastIndex for global regex
    pattern.lastIndex = 0
    if (pattern.test(url)) {
      return service
    }
  }
  return null
}

/**
 * Extract phone numbers from text
 */
function extractPhoneNumbers(text: string): string[] {
  const matches = text.match(PHONE_PATTERN) || []
  // Normalize phone numbers
  return [...new Set(matches.map((p) => p.replace(/\D/g, '')))]
}

/**
 * Detect contextual actions from event/task content
 */
export function detectActions(
  title: string,
  description?: string | null,
  location?: string | null,
  phoneNumber?: string | null
): DetectedAction[] {
  const actions: DetectedAction[] = []
  const text = `${title} ${description || ''}`

  // Extract all URLs
  const urls = extractUrls(text)

  // Check for video call links first (highest priority)
  for (const url of urls) {
    const service = getVideoCallService(url)
    if (service) {
      actions.push({
        type: 'video-call',
        label: `Join ${service}`,
        url,
        icon: 'video',
      })
    }
  }

  // Check for recipe links
  for (const url of urls) {
    if (isRecipeUrl(url)) {
      actions.push({
        type: 'recipe',
        label: 'View Recipe',
        url,
        icon: 'recipe',
      })
    }
  }

  // Check for location (directions)
  if (location) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    actions.push({
      type: 'directions',
      label: 'Get Directions',
      url: mapsUrl,
      icon: 'map',
    })
  }

  // Check for phone numbers
  if (phoneNumber) {
    actions.push({
      type: 'call',
      label: 'Call',
      phoneNumber,
      icon: 'phone',
    })
    actions.push({
      type: 'text',
      label: 'Text',
      phoneNumber,
      icon: 'message',
    })
  } else {
    // Try to extract phone numbers from description
    const extractedPhones = extractPhoneNumbers(text)
    if (extractedPhones.length > 0) {
      const phone = extractedPhones[0]
      actions.push({
        type: 'call',
        label: 'Call',
        phoneNumber: phone,
        icon: 'phone',
      })
    }
  }

  // Add any other URLs as generic links (limit to avoid clutter)
  const otherUrls = urls.filter(
    (url) => !getVideoCallService(url) && !isRecipeUrl(url)
  )
  for (const url of otherUrls.slice(0, 2)) {
    // Max 2 generic links
    try {
      const urlObj = new URL(url)
      actions.push({
        type: 'link',
        label: urlObj.hostname.replace(/^www\./, ''),
        url,
        icon: 'link',
      })
    } catch {
      // Invalid URL, skip
    }
  }

  return actions
}
