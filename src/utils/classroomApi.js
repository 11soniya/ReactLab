/**
 * Frontend client for Classroom API
 */

async function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const config = {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin'
  };

  const response = await fetch(endpoint, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const classroomApi = {
  // Auth
  async getMe() {
    return apiRequest('/api/classroom/auth/me');
  },

  async login(email, password) {
    return apiRequest('/api/classroom/auth/login', {
      method: 'POST',
      body: { email, password }
    });
  },

  async signup(email, name, password, role, teacherKey = '') {
    return apiRequest('/api/classroom/auth/signup', {
      method: 'POST',
      body: { email, name, password, role, teacherKey: teacherKey || undefined }
    });
  },

  async logout() {
    return apiRequest('/api/classroom/auth/logout', { method: 'POST' });
  },

  // Classrooms
  async listClassrooms() {
    return apiRequest('/api/classroom/list');
  },

  async getClassroom(id) {
    return apiRequest(`/api/classroom/${id}`);
  },

  async createClassroom(name) {
    return apiRequest('/api/classroom/create', {
      method: 'POST',
      body: { name }
    });
  },

  async joinClassroom(code) {
    return apiRequest('/api/classroom/join', {
      method: 'POST',
      body: { code }
    });
  },

  // Assignments
  async listAssignments(classroomId) {
    return apiRequest(`/api/classroom/${classroomId}/assignments`);
  },

  async getAssignment(assignmentId) {
    return apiRequest(`/api/classroom/assignments/${assignmentId}`);
  },

  async createAssignment(classroomId, title, question, dueDate = null) {
    return apiRequest('/api/classroom/assignments/create', {
      method: 'POST',
      body: { classroomId, title, question, dueDate }
    });
  },

  // Student Drafts
  async getDraft(assignmentId) {
    return apiRequest(`/api/classroom/assignments/${assignmentId}/draft`);
  },

  async saveDraft(assignmentId, files, folders, activeFile) {
    return apiRequest(`/api/classroom/assignments/${assignmentId}/draft`, {
      method: 'POST',
      body: { files, folders, activeFile }
    });
  },

  // One-time Submit
  async submitAssignment(assignmentId, files, folders, activeFile) {
    return apiRequest(`/api/classroom/assignments/${assignmentId}/submit`, {
      method: 'POST',
      body: { files, folders, activeFile }
    });
  },

  // Teacher Review
  async listSubmissions(assignmentId) {
    return apiRequest(`/api/classroom/assignments/${assignmentId}/submissions`);
  },

  async getSubmission(submissionId) {
    return apiRequest(`/api/classroom/submissions/${submissionId}`);
  },

  async markChecked(submissionId) {
    return apiRequest(`/api/classroom/submissions/${submissionId}/check`, {
      method: 'POST'
    });
  }
};
