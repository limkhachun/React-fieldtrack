// src/pages/Dashboard/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

// 🟢 导入 Lucide 图标
import { 
  User, DollarSign, Megaphone, CalendarDays, Images, ClipboardCheck, 
  Truck, ShieldCheck, Settings, Clock, AlertCircle, CalendarCheck, 
  Fingerprint, UserCog, MapPin 
} from 'lucide-react';

export default function Dashboard() {
  const { userData } = useAuth();
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // --- 状态管理 (取代原来的 document.getElementById) ---
  const [currentDate, setCurrentDate] = useState('');
  
  // 考勤数据
  const [attStats, setAttStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    percent: '0%'
  });

  // 待办事项数据
  const [tasks, setTasks] = useState({
    leaves: 0,
    fixes: 0,
    edits: 0
  });

  // GPS 实时数据
  const [fleetStats, setFleetStats] = useState({
    online: 0,
    offline: 0
  });

  // 获取今天的格式化日期 YYYY-MM-DD
  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    // 1. 设置右上角的显示日期 (例如 "29 Apr")
    setCurrentDate(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

    // 2. 监听待办事项 (Action Required)
    const unsubLeaves = onSnapshot(query(collection(db, "leave_applications"), where("status", "==", "pending")), snap => {
      setTasks(prev => ({ ...prev, leaves: snap.size }));
    });
    const unsubFixes = onSnapshot(query(collection(db, "attendance_corrections"), where("status", "==", "Pending")), snap => {
      setTasks(prev => ({ ...prev, fixes: snap.size }));
    });
    const unsubEdits = onSnapshot(query(collection(db, "edit_requests"), where("status", "==", "pending")), snap => {
      setTasks(prev => ({ ...prev, edits: snap.size }));
    });

    // 3. 监听实时车辆 GPS (RTDB)
    const todayStr = new Date().toLocaleDateString('en-CA');
    const liveRef = ref(rtdb, 'live_locations');
    const unsubRTDB = onValue(liveRef, (snapshot) => {
      let onlineCount = 0;
      let offlineCount = 0;
      const data = snapshot.val();
      
      if (data) {
        Object.values(data).forEach(val => {
          if (!val.lastUpdate) return;
          const lastUpdateDate = new Date(val.lastUpdate);
          if (lastUpdateDate.toLocaleDateString('en-CA') === todayStr) {
            // 15分钟内有更新视为在线
            const isOnline = val.isTracking !== false && (new Date() - lastUpdateDate) < 1000 * 60 * 15; 
            isOnline ? onlineCount++ : offlineCount++;
          }
        });
      }
      setFleetStats({ online: onlineCount, offline: offlineCount });
    });

    // 4. 获取考勤图表数据 (一次性获取)
    fetchAttendanceData();

    // 清理监听器
    return () => {
      unsubLeaves();
      unsubFixes();
      unsubEdits();
      // RTDB 的 off 方式
    };
  }, []);

  // 🟢 复刻 home-app.js 中的核心考勤计算逻辑
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
          if (data.authUid) {
            authUidToDocId[data.authUid] = doc.id;
            docIdToAuthMap[doc.id] = data.authUid;
          }
        }
      });

      const attendanceMap = {}; 
      attSnap.forEach(doc => {
        const d = doc.data();
        if (d.verificationStatus !== 'Rejected') {
          let docId = authUidToDocId[d.uid] || (staffDocIds.has(d.uid) ? d.uid : null);
          if (docId) {
            if (!attendanceMap[docId]) attendanceMap[docId] = [];
            attendanceMap[docId].push(d);
          }
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

      let present = 0, late = 0, absent = 0;
      let expectedCount = 0;

      staffDocIds.forEach(docId => {
        const records = attendanceMap[docId] || [];
        const schedStart = scheduleMap[docId];
        let leaveObj = leaveMap[docId];
        let leaveType = leaveObj ? leaveObj.type : null;
        let duration = leaveObj?.duration || 'Full Day';
        const isPH = holidaysMap[todayStr] && (!!schedStart || !!leaveType);

        if (schedStart && !isPH && !(leaveType && duration === 'Full Day')) {
          expectedCount++;
        }

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

    } catch (e) { 
      console.error("Dashboard Load Error:", e);
    }
  };

  // 🟢 渲染 Chart.js 环形图
  const renderChart = (present, late, absent) => {
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
    
    if (chartRef.current) {
      const ctx = chartRef.current.getContext('2d');
      chartInstance.current = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['On Time', 'Late', 'Absent'],
          datasets: [{ 
            data: [present, late, absent], 
            backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'], 
            borderWidth: 0, 
            cutout: '75%' 
          }]
        },
        options: { 
          responsive: true, 
          maintainAspectRatio: false, 
          plugins: { legend: { display: false }, tooltip: { enabled: false } } 
        }
      });
    }
  };

  // 占位函数：未来将在此处调用真实的 Modal 组件
  const handleOpenModal = (modalName) => {
    alert(`The ${modalName} modal will be migrated to React components in the next step!`);
  };

  return (
    <div className="container py-4">
      {/* ================= 1. 顶部 7 个快捷操作按钮 (完全还原截图) ================= */}
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
          <button onClick={() => handleOpenModal('Announcement')} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
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

        {/* 截图中单独居中换行的按钮 (12列排满后自动掉下来居中) */}
        <div className="col-6 col-md-2">
          <button onClick={() => handleOpenModal('Driver Setup')} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
            <div className="bg-success bg-opacity-10 p-2 rounded-circle mb-2 text-success"><Truck size={24} /></div>
            <div className="fw-bold small text-dark">Driver Setup</div>
          </button>
        </div>

        {/* 管理员专属按钮：由于使用 justify-content-center，它们会自动排在 Driver Setup 旁边 */}
        {userData?.role === 'manager' && (
          <>
            <div className="col-6 col-md-2">
              <button onClick={() => handleOpenModal('Audit Logs')} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
                <div className="bg-dark bg-opacity-10 p-2 rounded-circle mb-2 text-dark"><ShieldCheck size={24} /></div>
                <div className="fw-bold small text-dark">Audit Logs</div>
              </button>
            </div>
            <div className="col-6 col-md-2">
              <button onClick={() => handleOpenModal('Office Setup')} className="quick-action-btn w-100 border-1 shadow-sm bg-white">
                <div className="bg-secondary bg-opacity-10 p-2 rounded-circle mb-2 text-secondary"><Settings size={24} /></div>
                <div className="fw-bold small text-dark">Office Setup</div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ================= 2. 下方三大统计卡片区 ================= */}
      <div className="row g-4">
        
        {/* 卡片 1: 考勤图表 */}
        <div className="col-lg-4 col-md-6">
          <div className="stat-card position-relative bg-white border-0 shadow-sm p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold m-0 text-dark d-flex align-items-center">
                <Clock size={18} className="me-2 text-primary" /> Today's Attendance
              </h6>
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

        {/* 卡片 2: 待办事项列表 */}
        <div className="col-lg-4 col-md-6">
          <div className="stat-card bg-white border-0 shadow-sm p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="fw-bold m-0 text-dark d-flex align-items-center">
                <AlertCircle size={18} className="me-2 text-danger" /> Action Required
              </h6>
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

        {/* 卡片 3: GPS 车辆状态 */}
        <div className="col-lg-4 col-md-12">
          <div className="stat-card border-0 shadow-sm p-4 d-flex flex-column" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h6 className="fw-bold m-0 text-dark d-flex align-items-center">
                <MapPin size={18} className="me-2 text-info" /> Fleet GPS Status
              </h6>
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
            
            <Link to="/map" className="btn btn-white border w-100 fw-bold shadow-sm text-primary mt-5 py-2">
              Open Live Map
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}