import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createClassroomDb } from '../server/classroom-db.js';
import { handleClassroomApi } from '../server/classroom-api.js';

function createMockEnv(custom = {}) {
  const sqlite = new DatabaseSync(':memory:');
  const classroomDb = createClassroomDb({ sqliteInstance: sqlite });
  return {
    CLASSROOM_DB: classroomDb,
    APP_ORIGIN: 'http://127.0.0.1:3000',
    TEACHER_SECRET_KEY: 'secret-teacher-key-123',
    LOCAL_DEV: true,
    ...custom
  };
}

function createRequest(url, method = 'GET', body = null, cookie = null) {
  const headers = new Headers();
  if (body) {
    headers.set('Content-Type', 'application/json');
  }
  if (cookie) {
    headers.set('Cookie', cookie);
  }
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/reactlab_classroom_session=([^;]+)/);
  return match ? `reactlab_classroom_session=${match[1]}` : null;
}

test('Classroom Module End-to-End Test Suite', async (t) => {
  const env = createMockEnv();
  await env.CLASSROOM_DB.init();

  let teacherCookie = null;
  let studentCookie = null;
  let secondStudentCookie = null;
  let teacherId = null;
  let studentId = null;
  let secondStudentId = null;
  let classroomId = null;
  let classroomCode = null;
  let assignmentId = null;
  let submissionId = null;

  // 1. Student Signup
  await t.test('Student can sign up and receives session cookie', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/signup', 'POST', {
      email: 'student@example.com',
      name: 'Alice Student',
      password: 'password123',
      role: 'student'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.user.email, 'student@example.com');
    assert.equal(data.user.role, 'student');
    studentId = data.user.id;
    studentCookie = extractCookie(res);
    assert.ok(studentCookie, 'Session cookie must be set');
  });

  // 2. Second Student Signup
  await t.test('Second student can sign up', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/signup', 'POST', {
      email: 'bob@example.com',
      name: 'Bob Student',
      password: 'password123',
      role: 'student'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 201);
    const data = await res.json();
    secondStudentId = data.user.id;
    secondStudentCookie = extractCookie(res);
    assert.ok(secondStudentCookie);
  });

  // 3. Duplicate Email Signup is Rejected
  await t.test('Duplicate email signup is rejected with 409 Conflict', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/signup', 'POST', {
      email: 'student@example.com',
      name: 'Another Alice',
      password: 'password456',
      role: 'student'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 409);
  });

  // 4. Teacher Signup with invalid key is rejected
  await t.test('Teacher signup with invalid key is rejected with 403 Forbidden', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/signup', 'POST', {
      email: 'fake_teacher@example.com',
      name: 'Fake Teacher',
      password: 'password123',
      role: 'teacher',
      teacherKey: 'wrong-key'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 403);
  });

  // 5. Teacher Signup with valid key succeeds
  await t.test('Teacher signup with valid key succeeds', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/signup', 'POST', {
      email: 'teacher@example.com',
      name: 'Professor Smith',
      password: 'password123',
      role: 'teacher',
      teacherKey: 'secret-teacher-key-123'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.user.role, 'teacher');
    teacherId = data.user.id;
    teacherCookie = extractCookie(res);
    assert.ok(teacherCookie);
  });

  // 6. Login verification
  await t.test('Login with valid credentials returns user session', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/login', 'POST', {
      email: 'teacher@example.com',
      password: 'password123'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.role, 'teacher');
  });

  // 7. Login with invalid password fails
  await t.test('Login with wrong password returns 401', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/login', 'POST', {
      email: 'teacher@example.com',
      password: 'wrongpassword'
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 401);
  });

  // 8. Auth ME endpoint
  await t.test('GET /auth/me returns authenticated user profile', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/me', 'GET', null, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.user.email, 'teacher@example.com');
  });

  // 9. Student cannot create classroom
  await t.test('Student cannot create classroom (403 Forbidden)', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/create', 'POST', {
      name: 'Unauthorized Class'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 403);
  });

  // 10. Teacher creates classroom
  await t.test('Teacher creates classroom and gets unique 6-char code', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/create', 'POST', {
      name: 'React Development — Section A'
    }, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.classroom.name, 'React Development — Section A');
    assert.equal(typeof data.classroom.code, 'string');
    assert.equal(data.classroom.code.length, 6);
    classroomId = data.classroom.id;
    classroomCode = data.classroom.code;
  });

  // 11. Student joins classroom with code
  await t.test('Student joins classroom with join code', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: classroomCode
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.classroom.id, classroomId);
  });

  // 11b. Second student can join with lowercase code
  await t.test('Second student can join with lowercase code', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: classroomCode.toLowerCase()
    }, secondStudentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.classroom.id, classroomId);
  });

  // 11c. Student can join with surrounding whitespace
  await t.test('Student can join with surrounding whitespace', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: `  ${classroomCode}  \n`
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.classroom.id, classroomId);
  });

  // 11d. Joining the same classroom twice is idempotent and does not create duplicate membership
  await t.test('Joining the same classroom twice is idempotent', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: classroomCode
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);

    const members = await env.CLASSROOM_DB.all(
      'SELECT * FROM classroom_members WHERE classroom_id = $1 AND student_id = $2',
      [classroomId, studentId]
    );
    assert.equal(members.length, 1, 'Should not create duplicate membership row');
  });

  // 11e. Teacher cannot join classroom as a student
  await t.test('Teacher cannot join classroom as a student (403 Forbidden)', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: classroomCode
    }, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.message, 'Only students can join classrooms.');
  });

  // 11f. Unauthenticated user cannot join classroom
  await t.test('Unauthenticated user cannot join classroom (401 Unauthorized)', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: classroomCode
    });
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 401);
  });

  // 11g. Student classroom list includes newly joined classroom
  await t.test('Student classroom list includes the joined classroom', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/list', 'GET', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.classrooms.length, 1);
    assert.equal(data.classrooms[0].id, classroomId);
    assert.equal(data.classrooms[0].name, 'React Development — Section A');
  });

  // 11h. Teacher roster reflects enrolled students
  await t.test('Teacher classroom details endpoint reflects enrolled students', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/${classroomId}`, 'GET', null, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.classroom.id, classroomId);
    assert.equal(data.students.length, 2); // Alice and Bob
    const studentNames = data.students.map(s => s.name);
    assert.ok(studentNames.includes('Alice Student'));
    assert.ok(studentNames.includes('Bob Student'));
  });

  // 12. Student joins with invalid code fails
  await t.test('Student joining with non-existent code returns 404', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: 'ZZZZ99'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 404);
  });

  // 12b. Empty code returns 400 Bad Request
  await t.test('Student joining with empty or whitespace-only code returns 400', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/join', 'POST', {
      code: '   '
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 400);
  });

  // 13. Teacher lists classrooms and sees student count
  await t.test('Teacher lists classrooms with student counts', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/list', 'GET', null, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.classrooms.length, 1);
    assert.equal(Number(data.classrooms[0].student_count), 2);
  });

  // 14. Teacher creates assignment
  await t.test('Teacher creates assignment in classroom', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/assignments/create', 'POST', {
      classroomId,
      title: 'Practical 1: State and Counter',
      question: 'Build a React counter component with increment, decrement, and reset buttons.',
      dueDate: Date.now() + 86400000
    }, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.assignment.title, 'Practical 1: State and Counter');
    assignmentId = data.assignment.id;
  });

  // 15. Student cannot create assignment
  await t.test('Student cannot create assignment (403 Forbidden)', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/assignments/create', 'POST', {
      classroomId,
      title: 'Hacked Assignment',
      question: 'Test question'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 403);
  });

  // 16. Student sees assignment with status Pending
  await t.test('Student sees assignment with initial status Pending', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/${classroomId}/assignments`, 'GET', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.assignments.length, 1);
    assert.equal(data.assignments[0].status, 'Pending');
  });

  // 17. Student autosaves draft
  const validFiles = {
    '/src/App.jsx': { type: 'file', code: 'export default function App() { return <div>Counter</div>; }' },
    '/src/styles.css': { type: 'file', code: 'body { color: blue; }' }
  };
  const validFolders = ['/src'];

  await t.test('Student autosaves assignment draft', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/draft`, 'POST', {
      files: validFiles,
      folders: validFolders,
      activeFile: '/src/App.jsx'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.saved, true);
  });

  // 18. Student retrieves autosaved draft
  await t.test('Student loads autosaved draft after refresh', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/draft`, 'GET', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isSubmitted, false);
    assert.deepEqual(data.draft.files, validFiles);
  });

  // 19. Path traversal or invalid files in draft are rejected
  await t.test('Unsafe file paths in draft are rejected with 400 Bad Request', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/draft`, 'POST', {
      files: {
        '/src/../../../etc/passwd': { type: 'file', code: 'evil' },
        '/src/App.jsx': { type: 'file', code: 'ok' }
      },
      folders: ['/src'],
      activeFile: '/src/App.jsx'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 400);
  });

  // 20. Student submits assignment (one-time final submit)
  await t.test('Student submits assignment once', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/submit`, 'POST', {
      files: validFiles,
      folders: validFolders,
      activeFile: '/src/App.jsx'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.submission.status, 'Submitted');
    submissionId = data.submission.id;
  });

  // 21. Resubmission is rejected with 409 Conflict
  await t.test('Resubmission or duplicate submit is rejected with 409 Conflict', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/submit`, 'POST', {
      files: validFiles,
      folders: validFolders,
      activeFile: '/src/App.jsx'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 409);
  });

  // 22. Modifying draft after submission is rejected with 409 Conflict
  await t.test('Updating draft after submission is rejected with 409 Conflict', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/draft`, 'POST', {
      files: validFiles,
      folders: validFolders,
      activeFile: '/src/App.jsx'
    }, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 409);
  });

  // 23. Draft GET returns isSubmitted: true
  await t.test('Draft GET after submission returns isSubmitted: true and submissionId', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/draft`, 'GET', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isSubmitted, true);
    assert.equal(data.status, 'Submitted');
  });

  // 24. Student sees updated assignment status as 'Submitted'
  await t.test('Student assignment list shows status "Submitted"', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/${classroomId}/assignments`, 'GET', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.assignments[0].status, 'Submitted');
  });

  // 25. Another student cannot view Alice\'s submission
  await t.test('Another student cannot access Alice\'s submission (403 Forbidden)', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/submissions/${submissionId}`, 'GET', null, secondStudentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 403);
  });

  // 26. Teacher sees submissions roster with Alice as Submitted
  await t.test('Teacher lists assignment submissions and sees Alice Submitted and Bob Pending', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/assignments/${assignmentId}/submissions`, 'GET', null, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.submissions.length, 2);
    const aliceSub = data.submissions.find(s => s.studentName === 'Alice Student');
    assert.ok(aliceSub);
    assert.equal(aliceSub.status, 'Submitted');
    assert.equal(aliceSub.submissionId, submissionId);
    const bobSub = data.submissions.find(s => s.studentName === 'Bob Student');
    assert.ok(bobSub);
    assert.equal(bobSub.status, 'Pending');
    assert.equal(bobSub.submissionId, null);
  });

  // 27. Teacher opens submission snapshot
  await t.test('Teacher opens submitted snapshot for code review', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/submissions/${submissionId}`, 'GET', null, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.submission.studentName, 'Alice Student');
    assert.deepEqual(data.submission.files, validFiles);
    assert.equal(data.submission.status, 'Submitted');
  });

  // 28. Student cannot mark submission Checked
  await t.test('Student cannot mark submission Checked (403 Forbidden)', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/submissions/${submissionId}/check`, 'POST', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 403);
  });

  // 29. Teacher marks submission Checked
  await t.test('Teacher marks submission Checked (status transitions to Checked)', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/submissions/${submissionId}/check`, 'POST', null, teacherCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'Checked');
  });

  // 30. Student sees Checked status
  await t.test('Student sees Checked status on assignment list and submission', async () => {
    const req = createRequest(`http://127.0.0.1:3000/api/classroom/${classroomId}/assignments`, 'GET', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.assignments[0].status, 'Checked');
  });

  // 31. Logout clears session
  await t.test('POST /auth/logout clears user session', async () => {
    const req = createRequest('http://127.0.0.1:3000/api/classroom/auth/logout', 'POST', null, studentCookie);
    const res = await handleClassroomApi(req, env);
    assert.equal(res.status, 200);
    const meReq = createRequest('http://127.0.0.1:3000/api/classroom/auth/me', 'GET', null, studentCookie);
    const meRes = await handleClassroomApi(meReq, env);
    const meData = await meRes.json();
    assert.equal(meData.user, null);
  });
});
