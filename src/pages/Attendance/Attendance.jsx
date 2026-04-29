// src/pages/Attendance/Attendance.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

// 导入需要的 Lucide 图标
import { 
  ChevronLeft, ChevronRight, Search, RefreshCw, 
  CheckCircle, Users, CalendarDays, PieChart, List, AlertCircle 
} from 'lucide-react';

// 导入已完成的子组件
import DayView from './components/DayView';
import MonthView from './components/MonthView';
import CorrectionsTab from './components/CorrectionsTab';
import { 
  MonthlyReportModal, 
  BulkVerifyModal, 
  BulkManualActionModal 
} from './components/AttendanceModals';

export default function Attendance() {
  const { userData } = useAuth();

  // ==========================================
  // 1. 全局状态管理
  // ==========================================
  
  // 视图模式: 'day' 或 'month'
  const [viewMode, setViewMode] = useState('day');
  
  // 当前活动的 Tab: 'dashboard', 'logs', 'corrections'
  const [activeTab, setActiveTab] = useState('dashboard'); 

  // 日期与月份过滤
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [targetMonth, setTargetMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // 其他过滤器
  const [dayStatusFilter, setDayStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 待处理徽章计数 (由子组件向父组件汇报)[cite: 6]
  const [badges, setBadges] = useState({ unverified: 0, corrections: 0 });

  // 批量操作所需的考勤记录缓存[cite: 6]
  const [unverifiedRecords, setUnverifiedRecords] = useState([]); 

  // 弹窗状态统一管理[cite: 6]
  const [modals, setModals] = useState({
    report: false,
    bulkVerify: false,
    bulkManual: false
  });

  // ==========================================
  // 2. 交互处理函数
  // ==========================================

  // 切换日期的快捷按钮 (< 或 >)
  const handleChangeDate = (daysToAdd) => {
    const current = new Date(targetDate);
    current.setDate(current.getDate() + daysToAdd);
    const newDateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    setTargetDate(newDateStr);
  };

  // 强制刷新数据的触发器
  const loadData = () => {
    setIsLoading(true);
    // 这里通过简单地延迟重置 loading 状态，让依赖于 isLoading 的子组件感知到刷新
    setTimeout(() => setIsLoading(false), 500); 
  };


  // ==========================================
  // 3. 渲染主界面
  // ==========================================
  return (
    <div className="animate__animated animate__fadeIn">
      
      {/* 🌟 顶部控制台 (Control Hub) */}
      <div className="control-hub px-4 py-3 bg-white border-bottom shadow-sm mb-4 position-sticky top-0" style={{ zIndex: 1020 }}>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
          
          {/* 左侧：过滤器与搜索 */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            
            {/* View Mode 切换器 */}
            <div className="btn-group shadow-sm" role="group">
              <input type="radio" className="btn-check" id="modeDay" checked={viewMode === 'day'} onChange={() => { setViewMode('day'); setActiveTab('dashboard'); }} />
              <label className="btn btn-outline-primary fw-bold" htmlFor="modeDay">Day View</label>

              <input type="radio" className="btn-check" id="modeMonth" checked={viewMode === 'month'} onChange={() => { setViewMode('month'); setActiveTab('logs'); }} />
              <label className="btn btn-outline-primary fw-bold" htmlFor="modeMonth">Month View</label>
            </div>

            {/* Day 模式控件 */}
            {viewMode === 'day' && (
              <div className="d-flex align-items-center gap-2 animate__animated animate__fadeIn">
                <button className="btn btn-light border shadow-sm px-2" onClick={() => handleChangeDate(-1)}>
                  <ChevronLeft size={18} />
                </button>
                <input type="date" className="form-control fw-bold border-primary text-primary shadow-sm" style={{ width: '150px' }} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                <button className="btn btn-light border shadow-sm px-2" onClick={() => handleChangeDate(1)}>
                  <ChevronRight size={18} />
                </button>
                
                <select className="form-select fw-bold border-primary text-primary shadow-sm" style={{ width: '170px' }} value={dayStatusFilter} onChange={(e) => setDayStatusFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="unverified">Unverified Only</option>
                  <option value="missingOut">Missing Out</option>
                  <option value="absent">Show Absent Only</option>
                </select>
              </div>
            )}

            {/* Month 模式控件 */}
            {viewMode === 'month' && (
              <div className="d-flex align-items-center gap-2 animate__animated animate__fadeIn">
                <input type="month" className="form-control fw-bold border-primary text-primary shadow-sm" style={{ width: '160px' }} value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
              </div>
            )}

            {/* 搜索框 */}
            <div className="position-relative ms-2">
              <input type="text" className="form-control ps-5 border-primary shadow-sm" placeholder="Search staff..." style={{ width: '200px' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <Search className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" size={16} />
            </div>

            <button className="btn btn-primary ms-2 fw-bold shadow-sm" onClick={loadData} disabled={isLoading}>
              <RefreshCw size={16} className={`me-2 ${isLoading ? 'animate-spin' : ''}`} /> 
              {isLoading ? 'Loading...' : 'Load'}
            </button>
          </div>

          {/* 右侧：动作按钮 (弹窗触发器)[cite: 6] */}
          <div className="d-flex gap-2">
            {viewMode === 'day' && badges.unverified > 0 && (
              <button 
                className="btn btn-success fw-bold d-flex align-items-center gap-2 shadow-sm animate__animated animate__zoomIn"
                onClick={() => setModals({ ...modals, bulkVerify: true })}
              >
                <CheckCircle size={16} /> Bulk Verify ({badges.unverified})
              </button>
            )}

            <button 
              className="btn btn-warning text-dark fw-bold shadow-sm d-flex align-items-center gap-2"
              onClick={() => setModals({ ...modals, bulkManual: true })}
            >
              <Users size={16} /> Bulk Add
            </button>

            <button 
              className="btn btn-primary fw-bold shadow-sm d-flex align-items-center gap-2"
              onClick={() => setModals({ ...modals, report: true })}
            >
              <CalendarDays size={16} /> Monthly Report
            </button>
          </div>

        </div>
      </div>

      <div className="container-fluid px-4">
        
        {/* 🌟 页面 Tab 导航 */}
        <ul className="nav nav-tabs mb-4 border-bottom-2">
          {viewMode === 'day' && (
            <li className="nav-item">
              <button className={`nav-link fw-bold d-flex align-items-center ${activeTab === 'dashboard' ? 'active text-primary' : 'text-muted'}`} onClick={() => setActiveTab('dashboard')}><PieChart size={16} className="me-2" /> Dashboard</button>
            </li>
          )}
          
          <li className="nav-item">
            <button className={`nav-link fw-bold d-flex align-items-center ${activeTab === 'logs' ? 'active text-primary' : 'text-muted'}`} onClick={() => setActiveTab('logs')}>
              <List size={16} className="me-2" /> Detailed Records
              {badges.unverified > 0 && <span className="badge bg-warning text-dark rounded-pill ms-2">{badges.unverified}</span>}
            </button>
          </li>
          
          <li className="nav-item">
            <button className={`nav-link fw-bold d-flex align-items-center ${activeTab === 'corrections' ? 'active text-primary' : 'text-muted'}`} onClick={() => setActiveTab('corrections')}>
              <AlertCircle size={16} className="me-2" /> Corrections
              {badges.corrections > 0 && <span className="badge bg-danger rounded-pill ms-2">{badges.corrections}</span>}
            </button>
          </li>
        </ul>

        {/* 🌟 内容渲染区[cite: 6] */}
        <div className="tab-content pb-5">
          {activeTab === 'dashboard' && viewMode === 'day' && !isLoading && (
            <DayView 
              targetDate={targetDate} 
              dayStatusFilter={dayStatusFilter} 
              searchTerm={searchTerm} 
              setBadges={setBadges} 
              setUnverifiedRecords={setUnverifiedRecords} 
              forceShowLogs={false} 
            />
          )}

          {activeTab === 'logs' && viewMode === 'day' && !isLoading && (
             <DayView 
               targetDate={targetDate} 
               dayStatusFilter={dayStatusFilter} 
               searchTerm={searchTerm} 
               setBadges={setBadges}
               setUnverifiedRecords={setUnverifiedRecords}
               forceShowLogs={true} 
             />
          )}

          {activeTab === 'logs' && viewMode === 'month' && !isLoading && (
             <MonthView targetMonth={targetMonth} searchTerm={searchTerm} />
          )}

          {activeTab === 'corrections' && !isLoading && (
             <CorrectionsTab setBadges={setBadges} />
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 🌟 模态框挂载区 (Modals)[cite: 6] */}
      {/* ========================================================================= */}
      
      <MonthlyReportModal 
        isOpen={modals.report} 
        onClose={() => setModals({ ...modals, report: false })} 
      />

      <BulkVerifyModal 
        isOpen={modals.bulkVerify} 
        records={unverifiedRecords} 
        onClose={() => setModals({ ...modals, bulkVerify: false })} 
        onSuccess={loadData} 
      />

      <BulkManualActionModal 
        isOpen={modals.bulkManual} 
        onClose={() => setModals({ ...modals, bulkManual: false })} 
        onSuccess={loadData} 
      />

    </div>
  );
}