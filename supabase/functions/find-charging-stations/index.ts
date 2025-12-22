// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FindChargersRequest {
  latitude: number
  longitude: number
  radiusMiles?: number
  maxResults?: number
  minPowerKW?: number
}

interface OCMLocation {
  ID: number
  Title: string
  AddressInfo: {
    Title: string
    AddressLine1: string
    Town: string
    StateOrProvince: string
    Postcode: string
    Country: {
      Title: string
    }
    Latitude: number
    Longitude: number
    Distance: number
  }
  Connections: Array<{
    ID: number
    ConnectionTypeID: number
    StatusTypeID: number
    LevelID: number
    PowerKW: number
    CurrentTypeID: number
    Quantity: number
  }>
  OperatorInfo: {
    ID: number
    Title: string
    WebsiteURL: string
  }
  StatusType: {
    IsOperational: boolean
    Title: string
  }
  NumberOfPoints: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      latitude,
      longitude,
      radiusMiles = 25,
      maxResults = 20,
      minPowerKW,
    }: FindChargersRequest = await req.json()

    // Build query parameters for Open Charge Map API
    const queryParams = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      distance: radiusMiles.toString(),
      distanceunit: 'Miles',
      maxresults: maxResults.toString(),
      compact: 'true',
      verbose: 'false',
    })

    // Add minimum power filter if specified
    if (minPowerKW) {
      queryParams.append('minpowerkw', minPowerKW.toString())
    }

    // Get API key from environment variable
    const apiKey = Deno.env.get('OPEN_CHARGE_MAP_API_KEY')
    const apiUrl = `https://api.openchargemap.io/v3/poi/?${queryParams.toString()}${apiKey ? `&key=${apiKey}` : ''}`

    console.log('Fetching charging stations from Open Charge Map:', {
      latitude,
      longitude,
      radiusMiles,
      maxResults,
      minPowerKW,
      hasApiKey: !!apiKey,
    })

    const response = await fetch(apiUrl)

    if (!response.ok) {
      console.error('Open Charge Map API error:', response.status, response.statusText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch charging stations', stations: [] }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const data: OCMLocation[] = await response.json()
    console.log(`Found ${data.length} charging stations`)

    // Transform to our format
    const stations = data.map((location) => {
      const maxPower = Math.max(...(location.Connections?.map((c) => c.PowerKW || 0) || [0]))
      const connectorTypes = location.Connections?.map((c) => `Type ${c.ConnectionTypeID}`) || []
      const operatorId = location.OperatorInfo?.ID || 0
      const operatorTitle = location.OperatorInfo?.Title || ''
      const stationName = location.AddressInfo?.Title || location.Title || ''
      const mappedNetwork = mapToChargingNetwork(operatorId, operatorTitle, stationName)

      // Log each station's network mapping for debugging
      console.log(`Station "${stationName}": OperatorID=${operatorId}, OperatorTitle="${operatorTitle}" → Network="${mappedNetwork}"`)

      return {
        id: `ocm-${location.ID}`,
        name: location.AddressInfo?.Title || location.Title || 'Unnamed Station',
        location: {
          name: location.AddressInfo?.Title || location.Title,
          address: formatAddress(location.AddressInfo),
          lat: location.AddressInfo?.Latitude,
          lng: location.AddressInfo?.Longitude,
        },
        network: mappedNetwork,
        powerKW: maxPower,
        connectorTypes,
        available: location.StatusType?.IsOperational || false,
        distance: location.AddressInfo?.Distance,
      }
    })

    // Log network distribution
    const networkCounts = stations.reduce((acc, station) => {
      acc[station.network] = (acc[station.network] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    console.log('Network distribution:', networkCounts)

    return new Response(JSON.stringify({ stations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in find-charging-stations function:', error)
    return new Response(
      JSON.stringify({ error: error.message, stations: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// Helper functions
function formatAddress(addressInfo: OCMLocation['AddressInfo']): string {
  if (!addressInfo) return ''

  const parts = [
    addressInfo.AddressLine1,
    addressInfo.Town,
    addressInfo.StateOrProvince,
    addressInfo.Postcode,
  ].filter(Boolean)

  return parts.join(', ')
}

function mapToChargingNetwork(operatorId: number, operatorTitle: string, stationName: string): string {
  // Map Open Charge Map operator IDs to network names
  const NETWORK_MAP: Record<number, string> = {
    1: 'Other',
    2: 'ChargePoint',
    3: 'Blink',
    23: 'Tesla Supercharger',
    25: 'Electrify America',
    35: 'EVgo',
  }

  // First try operator ID
  if (operatorId && NETWORK_MAP[operatorId] && NETWORK_MAP[operatorId] !== 'Other') {
    return NETWORK_MAP[operatorId]
  }

  // Try operator title
  const title = operatorTitle.toLowerCase()
  if (title.includes('tesla')) return 'Tesla Supercharger'
  if (title.includes('electrify america')) return 'Electrify America'
  if (title.includes('chargepoint')) return 'ChargePoint'
  if (title.includes('evgo')) return 'EVgo'
  if (title.includes('blink')) return 'Blink'

  // Finally, try station name (many stations include network in the name)
  const name = stationName.toLowerCase()
  if (name.includes('tesla') || name.includes('supercharger')) return 'Tesla Supercharger'
  if (name.includes('electrify america')) return 'Electrify America'
  if (name.includes('chargepoint')) return 'ChargePoint'
  if (name.includes('evgo')) return 'EVgo'
  if (name.includes('blink')) return 'Blink'

  return 'Other'
}
