import type { ApiStatus, CatalogPage, Product } from "./types";

async function responseJson<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response.");
  }
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

export async function getApiStatus(): Promise<ApiStatus> {
  const response = await fetch("/api/status");
  return responseJson<ApiStatus>(response);
}

export async function lookupProduct(input: {
  url?: string;
  retailerSku?: string;
}): Promise<Product> {
  const response = await fetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return responseJson<Product>(response);
}

export async function getRewaltoCatalog(cursor: string | null): Promise<CatalogPage> {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/catalog${query.size ? `?${query.toString()}` : ""}`);
  return responseJson<CatalogPage>(response);
}

export function validateProductUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return "Paste a complete product link, including https://.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Use a secure http:// or https:// product link.";
  }
  if (!parsed.hostname.includes(".")) {
    return "That does not look like a valid product link.";
  }
  return null;
}
