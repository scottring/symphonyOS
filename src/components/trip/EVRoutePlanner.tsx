/**
 * EV Route Planner - Map-Centric Charging Station Selector
 *
 * A sophisticated, cartographic interface for planning EV charging stops
 * Design: "Warm Cartographic Luxury" - Think premium automotive GPS meets hand-crafted maps
 *
 * Features:
 * - Interactive map with Google Maps
 * - Route alternatives
 * - Manual distance input for charging stops
 * - Advanced filtering (brand, diversion, minimum kW)
 * - Elegant station list with map visualization
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { DrivingEVEvent, ChargingStation, ChargingNetwork } from '@/types/trip'
import { calculateEVRoute } from '@/lib/evRouteOptimizer'
import { Zap, Navigation, Sliders, Route as RouteIcon, Target, RefreshCw } from 'lucide-react'

interface EVRoutePlannerProps {
  event: DrivingEVEvent
  onClose: () => void
  onSelectWaypoints: (waypoints: ChargingStation[]) => void
}

// Network color mapping for visual consistency
const NETWORK_COLORS: Record<ChargingNetwork, { bg: string; text: string; marker: string }> = {
  'Tesla Supercharger': { bg: 'bg-red-50', text: 'text-red-700', marker: '#DC2626' },
  'Electrify America': { bg: 'bg-blue-50', text: 'text-blue-700', marker: '#2563EB' },
  'ChargePoint': { bg: 'bg-green-50', text: 'text-green-700', marker: '#16A34A' },
  'EVgo': { bg: 'bg-purple-50', text: 'text-purple-700', marker: '#9333EA' },
  'Blink': { bg: 'bg-orange-50', text: 'text-orange-700', marker: '#EA580C' },
  'Other': { bg: 'bg-neutral-50', text: 'text-neutral-700', marker: '#64748B' },
}

export function EVRoutePlanner({ event, onClose, onSelectWaypoints }: EVRoutePlannerProps) {
  // State
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [originalStations, setOriginalStations] = useState<ChargingStation[]>([]) // All stations from initial load
  const [allStations, setAllStations] = useState<ChargingStation[]>([]) // Stations for current route
  const [filteredStations, setFilteredStations] = useState<ChargingStation[]>([])
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [showDistanceSearch, setShowDistanceSearch] = useState(false)
  const [manualDistance, setManualDistance] = useState<string>('')
  const [totalRouteDistance, setTotalRouteDistance] = useState<number>(0) // miles
  const [availableRoutes, setAvailableRoutes] = useState<google.maps.DirectionsRoute[]>([])
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)

  // Filter state
  const [filters, setFilters] = useState({
    networks: new Set<ChargingNetwork>(),
    maxDiversion: 100, // miles (increased to show all nearby stations)
    minPowerKW: 50,
    distanceAlongRoute: null as number | null, // miles from start
  })

  // Map ref
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const routePolylineRef = useRef<google.maps.Polyline | null>(null)
  const alternativePolylinesRef = useRef<google.maps.Polyline[]>([])
  const markersRef = useRef<google.maps.Marker[]>([])
  const routeMarkersRef = useRef<google.maps.Marker[]>([])

  // Load/refresh charging stations
  const loadStations = useCallback(async (refreshing = false) => {
    if (!event.evVehicle) {
      setError('No EV vehicle information available')
      setIsLoading(false)
      return
    }

    if (refreshing) {
      setIsRefreshing(true)
    }

    try {
      const result = await calculateEVRoute({
        origin: event.origin,
        destination: event.destination,
        vehicleRange: event.evVehicle.rangePerCharge,
        currentBattery: event.evVehicle.currentBattery,
        preferredNetworks: event.evVehicle.preferredNetworks,
      })

      const stations = result.availableStations || []
      console.log(`EVRoutePlanner: Loaded ${stations.length} stations from calculateEVRoute`)
      if (stations.length > 0) {
        const networkCounts = stations.reduce((acc, s) => {
          acc[s.network] = (acc[s.network] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        console.log('Network distribution:', networkCounts)
      }

      setOriginalStations(stations) // Store original stations
      setAllStations(stations)
      setFilteredStations(stations)

      // Pre-select required charging stops (only on initial load, not refresh)
      if (!refreshing && result.chargingStops && result.chargingStops.length > 0) {
        const requiredIds = result.chargingStops.map(stop => stop.station.id)
        setSelectedStations(new Set(requiredIds))
      }

      setError(null)
    } catch (err) {
      console.error('Error calculating route:', err)
      setError('Unable to calculate charging route')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [event])

  // Calculate route on mount
  useEffect(() => {
    loadStations(false)
  }, [loadStations])

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps || isLoading) return

    // Calculate initial center from origin or default to center of US
    const initialCenter = event.origin.lat && event.origin.lng
      ? { lat: event.origin.lat, lng: event.origin.lng }
      : { lat: 39.8283, lng: -98.5795 } // Geographic center of US

    // Create map with warm, muted styling
    const map = new google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: 6,
      styles: [
        // Warm, muted map style - think vintage cartography
        { elementType: 'geometry', stylers: [{ color: '#F5F1E8' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#6B5B4A' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFBF5' }] },
        {
          featureType: 'administrative',
          elementType: 'geometry.stroke',
          stylers: [{ color: '#D4C5B0' }],
        },
        {
          featureType: 'landscape',
          elementType: 'geometry',
          stylers: [{ color: '#F5F1E8' }],
        },
        {
          featureType: 'road',
          elementType: 'geometry',
          stylers: [{ color: '#FFFFFF' }],
        },
        {
          featureType: 'road.highway',
          elementType: 'geometry',
          stylers: [{ color: '#FFE7C7' }],
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#B8D4E0' }],
        },
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    })

    mapInstanceRef.current = map

    // Draw route from origin to destination with alternatives
    if ((event.origin.lat && event.origin.lng && event.destination.lat && event.destination.lng) ||
        (event.origin.address && event.destination.address)) {
      const directionsService = new google.maps.DirectionsService()

      // Use lat/lng if available, otherwise use address
      const origin = event.origin.lat && event.origin.lng
        ? { lat: event.origin.lat, lng: event.origin.lng }
        : event.origin.address

      const destination = event.destination.lat && event.destination.lng
        ? { lat: event.destination.lat, lng: event.destination.lng }
        : event.destination.address

      directionsService.route({
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true, // Request alternative routes
      }, (result, status) => {
        if (status === 'OK' && result && result.routes) {
          // Store available routes
          setAvailableRoutes(result.routes)

          // Calculate total distance for the primary route
          const primaryRoute = result.routes[0]
          const distanceMiles = primaryRoute.legs.reduce((sum, leg) =>
            sum + (leg.distance?.value || 0), 0
          ) / 1609.344
          setTotalRouteDistance(distanceMiles)

          // Draw the selected route (default to first)
          const selectedRoute = result.routes[selectedRouteIndex] || primaryRoute
          const path = selectedRoute.overview_path

          if (routePolylineRef.current) {
            routePolylineRef.current.setMap(null)
          }

          routePolylineRef.current = new google.maps.Polyline({
            path,
            strokeColor: '#374151', // Deep charcoal
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map,
          })

          // Store alternative routes for later rendering
          // They will be drawn by a separate effect that watches selectedRouteIndex

          // Fit map to route bounds
          const bounds = new google.maps.LatLngBounds()
          path.forEach(point => bounds.extend(point))
          map.fitBounds(bounds)
        }
      })
    }

    return () => {
      // Cleanup
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null)
      }
      alternativePolylinesRef.current.forEach(polyline => polyline.setMap(null))
      alternativePolylinesRef.current = []
      routeMarkersRef.current.forEach(marker => marker.setMap(null))
      routeMarkersRef.current = []
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
    }
  }, [mapRef.current, window.google, isLoading, event.origin, event.destination])

  // Redraw routes when selected route index changes
  useEffect(() => {
    if (!mapInstanceRef.current || availableRoutes.length === 0) return

    const map = mapInstanceRef.current

    // Clear existing route polylines and markers
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null)
    }
    alternativePolylinesRef.current.forEach(polyline => polyline.setMap(null))
    alternativePolylinesRef.current = []
    routeMarkersRef.current.forEach(marker => marker.setMap(null))
    routeMarkersRef.current = []

    // Draw all routes
    availableRoutes.forEach((route, index) => {
      const isSelected = index === selectedRouteIndex
      const path = route.overview_path

      const polyline = new google.maps.Polyline({
        path,
        strokeColor: isSelected ? '#374151' : '#D1D5DB', // Dark charcoal for selected, light gray for alternatives
        strokeOpacity: isSelected ? 0.8 : 0.5,
        strokeWeight: isSelected ? 4 : 3,
        map,
        clickable: !isSelected,
      })

      if (isSelected) {
        routePolylineRef.current = polyline
      } else {
        alternativePolylinesRef.current.push(polyline)
      }
    })

    // Add origin and destination markers for selected route
    const selectedRoute = availableRoutes[selectedRouteIndex]
    if (selectedRoute) {
      const routeStart = selectedRoute.legs[0].start_location
      const routeEnd = selectedRoute.legs[selectedRoute.legs.length - 1].end_location

      const startMarker = new google.maps.Marker({
        position: routeStart,
        map,
        title: 'Start',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#059669', // Green for start
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      })

      const endMarker = new google.maps.Marker({
        position: routeEnd,
        map,
        title: 'Destination',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#DC2626', // Red for end
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      })

      routeMarkersRef.current = [startMarker, endMarker]

      // Fit map to selected route bounds
      const bounds = new google.maps.LatLngBounds()
      selectedRoute.overview_path.forEach(point => bounds.extend(point))
      map.fitBounds(bounds)

      // Update total distance for selected route
      const distanceMiles = selectedRoute.legs.reduce((sum, leg) =>
        sum + (leg.distance?.value || 0), 0
      ) / 1609.344
      setTotalRouteDistance(distanceMiles)
    }
  }, [selectedRouteIndex, availableRoutes])

  // DISABLED: Route proximity filter - show all stations regardless of distance
  useEffect(() => {
    if (!originalStations.length) {
      console.log('No stations loaded yet')
      return
    }

    console.log(`Showing all ${originalStations.length} stations (route proximity filter disabled)`)

    // Show all stations without filtering by route proximity
    setAllStations(originalStations)
  }, [originalStations])

  // Update station markers when filtered stations change
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []

    // Add markers for filtered stations
    filteredStations.forEach(station => {
      if (!station.location.lat || !station.location.lng) return

      const isSelected = selectedStations.has(station.id)
      const color = NETWORK_COLORS[station.network]?.marker || '#64748B'

      const marker = new google.maps.Marker({
        position: { lat: station.location.lat, lng: station.location.lng },
        map: mapInstanceRef.current!,
        title: station.name,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          rotation: 180,
          scale: isSelected ? 7 : 5,
          fillColor: color,
          fillOpacity: isSelected ? 1 : 0.7,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      })

      // Click handler
      marker.addListener('click', () => {
        handleToggleStation(station.id)
      })

      markersRef.current.push(marker)
    })
  }, [filteredStations, selectedStations, mapInstanceRef.current])

  // Apply filters
  useEffect(() => {
    let filtered = [...allStations]

    // Network filter
    if (filters.networks.size > 0) {
      filtered = filtered.filter(station => filters.networks.has(station.network))
    }

    // Max diversion filter
    if (filters.maxDiversion) {
      filtered = filtered.filter(station =>
        !station.distance || station.distance <= filters.maxDiversion
      )
    }

    // Min power filter
    filtered = filtered.filter(station => station.powerKW >= filters.minPowerKW)

    // Distance along route filter
    if (filters.distanceAlongRoute !== null && availableRoutes.length > 0) {
      const selectedRoute = availableRoutes[selectedRouteIndex]
      if (selectedRoute) {
        const targetDistance = filters.distanceAlongRoute * 1609.344 // Convert miles to meters
        const routePath = selectedRoute.overview_path

        // Find the point on the route at the target distance
        let accumulatedDistance = 0
        let targetPoint: google.maps.LatLng | null = null

        for (let i = 0; i < routePath.length - 1; i++) {
          const segmentDistance = google.maps.geometry.spherical.computeDistanceBetween(
            routePath[i],
            routePath[i + 1]
          )

          if (accumulatedDistance + segmentDistance >= targetDistance) {
            // Target point is on this segment
            const ratio = (targetDistance - accumulatedDistance) / segmentDistance
            targetPoint = google.maps.geometry.spherical.interpolate(
              routePath[i],
              routePath[i + 1],
              ratio
            )
            break
          }

          accumulatedDistance += segmentDistance
        }

        if (targetPoint) {
          // Filter stations within 50 miles of the target point
          const searchRadiusMiles = 50
          filtered = filtered.filter(station => {
            if (!station.location.lat || !station.location.lng) return false

            const stationPos = new google.maps.LatLng(station.location.lat, station.location.lng)
            const distanceToTarget = google.maps.geometry.spherical.computeDistanceBetween(stationPos, targetPoint!)
            const distanceMiles = distanceToTarget / 1609.344

            return distanceMiles <= searchRadiusMiles
          })
        }
      }
    }

    console.log(`Final filter: ${filtered.length}/${allStations.length} stations passed filters (networks: ${filters.networks.size}, minPowerKW: ${filters.minPowerKW})`)
    setFilteredStations(filtered)
  }, [filters, allStations, availableRoutes, selectedRouteIndex])

  // Handlers
  const handleToggleStation = useCallback((stationId: string) => {
    setSelectedStations(prev => {
      const next = new Set(prev)
      if (next.has(stationId)) {
        next.delete(stationId)
      } else {
        next.add(stationId)
      }
      return next
    })
  }, [])

  const handleToggleNetwork = useCallback((network: ChargingNetwork) => {
    setFilters(prev => {
      const networks = new Set(prev.networks)
      if (networks.has(network)) {
        networks.delete(network)
      } else {
        networks.add(network)
      }
      return { ...prev, networks }
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const selected = allStations.filter(station => selectedStations.has(station.id))
    onSelectWaypoints(selected)
  }, [allStations, selectedStations, onSelectWaypoints])

  // Loading state
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-lg font-medium text-neutral-700">Calculating optimal route...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-neutral-900 mb-2">Unable to plan route</p>
              <p className="text-sm text-neutral-600">{error}</p>
            </div>
            <button onClick={onClose} className="btn-primary mt-4">
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      {/* Main Container */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 border-b border-amber-100 px-8 py-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-sm flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h1 className="font-display text-3xl font-bold text-neutral-900">
                    Plan Charging Route
                  </h1>
                  <p className="text-sm text-neutral-600 mt-0.5">
                    {event.origin.name || event.origin.address} → {event.destination.name || event.destination.address}
                  </p>
                </div>
              </div>

              {/* Vehicle Info */}
              {event.evVehicle && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full font-medium text-neutral-700">
                    {event.evVehicle.model}
                  </div>
                  <div className="px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full font-mono text-neutral-700">
                    {event.evVehicle.currentBattery}% battery
                  </div>
                  <div className="px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full font-mono text-neutral-700">
                    {event.evVehicle.rangePerCharge} mi range
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Refresh Button */}
              <button
                onClick={() => loadStations(true)}
                disabled={isRefreshing}
                className="flex-shrink-0 p-2 text-neutral-400 hover:text-neutral-600 hover:bg-white/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh charging stations"
              >
                <RefreshCw className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="flex-shrink-0 p-2 text-neutral-400 hover:text-neutral-600 hover:bg-white/50 rounded-lg transition-colors"
                title="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Main Content: Map + Sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Map Container */}
          <div className="flex-1 relative bg-neutral-100">
            <div ref={mapRef} className="w-full h-full" />

            {/* Map Overlays */}
            <div className="absolute top-4 left-4 space-y-3">
              {/* Route Overview Card */}
              <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 max-w-xs">
                <div className="flex items-center gap-2 mb-2">
                  <Navigation className="w-4 h-4 text-neutral-500" />
                  <span className="text-sm font-semibold text-neutral-700">Route Overview</span>
                </div>
                <div className="space-y-1 text-xs text-neutral-600">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                    <span>Start: {event.origin.name || 'Origin'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
                    <span>End: {event.destination.name || 'Destination'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                    <span>Charging stations ({filteredStations.length})</span>
                  </div>
                  {totalRouteDistance > 0 && (
                    <div className="pt-2 mt-2 border-t border-neutral-200">
                      <span className="font-mono font-semibold text-neutral-900">
                        {Math.round(totalRouteDistance)} mi total
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Route Alternatives */}
              {availableRoutes.length > 1 && (
                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 max-w-xs">
                  <div className="flex items-center gap-2 mb-3">
                    <RouteIcon className="w-4 h-4 text-neutral-500" />
                    <span className="text-sm font-semibold text-neutral-700">
                      Route Options ({availableRoutes.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {availableRoutes.map((route, index) => {
                      const distance = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) / 1609.344
                      const duration = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0) / 60
                      const isSelected = index === selectedRouteIndex

                      return (
                        <button
                          key={index}
                          onClick={() => setSelectedRouteIndex(index)}
                          className={`
                            w-full text-left px-3 py-2 rounded-lg transition-all
                            ${isSelected
                              ? 'bg-primary-100 text-primary-900 ring-2 ring-primary-500'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              Route {String.fromCharCode(65 + index)}
                            </span>
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-primary-600" />
                            )}
                          </div>
                          <div className="text-xs font-mono mt-1">
                            {Math.round(distance)} mi • {Math.round(duration)} min
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Distance Search */}
              <button
                onClick={() => setShowDistanceSearch(!showDistanceSearch)}
                className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 max-w-xs hover:bg-white transition-colors w-full text-left"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-neutral-700">
                    Search by Distance
                  </span>
                </div>
                {showDistanceSearch && (
                  <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="number"
                      value={manualDistance}
                      onChange={e => setManualDistance(e.target.value)}
                      placeholder="Miles along route"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200
                               focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                    <button
                      onClick={() => {
                        const distance = parseFloat(manualDistance)
                        if (distance > 0 && distance <= totalRouteDistance) {
                          // Filter stations near this distance point
                          // This would require calculating distance along route for each station
                          // For now, just update the filter
                          setFilters(prev => ({ ...prev, distanceAlongRoute: distance }))
                        }
                      }}
                      className="w-full px-3 py-1.5 text-xs font-medium text-white bg-amber-600
                               hover:bg-amber-700 rounded-lg transition-colors"
                    >
                      Find Stations
                    </button>
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Sidebar: Filters + Station List */}
          <aside className="w-96 flex-shrink-0 bg-neutral-50 border-l border-neutral-200 flex flex-col overflow-hidden">
            {/* Filter Bar */}
            <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-neutral-200">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-full flex items-center justify-between px-4 py-3 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-neutral-600" />
                  <span className="font-medium text-neutral-700">Filters</span>
                  {(filters.networks.size > 0 || filters.minPowerKW > 50) && (
                    <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-semibold rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-neutral-400 transition-transform ${showFilters ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Filter Panel */}
              {showFilters && (
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Network Filters */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                      Charging Networks
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(NETWORK_COLORS).map(network => {
                        const isActive = filters.networks.has(network as ChargingNetwork)
                        const colors = NETWORK_COLORS[network as ChargingNetwork]
                        return (
                          <button
                            key={network}
                            onClick={() => handleToggleNetwork(network as ChargingNetwork)}
                            className={`
                              px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                              ${isActive
                                ? `${colors.bg} ${colors.text} ring-2 ring-offset-1 ring-current`
                                : 'bg-white text-neutral-600 hover:bg-neutral-50'
                              }
                            `}
                          >
                            {network}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Power Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                      Minimum Power: {filters.minPowerKW}kW
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="350"
                      step="50"
                      value={filters.minPowerKW}
                      onChange={e => setFilters(prev => ({ ...prev, minPowerKW: parseInt(e.target.value) }))}
                      className="w-full accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-neutral-500 mt-1">
                      <span>50kW</span>
                      <span>350kW</span>
                    </div>
                  </div>

                  {/* Max Diversion Filter */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                      Max Diversion: {filters.maxDiversion} miles
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={filters.maxDiversion}
                      onChange={e => setFilters(prev => ({ ...prev, maxDiversion: parseInt(e.target.value) }))}
                      className="w-full accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-neutral-500 mt-1">
                      <span>5 mi</span>
                      <span>50 mi</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Station List */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-700">
                  Available Stations ({filteredStations.length})
                </h3>
                <span className="text-xs text-neutral-500">
                  {selectedStations.size} selected
                </span>
              </div>

              {filteredStations.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 text-sm">
                  No stations match your filters
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStations.map(station => {
                    const isSelected = selectedStations.has(station.id)
                    const colors = NETWORK_COLORS[station.network] || NETWORK_COLORS.Other

                    return (
                      <label
                        key={station.id}
                        className={`
                          block p-3 rounded-xl border-2 cursor-pointer transition-all
                          ${isSelected
                            ? 'border-primary-500 bg-primary-50 shadow-sm'
                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
                          }
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleStation(station.id)}
                            className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-primary-600
                                     focus:ring-2 focus:ring-primary-500 cursor-pointer"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-neutral-900 mb-1">
                              {station.name}
                            </div>
                            <div className="text-xs text-neutral-600 mb-2 line-clamp-1">
                              {station.location.address}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                                {station.network}
                              </span>
                              <span className="text-xs font-mono text-neutral-600">
                                {station.powerKW}kW
                              </span>
                              {station.distance && (
                                <span className="text-xs text-neutral-500">
                                  {Math.round(station.distance)} mi off route
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 border-t border-neutral-200 bg-neutral-50 px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              {selectedStations.size === 0 ? (
                <span>Select stations to add to your itinerary</span>
              ) : (
                <span className="font-semibold text-neutral-900">
                  {selectedStations.size} {selectedStations.size === 1 ? 'station' : 'stations'} selected
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-medium text-neutral-700 hover:text-neutral-900
                         bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={selectedStations.size === 0}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-emerald-500
                         rounded-xl hover:from-primary-600 hover:to-emerald-600 transition-all shadow-lg
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                Add {selectedStations.size > 0 && `${selectedStations.size} `}to Itinerary
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
