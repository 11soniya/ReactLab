import { useState } from 'react';
import { GraduationCap, LogIn, UserPlus, Key, Mail, Lock, User, AlertCircle, Loader2 } from 'lucide-react';
import { classroomApi } from '../../utils/classroomApi';

export default function ClassroomAuth({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [role, setRole] = useState('student'); // 'student' | 'teacher'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teacherKey, setTeacherKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { user } = await classroomApi.login(email, password);
        try {
          localStorage.setItem('reactlab_classroom_session_sync', Date.now().toString());
        } catch {
          // ignore
        }
        onAuthenticated(user);
      } else {
        const { user } = await classroomApi.signup(email, name, password, role, teacherKey);
        try {
          localStorage.setItem('reactlab_classroom_session_sync', Date.now().toString());
        } catch {
          // ignore
        }
        onAuthenticated(user);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="classroom-auth-container">
      <div className="classroom-auth-card">
        <div className="classroom-auth-header">
          <div className="classroom-auth-badge">
            <GraduationCap size={28} />
          </div>
          <h2>ReactLab Classroom</h2>
          <p className="classroom-auth-subtitle">
            {mode === 'login'
              ? 'Sign in to access your classrooms and assignments'
              : 'Create an account to join or create classrooms'}
          </p>
        </div>

        <div className="auth-tab-group" role="tablist">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            <LogIn size={15} /> Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(null); }}
          >
            <UserPlus size={15} /> Register
          </button>
        </div>

        {error && (
          <div className="auth-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <>
              <div className="role-selector">
                <span className="role-label">I am a:</span>
                <div className="role-options">
                  <label className={`role-option ${role === 'student' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="role"
                      value="student"
                      checked={role === 'student'}
                      onChange={() => setRole('student')}
                    />
                    <strong>Student</strong>
                  </label>
                  <label className={`role-option ${role === 'teacher' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="role"
                      value="teacher"
                      checked={role === 'teacher'}
                      onChange={() => setRole('teacher')}
                    />
                    <strong>Teacher</strong>
                  </label>
                </div>
              </div>

              <label className="auth-field">
                <span>Full Name</span>
                <div className="input-with-icon">
                  <User size={16} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Johnson"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </label>
            </>
          )}

          <label className="auth-field">
            <span>Email Address</span>
            <div className="input-with-icon">
              <Mail size={16} />
              <input
                type="email"
                required
                placeholder="name@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div className="input-with-icon">
              <Lock size={16} />
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          </label>

          {mode === 'signup' && role === 'teacher' && (
            <label className="auth-field">
              <span>Teacher Access Key (optional if not configured)</span>
              <div className="input-with-icon">
                <Key size={16} />
                <input
                  type="password"
                  placeholder="Enter teacher secret key"
                  value={teacherKey}
                  onChange={e => setTeacherKey(e.target.value)}
                />
              </div>
            </label>
          )}

          <button
            type="submit"
            className="primary-button auth-submit-button"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {mode === 'login' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              `Create ${role === 'teacher' ? 'Teacher' : 'Student'} Account`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
