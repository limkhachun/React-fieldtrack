// src/pages/HolidayManager/HolidayManager.jsx
import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, CalendarHeart, Plus, Calendar, Trash2 } from 'lucide-react';

// 🚨 导入审计日志记录函数
import { logAdminAction } from '../../utils/utils';

export default function HolidayManager() {
  const { currentUser } = useAuth();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', date: '' });

  const holidayDocRef = doc(db, "settings", "holidays");

  useEffect(() => {
    loadHolidays();
  }, []);

  const loadHolidays = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(holidayDocRef);
      if (docSnap.exists()) {
        const list = docSnap.data().holiday_list || [];
        // 按日期排序
        setHolidays(list.sort((a, b) => a.date.localeCompare(b.date)));
      } else {
        setHolidays([]);
      }
    } catch (e) {
      alert(`Error loading holidays: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHoliday = async () => {
    const { name, date } = formData;
    if (!name.trim() || !date) return alert("Please enter a name and date.");

    setLoading(true);
    try {
      const holidayObj = { name: name.trim(), date };
      const docSnap = await getDoc(holidayDocRef);

      if (!docSnap.exists()) {
        await setDoc(holidayDocRef, { holiday_list: [holidayObj] });
      } else {
        await updateDoc(holidayDocRef, { holiday_list: arrayUnion(holidayObj) });
      }

      // 🚨 记录添加假期的审计日志
      await logAdminAction(db, currentUser, "ADD_HOLIDAY", "GLOBAL", null, holidayObj);

      setFormData({ name: '', date: '' });
      await loadHolidays();
      alert("Holiday saved successfully!");
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHoliday = async (holidayObj) => {
    if (!window.confirm(`Remove ${holidayObj.name}?`)) return;

    setLoading(true);
    try {
      await updateDoc(holidayDocRef, { holiday_list: arrayRemove(holidayObj) });

      // 🚨 记录删除假期的审计日志
      await logAdminAction(db, currentUser, "REMOVE_HOLIDAY", "GLOBAL", holidayObj, null);

      await loadHolidays();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-4 animate__animated animate__fadeIn" style={{ maxWidth: '600px' }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="fw-bold m-0 text-dark">Holiday Manager</h5>
        <button className="btn btn-sm btn-outline-secondary fw-bold d-flex align-items-center" onClick={() => window.history.back()}>
          <ArrowLeft size={16} className="me-1" /> Back to Schedule
        </button>
      </div>

      <div className="card mb-4 shadow-sm border-0 rounded-4">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-3 text-dark">Add New Holiday</h6>
          <div className="mb-3">
            <label className="form-label small fw-bold text-muted">Holiday Name</label>
            <input 
              type="text" 
              className="form-control border-primary text-primary fw-bold" 
              placeholder="e.g. Labour Day"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-bold text-muted">Date</label>
            <input 
              type="date" 
              className="form-control border-primary fw-bold text-dark"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <button className="btn btn-primary w-100 fw-bold shadow-sm" onClick={handleAddHoliday} disabled={loading}>
            {loading ? 'Processing...' : <><Plus size={16} className="me-1 d-inline"/> Add to Calendar</>}
          </button>
        </div>
      </div>

      <div className="card shadow-sm border-0 rounded-4">
        <div className="card-header bg-white py-3 border-bottom border-light">
          <h6 className="fw-bold m-0 text-primary d-flex align-items-center">
            <CalendarHeart size={18} className="me-2" /> Active Holiday List
          </h6>
        </div>
        <div className="card-body p-0">
          <div className="list-group list-group-flush">
            {loading && holidays.length === 0 ? (
              <div className="text-center text-muted py-4 small">Loading...</div>
            ) : holidays.length === 0 ? (
              <div className="text-center text-muted py-4 small">No holidays configured yet.</div>
            ) : (
              holidays.map((h, idx) => (
                <div key={idx} className="list-group-item d-flex justify-content-between align-items-center p-3">
                  <div>
                    <div className="fw-bold text-dark">{h.name}</div>
                    <div className="text-muted small d-flex align-items-center">
                      <Calendar size={12} className="me-1" /> {h.date}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-outline-danger border-0" onClick={() => handleDeleteHoliday(h)} disabled={loading}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}