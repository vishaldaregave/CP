import { performOCR } from "./ocrEngine.ts";
import { extractPackagingInfo } from "./packagingExtractor.ts";
import type { ReceivedProductEvidence, ExtractedFact } from "./types.ts";

function extractQuantity(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|ml|l|litres?|tablets?|capsules?|pcs|pieces?|count|pack)/i);
  if (!match) return null;
  return `${match[1]} ${match[2].toLowerCase()}`;
}

function extractCountryOfOrigin(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/(?:made\s*in|country\s*of\s*origin|origin|mfd\s*in|manufactured\s*in)\s*:?\s*([a-zA-Z\s]+)/i);
  if (!match) return null;
  return match[1].trim().split(/\n|,|\./)[0].trim();
}

/**
 * Analyzes an image of a physical received product or packaging photo.
 * Performs OCR and packaging fact extraction to produce structured ReceivedProductEvidence.
 */
export async function analyzeReceivedProductImage(
  imageBuffer: Buffer,
): Promise<ReceivedProductEvidence> {
  const ocrResult = await performOCR(imageBuffer);
  const packaging = extractPackagingInfo(ocrResult.text, "received_product_photo");

  const quantity = extractQuantity(ocrResult.text) || packaging.product.mrp || null;
  const country = extractCountryOfOrigin(ocrResult.text);

  const facts: ExtractedFact[] = [
    ...packaging.facts,
    {
      fact: `Extracted ${ocrResult.text.length} characters from received product packaging photo`,
      source: "received_product_photo",
      method: "OCR",
    },
  ];

  if (country) {
    facts.push({
      fact: `Country of origin identified on packaging: ${country}`,
      source: "received_product_photo",
      method: "packaging_regex",
    });
  }

  return {
    brand: packaging.product.brand || null,
    product: packaging.product.name || null,
    category: packaging.product.category || null,
    price: packaging.product.price || null,
    mrp: packaging.product.mrp || null,
    net_quantity: quantity,
    pack_size: quantity,
    manufacturer: packaging.manufacturer.name || null,
    country_of_origin: country,
    claims: packaging.claims,
    ocr_text: ocrResult.text,
    confidence: ocrResult.confidence,
    extractedFacts: facts,
  };
}

/**
 * Parses raw text input into ReceivedProductEvidence (for testing and fallback).
 */
export function analyzeReceivedProductText(
  text: string,
  confidence = 90,
): ReceivedProductEvidence {
  const packaging = extractPackagingInfo(text, "received_product_text");
  const quantity = extractQuantity(text);
  const country = extractCountryOfOrigin(text);

  return {
    brand: packaging.product.brand || null,
    product: packaging.product.name || null,
    category: packaging.product.category || null,
    price: packaging.product.price || null,
    mrp: packaging.product.mrp || null,
    net_quantity: quantity,
    pack_size: quantity,
    manufacturer: packaging.manufacturer.name || null,
    country_of_origin: country,
    claims: packaging.claims,
    ocr_text: text,
    confidence,
    extractedFacts: packaging.facts,
  };
}
