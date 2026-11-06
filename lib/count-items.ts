/**
 * Counts a known collection, or reports that its count is unknown.
 *
 * Interface:
 * - Input: an array of items, or null when the count is unavailable.
 * - Output: the array length, or "未知" for null.
 *
 * Examples:
 * - countItems(["a", "b"]) => 2
 * - countItems([]) => 0
 * - countItems(null) => "未知"
 */
export function countItems<T>(items: T[] | null): number | "未知" {
    return items === null ? "未知" : items.length
}
