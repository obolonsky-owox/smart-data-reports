import { createElement, useEffect, useState } from 'react';
import { Icon, type LucideIcon, type LucideProps } from 'lucide-react';
import { DEFAULT_DATA_MART_ICON, getDataMartIcon } from './data-mart-icons';
import { isLucideIconValue } from './lucide-icon-name';

type Catalog = typeof import('./lucide-icon-catalog');

let loaded: Catalog | undefined;
let pending: Promise<Catalog> | undefined;

/** Loads the full lucide catalogue once (a separate chunk); a failed load is retried next time. */
function loadCatalog(): Promise<Catalog> {
  pending ??= import('./lucide-icon-catalog').then(
    (catalog) => (loaded = catalog),
    (error: unknown) => {
      pending = undefined;
      throw error;
    },
  );
  return pending;
}

function useCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState(loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || catalog) return;
    let active = true;
    loadCatalog().then(
      (next) => active && setCatalog(next),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [enabled, catalog]);
  return { catalog, failed };
}

interface DataMartIconGlyphProps extends LucideProps {
  /** The data mart's picked icon: a recommended key, `lucide:<name>`, or null for the default. */
  icon: string | null | undefined;
  fallback?: LucideIcon;
}

/**
 * A data mart's picked icon, drawn the way ODM draws it (ported from its DataMartIconGlyph).
 * A `lucide:` icon waits for the icon library behind an empty icon of the same size.
 */
export function DataMartIconGlyph({ icon, fallback = DEFAULT_DATA_MART_ICON, ...props }: DataMartIconGlyphProps) {
  const isLibraryIcon = isLucideIconValue(icon);
  const { catalog, failed } = useCatalog(isLibraryIcon);
  if (!isLibraryIcon) return createElement(getDataMartIcon(icon, fallback), props);
  if (failed && !catalog) return createElement(fallback, props);
  if (!catalog) return createElement(Icon, { ...props, iconNode: [] });
  return createElement(catalog.getLucideIcon(icon) ?? fallback, props);
}
