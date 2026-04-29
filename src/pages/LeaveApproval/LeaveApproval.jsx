// src/pages/LeaveApproval/LeaveApproval.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, query, where, onSnapshot, getDocs, doc, getDoc 
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { 
  Plus, Calendar, CheckCircle, Clock, CalendarRange, ArrowRight, Check, X, Paperclip, FileMinus 
} from 'lucide-react';
import { 
  AttachmentModal, RejectModal, AddLeaveModal, EditStatusModal 
} from './components/LeaveModals';

// Utility functions (mocked here, implement in your utils.js)
const formatDateTime = (date) => date.toLocaleString('en-GB');
const formatDate = (dateString) => new Date(dateString).toLocaleDateString('en-GB');

export default function LeaveApproval() {
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [historyLeaves, setHistoryLeaves] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  
  // Data Maps
  const [usersMap, setUsersMap] = useState({});
  const [holidaysMap, setHolidaysMap] = useState({});

  // Modal States
  const [modals, setModals] = useState({
    attachment: { isOpen: false, url: '', fileType: '' },
    reject: { isOpen: false, leaveId: '', uid: '' },
    addLeave: { isOpen: false },
    editStatus: { isOpen: false, leaveId: '', uid: '', status: '', reason: '' }
  });

  const todayDate = new Date().toLocaleDateString('en-GB');

  // ==========================================
  // Initialization & Listeners
  // ==========================================
  useEffect(() => {
    fetchBaseData();
  }, []);

  useEffect(() => {
    if (Object.keys(usersMap).length > 0) {
      const unsubPending = listenToPendingLeaves();
      const unsubHistory = listenToHistoryLeaves();
      return () => {
        unsubPending();
        unsubHistory();
      };
    }
  }, [usersMap]);

  const fetchBaseData = async () => {
    try {
      // Fetch Holidays
      const holSnap = await getDoc(doc(db, "settings", "holidays"));
      const hMap = {};
      if (holSnap.exists() && holSnap.data().holiday_list) {
        holSnap.data().holiday_list.forEach(h => { hMap[h.date] = h.name; });
      }
      setHolidaysMap(hMap);

      // Fetch Users[cite: 13]
      const usersSnap = await getDocs(query(collection(db, "users")));
      const uMap = {};
      usersSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.status !== 'disabled' && d.role !== 'manager') {
          uMap[docSnap.id] = {
            id: docSnap.id,
            authUid: d.authUid || "",
            name: d.personal?.name || d.name || "Unknown Staff",
            email: d.personal?.email || ""
          };
        }
      });
      setUsersMap(uMap);
    } catch (e) {
      console.error("Error fetching base data:", e);
    }
  };

  const listenToPendingLeaves = () => {
    const q = query(collection(db, "leaves"), where("status", "==", "Pending"));
    return onSnapshot(q, (snapshot) => {
      let docsData = [];
      snapshot.forEach(doc => docsData.push({ id: doc.id, ...doc.data() }));
      docsData.sort((a, b) => (b.appliedAt?.seconds || 0) - (a.appliedAt?.seconds || 0)); // Sort by appliedAt descending[cite: 13]
      setPendingLeaves(docsData);
      setLoading(false);
    });
  };

  const listenToHistoryLeaves = () => {
    const q = query(collection(db, "leaves"), where("status", "in", ["Approved", "Rejected"]));
    return onSnapshot(q, (snapshot) => {
      let docsData = [];
      snapshot.forEach(doc => docsData.push({ id: doc.id, ...doc.data() }));
      docsData.sort((a, b) => (b.reviewedAt?.seconds || 0) - (a.reviewedAt?.seconds || 0)); // Sort by reviewedAt descending[cite: 13]
      setHistoryLeaves(docsData);
    });
  };

  // ==========================================
  // Helper Renderers
  // ==========================================
  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return historyLeaves;
    return historyLeaves.filter(d => d.type === historyFilter); // Filter logic[cite: 13]
  }, [historyLeaves, historyFilter]);

  const getLeaveTypeStyles = (type) => {
    if (type === 'Medical Leave') return 'text-danger bg-danger'; // Specific styling[cite: 13]
    if (type === 'Unpaid Leave') return 'text-warning text-dark bg-warning'; // Specific styling[cite: 13]
    return 'text-primary bg-primary';
  };

  const openModal = (modalName, data = {}) => {
    setModals(prev => ({ ...prev, [modalName]: { isOpen: true, ...data } }));
  };

  const closeModal = (modalName) => {
    setModals(prev => ({ ...prev, [modalName]: { ...prev[modalName], isOpen: false } }));
  };

  // Approval function (passed to Modal or used directly if no modal needed)
  // For brevity in UI, the transaction logic from[cite: 13] should be implemented here or in a dedicated service file.
  const handleApprove = (leaveId, uid, days, type, startDate, endDate) => {
    // This should trigger the runTransaction logic from window.approveLeave[cite: 13]
    console.log("Approving", { leaveId, uid, days, type, startDate, endDate });
    alert("Approval transaction logic needs to be connected to Firebase.");
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <h5 className="fw-bold text-dark mt-3">Loading Requests...</h5>
      </div>
    );
  }

  return (
    <div className="container py-4 animate__animated animate__fadeIn">
      {/* Header[cite: 12] */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h4 className="fw-bold mb-1 text-dark">Leave Management</h4>
          <p className="text-muted small mb-0">Review requests and manage leave balances.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-success fw-bold shadow-sm d-flex align-items-center" onClick={() => openModal('addLeave')}>
            <Plus size={16} className="me-1" /> Add Leave
          </button>
          <span className="badge bg-white text-secondary border shadow-sm p-2 d-flex align-items-center">
            <Calendar size={16} className="me-1" /> <span>{todayDate}</span>
          </span>
        </div>
      </div>

      {/* Tabs[cite: 12] */}
      <ul className="nav nav-tabs mb-4 border-bottom-2">
        <li className="nav-item">
          <button className={`nav-link fw-bold ${activeTab === 'pending' ? 'active text-primary' : 'text-muted'}`} onClick={() => setActiveTab('pending')}>
            Pending Requests {pendingLeaves.length > 0 && <span className="badge bg-danger rounded-pill ms-1">{pendingLeaves.length}</span>}
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link fw-bold ${activeTab === 'history' ? 'active text-primary' : 'text-muted'}`} onClick={() => setActiveTab('history')}>
            Action History
          </button>
        </li>
      </ul>

      <div className="tab-content pb-5">
        {/* Pending Tab[cite: 12, 13] */}
        {activeTab === 'pending' && (
          <div>
            {pendingLeaves.length === 0 ? (
              <div className="text-center py-5">
                <CheckCircle size={48} className="text-success mb-2 opacity-50 mx-auto" />
                <h6 className="fw-bold text-muted">All caught up!</h6>
                <p className="text-muted small">No pending leave requests.</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {pendingLeaves.map(data => {
                  const typeClass = getLeaveTypeStyles(data.type);
                  const durationDisplay = (data.duration && data.duration !== 'Full Day') ? ` (${data.duration.replace('Half Day ', '')})` : ''; // Handle half-day display[cite: 13]
                  
                  return (
                    <div key={data.id} className="card border-0 shadow-sm rounded-4">
                      <div className="card-body p-4">
                        <div className="row align-items-center">
                          <div className="col-md-3 border-end">
                            <h6 className="fw-bold text-dark mb-1">{data.empName || 'Unknown Staff'}</h6>
                            <div className="text-muted small">{data.email || ''}</div>
                            <div className="mt-2 text-muted small"><Clock size={12} className="me-1 d-inline"/>Applied: {data.appliedAt ? formatDateTime(data.appliedAt.toDate()) : 'Unknown'}</div>
                          </div>
                          <div className="col-md-6 px-4">
                            <div className="d-flex align-items-center mb-2">
                              <span className={`badge ${typeClass} bg-opacity-10 ${typeClass.split(' ')[0]} border border-opacity-25 me-2`}>{data.type}</span>
                              <span className="fw-bold text-dark">{data.days} Day(s) <span className="badge bg-secondary ms-1">{durationDisplay}</span></span>
                            </div>
                            <div className="fw-medium text-dark mb-2 d-flex align-items-center">
                              <CalendarRange size={16} className="text-muted me-2" />
                              {formatDate(data.startDate)} <ArrowRight size={12} className="mx-1 text-muted" /> {formatDate(data.endDate)}
                            </div>
                            <div className="text-muted small bg-light p-2 rounded border">
                              <b>Reason:</b> {data.reason || 'No reason provided.'}
                            </div>
                          </div>
                          <div className="col-md-3 text-end">
                            <div className="d-flex flex-column gap-2">
                              <button className="btn btn-success fw-bold shadow-sm" onClick={() => handleApprove(data.id, data.uid, data.days, data.type, data.startDate, data.endDate)}>
                                <Check size={16} className="me-1 d-inline" /> Approve
                              </button>
                              <button className="btn btn-outline-danger fw-bold" onClick={() => openModal('reject', { leaveId: data.id, uid: data.uid })}>
                                <X size={16} className="me-1 d-inline" /> Reject
                              </button>
                              {data.attachmentUrl ? (
                                <button className="btn btn-sm btn-light text-primary border" onClick={() => openModal('attachment', { url: data.attachmentUrl, fileType: data.fileType })}>
                                  <Paperclip size={14} className="me-1 d-inline"/> View Proof
                                </button>
                              ) : (
                                <span className="text-muted small py-1"><FileMinus size={12} className="me-1 d-inline"/>No Proof</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* History Tab[cite: 12, 13] */}
        {activeTab === 'history' && (
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="card-header bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
              <h6 className="fw-bold text-dark m-0">Recent Decisions</h6>
              <select className="form-select form-select-sm border-secondary" style={{ width: '130px' }} value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}>
                <option value="all">All Types</option>
                <option value="Annual Leave">Annual Leave</option>
                <option value="Medical Leave">Medical Leave</option>
                <option value="Unpaid Leave">Unpaid Leave</option>
              </select>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="bg-light text-secondary small fw-bold">
                  <tr>
                    <th className="ps-4">Employee</th>
                    <th>Leave Type</th>
                    <th>Date Range</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th className="text-end pe-4">Reviewed Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr><td colSpan="6" className="text-center text-muted py-4">No records found.</td></tr>
                  ) : (
                    filteredHistory.map(data => {
                      const isApprove = data.status === 'Approved';
                      let typeClass = "text-primary";
                      if (data.type === 'Medical Leave') typeClass = "text-danger"; // Apply specific colors based on type[cite: 13]
                      if (data.type === 'Unpaid Leave') typeClass = "text-warning text-dark";

                      const durationDisplay = (data.duration && data.duration !== 'Full Day') ? ` (${data.duration.replace('Half Day ', '')})` : ''; // Render AM/PM logic[cite: 13]

                      return (
                        <tr key={data.id}>
                          <td className="ps-4">
                            <div className="fw-bold text-dark">{data.empName || 'Unknown'}</div>
                            <div className="small text-muted" style={{ fontSize: '0.75rem' }}>{data.uid}</div>
                          </td>
                          <td className={`fw-bold ${typeClass}`}>{data.type} <small className="text-muted">{durationDisplay}</small></td>
                          <td>
                            <div className="small text-dark">{formatDate(data.startDate)}</div>
                            <div className="small text-muted">to {formatDate(data.endDate)}</div>
                          </td>
                          <td className="fw-bold">
                            {data.days} 
                            {(data.deductibleDays !== undefined && data.deductibleDays < data.days) && <span className="d-block small text-warning">(-{data.deductibleDays} deducted)</span>} {/* Deductible logic rendering[cite: 13] */}
                          </td>
                          <td>
                            <span className={`badge ${isApprove ? 'bg-success bg-opacity-10 text-success border border-success-subtle' : 'bg-danger bg-opacity-10 text-danger border border-danger-subtle'}`}>
                              {data.status}
                            </span>
                          </td>
                          <td className="text-end pe-4">
                            <div className="small text-dark mb-1">{data.reviewedAt ? formatDate(data.reviewedAt.toDate()) : '-'}</div>
                            <div className="d-flex justify-content-end align-items-center">
                              <button className="btn btn-link btn-sm p-0 text-decoration-none" onClick={() => openModal('editStatus', { leaveId: data.id, uid: data.uid, status: data.status, reason: data.rejectionReason || '' })}>Edit</button>
                              {data.attachmentUrl && (
                                <button className="btn btn-link btn-sm p-0 text-info text-decoration-none ms-3" onClick={() => openModal('attachment', { url: data.attachmentUrl, fileType: data.fileType })}>
                                  <Paperclip size={12} className="me-1 d-inline"/>Proof
                                </button>
                              )}
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
        )}
      </div>

      {/* Modals Mounting */}
      <AttachmentModal 
        isOpen={modals.attachment.isOpen} 
        url={modals.attachment.url} 
        fileType={modals.attachment.fileType} 
        onClose={() => closeModal('attachment')} 
      />
      <RejectModal 
        isOpen={modals.reject.isOpen} 
        leaveId={modals.reject.leaveId} 
        uid={modals.reject.uid} 
        onClose={() => closeModal('reject')} 
      />
      <AddLeaveModal 
        isOpen={modals.addLeave.isOpen} 
        usersMap={usersMap} 
        holidaysMap={holidaysMap}
        onClose={() => closeModal('addLeave')} 
      />
      <EditStatusModal 
        isOpen={modals.editStatus.isOpen} 
        leaveId={modals.editStatus.leaveId} 
        uid={modals.editStatus.uid} 
        currentStatus={modals.editStatus.status} 
        initialReason={modals.editStatus.reason} 
        onClose={() => closeModal('editStatus')} 
      />
    </div>
  );
}