import type { ReactNode } from "react";
import type { DatabaseSummary, EntityKind, EntityRef, PageMeta } from "../../shared/types";

export interface EntityBreadcrumbSource {
  id: string;
  kind: EntityKind;
  title: string;
  path?: string[];
  parentId?: string;
  parentKind?: EntityKind;
  databaseId?: string;
}

export interface EntityBreadcrumbItem {
  label: string;
  current?: boolean;
  ref?: EntityRef;
}

export function resolveEntityBreadcrumbItems({
  source,
  pages = [],
  databases = []
}: {
  source: EntityBreadcrumbSource;
  pages?: PageMeta[];
  databases?: DatabaseSummary[];
}): EntityBreadcrumbItem[] {
  const title = source.title.trim() || "Untitled";
  const importedPath = normalizePath(source.path);
  const path = importedPath.length > 0
    ? [...importedPath.slice(0, -1), title]
    : [title];

  return path.map((label, index) => {
    const current = index === path.length - 1;
    if (current) return { label, current: true };

    const prefix = path.slice(0, index + 1);
    const isImmediateParent = index === path.length - 2;
    const stableParent = isImmediateParent
      ? resolveStableParent(source, pages, databases)
      : undefined;
    const resolved = stableParent ?? resolveExactPath(prefix, pages, databases);
    return resolved ? { label: resolved.label, ref: resolved.ref } : { label };
  });
}

export function EntityBreadcrumbs({
  items,
  onOpenEntity,
  trailing
}: {
  items: EntityBreadcrumbItem[];
  onOpenEntity?: (ref: EntityRef) => void;
  trailing?: ReactNode;
}) {
  if (items.length <= 1 && !trailing) return null;
  const pathLabel = items.map((item) => item.label).join(" / ");
  return (
    <nav className="entity-breadcrumbs" aria-label={pathLabel} title={pathLabel}>
      {items.map((item, index) => (
        <span className="entity-breadcrumb-item" key={`${index}:${item.label}`}>
          {index > 0 && <span className="entity-breadcrumb-separator" aria-hidden="true">/</span>}
          {item.ref && onOpenEntity && !item.current ? (
            <button
              type="button"
              className="entity-breadcrumb-link"
              data-entity-id={item.ref.entityId}
              data-entity-kind={item.ref.kind}
              onClick={() => onOpenEntity(item.ref as EntityRef)}
              title={item.label}
            >
              {item.label}
            </button>
          ) : (
            <span className={item.current ? "entity-breadcrumb-current" : "entity-breadcrumb-segment"} aria-current={item.current ? "page" : undefined}>
              {item.label}
            </span>
          )}
        </span>
      ))}
      {trailing && (
        <>
          <span className="entity-breadcrumb-trailing-separator" aria-hidden="true">·</span>
          <span className="entity-breadcrumb-trailing">{trailing}</span>
        </>
      )}
    </nav>
  );
}

function resolveStableParent(
  source: EntityBreadcrumbSource,
  pages: PageMeta[],
  databases: DatabaseSummary[]
): { label: string; ref: EntityRef } | undefined {
  if (!source.parentId) return undefined;
  const kind = source.parentKind ?? "page";
  if (kind === "page") {
    const page = pages.find((candidate) => candidate.id === source.parentId);
    return page ? resolvedPage(page) : undefined;
  }
  if (kind === "database") {
    const database = databases.find((candidate) => candidate.id === source.parentId);
    return database ? resolvedDatabase(database) : undefined;
  }
  return {
    label: normalizePath(source.path).at(-2) || "Parent",
    ref: {
      entityId: source.parentId,
      kind: "row",
      rowId: source.parentId,
      databaseId: source.databaseId
    }
  };
}

function resolveExactPath(
  path: string[],
  pages: PageMeta[],
  databases: DatabaseSummary[]
): { label: string; ref: EntityRef } | undefined {
  const page = pages.find((candidate) => pathsEqual(candidate.path, path));
  if (page) return resolvedPage(page);
  const database = databases.find((candidate) => pathsEqual(candidate.path, path));
  return database ? resolvedDatabase(database) : undefined;
}

function resolvedPage(page: PageMeta): { label: string; ref: EntityRef } {
  return {
    label: page.title.trim() || "Untitled",
    ref: {
      entityId: page.id,
      kind: "page",
      titleSnapshot: page.title,
      pathSnapshot: normalizePath(page.path)
    }
  };
}

function resolvedDatabase(database: DatabaseSummary): { label: string; ref: EntityRef } {
  return {
    label: database.name.trim() || "Untitled",
    ref: {
      entityId: database.id,
      kind: "database",
      titleSnapshot: database.name,
      pathSnapshot: normalizePath(database.path)
    }
  };
}

function normalizePath(path: string[] | undefined): string[] {
  return (path ?? []).map((segment) => segment.trim()).filter(Boolean);
}

function pathsEqual(path: string[] | undefined, expected: string[]): boolean {
  const actual = normalizePath(path);
  return actual.length === expected.length && actual.every((segment, index) => segment === expected[index]);
}
