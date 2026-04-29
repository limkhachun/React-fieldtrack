// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { currentUser, userData } = useAuth();

  // 如果没有用户，或者用户没有权限，重定向到登录页
  if (!currentUser || !userData) {
    return <Navigate to="/login" replace />;
  }

  // 验证通过，渲染原本的页面组件
  return children;
}