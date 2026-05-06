// src/types/home.ts
// Types for the Home app (Phase 1A).
// See docs/superpowers/specs/2026-05-06-home-app-phase-1a-design.md

export type SpaceType = 'room' | 'zone'

export type AssetKind = 'item' | 'collection'

export type AssetType =
  | 'appliance'
  | 'vehicle'
  | 'electronics'
  | 'furniture'
  | 'fixture'
  | 'tool'
  | 'collection'
  | 'other'

export type FactType = 'wifi' | 'paint' | 'code' | 'supply' | 'measurement' | 'freetext'

export type Domain = 'work' | 'family' | 'personal'

export interface Home {
  id: string
  userId: string
  name: string
  address?: string
  createdAt: Date
  updatedAt: Date
}

export interface Fact {
  type: FactType
  label: string
  value: string
}

export interface Space {
  id: string
  homeId: string
  parentSpaceId: string | null
  spaceType: SpaceType
  name: string
  photoUrl?: string
  sortOrder: number
  facts: Fact[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface Asset {
  id: string
  homeId: string
  spaceId: string | null
  assetKind: AssetKind
  assetType: AssetType
  name: string
  photoUrl?: string
  purchaseDate?: string  // YYYY-MM-DD
  purchasePrice?: number
  warrantyExpiresAt?: string  // YYYY-MM-DD
  serialNumber?: string
  manualUrl?: string
  tags: string[]
  details: Record<string, unknown>
  notesId: string | null
  domain: Domain
  needsDetails: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// Display helpers
export function assetTypeLabel(t: AssetType): string {
  switch (t) {
    case 'appliance': return 'Appliance'
    case 'vehicle': return 'Vehicle'
    case 'electronics': return 'Electronics'
    case 'furniture': return 'Furniture'
    case 'fixture': return 'Fixture'
    case 'tool': return 'Tool'
    case 'collection': return 'Collection'
    case 'other': return 'Other'
  }
}

export function factTypeLabel(t: FactType): string {
  switch (t) {
    case 'wifi': return 'WiFi'
    case 'paint': return 'Paint'
    case 'code': return 'Code / Combo'
    case 'supply': return 'Supply / Spec'
    case 'measurement': return 'Measurement'
    case 'freetext': return 'Note'
  }
}
