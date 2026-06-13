/** Preserve Shopify embedded query params (shop, host, etc.) on in-app navigation. */
export function withEmbeddedSearch(pathname: string, search?: string): string {
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  return `${pathname}${query}`;
}
