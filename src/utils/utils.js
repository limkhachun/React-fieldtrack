// src/utils/utils.js

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ==========================================
// 1. Data Formatting & Processing
// ==========================================

export function formatMoney(amount) {
    return (parseFloat(amount) || 0).toLocaleString('en-MY', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}

export function formatTime(val) {
    if (!val) return "--:--";
    
    // JS Date object
    if (val instanceof Date) {
        return val.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Firestore Timestamp
    if (val.toDate && typeof val.toDate === 'function') {
        return val.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    // Firestore Timestamp (raw seconds)
    if (val.seconds) {
        return new Date(val.seconds * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Raw String (e.g., "09:00")
    if (typeof val === 'string') return val;
    
    return "--:--";
}

export function formatDate(dateInput) {
    if (!dateInput) return '-';
    let date = (dateInput.toDate && typeof dateInput.toDate === 'function') 
        ? dateInput.toDate() 
        : new Date(dateInput);
        
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTime(dateInput) {
    if (!dateInput) return '-';
    return `${formatDate(dateInput)} ${formatTime(dateInput)}`;
}

export function msToHM(ms) {
    if (!ms || ms < 0) return "0h 0m";
    const mins = Math.floor(ms / 60000);
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function calculateStatutoryAmount(rawVal, basicAmt, defaultIsPct = false) {
    if (!rawVal) return 0;
    const str = String(rawVal).trim();
    let isPct = str.includes('%') || defaultIsPct;
    const num = parseFloat(str.replace('%', ''));
    if (isNaN(num)) return 0;
    return isPct ? (basicAmt * (num / 100)) : num;
}

export function formatMalaysianPhone(input) {
    if (!input) return "";
    let cleaned = input.toString().replace(/\D/g, '');
    if (cleaned.startsWith('60')) return "+" + cleaned;
    else if (cleaned.startsWith('0')) return "+60" + cleaned.substring(1);
    else return "+60" + cleaned;
}

export function normalizeDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
}

// ==========================================
// 2. Audit Trail (Logging)
// ==========================================

export async function logAdminAction(db, operator, action, targetUid, oldData = null, newData = null) {
    if (!operator) {
        console.warn("Audit Log Warning: Operator is null. Action might not be tracked correctly.");
    }

    try {
        await addDoc(collection(db, "audit_logs"), {
            operatorEmail: operator?.email || 'Unknown System Agent',
            operatorUid: operator?.uid || 'SYSTEM',
            action: action,
            targetUid: targetUid,
            details: {
                old: oldData,
                new: newData
            },
            timestamp: serverTimestamp()
        });
        console.log(`%c[AUDIT] Action: ${action} on ${targetUid} logged.`, "color: #6366f1; font-weight: bold;");
    } catch (e) {
        console.error("Critical: Audit logging failed.", e);
    }
}

// ==========================================
// 3. UI Helpers (Temporary React Shim)
// ==========================================
// Since we removed DOM manipulation, these act as fallbacks so imports don't crash.
// TODO: Replace these calls in your components with proper React state or Toast notifications.

export function showStatusAlert(elementId, message, isSuccess = true) {
    // Fallback to standard browser alert or console based on success
    if (isSuccess) {
        console.log(`✅ SUCCESS: ${message}`);
        alert(`Success: ${message}`);
    } else {
        console.error(`❌ ERROR: ${message}`);
        alert(`Error: ${message}`);
    }
}

export function showLoading() {
    // In React, loading should be handled by state (e.g., const [loading, setLoading] = useState(false))
    // We log it here just to keep the contract alive for old code.
    console.log("Loading started...");
}

export function hideLoading() {
    console.log("Loading finished.");
}