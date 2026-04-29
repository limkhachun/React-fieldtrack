// src/pages/DailyTasks/DailyTasks.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  writeBatch, 
  doc 
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { 
  ClipboardList, 
  Search, 
  RotateCcw, 
  CheckCheck, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  User, 
  Inbox,
  AlertCircle
} from 'lucide-react';

export default function DailyTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  // ==========================================
  // 1. 数据拉取
  // ==========================================
  const fetchTasks = async () => {
    setLoading(true);
    try {
      // 初始拉取按日期降序排列
      const q = query(collection(db, 'daily_tasks'), orderBy('date', 'desc'));
      const querySnapshot = await getDocs(q);
      const taskData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(taskData);
    } catch (error) {
      console.error("Error fetching daily tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // ==========================================
  // 2. 过滤与排序逻辑 (计算属性)
  // ==========================================
  const filteredAndSortedTasks = useMemo(() => {
    // 过滤逻辑
    let result = tasks.filter(task => {
      const matchName = (task.salesName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      let matchDate = true;
      if (filterDate && task.date) {
        const taskDateStr = task.date.toDate().toISOString().split('T')[0];
        matchDate = taskDateStr === filterDate;
      } else if (filterDate && !task.date) {
        matchDate = false;
      }
      return matchName && matchDate;
    });

    // 排序逻辑[cite: 9]
    result.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      // 处理 Firestore Timestamp
      if (sortConfig.key === 'date') {
        valA = valA ? valA.toMillis() : 0;
        valB = valB ? valB.toMillis() : 0;
      } 
      else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      } 
      else {
        valA = valA ?? 0;
        valB = valB ?? 0;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [tasks, searchTerm, filterDate, sortConfig]);

  // ==========================================
  // 3. 交互处理
  // ==========================================
  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const handleReset = () => {
    setSearchTerm('');
    setFilterDate('');
    setSortConfig({ key: 'date', direction: 'desc' });
  };

  const handleMarkRead = async () => {
    const unreadTasks = tasks.filter(t => t.isRead === false);
    if (unreadTasks.length === 0) return alert("No unread tasks to mark.");

    if (window.confirm(`Mark ${unreadTasks.length} task(s) as read?`)) {
      setActionLoading(true);
      try {
        const batch = writeBatch(db);
        unreadTasks.forEach(task => {
          const taskRef = doc(db, 'daily_tasks', task.id);
          batch.update(taskRef, { isRead: true });
        });
        await batch.commit();
        
        // 本地状态同步
        setTasks(prev => prev.map(t => ({ ...t, isRead: true })));
      } catch (error) {
        alert("Failed to update tasks.");
      } finally {
        setActionLoading(false);
      }
    }
  };

  // ==========================================
  // 4. UI 渲染辅助
  // ==========================================
  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown size={14} className="ms-1 text-muted" />;
    return sortConfig.direction === 'desc' ? 
      <ArrowDown size={14} className="ms-1 text-primary" /> : 
      <ArrowUp size={14} className="ms-1 text-primary" />;
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <h5 className="mt-3 text-dark fw-bold">Loading Tasks...</h5>
      </div>
    );
  }

  return (
    <div className="container py-4 animate__animated animate__fadeIn">
      {/* 标题栏 */}
      <div className="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
        <div>
          <h4 className="fw-bold m-0 text-dark">
            <ClipboardList className="me-2 text-primary d-inline" />Daily Tasks
          </h4>
          <p className="text-muted mb-0 mt-1">View, filter, and sort daily task reports.</p>
        </div>
      </div>

      {/* 筛选控制卡片 */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">Search Staff</label>
              <div className="input-group">
                <span className="input-group-text bg-white border-end-0"><Search size={16} className="text-muted" /></span>
                <input 
                  type="text" 
                  className="form-control border-start-0 ps-0" 
                  placeholder="Sales Name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small fw-bold text-muted mb-1">Filter by Date</label>
              <input 
                type="date" 
                className="form-control"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
            <div className="col-12 col-md-4 d-flex align-items-end gap-2">
              <button className="btn btn-light border w-50 fw-bold" onClick={handleReset}>
                <RotateCcw size={16} className="me-1" />Reset
              </button>
              <button 
                className="btn btn-primary w-50 fw-bold" 
                onClick={handleMarkRead}
                disabled={actionLoading}
              >
                {actionLoading ? 
                  <span className="spinner-border spinner-border-sm me-2"></span> : 
                  <CheckCheck size={16} className="me-1" />
                }
                Mark Read
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 数据表格[cite: 8, 9] */}
      <div className="card border-0 shadow-sm rounded-4">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead className="table-light">
                <tr className="text-nowrap">
                  {[
                    { label: 'Date', key: 'date' },
                    { label: 'Sales', key: 'salesName' },
                    { label: 'Account', key: 'accountType' },
                    { label: 'Live', key: 'liveCount' },
                    { label: 'Leads', key: 'leads' },
                    { label: 'Viewers', key: 'viewers' },
                    { label: 'Top View', key: 'topView' },
                    { label: 'Avg View', key: 'averageView' },
                    { label: 'Boosted', key: 'isBoosted' },
                  ].map((col) => (
                    <th 
                      key={col.key} 
                      className={`py-3 cursor-pointer select-none ${col.key === 'date' ? 'ps-4' : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label} {renderSortIcon(col.key)}
                    </th>
                  ))}
                  <th>Comment</th>
                  <th className="pe-4 text-end">Images</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedTasks.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="text-center py-5 text-muted">
                      <Inbox size={48} className="mb-2 opacity-50 d-block mx-auto" />
                      No matching tasks found.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedTasks.map((task) => (
                    <tr key={task.id}>
                      <td className="ps-4 py-3 fw-medium text-dark">
                        {task.date ? task.date.toDate().toLocaleDateString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        }) : '-'}
                        {task.isRead === false && (
                          <span className="badge bg-danger ms-2" style={{ fontSize: '0.6rem' }}>New</span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <div className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center me-2" style={{ width: 32, height: 32 }}>
                            <User size={16} />
                          </div>
                          <span className="fw-medium text-nowrap">{task.salesName || '-'}</span>
                        </div>
                      </td>
                      <td><span className="badge bg-light text-dark border">{task.accountType || '-'}</span></td>
                      <td className="fw-bold text-center">{task.liveCount || 0}</td>
                      <td className="fw-bold text-center">{task.leads || 0}</td>
                      <td className="fw-bold text-center">{task.viewers || 0}</td>
                      <td className="fw-bold text-center text-primary">{task.topView || 0}</td>
                      <td className="text-secondary text-center">{task.averageView || 0}</td>
                      <td>
                        <span className={`badge border ${task.isBoosted ? 'bg-success-subtle text-success border-success-subtle' : 'bg-secondary-subtle text-secondary border-secondary-subtle'}`}>
                          {task.isBoosted ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px' }}>
                        <div className="text-truncate small text-muted" title={task.comment || ''}>
                          {task.comment || '-'}
                        </div>
                      </td>
                      <td className="pe-4 text-end">
                        <div className="d-flex justify-content-end gap-1">
                          {task.imageUrls && task.imageUrls.length > 0 ? (
                            task.imageUrls.map((url, idx) => (
                              <a key={idx} href={url} target="_blank" rel="noreferrer">
                                <img 
                                  src={url} 
                                  alt="task" 
                                  className="rounded border shadow-sm hover-scale"
                                  style={{ width: 40, height: 40, objectFit: 'cover' }}
                                />
                              </a>
                            ))
                          ) : (
                            <span className="text-muted small italic">No images</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}