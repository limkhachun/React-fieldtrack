// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // 1. 检查 Session 是否过期 (12小时)
        const loginTime = localStorage.getItem('adminLoginTime');
        const SESSION_DURATION = 12 * 60 * 60 * 1000;

        // 🚨 容错机制：如果没有 loginTime，直接补上当前时间作为 Session 起点
        if (!loginTime) {
          localStorage.setItem('adminLoginTime', Date.now().toString());
        } else if ((Date.now() - parseInt(loginTime)) > SESSION_DURATION) {
          alert("Your session has expired. Please sign in again.");
          await signOut(auth);
          localStorage.removeItem('adminLoginTime');
          setCurrentUser(null);
          setUserData(null);
          setLoading(false);
          return;
        }

        try {
          let data = null;

          // 2. 获取用户角色数据
          // 先尝试将 Firebase Auth UID 作为 Document ID 去获取文档
          const userDocRef = doc(db, "users", user.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            data = userDocSnap.data();
          } else {
            // 如果找不到，再通过 `authUid` 字段去查询集合
            const q = query(collection(db, "users"), where("authUid", "==", user.uid));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
              data = querySnapshot.docs[0].data();
            }
          }

          // 如果成功获取到了用户数据
          if (data) {
            // 转换为小写并去除空格，防止数据库中出现 "Manager" 或 "manager " 导致判断失败
            const userRole = (data.role || '').toLowerCase().trim();
            const authorizedRoles = ['admin', 'manager'];
            
            // 3. 验证角色权限
            if (authorizedRoles.includes(userRole)) {
              data.role = userRole; // 存入清洗后的 role
              setCurrentUser(user);
              setUserData(data);
            } else {
              alert(`Unauthorized Access. Your role is '${data.role}'. Management privileges required.`);
              await signOut(auth);
              setCurrentUser(null);
            }
          } else {
            // 数据库中完全找不到该账号的 Firestore 数据
            alert("Account not found in the database. Please contact support.");
            await signOut(auth);
            setCurrentUser(null);
          }
        } catch (error) {
          console.error("Auth Guard Error:", error);
          alert("An error occurred during authorization.");
          await signOut(auth);
          setCurrentUser(null);
        }
      } else {
        // 用户未登录
        setCurrentUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading }}>
      {/* 只有在非 loading 状态下才渲染子组件，避免页面闪烁 */}
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}