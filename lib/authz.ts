export function userOwnsEntry(sessionUserId: string | null | undefined, entryUserId: string | null | undefined) {
  return Boolean(sessionUserId && entryUserId && sessionUserId === entryUserId);
}
