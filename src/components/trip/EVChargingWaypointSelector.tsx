/**
 * EV Charging Waypoint Selector
 * Shows potential charging stations along a route and lets users select which ones to include
 */

import { useState, useEffect } from 'react'
import type { DrivingEVEvent, ChargingStation, ChargingNetwork } from '@/types/trip'
import { calculateEVRoute } from '@/lib/evRouteOptimizer'

interface EVChargingWaypointSelectorProps {
  event: DrivingEVEvent
  onClose: () => void
  onSelectWaypoints: (waypoints: ChargingStation[]) => void
}

export function EVChargingWaypointSelector({ event, onClose, onSelectWaypoints }: EVChargingWaypointSelectorProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [chargingStops, setChargingStops] = useState<ChargingStation[]>([])
  const [availableStations, setAvailableStations] = useState<ChargingStation[]>([])
  const [selectedStops, setSelectedStops] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function calculateRoute() {
      if (!event.evVehicle) {
        setError('No EV vehicle information available')
        setIsLoading(false)
        return
      }

      try {
        const result = await calculateEVRoute({
          origin: event.origin,
          destination: event.destination,
          vehicleRange: event.evVehicle.rangePerCharge,
          currentBattery: event.evVehicle.currentBattery,
          preferredNetworks: event.evVehicle.preferredNetworks,
        })

        console.log('EV Route calculation result:', {
          chargingStops: result.chargingStops?.length || 0,
          availableStations: result.availableStations?.length || 0,
        })

        // Set required charging stops
        if (result.chargingStops) {
          const stations = result.chargingStops.map(stop => stop.station)
          setChargingStops(stations)
          // Pre-select required stops
          setSelectedStops(new Set(stations.map(s => s.id)))
        }

        // Set available stations (for optional selection when no charging needed)
        if (result.availableStations) {
          console.log('Setting available stations:', result.availableStations)
          setAvailableStations(result.availableStations)
        } else {
          console.warn('No available stations returned from calculateEVRoute')
        }
      } catch (err) {
        console.error('Error calculating EV route:', err)
        setError('Unable to calculate charging route. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    calculateRoute()
  }, [event])

  const handleToggleStation = (stationId: string) => {
    const newSelected = new Set(selectedStops)
    if (newSelected.has(stationId)) {
      newSelected.delete(stationId)
    } else {
      newSelected.add(stationId)
    }
    setSelectedStops(newSelected)
  }

  const handleConfirm = () => {
    // Use available stations if no required charging stops
    const stationsToChooseFrom = chargingStops.length > 0 ? chargingStops : availableStations
    const selected = stationsToChooseFrom.filter(station => selectedStops.has(station.id))
    onSelectWaypoints(selected)
  }

  const getNetworkColor = (network: ChargingNetwork): string => {
    switch (network) {
      case 'Tesla Supercharger':
        return 'bg-red-100 text-red-700'
      case 'Electrify America':
        return 'bg-blue-100 text-blue-700'
      case 'ChargePoint':
        return 'bg-green-100 text-green-700'
      case 'EVgo':
        return 'bg-purple-100 text-purple-700'
      default:
        return 'bg-neutral-100 text-neutral-700'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-b border-green-100 p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-display text-3xl font-bold text-neutral-900 mb-2">
                Plan Charging Stops
              </h2>
              <p className="text-sm text-neutral-600">
                {event.origin.name || event.origin.address} → {event.destination.name || event.destination.address}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-white/50 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {event.evVehicle && (
            <div className="flex items-center gap-4 text-sm">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="font-medium text-neutral-700">{event.evVehicle.model}</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full">
                <span className="font-medium text-neutral-700">{event.evVehicle.currentBattery}% battery</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full">
                <span className="font-medium text-neutral-700">{event.evVehicle.rangePerCharge} mi range</span>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {isLoading ? (
            <div className="py-16 text-center">
              <div className="inline-flex items-center gap-3 text-neutral-600">
                <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="font-medium">Calculating optimal charging route...</span>
              </div>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-neutral-700 font-medium mb-2">Unable to calculate route</p>
              <p className="text-sm text-neutral-500">{error}</p>
            </div>
          ) : chargingStops.length === 0 ? (
            // No required charging, but show available stations
            availableStations.length > 0 ? (
              <>
                <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-900 mb-1">No charging required</p>
                      <p className="text-xs text-green-700">
                        Your vehicle has enough range for this trip. However, you can optionally add stops for extra margin, rest breaks, or convenience.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="font-semibold text-neutral-900 mb-2">
                    Available Charging Stops ({availableStations.length})
                  </h3>
                  <p className="text-sm text-neutral-500">
                    Select charging stations you'd like to add to your itinerary
                  </p>
                </div>

                <div className="space-y-3">
                  {availableStations.map((station, index) => {
                    const isSelected = selectedStops.has(station.id)
                    return (
                      <label
                        key={station.id}
                        className={`
                          block p-4 rounded-xl border-2 cursor-pointer transition-all
                          ${isSelected
                            ? 'border-green-500 bg-green-50'
                            : 'border-neutral-200 hover:border-green-300 hover:bg-neutral-50'
                          }
                        `}
                      >
                        <div className="flex items-start gap-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleStation(station.id)}
                            className="mt-1 w-5 h-5 rounded border-neutral-300 text-green-600
                                     focus:ring-2 focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-neutral-900">{station.name}</span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600">
                                    Option {index + 1}
                                  </span>
                                </div>
                                <p className="text-sm text-neutral-600">
                                  {station.location.name || station.location.address}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getNetworkColor(station.network)}`}>
                                {station.network}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {station.powerKW}kW • {station.connectorTypes.join(', ')}
                              </span>
                              {station.distance && (
                                <span className="text-xs text-neutral-500">
                                  {Math.round(station.distance)} mi from route
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </>
            ) : (
              // No available stations found
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-neutral-700 font-medium mb-2">No charging needed</p>
                <p className="text-sm text-neutral-500 mb-4">Your vehicle has enough range for this trip</p>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 text-sm font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                >
                  Continue Without Charging
                </button>
              </div>
            )
          ) : (
            <>
              <div className="mb-6">
                <h3 className="font-semibold text-neutral-900 mb-2">
                  Recommended Charging Stops ({chargingStops.length})
                </h3>
                <p className="text-sm text-neutral-500">
                  Select the charging stations you'd like to include in your itinerary
                </p>
              </div>

              <div className="space-y-3">
                {chargingStops.map((station, index) => {
                  const isSelected = selectedStops.has(station.id)
                  return (
                    <label
                      key={station.id}
                      className={`
                        block p-4 rounded-xl border-2 cursor-pointer transition-all
                        ${isSelected
                          ? 'border-green-500 bg-green-50'
                          : 'border-neutral-200 hover:border-green-300 hover:bg-neutral-50'
                        }
                      `}
                    >
                      <div className="flex items-start gap-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleStation(station.id)}
                          className="mt-1 w-5 h-5 rounded border-neutral-300 text-green-600
                                     focus:ring-2 focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-neutral-900">{station.name}</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600">
                                  Stop {index + 1}
                                </span>
                              </div>
                              <p className="text-sm text-neutral-600">
                                {station.location.name || station.location.address}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getNetworkColor(station.network)}`}>
                              {station.network}
                            </span>
                            <span className="text-xs text-neutral-500">
                              {station.powerKW}kW • {station.connectorTypes.join(', ')}
                            </span>
                            {station.distance && (
                              <span className="text-xs text-neutral-500">
                                {Math.round(station.distance)} mi from route
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !error && (chargingStops.length > 0 || availableStations.length > 0) && (
          <div className="border-t border-neutral-200 p-6 bg-neutral-50">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-neutral-600">
                {selectedStops.size === 0 ? (
                  <span>No stops selected</span>
                ) : (
                  <span className="font-medium text-neutral-900">
                    {selectedStops.size} {selectedStops.size === 1 ? 'stop' : 'stops'} selected
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-neutral-600 hover:text-neutral-900
                           bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedStops.size === 0}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-500
                           rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add {selectedStops.size > 0 && `${selectedStops.size} `}to Itinerary
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
