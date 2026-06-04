import assert from "node:assert/strict";
import { test } from "node:test";
import { isDriverPhotoStoragePath } from "../src/lib/storage/driver-photo-path.ts";

test("isDriverPhotoStoragePath reconhece path Supabase Storage", () => {
  assert.equal(isDriverPhotoStoragePath("tenant-1/driver-abc/photo.jpg"), true);
  assert.equal(isDriverPhotoStoragePath(""), false);
  assert.equal(isDriverPhotoStoragePath(null), false);
});

test("isDriverPhotoStoragePath rejeita URLs http(s)", () => {
  assert.equal(isDriverPhotoStoragePath("https://cdn.example.com/photo.jpg"), false);
  assert.equal(isDriverPhotoStoragePath("http://localhost/photo.jpg"), false);
});
