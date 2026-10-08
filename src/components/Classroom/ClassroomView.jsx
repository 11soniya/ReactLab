import { useState, useEffect } from 'react';
import { LogOut, User, GraduationCap, ShieldCheck, Loader2 } from 'lucide-react';
import { classroomApi } from '../../utils/classroomApi';
import ClassroomAuth from './ClassroomAuth';
import TeacherDashboard from './TeacherDashboard';
import StudentDashboard from './StudentDashboard';
import ClassroomEditor from './ClassroomEditor';
import SubmissionReview from './SubmissionReview';

export default function ClassroomView({ theme = 'dark' }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Student active view
  const [activeAssignment, setActiveAssignment] = useState(null);

  // Teacher active view
  const [reviewSubmissionId, setReviewSubmissionId] = useState(null);

  useEffect(() => {
    checkSession(true);

    function handleSyncEvent(e) {
      if (e.key === 'reactlab_classroom_session_sync') {
        checkSession(false);
      }
    }

    function handleFocus() {
      checkSession(false);
    }

    window.addEventListener('storage', handleSyncEvent);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleSyncEvent);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  async function checkSession(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const res = await classroomApi.getMe();
      setUser(res.user || null);
    } catch {
      setUser(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await classroomApi.logout();
      try {
        localStorage.setItem('reactlab_classroom_session_sync', Date.now().toString());
      } catch {
        // ignore
      }
      setUser(null);
      setActiveAssignment(null);
      setReviewSubmissionId(null);
    } catch (err) {
      alert(err.message || 'Logout failed.');
    }
  }

  if (loading) {
    return (
      <div className="classroom-loading-screen">
        <Loader2 size={36} className="animate-spin text-[var(--accent)]" />
        <p className="mt-3 text-sm text-[var(--muted)]">Loading Classroom…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="classroom-wrapper">
        <ClassroomAuth onAuthenticated={u => setUser(u)} />
      </div>
    );
  }

  return (
    <div className="classroom-wrapper">
      {/* Classroom User Sub-header */}
      <div className="classroom-user-bar">
        <div className="classroom-user-brand">
          <GraduationCap size={20} className="text-[var(--accent)]" />
          <span>ReactLab Classroom</span>
        </div>

        <div className="classroom-user-actions">
          <div className="classroom-user-profile">
            <User size={15} />
            <strong>{user.name}</strong>
            <span className={`role-badge ${user.role}`}>
              {user.role === 'teacher' ? 'Teacher' : 'Student'}
            </span>
          </div>

          <button
            type="button"
            className="secondary-button logout-button text-xs py-1.5 px-3"
            onClick={handleLogout}
            title="Sign out of Classroom"
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

      {/* Role-specific Body Views */}
      <div className="classroom-body">
        {user.role === 'teacher' ? (
          reviewSubmissionId ? (
            <SubmissionReview
              submissionId={reviewSubmissionId}
              theme={theme}
              onBack={() => setReviewSubmissionId(null)}
            />
          ) : (
            <TeacherDashboard
              user={user}
              onOpenReview={subId => setReviewSubmissionId(subId)}
              onRefreshSession={() => checkSession(false)}
            />
          )
        ) : (
          activeAssignment ? (
            <ClassroomEditor
              assignment={activeAssignment}
              user={user}
              theme={theme}
              onBack={() => setActiveAssignment(null)}
            />
          ) : (
            <StudentDashboard
              user={user}
              onOpenAssignment={asst => setActiveAssignment(asst)}
              onRefreshSession={() => checkSession(false)}
            />
          )
        )}
      </div>
    </div>
  );
}
