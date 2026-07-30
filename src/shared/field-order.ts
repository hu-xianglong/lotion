import type { DatabaseRecord, ID, RecordValue } from "./types.js";

export interface ContentRichnessOrderOptions {
  pinnedFirst?: readonly ID[];
  pinnedLast?: readonly ID[];
}

export interface InformationAmountOrderOptions extends ContentRichnessOrderOptions {
  maxSampleSize?: number;
}

export function orderFieldIdsByContentRichness(
  records: readonly DatabaseRecord[],
  fieldIds: readonly ID[],
  options: ContentRichnessOrderOptions = {}
): ID[] {
  const originalIndex = new Map(fieldIds.map((id, index) => [id, index]));
  const pinnedFirst = new Set(options.pinnedFirst ?? []);
  const pinnedLast = new Set(options.pinnedLast ?? []);
  const rowCount = Math.max(1, records.length);
  const averageLength = (fieldId: ID): number => {
    let total = 0;
    for (const record of records) {
      total += String(record[fieldId] ?? "").trim().length;
    }
    return total / rowCount;
  };
  const byOriginalOrder = (a: ID, b: ID): number => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  const byRichness = (a: ID, b: ID): number => {
    const richness = averageLength(b) - averageLength(a);
    return richness !== 0 ? richness : byOriginalOrder(a, b);
  };

  const first = fieldIds.filter((id) => pinnedFirst.has(id));
  const last = fieldIds.filter((id) => !pinnedFirst.has(id) && pinnedLast.has(id));
  const middle = fieldIds
    .filter((id) => !pinnedFirst.has(id) && !pinnedLast.has(id))
    .sort(byRichness);
  return [...first, ...middle, ...last];
}

const EMPTY_VALUE = "\u0000empty";
const DEFAULT_SAMPLE_SIZE = 512;
const textEncoder = new TextEncoder();

/**
 * Estimates how many bits are needed to represent each sampled column.
 * Repeated values share one payload and empty values carry no payload.
 */
export function orderFieldIdsByInformationAmount(
  records: readonly DatabaseRecord[],
  fieldIds: readonly ID[],
  options: InformationAmountOrderOptions = {}
): ID[] {
  const pinnedFirst = new Set(options.pinnedFirst ?? []);
  const pinnedLast = new Set(options.pinnedLast ?? []);
  const first = fieldIds.filter((id) => pinnedFirst.has(id));
  const last = fieldIds.filter((id) => !pinnedFirst.has(id) && pinnedLast.has(id));
  const candidates = fieldIds.filter((id) => !pinnedFirst.has(id) && !pinnedLast.has(id));
  if (candidates.length < 2 || records.length === 0) return [...first, ...candidates, ...last];

  const sample = evenlySampleRecords(records, options.maxSampleSize ?? DEFAULT_SAMPLE_SIZE);
  const originalIndex = new Map(candidates.map((fieldId, index) => [fieldId, index]));
  const informationByFieldId = new Map(
    candidates.map((fieldId) => [fieldId, estimateColumnInformationBits(sample, fieldId)])
  );
  const middle = [...candidates].sort((left, right) => {
    const informationDifference = (informationByFieldId.get(right) ?? 0) - (informationByFieldId.get(left) ?? 0);
    return informationDifference !== 0
      ? informationDifference
      : (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0);
  });
  return [...first, ...middle, ...last];
}

function evenlySampleRecords(records: readonly DatabaseRecord[], maxSampleSize: number): readonly DatabaseRecord[] {
  const size = Math.max(1, Math.floor(maxSampleSize));
  if (records.length <= size) return records;
  if (size === 1) return [records[0]];
  return Array.from({ length: size }, (_, index) => {
    return records[Math.round(index * (records.length - 1) / (size - 1))];
  });
}

function estimateColumnInformationBits(records: readonly DatabaseRecord[], fieldId: ID): number {
  const valueCounts = new Map<string, number>();
  const uniqueValues = new Set<string>();
  for (const record of records) {
    const value = serializeValue(record[fieldId] ?? null);
    valueCounts.set(value, (valueCounts.get(value) ?? 0) + 1);
    if (value !== EMPTY_VALUE) uniqueValues.add(value);
  }

  const assignmentBits = records.length * entropyFromCounts(valueCounts, records.length);
  const byteCounts = new Uint32Array(256);
  let byteCount = 0;
  for (const value of uniqueValues) {
    for (const byte of textEncoder.encode(value)) {
      byteCounts[byte] += 1;
      byteCount += 1;
    }
  }
  if (byteCount === 0) return assignmentBits;

  let payloadEntropy = 0;
  let distinctBytes = 0;
  for (const count of byteCounts) {
    if (count === 0) continue;
    distinctBytes += 1;
    const probability = count / byteCount;
    payloadEntropy -= probability * Math.log2(probability);
  }
  const payloadBits = byteCount * payloadEntropy + distinctBytes * 8;
  return assignmentBits + payloadBits;
}

function entropyFromCounts<K>(counts: ReadonlyMap<K, number>, total: number): number {
  let entropy = 0;
  for (const count of counts.values()) {
    if (count <= 0) continue;
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function serializeValue(value: RecordValue): string {
  return isEmptyValue(value) ? EMPTY_VALUE : String(value).trim();
}

function isEmptyValue(value: RecordValue): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}
