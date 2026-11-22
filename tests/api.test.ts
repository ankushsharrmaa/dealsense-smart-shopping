import assert from "node:assert/strict";
import test from "node:test";
import { validateProductUrl } from "../src/api";

test("accepts complete HTTP and HTTPS product URLs", () => {
  assert.equal(validateProductUrl("https://www.myntra.com/shoes/123456"), null);
  assert.equal(validateProductUrl("http://www.flipkart.com/item/p/itm123"), null);
});

test("rejects incomplete, malformed, or non-web URLs", () => {
  assert.match(validateProductUrl("myntra.com/product") ?? "", /complete product link/i);
  assert.match(validateProductUrl("javascript:alert(1)") ?? "", /http:\/\/ or https:\/\//i);
  assert.match(validateProductUrl("https://localhost/item") ?? "", /valid product link/i);
});
