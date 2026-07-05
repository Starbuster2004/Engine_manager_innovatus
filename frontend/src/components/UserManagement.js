'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { UserPlus, KeyRound, Trash2, Save } from 'lucide-react';

export default function UserManagement({ currentUserRole }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('operator');

  // Change password states
  const [editingUserId, setEditingUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      const payload = {
        username: username.trim(),
        password,
        full_name: fullName.trim(),
        role: currentUserRole === 'supervisor' ? 'operator' : role,
      };

      await api.createUser(payload);
      setSuccess(`User ${username} created successfully!`);
      setUsername('');
      setPassword('');
      setFullName('');
      setRole('operator');
      setShowAddForm(false);
      loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId, name) => {
    if (!confirm(`Are you sure you want to delete user "${name}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.deleteUser(userId);
      setSuccess(`User "${name}" deleted successfully.`);
      loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      await api.changePassword(editingUserId, newPassword);
      setSuccess('Password updated successfully.');
      setNewPassword('');
      setEditingUserId(null);
    } catch (err) {
      setError(err.message || 'Failed to update password');
    }
  };

  const allowedRoles = currentUserRole === 'plant_manager' ? ['supervisor', 'operator'] : ['operator'];

  return (
    <div className="animate-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
          Manage {currentUserRole === 'plant_manager' ? 'Supervisors & Operators' : 'Operators'}
        </h2>
        <button 
          className="btn btn-primary"
          onClick={() => {
            setShowAddForm(!showAddForm);
            setEditingUserId(null);
            setError('');
            setSuccess('');
          }}
        >
          {showAddForm ? 'Cancel' : <><UserPlus size={14} /> Add New Account</>}
        </button>
      </div>

      {error && <div className="badge badge-danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textTransform: 'none' }}>{error}</div>}
      {success && <div className="badge badge-success" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textTransform: 'none' }}>{success}</div>}

      {/* Add User Form */}
      {showAddForm && (
        <div className="card-stitch" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'var(--bg-secondary)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 700 }}>Create New User Account</h3>
          <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Username</label>
              <input
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. operator4"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Name</label>
              <input
                className="input"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Amit Kumar"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
              />
            </div>
            {currentUserRole === 'plant_manager' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</label>
                <select
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{ height: '38px' }}
                >
                  <option value="operator">Operator</option>
                  <option value="supervisor">Supervisor</option>
                </select>
              </div>
            )}
            <button type="submit" className="btn btn-primary" style={{ height: '38px' }}>
              <Save size={14} />
              Save User
            </button>
          </form>
        </div>
      )}

      {/* Change Password Panel */}
      {editingUserId && (
        <div className="card-stitch" style={{ padding: '1.5rem', marginBottom: '2rem', background: 'var(--bg-secondary)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 700 }}>
            Change Password for {users.find(u => u.id === editingUserId)?.full_name}
          </h3>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', maxWidth: '500px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
              <label style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)' }}>New Password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
              />
            </div>
            <button type="submit" className="btn btn-success" style={{ height: '38px' }}>Update</button>
            <button type="button" className="btn btn-outline" onClick={() => setEditingUserId(null)} style={{ height: '38px' }}>Cancel</button>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="table-container">
        {loading ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading accounts...</p>
        ) : users.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No accounts registered.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Created At</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{u.username}</td>
                  <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                  <td>
                    <span className={`badge ${u.role === 'supervisor' ? 'badge-warning' : 'badge-info'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setEditingUserId(u.id);
                          setShowAddForm(false);
                          setError('');
                          setSuccess('');
                        }}
                      >
                        <KeyRound size={12} />
                        Reset PW
                      </button>
                      <button 
                        className="btn btn-danger"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleDeleteUser(u.id, u.full_name)}
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
