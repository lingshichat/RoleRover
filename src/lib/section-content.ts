const ITEM_SECTION_TYPES = new Set([
  'work_experience',
  'education',
  'projects',
  'certifications',
  'languages',
  'github',
  'qr_codes',
  'custom',
]);

type SectionCollectionKey = 'items' | 'categories';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getSectionCollection<T extends object>(
  value: unknown,
  key: SectionCollectionKey,
): T[] {
  const collection = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value[key])
      ? value[key]
      : [];

  return collection.filter(isRecord) as T[];
}

export function normalizeSectionContentForRender(
  sectionType: string,
  rawContent: unknown,
): Record<string, unknown> {
  const content = isRecord(rawContent) ? { ...rawContent } : {};

  if (ITEM_SECTION_TYPES.has(sectionType)) {
    content.items = getSectionCollection(content.items, 'items');
  }

  if (sectionType === 'skills') {
    content.categories = getSectionCollection(content.categories, 'categories');
  }

  return content;
}
