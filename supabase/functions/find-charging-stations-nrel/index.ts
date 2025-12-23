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
  networks?: string[] // e.g. ['Electrify America', 'ChargePoint']
}

interface NRELStation {
  id: number
  station_name: string
  street_address: string
  city: string
  state: string
  zip: string
  latitude: number
  longitude: number
  ev_network: string
  ev_dc_fast_num: number
  ev_level2_evse_num: number
  ev_connector_types: string[]
  distance: number
  status_code: string
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
      maxResults = 100,
      minPowerKW,
      networks,
    }: FindChargersRequest = await req.json()

    console.log('Fetching charging stations from NREL API:', {
      latitude,
      longitude,
      radiusMiles,
      maxResults,
      minPowerKW,
      networks,
    })

    // Build query parameters for NREL API
    const apiKey = Deno.env.get('NREL_API_KEY') || 'q6IeUlbYITwXOSqwg8G7w6F27VOLYC7i77fRbQKb'
    const queryParams = new URLSearchParams({
      api_key: apiKey,
      fuel_type: 'ELEC',
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      radius: radiusMiles.toString(),
      limit: maxResults.toString(),
      status: 'E', // Only operational stations
    })

    // Note: We don't pass the 'networks' parameter to NREL because NREL uses different
    // network identifiers than our internal ChargingNetwork enum. We filter by network
    // on the client side instead (in chargingStations.ts)

    // Use the /nearest endpoint for location-based queries
    const apiUrl = `https://developer.nrel.gov/api/alt-fuel-stations/v1/nearest.json?${queryParams.toString()}`

    const response = await fetch(apiUrl)

    if (!response.ok) {
      console.error('NREL API error:', response.status, response.statusText)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch charging stations', stations: [] }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const data = await response.json()
    const nrelStations: NRELStation[] = data.fuel_stations || []
    console.log(`Found ${nrelStations.length} charging stations from NREL`)

    // Transform to our format
    const stations = nrelStations
      .map((station) => {
        // Estimate max power from connector info
        const maxPower = estimateMaxPower(station)

        // Filter by minimum power if specified
        if (minPowerKW && maxPower < minPowerKW) {
          return null
        }

        const network = mapToChargingNetwork(station.ev_network)

        return {
          id: `nrel-${station.id}`,
          name: station.station_name,
          location: {
            name: station.station_name,
            address: `${station.street_address}, ${station.city}, ${station.state} ${station.zip}`,
            lat: station.latitude,
            lng: station.longitude,
          },
          network,
          powerKW: maxPower,
          connectorTypes: station.ev_connector_types || [],
          available: station.status_code === 'E', // E = operational
          distance: station.distance,
        }
      })
      .filter(Boolean) // Remove nulls from power filtering

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
    console.error('Error in find-charging-stations-nrel function:', error)
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
function estimateMaxPower(station: NRELStation): number {
  // DC Fast chargers are typically 50kW-350kW
  // Level 2 chargers are typically 7kW-19kW

  if (station.ev_dc_fast_num > 0) {
    // Estimate based on connector types
    const connectors = station.ev_connector_types || []

    // Electrify America typically has 150-350kW
    if (station.ev_network?.includes('Electrify')) {
      return 350
    }

    // Tesla Superchargers are 150-250kW
    if (station.ev_network?.includes('Tesla')) {
      return 250
    }

    // Default DC fast charger
    return 150
  }

  if (station.ev_level2_evse_num > 0) {
    return 11 // Typical Level 2
  }

  return 50 // Conservative default
}

function mapToChargingNetwork(nrelNetwork: string): string {
  if (!nrelNetwork) return 'Other'

  const network = nrelNetwork.toLowerCase()

  if (network.includes('electrify')) return 'Electrify America'
  if (network.includes('tesla')) return 'Tesla Supercharger'
  if (network.includes('chargepoint')) return 'ChargePoint'
  if (network.includes('evgo')) return 'EVgo'
  if (network.includes('blink')) return 'Blink'

  return 'Other'
}
