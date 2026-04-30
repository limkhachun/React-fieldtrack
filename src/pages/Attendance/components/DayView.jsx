// src/pages/Attendance/components/DayView.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { 
  UserX, Clock, Settings2, Image as ImageIcon, 
  Edit3, ChevronDown, AlertTriangle, AlertCircle 
} from 'lucide-react';
import { ManualActionModal } from './AttendanceModals';

/**
 * @param {string} targetDate - 当前选择的日期 (YYYY-MM-DD)
 * @param {string} dayStatusFilter - 状态过滤器 (all, unverified, missingOut, absent)
 * @param {string} searchTerm - 搜索关键词
 * @param {function} setBadges - 更新父组件 Tab 上的 Badge 数量
 * @param {function} setUnverifiedRecords - 【关键】同步未验证记录给父组件供批量验证使用
 * @param {boolean} forceShowLogs - 是否强制显示详细记录列表
 * @param {boolean} hideDetailedRecords - Explicity hide the detailed records section
 */
export default function DayView({ 
  targetDate, 
  dayStatusFilter, 
  searchTerm, 
  setBadges, 
  setUnverifiedRecords,
  forceShowLogs = false,
  hideDetailedRecords = false // Add this prop
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ scheduled: 0, present: 0, absent: 0, leave: 0 });
  const [absentList, setAbsentList] = useState([]);
  const [lateList, setLateList] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  
  const [expandedRows, setExpandedRows] = useState({});
  const [manualModalConfig, setManualModalConfig] = useState({ isOpen: false, uid: '', name: '' });

  const toggleRow = (uid) => {
    setExpandedRows(prev => ({ ...prev, [uid]: !prev[uid] }));
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "--:--";
    if (timestamp.toDate) return timestamp.toDate().toTimeString().slice(0, 5);
    return "--:--";
  };

  const getLocalTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchAndProcessData = async () => {
    setLoading(true);
    try {
      const currentDateStr = getLocalTodayStr();
      const searchLower = searchTerm.toLowerCase().trim();

      // 并行获取所有核心数据[cite: 22]
      const [usersSnap, attSnap, schedSnap, leaveSnap, holSnap] = await Promise.all([
        getDocs(query(collection(db, "users"))),
        getDocs(query(collection(db, "attendance"), where("date", "==", targetDate))),
        getDocs(query(collection(db, "schedules"), where("date", "==", targetDate))),
        getDocs(query(collection(db, "leaves"), where("status", "==", "Approved"), where("endDate", ">=", targetDate))),
        getDoc(doc(db, "settings", "holidays"))
      ]);

      // 1. 公共假期映射
      const holidaysMap = {};
      if (holSnap.exists() && holSnap.data().holiday_list) {
        holSnap.data().holiday_list.forEach(h => { holidaysMap[h.date] = h.name; });
      }

      // 2. 员工字典处理 (处理 authUid 与 docId 的对应关系)[cite: 22]
      const usersMap = {};
      const staffDocIds = new Set();
      const authUidToDocId = {}; 
      const docIdToAuthMap = {};

      usersSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.status !== 'disabled' && d.role !== 'manager') {
          const docId = docSnap.id;
          staffDocIds.add(docId);
          if (d.authUid) {
            authUidToDocId[d.authUid] = docId;
            docIdToAuthMap[docId] = d.authUid;
          }
          usersMap[d.authUid || docId] = {
            name: d.personal?.name || d.name || "Unknown Staff",
            photo: d.faceIdPhoto || null,
            email: d.personal?.email,
            docId: docId,
            authUid: d.authUid,
            empCode: d.personal?.empCode || "" 
          };
        }
      });

      // 3. 考勤数据分组[cite: 22]
      const attendanceMap = {}; 
      let totalUnverifiedCount = 0;
      attSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.verificationStatus !== 'Rejected' && d.verificationStatus !== 'Archived') {
          let docId = authUidToDocId[d.uid] || (staffDocIds.has(d.uid) ? d.uid : null);
          if (docId) {
            const eUid = docIdToAuthMap[docId] || docId;
            if (!attendanceMap[eUid]) attendanceMap[eUid] = [];
            attendanceMap[eUid].push({ id: docSnap.id, ...d });
            if (d.verificationStatus !== 'Verified') totalUnverifiedCount++;
          }
        }
      });

      // 4. 排班与请假字典
      const scheduleMap = {}; 
      schedSnap.forEach(docSnap => {
        const d = docSnap.data();
        const eUid = docIdToAuthMap[d.userId] || d.userId;
        scheduleMap[eUid] = d;
      });

      const leaveMap = {};
      leaveSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.startDate <= targetDate && data.endDate >= targetDate) {
          const eUid = data.authUid || docIdToAuthMap[data.uid] || data.uid;
          leaveMap[eUid] = data; 
        }
      });

      // 5. 核心逻辑处理：判定状态
      const processedData = [];
      let scheduledCount = 0, presentCount = 0, leaveCount = 0, absentCount = 0;
      const tempAbsentList = [], tempLateList = [];

      Object.keys(usersMap).forEach(uid => {
        const user = usersMap[uid];
        const records = attendanceMap[uid] || [];
        const sched = scheduleMap[uid];
        const leaveObj = leaveMap[uid];
        let leaveType = leaveObj ? leaveObj.type : null;
        let duration = leaveObj?.duration || 'Full Day';
        const isPH = !!holidaysMap[targetDate] && (!!sched || !!leaveType);
        if (isPH) leaveType = null;

        let inT = "--:--", outT = "--:--", pending = 0;
        records.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        records.forEach(r => {
          if (r.verificationStatus !== 'Verified') pending++;
          if (r.session === 'Clock In' && inT === "--:--") inT = formatTime(r.timestamp);
          if (r.session === 'Clock Out') outT = formatTime(r.timestamp);
        });

        // 缺勤判断逻辑[cite: 22]
        const isAbsent = (targetDate <= currentDateStr) && inT === "--:--" && sched && (!leaveType || duration !== 'Full Day') && !isPH; 
        const isMissingOut = inT !== "--:--" && outT === "--:--" && targetDate < currentDateStr;
        const isClockedInToday = inT !== "--:--" && outT === "--:--" && targetDate === currentDateStr;

        if (sched) scheduledCount++;
        if (inT !== "--:--") presentCount++;
        if (isPH || leaveType) {
           leaveCount++;
           if (duration !== 'Full Day' && sched && inT === "--:--") { 
             absentCount++; 
             tempAbsentList.push(`${user.name} <small class="text-muted">(Missing Half)</small>`); 
           }
        } else if (sched && inT === "--:--") { 
          absentCount++; 
          tempAbsentList.push(user.name); 
        }

        if (isMissingOut) tempLateList.push(user.name);

        let finalStatus = isAbsent ? 'absent' : isMissingOut ? 'missingOut' : isClockedInToday ? 'clockedInToday' : (inT !== "--:--" ? 'present' : (leaveType ? 'leave' : (isPH ? 'ph' : 'none')));

        // 过滤处理[cite: 22]
        if (searchLower && !user.name.toLowerCase().includes(searchLower) && !user.empCode.toLowerCase().includes(searchLower)) return;
        if (dayStatusFilter !== 'all') {
          if (dayStatusFilter === 'clockedIn' && inT === "--:--") return;
          if (dayStatusFilter === 'unverified' && pending === 0) return;
          if (dayStatusFilter === 'missingOut' && !isMissingOut) return;
          if (dayStatusFilter === 'absent' && !isAbsent) return;
        }

        // 无效行跳过 (无排班、无打卡、无请假)
        if (!sched && records.length === 0 && !leaveType && !isPH) return;

        processedData.push({
          uid, name: user.name, empCode: user.empCode, photo: user.photo, status: finalStatus,
          shift: sched ? `${formatTime(sched.start)} - ${formatTime(sched.end)}` : 'Off',
          inTime: inT, outTime: outT, pendingCount: pending, records, isPH,
          leaveDetails: leaveType ? `${leaveType.toUpperCase()} ${duration !== 'Full Day' ? '(Half Day)' : ''}` : null
        });
      });

      // 6. 状态同步[cite: 22]
      const sortedData = processedData.sort((a, b) => b.pendingCount - a.pendingCount || a.name.localeCompare(b.name));
      setAttendanceData(sortedData);
      setStats({ scheduled: scheduledCount, present: presentCount, absent: absentCount, leave: leaveCount });
      setAbsentList(tempAbsentList); 
      setLateList(tempLateList);

      if (setBadges) setBadges(prev => ({ ...prev, unverified: totalUnverifiedCount }));

      // 【关键修复】同步待验证数据给 Bulk Verify 弹窗[cite: 22]
      // 🚨 修改后的数据同步逻辑：确保记录对象包含 empCode 🚨
