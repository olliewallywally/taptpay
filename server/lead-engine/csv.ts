/**
 * csv.ts — dependency-free CSV ingest for the lead engine's import endpoint.
 *
 * `parseCsv` is a minimal RFC-4180-ish parser (quoted fields, escaped `""`,
 * commas + newlines inside quotes, CRLF/LF). `mapCsvRows` maps a header row to
 * canonical lead fields via flexible aliases.
 */

import { inferSegment } from "./normalize";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully-blank rows.
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

export interface ParsedLeadRow {
  businessName: string;
  category?: string;
  segment?: string;
  website?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  address?: string;
  suburb?: string;
  city?: string;
  region?: string;
  nzbn?: string;
}

// Header (lowercased) → canonical field. Accepts common aliases.
const HEADER_ALIASES: Record<string, keyof ParsedLeadRow> = {
  "business": "businessName", "business name": "businessName", "businessname": "businessName",
  "name": "businessName", "company": "businessName", "company name": "businessName", "trading name": "businessName",
  "category": "category", "type": "category", "industry": "category", "vertical": "category",
  "segment": "segment",
  "website": "website", "url": "website", "site": "website", "web": "website", "domain": "website",
  "email": "email", "email address": "email", "e-mail": "email", "contact email": "email",
  "phone": "phone", "phone number": "phone", "tel": "phone", "telephone": "phone", "mobile": "phone", "contact phone": "phone",
  "contact": "contactName", "contact name": "contactName", "owner": "contactName", "person": "contactName", "first name": "contactName",
  "address": "address", "street": "address", "street address": "address",
  "suburb": "suburb",
  "city": "city", "town": "city",
  "region": "region", "state": "region", "province": "region",
  "nzbn": "nzbn", "business number": "nzbn",
};

/** Map parsed CSV rows (first row = header) to lead rows. Rows without a
 *  business name are dropped; segment is inferred from category when absent. */
export function mapCsvRows(rows: string[][]): ParsedLeadRow[] {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const cols = header.map(h => HEADER_ALIASES[h]);
  const out: ParsedLeadRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rec: Partial<ParsedLeadRow> = {};
    for (let c = 0; c < cols.length; c++) {
      const key = cols[c];
      if (!key) continue;
      const val = (cells[c] ?? "").trim();
      if (val) (rec as Record<string, string>)[key] = val;
    }
    if (!rec.businessName) continue;
    if (!rec.segment) rec.segment = inferSegment(rec.category);
    out.push(rec as ParsedLeadRow);
  }
  return out;
}
