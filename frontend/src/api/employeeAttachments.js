import api from './axios';

// Shared upload helpers — used both by EmployeeAttachments' "live" mode
// (existing employee, uploads immediately) and by EmployeeFormPage's staged
// batch commit right after a new employee is created.

export async function uploadEmployeePhoto(employeeId, file, params) {
  const form = new FormData();
  form.append('photo', file);
  const { data } = await api.post(`/employees/${employeeId}/photo`, form, { params });
  return data.employee;
}

export async function uploadEmployeeCnicImage(employeeId, file, params) {
  const form = new FormData();
  form.append('cnic_image', file);
  const { data } = await api.post(`/employees/${employeeId}/cnic-image`, form, { params });
  return data.employee;
}

export async function uploadEmployeeDocument(employeeId, file, title, params) {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  const { data } = await api.post(`/employees/${employeeId}/documents`, form, { params });
  return data.document;
}