if (setUnverifiedRecords) {
  const allUnverified = sortedData.flatMap(staff => 
    staff.records
      .filter(r => r.verificationStatus !== 'Verified')
      .map(r => ({
        ...r, 
        // 从 staff 对象中注入 empCode 和 name，确保弹窗能正确读取
        empCode: staff.empCode || "", 
        name: staff.name 
      }))
  );
  setUnverifiedRecords(allUnverified);
}

      setLoading(false);
    } catch (err) { 
      setError(err.message); 
      setLoading(false); 
    }
  };

  useEffect(() => { fetchAndProcessData(); }, [targetDate, dayStatusFilter, searchTerm]);

  if (loading) return (
    <div className="text-center py-5 my-5">
      <div className="spinner-border text-primary"></div>
      <p className="mt-3 fw-bold text-muted">Loading Day View...</p>
    </div>
  );

  return (
    <div className="animate__animated animate__fadeIn">
      {/* 统计卡片区 */}
      {!forceShowLogs && (
        <div className="mb-4">
          <div className="row g-4 mb-4">
            {[
              ['TOTAL SCHEDULED', stats.scheduled, 'primary'], 
              ['PRESENT', stats.present, 'success'], 
              ['ABSENT', stats.absent, 'danger'], 
              ['ON LEAVE', stats.leave, 'info']
            ].map(([label, val, color]) => (
              <div className="col-md-3" key={label}>
                <div className={`card border-0 shadow-sm p-3 h-100 border-start border-4 border-${color}`}>
                  <div className={`text-${color} small fw-bold mb-1`}>{label}</div>
                  <div className="fs-3 fw-bold text-dark">{val}</div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="row g-4">
            <div className="col-md-6">
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-header bg-white py-3 fw-bold text-danger d-flex align-items-center">
                  <UserX size={18} className="me-2" /> Absent List
                </div>
                <div className="card-body p-0">
                  <ul className="list-group list-group-flush">
                    {absentList.length > 0 ? absentList.map((name, i) => (
                      <li key={i} className="list-group-item d-flex justify-content-between align-items-center fw-bold text-danger">
                        <span dangerouslySetInnerHTML={{ __html: name }}></span>
                        <span className="badge bg-danger">ABSENT</span>
                      </li>
                    )) : (
                      <li className="list-group-item text-center text-success py-3 fw-bold">All staff accounted for.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card border-0 shadow-sm rounded-4 h-100">
                <div className="card-header bg-white py-3 fw-bold text-warning d-flex align-items-center">
                  <Clock size={18} className="me-2" /> Anomalies
                </div>
                <div className="card-body p-0">
                  <ul className="list-group list-group-flush">
                    {lateList.length > 0 ? lateList.map((name, i) => (
                      <li key={i} className="list-group-item d-flex justify-content-between align-items-center fw-bold text-warning" style={{ backgroundColor: '#fffbeb' }}>
                        {name} <span className="badge bg-warning text-dark"><AlertTriangle size={12} className="me-1"/>Missing Out</span>
                      </li>
                    )) : (
                      <li className="list-group-item text-center text-muted py-3 fw-bold">No anomalies detected.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 详细记录列表区 */}
      {/* Hide the detailed records if hideDetailedRecords is true */}
      {!hideDetailedRecords && (
        <div className="d-flex flex-column gap-3 mt-4">
          {attendanceData.length === 0 ? (
            <div className="text-center py-5 text-muted fw-bold bg-white rounded shadow-sm border">No records found.</div>
          ) : (
            attendanceData.map((staff) => (
              <div key={staff.uid} className={`card border-0 shadow-sm overflow-hidden ${staff.status === 'absent' ? 'bg-danger bg-opacity-10 border border-danger-subtle' : ''}`}>
                <div className="card-body p-3 cursor-pointer" onClick={() => toggleRow(staff.uid)}>
                  <div className="row align-items-center">
                    <div className="col-md-4 d-flex align-items-center gap-3 border-end">
                      <div className="position-relative">
                         {staff.photo ? (
                           <img src={staff.photo} alt="Avatar" className="rounded-circle border" style={{ width: '45px', height: '45px', objectFit: 'cover' }} />
                         ) : (
                           <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold border" style={{ width: '45px', height: '45px' }}>
                             {staff.name.charAt(0)}
                           </div>
                         )}
                         {/* 视觉修复：更直观的 Pending 徽章 */}
                         {staff.pendingCount > 0 && (
                           <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark border border-white" style={{ fontSize: '0.6rem' }}>
                             {staff.pendingCount}
                           </span>
                         )}
                      </div>
                      <div>
                        <h6 className="fw-bold text-dark m-0 text-truncate" style={{ maxWidth: '150px' }}>{staff.name}</h6>
                        <small className="text-muted d-block">Shift: {staff.shift}</small>
                        {staff.leaveDetails && <span className="badge bg-info text-white mt-1" style={{ fontSize: '0.65rem' }}>{staff.leaveDetails}</span>}
                      </div>
                    </div>
                    
                    <div className="col-md-5 text-center">
                      <div className="row">
                        <div className="col-6">
                          <small className="text-muted fw-bold d-block">IN</small>
                          <div className={`fw-bold font-monospace fs-5 ${staff.inTime === '--:--' ? 'text-muted' : 'text-dark'}`}>{staff.inTime}</div>
                        </div>
                        <div className="col-6">
                          <small className="text-muted fw-bold d-block">OUT</small>
                          <div className={`fw-bold font-monospace fs-5 ${staff.outTime === '--:--' ? 'text-muted' : 'text-success'}`}>{staff.outTime}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="col-md-3 text-end d-flex align-items-center justify-content-end gap-2">
                      <span className={`badge ${staff.inTime !== '--:--' ? 'bg-success' : (staff.status === 'leave' || staff.isPH ? 'bg-info' : 'bg-danger')}`}>
                        {staff.inTime !== '--:--' ? 'PRESENT' : (staff.status === 'leave' ? 'LEAVE' : (staff.isPH ? 'HOLIDAY' : 'ABSENT'))}
                      </span>
                      <button className="btn btn-sm btn-light border shadow-sm" onClick={(e) => { 
                        e.stopPropagation(); 
                        setManualModalConfig({ isOpen: true, uid: staff.uid, name: staff.name }); 
                      }}>
                        <Settings2 size={16} />
                      </button>
                      <ChevronDown size={18} className={`text-muted transition-transform ${expandedRows[staff.uid] ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </div>

                {/* 展开内容：显示所有 session 类型 */}
                {expandedRows[staff.uid] && (
                  <div className="list-group list-group-flush border-top bg-light animate__animated animate__fadeIn">
                    {staff.records.length > 0 ? staff.records.map(record => (
                      <div key={record.id} className="list-group-item d-flex justify-content-between align-items-center px-4 py-2 bg-transparent">
                        <div className="small">
                          <div className="fw-bold text-muted">{record.session}</div>
                          <div className="fw-bold text-dark fs-6 font-monospace">{formatTime(record.timestamp)}</div>
                          {record.address === "System Auto Clock Out" && <small className="text-danger d-block">Generated by System</small>}
                        </div>
                        <div className="d-flex gap-2">
                          <span className={`badge bg-opacity-10 border ${record.verificationStatus === 'Verified' ? 'bg-success text-success border-success' : 'bg-warning text-warning border-warning'}`}>
                            {record.verificationStatus || 'Pending'}
                          </span>
                          {record.photoUrl && (
                            <button className="btn btn-xs btn-outline-info p-1" onClick={(e) => { 
                              e.stopPropagation(); 
                              window.open(record.photoUrl); 
                            }}>
                              <ImageIcon size={14}/>
                            </button>
                          )}
                        </div>
                      </div>
                    )) : (
                      <div className="p-3 text-center text-muted small bg-white">No punch data recorded.</div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <ManualActionModal 
        isOpen={manualModalConfig.isOpen}
        onClose={() => setManualModalConfig({ ...manualModalConfig, isOpen: false })}
        uid={manualModalConfig.uid}
        staffName={manualModalConfig.name}
        targetDate={targetDate}
        onSuccess={fetchAndProcessData}
      />
    </div>
  );
}