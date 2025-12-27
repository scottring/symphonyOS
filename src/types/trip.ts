/**
 * Trip Planning Types
 * Types for EV trip planning, packing lists, and travel optimization
 */

// ============================================================================
// Location Types
// ============================================================================

export interface Location {
  name: string
  address: string
  placeId?: string
  lat?: number
  lng?: number
}

// ============================================================================
// Trip Metadata
// ============================================================================

export type TravelMode = 'driving_ev' | 'driving' | 'flying' | 'train'

// ============================================================================
// Trip Segments (Multi-Modal Trips)
// ============================================================================

export type SegmentType = 'driving_ev' | 'driving_rental' | 'flying' | 'train' | 'other'
export type AccommodationType = 'hotel' | 'airbnb' | 'family' | 'other'
export type TransportationLogisticType = 'airport_parking' | 'rental_pickup' | 'rental_dropoff' | 'other'

export interface TripSegment {
  id: string
  type: SegmentType
  origin: Location
  destination: Location
  date: string // ISO date string
  time?: string // Optional time (e.g., "08:00")

  // EV driving specific
  evVehicle?: {
    model: string
    batteryCapacity: number
    rangePerCharge: number
    currentBattery: number
    preferredNetworks?: ChargingNetwork[]
  }

  // Rental car specific
  rentalCar?: {
    company?: string
    confirmationNumber?: string
    pickupLocation?: Location
    dropoffLocation?: Location
  }

  // Flight specific
  flight?: {
    airline?: string
    flightNumber?: string
    confirmationNumber?: string
    departureTime?: string
    arrivalTime?: string
  }

  // Train specific
  train?: {
    line?: string
    trainNumber?: string
    confirmationNumber?: string
    departureTime?: string
    arrivalTime?: string
  }

  notes?: string
}

export interface Accommodation {
  id: string
  type: AccommodationType
  name: string
  location: Location
  checkIn: string // ISO date string
  checkOut: string // ISO date string
  confirmationNumber?: string
  address?: string
  phone?: string
  notes?: string
}

export interface TransportationLogistic {
  id: string
  type: TransportationLogisticType
  description: string
  location: Location
  date: string // ISO date string
  time?: string
  confirmationNumber?: string
  notes?: string
}

// ============================================================================
// Unified Trip Event (for chronological timeline)
// ============================================================================

export type TripEventType =
  | 'flight'
  | 'train'
  | 'driving_ev'
  | 'driving_rental'
  | 'hotel'
  | 'airbnb'
  | 'family_stay'
  | 'airport_parking'
  | 'rental_pickup'
  | 'rental_dropoff'
  | 'other'

export interface BaseTripEvent {
  id: string
  eventType: TripEventType
  date: string // ISO date string
  time?: string
  notes?: string
}

export interface FlightEvent extends BaseTripEvent {
  eventType: 'flight'
  origin: Location
  destination: Location
  airline?: string
  flightNumber?: string
  confirmationNumber?: string
  departureTime?: string
  arrivalTime?: string
}

export interface TrainEvent extends BaseTripEvent {
  eventType: 'train'
  origin: Location
  destination: Location
  line?: string
  trainNumber?: string
  confirmationNumber?: string
  departureTime?: string
  arrivalTime?: string
}

export interface DrivingEVEvent extends BaseTripEvent {
  eventType: 'driving_ev'
  origin: Location
  destination: Location
  evVehicle?: {
    model: string
    batteryCapacity: number
    rangePerCharge: number
    currentBattery: number
    preferredNetworks?: ChargingNetwork[]
  }
}

export interface DrivingRentalEvent extends BaseTripEvent {
  eventType: 'driving_rental'
  origin: Location
  destination: Location
  rentalCar?: {
    company?: string
    confirmationNumber?: string
    pickupLocation?: Location
    dropoffLocation?: Location
  }
}

