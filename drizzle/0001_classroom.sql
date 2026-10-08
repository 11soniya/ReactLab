-- Classroom Module Database Schema

CREATE TABLE IF NOT EXISTS classroom_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES classroom_users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS classrooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES classroom_users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_members (
  classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES classroom_users(id) ON DELETE CASCADE,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (classroom_id, student_id)
);

CREATE TABLE IF NOT EXISTS classroom_assignments (
  id TEXT PRIMARY KEY,
  classroom_id TEXT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  due_date BIGINT,
  starter_files_json TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS classroom_drafts (
  assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES classroom_users(id) ON DELETE CASCADE,
  files_json TEXT NOT NULL,
  folders_json TEXT NOT NULL,
  active_file TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS classroom_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES classroom_users(id) ON DELETE CASCADE,
  files_json TEXT NOT NULL,
  folders_json TEXT NOT NULL,
  active_file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'checked')),
  submitted_at BIGINT NOT NULL,
  checked_at BIGINT,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms(code);
CREATE INDEX IF NOT EXISTS idx_classroom_members_student ON classroom_members(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom ON classroom_assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON classroom_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON classroom_submissions(student_id);
