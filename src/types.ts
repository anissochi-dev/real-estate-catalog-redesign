export type PropertyType = 'office' | 'retail' | 'warehouse' | 'restaurant' | 'business' | 'production' | 'hotel' | 'gab';
export type DealType = 'sale' | 'rent' | 'business';

export interface Property {
  id: number;
  title: string;
  type: PropertyType;
  deal: DealType;
  address: string;
  district: string;
  area: number;
  price: number;
  pricePerM2?: number;
  payback?: number;
  profit?: number;
  image: string;
  image_thumb?: string;
  tags: string[];
  description: string;
  floor?: number;
  totalFloors?: number;
  lat: number;
  lng: number;
  isHot?: boolean;
  isNew?: boolean;
  isExclusive?: boolean;
  isUrgent?: boolean;
  publicCode?: number;
  tenantName?: string;
  monthlyRent?: number;
  yearlyRent?: number;
  purpose?: string;
  finishing?: string;
  ceilingHeight?: number;
  electricityKw?: number;
  utilities?: string;
  roadLine?: string;
  landArea?: number | null;
  updatedAt?: string;
  createdAt?: string;
  lastEditedAt?: string;
}

export type Page = 'home' | 'catalog' | 'map' | 'favorites' | 'compare' | 'network-tenants' | 'news';
export type AppView = 'site' | 'login' | 'admin';