import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { flipkartProductUrl, mapScrapingdogProduct } from "./flipkart.ts";
import { skuFromMyntraUrl } from "./myntra.ts";

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const port = Number(process.env.PORT ?? 8787);
const apiKey = process.env.REWALTO_API_KEY?.trim();
const scrapingdogApiKey = process.env.SCRAPINGDOG_API_KEY?.trim();
const apiBase = "https://api.rewalto.com";
const distRoot = resolve("dist");
const catalogPageSize = 20;
const historyPageSize = 100;

type JsonRecord = Record<string, unknown>;

interface Listing {
  id?: string;
  retailer?: string;
  retailerSku?: string;
  title?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  images?: Array<{ url?: string }>;
  url?: string | null;
  productId?: string | null;
  firstSeen?: string;
  lastSeen?: string;
  latest?: {
    priceMinor?: number | null;
    mrpMinor?: number | null;
    currency?: string;
    inStock?: boolean | null;
    observedAt?: string;
  } | null;
}

interface Observation {
  id: number;
  retailerSku: string;
  observedAt: string;
  priceMinor: number | null;
  mrpMinor: number | null;
  currency: string;
  inStock: boolean | null;
  sourceUrl?: string | null;
}

interface ApiPage<T> {
  data: T[];
  page?: { nextCursor?: string | null };
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1_000_000) {
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected an object");
    }
    return parsed as JsonRecord;
  } catch {
    throw new HttpError(400, "Send a valid JSON request.");
  }
}

async function rewaltoGet<T>(path: string, query: URLSearchParams): Promise<T> {
  if (!apiKey) {
    throw new HttpError(503, "Real API mode is not configured. Add REWALTO_API_KEY to the server .env file.");
  }
  const response = await fetch(`${apiBase}${path}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "Rewalto returned an unreadable response.");
  }

  if (!response.ok) {
    const error =
      typeof payload === "object" && payload !== null
        ? (payload as { error?: { code?: string; message?: string } }).error
        : undefined;
    const detail = error?.message ?? error?.code ?? `HTTP ${response.status}`;
    const guidance =
      response.status === 401
        ? " Check that the Rewalto API key is valid."
        : response.status === 402
          ? " The Rewalto account may need credits or a plan."
          : response.status === 403
            ? " The key may be missing the required data scope."
            : "";
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      `Rewalto request failed (${detail}).${guidance}`,
    );
  }

  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as ApiPage<unknown>).data)) {
    throw new HttpError(502, "Rewalto's response did not contain the documented data array.");
  }
  return payload as T;
}

async function lookupProduct(sku: string, sourceUrl: string | null): Promise<unknown> {
  const listingQuery = new URLSearchParams({
    retailer: "myntra",
    retailerSku: sku,
    limit: "1",
  });
  const listingPage = await rewaltoGet<ApiPage<Listing>>("/v1/data/listings", listingQuery);
  const listing = listingPage.data[0];
  if (!listing) {
    throw new HttpError(
      404,
      `No Rewalto listing was found for Myntra product ID ${sku}. The product may not be in Rewalto's dataset.`,
    );
  }

  const observations: Observation[] = [];
  const observationQuery = new URLSearchParams({
    retailer: "myntra",
    retailerSku: sku,
    limit: String(historyPageSize),
  });
  if (listing.firstSeen && !Number.isNaN(Date.parse(listing.firstSeen))) {
    observationQuery.set("from", listing.firstSeen);
  }
  const observationPage = await rewaltoGet<ApiPage<Observation>>(
    "/v1/data/observations",
    observationQuery,
  );
  observations.push(...observationPage.data);
  const historyTruncated = Boolean(observationPage.page?.nextCursor);

  observations.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const latestObservation = observations.at(-1);
  const latest = listing.latest;
  const priceMinor = latestObservation?.priceMinor ?? latest?.priceMinor ?? null;
  const mrpMinor = latestObservation?.mrpMinor ?? latest?.mrpMinor ?? null;

  return {
    id: listing.productId ?? listing.id ?? `myntra-${sku}`,
    source: "rewalto",
    title: listing.title ?? "Myntra product",
    brand: listing.brand ?? null,
    retailer: "Myntra",
    retailerSku: listing.retailerSku ?? sku,
    imageUrl: listing.imageUrl ?? listing.images?.[0]?.url ?? null,
    productUrl: listing.url ?? sourceUrl,
    priceMinor,
    mrpMinor,
    currency: latestObservation?.currency ?? latest?.currency ?? "INR",
    inStock: latestObservation?.inStock ?? latest?.inStock ?? null,
    observedAt: latestObservation?.observedAt ?? latest?.observedAt ?? listing.firstSeen ?? null,
    observations,
    historyTruncated,
  };
}

