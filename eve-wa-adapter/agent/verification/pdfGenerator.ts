import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Discovers an available Chromium binary (Google Chrome or Microsoft Edge) on the system.
 */
export function findChromiumBinary(): string {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const candidatePaths = [
    path.join(localAppData, "Google/Chrome/Application/chrome.exe"),
    path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
    path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
    path.join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(programFiles, "Microsoft/Edge/Application/msedge.exe"),
    "chrome",
    "msedge",
  ];

  for (const candidate of candidatePaths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback default
  return path.join(localAppData, "Google/Chrome/Application/chrome.exe");
}

/**
 * Converts an HTML string or file to a pixel-perfect, publication-grade PDF using headless Chromium.
 */
export async function convertHtmlToPdf(htmlContent: string, outputPdfPath: string): Promise<string> {
  const browserBinary = findChromiumBinary();

  if (!fs.existsSync(browserBinary)) {
    throw new Error(
      `Chromium browser binary not found at "${browserBinary}". Ensure Google Chrome or Microsoft Edge is installed.`,
    );
  }

  // Ensure output directory exists
  const outputDir = path.dirname(path.resolve(outputPdfPath));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write temporary HTML file
  const tempHtmlPath = path.join(
    os.tmpdir(),
    `veriqoo-report-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.html`,
  );

  fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");

  try {
    const resolvedPdf = path.resolve(outputPdfPath);
    const resolvedHtml = path.resolve(tempHtmlPath);

    // Run Chromium with headless PDF flags
    const cmd = `"${browserBinary}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${resolvedPdf}" "${resolvedHtml}"`;

    execSync(cmd, {
      stdio: "pipe",
      timeout: 30000,
    });

    if (!fs.existsSync(resolvedPdf)) {
      throw new Error(`PDF conversion finished but "${resolvedPdf}" was not found.`);
    }

    return resolvedPdf;
  } finally {
    // Clean up temporary HTML file
    try {
      if (fs.existsSync(tempHtmlPath)) {
        fs.unlinkSync(tempHtmlPath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
