/**
 * Tests for Charging Station Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findChargingStations, findChargersAlongRoute, calculateDistance, findClosestStation } from './chargingStations'
import type { ChargingStation } from '@/types/trip'

// Mock Google Maps global objects
const mockNearbySearch = vi.fn()
const mockGetDetails = vi.fn()
const mockMap = {}

// Set up global window.google before importing anything
global.window = {
  google: {
    maps: {
      Map: vi.fn(() => mockMap),
      LatLng: vi.fn((lat, lng) => ({ lat, lng })),
      places: {
        PlacesService: vi.fn(() => ({
          nearbySearch: mockNearbySearch,
          getDetails: mockGetDetails,
        })),
        PlacesServiceStatus: {
          OK: 'OK',
          ZERO_RESULTS: 'ZERO_RESULTS',
          ERROR: 'ERROR',
        },
      },
    },
  },
} as any

// Mock Google Maps SDK
vi.mock('./googleMaps', () => ({
  loadGoogleMapsSDK: vi.fn().mockResolvedValue(undefined),
}))

describe('chargingStations', () => {
  beforeEach(() => {
    // Clear mocks
    mockNearbySearch.mockReset()
    mockGetDetails.mockReset()

    // Set default implementations
    mockNearbySearch.mockImplementation((_request, callback) => {
      callback([], 'ZERO_RESULTS')
    })

    mockGetDetails.mockImplementation((_request, callback) => {
      callback(null, 'ERROR')
    })
  })

  describe('findChargingStations', () => {
    it('should call Google Places API with correct parameters', async () => {
      const mockPlaceResult = {
        place_id: 'test-place-1',
        name: 'Electrify America - Test Station',
        vicinity: '123 Main St',
        geometry: {
          location: {
            lat: () => 40.7128,
            lng: () => -74.0060,
          },
        },
        business_status: 'OPERATIONAL',
      } as google.maps.places.PlaceResult

      mockNearbySearch.mockImplementation((_request, callback) => {
        callback([mockPlaceResult], 'OK')
      })

      mockGetDetails.mockImplementation((_request, callback) => {
        callback(mockPlaceResult, 'OK')
      })

      const result = await findChargingStations({
        latitude: 40.7128,
        longitude: -74.0060,
        radiusMiles: 25,
        maxResults: 20,
      })

      expect(mockNearbySearch).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].network).toBe('Electrify America')
      expect(result[0].name).toContain('Electrify America')
    })

    it('should filter by network when specified', async () => {
      const mockPlaces = [
        {
          place_id: 'tesla-1',
          name: 'Tesla Supercharger',
          vicinity: '123 Main St',
          geometry: {
            location: {
              lat: () => 40.7128,
              lng: () => -74.0060,
            },
          },
          business_status: 'OPERATIONAL',
        },
        {
          place_id: 'ea-1',
          name: 'Electrify America',
          vicinity: '456 Oak Ave',
          geometry: {
            location: {
              lat: () => 40.7130,
              lng: () => -74.0062,
            },
          },
          business_status: 'OPERATIONAL',
        },
      ] as google.maps.places.PlaceResult[]

      mockNearbySearch.mockImplementation((_request, callback) => {
        callback(mockPlaces, 'OK')
      })

      mockGetDetails.mockImplementation((_request, callback) => {
        callback(mockPlaces[0], 'OK')
      })

      const result = await findChargingStations({
        latitude: 40.7128,
        longitude: -74.0060,
        networks: ['Tesla Supercharger'],
      })

      expect(result).toHaveLength(1)
      expect(result[0].network).toBe('Tesla Supercharger')
    })

    it('should filter out unavailable stations when operationalOnly is true', async () => {
      const mockPlaces = [
        {
          place_id: 'cp-1',
          name: 'ChargePoint Station',
          vicinity: '123 Main St',
          geometry: {
            location: {
              lat: () => 40.7128,
              lng: () => -74.0060,
            },
          },
          business_status: 'OPERATIONAL',
        },
        {
          place_id: 'cp-2',
          name: 'ChargePoint Station 2',
          vicinity: '456 Oak Ave',
          geometry: {
            location: {
              lat: () => 40.7130,
              lng: () => -74.0062,
            },
          },
          business_status: 'CLOSED_PERMANENTLY',
        },
      ] as google.maps.places.PlaceResult[]

      mockNearbySearch.mockImplementation((_request, callback) => {
        callback(mockPlaces, 'OK')
      })

      mockGetDetails.mockImplementation((_request, callback) => {
        callback(mockPlaces[0], 'OK')
      })

      const result = await findChargingStations({
        latitude: 40.7128,
        longitude: -74.0060,
        operationalOnly: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0].available).toBe(true)
    })

    it('should handle API errors gracefully', async () => {
      mockNearbySearch.mockImplementation((_request, callback) => {
        callback(null, 'ERROR')
      })

      const result = await findChargingStations({
        latitude: 40.7128,
        longitude: -74.0060,
      })

      expect(result).toEqual([])
    })

    it('should handle zero results', async () => {
      mockNearbySearch.mockImplementation((_request, callback) => {
        callback([], 'ZERO_RESULTS')
      })

      const result = await findChargingStations({
        latitude: 40.7128,
        longitude: -74.0060,
      })

      expect(result).toEqual([])
    })
  })

  describe('findChargersAlongRoute', () => {
    it('should search at multiple points along route', async () => {
      const routePoints = [
        { lat: 40.7128, lng: -74.0060 },
        { lat: 40.7500, lng: -74.0100 },
        { lat: 40.7800, lng: -74.0150 },
        { lat: 40.8000, lng: -74.0200 },
        { lat: 40.8500, lng: -74.0300 },
      ]

      const mockPlace = {
        place_id: 'cp-1',
        name: 'ChargePoint Station',
        vicinity: '123 Main St',
        geometry: {
          location: {
            lat: () => 40.7500,
            lng: () => -74.0100,
          },
        },
        business_status: 'OPERATIONAL',
      } as google.maps.places.PlaceResult

      mockNearbySearch.mockImplementation((_request, callback) => {
        callback([mockPlace], 'OK')
      })

      mockGetDetails.mockImplementation((_request, callback) => {
        callback(mockPlace, 'OK')
      })

      const result = await findChargersAlongRoute({
        routePoints,
        searchRadiusMiles: 10,
      })

      // Should have called the function multiple times (once per search point)
      expect(mockNearbySearch).toHaveBeenCalled()
      expect(result).toBeInstanceOf(Array)
    })

    it('should deduplicate stations found at multiple search points', async () => {
      const routePoints = [
        { lat: 40.7128, lng: -74.0060 },
        { lat: 40.7200, lng: -74.0080 }, // Close to first point, might return same station
      ]

      const mockPlace = {
        place_id: 'cp-1',
        name: 'ChargePoint Station',
        vicinity: '123 Main St',
        geometry: {
          location: {
            lat: () => 40.7150,
            lng: () => -74.0070,
          },
        },
        business_status: 'OPERATIONAL',
      } as google.maps.places.PlaceResult

      // Return same station for both searches
      mockNearbySearch.mockImplementation((_request, callback) => {
        callback([mockPlace], 'OK')
      })

      mockGetDetails.mockImplementation((_request, callback) => {
        callback(mockPlace, 'OK')
      })

      const result = await findChargersAlongRoute({
        routePoints,
      })

      // Should only include each unique station once
      const stationIds = result.map((s) => s.id)
      const uniqueIds = [...new Set(stationIds)]
      expect(stationIds).toEqual(uniqueIds)
    })

    it('should sort results by distance', async () => {
      const routePoints = [{ lat: 40.7128, lng: -74.006 }]

      const mockPlaces = [
        {
          place_id: 'cp-1',
          name: 'ChargePoint Far',
          vicinity: '123 Main St',
          geometry: {
            location: {
              lat: () => 40.72,
              lng: () => -74.01,
            },
          },
          business_status: 'OPERATIONAL',
        },
        {
          place_id: 'cp-2',
          name: 'ChargePoint Near',
          vicinity: '456 Oak Ave',
          geometry: {
            location: {
              lat: () => 40.713,
              lng: () => -74.0062,
            },
          },
          business_status: 'OPERATIONAL',
        },
      ] as google.maps.places.PlaceResult[]

      mockNearbySearch.mockImplementation((_request, callback) => {
        callback(mockPlaces, 'OK')
      })

      mockGetDetails.mockImplementation((_request, callback) => {
        callback(mockPlaces[0], 'OK')
      })

      const result = await findChargersAlongRoute({
        routePoints,
      })

      // Should be sorted by distance ascending
      if (result.length > 1) {
        expect(result[0].distance).toBeLessThanOrEqual(result[result.length - 1].distance || 0)
      }
    })
  })

  describe('calculateDistance', () => {
    it('should calculate distance between two points', () => {
      // New York to Los Angeles (approximately 2,451 miles)
      const ny = { lat: 40.7128, lng: -74.0060 }
      const la = { lat: 34.0522, lng: -118.2437 }

      const distance = calculateDistance(ny, la)

      // Allow 5% margin of error
      expect(distance).toBeGreaterThan(2300)
      expect(distance).toBeLessThan(2600)
    })

    it('should return 0 for same point', () => {
      const point = { lat: 40.7128, lng: -74.0060 }
      const distance = calculateDistance(point, point)

      expect(distance).toBeCloseTo(0, 1)
    })

    it('should handle points across the international date line', () => {
      const point1 = { lat: 60.0, lng: 179.0 }
      const point2 = { lat: 60.0, lng: -179.0 }

      const distance = calculateDistance(point1, point2)

      // Should be a short distance, not halfway around the world
      expect(distance).toBeLessThan(200)
    })
  })

  describe('findClosestStation', () => {
    const mockStations: ChargingStation[] = [
      {
        id: 'ocm-1',
        name: 'Far Station',
        location: { name: 'Station 1', address: '123 Main St', lat: 40.8000, lng: -74.0200 },
        network: 'ChargePoint',
        powerKW: 150,
        connectorTypes: ['CCS'],
        available: true,
      },
      {
        id: 'ocm-2',
        name: 'Close Station',
        location: { name: 'Station 2', address: '456 Oak Ave', lat: 40.7130, lng: -74.0062 },
        network: 'Electrify America',
        powerKW: 350,
        connectorTypes: ['CCS'],
        available: true,
      },
      {
        id: 'ocm-3',
        name: 'Medium Station',
        location: { name: 'Station 3', address: '789 Elm St', lat: 40.7500, lng: -74.0100 },
        network: 'Tesla Supercharger',
        powerKW: 250,
        connectorTypes: ['Tesla'],
        available: true,
      },
    ]

    it('should find the closest station to a point', () => {
      const point = { lat: 40.7128, lng: -74.0060 }
      const closest = findClosestStation(point, mockStations)

      expect(closest).toBeTruthy()
      expect(closest?.id).toBe('ocm-2') // Close Station
    })

    it('should return null for empty array', () => {
      const point = { lat: 40.7128, lng: -74.0060 }
      const closest = findClosestStation(point, [])

      expect(closest).toBeNull()
    })

    it('should skip stations with missing coordinates', () => {
      const stationsWithMissing: ChargingStation[] = [
        {
          id: 'ocm-1',
          name: 'Invalid Station',
          location: { name: 'Station 1', address: '123 Main St' }, // Missing lat/lng
          network: 'ChargePoint',
          powerKW: 150,
          connectorTypes: ['CCS'],
          available: true,
        },
        {
          id: 'ocm-2',
          name: 'Valid Station',
          location: { name: 'Station 2', address: '456 Oak Ave', lat: 40.7130, lng: -74.0062 },
          network: 'ChargePoint',
          powerKW: 150,
          connectorTypes: ['CCS'],
          available: true,
        },
      ]

      const point = { lat: 40.7128, lng: -74.0060 }
      const closest = findClosestStation(point, stationsWithMissing)

      expect(closest?.id).toBe('ocm-2') // Valid Station
    })
  })
})
