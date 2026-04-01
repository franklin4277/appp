import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "..");
const publicDir = path.join(clientRoot, "public");

const svgPath = path.join(publicDir, "favicon.svg");
const svgSource = fs.readFileSync(svgPath, "utf8");

const renderPng = ({ size, background = "#0F172A" }) => {
  const resvg = new Resvg(svgSource, {
    fitTo: { mode: "width", value: size },
    background,
  });
  return resvg.render().asPng();
};

const writePng = (filename, buffer) => {
  const outPath = path.join(publicDir, filename);
  fs.writeFileSync(outPath, buffer);
  // eslint-disable-next-line no-console
  console.log(`Generated ${path.relative(clientRoot, outPath)}`);
};

writePng("pwa-192x192.png", renderPng({ size: 192 }));
writePng("pwa-512x512.png", renderPng({ size: 512 }));
writePng("apple-touch-icon.png", renderPng({ size: 180 }));

