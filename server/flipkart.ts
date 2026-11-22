import { createHash } from "node:crypto";

type JsonRecord = Record<string, unknown>;

export function flipkartProductUrl(rawUrl: string): { url: URL; productId: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a complete Flipkart product URL, including https://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The Flipkart product link must use http or https.");
  }

  const host = url.hostname.toLowerCase();
  if ((host !== "flipkart.com" && !host.endsWith(".flipkart.com")) || url.username || url.password) {
    throw new Error("Use a product URL from flipkart.com.");
  }

  const pathProductId = url.pathname.match(/\/p\/([^/]+)/i)?.[1];
  if (!pathProductId) {
    throw new Error("Use a Flipkart product page URL, not a search or category link.");
  }

  const productId = url.searchParams.get("pid") || pathProductId;
  if (!/^[a-zA-Z0-9_-]{3,120}$/.test(productId)) {
    throw new Error("The Flipkart product link does not contain a valid product ID.");
  }
  return { url, productId };
}

function priceToMinor(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = String(value).match(/\d[\d,]*(?:\.\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpsUrlOrNull(value: unknown): string | null {
  const raw = stringOrNull(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mapScrapingdogProduct(
  payload: unknown,
  productUrl: string,
  observedAt = new Date().toISOString(),
): unknown {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Scrapingdog returned an unexpected product response.");
  }
  const product = (payload as JsonRecord).product_results;
  if (typeof product !== "object" || product === null || Array.isArray(product)) {
    throw new Error("Scrapingdog's response did not contain the documented product_results object.");
  }
  const result = product as JsonRecord;
  const title = stringOrNull(result.title);
  if (!title) {
    throw new Error("Scrapingdog's product response did not include a product title.");
  }

  const parsedUrl = flipkartProductUrl(productUrl);
  const priceMinor = priceToMinor(result.price);
  const observations = priceMinor === null
    ? []
    : [{
        id: `${parsedUrl.productId}:${observedAt}`,
        observedAt,
        priceMinor,
        mrpMinor: priceToMinor(result.previous_price),
        currency: "INR",
        inStock: null,
      }];

  return {
    id: `flipkart-${createHash("sha256").update(parsedUrl.productId).digest("hex").slice(0, 20)}`,
    source: "scrapingdog",
    title,
    brand: stringOrNull(result.brand),
    retailer: "Flipkart",
    retailerSku: parsedUrl.productId,
    imageUrl: httpsUrlOrNull(result.main_image),
    productUrl: parsedUrl.url.toString(),
    priceMinor,
    mrpMinor: priceToMinor(result.previous_price),
    currency: "INR",
    inStock: null,
    observedAt: priceMinor === null ? null : observedAt,
    observations,
  };
}
