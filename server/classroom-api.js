import {
  authenticateUser,
  createSession,
  deleteSession,
  createSessionCookie,
  clearSessionCookie,
  checkRateLimit,
  hashPassword,
  verifyPassword,
  generateId,
  generateClassroomCode
} from './classroom-auth.js';

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function parseBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    throw fail('Expected application/json request body', 415);
  }
  const text = await request.text();
  if (text.length > 2_000_000) {
    throw fail('Request payload exceeds maximum allowed size (2MB).', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw fail('Invalid JSON payload', 400);
  }
}

export function validateVirtualFiles(files, folders) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw fail('Invalid practical files structure.', 400);
  }
  if (!files['/src/App.jsx']) {
    throw fail('Practical must contain /src/App.jsx.', 400);
  }
  const fileKeys = Object.keys(files);
  if (fileKeys.length > 100) {
    throw fail('Too many files (maximum 100).', 400);
  }

  for (const [filePath, fileObj] of Object.entries(files)) {
    if (typeof filePath !== 'string' || !filePath.startsWith('/src/')) {
      throw fail(`Invalid file path: ${filePath}. Files must start with /src/`, 400);
    }
    if (filePath.includes('\\') || filePath.slice(1).split('/').some(part => !part || part === '.' || part === '..')) {
      throw fail(`Unsafe path characters in: ${filePath}`, 400);
    }
    if (!fileObj || typeof fileObj.code !== 'string') {
      throw fail(`File content missing for: ${filePath}`, 400);
    }
    if (fileObj.code.length > 500_000) {
      throw fail(`File ${filePath} exceeds maximum 500KB size.`, 400);
    }
  }

  if (folders && Array.isArray(folders)) {
    for (const folder of folders) {
      if (typeof folder !== 'string' || (folder !== '/src' && !folder.startsWith('/src/'))) {
        throw fail(`Invalid folder path: ${folder}`, 400);
      }
      if (folder.includes('\\') || folder.slice(1).split('/').some(part => !part || part === '.' || part === '..')) {
        throw fail(`Unsafe folder path characters: ${folder}`, 400);
      }
    }
  }
}

