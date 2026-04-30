// src/pages/Attendance/components/AttendanceModals.jsx
import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, getDocs, doc, 
  writeBatch, Timestamp, serverTimestamp, getDoc 
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../context/AuthContext';
import { 
  Edit3, CheckCircle, CalendarCheck2, Users, 
  X, Info, Save, Search, Star 
} from 'lucide-react';

// 🚨 导入审计日志记录函数 (请根据您项目的实际路径进行修改)
import { logAdminAction } from '../../../utils/utils'; 

// ============================================================================
// 1. Bulk Verify Modal (批量一键验证 - 矩阵视图版)
// ============================================================================
export function BulkVerifyModal({ isOpen, records, onClose, onSuccess }) {
  const { currentUser } = useAuth(); // 🚨 获取 currentUser 以便记录日志
  const [loading, setLoading] = useState(false);

  if (!isOpen || records.length === 0) return null;

  const groupedData = records.reduce((acc, r) => {
    if (!acc[r.uid]) {
      acc[r.uid] = {
        name: r.name || "Unknown Staff",
        empCode: r.empCode || "N/A",
        sessions: { 'Clock In': '-', 'Break Out': '-', 'Break In': '-', 'Clock Out': '-' }
      };
    }
    acc[r.uid].sessions[r.session] = r.timestamp?.toDate().toTimeString().slice(0, 5);
    return acc;
  }, {});

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      records.forEach(r => {
        batch.update(doc(db, "attendance", r.id), { verificationStatus: "Verified" });
      });
      await batch.commit();

      // 🚨 写入审计日志
      await logAdminAction(db, currentUser, "BULK_VERIFY", "MULTIPLE", null, { 
        verifiedCount: records.length 
      });

      onSuccess();
      onClose();
    } catch (e) { 
      alert(e.message); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg">
            <div className="modal-header bg-success text-white border-0">
              <h6 className="modal-title fw-bold"><CheckCircle size={18} className="me-2 d-inline"/> Review Bulk Verification</h6>
              <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
            </div>
            <div className="modal-body p-0">
              <div className="table-responsive" style={{ maxHeight: '450px' }}>
                <table className="table table-hover mb-0 align-middle text-center small">
                  <thead className="bg-light fw-bold sticky-top">
                    <tr>
                      <th className="text-start ps-4">Employee</th>
                      <th>Clock In</th>
                      <th>Break Out</th>
                      <th>Break In</th>
                      <th>Clock Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedData).map(([uid, data]) => (
                      <tr key={uid}>
                        <td className="text-start ps-4">
                          <div className="fw-bold text-dark">{data.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.7rem' }}>{data.empCode}</div>
                        </td>
                        {['Clock In', 'Break Out', 'Break In', 'Clock Out'].map(s => (
                          <td key={s}>
                            <span className={`badge ${data.sessions[s] !== '-' ? 'bg-success bg-opacity-10 text-success border border-success' : 'bg-light text-muted border'}`}>
                              {data.sessions[s]}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer bg-light border-0 justify-content-between">
              <div className="small text-muted fw-bold">Total: {records.length} pending records</div>
              <div>
                <button className="btn btn-light fw-bold border me-2" onClick={onClose}>Cancel</button>
                <button className="btn btn-success fw-bold px-4" onClick={handleConfirm} disabled={loading}>Confirm All</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 2. Bulk Manual Action Modal (批量补卡 - 智能过滤版)
// ============================================================================
export function BulkManualActionModal({ isOpen, onClose, onSuccess }) {
  const { currentUser } = useAuth(); // 🚨 获取 currentUser
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showReview, setShowReview] = useState(false); 
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    action: '',
    reason: 'System recovery bulk entry'
  });

  useEffect(() => {
    if (isOpen) {
      fetchEligibleStaff();
      setSelectedStaff([]);
      setShowReview(false);
    }
  }, [isOpen, formData.date]);

  const fetchEligibleStaff = async () => {
    setLoading(true);
    try {
      const [uSnap, sSnap, lSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), where("status", "==", "active"))),
        getDocs(query(collection(db, "schedules"), where("date", "==", formData.date))),
        getDocs(query(collection(db, "leaves"), where("status", "==", "Approved"), where("startDate", "<=", formData.date)))
      ]);

      const scheduledUids = new Set(sSnap.docs.map(d => d.data().userId || d.data().uid));
      const onLeaveUids = new Set();
      lSnap.forEach(d => {
        if (d.data().endDate >= formData.date) onLeaveUids.add(d.data().authUid || d.data().uid);
      });

      const eligible = uSnap.docs
        .map(d => ({ 
          id: d.id, 
          authUid: d.data().authUid || null,
          name: d.data().personal?.name || d.data().name || "Unknown",
          email: d.data().personal?.email || ''
        }))
        .filter(u => scheduledUids.has(u.id) && !onLeaveUids.has(u.authUid || u.id));

      setStaffList(eligible);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleCheckboxChange = (staffId) => {
    setSelectedStaff(prev => 
      prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
    );
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const preciseDate = new Date(`${formData.date}T${formData.time}:00`);
      
      selectedStaff.forEach(id => {
        const staff = staffList.find(s => s.id === id);
        if (!staff) return;
        batch.set(doc(collection(db, "attendance")), {
          uid: staff.authUid || staff.id, 
          name: staff.name, 
          email: staff.email,
          date: formData.date, 
          session: formData.action,
          timestamp: Timestamp.fromDate(preciseDate),
          verificationStatus: "Verified", 
          address: "Admin Bulk Entry", 
          remarks: formData.reason
        });
      });

      await batch.commit();

      // 🚨 写入审计日志
      await logAdminAction(db, currentUser, "BULK_MANUAL_ADD_ATTENDANCE", "MULTIPLE", null, {
        date: formData.date, 
        time: formData.time, 
        action: formData.action, 
        staffCount: selectedStaff.length,
        remarks: formData.reason
      });

      onSuccess();
      onClose();
    } catch (e) {
      alert(`Bulk add failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (showReview) {
    const selectedDetails = staffList.filter(s => selectedStaff.includes(s.id));
    
    return (
      <>
        <div className="modal-backdrop fade show"></div>
        <div className="modal fade show d-block" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header bg-danger text-white border-0 py-3">
                <h5 className="modal-title fw-bold">⚠️ Review Bulk Entry</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowReview(false)}></button>
              </div>
              <div className="modal-body p-0">
                <div className="bg-warning bg-opacity-10 p-3 border-bottom">
                  <div className="row text-center">
                    <div className="col-4 border-end">
                      <small className="text-muted d-block">ACTION</small>
                      <span className="fw-bold text-primary">{formData.action}</span>
                    </div>
                    <div className="col-4 border-end">
                      <small className="text-muted d-block">DATE</small>
                      <span className="fw-bold">{formData.date}</span>
                    </div>
                    <div className="col-4">
                      <small className="text-muted d-block">TIME</small>
                      <span className="fw-bold">{formData.time}</span>
                    </div>
                  </div>
                </div>
                <div className="table-responsive" style={{ maxHeight: '350px' }}>
                  <table className="table table-hover mb-0 align-middle small">
                    <thead className="bg-light sticky-top">
                      <tr><th className="ps-4">Staff Name</th><th>Target Action</th><th className="text-end pe-4">Status</th></tr>
                    </thead>
                    <tbody>
                      {selectedDetails.map(s => (
                        <tr key={s.id}>
                          <td className="ps-4 fw-bold">{s.name}</td>
                          <td><span className="badge bg-primary bg-opacity-10 text-primary border border-primary-subtle">{formData.action}</span></td>
                          <td className="text-end pe-4"><span className="text-success small fw-bold">Ready to Add</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer bg-light border-0 justify-content-between">
                <span className="small fw-bold">Executing for {selectedStaff.length} employees</span>
                <div>
                  <button className="btn btn-light border fw-bold me-2" onClick={() => setShowReview(false)}>Back to Edit</button>
                  <button className="btn btn-danger fw-bold px-4 shadow-sm" onClick={handleFinalSubmit} disabled={loading}>
                    {loading ? 'Processing...' : 'Confirm & Write Records'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content border-0 shadow-lg rounded-4">
            <div className="modal-header bg-warning bg-opacity-25 border-0 py-3">
              <h5 className="modal-title fw-bold text-dark"><Users size={20} className="me-2 text-warning d-inline"/> Bulk Add Attendance</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-4 bg-light">
              <div className="row g-3 mb-3 bg-white p-3 rounded-3 shadow-sm border">
                <div className="col-md-4">
                  <label className="small fw-bold text-muted mb-1">Target Date</label>
                  <input type="date" className="form-control" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="col-md-4">
                  <label className="small fw-bold text-muted mb-1">Target Time</label>
                  <input type="time" className="form-control" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
                </div>
                <div className="col-md-4">
                  <label className="small fw-bold text-muted mb-1">Action</label>
                  <select className="form-select" value={formData.action} onChange={e => setFormData({...formData, action: e.target.value})}>
                    <option value="">-- Choose --</option>
                    <option value="Clock In">Clock In</option>
                    <option value="Break Out">Break Out</option>
                    <option value="Break In">Break In</option>
                    <option value="Clock Out">Clock Out</option>
                  </select>
                </div>
              </div>

              <div className="bg-white p-3 rounded-3 shadow-sm border mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                   <label className="small fw-bold text-dark">Select Staff</label>
                   <button type="button" className="btn btn-link btn-sm text-decoration-none p-0 fw-bold" 
                     onClick={() => setSelectedStaff(staffList.map(s => s.id))}>Select All Filtered</button>
                </div>
                <div className="position-relative mb-2">
                  <input type="text" className="form-control form-control-sm ps-4" placeholder="Search name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  <Search size={14} className="position-absolute top-50 start-0 translate-middle-y ms-2 text-muted"/>
                </div>
                <div className="border rounded overflow-auto bg-light" style={{ maxHeight: '200px' }}>
                  {staffList.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map(s => (
                    <label key={s.id} className="p-2 border-bottom d-flex align-items-center bg-white cursor-pointer w-100 mb-0">
                      <input type="checkbox" className="form-check-input me-2" checked={selectedStaff.includes(s.id)} onChange={() => handleCheckboxChange(s.id)} />
                      <span className="small fw-bold">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer border-top bg-light">
              <button type="button" className="btn btn-secondary fw-bold px-4" onClick={onClose}>Cancel</button>
              <button 
                type="button"
                className="btn btn-warning text-dark fw-bold px-4 shadow-sm" 
                onClick={() => {
                  if (!formData.action || !formData.time || selectedStaff.length === 0) return alert("Please fill all fields.");
                  setShowReview(true);
                }}
              >
                Review Bulk Add ({selectedStaff.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 3. Admin Manual Action Modal (管理员手动补卡 / 修改状态)
// ============================================================================
export function ManualActionModal({ isOpen, onClose, uid, staffName, targetDate, onSuccess }) {
  const { currentUser } = useAuth(); // 🚨 获取 currentUser
  const [actionType, setActionType] = useState('');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    singleTime: '', clockIn: '', clockOut: '', breakOut: '', breakIn: '', reason: ''
  });

  if (!isOpen) return null;

  const isSingleAdd = ['Add Clock In', 'Add Break Out', 'Add Break In', 'Add Clock Out'].includes(actionType);
  const isFullOverwrite = actionType === 'Overwrite Full Day';
  const willArchive = ['Overwrite Full Day', 'Absent'].includes(actionType) || actionType.includes('Leave');

  const handleSubmit = async () => {
    if (!actionType || !window.confirm(`Confirm ${actionType} for ${staffName}?`)) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const q = query(collection(db, "attendance"), where("uid", "==", uid), where("date", "==", targetDate));
      const snap = await getDocs(q);
      
      const oldDataSnapshot = [];
      if (willArchive) {
        snap.forEach(d => {
          oldDataSnapshot.push({id: d.id, ...d.data()});
          batch.update(d.ref, { verificationStatus: "Archived" });
        });
      }

      const baseRecord = { 
        uid, name: staffName, date: targetDate, 
        verificationStatus: "Verified", address: "Admin Manual Entry", 
        remarks: formData.reason 
      };

      let actionCodeForLog = "";
      let newLogData = {};

      if (isSingleAdd) {
        if (!formData.singleTime) throw new Error("Please enter a valid time.");
        const sessionType = actionType.replace('Add ', '');
        const preciseDate = new Date(`${targetDate}T${formData.singleTime}:00`);
        const newDocData = { 
          ...baseRecord, session: sessionType, timestamp: Timestamp.fromDate(preciseDate)
        };
        batch.set(doc(collection(db, "attendance")), newDocData);
        actionCodeForLog = actionType.toUpperCase().replace(/ /g, '_');
        newLogData = newDocData;
      } 
      else if (isFullOverwrite) {
        const times = [
          { key: 'clockIn', session: 'Clock In' }, { key: 'breakOut', session: 'Break Out' },
          { key: 'breakIn', session: 'Break In' }, { key: 'clockOut', session: 'Clock Out' }
        ];
        times.forEach(t => {
          if (formData[t.key]) {
            const pt = new Date(`${targetDate}T${formData[t.key]}:00`);
            batch.set(doc(collection(db, "attendance")), { 
              ...baseRecord, session: t.session, timestamp: Timestamp.fromDate(pt) 
            });
          }
        });
        actionCodeForLog = "MANUAL_OVERWRITE_FULL_DAY";
        newLogData = { times: formData, date: targetDate };
      }
      else if (actionType === 'Absent' || actionType.includes('Leave')) {
        const leaveData = {
          uid, empName: staffName, type: actionType, 
          startDate: targetDate, endDate: targetDate, days: 1, duration: 'Full Day',
          status: 'Approved', reviewedAt: serverTimestamp(),
          reason: formData.reason || `Admin Manual ${actionType}`
        };
        batch.set(doc(collection(db, "leaves")), leaveData);
        actionCodeForLog = actionType === 'Absent' ? "MANUAL_ATTENDANCE_ABSENT" : "MANUAL_LEAVE_ASSIGN";
        newLogData = leaveData;
      }

      await batch.commit();

      // 🚨 写入单人手工操作审计日志
      await logAdminAction(db, currentUser, actionCodeForLog, uid, oldDataSnapshot, newLogData);

      onSuccess();
      onClose();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-primary bg-opacity-10 border-0">
              <h6 className="modal-title fw-bold text-primary"><Edit3 size={16} className="me-2 d-inline"/> Admin Override: {staffName}</h6>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-4">
              <div className="mb-3">
                <label className="form-label small fw-bold text-dark">Action for {targetDate}</label>
                <select className="form-select border-primary fw-bold text-primary" value={actionType} onChange={(e) => setActionType(e.target.value)}>
                  <option value="">-- Choose --</option>
                  <optgroup label="Adjustment (Safe)">
                    <option value="Add Clock In">➕ Add Clock In</option>
                    <option value="Add Break Out">☕ Add Break Out</option>
                    <option value="Add Break In">💼 Add Break In</option>
                    <option value="Add Clock Out">🚪 Add Clock Out</option>
                  </optgroup>
                  <optgroup label="Overwrite (Replaces Old)">
                    <option value="Overwrite Full Day">🔄 Full Day Present</option>
                    <option value="Absent">❌ Mark Absent</option>
                    <option value="Annual Leave">🏖️ Annual Leave</option>
                  </optgroup>
                </select>
              </div>
              {isSingleAdd && (
                <div className="p-3 bg-light rounded border border-primary mb-3">
                  <label className="small fw-bold text-primary">Time</label>
                  <input type="time" className="form-control fw-bold border-primary" value={formData.singleTime} onChange={e => setFormData({...formData, singleTime: e.target.value})} />
                </div>
              )}
              {isFullOverwrite && (
                <div className="p-3 bg-light rounded border border-primary mb-3">
                  <div className="row g-2 mb-2">
                    <div className="col-6"><label className="small fw-bold text-primary">Clock In</label><input type="time" className="form-control border-primary fw-bold" value={formData.clockIn} onChange={e => setFormData({...formData, clockIn: e.target.value})} /></div>
                    <div className="col-6"><label className="small fw-bold text-primary">Clock Out</label><input type="time" className="form-control border-primary fw-bold" value={formData.clockOut} onChange={e => setFormData({...formData, clockOut: e.target.value})} /></div>
                  </div>
                </div>
              )}
              {willArchive && (
                <div className="alert alert-danger small mb-3 py-2">
                  <Info size={14} className="me-1 d-inline"/> <b>Notice:</b> Existing logs will be archived.
                </div>
              )}
              <input type="text" className="form-control" placeholder="Reason..." value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} />
            </div>
            <div className="modal-footer bg-light border-0">
              <button className="btn btn-primary btn-sm w-100 fw-bold" disabled={loading} onClick={handleSubmit}>{loading ? 'Saving...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 4. Monthly Report Modal (月度报表) - 不涉及数据库写入
// ============================================================================
export function MonthlyReportModal({ isOpen, onClose }) {
  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchUsers = async () => {
        const snap = await getDocs(query(collection(db, "users"), where("status", "==", "active")));
        setUsers(snap.docs.map(d => ({ id: d.id, name: d.data().personal?.name || d.data().name })));
        const now = new Date();
        setSelectedMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      };
      fetchUsers();
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    if (!selectedUid || !selectedMonth) return alert("Select staff and month.");
    setLoading(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const daysInMonth = new Date(year, month, 0).getDate();
      const startDate = `${selectedMonth}-01`;
      const endDate = `${selectedMonth}-${daysInMonth}`;

      const q = query(collection(db, "attendance"), where("uid", "==", selectedUid), where("date", ">=", startDate), where("date", "<=", endDate));
      const snap = await getDocs(q);

      const dailyData = {};
      snap.forEach(doc => {
        const d = doc.data();
        if (d.verificationStatus !== 'Archived') {
          if (!dailyData[d.date]) dailyData[d.date] = { in: null, out: null };
          if (d.session === 'Clock In') dailyData[d.date].in = d;
          if (d.session === 'Clock Out') dailyData[d.date].out = d;
        }
      });

      const report = [];
      let totalMs = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${month}-${String(d).padStart(2, '0')}`;
        const dayRec = dailyData[dateStr];
        let hrs = 0;
        if (dayRec?.in && dayRec?.out) {
          const diff = dayRec.out.timestamp.toDate() - dayRec.in.timestamp.toDate();
          if (diff > 0) { totalMs += diff; hrs = diff / 3600000; }
        }
        report.push({ date: dateStr, in: dayRec?.in ? formatTime(dayRec.in.timestamp) : '-', out: dayRec?.out ? formatTime(dayRec.out.timestamp) : '-', hours: hrs > 0 ? hrs.toFixed(2) : '-' });
      }
      setReportData({ logs: report, totalHours: (totalMs / 3600000).toFixed(2) });
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const formatTime = (t) => t?.toDate().toTimeString().slice(0, 5) || '-';

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content border-0 shadow-lg rounded-4">
            <div className="modal-header bg-primary bg-gradient text-white border-0 py-3">
              <h5 className="modal-title fw-bold d-flex align-items-center"><CalendarCheck2 size={20} className="me-2 d-inline"/> Monthly Summary</h5>
              <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
            </div>
            <div className="modal-body bg-light p-4">
              <div className="row g-3 mb-4 bg-white p-3 rounded-3 shadow-sm border">
                <div className="col-md-5">
                  <label className="form-label small fw-bold text-muted mb-1">Select Staff</label>
                  <select className="form-select" value={selectedUid} onChange={e => setSelectedUid(e.target.value)}>
                    <option value="">-- Select --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-bold text-muted mb-1">Month</label>
                  <input type="month" className="form-control" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <button className="btn btn-primary w-100 fw-bold" disabled={loading} onClick={handleGenerate}>{loading ? 'Wait...' : 'Generate'}</button>
                </div>
              </div>
              <div className="table-responsive bg-white rounded-3 shadow-sm border" style={{ maxHeight: '300px' }}>
                <table className="table table-hover align-middle mb-0 text-center small">
                  <thead className="table-light sticky-top">
                    <tr><th className="text-start ps-4">Date</th><th>In</th><th>Out</th><th className="text-end pe-4">Hrs</th></tr>
                  </thead>
                  <tbody>
                    {reportData?.logs.map(log => (
                      <tr key={log.date}>
                        <td className="text-start ps-4 fw-medium">{log.date}</td>
                        <td><span className={log.in !== '-' ? 'text-success fw-bold' : ''}>{log.in}</span></td>
                        <td><span className={log.out !== '-' ? 'text-secondary fw-bold' : ''}>{log.out}</span></td>
                        <td className="text-end pe-4 fw-bold">{log.hours}</td>
                      </tr>
                    ))}
                    {!reportData && <tr><td colSpan="4" className="py-4 text-muted">Select filters to view data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer bg-light"><button className="btn btn-secondary btn-sm px-4 fw-bold" onClick={onClose}>Close</button></div>
          </div>
        </div>
      </div>
    </>
  );
}