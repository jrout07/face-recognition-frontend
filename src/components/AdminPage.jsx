import React, { useState, useEffect } from 'react';
import api from './api'; // your centralized API instance

export default function AdminPage() {
  const [logged, setLogged] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', password: '' });
  const [pending, setPending] = useState([]);
  const [filterRole, setFilterRole] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const DEFAULT_ADMIN = { username: 'admin', password: 'admin123' };

  // Fetch pending users from backend
  const fetchPending = async () => {
    try {
      const res = await api.get('/admin/pending');
      if (res.data.success) setPending(res.data.pending);
      else alert(res.data.error || 'Failed to fetch pending registrations');
    } catch (err) {
      alert('Error fetching pending users: ' + (err.response?.data?.error || err.message));
    }
  };

  // Approve user
  const approve = async (userId) => {
    try {
      const res = await api.post('/admin/approve', { userId });
      if (res.data.success) {
        alert('User approved');
        fetchPending();
      } else alert(res.data.error);
    } catch (err) {
      alert('Error approving user: ' + (err.response?.data?.error || err.message));
    }
  };

  // Reject user
  const reject = async (userId) => {
    try {
      const res = await api.post('/admin/reject', { userId });
      if (res.data.success) {
        alert('User rejected');
        fetchPending();
      } else alert(res.data.error);
    } catch (err) {
      alert('Error rejecting user: ' + (err.response?.data?.error || err.message));
    }
  };

  // Admin login
  const handleLogin = (e) => {
    e.preventDefault();
    if (adminForm.username === DEFAULT_ADMIN.username && adminForm.password === DEFAULT_ADMIN.password) {
      setLogged(true);
      fetchPending();
    } else {
      alert('Invalid admin credentials');
    }
  };

  // Logout
  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      setLogged(false);
      setAdminForm({ username: '', password: '' });
      setPending([]);
      setFilterRole('all');
      setSearchQuery('');
    }
  };

  // Auto-refresh pending users every 10 seconds
  useEffect(() => {
    if (logged) {
      const interval = setInterval(fetchPending, 10000);
      return () => clearInterval(interval);
    }
  }, [logged]);

  // Filtered pending users
  const filteredPending = pending.filter(p => 
    (filterRole === 'all' || p.role === filterRole) &&
    (p.userId.toLowerCase().includes(searchQuery.toLowerCase()) ||
     p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Button styles
  const buttonStyle = {
    padding: '10px 18px',
    borderRadius: 25,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: '0.3s',
  };

  const approveButton = {
    ...buttonStyle,
    background: 'linear-gradient(135deg, #6CCF7E, #2ECC71)',
    color: '#fff',
    marginRight: 5,
  };

  const rejectButton = {
    ...buttonStyle,
    background: 'linear-gradient(135deg, #F26C6C, #E74C3C)',
    color: '#fff',
  };

  const loginButton = {
    ...buttonStyle,
    background: 'linear-gradient(135deg, #3498DB, #2980B9)',
    color: '#fff',
  };

  const logoutButton = {
    ...buttonStyle,
    background: 'linear-gradient(135deg, #F39C12, #D35400)',
    color: '#fff',
    marginBottom: 20,
  };

  return (
    <div style={{ padding: 30, fontFamily: 'Arial, sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: 30 }}>Admin Panel</h2>

      {!logged ? (
        <div style={{ textAlign: 'center' }}>
          <p>Default credentials (local): <strong>username=admin</strong>, <strong>password=admin123</strong></p>
          <form onSubmit={handleLogin} style={{ display: 'inline-block', marginTop: 20 }}>
            <div style={{ marginBottom: 15 }}>
              <input
                placeholder="Username"
                value={adminForm.username}
                onChange={e => setAdminForm({ ...adminForm, username: e.target.value })}
                style={{ padding: 10, width: 250, borderRadius: 6, border: '1px solid #ccc', marginBottom: 10 }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <input
                type="password"
                placeholder="Password"
                value={adminForm.password}
                onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                style={{ padding: 10, width: 250, borderRadius: 6, border: '1px solid #ccc', marginBottom: 20 }}
              />
            </div>
            <button type="submit" style={loginButton}>Login</button>
          </form>
        </div>
      ) : (
        <div>
          <button style={logoutButton} onClick={handleLogout}>Logout</button>

          <div style={{ marginBottom: 15 }}>
            <label>Filter by Role: </label>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ padding: 8, borderRadius: 6, marginLeft: 5 }}>
              <option value="all">All</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
            </select>

            <input
              type="text"
              placeholder="Search by User ID or Name"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ccc', marginLeft: 15, width: 200 }}
            />
          </div>

          <h4>Pending Registrations</h4>
          {filteredPending.length === 0 ? (
            <p>No pending users</p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: '#f9f9f9', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ border: '1px solid #ccc', padding: 10 }}>User ID</th>
                    <th style={{ border: '1px solid #ccc', padding: 10 }}>Name</th>
                    <th style={{ border: '1px solid #ccc', padding: 10 }}>Role</th>
                    <th style={{ border: '1px solid #ccc', padding: 10 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map(p => (
                    <tr
                      key={p.userId}
                      style={{
                        backgroundColor: p.role === 'student' ? '#d0e7ff' : p.role === 'teacher' ? '#d0ffd6' : 'white',
                        transition: '0.3s'
                      }}
                    >
                      <td style={{ border: '1px solid #ccc', padding: 10 }}>{p.userId}</td>
                      <td style={{ border: '1px solid #ccc', padding: 10 }}>{p.name}</td>
                      <td style={{ border: '1px solid #ccc', padding: 10 }}>{p.role}</td>
                      <td style={{ border: '1px solid #ccc', padding: 10 }}>
                        <button style={approveButton} onClick={() => approve(p.userId)}>Approve</button>
                        <button style={rejectButton} onClick={() => reject(p.userId)}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
