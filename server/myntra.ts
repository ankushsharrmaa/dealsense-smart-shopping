import { URL } from "node:url";

export function skuFromMyntraUrl(rawUrl: string): { sku: string; url: URL } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a complete product URL, including https://.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The product link must use http or https.");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "myntra.com" && !host.endsWith(".myntra.com")) {
    const retailer = host.includes("flipkart")
      ? "Flipkart"
      : host.includes("amazon")
        ? "Amazon"
        : host.includes("ajio")
          ? "AJIO"
          : host;
    throw new Error(
      `${retailer} is not available in Rewalto's configured data source. Real price lookup currently supports Myntra only.`,
    );
  }

  const querySku = ["skuId", "sku", "productId"]
    .map((key) => url.searchParams.get(key))
    .find((value) => value !== null && value.length > 0);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const pathSku = pathSegments
    .reverse()
    .find((segment) => /^\d{6,}$/.test(segment));
  const slugSku = url.pathname.match(/-(\d{6,})(?:\/|$)/)?.[1];
  const sku = querySku ?? pathSku ?? slugSku;

  if (!sku || !/^[a-zA-Z0-9_-]{3,80}$/.test(sku)) {
    throw new Error(
      "This Myntra URL does not contain a readable product ID. Open the Myntra product page and use its product ID in the search below.",
    );
  }
  return { sku, url };
}