export interface HotelEvent extends BaseTripEvent {
  eventType: 'hotel'
  name: string
  location: Location
  checkIn: string
  checkOut: string
  confirmationNumber?: string
  address?: string
  phone?: string
}

export interface AirbnbEvent extends BaseTripEvent {
  eventType: 'airbnb'
  name: string
  location: Location
  checkIn: string
  checkOut: string
  confirmationNumber?: string
  address?: string
  phone?: string
}

export interface FamilyStayEvent extends BaseTripEvent {
  eventType: 'family_stay'
  name: string
  location: Location
  checkIn: string
  checkOut: string
  address?: string
  phone?: string
}

export interface AirportParkingEvent extends BaseTripEvent {
  eventType: 'airport_parking'
  description: string
  location: Location
  confirmationNumber?: string
}

export interface RentalPickupEvent extends BaseTripEvent {
  eventType: 'rental_pickup'
  description: string
  location: Location
  confirmationNumber?: string
}

export interface RentalDropoffEvent extends BaseTripEvent {
  eventType: 'rental_dropoff'
  description: string
  location: Location
  confirmationNumber?: string
}

export interface OtherEvent extends BaseTripEvent {
  eventType: 'other'
  description: string
  location?: Location
  confirmationNumber?: string
}

export type TripEvent =
  | FlightEvent
  | TrainEvent
  | DrivingEVEvent
  | DrivingRentalEvent
  | HotelEvent
  | AirbnbEvent
  | FamilyStayEvent
  | AirportParkingEvent
  | RentalPickupEvent
  | RentalDropoffEvent
  | OtherEvent

// New TripMetadata supporting both simple and multi-segment trips
export interface TripMetadata {
  startDate: string // ISO date string
  endDate: string // ISO date string

  // Simple trip mode (backwards compatible)
  origin: Location
  destination: Location
  waypoints?: Location[] // Optional stops between origin and destination
  travelMode: TravelMode

  // EV-specific fields (for simple trips)
  vehicleModel?: string
  batteryCapacity?: number // kWh
  rangePerCharge?: number // miles
  currentBattery?: number // percentage (0-100)
  preferredNetworks?: ChargingNetwork[]

  // Multi-segment trip mode (new)
  segments?: TripSegment[]
  accommodations?: Accommodation[]
  logistics?: TransportationLogistic[]
  isMultiSegment?: boolean // Flag to indicate multi-segment trip

  // Unified timeline mode (replaces segments/accommodations/logistics)
  events?: TripEvent[] // Chronologically sorted trip events
  useUnifiedTimeline?: boolean // Flag to use unified timeline instead of separate arrays

  // Packing list (preserves template structure with headings)
  packingList?: PackingNode[] // Structured packing list from templates
}

// ============================================================================
// Charging Station Types
// ============================================================================

export type ChargingNetwork =
  | 'Tesla Supercharger'
  | 'Electrify America'
  | 'ChargePoint'
  | 'EVgo'
  | 'Blink'
  | 'Other'

export interface ChargingStation {
  id: string
  name: string
  location: Location
  network: ChargingNetwork
  powerKW: number // Charging power in kilowatts
  connectorTypes: string[]
  available: boolean
  distance?: number // Distance from route in miles
}

export interface ChargingStop {
  stationId: string
  station: ChargingStation
  arrivalBattery: number // % battery on arrival
  departureBattery: number // % battery after charging
  chargeTime: number // minutes
  arrivalTime?: Date
  departureTime?: Date
}

// ============================================================================
// EV Route Calculation
// ============================================================================

export interface EVRouteParams {
  origin: Location
  destination: Location
  waypoints?: Location[]
  vehicleRange: number // miles per full charge
  currentBattery: number // percentage
  minBattery?: number // minimum safe battery % (default 20)
  maxBattery?: number // optimal charge limit % (default 80)
  preferredNetworks?: ChargingNetwork[]
}

