// src/components/layout/MainLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function MainLayout() {
  return (
    <div className="min-vh-100 bg-main d-flex flex-column">
      {/* 顶部导航永远固定在这里 */}
      <Header />
      
      {/* 主内容区域，这里的 Outlet 会根据网址自动变成 Home 或 Staff 页面 */}
      <main className="flex-grow-1 position-relative">
        <Outlet />
      </main>
    </div>
  );
}