// src/pages/LeaveApproval/components/LeaveModals.jsx
import React, { useState, useEffect } from 'react';
import { 
  collection, doc, updateDoc, serverTimestamp, 
  runTransaction, getDoc 
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../services/firebase';
import { useAuth } from '../../../context/AuthContext';
import { Paperclip, XCircle, PlusCircle, Edit, Info, ExternalLink } from 'lucide-react';

// 🚨 导入审计日志记录函数
import { logAdminAction } from '../../../utils/utils';

// ==========================================
// 1. Attachment Viewer Modal (附件预览)
// ==========================================
export function AttachmentModal({ isOpen, url, fileType, onClose }) {
  if (!isOpen) return null;

  const isPdf = fileType?.toLowerCase() === 'pdf' || url?.toLowerCase().includes('.pdf?alt=media');

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-dark text-white border-0">
              <h6 className="modal-title fw-bold"><Paperclip size={16} className="me-2 d-inline" />Attachment Viewer</h6>
              <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
            </div>
            <div className="modal-body p-0 text-center bg-light">
              {!url ? (
                <div className="py-5 text-muted">No preview available.</div>
              ) : isPdf ? (
                <>
                  <iframe src={url} style={{ width: '100%', height: '60vh', border: 'none' }} title="PDF Preview" />
                  <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary mt-3 mb-2 fw-bold d-inline-block px-4">
                    <ExternalLink size={16} className="me-2 d-inline" />Open PDF in New Tab
                  </a>
                </>
              ) : (
                <img src={url} alt="Attachment" className="img-fluid" style={{ maxHeight: '70vh' }} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==========================================
// 2. Reject Leave Modal (拒绝假单)
// ==========================================
export function RejectModal({ isOpen, leaveId, uid, onClose }) {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleReject = async () => {
    if (!reason.trim()) return alert("Please provide a reason for rejection.");
    
    setLoading(true);
    try {
      // 1. 更新数据库状态
      await updateDoc(doc(db, "leaves", leaveId), {
        status: 'Rejected',
        rejectionReason: reason,
        reviewedAt: serverTimestamp(),
        reviewer: currentUser.email
      });

      // 2. 写入审计日志
      await logAdminAction(db, currentUser, "REJECT_LEAVE", uid, { leaveId: leaveId }, { reason: reason });

      alert('Leave request rejected.');
      setReason('');
      onClose();
    } catch (e) {
      alert(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-sm">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-danger bg-opacity-10 border-0">
              <h6 className="modal-title fw-bold text-danger"><XCircle size={16} className="me-2 d-inline"/>Reject Leave</h6>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-4">
              <label className="form-label small fw-bold text-dark">Reason for Rejection</label>
              <textarea 
                className="form-control border-danger" 
                rows="3" 
                placeholder="Please state the reason..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="modal-footer bg-light border-0">
              <button className="btn btn-light fw-bold" onClick={onClose}>Cancel</button>
              <button className="btn btn-danger fw-bold shadow-sm" onClick={handleReject} disabled={loading}>
                {loading ? 'Processing...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ==========================================
// 3. Edit Status Modal (修改已审批假单的状态)
// ==========================================
export function EditStatusModal({ isOpen, leaveId, uid, currentStatus, initialReason, onClose }) {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState(initialReason || '');
  const [loading, setLoading] = useState(false);

  // 当弹窗打开时，同步初始状态
  useEffect(() => {
    if (isOpen) {
      setStatus(currentStatus);
      setReason(initialReason || '');
    }
  }, [isOpen, currentStatus, initialReason]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (status === currentStatus) return onClose(); // 状态未改变直接关闭
    if (status === 'Rejected' && !reason.trim()) return alert("Please provide a rejection reason.");

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const leaveRef = doc(db, "leaves", leaveId);
        const leaveSnap = await transaction.get(leaveRef);
        const leaveData = leaveSnap.data();
        
        const isAnnual = (leaveData.type === 'Annual Leave' || leaveData.type === '年假');
        let actualDeductibleDays = leaveData.deductibleDays !== undefined ? leaveData.deductibleDays : leaveData.days;

        // 状态反转的年假余额退还/扣除逻辑
        if (leaveData.status === 'Approved' && status !== 'Approved' && isAnnual) {
            // 如果原本是批准，现在改为拒绝或待定，退还年假
            const userRef = doc(db, "users", uid);
            const userDoc = await transaction.get(userRef);
            const currentBal = userDoc.data().leave_balance?.annual || 0;
            transaction.update(userRef, { "leave_balance.annual": currentBal + actualDeductibleDays });
        } else if (leaveData.status !== 'Approved' && status === 'Approved' && isAnnual) {
            // 如果原本是拒绝或待定，现在改为批准，扣除年假
            const userRef = doc(db, "users", uid);
            const userDoc = await transaction.get(userRef);
            const currentBal = userDoc.data().leave_balance?.annual || 0;
            if (currentBal < actualDeductibleDays) throw new Error("Insufficient Balance for this reversal!");
            transaction.update(userRef, { "leave_balance.annual": currentBal - actualDeductibleDays });
        }

        let updatePayload = {
            status: status,
            reviewedAt: serverTimestamp(),
            reviewer: currentUser.email,
        };
        
        if (status === 'Rejected') {
            updatePayload.rejectionReason = reason;
        }

        transaction.update(leaveRef, updatePayload);

        // 写入状态修改的审计日志
        logAdminAction(db, currentUser, "EDIT_LEAVE_STATUS", uid, { oldStatus: leaveData.status }, updatePayload);
      });

      alert('Status updated successfully.');
      onClose();
    } catch (e) {
      alert(`Failed to update: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-sm">
          <div className="modal-content border-0 shadow">
            <div className="modal-header border-0">
              <h6 className="modal-title fw-bold text-dark"><Edit size={16} className="me-2 d-inline"/>Change Decision</h6>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-3">
              <div className="mb-3">
                <label className="form-label small fw-bold text-dark">New Status</label>
                <select className="form-select fw-bold" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="Approved">Approve</option>
                  <option value="Rejected">Reject</option>
                  <option value="Pending">Revert to Pending</option>
                </select>
              </div>
              {status === 'Rejected' && (
                <div className="animate__animated animate__fadeIn">
                  <label className="form-label small fw-bold text-dark">Reason (if Rejected)</label>
                  <textarea className="form-control" rows="2" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-light btn-sm fw-bold" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm fw-bold px-4" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// 4. Add Leave Manually Modal (管理员手工代请假)
// ============================================================================
export function AddLeaveModal({ isOpen, usersMap, holidaysMap, onClose }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    staffId: '',
    type: 'Annual Leave',
    start: '',
    end: '',
    duration: 'Full Day',
    reason: '',
    file: null
  });

  if (!isOpen) return null;

  const usersList = Object.values(usersMap).sort((a, b) => a.name.localeCompare(b.name));
  
  // 检查是否为同一天，决定是否显示半天假选项
  const isSingleDay = formData.start && formData.end && formData.start === formData.end;

  const handleSubmit = async () => {
    if (!formData.staffId || !formData.start || !formData.end) {
      return alert("Please fill in all required fields.");
    }
    
    const sDate = new Date(formData.start);
    const eDate = new Date(formData.end);
    if (eDate < sDate) {
      return alert("End date cannot be earlier than start date.");
    }

    // 计算请假天数
    let days = Math.round((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
    if (isSingleDay && formData.duration !== 'Full Day') {
        days = 0.5;
    }

    const selectedUser = usersMap[formData.staffId];
    if (!window.confirm(`Add ${days} day(s) of ${formData.type} for ${selectedUser.name}?`)) return;

    setLoading(true);

    try {
      let attachmentUrl = null;
      let fileType = null;

      // 1. 若有附件则先上传
      if (formData.file) {
        const ext = formData.file.name.split('.').pop().toLowerCase();
        const targetUid = selectedUser.authUid || formData.staffId;
        const fileName = `${Date.now()}_${targetUid}.${ext}`;
        const fileRef = storageRef(storage, `leave_attachments/${targetUid}/${fileName}`);
        
        await uploadBytes(fileRef, formData.file);
        attachmentUrl = await getDownloadURL(fileRef);
        fileType = ext;
      }

      // 2. 计算公共假期重叠天数 (简化计算，基于 holidaysMap)
      let phOverlap = 0;
      let curr = new Date(sDate);
      while (curr <= eDate) {
          const dateStr = curr.toISOString().split('T')[0];
          if (holidaysMap[dateStr]) phOverlap++;
          curr.setDate(curr.getDate() + 1);
      }
      const actualDeductibleDays = Math.max(0, days - phOverlap);

      // 3. 事务处理
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", formData.staffId);
        const userDoc = await transaction.get(userRef);
        
        let oldBalance = 0;
        if (formData.type === 'Annual Leave' && actualDeductibleDays > 0) {
            oldBalance = userDoc.data().leave_balance?.annual || 0;
            if (oldBalance < actualDeductibleDays) {
                throw new Error(`Insufficient Annual Leave Balance! Current: ${oldBalance}, Required: ${actualDeductibleDays}`);
            }
            transaction.update(userRef, { "leave_balance.annual": oldBalance - actualDeductibleDays });
        }

        const newLeaveRef = doc(collection(db, "leaves"));
        const leaveData = {
            uid: formData.staffId,
            authUid: selectedUser.authUid,
            empName: selectedUser.name,
            email: selectedUser.email,
            type: formData.type,
            startDate: formData.start,
            endDate: formData.end,
            days: days,
            duration: formData.duration,
            deductibleDays: actualDeductibleDays, 
            phOverlap: phOverlap, 
            reason: formData.reason || "Added by Admin",
            status: 'Approved',
            appliedAt: serverTimestamp(),
            reviewedAt: serverTimestamp(),
            reviewer: currentUser.email,
            isPayrollDeductible: (formData.type === 'Unpaid Leave')
        };

        if (attachmentUrl) {
            leaveData.attachmentUrl = attachmentUrl;
            leaveData.fileType = fileType;
        }
        
        transaction.set(newLeaveRef, leaveData);

        // 写入手工添加假单的审计日志
        logAdminAction(db, currentUser, "MANUAL_ADD_LEAVE", formData.staffId, 
            { oldBalance: oldBalance }, 
            leaveData
        );
      });

      let msg = 'Leave manually added and approved successfully.';
      if (phOverlap > 0) msg += `\n(Overlapped with ${phOverlap} Public Holiday(s), deduction reduced.)`;
      alert(msg);
      
      // 清空表单
      setFormData({ staffId: '', type: 'Annual Leave', start: '', end: '', duration: 'Full Day', reason: '', file: null });
      onClose();
    } catch (e) {
      alert(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop fade show"></div>
      <div className="modal fade show d-block" tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content border-0 shadow">
            <div className="modal-header bg-success bg-opacity-10 border-0">
              <h6 className="modal-title fw-bold text-success"><PlusCircle size={16} className="me-2 d-inline"/>Add Leave Manually</h6>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body p-4">
              <div className="mb-3">
                <label className="form-label small fw-bold text-dark">Employee</label>
                <select className="form-select border-success fw-bold" value={formData.staffId} onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}>
                  <option value="">-- Select Employee --</option>
                  {usersList.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label small fw-bold text-dark">Leave Type</label>
                <select className="form-select border-success fw-bold" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Medical Leave">Medical Leave</option>
                  <option value="Unpaid Leave">Unpaid Leave</option>
                </select>
              </div>
              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="small fw-bold text-dark">Start Date</label>
                  <input type="date" className="form-control border-success" value={formData.start} onChange={(e) => setFormData({ ...formData, start: e.target.value, duration: (e.target.value === formData.end) ? formData.duration : 'Full Day' })} />
                </div>
                <div className="col-6">
                  <label className="small fw-bold text-dark">End Date</label>
                  <input type="date" className="form-control border-success" value={formData.end} onChange={(e) => setFormData({ ...formData, end: e.target.value, duration: (formData.start === e.target.value) ? formData.duration : 'Full Day' })} />
                </div>
              </div>

              {isSingleDay && (
                <div className="mb-3 animate__animated animate__fadeIn">
                  <label className="form-label small fw-bold text-dark">Duration (时长)</label>
                  <select className="form-select border-success fw-bold" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })}>
                    <option value="Full Day">Full Day (全天)</option>
                    <option value="Half Day (AM)">Half Day AM (上午半天 9am-1pm)</option>
                    <option value="Half Day (PM)">Half Day PM (下午半天 2pm-6pm)</option>
                  </select>
                </div>
              )}

              <div className="mb-3">
                <label className="small fw-bold text-dark">Reason / Remarks</label>
                <input type="text" className="form-control border-secondary" placeholder="Admin manual entry..." value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} />
              </div>
              
              <div className="mb-2">
                <label className="small fw-bold text-dark">Attachment (Optional)</label>
                <input type="file" className="form-control border-secondary" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setFormData({ ...formData, file: e.target.files[0] })} />
                <small className="text-muted mt-1 d-block"><Info size={12} className="me-1 d-inline"/> Upload Medical Certificate or other proofs.</small>
              </div>
            </div>
            <div className="modal-footer bg-light border-0">
              <button className="btn btn-light fw-bold" onClick={onClose}>Cancel</button>
              <button className="btn btn-success fw-bold shadow-sm px-4" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Leave'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}