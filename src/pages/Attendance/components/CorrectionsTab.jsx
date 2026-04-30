// src/pages/Attendance/components/CorrectionsTab.jsx
import React, { useState, useEffect } from 'react';
import { 
  collection, query, where, onSnapshot, doc, getDoc, 
  updateDoc, writeBatch, serverTimestamp, getDocs, Timestamp 
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../context/AuthContext';
import { Check, X, Image as ImageIcon, AlertCircle } from 'lucide-react';

// 🚨 导入审计日志记录函数
import { logAdminAction } from '../../../utils/utils';

export default function CorrectionsTab({ setBadges }) {
  const { currentUser } = useAuth();
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "attendance_corrections"), where("status", "==", "Pending"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const reqs = [];
      snap.forEach(docSnap => {
        reqs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCorrections(reqs);
      
      if (setBadges) {
        setBadges(prev => ({ ...prev, corrections: reqs.length }));
      }
      setLoading(false);
    }, (err) => {
      console.error("Corrections listener error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setBadges]);

  const handleDecision = async (reqData, decision) => {
    if (!window.confirm(`Confirm ${decision} this correction request?`)) return;
    
    setActionLoading(true);
    try {
      const correctionRef = doc(db, "attendance_corrections", reqData.id);
      
      if (decision === 'approve') {
        const batch = writeBatch(db);
        
        batch.update(correctionRef, { 
          status: "Approved", 
          reviewedAt: serverTimestamp(), 
          reviewer: currentUser.email 
        });
        
        const q = query(collection(db, "attendance"), where("uid", "==", reqData.uid), where("date", "==", reqData.targetDate));
        const oldAttSnap = await getDocs(q);
        
        oldAttSnap.forEach(d => {
            const sessionType = d.data().session;
            if (sessionType === 'Clock In' || sessionType === 'Clock Out') {
                batch.update(d.ref, { verificationStatus: "Archived" });
            }
        });

        const baseRecord = {
            uid: reqData.uid,
            name: reqData.empName || reqData.email?.split('@')[0] || "Unknown Staff",
            email: reqData.email || "",
            date: reqData.targetDate,
            verificationStatus: "Verified", 
            address: "Approved Correction Request",
        };

        if (reqData.requestedIn && reqData.requestedIn !== '--:--' && reqData.requestedIn !== '-') {
            const preciseInDate = new Date(`${reqData.targetDate}T${reqData.requestedIn}:00`);
            const inRef = doc(collection(db, "attendance"));
            batch.set(inRef, { 
              ...baseRecord, 
              session: "Clock In", 
              timestamp: Timestamp.fromDate(preciseInDate) 
            });
        }

        if (reqData.requestedOut && reqData.requestedOut !== '--:--' && reqData.requestedOut !== '-') {
            const preciseOutDate = new Date(`${reqData.targetDate}T${reqData.requestedOut}:00`);
            const outRef = doc(collection(db, "attendance"));
            batch.set(outRef, { 
              ...baseRecord, 
              session: "Clock Out", 
              timestamp: Timestamp.fromDate(preciseOutDate) 
            });
        }

        await batch.commit();

        // 🚨 记录审批通过日志
        await logAdminAction(db, currentUser, "CORRECTION_APPROVE", reqData.uid, null, reqData);

        alert('Correction approved and attendance updated successfully.');

      } else {
        await updateDoc(correctionRef, { 
          status: "Rejected", 
          reviewedAt: serverTimestamp(), 
          reviewer: currentUser.email 
        });

        // 🚨 记录审批拒绝日志
        await logAdminAction(db, currentUser, "CORRECTION_REJECT", reqData.uid, null, reqData);

        alert('Correction request rejected.');
      }
    } catch (e) {
      console.error(e);
      alert(`Error: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5 my-5">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  return (
    <div className="animate__animated animate__fadeIn">
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
        <div className="card-header bg-white py-3 fw-bold text-dark border-bottom d-flex align-items-center">
          <AlertCircle size={18} className="me-2 text-danger" /> Pending Corrections
        </div>
        
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="bg-light text-secondary small fw-bold">
              <tr>
                <th className="ps-4">Staff Name</th>
                <th>Target Date</th>
                <th>Original Time</th>
                <th>Requested Time</th>
                <th>Remarks</th>
                <th className="text-center">Evidence</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5 text-muted fw-bold bg-white">
                    No pending corrections.
                  </td>
                </tr>
              ) : (
                corrections.map(req => (
                  <tr key={req.id}>
                    <td className="ps-4 fw-bold text-dark">
                      {req.empName || req.email?.split('@')[0] || 'Unknown'}
                      <div className="text-muted small fw-normal">{req.email}</div>
                    </td>
                    <td>
                      <span className="badge bg-light text-secondary border">{req.targetDate}</span>
                    </td>
                    <td className="text-muted font-monospace small">
                      <div>IN: {req.originalIn || '--:--'}</div>
                      <div>OUT: {req.originalOut || '--:--'}</div>
                    </td>
                    <td className="text-primary fw-bold font-monospace small">
                      <div>IN: {req.requestedIn || '--:--'}</div>
                      <div>OUT: {req.requestedOut || '--:--'}</div>
                    </td>
                    <td>
                      <div className="text-truncate text-muted small" style={{ maxWidth: '200px' }} title={req.remarks || ''}>
                        {req.remarks || '-'}
                      </div>
                    </td>
                    <td className="text-center">
                      {req.attachmentUrl ? (
                        <a href={req.attachmentUrl} target="_blank" rel="noreferrer" className="d-inline-block">
                          <img 
                            src={req.attachmentUrl} 
                            alt="Evidence" 
                            className="rounded border shadow-sm" 
                            style={{ width: '40px', height: '40px', objectFit: 'cover' }} 
                          />
                        </a>
                      ) : (
                        <span className="text-muted small d-flex align-items-center justify-content-center">
                          <ImageIcon size={14} className="me-1 opacity-50"/> None
                        </span>
                      )}
                    </td>
                    <td className="text-end pe-4">
                      <button 
                        className="btn btn-sm btn-success me-2 shadow-sm" 
                        disabled={actionLoading}
                        onClick={() => handleDecision(req, 'approve')}
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        className="btn btn-sm btn-danger shadow-sm" 
                        disabled={actionLoading}
                        onClick={() => handleDecision(req, 'reject')}
                      >
                        <X size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}