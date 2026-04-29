// src/components/layout/Header.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

// 引入所有需要的图标
import { 
  Activity, User, ShieldCheck, Bell, BellRing,
  CalendarClock, UserPen, ClipboardCheck, LogOut,
  AlertCircle, Clock, UserMinus, CheckCircle, Menu
} from 'lucide-react';

export default function Header() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ==========================================
  // 1. UI 交互状态管理 (纯 React 控制下拉菜单)
  // ==========================================
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 用于检测点击外部区域的 DOM 引用
  const userDropdownRef = useRef(null);
  const notifDropdownRef = useRef(null);

  // ==========================================
  // 2. 通知数据状态管理
  // ==========================================
  const [counts, setCounts] = useState({
    leaves: 0,
    attendanceCorrections: 0,
    attendancePending: 0,
    edits: 0,
    missingClockOuts: 0,
    dailyTasks: 0
  });

  const totalNotifications = Object.values(counts).reduce((a, b) => a + b, 0);

  // 获取昨天日期的字符串
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ==========================================
  // 3. 生命周期与副作用 (Listeners)
  // ==========================================
  
  // A. 监听点击外部以关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target)) {
        setNotifDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // B. 监听 Firebase 数据库通知
  useEffect(() => {
    if (!db) return;

    const unsubLeave = onSnapshot(query(collection(db, "leaves"), where("status", "==", "Pending")), snap => setCounts(prev => ({ ...prev, leaves: snap.size })));
    const unsubCorrections = onSnapshot(query(collection(db, "attendance_corrections"), where("status", "==", "Pending")), snap => setCounts(prev => ({ ...prev, attendanceCorrections: snap.size })));
    const unsubAttPending = onSnapshot(query(collection(db, "attendance"), where("verificationStatus", "==", "Pending")), snap => setCounts(prev => ({ ...prev, attendancePending: snap.size })));
    const unsubEdit = onSnapshot(query(collection(db, "edit_requests"), where("status", "==", "pending")), snap => setCounts(prev => ({ ...prev, edits: snap.size })));
    const unsubTask = onSnapshot(query(collection(db, "daily_tasks"), where("isRead", "==", false)), snap => setCounts(prev => ({ ...prev, dailyTasks: snap.size })));
    
    const unsubMissing = onSnapshot(query(collection(db, "attendance"), where("date", "==", yStr)), (snap) => {
      const userRecords = {};
      snap.forEach(doc => {
          const data = doc.data();
          if (!userRecords[data.uid]) userRecords[data.uid] = { hasIn: false, hasOut: false };
          if (data.session === 'Clock In') userRecords[data.uid].hasIn = true;
          if (data.session === 'Clock Out') userRecords[data.uid].hasOut = true;
      });
      let missingCount = 0;
      for (const uid in userRecords) {
          if (userRecords[uid].hasIn && !userRecords[uid].hasOut) missingCount++;
      }
      setCounts(prev => ({ ...prev, missingClockOuts: missingCount }));
    });

    return () => { unsubLeave(); unsubCorrections(); unsubAttPending(); unsubEdit(); unsubTask(); unsubMissing(); };
  }, [yStr]);

  // ==========================================
  // 4. 操作函数
  // ==========================================
  const handleLogout = async (e) => {
    e.preventDefault();
    if (window.confirm("Are you sure you want to sign out?")) {
      try {
        await signOut(auth);
        localStorage.removeItem('adminLoginTime');
        navigate('/login');
      } catch (error) {
        console.error("Logout Error:", error);
        alert("Logout failed. Please try again.");
      }
    }
  };

  const isActive = (path) => location.pathname === path ? 'active fw-bold text-primary' : '';

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-white shadow-sm border-bottom position-sticky top-0" style={{ zIndex: 1050 }}>
      <div className="container-fluid">
        
        {/* Logo */}
        <Link className="navbar-brand fw-bold d-flex align-items-center gap-2" to="/">
          <div className="bg-primary bg-opacity-10 p-1 rounded">
            <Activity className="text-primary" size={20} />
          </div>
          <span className="text-dark">FieldTrack Pro</span>
        </Link>

        {/* 移动端汉堡菜单开关 */}
        <button 
          className="navbar-toggler border-0" 
          type="button" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <Menu size={24} className="text-dark" />
        </button>

        {/* 导航内容区域 */}
        <div className={`collapse navbar-collapse ${mobileMenuOpen ? 'show' : ''}`}>
          
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4 gap-lg-3">
            <li className="nav-item"><Link className={`nav-link ${isActive('/')}`} to="/" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/staff')}`} to="/staff" onClick={() => setMobileMenuOpen(false)}>Staff</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/attendance')}`} to="/attendance" onClick={() => setMobileMenuOpen(false)}>Attendance</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/leave')}`} to="/leave" onClick={() => setMobileMenuOpen(false)}>Leaves</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/schedules')}`} to="/schedules" onClick={() => setMobileMenuOpen(false)}>Schedules</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/payroll')}`} to="/payroll" onClick={() => setMobileMenuOpen(false)}>Payroll</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/daily-tasks')}`} to="/daily-tasks" onClick={() => setMobileMenuOpen(false)}>Daily Tasks</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/map')}`} to="/map" onClick={() => setMobileMenuOpen(false)}>Map</Link></li>
            <li className="nav-item"><Link className={`nav-link ${isActive('/gallery')}`} to="/gallery" onClick={() => setMobileMenuOpen(false)}>Gallery</Link></li>
          </ul>

          <div className="d-flex align-items-center ms-auto gap-3 mt-3 mt-lg-0 pb-3 pb-lg-0">
            
            {/* ================================== */}
            {/* 通知中心 Dropdown (React State 控制)  */}
            {/* ================================== */}
            <div className="dropdown position-relative" ref={notifDropdownRef}>
              <button 
                className="btn btn-light position-relative p-2 rounded-circle border-0" 
                type="button" 
                onClick={() => {
                  setNotifDropdownOpen(!notifDropdownOpen);
                  setUserDropdownOpen(false); // 打开这个时关闭另一个
                }}
              >
                <Bell size={20} className="text-secondary" />
                {totalNotifications > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style={{ fontSize: '0.65rem' }}>
                    {totalNotifications > 9 ? '9+' : totalNotifications}
                  </span>
                )}
              </button>
              
              <ul className={`dropdown-menu dropdown-menu-end shadow-lg border-0 mt-2 p-0 ${notifDropdownOpen ? 'show' : ''}`} style={{ width: '280px', overflow: 'hidden', borderRadius: '0.5rem', position: 'absolute', right: 0 }}>
                <li>
                  <span className="dropdown-header bg-light fw-bold text-dark py-2 border-bottom d-flex align-items-center">
                    <BellRing size={16} className="me-2 text-primary" /> Notifications ({totalNotifications})
                  </span>
                </li>
                
                {totalNotifications === 0 ? (
                  <li className="text-center p-4 text-muted">
                      <div className="mb-2"><CheckCircle size={24} className="opacity-50 mx-auto" /></div>
                      <small>All caught up!</small>
                  </li>
                ) : (
                  <>
                    {counts.missingClockOuts > 0 && (
                      <li>
                        <Link className="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center" to={`/attendance?date=${yStr}&filter=missingOut`} onClick={() => setNotifDropdownOpen(false)}>
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-dark bg-opacity-10 text-dark p-1 rounded"><UserMinus size={16} /></div>
                            <div>
                                <div className="fw-bold small text-warning">{counts.missingClockOuts} Missing Clock Out{counts.missingClockOuts > 1 ? 's' : ''}</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>From {yStr}</div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )}

                    {counts.leaves > 0 && (
                      <li>
                        <Link className="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center" to="/leave" onClick={() => setNotifDropdownOpen(false)}>
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-warning bg-opacity-10 text-warning p-1 rounded"><CalendarClock size={16} /></div>
                            <div>
                                <div className="fw-bold small">{counts.leaves} Leave Request{counts.leaves > 1 ? 's' : ''}</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Awaiting approval</div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )}

                    {counts.attendanceCorrections > 0 && (
                      <li>
                        <Link className="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center" to="/attendance?tab=corrections" onClick={() => setNotifDropdownOpen(false)}>
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-danger bg-opacity-10 text-danger p-1 rounded"><AlertCircle size={16} /></div>
                            <div>
                                <div className="fw-bold small">{counts.attendanceCorrections} Correction{counts.attendanceCorrections > 1 ? 's' : ''}</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Staff requested fixes</div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )}

                    {counts.attendancePending > 0 && (
                      <li>
                        <Link className="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center" to="/attendance?filter=unverified" onClick={() => setNotifDropdownOpen(false)}>
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-primary bg-opacity-10 text-primary p-1 rounded"><Clock size={16} /></div>
                            <div>
                                <div className="fw-bold small">{counts.attendancePending} Unverified Log{counts.attendancePending > 1 ? 's' : ''}</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Daily logs to verify</div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )}

                    {counts.edits > 0 && (
                      <li>
                        <Link className="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center" to="/staff" onClick={() => setNotifDropdownOpen(false)}>
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-info bg-opacity-10 text-info p-1 rounded"><UserPen size={16} /></div>
                            <div>
                                <div className="fw-bold small">{counts.edits} Profile Update{counts.edits > 1 ? 's' : ''}</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Staff modifications</div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )}

                    {counts.dailyTasks > 0 && (
                      <li>
                        <Link className="dropdown-item py-2 border-bottom d-flex justify-content-between align-items-center" to="/daily-tasks" onClick={() => setNotifDropdownOpen(false)}>
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-success bg-opacity-10 text-success p-1 rounded"><ClipboardCheck size={16} /></div>
                            <div>
                                <div className="fw-bold small text-success">{counts.dailyTasks} Daily Task{counts.dailyTasks > 1 ? 's' : ''}</div>
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Submitted today</div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )}
                  </>
                )}
                <li>
                  <div className="text-center p-2">
                    <button className="btn btn-link text-muted small text-decoration-none py-0" onClick={() => window.location.reload()}>
                      Refresh Data
                    </button>
                  </div>
                </li>
              </ul>
            </div>

            <div className="vr h-50 mx-2 text-secondary d-none d-lg-block opacity-25"></div>

            {/* ================================== */}
            {/* 用户中心 Dropdown (React State 控制) */}
            {/* ================================== */}
            <div className="dropdown position-relative" ref={userDropdownRef}>
              <button 
                className="btn btn-white border-0 d-flex align-items-center gap-2 pe-0" 
                type="button" 
                onClick={() => {
                  setUserDropdownOpen(!userDropdownOpen);
                  setNotifDropdownOpen(false); // 打开这个时关闭另一个
                }}
              >
                <div className="bg-light rounded-circle p-1 border">
                  <User size={18} className="text-dark" />
                </div>
                <span className="fw-medium small d-none d-md-inline text-capitalize">
                  {userData?.role === 'manager' ? 'Manager' : 'Admin'}
                </span>
              </button>
              
              <ul className={`dropdown-menu dropdown-menu-end shadow-sm border-0 mt-2 ${userDropdownOpen ? 'show' : ''}`} style={{ position: 'absolute', right: 0 }}>
                {userData?.role === 'manager' && (
                  <>
                    <li>
                      <Link 
                        className="dropdown-item text-dark small fw-bold py-2 d-flex align-items-center" 
                        to="/manage-admins"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <ShieldCheck size={16} className="me-2 text-primary" /> Manage Admins
                      </Link>
                    </li>
                    <li><hr className="dropdown-divider" /></li>
                  </>
                )}
                <li>
                  <button 
                    className="dropdown-item text-danger small py-2 d-flex align-items-center" 
                    onClick={(e) => {
                      setUserDropdownOpen(false);
                      handleLogout(e);
                    }}
                  >
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