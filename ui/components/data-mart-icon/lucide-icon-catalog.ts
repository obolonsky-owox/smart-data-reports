// Ported from OWOX/owox-data-marts apps/web/src/features/data-marts/shared/components/DataMartIcon/lucide-icon-catalog.ts.
// This module pulls the whole icon library, so it is only ever loaded lazily (see DataMartIconGlyph) — never import it statically.
import * as lucide from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LUCIDE_ICON_PREFIX, toLucideIconName } from './lucide-icon-name';

const ICONS_BY_VALUE = new Map<string, LucideIcon>(
  Object.entries(lucide.icons).map(([componentName, icon]) => [`${LUCIDE_ICON_PREFIX}${toLucideIconName(componentName)}`, icon]),
);

// A renamed lucide icon keeps its old name only as an alias export, so a value saved under it still draws.
const CURRENT_ICONS = new Set<unknown>(ICONS_BY_VALUE.values());
for (const [exportName, component] of Object.entries(lucide)) {
  if (!CURRENT_ICONS.has(component)) continue;
  if (exportName.startsWith('Lucide') || exportName.endsWith('Icon')) continue;
  const value = `${LUCIDE_ICON_PREFIX}${toLucideIconName(exportName)}`;
  if (!ICONS_BY_VALUE.has(value)) ICONS_BY_VALUE.set(value, component as LucideIcon);
}

/** The lucide icon a `lucide:<name>` value names (current name or alias), if the library has it. */
export function getLucideIcon(value: string): LucideIcon | undefined {
  return ICONS_BY_VALUE.get(value);
}
