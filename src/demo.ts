import type { Product, PriceObservation } from "./types";

function observations(prices: number[]): PriceObservation[] {
  return prices.map((price, index) => {
    const observed = new Date();
    observed.setDate(observed.getDate() - (prices.length - index - 1) * 4);
    return {
      id: `demo-${index}`,
      observedAt: observed.toISOString(),
      priceMinor: price * 100,
      mrpMinor: 12999 * 100,
      currency: "INR",
      inStock: true,
    };
  });
}

export const demoProducts: Product[] = [
  {
    id: "demo-everyday-sneakers",
    source: "demo",
    title: "Court Classic Everyday Sneakers",
    brand: "Northstar",
    retailer: "Myntra",
    retailerSku: "DEMO-1042",
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=85",
    productUrl: null,
    priceMinor: 649900,
    mrpMinor: 999900,
    currency: "INR",
    inStock: true,
    observedAt: new Date().toISOString(),
    observations: observations([8999, 7999, 8499, 7299, 6999, 7499, 6499, 6499]),
  },
  {
    id: "demo-wireless-headphones",
    source: "demo",
    title: "Studio Wireless Headphones",
    brand: "Soundcore",
    retailer: "Flipkart",
    retailerSku: "DEMO-2057",
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=85",
    productUrl: null,
    priceMinor: 529900,
    mrpMinor: 799900,
    currency: "INR",
    inStock: true,
    observedAt: new Date().toISOString(),
    observations: observations([6999, 6499, 5999, 6499, 5799, 5499, 5699, 5299]),
  },
  {
    id: "demo-carryall-tote",
    source: "demo",
    title: "Everyday Carryall Tote",
    brand: "Urban Edit",
    retailer: "Amazon",
    retailerSku: "DEMO-3218",
    imageUrl:
      "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=800&q=85",
    productUrl: null,
    priceMinor: 219900,
    mrpMinor: 349900,
    currency: "INR",
    inStock: true,
    observedAt: new Date().toISOString(),
    observations: observations([2499, 2399, 2299, 2499, 2199, 2299, 2199, 2199]),
  },
];
