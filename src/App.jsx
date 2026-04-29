// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// 🟢 导入全局权限管理
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// 🟢 导入布局组件
import MainLayout from './components/layout/MainLayout';

// 🟢 导入已迁移的页面级组件
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import StaffList from './pages/Staff/StaffList';
import StaffForm from './pages/Staff/StaffForm';
import Attendance from './pages/Attendance/Attendance';
import DailyTasks from './pages/DailyTasks/DailyTasks';
import LeaveAprroval from './pages/LeaveApproval/LeaveApproval';
import EvidenceGallery from './pages/EvidenceGallery/EvidenceGallery';
import SchedulePlanner from './pages/SchedulePlanner/SchedulePlanner';
/*

import PayrollManagement from './pages/PayrollManagement/PayrollManagement';
import LiveTrackingMap from './pages/LiveTrackingMap/LiveTrackingMap';
import AdminManagement from './pages/AdminManagement/AdminManagement';
*/
function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* 1. 公开路由：登录页面 */}
          <Route path="/login" element={<Login />} />

          {/* 2. 受保护的私有路由组：必须登录后才能访问 */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* 当访问 "/" 时，默认显示 Dashboard */}
            <Route index element={<Dashboard />} />

            {/* 🟢 员工管理模块 (已迁移完成) */}
            <Route path="staff" element={<StaffList />} />
            {/* 动态路由：既能匹配 /staff/new，也能匹配 /staff/EMPL-001 */}
            <Route path="staff/:id" element={<StaffForm />} />
            
            {/* --- 以下为其他子页面占位，路由与 Header 的 Link 一一对应 --- */}
            
            <Route path="attendance" element={<Attendance />} />
            
            <Route path="leave" element={<LeaveAprroval />} />  
             
            
            <Route path="schedules" element={<SchedulePlanner />} />
            
            <Route path="payroll" element={
              <div className="container py-5 text-center text-muted">
                <h3>Payroll Management Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="daily-tasks" element={<DailyTasks />} />
            
            <Route path="map" element={
              <div className="container py-5 text-center text-muted">
                <h3>Live Tracking Map Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="gallery" element={<EvidenceGallery />} />

            {/* 权限管理页面 (仅 Admin 可见) */}
            <Route path="manage-admins" element={
              <div className="container py-5 text-center text-muted">
                <h3>Admin Accounts Management</h3>
                <p>正在迁移中...</p>
              </div>
            } />
          </Route>

          {/* 3. 兜底路由：如果输入了未定义的地址，自动重定向到首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;