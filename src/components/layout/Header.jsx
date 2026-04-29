// src/components/layout/Header.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
// 引入所有需要的图标
import { 
  Activity, User, ShieldCheck, Bell, 
  CalendarClock, UserPen, ClipboardList, LogOut 
} from 'lucide-react';

export default function Header() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 1. 通知状态管理
  const [counts, setCounts] = useState({
    leaves: 0,
    edits: 0,
    dailyTasks: 0
  });

  const totalNotifications = counts.leaves + counts.edits + counts.dailyTasks;

  // 2. 实时监听通知
  useEffect(() => {
    if (!db) return;

    // 监听待审批请假
    const qLeave = query(collection(db, "leave_applications"), where("status", "==", "pending"));
    const unsubLeave = onSnapshot(qLeave, (snap) => {
      setCounts(prev => ({ ...prev, leaves: snap.size }));
    });

    // 监听待处理编辑请求
    const qEdit = query(collection(db, "edit_requests"), where("status", "==", "pending"));
    const unsubEdit = onSnapshot(qEdit, (snap) => {
      setCounts(prev => ({ ...prev, edits: snap.size }));
    });

    // 监听未读每日任务
    const qTask = query(collection(db, "daily_tasks"), where("isRead", "==", false));
    const unsubTask = onSnapshot(qTask, (snap) => {
      setCounts(prev => ({ ...prev, dailyTasks: snap.size }));
    });

    // 清理监听器，防止内存泄漏
    return () => {
      unsubLeave();
      unsubEdit();
      unsubTask();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('adminLoginTime');
      navigate('/login');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const isActive = (path) => location.pathname === path ? 'active fw-bold text-primary' : '';

  return (
    <nav className="navbar navbar-expand-xl navbar-light bg-white shadow-sm border-bottom position-sticky top-0" style={{ zIndex: 1050 }}>
      <div className="container-fluid">
        {/* Logo 部分 */}
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-2" to="/">
          <div className="bg-primary bg-opacity-10 p-1 rounded">
            <Activity className="text-primary" size={20} />
          </div>
          <span className="text-dark">FieldTrack Pro</span>
        </Link>

        <button className="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarNav">
          {/* 主导航链接 (已补齐所有 9 个模块) */}
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-lg-2">
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/')}`} to="/">Dashboard</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/staff')}`} to="/staff">Staff</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/attendance')}`} to="/attendance">Attendance</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/leave')}`} to="/leave">Leaves</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/schedules')}`} to="/schedules">Schedules</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/payroll')}`} to="/payroll">Payroll</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/daily-tasks')}`} to="/daily-tasks">Daily Tasks</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/map')}`} to="/map">Map</Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link ${isActive('/gallery')}`} to="/gallery">Gallery</Link>
            </li>
          </ul>

          <div className="d-flex align-items-center gap-2 gap-lg-3">
            
            {/* 通知中心 (Notification Dropdown) */}
            <div className="dropdown">
              <button className="btn btn-light rounded-circle p-2 position-relative border-0" type="button" data-bs-toggle="dropdown">
                <Bell size={20} className="text-secondary" />
                {totalNotifications > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white border-2" style={{ fontSize: '0.65rem' }}>
                    {totalNotifications > 9 ? '9+' : totalNotifications}
                  </span>
                )}
              </button>
              <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2 p-2" style={{ width: '280px' }}>
                <li><h6 className="dropdown-header fw-bold px-2 py-1">Notifications</h6></li>
                
                <li>
                  <Link className="dropdown-item rounded d-flex justify-content-between align-items-center py-2" to="/leave">
                    <div className="d-flex align-items-center gap-2">
                      <CalendarClock size={16} className="text-primary" /> <span>Leave Applications</span>
                    </div>
                    {counts.leaves > 0 && <span className="badge bg-primary rounded-pill">{counts.leaves}</span>}
                  </Link>
                </li>

                <li>
                  <Link className="dropdown-item rounded d-flex justify-content-between align-items-center py-2" to="/staff">
                    <div className="d-flex align-items-center gap-2">
                      <UserPen size={16} className="text-warning" /> <span>Edit Requests</span>
                    </div>
                    {counts.edits > 0 && <span className="badge bg-warning text-dark rounded-pill">{counts.edits}</span>}
                  </Link>
                </li>

                <li>
                  <Link className="dropdown-item rounded d-flex justify-content-between align-items-center py-2" to="/daily-tasks">
                    <div className="d-flex align-items-center gap-2">
                      <ClipboardList size={16} className="text-success" /> <span>Daily Tasks</span>
                    </div>
                    {counts.dailyTasks > 0 && <span className="badge bg-success rounded-pill">{counts.dailyTasks}</span>}
                  </Link>
                </li>
                
                <li><hr className="dropdown-divider" /></li>
                <li className="text-center">
                  <button className="btn btn-link btn-sm text-decoration-none text-muted small py-0" onClick={() => window.location.reload()}>Refresh Data</button>
                </li>
              </ul>
            </div>

            <div className="vr h-50 mx-1 text-secondary d-none d-lg-block opacity-25"></div>

            {/* 用户中心 (User Dropdown) */}
            <div className="dropdown">
              <button className="btn btn-white dropdown-toggle border-0 d-flex align-items-center gap-2 pe-0" type="button" data-bs-toggle="dropdown">
                <div className="bg-light rounded-circle p-1 border">
                  <User size={18} className="text-dark" />
                </div>
                <span className="fw-medium small d-none d-md-inline text-capitalize">
                  {userData?.role || 'Admin'}
                </span>
              </button>
              <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2 p-2">
                {userData?.role === 'admin' && (
                  <>
                    <li>
                      <Link className="dropdown-item rounded small fw-bold py-2" to="/manage-admins">
                        <ShieldCheck size={16} className="me-2 text-primary" /> Manage Admins
                      </Link>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                  </>
                )}
                <li>
                  <button className="dropdown-item rounded text-danger small py-2 d-flex align-items-center" onClick={handleLogout}>
                    <LogOut size={16} className="me-2" /> Sign Out
                  </button>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </div>
    </nav>
  );
}