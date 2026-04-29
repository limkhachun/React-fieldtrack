// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, orderBy, limit, startAfter } from 'firebase/firestore';
import { ref as rtdbRef, onValue } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, rtdb, storage } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

// 导入图标
import { 
  User, DollarSign, Megaphone, CalendarDays, Images, ClipboardCheck, 
  Truck, ShieldCheck, Settings, Clock, AlertCircle, CalendarCheck, 
  Fingerprint, UserCog, MapPin, Send, Trash2, Filter, RotateCcw, ChevronDown
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function Dashboard() {
  const { userData, currentUser } = useAuth();
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // --- 基础 Dashboard 状态 ---
  const [currentDate, setCurrentDate] = useState('');
  const [attStats, setAttStats] = useState({ present: 0, late: 0, absent: 0, percent: '0%' });
  const [tasks, setTasks] = useState({ leaves: 0, fixes: 0, edits: 0 });
  const [fleetStats, setFleetStats] = useState({ online: 0, offline: 0 });

  // --- UI Action Loading State ---
  const [actionLoading, setActionLoading] = useState(false);

  // ----------------------------------------------------
  // Modals States
  // ----------------------------------------------------
  
  // 1. Announcement Modal
  const [announceModalOpen, setAnnounceModalOpen] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceFile, setAnnounceFile] = useState(null);
  const [announcements, setAnnouncements] = useState([]);

  // 2. Driver Setup Modal
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [driverStaffList, setDriverStaffList] = useState([]);
  const [driverSearch, setDriverSearch] = useState('');

  // 3. Office Setup Modal
  const [officeModalOpen, setOfficeModalOpen] = useState(false);
  const [officeSettings, setOfficeSettings] = useState({ latitude: '', longitude: '', radius: 500, allowedWifis: [] });
  const [newWifi, setNewWifi] = useState({ ssid: '', bssid: '' });

  // 4. Audit Logs Modal
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilter, setAuditFilter] = useState({ date: '', email: '' });
  const [lastLogDoc, setLastLogDoc] = useState(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [globalStaffMap, setGlobalStaffMap] = useState({});

  // 5. Inspect Log Modal (子模态框)
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectData, setInspectData] = useState({ old: null, new: null });

  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // ----------------------------------------------------
  // Lifecycle & Fetching
  // ----------------------------------------------------
  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

    // Listeners for Tasks
    const unsubLeaves = onSnapshot(query(collection(db, "leave_applications"), where("status", "==", "pending")), snap => {
      setTasks(prev => ({ ...prev, leaves: snap.size }));
    });
    const unsubFixes = onSnapshot(query(collection(db, "attendance_corrections"), where("status", "==", "Pending")), snap => {
      setTasks(prev => ({ ...prev, fixes: snap.size }));
    });
    const unsubEdits = onSnapshot(query(collection(db, "edit_requests"), where("status", "==", "pending")), snap => {
      setTasks(prev => ({ ...prev, edits: snap.size }));
    });

    // RTDB Fleet Tracker
    const todayStr = new Date().toLocaleDateString('en-CA');
    const liveRef = rtdbRef(rtdb, 'live_locations');
    const unsubRTDB = onValue(liveRef, (snapshot) => {
      let onlineCount = 0; let offlineCount = 0;
      const data = snapshot.val();
      if (data) {
        Object.values(data).forEach(val => {
          if (!val.lastUpdate) return;
          const lastUpdateDate = new Date(val.lastUpdate);
          if (lastUpdateDate.toLocaleDateString('en-CA') === todayStr) {
            const isOnline = val.isTracking !== false && (new Date() - lastUpdateDate) < 1000 * 60 * 15; 
            isOnline ? onlineCount++ : offlineCount++;
          }
        });
      }
      setFleetStats({ online: onlineCount, offline: offlineCount });
    });

    fetchAttendanceData();

    // Admin Preload for Audits
    if (userData?.role === 'manager') {
      preloadStaffMap();
    }

    return () => {
      unsubLeaves(); unsubFixes(); unsubEdits();
    };
  }, [userData]);

  const preloadStaffMap = async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      const map = {};
      snap.forEach(doc => {
        const data = doc.data();
        map[doc.id] = data.personal?.name || data.name || doc.id;
        if (data.authUid) map[data.authUid] = data.personal?.name || data.name || data.authUid;
      });
      setGlobalStaffMap(map);
    } catch (e) { console.error("Failed to preload staff map", e); }
  };

  const fetchAttendanceData = async () => {
    const todayStr = getTodayString();
    try {
      const [usersSnap, attSnap, schedSnap, leaveSnap, holSnap] = await Promise.all([
        getDocs(query(collection(db, "users"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", todayStr))),
        getDocs(query(collection(db, "schedules"), where("date", "==", todayStr))),
        getDocs(query(collection(db, "leaves"), where("status", "==", "Approved"), where("endDate", ">=", todayStr))),
        getDoc(doc(db, "settings", "holidays"))
      ]);

      const holidaysMap = {};
      if (holSnap.exists() && holSnap.data().holiday_list) {
        holSnap.data().holiday_list.forEach(h => { holidaysMap[h.date] = true; });
      }

      const staffDocIds = new Set();
      const authUidToDocId = {}; 
      const docIdToAuthMap = {}; 

      usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.status !== 'disabled') {
          staffDocIds.add(doc.id);
          if (data.authUid) { authUidToDocId[data.authUid] = doc.id; docIdToAuthMap[doc.id] = data.authUid; }
        }
      });

      const attendanceMap = {}; 
      attSnap.forEach(doc => {
        const d = doc.data();
        if (d.verificationStatus !== 'Rejected') {
          let docId = authUidToDocId[d.uid] || (staffDocIds.has(d.uid) ? d.uid : null);
          if (docId) { if (!attendanceMap[docId]) attendanceMap[docId] = []; attendanceMap[docId].push(d); }
        }
      });

      const scheduleMap = {}; 
      schedSnap.forEach(doc => {
        const d = doc.data();
        if (d.start && staffDocIds.has(d.userId)) {
          const st = d.start.toDate();
          if (!scheduleMap[d.userId] || st < scheduleMap[d.userId]) scheduleMap[d.userId] = st;
        }
      });

      const leaveMap = {};
      leaveSnap.forEach(doc => {
        const data = doc.data();
        if (!data.startDate || !data.endDate) return; 
        const eUid = data.authUid || docIdToAuthMap[data.uid] || data.uid;
        
        const [sY, sM, sD] = data.startDate.split('-');
        const [eY, eM, eD] = data.endDate.split('-');
        let curr = new Date(sY, sM - 1, sD);
        const endD = new Date(eY, eM - 1, eD);
        
        while(curr <= endD) {
          const dStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
          if(dStr === todayStr) {
            let docId = authUidToDocId[eUid] || (staffDocIds.has(eUid) ? eUid : null);
            if (docId) leaveMap[docId] = data; 
          }
          curr.setDate(curr.getDate() + 1);
        }
      });

      let present = 0, late = 0, absent = 0; let expectedCount = 0;

      staffDocIds.forEach(docId => {
        const records = attendanceMap[docId] || [];
        const schedStart = scheduleMap[docId];
        let leaveObj = leaveMap[docId];
        let leaveType = leaveObj ? leaveObj.type : null;
        let duration = leaveObj?.duration || 'Full Day';
        const isPH = holidaysMap[todayStr] && (!!schedStart || !!leaveType);

        if (schedStart && !isPH && !(leaveType && duration === 'Full Day')) expectedCount++;

        if (records.length > 0) {
          present++;
          const clockIn = records.filter(r => r.session === 'Clock In').sort((a,b) => (a.timestamp?.seconds||0)-(b.timestamp?.seconds||0))[0];
          if (clockIn && schedStart) {
            const time = clockIn.manualIn ? new Date(`${todayStr}T${clockIn.manualIn}:00`) : clockIn.timestamp.toDate();
            const lateThreshold = new Date(schedStart.getTime() + 60000); 
            if (time >= lateThreshold) late++;
          }
        } else if (schedStart) {
          if (!isPH && !leaveType) absent++; 
          else if (leaveType && duration !== 'Full Day') absent++; 
        }
      });

      const finalPresent = Math.max(0, present - late);
      const total = Math.max(expectedCount, present);
      const percent = total ? Math.round((present / total) * 100) + '%' : '0%';

      setAttStats({ present: finalPresent, late, absent, percent });
      renderChart(finalPresent, late, absent);
    } catch (e) { console.error("Dashboard Load Error:", e); }
  };

  const renderChart = (present, late, absent) => {
    if (chartInstance.current) chartInstance.current.destroy();
    if (chartRef.current) {
      const ctx = chartRef.current.getContext('2d');
      chartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['On Time', 'Late', 'Absent'],
          datasets: [{ data: [present, late, absent], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], borderWidth: 0, cutout: '75%' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
    }
  };

  // ----------------------------------------------------
  // Handlers: Announcements
  // ----------------------------------------------------
  useEffect(() => {
    if(announceModalOpen) {
        const unsub = onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc")), snap => {
            setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }
  }, [announceModalOpen]);

  const handlePostAnnouncement = async () => {
    if (!announceTitle || !announceMessage) { alert("Please enter title and message."); return; }
    setActionLoading(true);
    try {
        let attachmentUrl = null;
        if (announceFile) {
            const fileRef = storageRef(storage, `announcements/${Date.now()}_${announceFile.name}`);
            await uploadBytes(fileRef, announceFile);
            attachmentUrl = await getDownloadURL(fileRef);
        }
        await addDoc(collection(db, "announcements"), { 
            title: announceTitle, message: announceMessage, 
            createdAt: serverTimestamp(), author: currentUser.email,
            attachmentUrl: attachmentUrl || null 
        });
        setAnnounceTitle(''); setAnnounceMessage(''); setAnnounceFile(null);
        alert('Announcement posted!');
    } catch(e) { alert("Error: " + e.message); } finally { setActionLoading(false); }
  };

  const handleDeleteAnnouncement = async (id) => {
      if(!window.confirm("Delete this announcement?")) return;
      try { await deleteDoc(doc(db, "announcements", id)); } catch(e) { alert("Error: " + e.message); }
  };

  // ----------------------------------------------------
  // Handlers: Driver Setup
  // ----------------------------------------------------
  const handleOpenDriverModal = async () => {
    setDriverModalOpen(true);
    const snap = await getDocs(query(collection(db, "users"), where("role", "in", ["staff", "admin"])));
    setDriverStaffList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'disabled'));
  };

  const handleToggleDriver = async (uid, currentVal) => {
    try {
      await updateDoc(doc(db, "users", uid), { isDriver: !currentVal, "meta.updatedAt": serverTimestamp() });
      setDriverStaffList(prev => prev.map(s => s.id === uid ? { ...s, isDriver: !currentVal } : s));
    } catch(e) { alert("Error: " + e.message); }
  };

  // ----------------------------------------------------
  // Handlers: Office Setup
  // ----------------------------------------------------
  const handleOpenOfficeModal = async () => {
    setOfficeModalOpen(true);
    const docSnap = await getDoc(doc(db, "settings", "office_location"));
    if (docSnap.exists()) {
        const data = docSnap.data();
        setOfficeSettings({ latitude: data.latitude || '', longitude: data.longitude || '', radius: data.radius || 500, allowedWifis: data.allowedWifis || [] });
    }
  };

  const handleSaveOfficeSettings = async () => {
      setActionLoading(true);
      try {
          const payload = { ...officeSettings, updatedAt: serverTimestamp(), latitude: parseFloat(officeSettings.latitude), longitude: parseFloat(officeSettings.longitude), radius: parseFloat(officeSettings.radius) };
          await setDoc(doc(db, "settings", "office_location"), payload, { merge: true });
          alert("Office settings saved.");
          setOfficeModalOpen(false);
      } catch(e) { alert("Error: " + e.message); } finally { setActionLoading(false); }
  };

  const handleAddWifi = () => {
      if(!newWifi.ssid) return;
      setOfficeSettings(prev => ({ ...prev, allowedWifis: [...prev.allowedWifis, { ...newWifi }] }));
      setNewWifi({ ssid: '', bssid: '' });
  };

  const handleRemoveWifi = (idx) => {
      setOfficeSettings(prev => {
          const w = [...prev.allowedWifis]; w.splice(idx, 1);
          return { ...prev, allowedWifis: w };
      });
  };

  // ----------------------------------------------------
  // Handlers: Audit Logs
  // ----------------------------------------------------
  const fetchAuditLogs = async (isNextPage = false) => {
      setActionLoading(true);
      let constraints = [orderBy("timestamp", "desc"), limit(PAGE_SIZE)];
      
      if (auditFilter.date) {
          const start = new Date(auditFilter.date); start.setHours(0,0,0,0);
          const end = new Date(auditFilter.date); end.setHours(23,59,59,999);
          constraints.push(where("timestamp", ">=", start), where("timestamp", "<=", end));
      }
      if (auditFilter.email) constraints.push(where("operatorEmail", "==", auditFilter.email.trim()));
      if (isNextPage && lastLogDoc) constraints.push(startAfter(lastLogDoc));

      try {
          const snap = await getDocs(query(collection(db, "audit_logs"), ...constraints));
          const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAuditLogs(isNextPage ? [...auditLogs, ...newLogs] : newLogs);
          setLastLogDoc(snap.docs[snap.docs.length - 1]);
          setHasMoreLogs(snap.docs.length === PAGE_SIZE);
      } catch(e) { alert("Audit Load Error: " + e.message); } finally { setActionLoading(false); }
  };

  const handleOpenAuditModal = () => {
      setAuditModalOpen(true); setAuditFilter({ date: '', email: '' }); setAuditLogs([]); setLastLogDoc(null);
      fetchAuditLogs(false);
  };

  const handleInspectLog = async (id) => {
      try {
          const snap = await getDoc(doc(db, "audit_logs", id));
          if(snap.exists() && snap.data().details) {
              setInspectData(snap.data().details);
              setInspectModalOpen(true);
          } else { alert("No details available."); }
      } catch(e) { alert("Inspect error: " + e.message); }
  };


  return (
    <div className="container py-4">
      {/* ================= 1. 快捷操作按钮 ================= */}
      <div className="row g-3 mb-4 justify-content-center">
        <div className="col-6 col-md-2">
          <Link to="/staff" className="quick-action-btn w-100 bg-white">
            <div className="bg-primary bg-opacity-10 p-2 rounded-circle mb-2 text-primary"><User size={24} /></div>
            <div className="fw-bold small text-dark">Onboard Staff</div>
          </Link>
        </div>  
        <div className="col-6 col-md-2">
          <Link to="/payroll" className="quick-action-btn w-100 bg-white">
            <div className="bg-danger bg-opacity-10 p-2 rounded-circle mb-2 text-danger"><DollarSign size={24} /></div>
            <div className="fw-bold small text-dark">Payroll</div>
          </Link>
        </div>
        <div className="col-6 col-md-2">
          <button onClick={() => setAnnounceModalOpen(true)} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
            <div className="bg-warning bg-opacity-10 p-2 rounded-circle mb-2 text-warning"><Megaphone size={24} /></div>
            <div className="fw-bold small text-dark">Announcement</div>
          </button>
        </div>
        <div className="col-6 col-md-2">
          <Link to="/schedules" className="quick-action-btn w-100 bg-white">
            <div className="bg-info bg-opacity-10 p-2 rounded-circle mb-2 text-info"><CalendarDays size={24} /></div>
            <div className="fw-bold small text-dark">Roster Plan</div>
          </Link>
        </div>
        <div className="col-6 col-md-2">
          <Link to="/gallery" className="quick-action-btn w-100 bg-white">
            <div className="bg-dark bg-opacity-10 p-2 rounded-circle mb-2 text-dark"><Images size={24} /></div>
            <div className="fw-bold small text-dark">Cases Photos</div>
          </Link>
        </div>
        <div className="col-6 col-md-2">
          <Link to="/daily-tasks" className="quick-action-btn w-100 bg-white">
            <div className="bg-dark bg-opacity-10 p-2 rounded-circle mb-2 text-dark"><ClipboardCheck size={24} /></div>
            <div className="fw-bold small text-dark">Daily Tasks</div>
          </Link>
        </div>
        
        {/* 居中的按钮们 */}
        <div className="col-6 col-md-2">
          <button onClick={handleOpenDriverModal} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
            <div className="bg-success bg-opacity-10 p-2 rounded-circle mb-2 text-success"><Truck size={24} /></div>
            <div className="fw-bold small text-dark">Driver Setup</div>
          </button>
        </div>
        {userData?.role === 'manager' && (
          <>
            <div className="col-6 col-md-2">
              <button onClick={handleOpenAuditModal} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
                <div className="bg-dark bg-opacity-10 p-2 rounded-circle mb-2 text-dark"><ShieldCheck size={24} /></div>
                <div className="fw-bold small text-dark">Audit Logs</div>
              </button>
            </div>
            <div className="col-6 col-md-2">
              <button onClick={handleOpenOfficeModal} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
                <div className="bg-secondary bg-opacity-10 p-2 rounded-circle mb-2 text-secondary"><Settings size={24} /></div>
                <div className="fw-bold small text-dark">Office Setup</div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ================= 2. 下方统计卡片区 ================= */}
      <div className="row g-4">
        {/* 卡片 1: 考勤 */}
        <div className="col-lg-4 col-md-6">
          <div className="stat-card position-relative bg-white border-0 shadow-sm p-4 h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold m-0 text-dark d-flex align-items-center"><Clock size={18} className="me-2 text-primary" /> Today's Attendance</h6>
              <span className="badge bg-light text-dark border px-2 py-1">{currentDate}</span>
            </div>
            <div className="row align-items-center mt-4">
              <div className="col-6 position-relative">
                <canvas ref={chartRef} style={{ maxHeight: '130px' }}></canvas>
                <div className="position-absolute top-50 start-50 translate-middle text-center" style={{ marginTop: '5px' }}>
                  <div className="h4 fw-bold m-0">{attStats.percent}</div>
                </div>
              </div>
              <div className="col-6 ps-4">
                <Link to="/attendance?filter=present" className="text-decoration-none d-block mb-3">
                  <div className="d-flex align-items-center gap-2"><div className="dot bg-success"></div><span className="text-muted small">On Time</span></div>
                  <div className="h5 fw-bold m-0 text-dark">{attStats.present}</div>
                </Link>
                <Link to="/attendance?filter=late" className="text-decoration-none d-block mb-3">
                  <div className="d-flex align-items-center gap-2"><div className="dot" style={{ backgroundColor: '#fbbf24' }}></div><span className="text-muted small">Late</span></div>
                  <div className="h5 fw-bold m-0" style={{ color: '#fbbf24' }}>{attStats.late}</div>
                </Link>
                <Link to="/attendance?filter=absent" className="text-decoration-none d-block">
                  <div className="d-flex align-items-center gap-2"><div className="dot bg-danger"></div><span className="text-muted small">Absent</span></div>
                  <div className="h5 fw-bold m-0 text-danger">{attStats.absent}</div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 卡片 2: 待办 */}
        <div className="col-lg-4 col-md-6">
          <div className="stat-card bg-white border-0 shadow-sm p-4 h-100">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="fw-bold m-0 text-dark d-flex align-items-center"><AlertCircle size={18} className="me-2 text-danger" /> Action Required</h6>
            </div>
            <div className="d-flex flex-column gap-3 mt-1">
              <Link to="/leave" className="task-row d-flex align-items-center justify-content-between p-3 rounded text-decoration-none border">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-success bg-opacity-10 text-success p-2 rounded"><CalendarCheck size={20} /></div>
                  <div><div className="fw-bold text-dark small">Leave Requests</div><div className="text-muted" style={{fontSize:'0.75rem'}}>Awaiting approval</div></div>
                </div>
                {tasks.leaves > 0 && <span className="badge bg-danger rounded-pill">{tasks.leaves}</span>}
              </Link>
              <Link to="/attendance" className="task-row d-flex align-items-center justify-content-between p-3 rounded text-decoration-none border">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-primary bg-opacity-10 text-primary p-2 rounded"><Fingerprint size={20} /></div>
                  <div><div className="fw-bold text-dark small">Attendance Fixes</div><div className="text-muted" style={{fontSize:'0.75rem'}}>Manual corrections</div></div>
                </div>
                {tasks.fixes > 0 && <span className="badge bg-danger rounded-pill">{tasks.fixes}</span>}
              </Link>
              <Link to="/staff" className="task-row d-flex align-items-center justify-content-between p-3 rounded text-decoration-none border">
                <div className="d-flex align-items-center gap-3">
                  <div className="bg-warning bg-opacity-10 text-warning p-2 rounded"><UserCog size={20} /></div>
                  <div><div className="fw-bold text-dark small">Profile Updates</div><div className="text-muted" style={{fontSize:'0.75rem'}}>Staff modifications</div></div>
                </div>
                {tasks.edits > 0 && <span className="badge bg-danger rounded-pill">{tasks.edits}</span>}
              </Link>
            </div>
          </div>
        </div>

        {/* 卡片 3: GPS */}
        <div className="col-lg-4 col-md-12">
          <div className="stat-card border-0 shadow-sm p-4 d-flex flex-column h-100" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="fw-bold m-0 text-dark d-flex align-items-center"><MapPin size={18} className="me-2 text-info" /> Fleet GPS Status</h6>
              <div className="spinner-grow text-primary" style={{ width: '8px', height: '8px' }} role="status"></div>
            </div>
            <div className="d-flex justify-content-around text-center mb-auto mt-4">
              <div>
                <div className="stat-value text-primary">{fleetStats.online}</div>
                <div className="stat-label text-primary opacity-75 mt-1" style={{fontSize:'0.75rem', fontWeight:'bold'}}><span className="dot bg-success"></span>ACTIVE NOW</div>
              </div>
              <div className="border-end border-2 border-primary opacity-10"></div>
              <div>
                <div className="stat-value text-muted">{fleetStats.offline}</div>
                <div className="stat-label mt-1" style={{fontSize:'0.75rem', fontWeight:'bold', color: '#94a3b8'}}><span className="dot bg-secondary"></span>OFFLINE</div>
              </div>
            </div>
            <Link to="/map" className="btn btn-white border w-100 fw-bold shadow-sm text-primary mt-5 py-2">Open Live Map</Link>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* ======================= MODALS =========================== */}
      {/* ========================================================== */}

      {/* Announcement Modal */}
      {announceModalOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
             <div className="modal-dialog modal-dialog-centered modal-lg">
                <div className="modal-content border-0 shadow">
                    <div className="modal-header bg-warning bg-opacity-10 border-0">
                        <h6 className="modal-title fw-bold text-dark d-flex align-items-center"><Megaphone size={18} className="me-2"/> Manage Announcements</h6>
                        <button type="button" className="btn-close" onClick={() => setAnnounceModalOpen(false)}></button>
                    </div>
                    <div className="modal-body p-4">
                        <div className="card border border-warning border-opacity-25 bg-warning bg-opacity-10 mb-4 shadow-sm">
                            <div className="card-body">
                                <label className="small fw-bold text-dark mb-2">📣 Draft New Message</label>
                                <input type="text" className="form-control bg-white mb-2 fw-bold" placeholder="Announcement Title..." value={announceTitle} onChange={e => setAnnounceTitle(e.target.value)} />
                                <textarea className="form-control bg-white mb-3" rows="3" placeholder="Type your important announcement here..." value={announceMessage} onChange={e => setAnnounceMessage(e.target.value)}></textarea>
                                <div className="mb-3 p-2 bg-white border rounded d-flex justify-content-between align-items-center">
                                    <input type="file" className="form-control form-control-sm border-0 bg-transparent" accept="image/*,.pdf" onChange={e => setAnnounceFile(e.target.files[0])} />
                                    {announceFile && <button className="btn btn-sm btn-outline-danger" onClick={() => setAnnounceFile(null)}>Clear</button>}
                                </div>
                                <div className="text-end">
                                    <button className="btn btn-primary btn-sm fw-bold px-4 shadow-sm" disabled={actionLoading} onClick={handlePostAnnouncement}>
                                      {actionLoading ? 'Posting...' : <><Send size={14} className="me-2 d-inline"/> Post Now</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                            <h6 className="fw-bold m-0 text-muted small">Previous Announcements</h6>
                            <span className="badge bg-light text-secondary border">{announcements.length}</span>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                          {announcements.map(a => (
                            <div className="card mb-2 p-3 border shadow-sm" key={a.id}>
                                {a.title && <div className="fw-bold text-dark mb-1">{a.title}</div>}
                                <div className="small mb-2 text-secondary">{a.message}</div>
                                {a.attachmentUrl && <div><a href={a.attachmentUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-light border text-primary" style={{fontSize: '0.75rem'}}>View Attachment</a></div>}
                                <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                                    <small className="text-muted">{a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleDateString() : 'Just now'}</small>
                                    <button className="btn btn-xs btn-outline-danger py-0 px-2" onClick={() => handleDeleteAnnouncement(a.id)}>Delete</button>
                                </div>
                            </div>
                          ))}
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </>
      )}

      {/* Driver Setup Modal */}
      {driverModalOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered modal-lg">
                <div className="modal-content border-0 shadow">
                    <div className="modal-header bg-success bg-opacity-10 border-0">
                        <h6 className="modal-title fw-bold text-dark d-flex align-items-center"><Truck size={18} className="me-2"/> Driver Configuration</h6>
                        <button type="button" className="btn-close" onClick={() => setDriverModalOpen(false)}></button>
                    </div>
                    <div className="modal-body p-4">
                        <div className="input-group mb-3 shadow-sm">
                            <span className="input-group-text bg-white border-end-0"><Search size={16} className="text-muted" /></span>
                            <input type="text" className="form-control border-start-0" placeholder="Search staff name or email..." value={driverSearch} onChange={e => setDriverSearch(e.target.value)} />
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }} className="border rounded">
                            {driverStaffList.filter(s => (s.personal?.name||s.name||'').toLowerCase().includes(driverSearch.toLowerCase()) || (s.personal?.email||'').toLowerCase().includes(driverSearch.toLowerCase())).map(s => (
                                <div className="d-flex align-items-center justify-content-between p-3 border-bottom bg-white hover-bg-light" key={s.id}>
                                    <div><b className="text-dark">{s.personal?.name || s.name}</b><br/><small className="text-muted">{s.personal?.email || ''}</small></div>
                                    <div className="form-check form-switch fs-5">
                                      <input className="form-check-input cursor-pointer" type="checkbox" checked={s.isDriver || false} onChange={() => handleToggleDriver(s.id, s.isDriver)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </>
      )}

      {/* Office Setup Modal */}
      {officeModalOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow">
                <div className="modal-header bg-secondary bg-opacity-10 border-0">
                  <h6 className="modal-title fw-bold text-dark d-flex align-items-center"><Settings size={18} className="me-2"/> Office Settings</h6>
                  <button type="button" className="btn-close" onClick={() => setOfficeModalOpen(false)}></button>
                </div>
                <div className="modal-body p-4">
                  <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">📍 GPS Location (For Attendance)</h6>
                  <div className="row g-3 mb-4">
                      <div className="col-6"><label className="form-label small fw-bold text-muted">Latitude</label><input type="number" className="form-control" step="any" value={officeSettings.latitude} onChange={e=>setOfficeSettings(p=>({...p, latitude:e.target.value}))}/></div>
                      <div className="col-6"><label className="form-label small fw-bold text-muted">Longitude</label><input type="number" className="form-control" step="any" value={officeSettings.longitude} onChange={e=>setOfficeSettings(p=>({...p, longitude:e.target.value}))}/></div>
                      <div className="col-12"><label className="form-label small fw-bold text-muted">Radius (Meters)</label><input type="number" className="form-control" value={officeSettings.radius} onChange={e=>setOfficeSettings(p=>({...p, radius:e.target.value}))}/></div>
                  </div>
                  
                  <h6 className="fw-bold mb-3 text-primary border-bottom pb-2">📶 Wi-Fi Whitelist (Optional)</h6>
                  <div className="row g-2 mb-3">
                      <div className="col-5"><input type="text" className="form-control form-control-sm" placeholder="SSID" value={newWifi.ssid} onChange={e=>setNewWifi(p=>({...p, ssid: e.target.value}))}/></div>
                      <div className="col-5"><input type="text" className="form-control form-control-sm" placeholder="BSSID (Optional)" value={newWifi.bssid} onChange={e=>setNewWifi(p=>({...p, bssid: e.target.value}))}/></div>
                      <div className="col-2"><button className="btn btn-sm btn-outline-primary w-100" onClick={handleAddWifi}>Add</button></div>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }} className="border rounded bg-light">
                     {officeSettings.allowedWifis.map((w, idx) => (
                        <div className="d-flex justify-content-between align-items-center p-2 border-bottom bg-white" key={idx}>
                           <div><b className="text-dark small">{w.ssid}</b><br/><span className="text-muted" style={{fontSize: '0.7rem'}}>{w.bssid || 'Any BSSID'}</span></div>
                           <button className="btn btn-sm text-danger p-1" onClick={() => handleRemoveWifi(idx)}><Trash2 size={16}/></button>
                        </div>
                     ))}
                     {officeSettings.allowedWifis.length === 0 && <div className="p-3 text-center text-muted small">No WiFi restricted.</div>}
                  </div>
                </div>
                <div className="modal-footer bg-light border-0">
                  <button className="btn btn-primary fw-bold px-5 shadow-sm" disabled={actionLoading} onClick={handleSaveOfficeSettings}>{actionLoading ? 'Saving...' : 'Save Settings'}</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Audit Logs Modal (Manager Only) */}
      {auditModalOpen && (
        <>
          <div className="modal-backdrop fade show"></div>
          <div className="modal fade show d-block" tabIndex="-1">
            <div className="modal-dialog modal-xl modal-dialog-scrollable">
              <div className="modal-content border-0 shadow">
                <div className="modal-header bg-dark text-white border-0">
                  <h6 className="modal-title fw-bold d-flex align-items-center"><ShieldCheck size={18} className="me-2"/> System Audit Logs</h6>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setAuditModalOpen(false)}></button>
                </div>
                <div className="p-3 bg-white border-bottom shadow-sm z-1 position-relative">
                    <div className="row g-2 align-items-end">
                        <div className="col-md-3">
                            <label className="small fw-bold text-muted mb-1">Filter Date</label>
                            <input type="date" className="form-control form-control-sm" value={auditFilter.date} onChange={e=>setAuditFilter(p=>({...p, date: e.target.value}))} />
                        </div>
                        <div className="col-md-4">
                            <label className="small fw-bold text-muted mb-1">Admin Email</label>
                            <input type="text" className="form-control form-control-sm" placeholder="example@user.com" value={auditFilter.email} onChange={e=>setAuditFilter(p=>({...p, email: e.target.value}))} />
                        </div>
                        <div className="col-md-5 d-flex gap-2">
                            <button className="btn btn-sm btn-primary px-3 fw-bold d-flex align-items-center" onClick={() => { setLastLogDoc(null); fetchAuditLogs(false); }}><Filter size={14} className="me-1"/> Apply</button>
                            <button className="btn btn-sm btn-light border px-3 fw-bold text-muted d-flex align-items-center" onClick={() => { setAuditFilter({date:'',email:''}); setLastLogDoc(null); setTimeout(()=>fetchAuditLogs(false), 100); }}><RotateCcw size={14} className="me-1"/> Reset</button>
                        </div>
                    </div>
                </div>
                <div className="modal-body bg-light p-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0 bg-white">
                            <thead className="table-light sticky-top shadow-sm">
                                <tr>
                                    <th className="ps-4">Timestamp</th>
                                    <th>Admin Operator</th>
                                    <th>Action</th>
                                    <th>Target</th>
                                    <th className="text-end pe-4">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actionLoading && auditLogs.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center py-5"><div className="spinner-border text-primary"></div></td></tr>
                                ) : auditLogs.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center py-5 text-muted">No logs match criteria.</td></tr>
                                ) : (
                                    auditLogs.map(log => {
                                        const time = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('en-GB') : 'Just now';
                                        let targetDisplay = log.targetUid || '-';
                                        if (targetDisplay === "GLOBAL" || targetDisplay === "MULTIPLE") {
                                            // keep
                                        } else if (globalStaffMap[targetDisplay]) {
                                            targetDisplay = `👤 ${globalStaffMap[targetDisplay]}`;
                                        } else if (log.action.includes("ANNOUNCEMENT")) {
                                            if (log.details?.new?.title) targetDisplay = `📢 ${log.details.new.title}`;
                                            else if (log.details?.old?.title) targetDisplay = `📢 ${log.details.old.title}`;
                                            else targetDisplay = "📢 Announcement";
                                        } else if (log.action.includes("LEAVE") || log.action.includes("CORRECTION") || log.action.includes("PAYSLIP")) {
                                            if (log.details?.old?.empName) targetDisplay = `👤 ${log.details.old.empName}`;
                                            else if (log.details?.old?.name) targetDisplay = `👤 ${log.details.old.name}`;
                                        }

                                        return (
                                            <tr key={log.id}>
                                                <td className="ps-4 small text-muted font-monospace">{time}</td>
                                                <td><div className="fw-bold small text-dark">{log.operatorEmail}</div></td>
                                                <td><span className="badge bg-primary bg-opacity-10 text-primary border border-primary">{log.action.replace(/_/g, ' ')}</span></td>
                                                <td className="small fw-bold text-secondary text-truncate" style={{maxWidth: '150px'}} title={targetDisplay}>{targetDisplay}</td>
                                                <td className="text-end pe-4"><button className="btn btn-xs btn-outline-dark fw-bold" onClick={() => handleInspectLog(log.id)}>Inspect</button></td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    {hasMoreLogs && (
                        <div className="p-3 text-center bg-white border-top shadow-sm">
                            <button className="btn btn-sm btn-outline-secondary px-4 fw-bold rounded-pill" onClick={() => fetchAuditLogs(true)} disabled={actionLoading}>
                                {actionLoading ? 'Loading...' : <>Load More Records <ChevronDown size={14} className="ms-1 d-inline"/></>}
                            </button>
                        </div>
                    )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Inspect Log Child Modal */}
      {inspectModalOpen && (
         <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1060, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
               <div className="modal-content border-0 shadow-lg">
                  <div className="modal-header bg-light border-bottom-0 pb-0">
                     <h6 className="modal-title fw-bold text-dark d-flex align-items-center">Log Details</h6>
                     <button type="button" className="btn-close" onClick={() => setInspectModalOpen(false)}></button>
                  </div>
                  <div className="modal-body pt-3">
                     {inspectData.old && Object.keys(inspectData.old).length > 0 && (
                        <div className="mb-3">
                           <div className="text-danger fw-bold small mb-1">➖ Previous Data (Old)</div>
                           <pre className="bg-dark text-light p-3 rounded small" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                              {JSON.stringify(inspectData.old, null, 2)}
                           </pre>
                        </div>
                     )}
                     {inspectData.new && Object.keys(inspectData.new).length > 0 && (
                        <div>
                           <div className="text-success fw-bold small mb-1">➕ Modified Data (New)</div>
                           <pre className="bg-dark text-light p-3 rounded small" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                              {JSON.stringify(inspectData.new, null, 2)}
                           </pre>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}