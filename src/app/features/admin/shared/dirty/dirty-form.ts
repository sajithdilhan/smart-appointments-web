/** Implemented by every admin form component; `unsavedChangesGuard` asks it before a route exit. */
export interface DirtyForm {
  isDirty(): boolean;
}
