// src/pages/LeaveApproval/components/LeaveModals.jsx
import React, { useState, useEffect } from 'react';
import { Paperclip, XCircle, PlusCircle, Edit, Info, ExternalLink } from 'lucide-react';

// ==========================================
// Attachment Viewer Modal[cite: 12]
// ==========================================
export function AttachmentModal({ isOpen, url, fileType, onClose }) {
  if (!isOpen) return null;

  const isPdf = fileType?.toLowerCase() === 'pdf' || url?.toLowerCase().includes('.pdf?alt=media'); // PDF check logic[cite: 13]

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
// Reject Leave Modal[cite: 12]
// ==========================================
export function RejectModal({ isOpen, leaveId, uid, onClose }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleReject = async () => {
    if (!reason.trim()) return alert("Please provide a reason for rejection."); // Validation[cite: 13]
    setLoading(true);
    // TODO: Implement the updateDoc and logAdminAction logic here from[cite: 13]
    console.log("Rejecting:", { leaveId, uid, reason });
    setLoading(false);
    onClose();
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
// Edit Status Modal[cite: 12]
// ==========================================
export function EditStatusModal({ isOpen, leaveId, uid, currentStatus, initialReason, onClose }) {
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState(initialReason);
  const [loading, setLoading] = useState(false);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus(currentStatus);
      setReason(initialReason);
    }
  }, [isOpen, currentStatus, initialReason]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setLoading(true);
    // TODO: Implement the runTransaction logic here from window.submitStatusChange[cite: 13]
    console.log("Updating Status:", { leaveId, uid, status, reason });
    setLoading(false);
    onClose();
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
              {status === 'Rejected' && ( // Toggle reason field visibility[cite: 13]
                <div>
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

// ==========================================
// Add Leave Manually Modal[cite: 12]
// ==========================================
export function AddLeaveModal({ isOpen, usersMap, holidaysMap, onClose }) {
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
  
  // Logic to determine if duration group should be visible[cite: 13]
  const isSingleDay = formData.start && formData.end && formData.start === formData.end;

  const handleSubmit = async () => {
    if (!formData.staffId || !formData.start || !formData.end) {
      return alert("Please fill in all required fields.");
    }
    const sDate = new Date(formData.start);
    const eDate = new Date(formData.end);
    if (eDate < sDate) {
      return alert("End date cannot be earlier than start date."); // Validation[cite: 13]
    }

    setLoading(true);
    // TODO: Implement the file upload and runTransaction logic from window.submitAddLeave[cite: 13]
    console.log("Submitting New Leave:", formData);
    setLoading(false);
    onClose();
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

              {isSingleDay && ( // Conditional rendering based on single day check[cite: 13]
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