export {
  PRIME_SERVICE_CATALOG,
  PRIME_SERVICE_CATALOG_UI,
  PRIME_SERVICE_CATALOG_PRICING,
  PRIME_SERVICE_IDS,
  PRIME_SERVICE_TYPES,
  CORPORATIVO_UI_ENTRY,
  CORPORATIVO_PRICING_KEYS,
  getPrimeServiceCatalogEntry,
  getPrimeServiceCatalogPricingEntry,
  normalizePrimeServiceType,
  primeServiceTypeLabel,
  maxPassengersForService,
  resolveCorporativoBandeiraKey,
  corporativoBandeiraOperatorLabel
} from "@/lib/pricing/prime-service-catalog";
export type {
  PrimeServiceCatalogEntry,
  PrimeServiceIcon,
  PrimeServiceTypeId
} from "@/lib/pricing/prime-service-catalog";
