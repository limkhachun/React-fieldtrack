// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null); // 存储数据库里的详细信息(含 role)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // 1. 检查 Session 是否过期 (12小时)
        const loginTime = localStorage.getItem('adminLoginTime');
        const SESSION_DURATION = 12 * 60 * 60 * 1000;

        if (!loginTime || (Date.now() - parseInt(loginTime)) > SESSION_DURATION) {
          alert("Your session has expired. Please sign in again.");
          await signOut(auth);
          localStorage.removeItem('adminLoginTime');
          setCurrentUser(null);
          setUserData(null);
          setLoading(false);
          return;
        }

        try {
          // 2. 获取用户角色数据
          const q = query(collection(db, "users"), where("authUid", "==", user.uid));
          const querySnapshot = await getDocs(q);
          
          if (!querySnapshot.empty) {
            const data = querySnapshot.docs[0].data();
            const authorizedRoles = ['admin', 'manager'];
            
            // 3. 验证角色权限
            if (authorizedRoles.includes(data.role)) {
              setCurrentUser(user);
              setUserData(data);
            } else {
              alert("Unauthorized Access. Management privileges required.");
              await signOut(auth);
              setCurrentUser(null);
            }
          }
        } catch (error) {
          console.error("Auth Guard Error:", error);
        }
      } else {
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