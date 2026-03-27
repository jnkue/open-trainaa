#!/usr/bin/env node

/**
 * i18n validation script
 *
 * Checks:
 * 1. No duplicate keys in any locale JSON file
 * 2. All locale files have the same set of keys (no missing translations)
 *
 * Usage: node scripts/check-i18n.js
 */

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "i18n", "locales");
const REFERENCE_LOCALE = "en";

let hasErrors = false;

function error(msg) {
  console.error(`  ERROR: ${msg}`);
  hasErrors = true;
}

// --- 1. Check for duplicate keys ---

function findDuplicateKeys(jsonString, filePath) {
  const keyPaths = [];
  const stack = [""]; // tracks current nesting path
  let depth = 0;

  // Use a simple regex-based approach to find all key declarations with their nesting
  const lines = jsonString.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Count braces to track depth
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;

    // Match a key declaration
    const keyMatch = line.match(/^(\s*)"([^"]+)"\s*:/);
    if (keyMatch) {
      const indent = keyMatch[1].length;
      const key = keyMatch[2];
      // Approximate depth from indentation (2 spaces per level)
      const keyDepth = Math.floor(indent / 2);
      // Trim stack to current depth
      while (stack.length > keyDepth) stack.pop();
      const fullPath = stack.length > 0 ? [...stack.filter(Boolean), key].join(".") : key;
      keyPaths.push({ fullPath, line: i + 1 });
      // If this key's value is an object, push it onto the stack
      if (line.includes("{")) {
        stack.push(key);
      }
    } else {
      // Track depth changes for lines without keys
      if (closeBraces > openBraces) {
        for (let j = 0; j < closeBraces - openBraces; j++) {
          stack.pop();
        }
      }
    }
  }

  // Find duplicates
  const seen = new Map();
  const duplicates = [];
  for (const { fullPath, line } of keyPaths) {
    if (seen.has(fullPath)) {
      duplicates.push({ key: fullPath, lines: [seen.get(fullPath), line] });
    } else {
      seen.set(fullPath, line);
    }
  }
  return duplicates;
}

// --- 2. Collect all keys recursively ---

function collectKeys(obj, prefix = "") {
  const keys = new Set();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const nested of collectKeys(value, fullKey)) {
        keys.add(nested);
      }
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

// --- Main ---

const localeFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

if (localeFiles.length === 0) {
  console.error("No locale files found");
  process.exit(1);
}

console.log(`Checking ${localeFiles.length} locale files...\n`);

const allLocaleKeys = {};

for (const file of localeFiles) {
  const locale = file.replace(".json", "");
  const filePath = path.join(LOCALES_DIR, file);
  const raw = fs.readFileSync(filePath, "utf-8");

  console.log(`[${locale}]`);

  // Check for duplicate keys
  const duplicates = findDuplicateKeys(raw, filePath);
  if (duplicates.length > 0) {
    for (const dup of duplicates) {
      error(`Duplicate key "${dup.key}" at lines ${dup.lines.join(", ")}`);
    }
  }

  // Parse and collect keys
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    error(`Invalid JSON: ${e.message}`);
    continue;
  }

  allLocaleKeys[locale] = collectKeys(parsed);
  console.log(`  ${allLocaleKeys[locale].size} keys found`);
}

// Compare all locales against reference
console.log("");
const refKeys = allLocaleKeys[REFERENCE_LOCALE];
if (!refKeys) {
  console.error(`Reference locale "${REFERENCE_LOCALE}" not found`);
  process.exit(1);
}

for (const [locale, keys] of Object.entries(allLocaleKeys)) {
  if (locale === REFERENCE_LOCALE) continue;

  const missingInLocale = [...refKeys].filter((k) => !keys.has(k));
  const extraInLocale = [...keys].filter((k) => !refKeys.has(k));

  if (missingInLocale.length > 0) {
    console.log(`[${locale}] Missing ${missingInLocale.length} key(s) (present in ${REFERENCE_LOCALE}):`);
    for (const k of missingInLocale) {
      error(`missing "${k}"`);
    }
  }

  if (extraInLocale.length > 0) {
    console.log(`[${locale}] Has ${extraInLocale.length} extra key(s) (not in ${REFERENCE_LOCALE}):`);
    for (const k of extraInLocale) {
      error(`extra "${k}"`);
    }
  }

  if (missingInLocale.length === 0 && extraInLocale.length === 0) {
    console.log(`[${locale}] All keys match ${REFERENCE_LOCALE}`);
  }
}

console.log("");
if (hasErrors) {
  console.error("i18n check FAILED");
  process.exit(1);
} else {
  console.log("i18n check passed");
}
