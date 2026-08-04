/** AscendOS offline persistence namespaces — never collide with feature keys. */
export const OFFLINE_KEYS = {
  queryCache: 'ascendos.offline.rq-cache.v1',
  syncQueue: 'ascendos.offline.sync-queue.v1',
  uploadQueue: 'ascendos.offline.upload-queue.v1',
  drafts: 'ascendos.offline.drafts.v1',
  uiState: 'ascendos.offline.ui-state.v1',
} as const;

export const DRAFT_SCOPES = {
  contactNew: 'contact:new',
  contactEdit: (id: string) => `contact:edit:${id}`,
  coachInput: 'coach:input',
  knowledgeCenter: 'knowledge-center:editor',
  storiesAdmin: 'stories:admin',
  profileEdit: 'profile:edit',
  leadershipNote: (membershipId: string) => `leadership:note:${membershipId}`,
} as const;
