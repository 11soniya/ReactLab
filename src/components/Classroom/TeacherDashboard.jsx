import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  BookOpen,
  Copy,
  Check,
  Calendar,
  Clock,
  ChevronRight,
  ArrowLeft,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  GraduationCap
} from 'lucide-react';
import { classroomApi } from '../../utils/classroomApi';

export default function TeacherDashboard({ user, onOpenReview }) {
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [classroomDetails, setClassroomDetails] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissionsData, setSubmissionsData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modals
  const [showCreateClassroom, setShowCreateClassroom] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [creatingAssignment, setCreatingAssignment] = useState(false);

  // Copy code feedback
  const [copiedCode, setCopiedCode] = useState(false);

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
      setError(err.message || 'Failed to load classrooms.');
    } finally {
      setLoading(false);
    }
  }

  async function selectClassroom(c) {
    setSelectedClassroom(c);
    setSelectedAssignment(null);
    setSubmissionsData(null);
    setSubLoading(true);
    try {
      const [detailsRes, assignmentsRes] = await Promise.all([
        classroomApi.getClassroom(c.id),
        classroomApi.listAssignments(c.id)
      ]);
      setClassroomDetails(detailsRes);
      setAssignments(assignmentsRes.assignments || []);
    } catch (err) {
      setError(err.message || 'Failed to load classroom details.');
    } finally {
      setSubLoading(false);
    }
  }

  async function selectAssignment(assignment) {
    setSelectedAssignment(assignment);
    setSubLoading(true);
    try {
      const res = await classroomApi.listSubmissions(assignment.id);
      setSubmissionsData(res);
    } catch (err) {
      setError(err.message || 'Failed to load submissions.');
    } finally {
      setSubLoading(false);
    }
  }

  async function handleCreateClassroom(e) {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setCreatingClass(true);
    try {
      const res = await classroomApi.createClassroom(newClassName.trim());
      setNewClassName('');
      setShowCreateClassroom(false);
      await loadClassrooms();
      selectClassroom(res.classroom);
    } catch (err) {
      alert(err.message || 'Failed to create classroom.');
    } finally {
      setCreatingClass(false);
    }
  }

  async function handleCreateAssignment(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newQuestion.trim() || !selectedClassroom) return;
    setCreatingAssignment(true);
    try {
      const dueTimestamp = newDueDate ? new Date(newDueDate).getTime() : null;
      await classroomApi.createAssignment(
        selectedClassroom.id,
        newTitle.trim(),
        newQuestion.trim(),
        dueTimestamp
      );
      setNewTitle('');
      setNewQuestion('');
      setNewDueDate('');
      setShowCreateAssignment(false);
      // Reload assignments
      const res = await classroomApi.listAssignments(selectedClassroom.id);
      setAssignments(res.assignments || []);
    } catch (err) {
      alert(err.message || 'Failed to create assignment.');
    } finally {
      setCreatingAssignment(false);
    }
  }

  function copyJoinCode(code) {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="classroom-dashboard-layout">
      {/* Left Column: Classrooms list */}
      <aside className="classroom-sidebar">
        <div className="classroom-sidebar-head">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-[var(--accent)]" />
            <h3>My Classrooms</h3>
          </div>
          <button
            type="button"
            className="icon-button"
            title="Create Classroom"
            onClick={() => setShowCreateClassroom(true)}
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
                <span className="classroom-nav-meta">
                  Code: <code>{c.code}</code> · {c.student_count || 0} students
                </span>
              </div>
              <ChevronRight size={14} className="text-[var(--muted)] opacity-60" />
            </button>
          ))}

          {classrooms.length === 0 && !loading && (
            <div className="classroom-empty-note">
              <p>No classrooms yet.</p>
              <button
                type="button"
                className="secondary-button text-xs py-1.5 px-3"
                onClick={() => setShowCreateClassroom(true)}
              >
                <Plus size={14} /> Create a classroom
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="classroom-main-content">
        {selectedAssignment ? (
          /* Assignment Submissions View */
          <div className="assignment-detail-view">
            <div className="assignment-detail-header">
              <button
                type="button"
                className="back-link-btn"
                onClick={() => {
                  setSelectedAssignment(null);
                  setSubmissionsData(null);
                }}
              >
                <ArrowLeft size={16} /> Back to Classroom
              </button>
              <div className="assignment-title-row">
                <div>
                  <h2>{selectedAssignment.title}</h2>
                  <p className="assignment-question-preview">{selectedAssignment.question}</p>
                </div>
              </div>
            </div>

            <div className="submissions-section">
              <div className="submissions-header">
                <h3>Student Submissions</h3>
                <span className="submissions-count">
                  {submissionsData?.submissions?.filter(s => s.status !== 'Pending').length || 0} of {submissionsData?.submissions?.length || 0} submitted
                </span>
              </div>

              {subLoading ? (
                <div className="loading-state">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                  <span>Loading submissions…</span>
                </div>
              ) : submissionsData?.submissions?.length === 0 ? (
                <div className="empty-submissions-card">
                  <Users size={32} className="text-[var(--muted)]" />
                  <p>No students have joined this classroom yet.</p>
                  <p className="text-xs text-[var(--muted)]">Share the join code <code>{selectedClassroom?.code}</code> with your students.</p>
                </div>
              ) : (
                <div className="submissions-table-wrapper">
                  <table className="submissions-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Submitted At</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissionsData?.submissions?.map(sub => (
                        <tr key={sub.studentId}>
                          <td className="student-name-cell">
                            <strong>{sub.studentName}</strong>
                          </td>
                          <td className="text-[var(--muted)] text-xs">{sub.studentEmail}</td>
                          <td>
                            <span className={`status-badge ${sub.status.toLowerCase()}`}>
                              {sub.status === 'Checked' ? (
                                <CheckCircle2 size={13} />
                              ) : sub.status === 'Submitted' ? (
                                <Clock size={13} />
                              ) : (
                                <AlertCircle size={13} />
                              )}
                              {sub.status}
                            </span>
                          </td>
                          <td className="text-xs text-[var(--muted)]">
                            {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'}
                          </td>
                          <td>
                            {sub.submissionId ? (
                              <button
                                type="button"
                                className="primary-button text-xs py-1 px-3"
                                onClick={() => onOpenReview(sub.submissionId)}
                              >
                                <Eye size={13} /> Review & Run
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--muted)]">Awaiting submission</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : selectedClassroom ? (
          /* Classroom Overview */
          <div className="classroom-overview">
            <div className="classroom-hero-card">
              <div className="classroom-hero-info">
                <span className="classroom-badge">CLASSROOM</span>
                <h1>{selectedClassroom.name}</h1>
                <p className="classroom-meta-text">
                  Created {new Date(selectedClassroom.created_at).toLocaleDateString()} · {assignments.length} assignments
                </p>
              </div>

              <div className="join-code-box">
                <span className="join-code-label">STUDENT JOIN CODE</span>
                <div className="join-code-display">
                  <strong>{selectedClassroom.code}</strong>
                  <button
                    type="button"
                    className="copy-code-btn"
                    title="Copy join code"
                    onClick={() => copyJoinCode(selectedClassroom.code)}
                  >
                    {copiedCode ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
                <small className="text-[11px] text-[var(--muted)]">Give this 6-character code to students</small>
              </div>
            </div>

            {/* Assignments List */}
            <div className="classroom-section-header">
              <div className="flex items-center gap-2">
                <BookOpen size={18} className="text-[var(--accent)]" />
                <h3>Assignments</h3>
              </div>
              <button
                type="button"
                className="primary-button text-xs py-2 px-3.5"
                onClick={() => setShowCreateAssignment(true)}
              >
                <Plus size={15} /> Create Assignment
              </button>
            </div>

            <div className="assignments-grid">
              {assignments.map(a => (
                <div
                  key={a.id}
                  className="assignment-card"
                  onClick={() => selectAssignment(a)}
                >
                  <div className="assignment-card-body">
                    <h4>{a.title}</h4>
                    <p className="assignment-card-question">{a.question}</p>
                    {a.due_date && (
                      <div className="assignment-due-meta">
                        <Calendar size={13} />
                        <span>Due: {new Date(a.due_date).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  <div className="assignment-card-footer">
                    <span className="assignment-submission-stat">
                      {a.submission_count || 0} of {a.total_students || 0} submitted
                    </span>
                    <span className="view-submissions-link">
                      View Submissions <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              ))}

              {assignments.length === 0 && !subLoading && (
                <div className="empty-assignments-card">
                  <BookOpen size={32} className="text-[var(--muted)]" />
                  <h4>No assignments posted yet</h4>
                  <p>Assign practical questions for your students to solve and submit.</p>
                  <button
                    type="button"
                    className="primary-button text-xs py-2 px-4"
                    onClick={() => setShowCreateAssignment(true)}
                  >
                    <Plus size={15} /> New Assignment
                  </button>
                </div>
              )}
            </div>

            {/* Students Roster */}
            <div className="classroom-section-header mt-8">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-[var(--accent)]" />
                <h3>Enrolled Students ({classroomDetails?.students?.length || 0})</h3>
              </div>
            </div>

            <div className="students-roster-card">
              {classroomDetails?.students?.length > 0 ? (
                <div className="roster-list">
                  {classroomDetails.students.map(s => (
                    <div key={s.id} className="roster-item">
                      <div className="roster-avatar">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="roster-info">
                        <strong>{s.name}</strong>
                        <span>{s.email}</span>
                      </div>
                      <span className="roster-date">Joined {new Date(s.joined_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-roster-text">
                  <p>No students enrolled yet. Have students sign up and join using code <strong>{selectedClassroom.code}</strong>.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state-container">
            <GraduationCap size={44} className="text-[var(--accent)] mb-3" />
            <h2>Welcome to Classroom</h2>
            <p>Create a classroom and assign React practicals to your students.</p>
            <button
              type="button"
              className="primary-button mt-4"
              onClick={() => setShowCreateClassroom(true)}
            >
              <Plus size={16} /> Create Classroom
            </button>
          </div>
        )}
      </main>

      {/* Create Classroom Modal */}
      {showCreateClassroom && (
        <dialog className="modal" open>
          <div className="modal-heading">
            <h2>Create New Classroom</h2>
            <button type="button" className="icon-button" onClick={() => setShowCreateClassroom(false)}>✕</button>
          </div>
          <form onSubmit={handleCreateClassroom}>
            <label>
              <span>Classroom Name</span>
              <input
                type="text"
                required
                placeholder="e.g. React Development — Section A"
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
                autoFocus
              />
              <small>Students will see this title when they join with their code.</small>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowCreateClassroom(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={creatingClass}>
                {creatingClass ? 'Creating…' : 'Create Classroom'}
              </button>
            </div>
          </form>
        </dialog>
      )}

      {/* Create Assignment Modal */}
      {showCreateAssignment && (
        <dialog className="modal" open>
          <div className="modal-heading">
            <h2>Create Assignment</h2>
            <button type="button" className="icon-button" onClick={() => setShowCreateAssignment(false)}>✕</button>
          </div>
          <form onSubmit={handleCreateAssignment}>
            <label>
              <span>Assignment Title</span>
              <input
                type="text"
                required
                placeholder="e.g. Practical 1: Counter with Hooks"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span>Question Statement / Instructions</span>
              <textarea
                required
                rows={5}
                placeholder="Describe the React exercise, components to create, expected behavior, and requirements..."
                value={newQuestion}
                onChange={e => setNewQuestion(e.target.value)}
              />
            </label>
            <label>
              <span>Due Date (optional)</span>
              <input
                type="date"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowCreateAssignment(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={creatingAssignment}>
                {creatingAssignment ? 'Publishing…' : 'Publish Assignment'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
