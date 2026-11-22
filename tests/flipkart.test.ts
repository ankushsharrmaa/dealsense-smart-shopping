import assert from "node:assert/strict";
import test from "node:test";
import { flipkartProductUrl, mapScrapingdogProduct } from "../server/flipkart";

test("accepts Flipkart product links and extracts the product ID", () => {
  const parsed = flipkartProductUrl(
    "https://www.flipkart.com/samsung-monitor/p/itm909c8202e1864?pid=MON909",
  );
  assert.equal(parsed.productId, "MON909");
  assert.equal(parsed.url.hostname, "www.flipkart.com");
});

test("rejects non-Flipkart hosts and non-product pages", () => {
  assert.throws(() => flipkartProductUrl("https://flipkart.com.attacker.example/item/p/itm123"), /flipkart\.com/i);
  assert.throws(() => flipkartProductUrl("https://www.flipkart.com/search?q=monitor"), /product page/i);
});

test("maps the documented response and records only the observed current price", () => {
  const result = mapScrapingdogProduct(
    {
      product_results: {
        title: "Samsung Monitor",
        brand: "Samsung",
        price: "₹8,999",
        previous_price: "₹14,500",
        main_image: "https://rukminim2.flixcart.com/image/monitor.jpeg",
      },
    },
    "https://www.flipkart.com/samsung-monitor/p/itm909c8202e1864",
    "2026-03-10T12:00:00.000Z",
  ) as {
    source: string;
    priceMinor: number;
    mrpMinor: number;
    observedAt: string;
    observations: Array<{ priceMinor: number; observedAt: string }>;
  };

  assert.equal(result.source, "scrapingdog");
  assert.equal(result.priceMinor, 899900);
  assert.equal(result.mrpMinor, 1450000);
  assert.equal(result.observedAt, "2026-03-10T12:00:00.000Z");
  assert.deepEqual(result.observations, [{
    id: "itm909c8202e1864:2026-03-10T12:00:00.000Z",
    observedAt: "2026-03-10T12:00:00.000Z",
    priceMinor: 899900,
    mrpMinor: 1450000,
    currency: "INR",
    inStock: null,
  }]);
});

test("rejects malformed Scrapingdog product responses", () => {
  assert.throws(() => mapScrapingdogProduct({}, "https://www.flipkart.com/item/p/itm123"), /product_results/i);
});

test("does not create an observation when the provider has no usable price", () => {
  const result = mapScrapingdogProduct(
    { product_results: { title: "Price unavailable", price: "Currently unavailable" } },
    "https://www.flipkart.com/item/p/itm123",
    "2026-03-10T12:00:00.000Z",
  ) as { priceMinor: number | null; observedAt: string | null; observations: unknown[] };
  assert.equal(result.priceMinor, null);
  assert.equal(result.observedAt, null);
  assert.deepEqual(result.observations, []);
});
