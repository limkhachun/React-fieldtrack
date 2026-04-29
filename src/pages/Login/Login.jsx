// src/pages/Login/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { Activity } from 'lucide-react'; 

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // 如果用户已经登录，自动重定向到主页，防止停留在登录页
  useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault(); 
    setError('');
    setLoading(true);

    try {
      // 🚨 关键修复：在触发 Firebase 登录前，提前将时间写入本地缓存！
      // 这样 AuthContext 瞬间触发时，就能立刻抓到有效的时间戳。
      localStorage.setItem('adminLoginTime', Date.now().toString());
      
      // 调用 Firebase 进行邮箱密码验证
      await signInWithEmailAndPassword(auth, email, password);
      
      // 登录成功，跳转到 Dashboard
      navigate('/');
      
    } catch (err) {
      console.error("Login Error: ", err);
      // 登录失败，清除刚才提前写入的时间戳
      localStorage.removeItem('adminLoginTime');
      
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center vh-100 bg-light">
      <div className="card shadow border-0" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="card-body p-5">
          
          <div className="text-center mb-4">
            <div className="bg-primary bg-opacity-10 d-inline-block p-3 rounded-circle mb-3">
              <Activity className="text-primary" size={32} />
            </div>
            <h4 className="fw-bold text-dark">FieldTrack Pro</h4>
            <p className="text-muted small">Sign in to Command Center</p>
          </div>

          {error && <div className="alert alert-danger small py-2">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="form-label small fw-bold text-muted">Email Address</label>
              <input 
                type="email" 
                className="form-control" 
                placeholder=""
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label className="form-label small fw-bold text-muted">Password</label>
              <input 
                type="password" 
                className="form-control" 
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-100 fw-bold py-2 shadow-sm"
              disabled={loading}
            >
              {loading ? (
                <><span className="spinner-border spinner-border-sm me-2"></span>Signing in...</>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}