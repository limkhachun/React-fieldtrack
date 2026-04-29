import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 🟢 1. 必须引入 Bootstrap 的核心 CSS，否则所有样式都会崩盘！
import 'bootstrap/dist/css/bootstrap.min.css'

// 🟢 2. 然后引入你的自定义样式 (确保它在 bootstrap 下面，这样才能覆盖默认颜色)
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)