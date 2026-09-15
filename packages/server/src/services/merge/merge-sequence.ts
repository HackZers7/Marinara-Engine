// ──────────────────────────────────────────────
// Merge sequence interleave
// ──────────────────────────────────────────────
//
// Ordering rule for merge-import: items that only exist in the imported file
// are woven into the current sequence without ever moving a current item
// relative to another current item. A new id is placed right after its
// nearest preceding neighbor from the incoming sequence that is already
// present in the result (a matched item or a previously inserted one); when
// it has no placed predecessor it goes before the first placed successor,
// else at the end.

export function mergeSequences(currentIds: string[], incomingIds: string[]): string[] {
  const result = [...currentIds];
  const placed = new Set(result);
  const positionOf = (id: string) => result.indexOf(id);

  incomingIds.forEach((id, incomingIndex) => {
    if (placed.has(id)) return;
    let anchor = -1;
    for (let i = incomingIndex - 1; i >= 0; i--) {
      const p = positionOf(incomingIds[i]!);
      if (p >= 0) {
        anchor = p;
        break;
      }
    }
    if (anchor >= 0) {
      result.splice(anchor + 1, 0, id);
    } else {
      let insertAt = result.length;
      for (let i = incomingIndex + 1; i < incomingIds.length; i++) {
        const p = positionOf(incomingIds[i]!);
        if (p >= 0) {
          insertAt = p;
          break;
        }
      }
      result.splice(insertAt, 0, id);
    }
    placed.add(id);
  });

  return result;
}
