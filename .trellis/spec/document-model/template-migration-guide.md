# Template Migration Guide

> Step-by-step checklist for moving a legacy template onto the unified
> preview/export contract.

---

## Goals

- Keep preview and export on one canonical input model
- Migrate templates incrementally instead of rewriting the whole catalog at once
- Preserve legacy fallback behavior until each template is validated

---

## Migration Steps

1. Define the target template file under `src/lib/template-renderer/templates/`.
2. Accept `CanonicalResume` in both `PreviewComponent` and `buildHtml`.
3. Reuse shared helpers from `template-contract.ts` instead of duplicating
   markdown, escaping, date formatting, or section filtering logic.
4. Register the unified template in `src/lib/template-renderer/index.ts`.
5. Ensure preview enters through `getUnifiedTemplate(...)` before falling back
   to the legacy component.
6. Ensure export enters through `getUnifiedTemplate(...)` and
   `toCanonicalResume(...)` before falling back to the legacy HTML builder.
7. Add parity verification that renders preview and export from the same
   canonical sample.

---

## Good Migration Shape

```typescript
const unifiedTemplate = getUnifiedTemplate(resume.template);

if (unifiedTemplate) {
  const canonical = toCanonicalResume(resume);
  return unifiedTemplate.buildHtml(canonical);
}

return legacyBuilder(resume);
```

---

## Validation Checklist

- [ ] Preview path uses canonical input
- [ ] Export path uses canonical input
- [ ] Section order is driven by `sortOrder`
- [ ] Hidden sections stay hidden in both contexts
- [ ] Representative content renders the same in both contexts
- [ ] Legacy fallback still works for unmigrated templates

---

## First Templates to Migrate

- `classic`
- `modern`

These two provide a stable baseline before expanding to the wider template
catalog.
