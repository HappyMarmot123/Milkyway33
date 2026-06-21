import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Hero uses mobile-safe viewport and logo-loop spacing", async () => {
  const source = await read("src/components/landing/Hero.tsx");

  assert.match(source, /min-h-\[100svh\]/);
  assert.match(
    source,
    /px-4 pt-12 sm:pt-\[5rem\] sm:pr-\[10rem\] sm:pl-0/,
  );
});

test("hero banner scales spacing, heading size, and line height", async () => {
  const source = await read("src/components/ui/responsive-hero-banner.tsx");

  assert.match(source, /pt-28 sm:pt-36 md:pt-48 lg:pt-\[18rem\] px-6/);
  assert.match(source, /text-4xl sm:text-5xl md:text-7xl lg:text-8xl/);
  assert.match(source, /leading-\[1\] md:leading-\[0\.9\]/);
});

test("Physics section stacks its heading and expands its mobile canvas", async () => {
  const source = await read("src/components/landing/PhysicsSection.tsx");

  assert.match(source, /py-16 sm:py-32/);
  assert.match(
    source,
    /flex flex-col sm:flex-row flex-wrap items-center justify-center/,
  );
  assert.match(source, /text-3xl sm:text-4xl md:text-6xl lg:text-7xl/);
  assert.match(
    source,
    /w-\[92%\] sm:w-\[80%\] h-\[240px\] sm:h-\[300px\]/,
  );
});

test("Features and BrandBanner reduce mobile vertical spacing", async () => {
  const features = await read("src/components/landing/Features.tsx");
  const brand = await read("src/components/landing/BrandBanner.tsx");

  assert.match(features, /py-20 sm:py-32 md:py-48/);
  assert.match(brand, /py-16 sm:py-\[5rem\]/);
});

test("BrandBanner text SVG remains fluid", async () => {
  const source = await read("src/components/ui/hover-footer.tsx");

  assert.match(source, /width="100%"/);
  assert.match(source, /viewBox="0 0 300 100"/);
});
