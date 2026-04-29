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
            
            <Route path="attendance" element={
              <div className="container py-5 text-center text-muted">
                <h3>Attendance Records Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="leave" element={
              <div className="container py-5 text-center text-muted">
                <h3>Leave Approval Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="schedules" element={
              <div className="container py-5 text-center text-muted">
                <h3>Schedule Planner Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="payroll" element={
              <div className="container py-5 text-center text-muted">
                <h3>Payroll Management Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="daily-tasks" element={
              <div className="container py-5 text-center text-muted">
                <h3>Daily Tasks Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="map" element={
              <div className="container py-5 text-center text-muted">
                <h3>Live Tracking Map Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />
            
            <Route path="gallery" element={
              <div className="container py-5 text-center text-muted">
                <h3>Evidence Gallery Page</h3>
                <p>正在迁移中...</p>
              </div>
            } />

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