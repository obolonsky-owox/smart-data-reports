// Ported from OWOX/owox-data-marts apps/web/src/features/data-marts/shared/components/DataMartIcon/lucide-icon-name.ts.

/** A data mart icon that names any lucide icon rather than a recommended key, e.g. `lucide:anchor`. */
export const LUCIDE_ICON_PREFIX = 'lucide:';

/**
 * Kebab-case name of a lucide icon component, as lucide.dev spells it:
 * `ShoppingCart` → `shopping-cart`, `Package2` → `package-2`, `Grid2x2Check` → `grid-2x2-check`.
 */
export function toLucideIconName(componentName: string): string {
  return componentName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/(?<![0-9])([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

export function isLucideIconValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(LUCIDE_ICON_PREFIX);
}