export async function handleClassroomApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const origin = new URL(env.APP_ORIGIN || request.headers.get('origin') || 'http://127.0.0.1:3000').origin;
  const db = env.CLASSROOM_DB;

  if (!db) {
    return json({ message: 'Classroom database not configured.' }, 503);
  }

  try {
    // ------------------------------------------------------------------------
    // 1. AUTHENTICATION ENDPOINTS
    // ------------------------------------------------------------------------

    // POST /api/classroom/auth/signup
    if (path === '/api/classroom/auth/signup' && method === 'POST') {
      const { email, name, password, role, teacherKey } = await parseBody(request);

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw fail('Valid email address is required.', 400);
      }
      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        throw fail('Name must be between 2 and 100 characters.', 400);
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        throw fail('Password must be at least 6 characters long.', 400);
      }
      if (role !== 'student' && role !== 'teacher') {
        throw fail('Role must be either "student" or "teacher".', 400);
      }

      // Teacher authorization check:
      // If TEACHER_SECRET_KEY is configured in env, require it for teacher signup
      if (role === 'teacher' && env.TEACHER_SECRET_KEY) {
        if (!teacherKey || teacherKey.trim() !== env.TEACHER_SECRET_KEY.trim()) {
          throw fail('Invalid teacher authorization key.', 403);
        }
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check for existing user
      const existing = await db.get('SELECT id FROM classroom_users WHERE email = $1', [normalizedEmail]);
      if (existing) {
        throw fail('An account with this email already exists.', 409);
      }

      const { hash, salt } = hashPassword(password);
      const userId = generateId();
      const now = Date.now();

      await db.run(
        'INSERT INTO classroom_users (id, email, name, password_hash, password_salt, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, normalizedEmail, name.trim(), hash, salt, role, now]
      );

      const { token } = await createSession(db, userId);
      const user = { id: userId, email: normalizedEmail, name: name.trim(), role };

      return json(
        { user },
        201,
        { 'Set-Cookie': createSessionCookie(token, origin) }
      );
    }

    // POST /api/classroom/auth/login
    if (path === '/api/classroom/auth/login' && method === 'POST') {
      const clientIp = request.headers.get('x-forwarded-for') || 'default';
      if (!checkRateLimit(`login:${clientIp}`)) {
        throw fail('Too many login attempts. Please wait a minute and try again.', 429);
      }

      const { email, password } = await parseBody(request);
      if (!email || !password) {
        throw fail('Email and password are required.', 400);
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const userRow = await db.get(
        'SELECT id, email, name, password_hash, password_salt, role FROM classroom_users WHERE email = $1',
        [normalizedEmail]
      );

      if (!userRow || !verifyPassword(password, userRow.password_hash, userRow.password_salt)) {
        throw fail('Invalid email or password.', 401);
      }

      const { token } = await createSession(db, userRow.id);
      const user = { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role };

      return json(
        { user },
        200,
        { 'Set-Cookie': createSessionCookie(token, origin) }
      );
    }

    // GET /api/classroom/auth/me
    if (path === '/api/classroom/auth/me' && method === 'GET') {
      const user = await authenticateUser(request, db);
      if (!user) {
        return json({ user: null });
      }
      return json({ user });
    }

    // POST /api/classroom/auth/logout
    if (path === '/api/classroom/auth/logout' && method === 'POST') {
      await deleteSession(request, db);
      return json(
        { ok: true },
        200,
        { 'Set-Cookie': clearSessionCookie(origin) }
      );
    }

    // ------------------------------------------------------------------------
    // Require authentication for all remaining endpoints
    // ------------------------------------------------------------------------
    const user = await authenticateUser(request, db);
    if (!user) {
      throw fail('Authentication required.', 401);
    }

    // ------------------------------------------------------------------------
    // 2. CLASSROOM MANAGEMENT
    // ------------------------------------------------------------------------

    // POST /api/classroom/create (Teacher only)
    if (path === '/api/classroom/create' && method === 'POST') {
      if (user.role !== 'teacher') {
        throw fail('Only teachers can create classrooms.', 403);
      }

      const { name } = await parseBody(request);
      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        throw fail('Classroom name must be between 2 and 100 characters.', 400);
      }

      let code = generateClassroomCode().trim().toUpperCase();
      // Ensure code is unique
      for (let i = 0; i < 10; i++) {
        const existingCode = await db.get('SELECT id FROM classrooms WHERE UPPER(TRIM(code)) = $1', [code]);
        if (!existingCode) break;
        code = generateClassroomCode().trim().toUpperCase();
      }

      const classroomId = generateId();
      const now = Date.now();

      await db.run(
        'INSERT INTO classrooms (id, name, code, teacher_id, created_at) VALUES ($1, $2, $3, $4, $5)',
        [classroomId, name.trim(), code, user.id, now]
      );

      const classroom = {
        id: classroomId,
        name: name.trim(),
        code,
        teacher_id: user.id,
        created_at: now
      };

      return json({ classroom }, 201);
    }

    // POST /api/classroom/join (Student only)
    if (path === '/api/classroom/join' && method === 'POST') {
      if (user.role !== 'student') {
        throw fail('Only students can join classrooms.', 403);
      }

      const clientIp = request.headers.get('x-forwarded-for') || user.id;
      if (!checkRateLimit(`join:${clientIp}`)) {
        throw fail('Too many join requests. Please slow down.', 429);
      }

      const { code } = await parseBody(request);
      if (!code || typeof code !== 'string') {
        throw fail('Classroom code is required.', 400);
      }

      const normalizedCode = code.trim().toUpperCase();
      if (!normalizedCode) {
        throw fail('Classroom code cannot be empty.', 400);
      }

      const classroom = await db.get(
        `SELECT c.id, c.name, c.code, c.teacher_id, c.created_at, u.name as teacher_name
         FROM classrooms c
         JOIN classroom_users u ON c.teacher_id = u.id
         WHERE UPPER(TRIM(c.code)) = $1`,
        [normalizedCode]
      );

      if (!classroom) {
        throw fail('Invalid classroom code. Please check and try again.', 404);
      }

      // Check if already a member
      const existingMember = await db.get(
        'SELECT classroom_id FROM classroom_members WHERE classroom_id = $1 AND student_id = $2',
        [classroom.id, user.id]
      );

      if (!existingMember) {
        await db.run(
          'INSERT INTO classroom_members (classroom_id, student_id, joined_at) VALUES ($1, $2, $3)',
          [classroom.id, user.id, Date.now()]
        );
      }

      return json({ classroom });
    }

    // GET /api/classroom/list
    if (path === '/api/classroom/list' && method === 'GET') {
      if (user.role === 'teacher') {
        const classrooms = await db.all(
          `SELECT c.id, c.name, c.code, c.teacher_id, c.created_at,
                  (SELECT COUNT(*) FROM classroom_members WHERE classroom_id = c.id) as student_count,
                  (SELECT COUNT(*) FROM classroom_assignments WHERE classroom_id = c.id) as assignment_count
           FROM classrooms c
           WHERE c.teacher_id = $1
           ORDER BY c.created_at DESC`,
          [user.id]
        );
        return json({ classrooms });
      } else {
        const classrooms = await db.all(
          `SELECT c.id, c.name, c.code, c.teacher_id, c.created_at, u.name as teacher_name,
                  (SELECT COUNT(*) FROM classroom_assignments WHERE classroom_id = c.id) as assignment_count
           FROM classroom_members m
           JOIN classrooms c ON m.classroom_id = c.id
           JOIN classroom_users u ON c.teacher_id = u.id
           WHERE m.student_id = $1
           ORDER BY m.joined_at DESC`,
          [user.id]
        );
        return json({ classrooms });
      }
    }

    // GET /api/classroom/:id
    const classroomMatch = path.match(/^\/api\/classroom\/([a-zA-Z0-9_-]+)$/);
    if (classroomMatch && method === 'GET') {
      const classroomId = classroomMatch[1];
      const classroom = await db.get(
        `SELECT c.id, c.name, c.code, c.teacher_id, c.created_at, u.name as teacher_name
         FROM classrooms c
         JOIN classroom_users u ON c.teacher_id = u.id
         WHERE c.id = $1`,
        [classroomId]
      );

      if (!classroom) {
        throw fail('Classroom not found.', 404);
      }

      if (user.role === 'teacher') {
        if (classroom.teacher_id !== user.id) {
          throw fail('You do not have permission to view this classroom.', 403);
        }
        const students = await db.all(
          `SELECT u.id, u.name, u.email, m.joined_at
           FROM classroom_members m
           JOIN classroom_users u ON m.student_id = u.id
           WHERE m.classroom_id = $1
           ORDER BY u.name ASC`,
          [classroomId]
        );
        return json({ classroom, students });
      } else {
        const membership = await db.get(
          'SELECT joined_at FROM classroom_members WHERE classroom_id = $1 AND student_id = $2',
          [classroomId, user.id]
        );
        if (!membership) {
          throw fail('You are not enrolled in this classroom.', 403);
        }
        return json({ classroom });
      }
    }

    // ------------------------------------------------------------------------
    // 3. ASSIGNMENTS
    // ------------------------------------------------------------------------

    // POST /api/classroom/assignments/create (Teacher only)
    if (path === '/api/classroom/assignments/create' && method === 'POST') {
      if (user.role !== 'teacher') {
        throw fail('Only teachers can create assignments.', 403);
      }

      const { classroomId, title, question, dueDate } = await parseBody(request);

      if (!classroomId || typeof classroomId !== 'string') {
        throw fail('Classroom ID is required.', 400);
      }
      if (!title || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200) {
        throw fail('Assignment title must be between 2 and 200 characters.', 400);
      }
      if (!question || typeof question !== 'string' || question.trim().length < 5) {
        throw fail('Question statement is required (at least 5 characters).', 400);
      }

      // Verify teacher owns classroom
      const classroom = await db.get('SELECT id, teacher_id FROM classrooms WHERE id = $1', [classroomId]);
      if (!classroom) {
        throw fail('Classroom not found.', 404);
      }
      if (classroom.teacher_id !== user.id) {
        throw fail('You do not have permission to add assignments to this classroom.', 403);
      }

      const assignmentId = generateId();
      const now = Date.now();
      const parsedDueDate = dueDate ? Number(dueDate) || null : null;

      await db.run(
        'INSERT INTO classroom_assignments (id, classroom_id, title, question, due_date, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [assignmentId, classroomId, title.trim(), question.trim(), parsedDueDate, now]
      );

      const assignment = {
        id: assignmentId,
        classroom_id: classroomId,
        title: title.trim(),
        question: question.trim(),
        due_date: parsedDueDate,
        created_at: now
      };

      return json({ assignment }, 201);
    }

    // GET /api/classroom/:classroomId/assignments
    const classroomAssignmentsMatch = path.match(/^\/api\/classroom\/([a-zA-Z0-9_-]+)\/assignments$/);
    if (classroomAssignmentsMatch && method === 'GET') {
      const classroomId = classroomAssignmentsMatch[1];
      const classroom = await db.get('SELECT id, teacher_id FROM classrooms WHERE id = $1', [classroomId]);
      if (!classroom) {
        throw fail('Classroom not found.', 404);
      }

      if (user.role === 'teacher') {
        if (classroom.teacher_id !== user.id) {
          throw fail('Forbidden.', 403);
        }
        const assignments = await db.all(
          `SELECT a.id, a.classroom_id, a.title, a.question, a.due_date, a.created_at,
                  (SELECT COUNT(*) FROM classroom_submissions WHERE assignment_id = a.id) as submission_count,
                  (SELECT COUNT(*) FROM classroom_members WHERE classroom_id = a.classroom_id) as total_students
           FROM classroom_assignments a
           WHERE a.classroom_id = $1
           ORDER BY a.created_at DESC`,
          [classroomId]
        );
        return json({ assignments });
      } else {
        const membership = await db.get(
          'SELECT joined_at FROM classroom_members WHERE classroom_id = $1 AND student_id = $2',
          [classroomId, user.id]
        );
        if (!membership) {
          throw fail('You are not enrolled in this classroom.', 403);
        }

        const assignments = await db.all(
          `SELECT a.id, a.classroom_id, a.title, a.question, a.due_date, a.created_at,
                  s.id as submission_id, s.status as submission_status, s.submitted_at, s.checked_at
           FROM classroom_assignments a
           LEFT JOIN classroom_submissions s ON a.id = s.assignment_id AND s.student_id = $2
           WHERE a.classroom_id = $1
           ORDER BY a.created_at DESC`,
          [classroomId, user.id]
        );

        // Normalize status: 'Pending' if no submission exists, or 'Submitted', 'Checked'
        const normalized = assignments.map(a => ({
          ...a,
          status: a.submission_status ? (a.submission_status === 'checked' ? 'Checked' : 'Submitted') : 'Pending'
        }));

        return json({ assignments: normalized });
      }
    }

    // GET /api/classroom/assignments/:assignmentId
    const singleAssignmentMatch = path.match(/^\/api\/classroom\/assignments\/([a-zA-Z0-9_-]+)$/);
    if (singleAssignmentMatch && method === 'GET') {
      const assignmentId = singleAssignmentMatch[1];
      const assignment = await db.get(
        `SELECT a.id, a.classroom_id, a.title, a.question, a.due_date, a.created_at,
                c.name as classroom_name, c.teacher_id
         FROM classroom_assignments a
         JOIN classrooms c ON a.classroom_id = c.id
         WHERE a.id = $1`,
        [assignmentId]
      );

      if (!assignment) {
        throw fail('Assignment not found.', 404);
      }

      if (user.role === 'teacher') {
        if (assignment.teacher_id !== user.id) {
          throw fail('Forbidden.', 403);
        }
        return json({ assignment });
      } else {
        const membership = await db.get(
          'SELECT joined_at FROM classroom_members WHERE classroom_id = $1 AND student_id = $2',
          [assignment.classroom_id, user.id]
        );
        if (!membership) {
          throw fail('You are not enrolled in this classroom.', 403);
        }

        const submission = await db.get(
          'SELECT id, status, submitted_at, checked_at FROM classroom_submissions WHERE assignment_id = $1 AND student_id = $2',
          [assignmentId, user.id]
        );

        return json({
          assignment,
          submission: submission || null,
          status: submission ? (submission.status === 'checked' ? 'Checked' : 'Submitted') : 'Pending'
        });
      }
    }

    // ------------------------------------------------------------------------
    // 4. STUDENT DRAFT SAVING / LOADING
    // ------------------------------------------------------------------------

    // GET /api/classroom/assignments/:assignmentId/draft (Student only)
    const draftGetMatch = path.match(/^\/api\/classroom\/assignments\/([a-zA-Z0-9_-]+)\/draft$/);
    if (draftGetMatch && method === 'GET') {
      if (user.role !== 'student') {
        throw fail('Only students have drafts.', 403);
      }

      const assignmentId = draftGetMatch[1];
      // Check if already submitted
      const submission = await db.get(
        'SELECT id, status, submitted_at, checked_at FROM classroom_submissions WHERE assignment_id = $1 AND student_id = $2',
        [assignmentId, user.id]
      );

      if (submission) {
        return json({
          isSubmitted: true,
          submissionId: submission.id,
          status: submission.status === 'checked' ? 'Checked' : 'Submitted'
        });
      }

      const draft = await db.get(
        'SELECT files_json, folders_json, active_file, updated_at FROM classroom_drafts WHERE assignment_id = $1 AND student_id = $2',
        [assignmentId, user.id]
      );

      if (!draft) {
        return json({ draft: null, isSubmitted: false });
      }

      return json({
        isSubmitted: false,
        draft: {
          files: JSON.parse(draft.files_json),
          folders: JSON.parse(draft.folders_json),
          activeFile: draft.active_file,
          updatedAt: draft.updated_at
        }
      });
    }

    // POST /api/classroom/assignments/:assignmentId/draft (Student only)
    if (draftGetMatch && method === 'POST') {
      if (user.role !== 'student') {
        throw fail('Only students can save drafts.', 403);
      }

      const assignmentId = draftGetMatch[1];
      // Check if already submitted
      const submission = await db.get(
        'SELECT id FROM classroom_submissions WHERE assignment_id = $1 AND student_id = $2',
        [assignmentId, user.id]
      );
      if (submission) {
        throw fail('Assignment has already been submitted. Draft cannot be updated.', 409);
      }

      const { files, folders, activeFile } = await parseBody(request);
      validateVirtualFiles(files, folders);

      const now = Date.now();
      const filesJson = JSON.stringify(files);
      const foldersJson = JSON.stringify(folders || ['/src']);
      const selectedActiveFile = activeFile && files[activeFile] ? activeFile : '/src/App.jsx';

      // Upsert draft (compatible across sqlite & postgres)
      const existing = await db.get(
        'SELECT assignment_id FROM classroom_drafts WHERE assignment_id = $1 AND student_id = $2',
        [assignmentId, user.id]
      );

      if (existing) {
        await db.run(
          'UPDATE classroom_drafts SET files_json = $1, folders_json = $2, active_file = $3, updated_at = $4 WHERE assignment_id = $5 AND student_id = $6',
          [filesJson, foldersJson, selectedActiveFile, now, assignmentId, user.id]
        );
      } else {
        await db.run(
          'INSERT INTO classroom_drafts (assignment_id, student_id, files_json, folders_json, active_file, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [assignmentId, user.id, filesJson, foldersJson, selectedActiveFile, now]
        );
      }

      return json({ saved: true, updatedAt: now });
    }

    // ------------------------------------------------------------------------
    // 5. ONE-TIME FINAL SUBMISSION
    // ------------------------------------------------------------------------

    // POST /api/classroom/assignments/:assignmentId/submit (Student only)
    const submitMatch = path.match(/^\/api\/classroom\/assignments\/([a-zA-Z0-9_-]+)\/submit$/);
    if (submitMatch && method === 'POST') {
      if (user.role !== 'student') {
        throw fail('Only students can submit assignments.', 403);
      }

      const assignmentId = submitMatch[1];

      // Verify membership
      const assignment = await db.get(
        `SELECT a.id, a.classroom_id FROM classroom_assignments a
         JOIN classroom_members m ON a.classroom_id = m.classroom_id
         WHERE a.id = $1 AND m.student_id = $2`,
        [assignmentId, user.id]
      );

      if (!assignment) {
        throw fail('Assignment not found or you are not enrolled in this classroom.', 404);
      }

      // Check if already submitted
      const existing = await db.get(
        'SELECT id FROM classroom_submissions WHERE assignment_id = $1 AND student_id = $2',
        [assignmentId, user.id]
      );
      if (existing) {
        throw fail('You have already submitted this assignment. Resubmission is not permitted.', 409);
      }

      const { files, folders, activeFile } = await parseBody(request);
      validateVirtualFiles(files, folders);

      const submissionId = generateId();
      const now = Date.now();
      const filesJson = JSON.stringify(files);
      const foldersJson = JSON.stringify(folders || ['/src']);
      const selectedActiveFile = activeFile && files[activeFile] ? activeFile : '/src/App.jsx';

      try {
        await db.run(
          'INSERT INTO classroom_submissions (id, assignment_id, student_id, files_json, folders_json, active_file, status, submitted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [submissionId, assignmentId, user.id, filesJson, foldersJson, selectedActiveFile, 'submitted', now]
        );
      } catch (err) {
        // Enforce uniqueness constraint at database level
        if (String(err).includes('UNIQUE') || String(err).includes('duplicate key')) {
          throw fail('You have already submitted this assignment.', 409);
        }
        throw err;
      }

      // Clear draft upon successful submission
      await db.run(
        'DELETE FROM classroom_drafts WHERE assignment_id = $1 AND student_id = $2',
        [assignmentId, user.id]
      );

      return json(
        {
          submission: {
            id: submissionId,
            assignmentId,
            studentId: user.id,
            status: 'Submitted',
            submittedAt: now
          }
        },
        201
      );
    }

    // ------------------------------------------------------------------------
    // 6. TEACHER SUBMISSION LISTING & CODE REVIEW
    // ------------------------------------------------------------------------

    // GET /api/classroom/assignments/:assignmentId/submissions (Teacher only)
    const submissionsListMatch = path.match(/^\/api\/classroom\/assignments\/([a-zA-Z0-9_-]+)\/submissions$/);
    if (submissionsListMatch && method === 'GET') {
      if (user.role !== 'teacher') {
        throw fail('Only teachers can view submissions list.', 403);
      }

      const assignmentId = submissionsListMatch[1];
      const assignment = await db.get(
        `SELECT a.id, a.title, a.question, a.classroom_id, c.teacher_id
         FROM classroom_assignments a
         JOIN classrooms c ON a.classroom_id = c.id
         WHERE a.id = $1`,
        [assignmentId]
      );

      if (!assignment) {
        throw fail('Assignment not found.', 404);
      }
      if (assignment.teacher_id !== user.id) {
        throw fail('Forbidden.', 403);
      }

      // Fetch all enrolled students and join with their submission (if any)
      const rows = await db.all(
        `SELECT u.id as student_id, u.name as student_name, u.email as student_email,
                s.id as submission_id, s.status, s.submitted_at, s.checked_at
         FROM classroom_members m
         JOIN classroom_users u ON m.student_id = u.id
         LEFT JOIN classroom_submissions s ON s.assignment_id = $1 AND s.student_id = u.id
         WHERE m.classroom_id = $2
         ORDER BY u.name ASC`,
        [assignmentId, assignment.classroom_id]
      );

      const studentSubmissions = rows.map(r => ({
        studentId: r.student_id,
        studentName: r.student_name,
        studentEmail: r.student_email,
        submissionId: r.submission_id || null,
        status: r.status ? (r.status === 'checked' ? 'Checked' : 'Submitted') : 'Pending',
        submittedAt: r.submitted_at || null,
        checkedAt: r.checked_at || null
      }));

      return json({
        assignment: {
          id: assignment.id,
          title: assignment.title,
          question: assignment.question,
          classroomId: assignment.classroom_id
        },
        submissions: studentSubmissions
      });
    }

    // GET /api/classroom/submissions/:submissionId
    const singleSubmissionMatch = path.match(/^\/api\/classroom\/submissions\/([a-zA-Z0-9_-]+)$/);
    if (singleSubmissionMatch && method === 'GET') {
      const submissionId = singleSubmissionMatch[1];
      const sub = await db.get(
        `SELECT s.id, s.assignment_id, s.student_id, s.files_json, s.folders_json, s.active_file,
                s.status, s.submitted_at, s.checked_at,
                u.name as student_name, u.email as student_email,
                a.title as assignment_title, a.question as assignment_question,
                c.teacher_id, c.name as classroom_name
         FROM classroom_submissions s
         JOIN classroom_users u ON s.student_id = u.id
         JOIN classroom_assignments a ON s.assignment_id = a.id
         JOIN classrooms c ON a.classroom_id = c.id
         WHERE s.id = $1`,
        [submissionId]
      );

      if (!sub) {
        throw fail('Submission not found.', 404);
      }

      // Authorization check: User must be teacher who created the classroom OR the student who submitted it
      const isTeacher = user.role === 'teacher' && sub.teacher_id === user.id;
      const isOwnerStudent = user.role === 'student' && sub.student_id === user.id;

      if (!isTeacher && !isOwnerStudent) {
        throw fail('Forbidden: You do not have permission to view this submission.', 403);
      }

      return json({
        submission: {
          id: sub.id,
          assignmentId: sub.assignment_id,
          assignmentTitle: sub.assignment_title,
          assignmentQuestion: sub.assignment_question,
          classroomName: sub.classroom_name,
          studentId: sub.student_id,
          studentName: sub.student_name,
          studentEmail: sub.student_email,
          files: JSON.parse(sub.files_json),
          folders: JSON.parse(sub.folders_json),
          activeFile: sub.active_file,
          status: sub.status === 'checked' ? 'Checked' : 'Submitted',
          submittedAt: sub.submitted_at,
          checkedAt: sub.checked_at
        }
      });
    }

    // POST /api/classroom/submissions/:submissionId/check (Teacher only)
    const checkMatch = path.match(/^\/api\/classroom\/submissions\/([a-zA-Z0-9_-]+)\/check$/);
    if (checkMatch && method === 'POST') {
      if (user.role !== 'teacher') {
        throw fail('Only teachers can mark submissions Checked.', 403);
      }

      const submissionId = checkMatch[1];
      const sub = await db.get(
        `SELECT s.id, s.status, c.teacher_id
         FROM classroom_submissions s
         JOIN classroom_assignments a ON s.assignment_id = a.id
         JOIN classrooms c ON a.classroom_id = c.id
         WHERE s.id = $1`,
        [submissionId]
      );

      if (!sub) {
        throw fail('Submission not found.', 404);
      }
      if (sub.teacher_id !== user.id) {
        throw fail('Forbidden: You do not own this classroom.', 403);
      }

      const now = Date.now();
      await db.run(
        'UPDATE classroom_submissions SET status = $1, checked_at = $2 WHERE id = $3',
        ['checked', now, submissionId]
      );

      return json({
        ok: true,
        submissionId,
        status: 'Checked',
        checkedAt: now
      });
    }

    return json({ message: `Classroom endpoint not found: ${path}` }, 404);
  } catch (err) {
    const status = Number.isInteger(err.status) ? err.status : 500;
    const message = err.message || (status >= 500 ? 'Internal server error.' : 'Request failed.');
    return json({ message }, status);
  }
}
