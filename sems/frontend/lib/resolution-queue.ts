/** Next list index after removing the item at `currentIndex`. */
export function nextIndexAfterRemoval(currentIndex: number, remainingLength: number): number {
  if (remainingLength <= 0) return -1;
  return Math.min(Math.max(currentIndex, 0), remainingLength - 1);
}
