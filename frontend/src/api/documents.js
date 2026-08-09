import api from './axios';

// Maps a document owner_type to its REST base path. 'shop' has no id segment
// — company-level documents are scoped by shop_id alone (via shopParams).
const OWNER_BASE_PATHS = {
  branch: (id) => `/branches/${id}`,
  supplier: (id) => `/suppliers/${id}`,
  customer: (id) => `/customers/${id}`,
  board_member: (id) => `/board-members/${id}`,
  vehicle: (id) => `/vehicles/${id}`,
  asset: (id) => `/assets/${id}`,
  shop: () => '/company',
};

function ownerBase(ownerType, ownerId) {
  const fn = OWNER_BASE_PATHS[ownerType];
  if (!fn) throw new Error(`Unknown document owner type: ${ownerType}`);
  return fn(ownerId);
}

export async function listDocuments(ownerType, ownerId, params) {
  const { data } = await api.get(`${ownerBase(ownerType, ownerId)}/documents`, { params });
  return data.documents;
}

export async function uploadDocument(ownerType, ownerId, { file, category, expiry_date, title }, params) {
  const form = new FormData();
  form.append('file', file);
  if (category) form.append('category', category);
  if (expiry_date) form.append('expiry_date', expiry_date);
  if (title) form.append('title', title);
  const { data } = await api.post(`${ownerBase(ownerType, ownerId)}/documents`, form, { params });
  return data.document;
}

export async function deleteDocument(ownerType, ownerId, docId, params) {
  await api.delete(`${ownerBase(ownerType, ownerId)}/documents/${docId}`, { params });
}

export function documentFileUrl(ownerType, ownerId, docId) {
  return `${ownerBase(ownerType, ownerId)}/documents/${docId}/file`;
}

export const DOCUMENT_CATEGORIES = ['license', 'cnic', 'contract', 'vehicle_papers', 'insurance', 'lease', 'asset_deed', 'warranty', 'other'];
