// src/pages/Attendance/components/MonthView.jsx
import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { ChevronDown, CalendarDays, HelpCircle } from 'lucide-react';

export default function MonthView({ targetMonth, searchTerm }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthData, setMonthData] = useState([]);

  // 获取今天的日期字符串，用于判断某天是否已过去 (未来的日期不算缺勤)
  const getLocalTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchMonthData = async () => {
      setLoading(true);
      setError(null);

      try {
        const currentTodayStr = getLocalTodayStr();
        const searchLower = searchTerm.toLowerCase().trim();
        
        // 计算目标月份的开始和结束日期
        const [year, month] = targetMonth.split('-');
        const daysInMonth = new Date(year, month, 0).getDate();
        const startDate = `${targetMonth}-01`;
        const endDate = `${targetMonth}-${daysInMonth}`;

        // 并行拉取整月的数据
        const [usersSnap, attSnap, schedSnap, leaveSnap, holSnap] = await Promise.all([
          getDocs(query(collection(db, "users"))),
          getDocs(query(collection(db, "attendance"), where("date", ">=", startDate), where("date", "<=", endDate))),
          getDocs(query(collection(db, "schedules"), where("date", ">=", startDate), where("date", "<=", endDate))),
          getDocs(query(collection(db, "leaves"), where("status", "==", "Approved"), where("endDate", ">=", startDate))),
          getDoc(doc(db, "settings", "holidays"))
        ]);

        // 1. 公共假期字典
        const holidaysMap = {};
        if (holSnap.exists() && holSnap.data().holiday_list) {
          holSnap.data().holiday_list.forEach(h => { holidaysMap[h.date] = h.name; });
        }

        // 2. 员工字典
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
              empCode: d.personal?.empCode || d.empCode || "-",
              docId: docId,
              authUid: d.authUid
            };
          }
        });

        // 3. 考勤数据字典 (只看验证通过的)
        const attendanceMap = {};
        attSnap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.verificationStatus === 'Verified') {
            const eUid = docIdToAuthMap[d.uid] || d.uid;
            if (!attendanceMap[`${eUid}_${d.date}`]) {
              attendanceMap[`${eUid}_${d.date}`] = [];
            }
            attendanceMap[`${eUid}_${d.date}`].push(d);
          }
        });

        // 4. 排班字典
        const scheduleMap = {};
        schedSnap.forEach(docSnap => {
          const d = docSnap.data();
          const eUid = docIdToAuthMap[d.userId] || d.userId;
          scheduleMap[`${eUid}_${d.date}`] = d;
        });

        // 5. 请假字典
        const leaveMap = {};
        leaveSnap.forEach(docSnap => {
          const data = docSnap.data();
          if (!data.startDate || !data.endDate) return;
          const eUid = data.authUid || docIdToAuthMap[data.uid] || data.uid;
          
          let curr = new Date(data.startDate);
          const endD = new Date(data.endDate);
          while(curr <= endD) {
            const dStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
            if (dStr >= startDate && dStr <= endDate) {
              leaveMap[`${eUid}_${dStr}`] = data;
            }
            curr.setDate(curr.getDate() + 1);
          }
        });

        // ==================================
        // 核心月度计算逻辑
        // ==================================
        const processedData = [];

        Object.keys(usersMap).forEach(uid => {
          const user = usersMap[uid];

          // 搜索过滤
          if (searchLower && !user.name.toLowerCase().includes(searchLower) && !user.empCode.toLowerCase().includes(searchLower)) {
            return;
          }

          let presentCount = 0;
          let scheduledCount = 0;
          const dailyRecords = []; // 存储该员工这一个月的每一天记录

          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${month}-${String(d).padStart(2, '0')}`;
            const sched = scheduleMap[`${uid}_${dateStr}`];
            const dayAtts = attendanceMap[`${uid}_${dateStr}`] || [];
            
            let leaveObj = leaveMap[`${uid}_${dateStr}`];
            let leaveType = leaveObj ? leaveObj.type : null;
            let duration = leaveObj?.duration || 'Full Day';
            
            const isPH = !!holidaysMap[dateStr] && !!sched;
            if (isPH) leaveType = null;

            if (sched) scheduledCount++;

            let hasIn = false;
            let hasOut = false;
            dayAtts.forEach(r => {
              if (r.session === 'Clock In') hasIn = true;
              if (r.session === 'Clock Out') hasOut = true;
            });

            // 统计出勤天数 (包含病假和年假算作带薪出勤)
            const isML = leaveType && (leaveType.includes('Medical') || leaveType.includes('病假'));
            const isAL = leaveType && (leaveType.includes('Annual') || leaveType.includes('年假'));
            const isHalfDay = duration !== 'Full Day';

            if (hasIn || isPH) {
              presentCount += 1;
            } else if (isML || isAL) {
              presentCount += isHalfDay ? 0.5 : 1;
            }

            // 生成每日状态 UI
            if (dayAtts.length > 0 || sched || leaveType || isPH) {
              let statusHtml = '';

              if (isPH && !hasIn) {
                statusHtml = <span className="badge bg-warning text-dark border border-warning-subtle">PUBLIC HOLIDAY</span>;
              } else if (isPH && hasIn) {
                statusHtml = <span><b>Worked</b> <span className="text-warning small fw-bold">(3x PH)</span></span>;
              } else if (hasIn && !hasOut && dateStr < currentTodayStr) {
                statusHtml = <span className="text-danger fw-bold">MISSING OUT</span>;
              } else if (hasIn && leaveType) {
                let lText = leaveType.toUpperCase();
                if (isHalfDay) lText += ` (${duration.replace('Half Day ', '')})`;
                statusHtml = <span><b>Verified Present</b> <span className="text-info small fw-bold ms-1">+ {lText}</span></span>;
              } else if (hasIn) {
                statusHtml = <b>Verified Present</b>;
              } else if (leaveType && !hasIn) {
                let lText = leaveType.toUpperCase();
                if (isHalfDay) lText += ` (${duration.replace('Half Day ', '')})`;
                if (isHalfDay && sched) {
                  statusHtml = <span><span className="text-danger fw-bold me-2">ABSENT</span> <span className="text-info fw-bold">{lText}</span></span>;
                } else {
                  statusHtml = <span className="text-info fw-bold">{lText}</span>;
                }
              } else if (dateStr <= currentTodayStr && sched) {
                statusHtml = <span className="text-danger fw-bold">ABSENT</span>;
              } else {
                statusHtml = <span className="text-muted small">Off</span>;
              }

              dailyRecords.push({
                date: dateStr,
                statusNode: statusHtml
              });
            }
          }

          processedData.push({
            uid: uid,
            name: user.name,
            empCode: user.empCode,
            photo: user.photo,
            presentDays: presentCount,
            scheduledDays: scheduledCount,
            dailyLogs: dailyRecords.reverse() // 倒序，最新的日期在上面
          });
        });

        // 排序
        processedData.sort((a, b) => a.name.localeCompare(b.name));

        if (isMounted) {
          setMonthData(processedData);
          setLoading(false);
        }

      } catch (err) {
        console.error("Fetch Month Data Error:", err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchMonthData();
    return () => { isMounted = false; };
  }, [targetMonth, searchTerm]);

  if (loading) {
    return (
      <div className="text-center py-5 my-5">
        <div className="spinner-border text-primary" role="status" style={{ width: '3rem', height: '3rem' }}></div>
        <p className="text-muted mt-3 fw-bold">Compiling monthly data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger mx-2 shadow-sm d-flex align-items-center">
         <HelpCircle className="me-2"/> Error loading data: {error}
      </div>
    );
  }

  return (
    <div className="animate__animated animate__fadeIn">
      <div className="d-flex flex-column gap-3 pb-5">
        <h5 className="fw-bold text-dark mb-0 d-flex align-items-center">
          <CalendarDays size={20} className="me-2 text-primary" /> Monthly Summary ({targetMonth})
        </h5>
        
        {monthData.length === 0 ? (
          <div className="text-center py-5 text-muted fw-bold bg-white rounded shadow-sm border">No active staff found for this month.</div>
        ) : (
          monthData.map((staff) => (
            <div key={staff.uid} className="card border-0 shadow-sm overflow-hidden">
              
              {/* 员工卡片 Header */}
              <div 
                className="card-body p-3 cursor-pointer" 
                data-bs-toggle="collapse" 
                data-bs-target={`#collapse-month-${staff.uid}`}
              >
                <div className="row align-items-center">
                  
                  {/* 员工信息 */}
                  <div className="col-md-5 d-flex align-items-center gap-3">
                    {staff.photo ? (
                      <img src={staff.photo} alt="Avatar" className="rounded-circle" style={{ width: '45px', height: '45px', objectFit: 'cover' }} />
                    ) : (
                      <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold" style={{ width: '45px', height: '45px' }}>
                        {staff.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h6 className="fw-bold text-dark m-0">{staff.name}</h6>
                      <div className="d-flex align-items-center mt-1">
                        <span className="badge bg-light text-secondary border px-1 py-0 me-2" style={{ fontSize: '0.65rem' }}>{staff.empCode}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 出勤天数统计 */}
                  <div className="col-md-6 text-center">
                    <div className="text-muted small fw-bold" style={{ fontSize: '0.65rem' }}>DAYS PRESENT / SCHEDULED</div>
                    <div className="fw-bold fs-5 text-dark">
                      <span className={staff.presentDays < staff.scheduledDays ? 'text-danger' : 'text-success'}>
                        {staff.presentDays}
                      </span> 
                      <span className="text-muted mx-1">/</span> 
                      {staff.scheduledDays}
                    </div>
                  </div>
                  
                  {/* 展开箭头 */}
                  <div className="col-md-1 text-end">
                    <ChevronDown size={18} className="text-muted" />
                  </div>
                  
                </div>
              </div>
              
              {/* 展开的每日明细列表 */}
              <div id={`collapse-month-${staff.uid}`} className="collapse">
                <ul className="list-group list-group-flush border-top">
                  {staff.dailyLogs.length > 0 ? (
                    staff.dailyLogs.map((log, idx) => (
                      <li key={idx} className="list-group-item d-flex justify-content-between align-items-center px-4 py-2 bg-light">
                        <div><span className="badge bg-secondary bg-opacity-10 text-secondary border font-monospace">{log.date}</span></div>
                        <div className="text-end">{log.statusNode}</div>
                      </li>
                    ))
                  ) : (
                    <li className="list-group-item text-center text-muted small py-3 fw-bold bg-light">No schedules or records for this month.</li>
                  )}
                </ul>
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}