async function lookupFlipkartProduct(rawUrl: string): Promise<unknown> {
  let parsed: ReturnType<typeof flipkartProductUrl>;
  try {
    parsed = flipkartProductUrl(rawUrl);
  } catch (error) {
    throw new HttpError(422, error instanceof Error ? error.message : "The Flipkart product URL could not be read.");
  }
  if (!scrapingdogApiKey) {
    throw new HttpError(
      503,
      "Flipkart real lookup is not configured. Add SCRAPINGDOG_API_KEY to the server environment.",
    );
  }

  const query = new URLSearchParams({
    api_key: scrapingdogApiKey,
    url: parsed.url.toString(),
  });
  let response: Response;
  try {
    response = await fetch(`https://api.scrapingdog.com/flipkart/product?${query.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new HttpError(504, "Scrapingdog did not respond in time. Please try again later.");
    }
    throw new HttpError(502, "Could not connect to Scrapingdog. Please try again later.");
  }

  if (!response.ok) {
    const guidance = response.status === 401 || response.status === 403
      ? " Check that the Scrapingdog key is valid and has API credits."
      : response.status === 429
        ? " The Scrapingdog account may have reached its request limit."
        : "";
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      `Scrapingdog request failed (HTTP ${response.status}).${guidance}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "Scrapingdog returned an unreadable response.");
  }
  try {
    return mapScrapingdogProduct(payload, parsed.url.toString());
  } catch (error) {
    throw new HttpError(502, error instanceof Error ? error.message : "Scrapingdog returned an unexpected product response.");
  }
}

async function listProducts(cursor: string | null): Promise<unknown> {
  const query = new URLSearchParams({
    retailer: "myntra",
    limit: String(catalogPageSize),
  });
  if (cursor) query.set("cursor", cursor);

  const page = await rewaltoGet<ApiPage<Listing>>("/v1/data/listings", query);
  const products = page.data.map((listing) => {
    if (!listing.retailerSku) {
      throw new HttpError(502, "Rewalto returned a listing without its documented retailerSku.");
    }
    return {
      id: listing.productId ?? listing.id ?? `myntra-${listing.retailerSku}`,
      source: "rewalto",
      title: listing.title ?? `Myntra product ${listing.retailerSku}`,
      brand: listing.brand ?? null,
      retailer: "Myntra",
      retailerSku: listing.retailerSku,
      imageUrl: listing.imageUrl ?? listing.images?.[0]?.url ?? null,
      productUrl: listing.url ?? null,
      priceMinor: listing.latest?.priceMinor ?? null,
      mrpMinor: listing.latest?.mrpMinor ?? null,
      currency: listing.latest?.currency ?? "INR",
      inStock: listing.latest?.inStock ?? null,
      observedAt: listing.latest?.observedAt ?? listing.lastSeen ?? null,
      observations: [],
    };
  });

  return {
    data: products,
    page: { nextCursor: page.page?.nextCursor ?? null },
  };
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<boolean> {
  const candidate = resolve(distRoot, `.${decodeURIComponent(pathname)}`);
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${sep}`)) return false;
  let filePath = candidate;
  try {
    const details = await stat(filePath);
    if (details.isDirectory()) filePath = resolve(filePath, "index.html");
    await stat(filePath);
  } catch {
    filePath = resolve(distRoot, "index.html");
    if (!existsSync(filePath)) return false;
  }
  response.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath).pipe(response);
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      sendJson(response, 200, {
        configured: Boolean(apiKey),
        provider: "Rewalto",
        rewaltoConfigured: Boolean(apiKey),
        scrapingdogConfigured: Boolean(scrapingdogApiKey),
        supportedRetailers: ["myntra", "flipkart"],
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/catalog") {
      const cursor = url.searchParams.get("cursor");
      if (cursor && (cursor.length > 2000 || /[\u0000-\u001f]/.test(cursor))) {
        throw new HttpError(400, "The Rewalto page cursor is invalid.");
      }
      sendJson(response, 200, await listProducts(cursor));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/lookup") {
      const body = await readJson(request);
      const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
      const requestedSku =
        typeof body.retailerSku === "string" ? body.retailerSku.trim() : "";
      if (rawUrl) {
        let host: string;
        try {
          host = new URL(rawUrl).hostname.toLowerCase();
        } catch {
          throw new HttpError(422, "Enter a complete product URL, including https://.");
        }
        if (host === "flipkart.com" || host.endsWith(".flipkart.com")) {
          sendJson(response, 200, await lookupFlipkartProduct(rawUrl));
          return;
        }
      }
      let sku = requestedSku;
      let sourceUrl: string | null = null;

      if (rawUrl) {
        let parsed: ReturnType<typeof skuFromMyntraUrl>;
        try {
          parsed = skuFromMyntraUrl(rawUrl);
        } catch (error) {
          throw new HttpError(422, error instanceof Error ? error.message : "The Myntra URL could not be read.");
        }
        sku = parsed.sku;
        sourceUrl = parsed.url.toString();
      } else if (!/^[a-zA-Z0-9_-]{3,80}$/.test(sku)) {
        throw new HttpError(400, "Enter a valid product URL or Myntra product ID.");
      }

      if (!apiKey) {
        throw new HttpError(503, "Real API mode is not configured. Add REWALTO_API_KEY to the server .env file.");
      }
      sendJson(response, 200, await lookupProduct(sku, sourceUrl));
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API route not found." });
      return;
    }
    if (request.method === "GET" && (await serveStatic(url.pathname, response))) {
      return;
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    if (status >= 500) console.error("Request failed:", message);
    if (!response.headersSent) sendJson(response, status, { error: message });
  }
});

server.listen(port, () => {
  console.log(`DealSense API listening on http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error("Could not start DealSense API:", error.message);
  process.exitCode = 1;
});
