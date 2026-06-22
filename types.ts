export interface User {
  id: string;
  email: string;
  username: string;
  name: string;
  phone: string;
  avatarUrl: string;
  createdAt: string;
}

export type PropertyType = 'Apartment' | 'House' | 'Studio';
export type ListingStatus = 'Available' | 'Rented' | 'Sold';

export interface Property {
  id: string;
  title: string;
  description: string;
  price: number;
  city: string;
  country: string;
  propertyType: PropertyType;
  imageUrls: string[];
  ownerId: string;
  ownerName: string;
  ownerPhone?: string;
  ownerAvatar?: string;
  createdAt: string;
  status: ListingStatus;
  currencySymbol: string;
  currencyCode: string;
}

// Country config for pricing & localization
export interface CountryConfig {
  name: string;
  code: string; // ISO Code
  currencySymbol: string;
  currencyCode: string;
}

export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  { name: 'Cameroon', code: 'CM', currencySymbol: 'FCFA', currencyCode: 'XAF' },
  { name: 'United States', code: 'US', currencySymbol: '$', currencyCode: 'USD' },
  { name: 'United Kingdom', code: 'GB', currencySymbol: '£', currencyCode: 'GBP' },
  { name: 'France', code: 'FR', currencySymbol: '€', currencyCode: 'EUR' },
  { name: 'Germany', code: 'DE', currencySymbol: '€', currencyCode: 'EUR' },
  { name: 'Nigeria', code: 'NG', currencySymbol: '₦', currencyCode: 'NGN' },
  { name: 'Canada', code: 'CA', currencySymbol: 'CA$', currencyCode: 'CAD' },
  { name: 'Kenya', code: 'KE', currencySymbol: 'KSh', currencyCode: 'KES' },
  { name: 'South Africa', code: 'ZA', currencySymbol: 'R', currencyCode: 'ZAR' },
  { name: 'United Arab Emirates', code: 'AE', currencySymbol: 'AED', currencyCode: 'AED' },
  { name: 'India', code: 'IN', currencySymbol: '₹', currencyCode: 'INR' },
];

export interface AuthResponse {
  token: string;
  user: User;
}
