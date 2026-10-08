import { useState, useEffect } from 'react';
import {
  GraduationCap,
  Plus,
  BookOpen,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Code2,
  Loader2,
  Users,
  Eye
} from 'lucide-react';
import { classroomApi } from '../../utils/classroomApi';

export default function StudentDashboard({ user, onOpenAssignment, onRefreshSession }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Join Classroom Modal
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => {
    loadClassrooms();
  }, []);

  async function loadClassrooms() {
    setLoading(true);
    setError(null);
    try {
      const res = await classroomApi.listClassrooms();
      setClassrooms(res.classrooms || []);
      if (res.classrooms && res.classrooms.length > 0 && !selectedClassroom) {
        selectClassroom(res.classrooms[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load your classrooms.');
    } finally {
      setLoading(false);
    }
  }

  async function selectClassroom(c) {
    setSelectedClassroom(c);
    setAssignmentsLoading(true);
    try {
      const res = await classroomApi.listAssignments(c.id);
      setAssignments(res.assignments || []);
    } catch (err) {
      setError(err.message || 'Failed to load assignments.');
    } finally {
      setAssignmentsLoading(false);
    }
  }

  async function handleJoinClassroom(e) {
    e.preventDefault();
    const cleanCode = (joinCode || '').trim().toUpperCase();
    if (!cleanCode) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await classroomApi.joinClassroom(cleanCode);
      setJoinCode('');
      setShowJoinModal(false);
      await loadClassrooms();
      selectClassroom(res.classroom);
    } catch (err) {
      setJoinError(err.message || 'Invalid join code. Please check with your teacher.');
      if (err.status === 401 || err.status === 403) {
        if (typeof onRefreshSession === 'function') {
          onRefreshSession();
        }
      }
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="classroom-dashboard-layout">
      {/* Sidebar: Joined Classrooms */}
      <aside className="classroom-sidebar">
        <div className="classroom-sidebar-head">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-[var(--accent)]" />
            <h3>Joined Classrooms</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Join Classroom"
            onClick={() => {
              setShowJoinModal(true);
              setJoinError(null);
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="classroom-nav-list">
          {classrooms.map(c => (
            <button
              key={c.id}
              type="button"
              className={`classroom-nav-item ${selectedClassroom?.id === c.id ? 'selected' : ''}`}
              onClick={() => selectClassroom(c)}
            >
              <div className="classroom-nav-info">
                <span className="classroom-nav-title">{c.name}</span>
                <span className="classroom-nav-meta">Teacher: {c.teacher_name}</span>
              </div>
              <ChevronRight size={14} className="text-[var(--muted)] opacity-60" />
            </button>
          ))}

          {classrooms.length === 0 && !loading && (
            <div className="classroom-empty-note">
              <p>You haven’t joined any classrooms yet.</p>
              <button
                type="button"
                className="secondary-button text-xs py-1.5 px-3"
                onClick={() => setShowJoinModal(true)}
              >
                <Plus size={14} /> Join a Classroom
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content: Assignments for Selected Classroom */}
      <main className="classroom-main-content">
        {selectedClassroom ? (
          <div className="student-classroom-view">
            <div className="classroom-hero-card">
              <div className="classroom-hero-info">
                <span className="classroom-badge">CLASSROOM</span>
                <h1>{selectedClassroom.name}</h1>
                <p className="classroom-meta-text">
                  Instructor: <strong>{selectedClassroom.teacher_name}</strong> · {assignments.length} assigned practicals
                </p>
              </div>
            </div>

            <div className="classroom-section-header">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-[var(--accent)]" />
                <h3>Assigned Practicals</h3>
              </div>
            </div>

            {assignmentsLoading ? (
              <div className="loading-state">
                <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                <span>Loading assignments…</span>
              </div>
            ) : assignments.length === 0 ? (
              <div className="empty-assignments-card">
                <BookOpen size={32} className="text-[var(--muted)]" />
                <h4>No assignments posted yet</h4>
                <p>Your teacher hasn’t posted any practical questions yet. Check back soon!</p>
              </div>
            ) : (
              <div className="student-assignments-grid">
                {assignments.map(a => {
                  const status = a.status || 'Pending';
                  const isDone = status === 'Submitted' || status === 'Checked';

                  return (
                    <div key={a.id} className="student-assignment-card">
                      <div className="student-assignment-header">
                        <div className="flex items-start justify-between gap-3">
                          <h4>{a.title}</h4>
                          <span className={`status-badge ${status.toLowerCase()}`}>
                            {status === 'Checked' ? (
                              <CheckCircle2 size={13} />
                            ) : status === 'Submitted' ? (
                              <Clock size={13} />
                            ) : (
                              <AlertCircle size={13} />
                            )}
                            {status}
                          </span>
                        </div>
                        <p className="student-assignment-question">{a.question}</p>
                      </div>

                      <div className="student-assignment-meta">
                        {a.due_date ? (
                          <div className="due-badge">
                            <Calendar size={13} />
                            <span>Due {new Date(a.due_date).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">No due date</span>
                        )}

                        {a.submitted_at && (
                          <span className="text-xs text-[var(--muted)]">
                            Submitted {new Date(a.submitted_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="student-assignment-actions">
                        <button
                          type="button"
                          className={`primary-button text-xs py-2 px-4 w-full justify-center ${isDone ? 'secondary-button' : ''}`}
                          onClick={() => onOpenAssignment(a)}
                        >
                          {isDone ? (
                            <>
                              <Eye size={14} /> View Submitted Solution
                            </>
                          ) : (
                            <>
                              <Code2 size={14} /> Open Code Editor
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state-container">
            <GraduationCap size={44} className="text-[var(--accent)] mb-3" />
            <h2>Welcome to Classroom</h2>
            <p>Join a classroom with the 6-character code from your teacher to see your assignments.</p>
            <button
              type="button"
              className="primary-button mt-4"
              onClick={() => setShowJoinModal(true)}
            >
              <Plus size={16} /> Join a Classroom
            </button>
          </div>
        )}
      </main>

      {/* Join Classroom Modal */}
      {showJoinModal && (
        <dialog className="modal" open>
          <div className="modal-heading">
            <h2>Join Classroom</h2>
            <button type="button" className="icon-button" onClick={() => setShowJoinModal(false)}>✕</button>
          </div>
          <form onSubmit={handleJoinClassroom}>
            <label>
              <span>Classroom Code</span>
              <input
                type="text"
                required
                maxLength={20}
                placeholder="e.g. 65U23N"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}
                autoFocus
              />
              <small>Ask your teacher for the 6-character classroom code.</small>
            </label>

            {joinError && (
              <div className="form-error mt-2">
                {joinError}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowJoinModal(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={joining || !joinCode.trim()}>
                {joining ? 'Joining…' : 'Join Classroom'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