export interface EVRouteResult {
  totalDistance: number // miles
  totalDuration: number // minutes (including charging time)
  drivingDuration: number // minutes (driving only)
  chargingDuration: number // minutes (charging only)
  chargingStops: ChargingStop[] // Required charging stops
  availableStations?: ChargingStation[] // All charging stations along route (optional)
  legs: RouteLeg[]
}

export interface RouteLeg {
  from: Location
  to: Location
  distance: number // miles
  duration: number // minutes
  batteryUsed: number // percentage
  type: 'driving' | 'charging'
}

// ============================================================================
// Packing List Types
// ============================================================================

/**
 * Simplified packing list structure: just headings and checklist items
 */
export type PackingNode =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'item'; text: string; checked?: boolean }

/**
 * Legacy types - kept for backward compatibility
 * @deprecated Use PackingNode instead
 */
export type PackingCategory =
  | 'clothing'
  | 'toiletries'
  | 'electronics'
  | 'documents'
  | 'health'
  | 'ev_equipment'
  | 'food_drinks'
  | 'recreation'
  | 'other'

export interface PackingItem {
  name: string
  category: PackingCategory
  quantity?: number
  essential: boolean
  for_person?: string
}

export type PackingTemplate =
  | 'weekend'
  | 'week'
  | 'ev_road_trip'
  | 'beach'
  | 'ski'
  | 'business'
  | 'camping'
  | 'cold_weather'

// ============================================================================
// Vehicle Presets
// ============================================================================

export interface EVVehicle {
  model: string
  manufacturer: string
  batteryCapacity: number // kWh
  rangeEPA: number // miles (EPA estimate)
  chargingNetworks: ChargingNetwork[]
}

export const EV_VEHICLES: EVVehicle[] = [
  {
    model: 'Model 3 Long Range',
    manufacturer: 'Tesla',
    batteryCapacity: 82,
    rangeEPA: 358,
    chargingNetworks: ['Tesla Supercharger', 'ChargePoint', 'Electrify America'],
  },
  {
    model: 'Model Y Long Range',
    manufacturer: 'Tesla',
    batteryCapacity: 81,
    rangeEPA: 330,
    chargingNetworks: ['Tesla Supercharger', 'ChargePoint', 'Electrify America'],
  },
  {
    model: 'Model S',
    manufacturer: 'Tesla',
    batteryCapacity: 100,
    rangeEPA: 405,
    chargingNetworks: ['Tesla Supercharger', 'ChargePoint', 'Electrify America'],
  },
  {
    model: 'Model X',
    manufacturer: 'Tesla',
    batteryCapacity: 100,
    rangeEPA: 348,
    chargingNetworks: ['Tesla Supercharger', 'ChargePoint', 'Electrify America'],
  },
  {
    model: 'Mustang Mach-E',
    manufacturer: 'Ford',
    batteryCapacity: 91,
    rangeEPA: 312,
    chargingNetworks: ['Electrify America', 'ChargePoint', 'EVgo'],
  },
  {
    model: 'ID.4',
    manufacturer: 'Volkswagen',
    batteryCapacity: 82,
    rangeEPA: 275,
    chargingNetworks: ['Electrify America', 'ChargePoint', 'EVgo'],
  },
  {
    model: 'EV6',
    manufacturer: 'Kia',
    batteryCapacity: 77.4,
    rangeEPA: 310,
    chargingNetworks: ['Electrify America', 'ChargePoint', 'EVgo'],
  },
  {
    model: 'Ioniq 5',
    manufacturer: 'Hyundai',
    batteryCapacity: 77.4,
    rangeEPA: 303,
    chargingNetworks: ['Electrify America', 'ChargePoint', 'EVgo'],
  },
  {
    model: 'Rivian R1T',
    manufacturer: 'Rivian',
    batteryCapacity: 135,
    rangeEPA: 314,
    chargingNetworks: ['Electrify America', 'ChargePoint', 'EVgo'],
  },
]
