// src/pages/Staff/StaffList.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

// 🟢 导入所需的 Lucide 图标
import { Users, Search, Plus, MoreVertical, Edit, Trash2, Settings, RefreshCw, Bell, ChevronRight } from 'lucide-react';

export default function StaffList() {
  const { userData } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [pendingRequests, setPendingRequests] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // 🟢 1. 使用 useEffect 实时监听员工数据和待处理的修改请求
  useEffect(() => {
    // 监听非 Manager 角色的员工列表
    const staffQuery = query(collection(db, "users"));
    const unsubStaff = onSnapshot(staffQuery, (snapshot) => {
      const users = [];
      const now = new Date();
      
      snapshot.forEach(document => {
        const data = document.data();
        
        // 自动检查解锁状态是否过期 (原本原生代码的逻辑)
        if (data.status === 'editable' && data.unlockExpiresAt) {
           const expiry = data.unlockExpiresAt.toDate(); 
           if (now > expiry) {
               // 状态过期，异步重置它
               updateDoc(doc(db, "users", document.id), { status: 'active', unlockExpiresAt: null });
               data.status = 'active'; 
           }
        }
        
        // 过滤掉 manager，只显示 admin 和 staff
        if (data.role !== 'manager') {
          users.push({ id: document.id, ...data });
        }
      });
      setStaffList(users);
      setLoading(false);
    });

    // 监听待处理的 Profile Edit 请求
    const reqQuery = query(collection(db, "edit_requests"), where("status", "==", "pending"));
    const unsubReq = onSnapshot(reqQuery, (snap) => {
      const requests = {};
      snap.forEach(document => {
        const data = document.data();
        requests[data.userId] = { reqId: document.id, ...data };
      });
      setPendingRequests(requests);
    });

    return () => {
      unsubStaff();
      unsubReq();
    };
  }, []);

  // 🟢 2. 实现本地前端搜索过滤
  const filteredStaff = staffList.filter(staff => {
    const name = (staff.personal?.name || "").toLowerCase();
    const email = (staff.personal?.email || "").toLowerCase();
    const id = staff.id.toLowerCase();
    const dept = (staff.employment?.dept || "").toLowerCase();
    const searchLower = searchTerm.toLowerCase().trim();
    
    return name.includes(searchLower) || 
           email.includes(searchLower) || 
           id.includes(searchLower) || 
           dept.includes(searchLower);
  });

  // 辅助函数：决定员工状态标签的样式
  const getStatusBadge = (status) => {
    switch(status) {
      case 'complete': return <span className="status-badge bg-complete">Complete</span>;
      case 'editable': return <span className="status-badge bg-editable">Editable</span>;
      case 'disabled': return <span className="badge bg-secondary text-white">Disabled</span>;
      default: return <span className="status-badge bg-active">Active</span>; // active
    }
  };

  return (
    <div className="container py-4 animate__animated animate__fadeIn">
      
      {/* --- 顶部标题与操作栏 --- */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1 text-dark d-flex align-items-center">
             Staff Directory
          </h4>
          <p className="text-muted small mb-0">Manage permissions and view staff profiles.</p>
        </div>
        <div className="d-flex gap-2">
          {/* 这里目前仅做 UI 占位，日后我们可以将 Leave Rules 抽离为独立的 React 组件/Modal */}
          <button className="btn btn-outline-dark fw-bold d-flex align-items-center">
            <Settings size={16} className="me-2" /> Leave Rules
          </button>
          <button className="btn btn-warning text-dark fw-bold shadow-sm d-flex align-items-center">
            <RefreshCw size={16} className="me-2" /> Recalculate Balances
          </button>
          
          {/* 跳转到添加新员工的页面 */}
          <Link to="/staff/new" className="btn btn-primary fw-bold shadow-sm d-flex align-items-center">
            <Plus size={16} className="me-2" /> Add New
          </Link>
        </div>
      </div>

      {/* --- 搜索栏 --- */}
      <div className="row mb-3">
        <div className="col-md-6 col-lg-4">
          <div className="input-group">
            <span className="input-group-text bg-white text-muted border-end-0 border-primary">
              <Search size={16} />
            </span>
            <input 
              type="text" 
              className="form-control border-start-0 border-primary" 
              placeholder="Search staff by name, email, ID or Dept..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* --- 员工数据表格 --- */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" id="employeeListTable">
              <thead className="table-light text-muted">
                <tr>
                  <th className="ps-4">Emp Code</th>
                  <th>Full Name</th>
                  <th>Department</th>
                  <th>Leave Balance</th>
                  <th>Status</th>
                  <th className="text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center py-5 text-muted">
                      <div className="spinner-border spinner-border-sm text-primary mb-2"></div>
                      <br/>Loading staff data...
                    </td>
                  </tr>
                ) : filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-5 text-muted">
                      No staff found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  // 🟢 使用 map 进行声明式渲染
                  filteredStaff.map((staff) => {
                    const personal = staff.personal || {};
                    const employment = staff.employment || {};
                    const leaveBalance = staff.leave_balance || {};
                    
                    const al = leaveBalance.annual !== undefined ? leaveBalance.annual : '-';
                    const ml = leaveBalance.medical !== undefined ? leaveBalance.medical : '-';
                    const alColor = (al !== '-' && al <= 3) ? 'text-danger' : 'text-success';
                    const mlColor = (ml !== '-' && ml <= 3) ? 'text-danger' : 'text-success';
                    
                    const hasRequest = !!pendingRequests[staff.id];

                    return (
                      <tr key={staff.id}>
                        <td className="ps-4 fw-bold text-primary">{staff.id}</td>
                        <td>
                          <div className="fw-bold text-dark">{personal.name || 'Unknown'}</div>
                          <small className="text-muted">{personal.email || '-'}</small>
                        </td>
                        <td>{employment.dept || '-'}</td>
                        <td>
                           <div className="d-flex flex-column gap-1" style={{ fontSize: '0.75rem' }}>
                              <div className="border rounded px-2 py-1 bg-light text-muted fw-bold d-flex justify-content-between align-items-center" style={{ width: '85px' }}>
                                  <span>AL:</span> <span className={`${alColor} fs-6`}>{al}</span>
                              </div>
                              <div className="border rounded px-2 py-1 bg-light text-muted fw-bold d-flex justify-content-between align-items-center" style={{ width: '85px' }}>
                                  <span>ML:</span> <span className={`${mlColor} fs-6`}>{ml}</span>
                              </div>
                          </div>
                        </td>
                        <td>
                          {getStatusBadge(staff.status)}
                        </td>
                        <td className="text-end pe-4">
                          <div className="action-btn-group d-flex justify-content-end gap-2">
                             {/* 若有编辑请求，按钮变色；点击逻辑日后补充 */}
                             <button 
                                className={`btn btn-sm position-relative ${hasRequest ? 'btn-warning text-dark fw-bold' : 'btn-light text-muted border'}`}
                                disabled={!hasRequest}
                             >
                                {hasRequest && <span className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle"></span>}
                                <Bell size={14} className="me-1" />
                                {hasRequest ? 'Review Req' : 'No Req'}
                             </button>
                             
                             {/* 跳转到该员工的详细编辑页面 */}
                             <Link to={`/staff/${staff.id}`} className="btn btn-sm btn-light border text-dark d-flex align-items-center">
                                Manage <ChevronRight size={14} className="ms-1" />
                             </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
    </div>
  );
}