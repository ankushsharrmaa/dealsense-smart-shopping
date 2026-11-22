import assert from "node:assert/strict";
import test from "node:test";
import { skuFromMyntraUrl } from "../server/myntra";

test("reads the Myntra product SKU from a path before the buy suffix", () => {
  const parsed = skuFromMyntraUrl(
    "https://www.myntra.com/shoes/brand/classic-runner/12345678/buy",
  );
  assert.equal(parsed.sku, "12345678");
  assert.equal(parsed.url.hostname, "www.myntra.com");
});

test("reads an explicit product SKU from common Myntra query parameters", () => {
  const parsed = skuFromMyntraUrl("https://myntra.com/product/shoes?skuId=98765432&utm_source=share");
  assert.equal(parsed.sku, "98765432");
});

test("does not mistake unrelated retailer links for Myntra URLs", () => {
  assert.throws(
    () => skuFromMyntraUrl("https://www.flipkart.com/item/12345678"),
    /Real price lookup currently supports Myntra only/,
  );
});

test("asks for the SKU when a Myntra share link has no product ID", () => {
  assert.throws(
    () => skuFromMyntraUrl("https://www.myntra.com/shoes/brand/classic-runner"),
    /does not contain a readable product ID/,
  );
});
