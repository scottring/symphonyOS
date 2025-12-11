import { describe, it, expect } from 'vitest'
import { detectActions, type DetectedAction } from './actionDetection'

describe('detectActions', () => {
  describe('video call detection', () => {
    it('detects Zoom links', () => {
      const actions = detectActions(
        'Team Meeting',
        'Join us at https://zoom.us/j/123456789'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
      expect(videoCall?.label).toBe('Join Zoom')
      expect(videoCall?.url).toBe('https://zoom.us/j/123456789')
      expect(videoCall?.icon).toBe('video')
    })

    it('detects Google Meet links', () => {
      const actions = detectActions(
        'Standup',
        'https://meet.google.com/abc-defg-hij'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
      expect(videoCall?.label).toBe('Join Google Meet')
    })

    it('detects Microsoft Teams links', () => {
      const actions = detectActions(
        'Client Call',
        'https://teams.microsoft.com/l/meetup-join/xyz'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
      expect(videoCall?.label).toBe('Join Microsoft Teams')
    })

    it('detects Webex links', () => {
      const actions = detectActions(
        'Conference',
        'https://company.webex.com/meet/john'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
      expect(videoCall?.label).toBe('Join Webex')
    })

    it('detects GoToMeeting links', () => {
      const actions = detectActions(
        'Meeting',
        'https://app.gotomeeting.com/123456789'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
      expect(videoCall?.label).toBe('Join GoToMeeting')
    })

    it('detects Whereby links', () => {
      const actions = detectActions(
        'Quick chat',
        'https://whereby.com/myroom'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
      expect(videoCall?.label).toBe('Join Whereby')
    })

    it('detects video call in title', () => {
      const actions = detectActions(
        'Meeting https://zoom.us/j/123 - Important',
        ''
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
    })
  })

  describe('recipe detection', () => {
    const recipeWebsites = [
      { domain: 'allrecipes.com', name: 'AllRecipes' },
      { domain: 'foodnetwork.com', name: 'Food Network' },
      { domain: 'epicurious.com', name: 'Epicurious' },
      { domain: 'bonappetit.com', name: 'Bon Appétit' },
      { domain: 'seriouseats.com', name: 'Serious Eats' },
      { domain: 'budgetbytes.com', name: 'Budget Bytes' },
      { domain: 'delish.com', name: 'Delish' },
      { domain: 'tasty.co', name: 'Tasty' },
      { domain: 'simplyrecipes.com', name: 'Simply Recipes' },
      { domain: 'food52.com', name: 'Food52' },
      { domain: 'minimalistbaker.com', name: 'Minimalist Baker' },
      { domain: 'smittenkitchen.com', name: 'Smitten Kitchen' },
    ]

    recipeWebsites.forEach(({ domain }) => {
      it(`detects ${domain} recipe links`, () => {
        const actions = detectActions(
          'Dinner',
          `Recipe: https://www.${domain}/recipe/pasta`
        )

        const recipe = actions.find(a => a.type === 'recipe')
        expect(recipe).toBeDefined()
        expect(recipe?.label).toBe('View Recipe')
        expect(recipe?.icon).toBe('recipe')
      })
    })

    it('detects recipe link in title', () => {
      const actions = detectActions(
        'Make this https://allrecipes.com/recipe/12345',
        null
      )

      const recipe = actions.find(a => a.type === 'recipe')
      expect(recipe).toBeDefined()
    })
  })

  describe('directions detection', () => {
    it('creates Google Maps link for location', () => {
      const actions = detectActions(
        'Dentist Appointment',
        null,
        '123 Main St, Anytown, CA'
      )

      const directions = actions.find(a => a.type === 'directions')
      expect(directions).toBeDefined()
      expect(directions?.label).toBe('Get Directions')
      expect(directions?.icon).toBe('map')
      expect(directions?.url).toContain('google.com/maps')
      expect(directions?.url).toContain(encodeURIComponent('123 Main St, Anytown, CA'))
    })

    it('does not create directions without location', () => {
      const actions = detectActions('Meeting', 'Just a meeting', null)

      const directions = actions.find(a => a.type === 'directions')
      expect(directions).toBeUndefined()
    })
  })

  describe('phone number detection', () => {
    it('creates call action for provided phone number', () => {
      const actions = detectActions(
        'Call Dr. Smith',
        null,
        null,
        '555-123-4567'
      )

      const call = actions.find(a => a.type === 'call')
      expect(call).toBeDefined()
      expect(call?.label).toBe('Call')
      expect(call?.phoneNumber).toBe('555-123-4567')
      expect(call?.icon).toBe('phone')
    })

    it('creates text action for provided phone number', () => {
      const actions = detectActions(
        'Contact John',
        null,
        null,
        '555-123-4567'
      )

      const text = actions.find(a => a.type === 'text')
      expect(text).toBeDefined()
      expect(text?.label).toBe('Text')
      expect(text?.phoneNumber).toBe('555-123-4567')
      expect(text?.icon).toBe('message')
    })

    it('extracts phone number from description', () => {
      const actions = detectActions(
        'Call the office',
        'The number is 555-987-6543'
      )

      const call = actions.find(a => a.type === 'call')
      expect(call).toBeDefined()
      expect(call?.phoneNumber).toBe('5559876543')
    })

    it('extracts phone number from title', () => {
      const actions = detectActions(
        'Call 555-111-2222 about the order'
      )

      const call = actions.find(a => a.type === 'call')
      expect(call).toBeDefined()
    })

    it('handles phone number with different formats', () => {
      const formats = [
        '555-123-4567',
        '(555) 123-4567',
        '555.123.4567',
        '555 123 4567',
        '+1 555-123-4567',
        '1-555-123-4567',
      ]

      formats.forEach(phone => {
        const actions = detectActions('Call', `Number: ${phone}`)
        const call = actions.find(a => a.type === 'call')
        expect(call).toBeDefined()
      })
    })

    it('does not create text action when phone extracted from text', () => {
      // When phone is extracted from text (not provided as parameter),
      // only call action is created, not text
      const actions = detectActions(
        'Call the office',
        'The number is 555-987-6543'
      )

      const text = actions.find(a => a.type === 'text')
      expect(text).toBeUndefined()
    })
  })

  describe('generic link detection', () => {
    it('detects generic URLs as links', () => {
      const actions = detectActions(
        'Check this out',
        'See https://example.com/page for details'
      )

      const link = actions.find(a => a.type === 'link')
      expect(link).toBeDefined()
      expect(link?.label).toBe('example.com')
      expect(link?.url).toBe('https://example.com/page')
      expect(link?.icon).toBe('link')
    })

    it('removes www prefix from link label', () => {
      const actions = detectActions(
        'Reference',
        'https://www.example.com/test'
      )

      const link = actions.find(a => a.type === 'link')
      expect(link?.label).toBe('example.com')
    })

    it('limits generic links to 2 maximum', () => {
      const actions = detectActions(
        'Research',
        'Check https://site1.com https://site2.com https://site3.com https://site4.com'
      )

      const links = actions.filter(a => a.type === 'link')
      expect(links.length).toBeLessThanOrEqual(2)
    })

    it('excludes video call URLs from generic links', () => {
      const actions = detectActions(
        'Meeting',
        'Join https://zoom.us/j/123 and check https://example.com'
      )

      const links = actions.filter(a => a.type === 'link')
      const videoLinks = links.filter(l => l.url?.includes('zoom'))
      expect(videoLinks).toHaveLength(0)
    })

    it('excludes recipe URLs from generic links', () => {
      const actions = detectActions(
        'Dinner prep',
        'Recipe: https://allrecipes.com/r/123 Notes: https://example.com'
      )

      const links = actions.filter(a => a.type === 'link')
      const recipeLinks = links.filter(l => l.url?.includes('allrecipes'))
      expect(recipeLinks).toHaveLength(0)
    })
  })

  describe('HTML anchor tag extraction', () => {
    it('extracts URLs from anchor tags', () => {
      const actions = detectActions(
        'Meeting',
        '<a href="https://zoom.us/j/123">Join Meeting</a>'
      )

      const videoCall = actions.find(a => a.type === 'video-call')
      expect(videoCall).toBeDefined()
    })

    it('cleans trailing punctuation from URLs', () => {
      const actions = detectActions(
        'Check this',
        'See https://example.com/page.'
      )

      const link = actions.find(a => a.type === 'link')
      expect(link?.url).toBe('https://example.com/page')
    })
  })

  describe('combined detections', () => {
    it('detects multiple action types in one event', () => {
      const actions = detectActions(
        'Cooking Class',
        'Join at https://zoom.us/j/123 for the session on https://allrecipes.com/recipe/456',
        '123 Culinary School Dr',
        '555-123-4567'
      )

      const types = actions.map(a => a.type)
      expect(types).toContain('video-call')
      expect(types).toContain('recipe')
      expect(types).toContain('directions')
      expect(types).toContain('call')
      expect(types).toContain('text')
    })

    it('returns empty array when no actions detected', () => {
      const actions = detectActions('Simple task', 'Nothing special here')

      expect(actions).toEqual([])
    })

    it('handles null description and location', () => {
      const actions = detectActions('Task', null, null, null)

      expect(actions).toEqual([])
    })
  })
})
