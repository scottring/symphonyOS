// src/apps/home/assetTypes.ts
// Per-type extra fields rendered in the asset detail view.
// Adding a new type later = one file change here.
import type { AssetType } from '@/types/home'

export type FieldType = 'text' | 'number' | 'date'

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  placeholder?: string
}

export const ASSET_TYPE_FIELDS: Record<AssetType, FieldConfig[]> = {
  appliance: [
    { key: 'energy_rating', label: 'Energy rating', type: 'text', placeholder: 'A++' },
    { key: 'last_filter_change', label: 'Last filter change', type: 'date' },
  ],
  vehicle: [
    { key: 'vin', label: 'VIN', type: 'text' },
    { key: 'license_plate', label: 'License plate', type: 'text' },
    { key: 'mileage', label: 'Mileage', type: 'number' },
  ],
  electronics: [
    { key: 'model_number', label: 'Model number', type: 'text' },
  ],
  furniture: [],
  fixture: [],
  tool: [],
  collection: [],
  other: [],
}
