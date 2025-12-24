/**
 * Packing Context Aggregator
 *
 * Builds comprehensive context for AI packing list generation by aggregating:
 * - Trip metadata (destination, dates, events)
 * - Weather forecasts (destination + home climate comparison)
 * - Traveler profiles (family members with health data)
 * - User preferences and special needs
 */

import type { TripMetadata } from '@/types/trip'
import type { FamilyMember } from '@/types/family'
import type { UserProfile } from '@/types/userProfile'
import type { PackingContext, TravelerProfile } from '@/services/claudeService'
import { fetchWeatherForecast, type WeatherSummary } from '@/services/weatherService'

/**
 * Build comprehensive packing context from all available data sources
 */
export async function buildPackingContext(
  tripMetadata: TripMetadata,
  familyMembers: FamilyMember[],
  userProfile: UserProfile | null,
  specialNeeds?: string
): Promise<PackingContext> {
  // Validate trip data
  if (!tripMetadata.destination || !tripMetadata.startDate || !tripMetadata.endDate) {
    throw new Error('Trip must have destination and dates to generate packing list')
  }

  // Calculate trip duration
  const startDate = new Date(tripMetadata.startDate)
  const endDate = new Date(tripMetadata.endDate)
  const durationMs = endDate.getTime() - startDate.getTime()
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24)) + 1

  // Extract events from trip metadata
  const events = extractTripEvents(tripMetadata)

  // Fetch destination weather
  let destinationWeather: WeatherSummary
  try {
    if (tripMetadata.destination.lat && tripMetadata.destination.lng) {
      destinationWeather = await fetchWeatherForecast(
        tripMetadata.destination.lat,
        tripMetadata.destination.lng,
        tripMetadata.destination.name,
        startDate,
        endDate
      )
    } else {
      // No coordinates available, use defaults
      console.warn('Destination missing coordinates, using default weather')
      destinationWeather = getDefaultWeather(tripMetadata.destination.name)
    }
  } catch (error) {
    console.error('Failed to fetch destination weather:', error)
    destinationWeather = getDefaultWeather(tripMetadata.destination.name)
  }

  // Fetch home weather for climate comparison (if available)
  let homeWeather: WeatherSummary | undefined
  if (userProfile?.home_lat && userProfile?.home_lng && userProfile?.home_location) {
    try {
      homeWeather = await fetchWeatherForecast(
        userProfile.home_lat,
        userProfile.home_lng,
        userProfile.home_location,
        startDate,
        endDate
      )
    } catch (error) {
      console.warn('Failed to fetch home weather, skipping climate comparison:', error)
    }
  }

  // Build traveler profiles from family members
  const travelers = buildTravelerProfiles(familyMembers)

  // Assemble comprehensive context
  const context: PackingContext = {
    trip: {
      destination: tripMetadata.destination.name,
      origin: tripMetadata.origin?.name || 'Home',
      startDate: tripMetadata.startDate,
      endDate: tripMetadata.endDate,
      duration_days: durationDays,
      events
    },
    weather: {
      destination: destinationWeather,
      home: homeWeather
    },
    travelers,
    special_needs: specialNeeds
  }

  return context
}

/**
 * Extract trip events from metadata
 */
function extractTripEvents(tripMetadata: TripMetadata): Array<{
  type: string
  location?: string
  date: string
  details?: string
}> {
  const events: Array<{ type: string; location?: string; date: string; details?: string }> = []

  // Extract from unified timeline if available
  if (tripMetadata.useUnifiedTimeline && tripMetadata.events) {
    for (const event of tripMetadata.events) {
      let eventType = 'other'
      let location: string | undefined
      let details: string | undefined

      switch (event.eventType) {
        case 'flight':
          eventType = 'flight'
          location = event.destination?.name || event.origin?.name
          details = event.airline || undefined
          break
        case 'train':
          eventType = 'train'
          location = event.destination?.name || event.origin?.name
          details = event.line || undefined
          break
        case 'driving_ev':
        case 'driving_rental':
          eventType = 'driving'
          location = event.destination?.name || event.origin?.name
          break
        case 'hotel':
          eventType = 'accommodation'
          location = event.location?.name
          details = 'Hotel'
          break
        case 'airbnb':
          eventType = 'accommodation'
          location = event.location?.name
          details = 'Airbnb'
          break
        case 'family_stay':
          eventType = 'accommodation'
          location = event.location?.name
          details = 'Family stay'
          break
        default:
          eventType = event.eventType || 'other'
      }

      events.push({
        type: eventType,
        location,
        date: event.date || tripMetadata.startDate,
        details
      })
    }
  }

  // If no events, add a basic arrival/departure
  if (events.length === 0) {
    events.push({
      type: 'arrival',
      location: tripMetadata.destination.name,
      date: tripMetadata.startDate
    })
    events.push({
      type: 'departure',
      location: tripMetadata.destination.name,
      date: tripMetadata.endDate
    })
  }

  return events
}

/**
 * Build traveler profiles from family members
 */
function buildTravelerProfiles(familyMembers: FamilyMember[]): TravelerProfile[] {
  return familyMembers.map(member => {
    const profile: TravelerProfile = {
      name: member.name
    }

    if (member.age_range) {
      profile.age_range = member.age_range
    }

    if (member.allergies && member.allergies.length > 0) {
      profile.allergies = member.allergies
    }

    if (member.medications && member.medications.length > 0) {
      profile.medications = member.medications.map(med => ({
        name: med.name,
        dosage: med.dosage
      }))
    }

    if (member.dietary_restrictions && member.dietary_restrictions.length > 0) {
      profile.dietary_restrictions = member.dietary_restrictions
    }

    if (member.health_conditions && member.health_conditions.length > 0) {
      profile.health_conditions = member.health_conditions
    }

    if (member.mobility_needs) {
      profile.mobility_needs = member.mobility_needs
    }

    return profile
  })
}

/**
 * Get default weather summary when API is unavailable
 */
function getDefaultWeather(locationName: string): WeatherSummary {
  return {
    location: locationName,
    forecasts: [],
    temp_range: {
      min: 60,
      max: 75,
      unit: 'F'
    },
    conditions_summary: ['Unknown'],
    needs_rain_gear: true, // Better safe than sorry
    needs_warm_layers: true,
    needs_sun_protection: true
  }
}
