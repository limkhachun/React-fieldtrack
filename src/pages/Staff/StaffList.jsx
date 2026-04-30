// src/pages/Staff/StaffList.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDoc, setDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';

// 🚨 导入审计日志函数
import { logAdminAction } from '../../utils/utils'; 

// 导入图标
import { Search, Plus, ChevronRight, Settings, RefreshCw, Bell, Info, Trash2 } from 'lucide-react';

export default function StaffList() {
  const { currentUser } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [pendingRequests, setPendingRequests] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // ----------------------------------------------------
  // Modal States
  // ----------------------------------------------------
  
  // Review Request Modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Leave Rules Modal
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesActiveTab, setRulesActiveTab] = useState('annual');
  const [leaveRules, setLeaveRules] = useState({ annual: [], medical: [] });
  const [rulesLoading, setRulesLoading] = useState(false);

  // Global Action State (for spinners)
  const [actionLoading, setActionLoading] = useState(false);

  // ----------------------------------------------------
  // 1. Data Fetching (Listeners)
  // ----------------------------------------------------
  useEffect(() => {
    const staffQuery = query(collection(db, "users"));
    const unsubStaff = onSnapshot(staffQuery, (snapshot) => {
      const users = [];
      const now = new Date();
      
      snapshot.forEach(document => {
        const data = document.data();
        
        // 自动重置过期的 editable 状态
        if (data.status === 'editable' && data.unlockExpiresAt) {
           const expiry = data.unlockExpiresAt.toDate(); 
           if (now > expiry) {
               updateDoc(doc(db, "users", document.id), { status: 'active', unlockExpiresAt: null });
               data.status = 'active'; 
           }
        }
        
        if (data.role !== 'manager') {
          users.push({ id: document.id, ...data });
        }
      });
      setStaffList(users);
      setLoading(false);
    });

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

  // ----------------------------------------------------
  // 2. Review Profile Unlock Requests
  // ----------------------------------------------------
  const handleOpenReview = (userId) => {
    const request = pendingRequests[userId];
    if (request) {
      setSelectedRequest(request);
      setReviewModalOpen(true);
    }
  };

  const handleProcessDecision = async (decision) => {
    if (!selectedRequest) return;
    setActionLoading(true);
    try {
      const reqId = selectedRequest.reqId;
      const userId = selectedRequest.userId;

      if(decision === 'approve') {
          await updateDoc(doc(db, "edit_requests", reqId), { status: 'approved', reviewedAt: serverTimestamp() });
          const expiryDate = new Date(Date.now() + 5 * 60 * 1000); 
          await updateDoc(doc(db, "users", userId), { status: 'editable', unlockExpiresAt: expiryDate });
          
          // 🚨 记录解锁请求通过
          await logAdminAction(db, currentUser, "APPROVE_UNLOCK_REQUEST", userId, null, { action: 'Granted 5 mins edit access' });

          alert('Request Approved. Profile unlocked for 5 minutes.');
      } else {
          await updateDoc(doc(db, "edit_requests", reqId), { status: 'rejected', reviewedAt: serverTimestamp() });
          
          // 🚨 记录解锁请求拒绝
          await logAdminAction(db, currentUser, "REJECT_UNLOCK_REQUEST", userId, null, { action: 'Denied edit access' });

          alert('Request Rejected.');
      }
      setReviewModalOpen(false);
      setSelectedRequest(null);
    } catch (error) {
      alert(`Error processing request: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ----------------------------------------------------
  // 3. Leave Rules Management
  // ----------------------------------------------------
  const handleOpenRules = async () => {
    setRulesLoading(true);
    setRulesModalOpen(true);
    try {
      const snap = await getDoc(doc(db, "settings", "leave_rules"));
      if (snap.exists() && snap.data().annual) {
        setLeaveRules(snap.data());
      } else {
        setLeaveRules({
          annual: [ {min: 0, max: 2, days: 8}, {min: 2, max: 5, days: 12}, {min: 5, max: 99, days: 16} ],
          medical: [ {min: 0, max: 2, days: 14}, {min: 2, max: 5, days: 18}, {min: 5, max: 99, days: 22} ]
        });
      }
    } catch (e) {
      alert("Error loading rules: " + e.message);
    } finally {
      setRulesLoading(false);
    }
  };

  const handleAddRuleRow = (type) => {
    setLeaveRules(prev => ({ ...prev, [type]: [...prev[type], { min: 0, max: 1, days: 0 }] }));
  };

  const handleRemoveRuleRow = (type, index) => {
    setLeaveRules(prev => {
      const newArray = [...prev[type]];
      newArray.splice(index, 1);
      return { ...prev, [type]: newArray };
    });
  };

  const handleRuleChange = (type, index, field, value) => {
    setLeaveRules(prev => {
      const newArray = [...prev[type]];
      newArray[index][field] = parseFloat(value);
      return { ...prev, [type]: newArray };
    });
  };

  const handleSaveLeaveRules = async () => {
    setActionLoading(true);
    try {
      if (leaveRules.annual.length === 0 || leaveRules.medical.length === 0) {
        throw new Error("Both Annual and Medical must have at least one rule tier.");
      }

      const validateArr = (arr) => {
         const sorted = [...arr].sort((a,b) => a.min - b.min);
         for(let i=0; i<sorted.length; i++) {
             if (sorted[i].min >= sorted[i].max) throw new Error("Min must be less than Max.");
             if (i < sorted.length - 1 && sorted[i].max > sorted[i+1].min) {
                 throw new Error("Overlap in rule tiers detected.");
             }
         }
         return sorted;
      };

      const finalRules = {
        annual: validateArr(leaveRules.annual),
        medical: validateArr(leaveRules.medical)
      };

      await setDoc(doc(db, "settings", "leave_rules"), finalRules);

      // 🚨 记录全局请假规则变更
      await logAdminAction(db, currentUser, "UPDATE_LEAVE_RULES", "GLOBAL", null, finalRules);

      alert("✅ Leave Rules saved successfully!");
      setRulesModalOpen(false);
    } catch (e) {
      alert("Save Error: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // ----------------------------------------------------
  // 4. Batch Recalculate Balances
  // ----------------------------------------------------
  const handleRecalculateBalances = async () => {
    const currentYear = new Date().getFullYear();
    const startOfYear = `${currentYear}-01-01`;
    
    if (!window.confirm(`Recalculate all staff leave balances for ${currentYear}?`)) return;

    setActionLoading(true);
    try {
      const ruleSnap = await getDoc(doc(db, "settings", "leave_rules"));
      if (!ruleSnap.exists()) throw new Error("Leave rules are missing. Please configure rules first.");
      const rules = ruleSnap.data();
      
      const leavesQ = query(collection(db, "leaves"), where("status", "==", "Approved"), where("startDate", ">=", startOfYear));
      const leaveSnaps = await getDocs(leavesQ);
      const usedMap = {}; 
      
      leaveSnaps.forEach(document => {
          const d = document.data();
          if (d.uid && d.days) {
              if (!usedMap[d.uid]) usedMap[d.uid] = { annual: 0, medical: 0 };
              if (d.type === "Annual Leave") usedMap[d.uid].annual += d.days;
              if (d.type === "Medical Leave") usedMap[d.uid].medical += d.days;
          }
      });

      const getEntitlement = (yrs, arr) => {
          const rule = arr.find(r => yrs >= r.min && yrs < r.max);
          return rule ? rule.days : 0; 
      };

      const staffSnap = await getDocs(query(collection(db, "users")));
      const batch = writeBatch(db);
      let count = 0;

      staffSnap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.role === 'manager') return; 
          
          if (d.employment && d.employment.joinDate) {
              const yrs = (new Date() - new Date(d.employment.joinDate)) / (1000 * 60 * 60 * 24 * 365.25);
              const aEntitlement = getEntitlement(yrs, rules.annual || []);
              const mEntitlement = getEntitlement(yrs, rules.medical || []);
              
              const aUsed = usedMap[docSnap.id]?.annual || 0;
              const mUsed = usedMap[docSnap.id]?.medical || 0;

              batch.update(doc(db, "users", docSnap.id), { 
                  "leave_balance.annual": aEntitlement - aUsed, 
                  "leave_balance.medical": mEntitlement - mUsed,
                  "leave_balance.total_annual": aEntitlement,
                  "leave_balance.total_medical": mEntitlement,
                  "meta.balanceLastUpdated": serverTimestamp(), 
                  "meta.balanceYear": currentYear 
              });
              count++;
          }
      });

      await batch.commit();

      // 🚨 记录批量重算操作
      await logAdminAction(db, currentUser, "BATCH_RECALCULATE_LEAVE", "MULTIPLE", null, { staffCount: count, targetYear: currentYear });

      alert(`✅ Successfully recalculated balances for ${count} staff.`);
    } catch (e) {
      alert(`Error during recalculation: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // ----------------------------------------------------
  // 渲染逻辑
  // ----------------------------------------------------
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

  const getStatusBadge = (status) => {
    switch(status) {
      case 'complete': return <span className="badge bg-success bg-opacity-10 text-success border border-success">Complete</span>;
      case 'editable': return <span className="badge bg-warning bg-opacity-10 text-warning border border-warning">Editable</span>;
      case 'disabled': return <span className="badge bg-secondary text-white">Disabled</span>;
      default: return <span className="badge bg-primary bg-opacity-10 text-primary border border-primary">Active</span>;
    }
  };

  return (
    <div className="container-fluid py-4 animate__animated animate__fadeIn">
      
      {/* 顶部操作栏 */}
      <div className="d-flex justify-content-between align-items-center mb-4 mx-2">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Staff Directory</h4>
          <p className="text-muted small mb-0">Manage permissions and view staff profiles.</p>
        </div>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-outline-dark fw-bold d-flex align-items-center"
            onClick={handleOpenRules}
            disabled={actionLoading}
          >
            <Settings size={16} className="me-2" /> Leave Rules
          </button>
          <button 
            className="btn btn-warning text-dark fw-bold shadow-sm d-flex align-items-center"
            onClick={handleRecalculateBalances}
            disabled={actionLoading}
          >
            {actionLoading ? <span className="spinner-border spinner-border-sm me-2"></span> : <RefreshCw size={16} className="me-2" />} 
            Recalculate Balances
          </button>
          <Link to="/staff/new" className="btn btn-primary fw-bold shadow-sm d-flex align-items-center">
            <Plus size={16} className="me-2" /> Add New
          </Link>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="row mb-3 mx-2">
        <div className="col-md-6 col-lg-4 p-0">
          <div className="input-group shadow-sm">
            <span className="input-group-text bg-white text-muted border-end-0 border-primary">
              <Search size={16} />
            </span>
            <input 
              type="text" 
              className="form-control border-start-0 border-primary" 
              placeholder="Search staff..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 员工列表 */}
      <div className="card mx-2 border-0 shadow-sm">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
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
                  <tr><td colSpan="6" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                ) : filteredStaff.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-5 text-muted">No staff found.</td></tr>
                ) : (
                  filteredStaff.map((staff) => {
                    const personal = staff.personal || {};
                    const employment = staff.employment || {};
                    const leaveBalance = staff.leave_balance || {};
                    const al = leaveBalance.annual !== undefined ? leaveBalance.annual : '-';
                    const ml = leaveBalance.medical !== undefined ? leaveBalance.medical : '-';
                    const hasRequest = !!pendingRequests[staff.id];

                    return (
                      <tr key={staff.id}>
                        <td className="ps-4 fw-bold text-primary">{staff.id}</td>
                        <td>
                          <div className="fw-bold text-dark">{personal.name || 'Unknown'}</div>
                          <small className="text-muted">{personal.email || '-'}</small>
                        </td>
                        <td><span className="badge bg-light text-dark border">{employment.dept || '-'}</span></td>
                        <td>
                           <div className="d-flex flex-column gap-1" style={{ fontSize: '0.75rem' }}>
                              <div className="border rounded px-2 py-1 bg-light text-muted fw-bold d-flex justify-content-between align-items-center" style={{ width: '85px' }}>
                                  <span>AL:</span> <span className={`${al !== '-' && al <= 3 ? 'text-danger' : 'text-success'} fs-6`}>{al}</span>
                              </div>
                              <div className="border rounded px-2 py-1 bg-light text-muted fw-bold d-flex justify-content-between align-items-center" style={{ width: '85px' }}>
                                  <span>ML:</span> <span className={`${ml !== '-' && ml <= 3 ? 'text-danger' : 'text-success'} fs-6`}>{ml}</span>
                              </div>
                          </div>
                        </td>
                        <td>{getStatusBadge(staff.status)}</td>
                        <td className="text-end pe-4">
                          <div className="d-flex justify-content-end gap-2">
                             <button 
                                className={`btn btn-sm position-relative ${hasRequest ? 'btn-warning text-dark fw-bold' : 'btn-light text-muted border'}`}
                                disabled={!hasRequest}
                                onClick={() => handleOpenReview(staff.id)}
                             >
                                {hasRequest && <span className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle"></span>}
                                <Bell size={14} className="me-1" />
                                {hasRequest ? 'Review Req' : 'No Req'}
                             </button>
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

      {/* ========================================================================= */}
      {/* ===================== MODALS ============================================ */}
      {/* ========================================================================= */}

      {/* 1. Review Request Modal */}
      {reviewModalOpen && selectedRequest && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow">
                <div className="modal-header bg-light">
                  <h5 className="modal-title fw-bold">Review Request</h5>
                  <button type="button" className="btn-close" onClick={() => setReviewModalOpen(false)}></button>
                </div>
                <div className="modal-body">
                  <div className="alert alert-info small border-info d-flex align-items-center">
                    <Info size={16} className="me-2" /> Approval unlocks profile for 5 mins.
                  </div>
                  <div className="mb-2">
                    <label className="small text-muted fw-bold">REQUESTER</label>
                    <div className="fw-bold text-dark">{selectedRequest.empName || "Unknown"}</div>
                    <small className="text-muted">ID: {selectedRequest.userId}</small>
                  </div>
                  <div>
                    <label className="small text-muted fw-bold">REASON</label>
                    <div className="p-2 bg-light rounded border small text-dark">
                      {selectedRequest.request || "No details provided."}
                    </div>
                  </div>
                </div>
                <div className="modal-footer bg-light border-0">
                  <button className="btn btn-outline-danger fw-bold px-4" disabled={actionLoading} onClick={() => handleProcessDecision('reject')}>Reject</button>
                  <button className="btn btn-success text-white fw-bold px-4 shadow-sm" disabled={actionLoading} onClick={() => handleProcessDecision('approve')}>
                    {actionLoading ? 'Processing...' : 'Approve'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 2. Leave Config Modal */}
      {rulesModalOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-lg">
              <div className="modal-content border-0 shadow">
                <div className="modal-header bg-light">
                  <h6 className="modal-title fw-bold d-flex align-items-center"><Settings size={18} className="me-2"/> Leave Rules Setup</h6>
                  <button type="button" className="btn-close" onClick={() => setRulesModalOpen(false)}></button>
                </div>
                
                <div className="modal-body p-4">
                  {rulesLoading ? (
                    <div className="text-center py-4"><span className="spinner-border text-primary"></span></div>
                  ) : (
                    <>
                      <ul className="nav nav-tabs mb-3">
                        <li className="nav-item">
                          <button className={`nav-link fw-bold ${rulesActiveTab === 'annual' ? 'active text-primary' : 'text-muted'}`} onClick={() => setRulesActiveTab('annual')}>🏖️ Annual</button>
                        </li>
                        <li className="nav-item">
                          <button className={`nav-link fw-bold ${rulesActiveTab === 'medical' ? 'active text-danger' : 'text-muted'}`} onClick={() => setRulesActiveTab('medical')}>🏥 Medical</button>
                        </li>
                      </ul>
                      
                      <div className="tab-content">
                        {['annual', 'medical'].map(type => (
                          <div key={type} className={`tab-pane fade ${rulesActiveTab === type ? 'show active' : ''}`}>
                            <div className="d-flex justify-content-between mb-3">
                               <span className="small fw-bold text-muted">Tier Setup (By Years of Service)</span>
                               <button className={`btn btn-sm fw-bold ${type==='annual' ? 'btn-outline-primary' : 'btn-outline-danger'}`} onClick={() => handleAddRuleRow(type)}>+ Add Tier</button>
                            </div>

                            {leaveRules[type].map((rule, idx) => (
                              <div className="input-group input-group-sm mb-2" key={idx}>
                                <span className="input-group-text bg-light border-end-0 fw-bold">Min Yrs</span>
                                <input type="number" className="form-control" value={rule.min} step="0.1" min="0" onChange={(e) => handleRuleChange(type, idx, 'min', e.target.value)} />
                                <span className="input-group-text bg-light border-end-0 border-start-0 fw-bold">Max Yrs</span>
                                <input type="number" className="form-control" value={rule.max} step="0.1" min="0.1" onChange={(e) => handleRuleChange(type, idx, 'max', e.target.value)} />
                                <span className="input-group-text bg-light border-end-0 border-start-0 fw-bold">Days</span>
                                <input type="number" className="form-control" value={rule.days} min="0" onChange={(e) => handleRuleChange(type, idx, 'days', e.target.value)} />
                                <button type="button" className="btn btn-outline-danger px-2" onClick={() => handleRemoveRuleRow(type, idx)}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ))}
                            {leaveRules[type].length === 0 && <p className="text-muted small text-center">No tiers configured. Please add one.</p>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                
                <div className="modal-footer bg-light border-0">
                  <button className="btn btn-primary w-100 fw-bold shadow-sm" disabled={actionLoading || rulesLoading} onClick={handleSaveLeaveRules}>
                    {actionLoading ? 'Saving...' : 'Save Rules'}
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