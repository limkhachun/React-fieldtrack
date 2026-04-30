// src/pages/Payroll/Payroll.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { formatMoney, showStatusAlert, logAdminAction } from '../../utils/utils';

// Icons
import { HandCoins, Settings, Zap, PlusCircle, Send, Edit2, Printer } from 'lucide-react';

// Modals Component
import PayrollModals from './components/PayrollModals';

export default function Payroll() {
  const { currentUser, userData } = useAuth();
  
  // 1. Data States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [payrollData, setPayrollData] = useState([]);
  const [globalSettings, setGlobalSettings] = useState({ 
    calcMode: 'daily', satMultiplier: 1.0, lateMode: 'minutes', lateFixedAmount: 10, defaultCompany: 'RH RIDER HUB MOTOR (M) SDN. BHD.' 
  });
  const [staffMap, setStaffMap] = useState({});
  const [holidaysMap, setHolidaysMap] = useState({});
  
  // Selection States
  const [monthStr, setMonthStr] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [pendingAdvancesCount, setPendingAdvancesCount] = useState(0);

  // Modal Controllers
  const [modals, setModals] = useState({
    settings: { isOpen: false },
    advances: { isOpen: false },
    payslipForm: { isOpen: false, editId: null, data: null },
    print: { isOpen: false, payslipId: null }
  });

  // ==========================================
  // 1. Initial Data Fetching
  // ==========================================
  useEffect(() => {
    const fetchBaseData = async () => {
      try {
        // Fetch Config
        const snap = await getDoc(doc(db, "settings", "payroll_config"));
        if (snap.exists()) setGlobalSettings(prev => ({ ...prev, ...snap.data() }));

        // Fetch Holidays
        const holSnap = await getDoc(doc(db, "settings", "holidays"));
        const hMap = {};
        if (holSnap.exists() && holSnap.data().holiday_list) {
          holSnap.data().holiday_list.forEach(h => { hMap[h.date] = h.name; });
        }
        setHolidaysMap(hMap);

        // Fetch Staff
        const staffSnap = await getDocs(query(collection(db, "users")));
        const sMap = {};
        staffSnap.forEach(docSnap => {
          const s = docSnap.data();
          if (s.status === 'disabled' || s.role === 'manager') return;
          sMap[docSnap.id] = { 
            id: docSnap.id, authUid: s.authUid, ...s, 
            displayName: s.personal?.name || s.name || 'Unknown Staff',
            displayId: s.personal?.empCode || s.staffId || '--'
          };
        });
        setStaffMap(sMap);

        // Fetch pending advances count for badge
        const advSnap = await getDocs(query(collection(db, "salary_advances"), where("status", "==", "Pending")));
        setPendingAdvancesCount(advSnap.size);

      } catch (e) {
        console.error("Base data fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    if (userData?.role === 'admin' || userData?.role === 'manager') {
       fetchBaseData();
    }
  }, [userData]);

  // Fetch Payroll Data on Month Change
  useEffect(() => {
    if (!monthStr || Object.keys(staffMap).length === 0) return;
    loadPayrollList();
  }, [monthStr, staffMap]);

  const loadPayrollList = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "payslips"), where("month", "==", monthStr));
      const snap = await getDocs(q);
      const data = [];
      snap.forEach(d => { data.push({ id: d.id, ...d.data() }); });
      setPayrollData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // 2. Computed Stats
  // ==========================================
  const totalNet = payrollData.reduce((acc, curr) => acc + (curr.net || 0), 0);
  const totalEmpEPF = payrollData.reduce((acc, curr) => acc + (curr.employer_epf || 0), 0);

  // ==========================================
  // 3. Actions & Triggers
  // ==========================================
  const handlePublishAll = async () => {
    const drafts = payrollData.filter(d => d.status === 'Draft');
    if (drafts.length === 0) return alert("No draft payslips found to publish.");
    
    if (!window.confirm(`Are you sure you want to officially publish ${drafts.length} payslip(s)?\n\nThis will make them visible to staff and PERMANENTLY deduct their approved Salary Advances.`)) return;

    setActionLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const advanceRefsToUpdate = [];
        
        for (const d of drafts) {
          if (d.deductions?.advance > 0) {
            const targetIds = [d.uid];
            if (staffMap[d.uid]?.authUid) targetIds.push(staffMap[d.uid].authUid);
            
            const advSnap = await getDocs(query(collection(db, "salary_advances"), where("uid", "in", targetIds), where("status", "==", "Approved")));
            advSnap.forEach(advDoc => {
              if (!advDoc.data().isDeducted) {
                advanceRefsToUpdate.push(advDoc.ref);
              }
            });
          }
        }

        drafts.forEach(d => {
          const psRef = doc(db, "payslips", d.id);
          transaction.update(psRef, { status: 'Published', publishedAt: serverTimestamp() });
        });

        advanceRefsToUpdate.forEach(ref => {
          transaction.update(ref, { isDeducted: true, deductedInMonth: monthStr, deductedAt: serverTimestamp() });
        });
      });

      // 🚨 Audit Log
      await logAdminAction(db, currentUser, "BULK_PUBLISH_PAYSLIPS", "MULTIPLE", null, { count: drafts.length, month: monthStr });

      alert(`Successfully published ${drafts.length} payslips!`);
      loadPayrollList();
    } catch (e) {
      alert("Publish Failed: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openModal = (key, payload = {}) => {
    setModals(prev => ({ ...prev, [key]: { isOpen: true, ...payload } }));
  };

  const closeModal = (key) => {
    setModals(prev => ({ ...prev, [key]: { isOpen: false } }));
  };

  if (loading && Object.keys(staffMap).length === 0) {
    return <div className="text-center py-5 mt-5"><div className="spinner-border text-primary"></div></div>;
  }

  return (
    <div className="container-fluid px-4 py-4 w-100 animate__animated animate__fadeIn">
      
      {/* Header Area */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h3 className="fw-bold text-dark mb-0">Payroll Center</h3>
          <p className="text-muted small">Auto-calculation with strict Attendance & Advance checks</p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-outline-danger position-relative d-flex align-items-center gap-2" onClick={() => openModal('advances')}>
            <HandCoins size={16} /> Advances
            {pendingAdvancesCount > 0 && <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">{pendingAdvancesCount}</span>}
          </button>
          
          <button className="btn btn-outline-dark d-flex align-items-center gap-2" onClick={() => openModal('settings')}>
            <Settings size={16} /> Settings
          </button>

          <input 
            className="form-control fw-bold text-primary border-primary" 
            style={{ width: '150px', cursor: 'pointer', backgroundColor: 'var(--bs-primary-bg-subtle)' }} 
            type="month" 
            value={monthStr}
            onChange={e => setMonthStr(e.target.value)} 
          />
          
          <button className="btn btn-warning fw-bold d-flex align-items-center gap-2 shadow-sm text-dark" onClick={() => openModal('payslipForm', { autoBatch: true })}>
            <Zap size={16} /> Auto Generate All
          </button>

          <button className="btn btn-primary d-flex align-items-center gap-2 shadow-sm" onClick={() => openModal('payslipForm', { autoBatch: false, editId: null })}>
            <PlusCircle size={16} /> Custom Single
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card p-3 border-0 shadow-sm rounded-4">
            <small className="text-muted text-uppercase fw-bold">Total Payout (Net)</small>
            <h3 className="fw-bold text-primary mt-1">RM {formatMoney(totalNet)}</h3>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3 border-0 shadow-sm rounded-4">
            <small className="text-muted text-uppercase fw-bold">Total Employer EPF</small>
            <h3 className="fw-bold text-dark mt-1">RM {formatMoney(totalEmpEPF)}</h3>
          </div>
        </div>
        <div className="col-md-4">
          <div 
            className={`card p-3 border-0 shadow-sm rounded-4 d-flex align-items-center justify-content-center text-white cursor-pointer hover-scale ${actionLoading ? 'bg-secondary' : 'bg-success'}`}
            onClick={!actionLoading ? handlePublishAll : null}
          >
            <div className="text-center">
              {actionLoading ? <div className="spinner-border spinner-border-sm mb-1"></div> : <Send size={24} className="mb-1" />}
              <div className="fw-bold">Publish All Drafts</div>
            </div>
          </div>
        </div>
      </div>

      {/* Payroll List */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="card-header bg-white py-3 border-bottom-0">
          <div className="row fw-bold text-muted small text-uppercase">
            <div className="col-3">Employee</div>
            <div className="col-2">Basic (Pro-rated)</div>
            <div className="col-2">Deductions</div>
            <div className="col-2">Net Pay</div>
            <div className="col-1">Status</div>
            <div className="col-2 text-end">Action</div>
          </div>
        </div>
        <div className="card-body p-0">
          {loading ? (
             <div className="text-center py-4"><span className="spinner-border text-primary"></span></div>
          ) : payrollData.length === 0 ? (
             <div className="text-center py-5 text-muted fw-bold">No payslips found for {monthStr}.</div>
          ) : (
            payrollData.map(d => {
              const displayName = staffMap[d.uid] ? staffMap[d.uid].displayName : d.staffName;
              const modeText = d.attendanceStats?.mode === 'hourly' ? '⌚ Hourly' : '📅 Daily';
              
              return (
                <div key={d.id} className="row align-items-center py-3 border-bottom px-3 bg-white hover-bg-light">
                  <div className="col-3">
                    <div className="fw-bold text-primary cursor-pointer" onClick={() => openModal('payslipForm', { autoBatch: false, editId: d.id })}>{displayName}</div>
                    <small className="text-muted">{modeText}</small>
                  </div>
                  <div className="col-2 text-primary fw-bold">RM {formatMoney(d.final_basic || d.basic)}</div>
                  <div className="col-2 text-danger">RM {formatMoney(d.deductions?.total || 0)}</div>
                  <div className="col-2 fw-bold fs-5">RM {formatMoney(d.net)}</div>
                  <div className="col-1">
                    <span className={`badge ${d.status === 'Published' ? 'bg-success' : 'bg-warning text-dark'} px-2 py-1`}>{d.status}</span>
                  </div>
                  <div className="col-2 text-end">
                    <button className="btn btn-sm btn-light border me-1" onClick={() => openModal('payslipForm', { autoBatch: false, editId: d.id })} title="Edit">
                      <Edit2 size={16} />
                    </button>
                    <button className="btn btn-sm btn-outline-dark" onClick={() => openModal('print', { payslipId: d.id })} title="Print/View">
                      <Printer size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🌟 Modals Mount Zone */}
      {/* ========================================================================= */}
      
      {/* Settings Modal is passed global state so it can update it */}
      <PayrollModals.Settings 
        isOpen={modals.settings.isOpen} 
        onClose={() => closeModal('settings')} 
        globalSettings={globalSettings}
        setGlobalSettings={setGlobalSettings}
      />

      <PayrollModals.Advances 
        isOpen={modals.advances.isOpen} 
        onClose={() => closeModal('advances')} 
      />

      <PayrollModals.PayslipForm 
        isOpen={modals.payslipForm.isOpen}
        onClose={() => { closeModal('payslipForm'); loadPayrollList(); }} // Refresh on close
        editId={modals.payslipForm.editId}
        autoBatch={modals.payslipForm.autoBatch}
        globalSettings={globalSettings}
        staffMap={staffMap}
        holidaysMap={holidaysMap}
        monthStr={monthStr}
        currentPayrollData={payrollData}
      />

      <PayrollModals.Print 
        isOpen={modals.print.isOpen}
        onClose={() => closeModal('print')}
        payslipId={modals.print.payslipId}
        currentPayrollData={payrollData}
        globalSettings={globalSettings}
      />

    </div>
  );
}