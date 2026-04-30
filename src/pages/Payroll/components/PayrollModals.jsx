// src/pages/Payroll/components/PayrollModals.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../context/AuthContext';
import { formatMoney, calculateStatutoryAmount, logAdminAction } from '../../../utils/utils';

// Icons
import { Settings, HandCoins, CheckCircle, Clock, Zap, ExternalLink, Printer } from 'lucide-react';

// ============================================================================
// 1. Settings Modal
// ============================================================================
const SettingsModal = ({ isOpen, onClose, globalSettings, setGlobalSettings }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(globalSettings);

  useEffect(() => { if(isOpen) setForm(globalSettings); }, [isOpen, globalSettings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      const oldSnap = await getDoc(doc(db, "settings", "payroll_config"));
      await setDoc(doc(db, "settings", "payroll_config"), form, { merge: true });
      
      // 🚨 Audit Log
      await logAdminAction(db, currentUser, "UPDATE_PAYROLL_SETTINGS", "GLOBAL", oldSnap.exists() ? oldSnap.data() : null, form);
      
      setGlobalSettings(form);
      alert("Settings Saved!");
      onClose();
    } catch (e) {
      alert("Error saving settings: " + e.message);
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
            <div className="modal-header bg-light">
              <h5 className="modal-title fw-bold"><Settings size={18} className="me-2 d-inline" />Payroll Settings</h5>
              <button className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body">
              <div className="mb-4">
                  <label className="form-label fw-bold text-primary">1. Salary Calculation Mode</label>
                  <select className="form-select border-primary" value={form.calcMode} onChange={e => setForm({...form, calcMode: e.target.value})}>
                      <option value="daily">Daily Rate (Based on Std Days & Paid Leaves)</option>
                      <option value="hourly">Hourly Rate (Strictly hours worked)</option>
                  </select>
                  <small className="text-muted mt-1 d-block">
                    {form.calcMode === 'hourly' ? "Pays based on strictly total hours worked." : "Pays based on days worked + paid leave days."}
                  </small>
              </div>
              
              {form.calcMode === 'daily' && (
                <div className="mb-4">
                    <label className="form-label fw-bold text-primary">2. Saturday Attendance Multiplier</label>
                    <select className="form-select border-primary mb-2" value={form.satMultiplier} onChange={e => setForm({...form, satMultiplier: parseFloat(e.target.value)})}>
                        <option value="1">1.0 (Counts as 1 Full Day)</option>
                        <option value="0.5">0.5 (Counts as Half Day)</option>
                        <option value="0">0.0 (Exclude from day count)</option>
                    </select>
                </div>
              )}

              <div className="mb-3 border-top pt-3">
                  <label className="form-label fw-bold text-danger">3. Late Penalty Rule</label>
                  <select className="form-select border-danger mb-2" value={form.lateMode} onChange={e => setForm({...form, lateMode: e.target.value})}>
                      <option value="minutes">By Exact Minutes (Pro-rated from Basic)</option>
                      <option value="times">By Occurrences (Fixed fine per late)</option>
                  </select>
                  {form.lateMode === 'times' && (
                    <div className="mt-2 p-3 bg-danger bg-opacity-10 rounded border border-danger">
                        <label className="small fw-bold text-danger mb-1">Fine amount per late occurrence (RM)</label>
                        <input type="number" className="form-control fw-bold text-danger" step="0.5" value={form.lateFixedAmount} onChange={e => setForm({...form, lateFixedAmount: parseFloat(e.target.value)})} />
                    </div>
                  )}
              </div>
              
              <div className="mb-3 border-top pt-3">
                  <label className="form-label fw-bold text-dark">4. Default Company Name</label>
                  <select className="form-select border-dark mb-2" value={form.defaultCompany} onChange={e => setForm({...form, defaultCompany: e.target.value})}>
                      <option value="RH RIDER HUB MOTOR (M) SDN. BHD.">RH RIDER HUB MOTOR (M) SDN. BHD.</option>
                      <option value="H DIGITAL CARRIER MARKETING SDN BHD">H DIGITAL CARRIER MARKETING SDN BHD</option>
                      <option value="RH RIDER HUB MOTOR (BORNEO) SDN. BHD.">RH RIDER HUB MOTOR (BORNEO) SDN. BHD.</option>
                  </select>
              </div>
            </div>
            <div className="modal-footer bg-light">
              <button className="btn btn-dark px-4 fw-bold" onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save Configuration'}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ============================================================================
// 2. Advances Modal
// ============================================================================
const AdvancesModal = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (isOpen) fetchAdvances();
  }, [isOpen]);

  const fetchAdvances = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "salary_advances")));
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        if (!data.isDeducted && data.status !== 'Rejected') list.push({ id: d.id, ...data });
      });
      setAdvances(list.sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id, status, uid, amount) => {
    setActionLoading(true);
    try {
      const docRef = doc(db, "salary_advances", id);
      const oldSnap = await getDoc(docRef);
      await updateDoc(docRef, { status: status, updatedAt: serverTimestamp() });
      
      // 🚨 Audit Log
      await logAdminAction(db, currentUser, "APPROVE_ADVANCE", uid, oldSnap.exists() ? oldSnap.data() : null, { status, amount });

      fetchAdvances();
    } catch (e) { alert(e.message); } finally { setActionLoading(false); }
  };

  const handleMarkTransferred = async (id, uid, amount) => {
    if(!window.confirm("Are you sure you have transferred the funds to the employee's bank account?\n\nOnce marked as transferred, it will be automatically deducted from their next payslip.")) return;
    setActionLoading(true);
    try {
      const docRef = doc(db, "salary_advances", id);
      const oldSnap = await getDoc(docRef);
      await updateDoc(docRef, { isTransferred: true, transferredAt: serverTimestamp(), updatedAt: serverTimestamp() });
      
      // 🚨 Audit Log
      await logAdminAction(db, currentUser, "TRANSFER_ADVANCE", uid, oldSnap.exists() ? oldSnap.data() : null, { isTransferred: true, amount });
      
      fetchAdvances();
    } catch (e) { alert(e.message); } finally { setActionLoading(false); }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-danger text-white border-0">
              <h5 className="modal-title fw-bold"><HandCoins size={20} className="me-2 d-inline" />Salary Advances</h5>
              <button className="btn-close btn-close-white" onClick={onClose}></button>
            </div>
            <div className="modal-body p-0">
              <table className="table table-hover align-middle mb-0">
                  <thead className="table-light text-secondary small text-uppercase">
                      <tr>
                          <th className="ps-4">Staff</th>
                          <th>Amount</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th className="text-end pe-4">Action</th>
                      </tr>
                  </thead>
                  <tbody>
                    {loading ? <tr><td colSpan="5" className="text-center py-4"><span className="spinner-border spinner-border-sm text-danger"></span></td></tr> : advances.length === 0 ? <tr><td colSpan="5" className="text-center py-5 text-muted fw-bold">No pending/active requests found.</td></tr> : advances.map(d => (
                      <tr key={d.id} className="align-middle">
                        <td className="ps-4"><div className="fw-bold text-dark">{d.empName || '-'}</div><small className="text-muted">{d.empCode || ''}</small></td>
                        <td className="text-danger fw-bold fs-6">RM {formatMoney(d.amount)}</td>
                        <td className="text-secondary text-truncate" style={{ maxWidth: '200px' }} title={d.reason}>{d.reason || '-'}</td>
                        <td>
                          {d.status === 'Pending' ? <span className="badge bg-warning text-dark px-2 py-1">Pending</span> : 
                           d.isTransferred ? <span className="badge bg-success px-2 py-1"><CheckCircle size={12} className="me-1 d-inline"/>Transferred</span> : 
                           <span className="badge bg-info text-dark px-2 py-1"><Clock size={12} className="me-1 d-inline"/>Awaiting Transfer</span>}
                        </td>
                        <td className="text-end pe-4">
                           {d.status === 'Pending' ? (
                             <>
                              <button className="btn btn-sm btn-success fw-bold px-3 py-1 me-1 shadow-sm" disabled={actionLoading} onClick={() => handleUpdateStatus(d.id, 'Approved', d.uid, d.amount)}>Approve</button>
                              <button className="btn btn-sm btn-outline-danger fw-bold px-3 py-1" disabled={actionLoading} onClick={() => handleUpdateStatus(d.id, 'Rejected', d.uid, d.amount)}>Reject</button>
                             </>
                           ) : d.isTransferred ? (
                              <span className="text-success small fw-bold"><CheckCircle size={14} className="d-inline"/> Ready for Deduction</span>
                           ) : (
                             <>
                              <button className="btn btn-sm btn-primary fw-bold px-3 py-1 me-1 shadow-sm" disabled={actionLoading} onClick={() => handleMarkTransferred(d.id, d.uid, d.amount)}>Mark Transferred</button>
                              <button className="btn btn-sm btn-light border text-danger py-1" disabled={actionLoading} onClick={() => handleUpdateStatus(d.id, 'Rejected', d.uid, d.amount)}>Revoke</button>
                             </>
                           )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ============================================================================
// 3. Main Payslip Form & Auto Generator Engine
// ============================================================================
const PayslipForm = ({ isOpen, onClose, editId, autoBatch, globalSettings, staffMap, holidaysMap, monthStr, currentPayrollData }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);

  // Form State corresponding to the HTML version
  const [form, setForm] = useState({
    uid: '', month: monthStr, company: globalSettings.defaultCompany,
    basic: 0, stdDays: 26, hourlyRate: 0,
    comm: 0, ot: 0, allow: 0,
    absentDed: 0, unpaidDed: 0, unschedDed: 0, lateDed: 0,
    epf: 0, socso: 0, eis: 0, pcb: 0, advance: 0,
    empEpf: 0, empSocso: 0, empEis: 0,
    status: 'Draft',
    meta: {
       schDays: 0, actDays: 0, al: 0, ml: 0, unpaid: 0, 
       phOff: 0, phWork: 0, phWorkHrs: 0,
       totalHrs: 0, lateMins: 0, lateCount: 0,
       absentDays: 0, absentHrs: 0, unpaidHrs: 0, unschedDays: 0, unschedHrs: 0,
       majorityHours: 208,
       calcPHExtra: 0, dispGrossBasic: 0, dispNet: 0
    },
    advanceIds: []
  });

  // Fetch Logic when modal opens
  useEffect(() => {
    if (isOpen && autoBatch) {
      handleAutoGenerateAll();
    } else if (isOpen && editId) {
      loadEditData(editId);
    } else if (isOpen) {
      // Reset form for "Custom Single"
      setForm(prev => ({ ...prev, uid: '', month: monthStr, status: 'Draft' }));
    }
  }, [isOpen, autoBatch, editId, monthStr]);

  const loadEditData = (id) => {
    const d = currentPayrollData.find(x => x.id === id);
    if (!d) return;
    setForm({
      uid: d.uid, month: d.month, company: d.companyName || globalSettings.defaultCompany,
      basic: d.basic || 0, stdDays: d.attendanceStats?.stdDays || 26, hourlyRate: 0,
      comm: d.earnings?.commission || 0, ot: d.earnings?.ot || 0, allow: d.earnings?.allowance || 0,
      absentDed: d.deductions?.absent || 0, unpaidDed: d.deductions?.unpaidLeave || 0, unschedDed: d.deductions?.unscheduled || 0, lateDed: d.deductions?.late || 0,
      epf: d.deductions?.epf || 0, socso: d.deductions?.socso || 0, eis: d.deductions?.eis || 0, pcb: d.deductions?.tax || 0, advance: d.deductions?.advance || 0,
      empEpf: d.employer_epf || 0, empSocso: d.employer_socso || 0, empEis: d.employer_eis || 0,
      status: d.status || 'Draft',
      meta: {
        schDays: 0, // Simplified for UI recovery
        actDays: d.attendanceStats?.actDays || 0,
        al: d.attendanceStats?.annualLeave || 0,
        ml: d.attendanceStats?.medicalLeave || 0,
        unpaid: d.attendanceStats?.unpaidLeave || 0,
        phOff: d.attendanceStats?.phUnworked || 0,
        phWork: d.attendanceStats?.phWorked || 0,
        phWorkHrs: d.attendanceStats?.phUnworkedHrs || 0,
        totalHrs: d.attendanceStats?.totalHrs || 0,
        lateMins: d.attendanceStats?.lateMins || 0,
        lateCount: d.attendanceStats?.lateCount || 0,
        absentDays: d.attendanceStats?.absentDays || 0,
        absentHrs: 0, unpaidHrs: 0,
        unschedDays: d.attendanceStats?.unscheduledDays || 0,
        unschedHrs: 0,
        majorityHours: d.attendanceStats?.majorityHours || 208,
        calcPHExtra: d.earnings?.phPay || 0,
        dispGrossBasic: d.final_basic || d.basic || 0,
        dispNet: d.net || 0
      },
      advanceIds: []
    });
  };

  // ==========================================
  // Core Auto Generation Engine (Adapted from window.generateAllDrafts)
  // ==========================================
  const handleAutoGenerateAll = async () => {
    if(!window.confirm(`⚠️ AUTO GENERATION WARNING\n\nThis will automatically calculate and generate DRAFT payslips for ALL active staff for ${monthStr}.\nAny existing 'Draft' will be OVERWRITTEN.\nExisting 'Published' payslips will be SKIPPED.\n\nProceed?`)) {
      return onClose();
    }

    setEngineLoading(true);
    try {
      const batch = writeBatch(db);
      let generatedCount = 0; let skippedCount = 0;

      const [year, month] = monthStr.split('-');
      const startDate = `${monthStr}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const endDate = `${monthStr}-${daysInMonth}`;

      const [allSchedSnap, allLeavesSnap, allAttSnap, allAdvSnap] = await Promise.all([
          getDocs(query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate))),
          getDocs(query(collection(db, "leaves"), where("status", "==", "Approved"))),
          getDocs(query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate))),
          getDocs(query(collection(db, "salary_advances"), where("status", "==", "Approved"), where("isDeducted", "==", false)))
      ]);

      const schedules = {}; const leaves = []; const attendances = {}; const advances = {};
      const userSchedHours = {};

      allSchedSnap.forEach(d => { 
          const s = d.data(); 
          if(!schedules[s.userId]) schedules[s.userId] = []; 
          schedules[s.userId].push(s); 
          if(s.start && s.end) {
              const start = s.start.toDate ? s.start.toDate() : new Date(s.start);
              const end = s.end.toDate ? s.end.toDate() : new Date(s.end);
              let duration = (end - start) / 3600000;
              duration -= (s.breakMins || 0) / 60;
              if (duration > 0) userSchedHours[s.userId] = (userSchedHours[s.userId] || 0) + duration;
          }
      });

      const hrFreq = {}; 
      Object.values(userSchedHours).forEach(h => {
          const key = h.toFixed(1);
          if (h > 0) hrFreq[key] = (hrFreq[key] || 0) + 1;
      });
      let majorityHours = 208; let maxHrFreq = 0;
      for (let h in hrFreq) { if (hrFreq[h] > maxHrFreq) { maxHrFreq = hrFreq[h]; majorityHours = parseFloat(h); } }

      allLeavesSnap.forEach(d => leaves.push(d.data()));
      allAttSnap.forEach(d => { 
          const a = d.data(); 
          if(a.verificationStatus === 'Verified') {
              if(!attendances[a.uid]) attendances[a.uid] = {};
              if(!attendances[a.uid][a.date]) attendances[a.uid][a.date] = { in: null, out: null, breakOut: null, breakIn: null };
              if(a.session === 'Clock In') attendances[a.uid][a.date].in = a.manualIn || a.timeIn || a.timestamp;
              if(a.session === 'Clock Out') attendances[a.uid][a.date].out = a.manualOut || a.timeOut || a.timestamp;
              if(a.session === 'Break Out') attendances[a.uid][a.date].breakOut = a.manualOut || a.timeOut || a.timestamp;
              if(a.session === 'Break In') attendances[a.uid][a.date].breakIn = a.manualIn || a.timeIn || a.timestamp;
          }
      });
      allAdvSnap.forEach(d => { 
          const a = d.data(); 
          if (a.isTransferred === true) advances[a.uid] = (advances[a.uid] || 0) + a.amount; 
      });

      // BIG LOOP PER STAFF
      for (const [uid, staff] of Object.entries(staffMap)) {
        const payslipId = `${uid}_${monthStr}`;
        const existingPs = currentPayrollData.find(p => p.id === payslipId);
        if (existingPs && existingPs.status === 'Published') { skippedCount++; continue; }

        const searchIds = [uid];
        if (staff.authUid) searchIds.push(staff.authUid);

        let mySchedCount = 0; let majorityDays = 26; 
        searchIds.forEach(sid => { if(schedules[sid]) mySchedCount += schedules[sid].length; });

        let actWorkedDays = 0, totalWorkMs = 0, totalLateMs = 0, lateCount = 0;
        let phUnworkedDays = 0, phWorkedDays = 0, phWorkedMs = 0, phUnworkedMs = 0;
        let absentDays = 0, absentHrs = 0;
        const satMulti = parseFloat(globalSettings.satMultiplier || 1.0);
        
        const toDateObj = (t, dateStr) => {
            if(!t) return null;
            if(t.toDate) return t.toDate();
            if(typeof t === 'string' && t.includes(':')) return new Date(`${dateStr}T${t}:00`);
            return new Date(t);
        };

        const myAtt = searchIds.map(sid => attendances[sid] || {}).reduce((acc, curr) => ({...acc, ...curr}), {});
        const mySchedsList = searchIds.map(sid => schedules[sid] || []).flat().reduce((acc, s) => { acc[s.date] = s; return acc; }, {});

        const userLeaves = {};
        leaves.forEach(l => {
            if (searchIds.includes(l.uid) || searchIds.includes(l.authUid)) {
                const [sY, sM, sD] = l.startDate.split('-');
                const [eY, eM, eD] = l.endDate.split('-');
                let curr = new Date(sY, sM - 1, sD);
                const endD = new Date(eY, eM - 1, eD);
                const lVal = l.days || 1; 
                while(curr <= endD) {
                    const dStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
                    if (dStr >= startDate && dStr <= endDate) { userLeaves[dStr] = { type: l.type, val: lVal }; }
                    curr.setDate(curr.getDate() + 1);
                }
            }
        });

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month}-${String(d).padStart(2, '0')}`;
            const records = myAtt[dateStr];
            const sched = mySchedsList[dateStr];
            const leaveObj = userLeaves[dateStr];
            const leaveType = leaveObj?.type;
            const leaveVal = leaveObj?.val || 0; 
            const isPH = !!holidaysMap[dateStr];
            const validPH = isPH && (!!sched || !!leaveType);

            if (records && records.in) {
                const isSat = new Date(dateStr).getDay() === 6;
                let actAdd = isSat ? satMulti : 1;
                if (leaveVal === 0.5) actAdd = 0.5;
                
                actWorkedDays += actAdd;

                if (sched && sched.start) {
                    const inTime = toDateObj(records.in, dateStr);
                    const schedStart = toDateObj(sched.start, dateStr);
                    if (inTime > schedStart) { totalLateMs += (inTime - schedStart); lateCount++; }
                }

                let workMsThisDay = 0;
                if (records.out) {
                    const inTime = toDateObj(records.in, dateStr);
                    const outTime = toDateObj(records.out, dateStr);
                    workMsThisDay = outTime - inTime;
                    
                    if (records.breakOut && records.breakIn) {
                        const bOut = toDateObj(records.breakOut, dateStr);
                        const bIn = toDateObj(records.breakIn, dateStr);
                        const breakDur = bIn - bOut;
                        if (breakDur > 0) workMsThisDay -= breakDur;
                    }

                    if (sched && sched.start && sched.end) {
                        const sStart = toDateObj(sched.start, dateStr);
                        const sEnd = toDateObj(sched.end, dateStr);
                        let schedDurMs = sEnd - sStart;
                        if (sched.breakMins) schedDurMs -= sched.breakMins * 60000;
                        if (schedDurMs > 0 && workMsThisDay > schedDurMs) workMsThisDay = schedDurMs;
                    }
                    if(workMsThisDay > 0) totalWorkMs += workMsThisDay;
                }
                if (validPH) { phWorkedDays += isSat ? satMulti : 1; phWorkedMs += (workMsThisDay > 0 ? workMsThisDay : 0); }
            } else {
                if (validPH) {
                    const isSat = new Date(dateStr).getDay() === 6;
                    phUnworkedDays += isSat ? satMulti : 1;
                    if (sched && sched.start && sched.end) {
                        let schedDurMs = toDateObj(sched.end, dateStr) - toDateObj(sched.start, dateStr);
                        if (sched.breakMins) schedDurMs -= sched.breakMins * 60000;
                        if (schedDurMs > 0) phUnworkedMs += schedDurMs;
                    } else if (leaveType) { phUnworkedMs += 8 * 3600000; }
                } else if (sched && !leaveType) {
                    const isSat = new Date(dateStr).getDay() === 6;
                    absentDays += isSat ? satMulti : 1;
                    if (sched.start && sched.end) {
                        let schedDurMs = toDateObj(sched.end, dateStr) - toDateObj(sched.start, dateStr);
                        if (sched.breakMins) schedDurMs -= sched.breakMins * 60000;
                        if (schedDurMs > 0) absentHrs += (schedDurMs / 3600000);
                    }
                }
            }
        }

        let annualLeaveCount = 0, medicalLeaveCount = 0, unpaidLeaveCount = 0;
        let unpaidLeaveHrs = 0;
        for (const [dateStr, leaveObj] of Object.entries(userLeaves)) {
            const lType = leaveObj.type;
            const lVal = parseFloat(leaveObj.val) || 1; 
            const validPH = !!holidaysMap[dateStr] && (!!mySchedsList[dateStr] || !!lType);
            
            if (!myAtt[dateStr]?.in || lVal < 1 || !validPH) {
                if (lType.includes('Annual') || lType.includes('年假') || lType.includes('Cuti Tahunan')) { annualLeaveCount += lVal; }
                else if (lType.includes('Medical') || lType.includes('病假') || lType.includes('Cuti Sakit')) { medicalLeaveCount += lVal; }
                else {
                    unpaidLeaveCount += lVal;
                    const sched = mySchedsList[dateStr];
                    if (sched && sched.start && sched.end) {
                        let schedDurMs = toDateObj(sched.end, dateStr) - toDateObj(sched.start, dateStr);
                        if (sched.breakMins) schedDurMs -= sched.breakMins * 60000;
                        if (schedDurMs > 0) unpaidLeaveHrs += (schedDurMs / 3600000) * lVal;
                    } else { unpaidLeaveHrs += 8 * lVal; }
                }
            }
        }

        const paidLeaveCount = annualLeaveCount + medicalLeaveCount;
        const totalDecimalHrs = totalWorkMs / 3600000;
        const phUnworkedHrsDec = phUnworkedMs / 3600000;
        const phWorkedHrsDec = phWorkedMs / 3600000;
        const totalLateMins = Math.floor(totalLateMs / 60000);
        
        const totalRecordedDays = actWorkedDays + paidLeaveCount + phUnworkedDays + unpaidLeaveCount + absentDays;
        const unscheduledDays = Math.max(0, majorityDays - totalRecordedDays);
        const totalRecordedHrs = totalDecimalHrs + phUnworkedHrsDec + (paidLeaveCount * 8) + unpaidLeaveHrs + absentHrs;
        const unscheduledHrs = Math.max(0, majorityHours - totalRecordedHrs);

        let totalAdvanceDed = 0;
        searchIds.forEach(sid => { if(advances[sid]) totalAdvanceDed += advances[sid]; });

        const fullBasic = parseFloat(staff.payroll?.basic) || 0;
        let baseGross = fullBasic; 
        let phExtraGross = 0, autoLateDeduct = 0;
        let absentDed = 0, unpaidDed = 0, unscheduledDed = 0;

        if (globalSettings.calcMode === 'hourly') {
            const exactHrRate = (majorityHours > 0) ? (fullBasic / majorityHours) : 0;
            absentDed = exactHrRate * absentHrs;
            unpaidDed = exactHrRate * unpaidLeaveHrs;
            unscheduledDed = exactHrRate * unscheduledHrs;
            phExtraGross = exactHrRate * phWorkedHrsDec * 2;
            if (globalSettings.lateMode === 'times') autoLateDeduct = lateCount * (parseFloat(globalSettings.lateFixedAmount) || 0);
        } else {
            const exactDailyRate = majorityDays > 0 ? (fullBasic / majorityDays) : 0;
            absentDed = exactDailyRate * absentDays;
            unpaidDed = exactDailyRate * unpaidLeaveCount;
            unscheduledDed = exactDailyRate * unscheduledDays;
            phExtraGross = phWorkedDays * 2 * exactDailyRate;
            if (globalSettings.lateMode === 'times') autoLateDeduct = lateCount * (parseFloat(globalSettings.lateFixedAmount) || 0);
            else autoLateDeduct = ((exactDailyRate / 8) / 60) * totalLateMins;
        }

        let earnedBasicForStatutory = baseGross - absentDed - unpaidDed - unscheduledDed - autoLateDeduct;
        if (earnedBasicForStatutory < 0) earnedBasicForStatutory = 0;

        let epfAmt = 0, eisAmt = 0;
        if (staff.statutory) {
            const epfRaw = staff.statutory.epf?.contrib || '';
            const eisRaw = staff.statutory.eis || '';
            epfAmt = calculateStatutoryAmount(epfRaw, earnedBasicForStatutory, true);
            eisAmt = calculateStatutoryAmount(eisRaw, earnedBasicForStatutory, true);
        }

        const grossTotal = baseGross + phExtraGross; 
        const totalDed = epfAmt + eisAmt + autoLateDeduct + absentDed + unpaidDed + unscheduledDed + totalAdvanceDed;
        const net = grossTotal - totalDed;

        const payload = {
            uid, month: monthStr,
            companyName: globalSettings.defaultCompany || 'RH RIDER HUB MOTOR (M) SDN. BHD.',
            staffName: staff.displayName,
            staffCode: staff.displayId,
            icNo: staff.personal?.icNo || '-',
            epfNo: staff.statutory?.epf?.no || '-',
            socsoNo: staff.statutory?.socso?.no || '-',
            department: staff.employment?.dept || '-',
            bankAcc: staff.payroll?.bank1?.acc || '-',
            bankName: staff.payroll?.bank1?.name || '-',
            basic: fullBasic,
            final_basic: parseFloat(baseGross.toFixed(2)), 
            earnings: { commission: 0, ot: 0, allowance: 0, phPay: parseFloat(phExtraGross.toFixed(2)), total: parseFloat(grossTotal.toFixed(2)) },
            deductions: { 
                absent: parseFloat(absentDed.toFixed(2)), unpaidLeave: parseFloat(unpaidDed.toFixed(2)), unscheduled: parseFloat(unscheduledDed.toFixed(2)), 
                epf: parseFloat(epfAmt.toFixed(2)), socso: 0, eis: parseFloat(eisAmt.toFixed(2)), tax: 0, late: parseFloat(autoLateDeduct.toFixed(2)), 
                advance: parseFloat(totalAdvanceDed.toFixed(2)), total: parseFloat(totalDed.toFixed(2)) 
            },
            employer_epf: 0, employer_socso: 0, employer_eis: 0,
            attendanceStats: {
                stdDays: majorityDays, actDays: actWorkedDays, annualLeave: annualLeaveCount, medicalLeave: medicalLeaveCount, unpaidLeave: unpaidLeaveCount,
                absentDays: absentDays, unscheduledDays: unscheduledDays, phUnworked: phUnworkedDays, phWorked: phWorkedDays,
                phUnworkedHrs: parseFloat(phUnworkedHrsDec), totalHrs: totalDecimalHrs, lateMins: totalLateMins, lateCount: lateCount, 
                mode: globalSettings.calcMode, majorityHours: majorityHours
            },
            gross: parseFloat(grossTotal.toFixed(2)), net: parseFloat(net.toFixed(2)), 
            status: 'Draft', updatedAt: serverTimestamp(),
            createdAt: existingPs ? existingPs.createdAt : serverTimestamp()
        };

        batch.set(doc(db, "payslips", payslipId), payload);
        generatedCount++;
      }

      if (generatedCount > 0) {
          await batch.commit();
          // 🚨 Audit Log
          await logAdminAction(db, currentUser, "BATCH_GENERATE_PAYSLIPS", "MULTIPLE", null, { count: generatedCount, month: monthStr });
      }

      alert(`Batch generation complete!\nGenerated ${generatedCount} Drafts.\nSkipped ${skippedCount} already Published payslips.`);
      onClose();
    } catch (e) {
      console.error(e);
      alert("Batch Generation Failed: " + e.message);
    } finally {
      setEngineLoading(false);
    }
  };

  // Safe manual saving logic
  const handleSavePayslip = async () => {
    if(!form.uid || !form.month) return alert("Select staff and month");

    setLoading(true);
    const staff = staffMap[form.uid];
    const payslipId = `${form.uid}_${form.month}`; 

    const grossTotal = parseFloat(form.basic) + parseFloat(form.meta.calcPHExtra) + parseFloat(form.comm) + parseFloat(form.ot) + parseFloat(form.allow);
    const totalDed = parseFloat(form.absentDed) + parseFloat(form.unpaidDed) + parseFloat(form.unschedDed) + parseFloat(form.epf) + parseFloat(form.socso) + parseFloat(form.eis) + parseFloat(form.pcb) + parseFloat(form.lateDed) + parseFloat(form.advance);
    const net = grossTotal - totalDed;

    const payload = {
        uid: form.uid, month: form.month,
        companyName: form.company,
        staffName: staff ? staff.displayName : 'Unknown',
        staffCode: staff ? staff.displayId : '',
        icNo: staff?.personal?.icNo || '-',
        epfNo: staff?.statutory?.epf?.no || '-',
        socsoNo: staff?.statutory?.socso?.no || '-',
        department: staff?.employment?.dept || '-',
        bankAcc: staff?.payroll?.bank1?.acc || '-',
        bankName: staff?.payroll?.bank1?.name || '-',
        basic: parseFloat(form.basic),
        final_basic: parseFloat(form.basic), 
        earnings: { commission: parseFloat(form.comm), ot: parseFloat(form.ot), allowance: parseFloat(form.allow), phPay: parseFloat(form.meta.calcPHExtra), total: grossTotal },
        deductions: { 
            absent: parseFloat(form.absentDed), unpaidLeave: parseFloat(form.unpaidDed), unscheduled: parseFloat(form.unschedDed), 
            epf: parseFloat(form.epf), socso: parseFloat(form.socso), eis: parseFloat(form.eis), tax: parseFloat(form.pcb), late: parseFloat(form.lateDed), 
            advance: parseFloat(form.advance), total: totalDed 
        },
        employer_epf: parseFloat(form.empEpf), employer_socso: parseFloat(form.empSocso), employer_eis: parseFloat(form.empEis),
        attendanceStats: form.meta,
        gross: grossTotal, net: net, status: form.status,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp() // Fallback
    };

    try {
        const psRef = doc(db, "payslips", payslipId);
        const oldSnap = await getDoc(psRef);
        const isExisting = oldSnap.exists();
        const oldData = isExisting ? oldSnap.data() : null;

        if (isExisting && oldData.status === 'Published' && form.status === 'Published' && editId !== payslipId) {
            if(!window.confirm(`⚠️ OVERWRITE WARNING\nA Published payslip already exists. Proceed?`)) {
                setLoading(false); return;
            }
        }

        let actionType = isExisting ? "OVERWRITE_PAYSLIP" : "CREATE_PAYSLIP";
        if (editId === payslipId) actionType = "EDIT_PAYSLIP";
        payload.createdAt = isExisting ? oldData.createdAt : serverTimestamp();

        // If month/uid was changed and we're editing an old ID, delete the old one
        if (editId && editId !== payslipId) {
            await deleteDoc(doc(db, "payslips", editId));
            actionType = "MIGRATE_AND_OVERWRITE_PAYSLIP";
        }

        await setDoc(psRef, payload);

        // Deduct Advances if Published
        if (form.status === 'Published' && form.advance > 0 && form.advanceIds.length > 0) {
            const batch = writeBatch(db);
            form.advanceIds.forEach(advId => {
                batch.update(doc(db, "salary_advances", advId), { isDeducted: true, deductedInMonth: form.month, deductedAt: serverTimestamp() });
            });
            await batch.commit();
        }

        // 🚨 Audit Log
        await logAdminAction(db, currentUser, actionType, form.uid, oldData, payload);

        alert('Payslip saved successfully.');
        onClose();
    } catch(e) { 
        alert("Save error: " + e.message); 
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("⚠️ Are you sure you want to DELETE this payslip?\n\nIf it was already Published, any deducted salary advances will NOT be automatically reverted.")) return;
    setLoading(true);
    try {
        const psRef = doc(db, "payslips", editId);
        const snap = await getDoc(psRef);
        const oldData = snap.exists() ? snap.data() : null;

        await deleteDoc(psRef);
        
        // 🚨 Audit Log
        await logAdminAction(db, currentUser, "DELETE_PAYSLIP", editId, oldData, null);

        alert('Payslip deleted.');
        onClose();
    } catch (e) {
        alert("Failed to delete: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (autoBatch) {
    return (
      <div className="modal-backdrop fade show">
        <div className="modal d-block" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-warning">
                <h5 className="modal-title fw-bold text-dark"><Zap size={20} className="me-2 d-inline"/> Auto Generate Engine</h5>
              </div>
              <div className="modal-body p-5 text-center">
                {engineLoading ? (
                  <>
                    <div className="spinner-border text-warning mb-3" style={{width: '3rem', height: '3rem'}}></div>
                    <h5 className="fw-bold">Crunching Numbers...</h5>
                    <p className="text-muted small">Checking attendance, leaves, and statutory tables.</p>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate realtime Net inside the form
  const grossTotal = parseFloat(form.basic || 0) + parseFloat(form.meta.calcPHExtra || 0) + parseFloat(form.comm || 0) + parseFloat(form.ot || 0) + parseFloat(form.allow || 0);
  const totalDed = parseFloat(form.absentDed || 0) + parseFloat(form.unpaidDed || 0) + parseFloat(form.unschedDed || 0) + parseFloat(form.epf || 0) + parseFloat(form.socso || 0) + parseFloat(form.eis || 0) + parseFloat(form.pcb || 0) + parseFloat(form.lateDed || 0) + parseFloat(form.advance || 0);
  const net = grossTotal - totalDed;

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-xl">
          <div className="modal-content">
            <div className="modal-header bg-light d-flex justify-content-between align-items-center">
              <h5 className="modal-title fw-bold m-0">{editId ? "Edit Payslip" : "Create Payslip"}</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-4 bg-light">
              
              <div className="row g-3 mb-4 bg-white p-3 rounded border shadow-sm">
                  <div className="col-md-4">
                      <label className="form-label fw-bold">Select Staff</label>
                      <select className="form-select border-primary" value={form.uid} onChange={e => setForm({...form, uid: e.target.value})} disabled={editId}>
                          <option value="">-- Choose Staff --</option>
                          {Object.values(staffMap).map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                      </select>
                  </div>
                  <div className="col-md-4">
                      <label className="form-label fw-bold">For Month</label>
                      <input className="form-control border-primary" type="month" value={form.month} onChange={e => setForm({...form, month: e.target.value})} disabled={editId}/>
                  </div>
                  <div className="col-md-4">
                      <label className="form-label fw-bold text-dark">Company Name</label>
                      <select className="form-select border-dark fw-bold text-dark bg-light" value={form.company} onChange={e => setForm({...form, company: e.target.value})}>
                          <option value="RH RIDER HUB MOTOR (M) SDN. BHD.">RH RIDER HUB MOTOR (M) SDN. BHD.</option>
                          <option value="H DIGITAL CARRIER MARKETING SDN BHD">H DIGITAL CARRIER MARKETING SDN BHD</option>
                          <option value="RH RIDER HUB MOTOR (BORNEO) SDN. BHD.">RH RIDER HUB MOTOR (BORNEO) SDN. BHD.</option>
                      </select>
                  </div>
              </div>

              {/* Attendance Box */}
              <div className="fw-bold text-primary mb-2"><Clock size={16} className="me-1 d-inline"/> Detailed Attendance Analytics</div>
              <div className="d-flex flex-wrap gap-2 mb-4 bg-white p-3 rounded border shadow-sm">
                  <div className="p-2 border rounded bg-primary bg-opacity-10 text-primary fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Scheduled</div><div>{form.meta.schDays} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-success bg-opacity-10 text-success fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Actual</div><div>{form.meta.actDays} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-info bg-opacity-10 text-info fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Paid Leave</div><div>{form.meta.al + form.meta.ml} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-warning bg-opacity-10 text-dark fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>PH (Paid)</div><div>{form.meta.phOff} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-light text-dark fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Total Payable</div><div>{form.meta.actDays + form.meta.al + form.meta.ml + form.meta.phOff} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-danger bg-opacity-10 text-danger fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Absent</div><div>{form.meta.absentDays} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-danger bg-opacity-10 text-danger fw-bold text-center flex-fill" style={{opacity: 0.8}}>
                    <div style={{fontSize:'10px'}}>Unpaid Leave</div><div>{form.meta.unpaid} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-secondary bg-opacity-10 text-secondary fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Unscheduled</div><div>{form.meta.unschedDays} <small>Days</small></div>
                  </div>
                  <div className="p-2 border rounded bg-danger bg-opacity-10 text-danger fw-bold text-center flex-fill">
                    <div style={{fontSize:'10px'}}>Late</div><div>{form.meta.lateCount} <small>times</small></div>
                  </div>
              </div>

              {/* Earnings */}
              <div className="fw-bold mb-2">Earnings Calculation</div>
              <div className="row g-3 mb-3 bg-white p-3 rounded border shadow-sm">
                  <div className="col-md-2">
                      <label className="form-label text-muted small fw-bold">Comp. Std Days</label>
                      <input type="number" className="form-control" value={form.stdDays} onChange={e => setForm({...form, stdDays: e.target.value})} />
                  </div>
                  <div className="col-md-5">
                      <label className="form-label text-muted small">Full Basic Salary (Contract)</label>
                      <div className="input-group"><span className="input-group-text">RM</span><input type="number" className="form-control bg-light fw-bold" value={form.basic} onChange={e => setForm({...form, basic: e.target.value})} /></div>
                  </div>
                  <div className="col-md-5">
                      <label className="form-label text-muted small">Commission</label>
                      <div className="input-group"><span className="input-group-text">RM</span><input type="number" className="form-control" value={form.comm} onChange={e => setForm({...form, comm: e.target.value})} /></div>
                  </div>
                  <div className="col-md-6">
                      <label className="form-label text-primary small fw-bold">Overtime</label>
                      <div className="input-group"><span className="input-group-text border-primary text-primary">RM</span><input type="number" className="form-control border-primary" value={form.ot} onChange={e => setForm({...form, ot: e.target.value})} /></div>
                  </div>
                  <div className="col-md-6">
                      <label className="form-label text-muted small">Allowance</label>
                      <div className="input-group"><span className="input-group-text">RM</span><input type="number" className="form-control" value={form.allow} onChange={e => setForm({...form, allow: e.target.value})} /></div>
                  </div>
              </div>

              {/* Deductions */}
              <div className="fw-bold mb-2 text-danger">Attendance Deductions</div>
              <div className="row g-3 mb-3 bg-danger bg-opacity-10 p-3 rounded border border-danger border-opacity-25">
                  <div className="col-md-3">
                      <label className="form-label text-danger small fw-bold">Absent</label>
                      <div className="input-group input-group-sm"><span className="input-group-text text-danger border-danger">RM</span><input type="number" className="form-control border-danger text-danger fw-bold" value={form.absentDed} onChange={e => setForm({...form, absentDed: e.target.value})} /></div>
                  </div>
                  <div className="col-md-3">
                      <label className="form-label text-danger small fw-bold">Unpaid Leave</label>
                      <div className="input-group input-group-sm"><span class="input-group-text text-danger border-danger">RM</span><input type="number" className="form-control border-danger text-danger fw-bold" value={form.unpaidDed} onChange={e => setForm({...form, unpaidDed: e.target.value})} /></div>
                  </div>
                  <div className="col-md-3">
                      <label className="form-label text-danger small fw-bold">Pro-rated (Unscheduled)</label>
                      <div className="input-group input-group-sm"><span class="input-group-text text-danger border-danger">RM</span><input type="number" className="form-control border-danger text-danger fw-bold" value={form.unschedDed} onChange={e => setForm({...form, unschedDed: e.target.value})} /></div>
                  </div>
                  <div className="col-md-3">
                      <label className="form-label text-danger small fw-bold">Late Penalty</label>
                      <div className="input-group input-group-sm"><span class="input-group-text text-danger border-danger">RM</span><input type="number" className="form-control border-danger text-danger fw-bold" value={form.lateDed} onChange={e => setForm({...form, lateDed: e.target.value})} /></div>
                  </div>
              </div>

              <div className="fw-bold mb-2 text-dark">Statutory & Other Deductions</div>
              <div className="row g-3 mb-4 bg-white p-3 rounded border shadow-sm">
                  <div className="col-md-2">
                      <label className="form-label text-muted small">EPF</label>
                      <div className="input-group input-group-sm"><span class="input-group-text">RM</span><input type="number" className="form-control" value={form.epf} onChange={e => setForm({...form, epf: e.target.value})} /></div>
                  </div>
                  <div className="col-md-2">
                      <label className="form-label text-muted small">SOCSO</label>
                      <div className="input-group input-group-sm"><span class="input-group-text">RM</span><input type="number" className="form-control" value={form.socso} onChange={e => setForm({...form, socso: e.target.value})} /></div>
                  </div>
                  <div className="col-md-2">
                      <label className="form-label text-muted small">EIS</label>
                      <div className="input-group input-group-sm"><span class="input-group-text">RM</span><input type="number" className="form-control" value={form.eis} onChange={e => setForm({...form, eis: e.target.value})} /></div>
                  </div>
                  <div className="col-md-3">
                      <label className="form-label text-muted small">PCB / Tax</label>
                      <div className="input-group input-group-sm"><span class="input-group-text">RM</span><input type="number" className="form-control" value={form.pcb} onChange={e => setForm({...form, pcb: e.target.value})} /></div>
                  </div>
                  <div className="col-md-3">
                      <label className="form-label text-danger small fw-bold">Advance (Transferred)</label>
                      <div className="input-group input-group-sm"><span class="input-group-text text-danger border-danger">RM</span><input type="number" className="form-control border-danger text-danger fw-bold" value={form.advance} onChange={e => setForm({...form, advance: e.target.value})} /></div>
                  </div>
              </div>

              {/* Status and Final Net */}
              <div className="d-flex justify-content-between align-items-center border-top pt-3">
                  <div>
                      <select className="form-select form-select-lg fw-bold border-2" value={form.status} onChange={e => setForm({...form, status: e.target.value})} style={{ width: '150px' }}>
                          <option value="Draft" className="text-warning">Draft</option>
                          <option value="Published" className="text-success">Published</option>
                      </select>
                  </div>
                  <div className="text-end bg-primary bg-opacity-10 py-2 px-4 rounded-3 border border-primary">
                      <div className="text-primary small fw-bold mb-1 text-uppercase">Final Net Pay</div>
                      <h2 className="fw-bold text-primary mb-0">RM {formatMoney(net)}</h2>
                  </div>
              </div>
            </div>
            
            <div className="modal-footer bg-light d-flex justify-content-between">
                {editId ? <button className="btn btn-outline-danger fw-bold" onClick={handleDelete} disabled={loading}>Delete</button> : <div></div>}
                <div>
                    <button className="btn btn-outline-secondary fw-bold me-2" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn btn-primary px-5 fw-bold" onClick={handleSavePayslip} disabled={loading}>{loading ? 'Saving...' : 'Save Payslip'}</button>
                </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// src/pages/Payroll/components/PayrollModals.jsx (部分代码)

// ============================================================================
// 4. Print / PDF Modal
// ============================================================================
const PrintModal = ({ isOpen, onClose, payslipId, currentPayrollData, globalSettings }) => {
  if (!isOpen || !payslipId) return null;

  const d = currentPayrollData.find(x => x.id === payslipId);
  if (!d) return null;

  const stats = d.attendanceStats || {};
  const al = parseFloat(stats.annualLeave) || 0;
  const ml = parseFloat(stats.medicalLeave) || 0;
  const ul = parseFloat(stats.unpaidLeave) || 0;
  const abs = parseFloat(stats.absentDays) || 0;
  const unsched = parseFloat(stats.unscheduledDays) || 0;
  const phUnworked = parseFloat(stats.phUnworked) || 0;
  const phWorked = parseFloat(stats.phWorked) || 0;
  const actDays = parseFloat(stats.actDays) || 0;
  const stdDays = parseFloat(stats.stdDays) || 26;
  const lateMins = parseFloat(stats.lateMins) || 0;
  const lateCount = parseInt(stats.lateCount) || 0;

  const earningsList = [];
  const deductionsList = [];

  earningsList.push({ name: 'BASIC PAY', amount: parseFloat(d.basic) || 0 });
  if (d.earnings.phPay > 0) earningsList.push({ name: 'PUBLIC HOLIDAY PAY (EXTRA 2x)', amount: d.earnings.phPay });
  if (d.earnings.commission > 0) earningsList.push({ name: 'COMMISSION', amount: d.earnings.commission });
  if (d.earnings.ot > 0) earningsList.push({ name: 'OVERTIME', amount: d.earnings.ot });
  if (d.earnings.allowance > 0) earningsList.push({ name: 'ALLOWANCE', amount: d.earnings.allowance });

  if (d.deductions.absent > 0) deductionsList.push({ name: `ABSENT (${abs} Days)`, amount: d.deductions.absent });
  if (d.deductions.unpaidLeave > 0) deductionsList.push({ name: `UNPAID LEAVE (${ul} Days)`, amount: d.deductions.unpaidLeave });
  if (d.deductions.unscheduled > 0) deductionsList.push({ name: `PRO-RATED / UNSCHEDULED (${unsched} Days)`, amount: d.deductions.unscheduled });

  if (d.deductions.late > 0) {
      let lateStr = "LATE DEDUCTION";
      if (lateMins > 0 && stats.mode !== 'hourly') lateStr += ` (${lateMins} mins)`;
      else if (lateCount > 0) lateStr += ` (${lateCount} times)`;
      deductionsList.push({ name: lateStr, amount: d.deductions.late });
  }

  if (d.deductions.epf > 0) deductionsList.push({ name: 'EPF (Employee)', amount: d.deductions.epf });
  if (d.deductions.socso > 0) deductionsList.push({ name: 'SOCSO (Employee)', amount: d.deductions.socso });
  if (d.deductions.eis > 0) deductionsList.push({ name: 'EIS (Employee)', amount: d.deductions.eis });
  if (d.deductions.tax > 0) deductionsList.push({ name: 'PCB / TAX', amount: d.deductions.tax });
  if (d.deductions.advance > 0) deductionsList.push({ name: 'SALARY ADVANCE', amount: d.deductions.advance });

  const maxRows = Math.max(earningsList.length, deductionsList.length);
  const rows = [];
  let visualGross = 0; let visualDed = 0;

  for(let i = 0; i < maxRows; i++) {
    const earn = earningsList[i] || { name: '', amount: null };
    const ded = deductionsList[i] || { name: '', amount: null };
    if (earn.amount !== null) visualGross += earn.amount;
    if (ded.amount !== null) visualDed += ded.amount;
    rows.push({ earn, ded });
  }

  const payableDays = actDays + al + ml + phUnworked;
  
  // 🌟 动态匹配公司名并分配 Letterhead 图片
  const compName = d.companyName || globalSettings.defaultCompany || "RH RIDER HUB MOTOR (M) SDN. BHD.";
  let letterheadSrc = "";
  
  // 确保这里的路径与 public 文件夹中的实际文件名一致
  if (compName.includes("BORNEO")) {
      letterheadSrc = "/assets/images/Header_RH_RIDER_HUB_MOTOR(BORNEO).jpeg"; 
  } else if (compName.includes("DIGITAL CARRIER")) {
      letterheadSrc = "/assets/images/Header_H_DIGITAL_CARRIER_MARKETING.jpeg"; 
  } else {
      letterheadSrc = "/assets/images/Header_RH_RIDER_HUB_MOTOR(M).jpeg"; 
  }

  const handlePrint = () => {
    document.title = `${d.month} Payslip-${d.staffCode || 'NoID'} ${d.staffName}`;
    window.print();
    setTimeout(() => { document.title = 'FieldTrack Pro'; }, 1000);
  };

  return (
    <>
      <div className="modal-backdrop fade show no-print"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-lg" style={{ maxWidth: '900px' }}>
          <div className="modal-content border-0">
            <div className="modal-header no-print bg-light">
                <h5 className="modal-title fw-bold"><ExternalLink size={20} className="me-2 d-inline"/>Payslip Preview</h5>
                <div>
                    <button className="btn btn-dark btn-sm me-2 fw-bold" onClick={handlePrint}>
                        <Printer size={16} className="me-1 d-inline"/> Print / Export
                    </button>
                    <button className="btn-close" onClick={onClose}></button>
                </div>
            </div>
            
            <div className="modal-body bg-secondary bg-opacity-10 overflow-auto py-4" id="printAreaContainer">
              <div id="printArea" className="bg-white shadow-sm border rounded p-4 mx-auto" style={{ maxWidth: '21cm' }}>
                
                {/* 🌟 渲染 Letterhead 图片 */}
                <div className="border-bottom border-dark pb-3 mb-3 text-center">
                    <img 
                      src={letterheadSrc} 
                      alt="Letterhead" 
                      style={{ width: '100%', maxHeight: '140px', objectFit: 'contain' }} 
                      onError={(e) => {
                          e.target.onerror = null; 
                          // 如果图片没找到，显示纯文本的公司名作为 Fallback
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = `<h4 class="fw-bold m-0">${compName}</h4>`;
                      }}
                    />
                </div>

                <div className="bg-light p-3 rounded mb-3 border" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                    <div>
                        <div className="d-flex justify-content-between mb-1"><span className="text-muted">Employee Name</span> <span className="fw-bold">: {d.staffName}</span></div>
                        <div className="d-flex justify-content-between mb-1"><span className="text-muted">Department</span> <span>: {d.department}</span></div>
                        <div className="d-flex justify-content-between mb-1"><span className="text-muted">Employee Code</span> <span>: {d.staffCode}</span></div>
                        <div className="d-flex justify-content-between mt-2 pt-2 border-top"><span className="text-muted">Bank Acc</span> <span className="fw-bold">: {d.bankAcc || '-'} ({d.bankName || '-'})</span></div>
                    </div>
                    <div>
                        <div className="d-flex justify-content-between mb-1"><span className="text-muted">IC Number</span> <span>: {d.icNo}</span></div>
                        <div className="d-flex justify-content-between mb-1"><span className="text-muted">EPF Number</span> <span>: {d.epfNo}</span></div>
                        <div className="d-flex justify-content-between mb-1"><span className="text-muted">SOCSO Number</span> <span>: {d.socsoNo}</span></div>
                        <div className="d-flex justify-content-between mt-2 pt-2 border-top text-primary fw-bold"><span>Pay Period</span> <span>: {d.month}</span></div>
                    </div>
                </div>

                <table className="w-100 mb-4" style={{ fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead className="bg-light border-bottom border-dark">
                        <tr>
                          <th className="py-2 text-start" style={{width:'35%'}}>EARNINGS</th><th className="py-2 text-end">AMOUNT</th>
                          <th className="py-2 text-start" style={{width:'35%', paddingLeft: '20px'}}>DEDUCTIONS</th><th className="py-2 text-end">AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-bottom border-light">
                            <td className={`py-2 ${r.earn.name.includes('PUBLIC HOLIDAY') ? 'text-warning fw-bold' : ''}`}>{r.earn.name}</td>
                            <td className={`py-2 text-end ${r.earn.name.includes('PUBLIC HOLIDAY') ? 'text-warning fw-bold' : ''}`}>{r.earn.amount !== null ? formatMoney(r.earn.amount) : ''}</td>
                            <td className="py-2" style={{ paddingLeft: '20px', color: (r.ded.name.includes('LATE') || r.ded.name.includes('ADVANCE') || r.ded.name.includes('ABSENT') || r.ded.name.includes('UNPAID') || r.ded.name.includes('PRO-RATED')) ? 'red' : 'inherit' }}>{r.ded.name}</td>
                            <td className="py-2 text-end" style={{ color: (r.ded.name.includes('LATE') || r.ded.name.includes('ADVANCE') || r.ded.name.includes('ABSENT') || r.ded.name.includes('UNPAID') || r.ded.name.includes('PRO-RATED')) ? 'red' : 'inherit' }}>{r.ded.amount !== null ? formatMoney(r.ded.amount) : ''}</td>
                          </tr>
                        ))}
                        <tr className="border-top border-dark border-2">
                            <td className="fw-bold py-2 pt-3">Total Earnings</td><td className="text-end fw-bold text-primary py-2 pt-3">{formatMoney(visualGross)}</td>
                            <td className="fw-bold py-2 pt-3" style={{ paddingLeft: '20px' }}>Total Deductions</td><td className="text-end fw-bold text-danger py-2 pt-3">{formatMoney(visualDed)}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="d-flex justify-content-between align-items-center bg-light p-3 rounded border">
                    <div className="small text-muted">
                        <div>Employer EPF: <b>RM {formatMoney(d.employer_epf)}</b></div>
                        <div>Employer SOCSO: <b>RM {formatMoney(d.employer_socso)}</b></div>
                    </div>
                    <div className="text-end">
                        <div className="text-muted text-uppercase fw-bold" style={{fontSize:'0.7rem', letterSpacing:'1px'}}>Net Pay / Actual Salary</div>
                        <div className="text-dark" style={{fontSize:'1.6rem', fontWeight:900}}>RM {formatMoney(d.net)}</div>
                    </div>
                </div>
                
                <div className="mt-4 p-3 border rounded text-muted" style={{ fontSize: '0.75rem', borderStyle: 'dashed !important' }}>
                    <b>Attendance Stats:</b> Payable Days: {payableDays} / {stats.stdDays || 26} (Worked: {actDays}, AL: {al}, ML: {ml}, PH Off: {phUnworked}, PH Worked: {phWorked})
                    <br/><b>Deduction Stats:</b> Absent: {abs} Days | Unpaid: {ul} Days | Unscheduled: {unsched} Days | Late: {stats.lateCount || 0} times ({stats.lateMins || 0} minutes)
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default { Settings: SettingsModal, Advances: AdvancesModal, PayslipForm, Print: PrintModal };