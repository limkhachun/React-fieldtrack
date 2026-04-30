// src/pages/ManageAdmins/ManageAdmins.jsx
import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, 
  updateDoc, serverTimestamp, setDoc, deleteDoc, getDoc 
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, UserPlus, AlertTriangle, UserMinus 
} from 'lucide-react';

export default function ManageAdmins() {
  const { currentUser, userData } = useAuth();
  const navigate = useNavigate();

  // 状态管理
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [staffList, setStaffList] = useState([]);
  
  // 弹窗状态
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // 1. 权限拦截与数据拉取[cite: 26]
  useEffect(() => {
    // 二次权限校验：确保只有 manager 角色能访问
    if (userData && userData.role !== 'manager') {
      alert("Access Denied: Manager role required.");
      navigate('/'); // 权限不足跳转回主页
      return;
    }

    if (userData && userData.role === 'manager') {
      fetchData();
    }
  }, [userData, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取当前所有管理员和超级管理员[cite: 26]
      const adminQuery = query(collection(db, "users"), where("role", "in", ["admin", "manager"]));
      const adminSnap = await getDocs(adminQuery);
      const adminData = adminSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAdmins(adminData);

      // 获取所有普通员工用于晋升列表[cite: 26]
      const staffQuery = query(collection(db, "users"), where("role", "==", "staff"));
      const staffSnap = await getDocs(staffQuery);
      const staffData = staffSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.status !== 'disabled');
      setStaffList(staffData);

    } catch (e) {
      console.error("Error fetching data:", e);
      alert("Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  };

  // 2. 晋升逻辑[cite: 26]
  const handlePromote = async () => {
    if (!selectedStaffId) return alert("Please select a staff member.");
    if (!window.confirm("Are you sure you want to grant Admin privileges to this user?")) return;

    setActionLoading(true);
    try {
      const userRef = doc(db, "users", selectedStaffId);
      const userSnap = await getDoc(userRef);
      const targetData = userSnap.data();

      // 更新主文档角色
      await updateDoc(userRef, {
        role: 'admin',
        updatedAt: serverTimestamp()
      });

      // 为 Firestore 规则创建“身份通行证”
      if (targetData && targetData.authUid) {
        await setDoc(doc(db, "user_roles", targetData.authUid), { role: 'admin' });
      }

      // 重新拉取数据以刷新页面
      await fetchData();
      setIsPromoteModalOpen(false);
      setSelectedStaffId('');
      alert("Staff successfully promoted to Admin.");
    } catch (e) {
      alert(`Promotion failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. 降级逻辑[cite: 26]
  const handleDemote = async (adminId, name) => {
    if (!window.confirm(`Are you sure you want to remove Admin privileges from ${name}?\nThey will be reverted to 'staff' role.`)) return;

    setActionLoading(true);
    try {
      const userRef = doc(db, "users", adminId);
      const userSnap = await getDoc(userRef);
      const targetData = userSnap.data();

      // 更新主文档角色为 staff
      await updateDoc(userRef, {
        role: 'staff',
        updatedAt: serverTimestamp()
      });

      // 降级时收回身份通行证
      if (targetData && targetData.authUid) {
        await deleteDoc(doc(db, "user_roles", targetData.authUid));
      }

      // 刷新数据
      await fetchData();
      alert("Admin privileges removed.");
    } catch (e) {
      alert(`Demotion failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5 mt-5">
        <div className="spinner-border text-primary" role="status"></div>
        <h5 className="fw-bold text-dark mt-3">Loading Admin Data...</h5>
      </div>
    );
  }

  return (
    <div className="container py-4 animate__animated animate__fadeIn">
      {/* 标题与操作按钮[cite: 25] */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold m-0 d-flex align-items-center">
            <ShieldCheck className="me-2 text-dark" size={24} /> Admin Management
          </h4>
          <p className="text-muted small mb-0 mt-1">Elevate staff roles or manage existing administrators.</p>
        </div>
        <button 
          className="btn btn-primary fw-bold shadow-sm d-flex align-items-center" 
          onClick={() => setIsPromoteModalOpen(true)}
        >
          <UserPlus size={16} className="me-2" /> Promote New Admin
        </button>
      </div>

      {/* 管理员列表网格[cite: 25, 26] */}
      <div className="row g-3">
        {admins.map(admin => {
          const isManager = admin.role === 'manager';
          const name = admin.personal?.name || 'Admin User';
          const email = admin.personal?.email || '-';
          
          return (
            <div className="col-md-6 col-lg-4" key={admin.id}>
              <div className="card h-100 shadow-sm border-0 rounded-4">
                <div className="card-body p-4">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm" style={{ width: '45px', height: '45px', fontSize: '1.2rem' }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <div className="fw-bold text-dark text-truncate fs-6">{name}</div>
                      <div className="small text-muted text-truncate">{email}</div>
                    </div>
                  </div>
                  
                  <div className="d-flex justify-content-between align-items-center border-top pt-3">
                    <span className={`badge px-3 py-2 ${isManager ? 'bg-dark text-white' : 'bg-primary bg-opacity-10 text-primary border border-primary-subtle'}`}>
                      {admin.role.toUpperCase()}
                    </span>
                    
                    {!isManager ? (
                      <button 
                        className="btn btn-sm btn-outline-danger border-0 fw-bold d-flex align-items-center" 
                        onClick={() => handleDemote(admin.id, name)}
                        disabled={actionLoading}
                      >
                        <UserMinus size={14} className="me-1" /> Demote
                      </button>
                    ) : (
                      <small className="text-muted fst-italic fw-bold">Primary Owner</small>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 晋升弹窗[cite: 25] */}
      {isPromoteModalOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                <div className="modal-header bg-primary text-white border-0 py-3">
                  <h6 className="modal-title fw-bold">Promote Staff to Admin</h6>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setIsPromoteModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <div className="mb-3 bg-white p-3 rounded border shadow-sm">
                    <label className="form-label small fw-bold text-muted mb-2">Select Staff Member</label>
                    <select 
                      className="form-select border-primary" 
                      value={selectedStaffId} 
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                    >
                      <option value="">-- Choose Staff Member --</option>
                      {staffList.map(staff => (
                        <option key={staff.id} value={staff.id}>
                          {staff.personal?.name} ({staff.personal?.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="alert alert-warning small border-warning shadow-sm d-flex align-items-start">
                    <AlertTriangle size={18} className="me-2 flex-shrink-0 mt-1" />
                    <div>
                      <b className="d-block mb-1">Warning:</b> 
                      This user will gain full access to payroll, attendance, and staff data.
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light border-0">
                  <button className="btn btn-secondary fw-bold" onClick={() => setIsPromoteModalOpen(false)}>Cancel</button>
                  <button 
                    className="btn btn-primary fw-bold shadow-sm px-4" 
                    onClick={handlePromote}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Processing...' : 'Confirm Promotion'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}