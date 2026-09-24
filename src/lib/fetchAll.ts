/**
 * Every row of a query, fetched a page at a time.
 *
 * The Supabase API silently returns at most 1,000 rows per request,
 * so a season of a Pick'Em league's picks (11 players × 16 games a
 * week passes 1,000 around Week 6) was quietly cut off — standings,
 * awards and the winner popup would have scored a partial season.
 *
 * `page` must build the query fresh on each call and order it by
 * something unique (e.g. id), so pages don't overlap or skip rows.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}
