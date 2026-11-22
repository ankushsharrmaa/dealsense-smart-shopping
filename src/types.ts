export type AppPage = "home" | "tracked" | "about" | "settings";
export type PriceRange = "7D" | "30D" | "90D" | "ALL";
export type DataMode = "demo" | "real";

export interface PriceObservation {
  id: number | string;
  observedAt: string;
  priceMinor: number | null;
  mrpMinor?: number | null;
  currency?: string;
  inStock?: boolean | null;
}

export interface Product {
  id: string;
  source: "demo" | "rewalto" | "scrapingdog";
  title: string;
  brand: string | null;
  retailer: string;
  retailerSku?: string;
  imageUrl: string | null;
  productUrl: string | null;
  priceMinor: number | null;
  mrpMinor: number | null;
  currency: string;
  inStock: boolean | null;
  observedAt: string | null;
  observations: PriceObservation[];
  historyTruncated?: boolean;
}

export interface ApiStatus {
  configured: boolean;
  provider: string;
  supportedRetailers: string[];
  rewaltoConfigured: boolean;
  scrapingdogConfigured: boolean;
}

export interface CatalogPage {
  data: Product[];
  page: {
    nextCursor: string | null;
  };
}
