import * as fs from "node:fs";
import * as path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const ROOT_DIR = process.cwd();
const SRC_DIR = path.resolve(ROOT_DIR, "extension");
const DIST_DIR = path.resolve(ROOT_DIR, "dist/extension");

console.log("[Veriqoo Build] Building Chrome Extension into:", DIST_DIR);

// Ensure clean dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (!entry.name.endsWith(".ts")) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy static assets (manifest.json, HTML, CSS, icons)
copyDirSync(SRC_DIR, DIST_DIR);
console.log("✓ Copied static assets (manifest.json, HTML, CSS, icons)");

// 2. Transpile TS files using Node.js 24 native TypeScript stripper
function transpileTsFile(srcPath, destPath, replaceImports = true) {
  const tsCode = fs.readFileSync(srcPath, "utf-8");
  
  let processedCode = tsCode;
  if (replaceImports) {
    // Replace .ts extension with .js in imports for ES module resolution in browsers
    processedCode = processedCode.replace(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");
  }

  const jsCode = stripTypeScriptTypes(processedCode);

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(destPath, jsCode, "utf-8");
}

// Build shared files
transpileTsFile(
  path.join(SRC_DIR, "shared/types.ts"),
  path.join(DIST_DIR, "shared/types.js"),
);
transpileTsFile(
  path.join(SRC_DIR, "shared/profileDetector.ts"),
  path.join(DIST_DIR, "shared/profileDetector.js"),
);
transpileTsFile(
  path.join(SRC_DIR, "shared/domExtractor.ts"),
  path.join(DIST_DIR, "shared/domExtractor.js"),
);
transpileTsFile(
  path.join(SRC_DIR, "shared/postCollector.ts"),
  path.join(DIST_DIR, "shared/postCollector.js"),
);
transpileTsFile(
  path.join(SRC_DIR, "shared/highlightCollector.ts"),
  path.join(DIST_DIR, "shared/highlightCollector.js"),
);
transpileTsFile(
  path.join(SRC_DIR, "shared/apiClient.ts"),
  path.join(DIST_DIR, "shared/apiClient.js"),
);

// Build service worker
transpileTsFile(
  path.join(SRC_DIR, "background/service-worker.ts"),
  path.join(DIST_DIR, "background/service-worker.js"),
);

// Build sidepanel client
transpileTsFile(
  path.join(SRC_DIR, "sidepanel/sidepanel.ts"),
  path.join(DIST_DIR, "sidepanel/sidepanel.js"),
);

// Build self-contained content script (inline profileDetector, highlightCollector, postCollector, and domExtractor for classic content script execution)
const profileDetectorCode = fs.readFileSync(path.join(SRC_DIR, "shared/profileDetector.ts"), "utf-8");
const highlightCollectorCode = fs.readFileSync(path.join(SRC_DIR, "shared/highlightCollector.ts"), "utf-8");
const postCollectorCode = fs.readFileSync(path.join(SRC_DIR, "shared/postCollector.ts"), "utf-8");
const domExtractorCode = fs.readFileSync(path.join(SRC_DIR, "shared/domExtractor.ts"), "utf-8");
const contentScriptCode = fs.readFileSync(path.join(SRC_DIR, "content/instagram-profile.ts"), "utf-8");

// Combine profileDetector, highlightCollector, postCollector, domExtractor, and contentScript into a single clean bundle for content script
const cleanProfileDetector = profileDetectorCode
  .replace(/import\s+type\s+[^;]+;/g, "")
  .replace(/export\s+/g, "");

const cleanHighlightCollector = highlightCollectorCode
  .replace(/import\s+type\s+[^;]+;/g, "")
  .replace(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?/g, "")
  .replace(/export\s+/g, "");

const cleanPostCollector = postCollectorCode
  .replace(/import\s+type\s+[^;]+;/g, "")
  .replace(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?/g, "")
  .replace(/export\s+/g, "");

const cleanDomExtractor = domExtractorCode
  .replace(/import\s+type\s+[^;]+;/g, "")
  .replace(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?/g, "")
  .replace(/export\s+/g, "");

const cleanContentScript = contentScriptCode
  .replace(/import\s+type\s+[^;]+;/g, "")
  .replace(/import\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?/g, "");

const bundledContentScript = `
// Inlined profile detector utility
${cleanProfileDetector}

// Inlined highlight collector utility
${cleanHighlightCollector}

// Inlined DOM extractor utility
${cleanDomExtractor}

// Inlined post collector utility
${cleanPostCollector}

// Content script logic
${cleanContentScript}
`;

const bundledJs = stripTypeScriptTypes(bundledContentScript);

const contentDest = path.join(DIST_DIR, "content/instagram-profile.js");
fs.mkdirSync(path.dirname(contentDest), { recursive: true });
fs.writeFileSync(contentDest, bundledJs, "utf-8");

console.log("✓ Transpiled background/service-worker.js, sidepanel/sidepanel.js, and content/instagram-profile.js");
console.log("🎉 Chrome Extension Manifest V3 build complete at: dist/extension/");

