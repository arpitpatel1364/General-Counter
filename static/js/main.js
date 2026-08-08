/**
 * People Counter - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  initResponsiveNavigation();
  initThemeToggle();

  const path = window.location.pathname;

  if (path === '/') {
    initDashboard();
  } else if (path === '/cameras') {
    initCameras();
  } else if (path === '/add-camera') {
    initAddCamera();
  } else if (path.startsWith('/edit-camera/')) {
    initEditCamera();
  } else if (path.startsWith('/roi/')) {
    initROI();
  } else if (path === '/analytics') {
    initAnalytics();
  }
});

function initResponsiveNavigation() {
  const menuToggle = document.getElementById('menuToggle');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileDrawerOverlay');

  if (!sidebar) return;

  const closeDrawer = () => {
    sidebar.classList.remove('open');
    document.body.classList.remove('mobile-drawer-open');
  };

  const applySidebarState = () => {
    if (window.innerWidth > 1023 && sidebarToggle) {
      const savedState = localStorage.getItem('sidebarCollapsed') === 'true';
      const shouldCollapse = savedState;
      sidebar.classList.toggle('collapsed', shouldCollapse);
      sidebarToggle.setAttribute('aria-expanded', String(!shouldCollapse));
      sidebarToggle.setAttribute('aria-label', shouldCollapse ? 'Expand sidebar' : 'Collapse sidebar');
    } else {
      sidebar.classList.remove('collapsed');
      if (sidebarToggle) {
        sidebarToggle.setAttribute('aria-expanded', 'true');
        sidebarToggle.setAttribute('aria-label', 'Collapse sidebar');
      }
    }
  };

  if (menuToggle && overlay) {
    menuToggle.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      document.body.classList.toggle('mobile-drawer-open', isOpen);
    });

    overlay.addEventListener('click', closeDrawer);
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth <= 1023) return;
      const willCollapse = !sidebar.classList.contains('collapsed');
      sidebar.classList.toggle('collapsed', willCollapse);
      localStorage.setItem('sidebarCollapsed', String(willCollapse));
      sidebarToggle.setAttribute('aria-expanded', String(!willCollapse));
      sidebarToggle.setAttribute('aria-label', willCollapse ? 'Expand sidebar' : 'Collapse sidebar');
    });
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1023) {
      closeDrawer();
    }
    applySidebarState();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDrawer();
    }
  });

  applySidebarState();
}

function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggle');
  const themeIconDark = document.getElementById('themeIconDark');
  const themeIconLight = document.getElementById('themeIconLight');

  if (!themeToggleBtn) return;

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  
  const updateIcons = (theme) => {
    if (theme === 'dark') {
      themeIconDark.style.display = 'none';
      themeIconLight.style.display = 'block';
    } else {
      themeIconDark.style.display = 'block';
      themeIconLight.style.display = 'none';
    }
  };

  updateIcons(currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('app-theme', newTheme);
    updateIcons(newTheme);
  });
}



// --- Dashboard ---
let dashboardInterval = null;
let activeCameraId = null;
let sessionChartInstance = null;

async function fetchSummary() {
  try {
    const res = await fetch('/api/analytics/summary?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      const elTotalIn = document.getElementById('statTotalIn');
      const elTotalOut = document.getElementById('statTotalOut');
      const elCurrentInside = document.getElementById('statCurrentInside');
      const elActiveCameras = document.getElementById('statActiveCameras');
      const elInOnline = document.getElementById('statInOnline');
      
      const elValEntries = document.getElementById('valEntries');
      const elValExits = document.getElementById('valExits');
      const elValTotal = document.getElementById('valTotal');

      if (elTotalIn) elTotalIn.textContent = data.total_in || 0;
      if (elTotalOut) elTotalOut.textContent = data.total_out || 0;
      if (elCurrentInside) elCurrentInside.textContent = data.current_inside || 0;
      if (elActiveCameras) elActiveCameras.textContent = data.active_cameras || 0;
      if (elInOnline) elInOnline.textContent = data.active_cameras || 0;

      if (elValEntries) elValEntries.textContent = data.total_in || 0;
      if (elValExits) elValExits.textContent = data.total_out || 0;
      if (elValTotal) elValTotal.textContent = (data.total_in || 0) + (data.total_out || 0);
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

async function initDashboard() {
  const chartWrapper = document.getElementById('analyticsContentWrapper');
  const placeholder = document.getElementById('analyticsPlaceholder');
  const timeRangeSeg = document.getElementById('timeRangeSegmented');
  
  function updateVisibility(isOn) {
    if (chartWrapper && placeholder) {
      chartWrapper.style.display = isOn ? 'block' : 'none';
      placeholder.style.display = isOn ? 'none' : 'block';
    }
    if (timeRangeSeg) {
      timeRangeSeg.style.opacity = isOn ? '1' : '0.5';
      timeRangeSeg.style.pointerEvents = isOn ? 'auto' : 'none';
    }
  }

  // Always enable live dashboard stats by default
  updateVisibility(true);
  initProductionChart(); // Initialize chart FIRST so it's ready for data

  await fetchSummary();
  await fetchSessionStockOverview(); // This will now populate the chart immediately
  
  dashboardInterval = setInterval(() => {
    fetchSummary();
    fetchSessionStockOverview();
  }, 3000);

  try {
    const camRes = await fetch('/api/cameras');
    if (camRes.ok) {
      const cameras = await camRes.json();
      if (cameras.length > 0) {
        const activeCam = cameras.find(c => c.running);
        activeCameraId = activeCam ? activeCam.id : cameras[0].id;
        initSessionControls(activeCameraId);
      }
    }
  } catch(e) {}
}

function getChartThemeColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    gridColor:    isLight ? 'rgba(0, 0, 0, 0.06)'   : 'rgba(48, 54, 61, 0.70)',
    tickColor:    isLight ? '#C1C7CF'                : '#6E7681',
    legendColor:  isLight ? '#9CA3AF'                : '#8B949E',
    tooltipBg:    isLight ? '#FFFFFF'                : '#161B22',
    tooltipTitle: isLight ? '#1F2328'                : '#E6EDF3',
    tooltipBody:  isLight ? '#636C76'                : '#8B949E',
    tooltipBorder:isLight ? '#E5E7EB'                : '#30363D',
    borderColor:  isLight ? 'rgba(0, 0, 0, 0.05)'   : 'rgba(48, 54, 61, 0.40)',
  };
}

function initProductionChart() {
  const ctx = document.getElementById('productionChart');
  if (!ctx || typeof Chart === 'undefined') return;

  const c = getChartThemeColors();
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  const gradientIn = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
  if (isLight) {
    gradientIn.addColorStop(0, 'rgba(22, 163, 74, 0.75)');   // Green — lighter on white
    gradientIn.addColorStop(1, 'rgba(22, 163, 74, 0.08)');
  } else {
    gradientIn.addColorStop(0, 'rgba(34, 197, 94, 0.90)');   // Deep Space Green
    gradientIn.addColorStop(1, 'rgba(34, 197, 94, 0.10)');
  }

  const gradientOut = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
  if (isLight) {
    gradientOut.addColorStop(0, 'rgba(37, 99, 235, 0.75)');  // Blue — lighter on white
    gradientOut.addColorStop(1, 'rgba(37, 99, 235, 0.08)');
  } else {
    gradientOut.addColorStop(0, 'rgba(59, 130, 246, 0.90)'); // Deep Space Blue
    gradientOut.addColorStop(1, 'rgba(59, 130, 246, 0.10)');
  }


  sessionChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Produced',
          data: [],
          backgroundColor: gradientIn,
          borderRadius: 6,
          borderWidth: 0
        },
        {
          label: 'Dispatched',
          data: [],
          backgroundColor: gradientOut,
          borderRadius: 6,
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: c.legendColor, font: { family: 'Plus Jakarta Sans, Inter', size: 12 } }
        },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipTitle,
          bodyColor: c.tooltipBody,
          borderColor: c.tooltipBorder,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: c.gridColor, lineWidth: 1 },
          border: { color: c.borderColor },
          ticks: { color: c.tickColor, font: { family: 'Inter', size: 12 } }
        },
        x: {
          grid: { display: false },
          border: { color: c.borderColor },
          ticks: { 
            color: c.tickColor, 
            font: { family: 'Inter', size: 12 },
            maxRotation: 45,
            minRotation: 0,
            callback: function(value) {
              const label = this.getLabelForValue(value);
              if (typeof label === 'string' && label.length > 12) {
                return label.substring(0, 12) + '...';
              }
              return label;
            }
          }
        }
      }
    }
  });
}

/* Re-render chart when theme toggle is clicked */
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      // Small delay to let the DOM attribute flip first
      setTimeout(() => {
        if (sessionChartInstance) {
          sessionChartInstance.destroy();
          sessionChartInstance = null;
        }
        initProductionChart();
        // Re-fetch so chart gets data back after re-render
        if (typeof fetchSessionStockOverview === 'function') {
          fetchSessionStockOverview();
        }
      }, 50);
    });
  }
});


async function fetchSessionStockOverview() {
  const tableBody = document.getElementById('sessionStockTableBody');
  if (!tableBody) return;
  
  try {
    const res = await fetch('/api/sessions?t=' + Date.now());
    if (res.ok) {
      const responseData = await res.json();
      const sessions = responseData.data || [];
      
      if (sessions.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 48px; color: var(--text-muted);">No active sessions found today.</td></tr>`;
        return;
      }
      
      let html = '';
      let chartLabels = [];
      let chartProduced = [];
      let chartDispatched = [];
      
      for (const session of sessions) {
        const sName = session.name || 'Unnamed Lap';
        const sIn = session.total_in || 0;
        const sOut = session.total_out || 0;
        
        chartLabels.push(sName);
        chartProduced.push(sIn);
        chartDispatched.push(sOut);

        const netStock = sIn - sOut;
        let statusBadge = '';
        if (session.status === 'running') {
          statusBadge = `<span class="status-pill"><span class="status-indicator" style="background: var(--accent-green);"></span>Active</span>`;
        } else if (session.status === 'paused') {
          statusBadge = `<span class="status-pill"><span class="status-indicator" style="background: var(--accent-yellow);"></span>Paused</span>`;
        } else {
          statusBadge = `<span class="status-pill"><span class="status-indicator" style="background: var(--text-muted);"></span>Completed</span>`;
        }
        
        html += `
          <tr>
            <td style="font-weight: 600; color: var(--text-primary);">${sName}</td>
            <td>Camera ${session.camera_id}</td>
            <td>${session.object_type || 'sack'}</td>
            <td style="color: var(--accent-blue); font-weight: 500;">${Math.abs(sOut)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }
      tableBody.innerHTML = html;
      
      if (sessionChartInstance) {
        sessionChartInstance.data.labels = chartLabels;
        sessionChartInstance.data.datasets[0].data = chartProduced;
        sessionChartInstance.data.datasets[1].data = chartDispatched;
        sessionChartInstance.update();
      }
    }
  } catch (err) {
    console.error('Error fetching session stock overview:', err);
  }
}

function initSessionControls(cameraId) {
  const btnToggle = document.getElementById('btnToggleCount');
  const activeActionButtons = document.getElementById('activeActionButtons');
  const btnPauseCount = document.getElementById('btnPauseCount');
  const btnResumeCount = document.getElementById('btnResumeCount');
  const btnExitSession = document.getElementById('btnExitSession');
  
  const countingIndicator = document.getElementById('countingIndicator');
  const countingText = document.getElementById('countingText');
  
  const modal = document.getElementById('newSessionModal');
  const btnCancel = document.getElementById('btnCancelSession');
  const btnStart = document.getElementById('btnStartSession');
  const inputName = document.getElementById('sessionName');
  const inputClass = document.getElementById('targetClass');
  const existingSessionSelect = document.getElementById('existingSessionSelect');
  const newSessionFields = document.getElementById('newSessionFields');

  if (typeof window.sessionControlsInitialized === 'undefined') {
    window.sessionControlsInitialized = false;
  }
  if (typeof window.currentSessionStatus === 'undefined') {
    window.currentSessionStatus = 'stopped';
  }

  async function pollStatus() {
    try {
      const res = await fetch(`/api/cameras/${activeCameraId}/stats?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        window.currentSessionStatus = data.status;
        
        if (window.currentSessionStatus === 'running') {
          countingIndicator.style.backgroundColor = 'var(--accent-green)';
          const sessionStr = data.session_name || 'Unknown Lap';
          const classStr = data.class_name ? data.class_name.charAt(0).toUpperCase() + data.class_name.slice(1) : 'Unknown Class';
          
          countingText.style.display = 'flex';
          countingText.style.alignItems = 'center';
          countingText.style.gap = '8px';
          countingText.innerHTML = `
            <span style="font-weight: 600; color: var(--text-primary);">Counting Active:</span>
            <span style="background: var(--bg-surface-hover, #f1f5f9); padding: 4px 10px; border-radius: 6px; font-weight: 500; font-size: 13px; color: var(--text-secondary); border: 1px solid var(--border-subtle);">${sessionStr} (${classStr})</span>
            <span style="display: flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 700; margin-left: 4px;">
              <span style="background: var(--tint-blue, #dbeafe); color: var(--accent-blue, #2563eb); padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21v-9a2 2 0 0 1 2-2h10"></path><path d="M21 3l-7 7"></path></svg>
                IN ${data.in_count}
              </span>
              <span style="background: var(--tint-red, #fee2e2); color: var(--accent-red, #dc2626); padding: 4px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H3v-6"></path><path d="M15 3v9a2 2 0 0 1-2 2H3"></path><path d="M3 21l7-7"></path></svg>
                OUT ${data.out_count}
              </span>
            </span>
          `;
          
          btnToggle.style.display = 'none';
          if (btnResumeCount) btnResumeCount.style.display = 'none';
          activeActionButtons.style.display = 'flex';
        } else if (window.currentSessionStatus === 'loading') {
          countingIndicator.style.backgroundColor = 'var(--accent-yellow)';
          countingText.style.display = 'inline';
          countingText.innerHTML = 'Loading model… please wait';
          btnToggle.style.display = 'none';
          if (btnResumeCount) btnResumeCount.style.display = 'none';
          activeActionButtons.style.display = 'none';
        } else if (window.currentSessionStatus === 'paused') {
          countingIndicator.style.backgroundColor = 'var(--accent-yellow)';
          const sessionStr = data.session_name || 'Unknown Lap';
          const classStr = data.class_name ? data.class_name.charAt(0).toUpperCase() + data.class_name.slice(1) : 'Unknown Class';
          
          countingText.style.display = 'flex';
          countingText.style.alignItems = 'center';
          countingText.style.gap = '8px';
          countingText.innerHTML = `
            <span style="font-weight: 600; color: var(--text-primary);">Session Paused:</span>
            <span style="background: var(--bg-surface-hover, #f1f5f9); padding: 4px 10px; border-radius: 6px; font-weight: 500; font-size: 13px; color: var(--text-secondary); border: 1px solid var(--border-subtle);">${sessionStr} (${classStr})</span>
          `;
          
          btnToggle.style.display = 'none';
          if (btnResumeCount) btnResumeCount.style.display = 'block';
          activeActionButtons.style.display = 'none';
        } else {
          countingIndicator.style.backgroundColor = 'var(--text-muted)';
          countingText.style.display = 'inline';
          countingText.innerHTML = 'Ready to count';
          btnToggle.style.display = 'block';
          btnToggle.textContent = 'Start Counting';
          btnToggle.classList.replace('btn-secondary', 'btn-primary');
          if (btnResumeCount) btnResumeCount.style.display = 'none';
          activeActionButtons.style.display = 'none';
        }
      }
    } catch(err) {
      console.error(err);
    }
  }

  // Poll every 2 seconds
  setInterval(pollStatus, 2000);
  pollStatus();

  if (window.sessionControlsInitialized) return;
  window.sessionControlsInitialized = true;

  btnToggle.addEventListener('click', async () => {
    // Open modal
    inputName.value = '';
    existingSessionSelect.innerHTML = '<option value="">-- Create New Lap --</option>';
    newSessionFields.style.display = 'block';
    
    // Fetch existing sessions
    try {
      const res = await fetch(`/api/sessions/${cameraId}?t=${Date.now()}`);
        if (res.ok) {
          const responseData = await res.json();
          const sessions = responseData.data || [];
          sessions.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} (Started: ${s.created_at})`;
            existingSessionSelect.appendChild(opt);
          });
        }
      } catch (err) { console.error('Failed to fetch sessions', err); }
      
      modal.style.display = 'flex';
  });

  existingSessionSelect?.addEventListener('change', (e) => {
    if (e.target.value) {
      newSessionFields.style.display = 'none';
    } else {
      newSessionFields.style.display = 'block';
    }
  });

  btnPauseCount?.addEventListener('click', async () => {
    btnPauseCount.disabled = true;
    if (btnExitSession) btnExitSession.disabled = true;
    countingText.textContent = 'Pausing...';
    
    try {
      const res = await fetch('/api/sessions/pause', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({camera_id: activeCameraId})
      });
      if (res.ok) {
        window.currentSessionStatus = 'stopped';
        pollStatus();
      } else {
        alert('Failed to pause counting. Please try again.');
        pollStatus();
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Failed to pause counting.');
      pollStatus();
    } finally {
      btnPauseCount.disabled = false;
      if (btnExitSession) btnExitSession.disabled = false;
    }
  });

  btnResumeCount?.addEventListener('click', async () => {
    btnResumeCount.disabled = true;
    countingText.innerHTML = 'Resuming...';
    
    // Check if we have the session id from stats, we didn't save it locally though...
    // Actually we can just hit /api/sessions/start or a generic resume endpoint that infers session.
    // Let's fetch stats again to get session_id
    try {
      const statRes = await fetch('/api/cameras/' + activeCameraId + '/stats');
      const stats = await statRes.json();
      if (stats.session_id) {
        const res = await fetch(`/api/sessions/${stats.session_id}/resume`, { method: 'POST' });
        if (res.ok) {
          window.currentSessionStatus = 'running';
          pollStatus();
        } else {
          alert('Failed to resume counting.');
          pollStatus();
        }
      } else {
        alert('Could not identify paused session ID.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Failed to resume counting.');
      pollStatus();
    } finally {
      btnResumeCount.disabled = false;
    }
  });

  btnExitSession?.addEventListener('click', async () => {
    
    if (btnPauseCount) btnPauseCount.disabled = true;
    btnExitSession.disabled = true;
    countingText.textContent = 'Exiting...';
    
    try {
      const res = await fetch('/api/sessions/stop', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({camera_id: activeCameraId})
      });
      if (res.ok) {
        window.currentSessionStatus = 'stopped';
        pollStatus();
      } else {
        alert('Failed to exit session. Please try again.');
        pollStatus();
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Failed to exit session.');
      pollStatus();
    } finally {
      if (btnPauseCount) btnPauseCount.disabled = false;
      btnExitSession.disabled = false;
    }
  });

  // Modal dismiss handlers
  btnCancel.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  btnStart.addEventListener('click', async () => {
    const selectedSessionId = existingSessionSelect.value;
    const name = inputName.value.trim();
    
    if (!selectedSessionId && !name) return alert('Please enter a Lap Name or select an existing one');
    
    modal.style.display = 'none';
    
    // Optimistic UI update
    window.currentSessionStatus = 'loading';
    countingIndicator.style.backgroundColor = 'var(--accent-yellow)';
    countingText.textContent = 'Loading model… please wait';
    btnToggle.style.display = 'none';
    activeActionButtons.style.display = 'none';
    
    try {
      let res;
      if (selectedSessionId) {
        res = await fetch(`/api/sessions/${selectedSessionId}/resume`, { method: 'POST' });
      } else {
        res = await fetch('/api/sessions/start', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            camera_id: activeCameraId,
            name: name,
            target_class: parseInt(inputClass.value) || 0
          })
        });
      }
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.detail || data.error || "Failed to start counting.");
        window.currentSessionStatus = 'stopped';
        countingIndicator.style.backgroundColor = 'var(--text-muted)';
        countingText.textContent = 'Ready to count';
        btnToggle.style.display = 'block';
        btnToggle.textContent = 'Start Counting';
        activeActionButtons.style.display = 'none';
        return;
      }
      
      pollStatus();
    } catch (err) { console.error(err); }
  });
}

// --- Cameras ---
async function initCameras() {
  const grid = document.getElementById('camerasGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/cameras');
    const cameras = await res.json();
    
    if (cameras.length === 0) {
      grid.innerHTML = '<div class="card"><div style="text-align:center; padding: 20px;">No cameras found.</div></div>';
      return;
    }
    
    grid.innerHTML = '';
    cameras.forEach((cam) => {
      const statusBadge = cam.running 
        ? '<span class="badge badge-green" style="display:inline-flex; align-items:center; gap:4px;"><span style="width:6px; height:6px; border-radius:50%; background:var(--accent-green);"></span> Running</span>'
        : '<span class="badge badge-red" style="display:inline-flex; align-items:center; gap:4px;"><span style="width:6px; height:6px; border-radius:50%; background:var(--accent-red);"></span> Stopped</span>';
      
      const createdDate = cam.created_at ? new Date(cam.created_at + 'Z').toLocaleString('en-GB', {day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true}).replace(',', '') : 'Unknown';
      const lastSeenDate = cam.running ? new Date().toLocaleString('en-GB', {day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true}).replace(',', '') : 'Unknown';
      
      const card = document.createElement('div');
      card.className = 'card camera-card';
      card.style.padding = '0';
      card.style.overflow = 'hidden';
      card.innerHTML = `
        <div class="camera-card-header" style="padding: 16px 20px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border-subtle);">
          <div style="display: flex; gap: 12px; align-items: center; min-width: 0;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: var(--bg-surface-hover); display: flex; align-items: center; justify-content: center; color: var(--accent-blue); flex-shrink: 0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
            </div>
            <div style="min-width: 0; display: flex; flex-direction: column; gap: 2px;">
              <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cam.name}</h3>
              <div style="font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px;">
                 <span style="display:flex; align-items:center; gap:4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${cam.location}</span>
                 <span style="color: var(--border-subtle);">•</span>
                 ${cam.running 
                   ? `<span style="color: var(--accent-green); font-weight: 600; display:flex; align-items:center; gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent-green);box-shadow: 0 0 6px var(--accent-green);"></span> Running</span>` 
                   : `<span style="color: var(--text-muted); font-weight: 600; display:flex; align-items:center; gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--text-muted);"></span> Stopped</span>`}
              </div>
            </div>
          </div>
        </div>

        <div style="padding: 16px 20px;">
          <!-- Video Section -->
          <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #0b0c10; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-subtle); display: flex; flex-direction: column;">
            
            <!-- Video Overlay Controls -->
            <div style="position: absolute; top: 0; left: 0; right: 0; padding: 12px; display: flex; justify-content: space-between; align-items: center; z-index: 10; background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%);">
               <div style="display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; color: #fff; border: 1px solid rgba(255,255,255,0.05); letter-spacing: 0.05em;">
                 <span style="width:6px;height:6px;border-radius:50%;background:${cam.running ? 'var(--accent-green)' : 'var(--text-muted)'}; ${cam.running ? 'box-shadow: 0 0 8px var(--accent-green); animation: ping 2s infinite;' : ''}"></span>
                 LIVE
               </div>
               <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 4px 6px 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; color: #fff; border: 1px solid rgba(255,255,255,0.05);">
                 <span>Stream</span>
                 <label class="switch" style="margin: 0; transform: scale(0.75); transform-origin: right center;">
                   <input type="checkbox" id="streamToggle_${cam.id}" ${!cam.running ? 'disabled' : ''}>
                   <span class="slider round"></span>
                 </label>
               </div>
            </div>

            <!-- Video Content -->
            <div id="livePreviewContainer_${cam.id}" style="flex: 1; display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">
              <div style="text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>
                <div style="font-size: 12px; font-weight: 500;">Stream paused</div>
              </div>
            </div>
          </div>
          
          <!-- Actions -->
          <div style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
             <button class="btn" style="padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; border: none; transition: all 0.2s; ${cam.running ? 'background: var(--tint-red); color: var(--accent-red); box-shadow: inset 0 0 0 1px var(--tint-red);' : 'background: var(--accent-blue); color: white; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);'}" onclick="toggleCamera(${cam.id}, ${cam.running})">
                ${cam.running ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg> Stop` : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start`}
             </button>
             
             <div style="display: flex; gap: 6px;">
               <a href="/edit-camera/${cam.id}" class="btn icon-btn" style="padding: 8px; border-radius: 8px; background: transparent; border: 1px solid var(--border-subtle); color: var(--text-secondary); transition: all 0.2s;" onmouseover="this.style.color='var(--text-primary)'; this.style.borderColor='var(--border-strong)';" onmouseout="this.style.color='var(--text-secondary)'; this.style.borderColor='var(--border-subtle)';" title="Edit Camera"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></a>
               <a href="/roi/${cam.id}" class="btn icon-btn" style="padding: 8px; border-radius: 8px; background: transparent; border: 1px solid var(--border-subtle); color: var(--text-secondary); transition: all 0.2s;" onmouseover="this.style.color='var(--text-primary)'; this.style.borderColor='var(--border-strong)';" onmouseout="this.style.color='var(--text-secondary)'; this.style.borderColor='var(--border-subtle)';" title="ROI Setup"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path></svg></a>
               <button onclick="deleteCamera(${cam.id})" class="btn icon-btn" style="padding: 8px; border-radius: 8px; background: transparent; border: 1px solid var(--border-subtle); color: var(--text-secondary); transition: all 0.2s;" onmouseover="this.style.color='var(--accent-red)'; this.style.borderColor='var(--accent-red)';" onmouseout="this.style.color='var(--text-secondary)'; this.style.borderColor='var(--border-subtle)';" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
             </div>
          </div>
        </div>

        <div style="padding: 12px 20px; background: var(--bg-surface-solid); border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
           <div style="display: flex; gap: 12px;">
             <span>ROI: <span style="color: var(--text-primary);">${cam.roi_type || 'None'}</span></span>
             <span style="color: var(--border-strong);">|</span>
             <span>Added: <span style="color: var(--text-primary); text-transform: none;">${createdDate.split(' ')[0]}</span></span>
           </div>
           <div>Seen: <span style="color: var(--text-primary); text-transform: none;">${lastSeenDate.split(' ')[0]}</span></div>
        </div>
      `;
      grid.appendChild(card);

      const toggle = card.querySelector(`#streamToggle_${cam.id}`);
      const container = card.querySelector(`#livePreviewContainer_${cam.id}`);
      
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          container.style.cursor = 'pointer';
          container.innerHTML = `<img src="/api/stream/${cam.id}?t=${Date.now()}" alt="Live Stream" style="width: 100%; height: 100%; object-fit: cover; background: #111;" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'800\\\' height=\\\'450\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%23111\\\'/><text x=\\\'50%\\\' y=\\\'50%\\\' font-family=\\\'sans-serif\\\' font-size=\\\'16px\\\' fill=\\\'%23666\\\' text-anchor=\\\'middle\\\' dominant-baseline=\\\'middle\\\'>Stream Offline</text></svg>';">`;
        } else {
          container.style.cursor = 'default';
          container.innerHTML = `
            <div class="video-offline">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5; margin-bottom: 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>
              <div>Stream paused to save bandwidth.</div>
            </div>
          `;
        }
      });

      container.addEventListener('click', () => {
        if (toggle.checked) {
          openLiveViewModal(cam.name, cam.id);
        }
      });
    });

    // Setup Big Live View Modal Close handlers
    const modal = document.getElementById('liveViewModal');
    const modalClose = document.getElementById('closeLiveViewModal');
    const modalImg = document.getElementById('modalLiveStreamImg');
    if (modal && modalClose) {
      const closeModal = () => {
        modal.style.display = 'none';
        if (modalImg) modalImg.src = '';
      };
      modalClose.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal();
        }
      });
    }
  } catch (err) {
    grid.innerHTML = '<div class="card"><div style="text-align:center; padding: 20px; color:var(--danger)">Error loading cameras.</div></div>';
    console.error(err);
  }
}

function openLiveViewModal(camName, camId) {
  const modal = document.getElementById('liveViewModal');
  const modalImg = document.getElementById('modalLiveStreamImg');
  const modalTitle = document.getElementById('modalCameraName');
  const modalLoader = document.getElementById('modalLoadingIndicator');

  if (!modal || !modalImg) return;

  modalTitle.textContent = `${camName} - Live View`;
  if (modalLoader) modalLoader.style.display = 'block';
  modalImg.style.display = 'none';
  modalImg.src = `/api/stream/${camId}?t=${Date.now()}`;
  
  modalImg.onload = () => {
    if (modalLoader) modalLoader.style.display = 'none';
    modalImg.style.display = 'block';
  };
  
  modalImg.onerror = () => {
    if (modalLoader) modalLoader.style.display = 'none';
    modalImg.style.display = 'block';
    modalImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='100%' height='100%' fill='%23111'/><text x='50%' y='50%' font-family='sans-serif' font-size='16px' fill='%23666' text-anchor='middle' dominant-baseline='middle'>Camera Offline/No Signal</text></svg>";
  };

  modal.style.display = 'flex';
}


async function toggleCamera(id, isRunning) {
  const action = isRunning ? 'stop' : 'start';
  try {
    const res = await fetch(`/api/cameras/${id}/${action}`, { method: 'POST' });
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json();
      alert(data.detail || 'Error toggling camera');
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteCamera(id) {
  if (!confirm('Are you sure you want to delete this camera?')) return;
  try {
    const res = await fetch(`/api/cameras/${id}`, { method: 'DELETE' });
    if (res.ok) {
      window.location.reload();
    }
  } catch (err) {
    console.error(err);
  }
}

// --- Edit Camera ---
function initEditCamera() {
  const form = document.getElementById('editCameraForm');
  if (!form) return;

  const camId = window.location.pathname.split('/').pop();

  // Load existing camera details
  (async () => {
    try {
      const res = await fetch(`/api/cameras/${camId}?t=${Date.now()}`);
      if (res.ok) {
        const cam = await res.json();
        document.getElementById('camName').value = cam.name;
        document.getElementById('camLocation').value = cam.location;
        document.getElementById('camRtsp').value = cam.rtsp_url;
      } else {
        alert('Failed to load camera configuration.');
      }
    } catch (err) {
      console.error(err);
    }
  })();

  // Handle form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('camName').value,
      location: document.getElementById('camLocation').value,
      rtsp_url: document.getElementById('camRtsp').value
    };

    try {
      const res = await fetch(`/api/cameras/${camId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        window.location.href = '/cameras';
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to update camera');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// --- Add Camera ---
function initAddCamera() {
  const form = document.getElementById('addCameraForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('camName').value,
      location: document.getElementById('camLocation').value,
      rtsp_url: document.getElementById('camRtsp').value
    };
    
    try {
      const res = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = `/roi/${data.id}`;
      } else {
        alert(data.detail || 'Failed to add camera');
      }
    } catch (err) {
      console.error(err);
    }
  });
}

// --- ROI Setup ---
let roiPoints = [];
let mode = 'line'; // UI tool: 'line' | 'rect' | 'poly' | 'select'
let currentShapeType = 'line'; // The actual drawn shape: 'line' | 'rect' | 'poly'
let drawing = false;
let dragging = null; // {type:'point', idx} or null
let lineDirection = 'both';
const HANDLE_R = 6;

async function initROI() {
  const camId = window.location.pathname.split('/').pop();
  const canvas = document.getElementById('roiCanvas');
  const ctx = canvas.getContext('2d');
  const img = document.getElementById('roiPreviewImg');
  
  // Toolbar buttons
  const btnLine = document.getElementById('modeLine');
  const btnRect = document.getElementById('modeRect');
  const btnPoly = document.getElementById('modePoly');
  const btnSelect = document.getElementById('modeSelect');
  const btnClear = document.getElementById('btnClearRoi');
  
  // Panel elements
  const regionItem = document.getElementById('regionItem');
  const noRegionMsg = document.getElementById('noRegionMsg');
  const regionTypeLabel = document.getElementById('regionTypeLabel');
  const dirSelect = document.getElementById('roiDirection');
  const btnFlip = document.getElementById('btnFlipLine');
  const btnDelete = document.getElementById('btnDeleteRegion');
  
  function updateToolbar() {
    [btnLine, btnRect, btnPoly, btnSelect].forEach(b => b.classList.remove('active'));
    if (mode === 'line') btnLine.classList.add('active');
    if (mode === 'rect') btnRect.classList.add('active');
    if (mode === 'poly') btnPoly.classList.add('active');
    if (mode === 'select') btnSelect.classList.add('active');
  }

  function updatePanel() {
    if (roiPoints.length === 0) {
      regionItem.style.display = 'none';
      noRegionMsg.style.display = 'block';
    } else {
      regionItem.style.display = 'flex';
      noRegionMsg.style.display = 'none';
      if (currentShapeType === 'line') {
        regionTypeLabel.textContent = 'Counting Line';
        dirSelect.style.display = 'block';
        btnFlip.style.display = 'inline-flex';
        dirSelect.value = lineDirection;
      } else if (currentShapeType === 'rect') {
        regionTypeLabel.textContent = 'Occupancy Rectangle';
        dirSelect.style.display = 'none';
        btnFlip.style.display = 'none';
      } else {
        regionTypeLabel.textContent = 'Occupancy Polygon';
        dirSelect.style.display = 'none';
        btnFlip.style.display = 'none';
      }
    }
  }

  [btnLine, btnRect, btnPoly, btnSelect].forEach(btn => {
    btn.addEventListener('click', (e) => {
      let id = e.currentTarget.id;
      let newShapeType = currentShapeType;
      if (id === 'modeLine') newShapeType = 'line';
      if (id === 'modeRect') newShapeType = 'rect';
      if (id === 'modePoly') newShapeType = 'poly';
      
      if (id !== 'modeSelect') {
        if (newShapeType !== currentShapeType) {
           roiPoints = [];
           currentShapeType = newShapeType;
        }
        mode = newShapeType;
      } else {
        mode = 'select';
      }
      updateToolbar();
      updatePanel();
      draw();
    });
  });

  function getModeFromPoints() {
    return currentShapeType;
  }

  btnClear.addEventListener('click', () => { roiPoints = []; updatePanel(); draw(); });
  btnDelete.addEventListener('click', () => { roiPoints = []; updatePanel(); draw(); });
  
  dirSelect.addEventListener('change', () => { lineDirection = dirSelect.value; draw(); });
  btnFlip.addEventListener('click', () => {
    if (currentShapeType === 'line' && roiPoints.length === 2) {
      roiPoints.reverse();
      draw();
    }
  });

  let initialNormalizedPoints = null;
  let isImageLoaded = false;

  // Load stream frame
  const roiPlaceholder = document.getElementById('roiPlaceholder');
  img.onerror = () => {
    img.onerror = null;
    img.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'><rect width='100%' height='100%' fill='%23111'/><text x='50%' y='50%' font-family='sans-serif' font-size='16px' fill='%23666' text-anchor='middle' dominant-baseline='middle'>Camera Offline</text></svg>";
  };
  img.src = `/api/stream/${camId}?snapshot=1`;
  img.onload = () => {
    if (roiPlaceholder) roiPlaceholder.style.display = 'none';
    img.style.opacity = '1';

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    isImageLoaded = true;
    if (initialNormalizedPoints && roiPoints.length === 0) {
      roiPoints = initialNormalizedPoints.map(p => [p[0] * canvas.width, p[1] * canvas.height]);
    }
    draw();
  };
  
  // Fetch existing ROI
  try {
    const res = await fetch(`/api/cameras/${camId}`);
    if (res.ok) {
      const cam = await res.json();
      if (cam.roi_type) {
        mode = cam.roi_type === 'rectangle' ? 'rect' : (cam.roi_type === 'polygon' ? 'poly' : 'line');
        currentShapeType = mode;
      }
      if (cam.roi_data) {
        if (cam.roi_data.direction) lineDirection = cam.roi_data.direction;
        if (cam.roi_data.points) {
          initialNormalizedPoints = cam.roi_data.points;
          if (isImageLoaded) {
            roiPoints = initialNormalizedPoints.map(p => [p[0] * canvas.width, p[1] * canvas.height]);
          }
          mode = 'select'; // start in select mode if points exist
        }
      }
      updateToolbar();
      updatePanel();
    }
  } catch(e) {}

  function mousePos(evt) {
    const r = canvas.getBoundingClientRect();
    return { x: evt.clientX - r.left, y: evt.clientY - r.top };
  }

  function pointNear(px, py, x, y, r = 30) {
    return Math.hypot(px - x, py - y) <= r;
  }

  let tempPoint = null;
  let clickTimer = null;

  canvas.addEventListener('pointerdown', (e) => {
    const p = mousePos(e);
    
    if (mode === 'select') {
      for (let i = 0; i < roiPoints.length; i++) {
        if (pointNear(p.x, p.y, roiPoints[i][0], roiPoints[i][1], HANDLE_R + 4)) {
          dragging = { type: 'point', idx: i };
          return;
        }
      }
    } else if (mode === 'line') {
      if (roiPoints.length >= 2) roiPoints = [];
      if (roiPoints.length === 0) {
        roiPoints.push([p.x, p.y]);
        drawing = true;
      } else if (roiPoints.length === 1) {
        roiPoints.push([p.x, p.y]);
        drawing = false;
        tempPoint = null;
        mode = 'select';
        updateToolbar();
      }
    } else if (mode === 'rect') {
      if (roiPoints.length >= 2) roiPoints = [];
      if (roiPoints.length === 0) {
        roiPoints.push([p.x, p.y]);
        drawing = true;
      } else if (roiPoints.length === 1) {
        roiPoints.push([p.x, p.y]);
        drawing = false;
        tempPoint = null;
        mode = 'select';
        updateToolbar();
      }
    } else if (mode === 'poly') {
      roiPoints.push([p.x, p.y]);
      drawing = true;
      updateToolbar();
    }
    updatePanel();
    draw();
  });

  window.addEventListener('pointermove', (e) => {
    if (dragging && dragging.type === 'point') {
      const p = mousePos(e);
      roiPoints[dragging.idx] = [p.x, p.y];
      draw();
      return;
    }
    
    if (drawing) {
      const p = mousePos(e);
      tempPoint = [p.x, p.y];
      draw();
    }
  });

  window.addEventListener('pointerup', (e) => {
    dragging = null;
  });

  canvas.addEventListener('dblclick', (e) => {
    if (mode === 'poly') {
      if (roiPoints.length > 2) {
        roiPoints.pop(); // Remove the duplicate point added by the second click of the double-click
      }
      drawing = false;
      tempPoint = null;
      mode = 'select';
      updateToolbar();
      updatePanel();
      draw();
    }
  });

  function drawHandle(x, y, color = '#3B82F6') {
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (roiPoints.length === 0) return;

    const currentZoneColor = '#3B82F6';
    ctx.strokeStyle = currentZoneColor;
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';

    let pts = [...roiPoints];
    let actualMode = currentShapeType;

    if (actualMode === 'line') {
      if (pts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        let endP = pts.length > 1 ? pts[1] : tempPoint;
        if (endP) {
          ctx.lineTo(endP[0], endP[1]);
          ctx.stroke();
          
          // Draw arrows
          let dx = endP[0] - pts[0][0];
          let dy = endP[1] - pts[0][1];
          let len = Math.hypot(dx, dy);
          if (len > 0) {
            let nx = -dy / len;
            let ny = dx / len;
            let mx = (pts[0][0] + endP[0]) / 2;
            let my = (pts[0][1] + endP[1]) / 2;
            let offset = 12; // Space between line and arrow
            let arrLen = 20; // Length of the arrow itself
            
            if (lineDirection === 'both' || lineDirection === 'in') {
               drawArrow(ctx, mx + nx * offset, my + ny * offset, mx + nx * (offset + arrLen), my + ny * (offset + arrLen), '#3B82F6', 'IN');
            }
            if (lineDirection === 'both' || lineDirection === 'out') {
               drawArrow(ctx, mx - nx * offset, my - ny * offset, mx - nx * (offset + arrLen), my - ny * (offset + arrLen), '#EF4444', 'OUT');
            }
            if (lineDirection === 'reversed') {
               drawArrow(ctx, mx + nx * offset, my + ny * offset, mx + nx * (offset + arrLen), my + ny * (offset + arrLen), '#EF4444', 'OUT');
               drawArrow(ctx, mx - nx * offset, my - ny * offset, mx - nx * (offset + arrLen), my - ny * (offset + arrLen), '#3B82F6', 'IN');
            }
          }
        }
      }
    } else if (actualMode === 'rect') {
      if (pts.length > 0) {
        let endP = pts.length > 1 ? pts[1] : tempPoint;
        if (endP) {
          let minX = Math.min(pts[0][0], endP[0]);
          let minY = Math.min(pts[0][1], endP[1]);
          let w = Math.abs(endP[0] - pts[0][0]);
          let h = Math.abs(endP[1] - pts[0][1]);
          ctx.beginPath();
          ctx.rect(minX, minY, w, h);
          ctx.stroke();
          ctx.fill();
        }
      }
    } else if (actualMode === 'poly') {
      if (pts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        if (mode === 'select' || (mode === 'poly' && !drawing && tempPoint===null)) {
          ctx.closePath();
          ctx.fill();
        } else if (tempPoint) {
          ctx.lineTo(tempPoint[0], tempPoint[1]);
        }
        ctx.stroke();
      }
    }

    // Zone overlay pill tag top-left vertex
    if (pts.length > 0) {
      const labelX = pts[0][0];
      const labelY = pts[0][1] - 8;
      ctx.fillStyle = currentZoneColor;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(labelX, labelY - 14, 52, 18, 4);
      } else {
        ctx.rect(labelX, labelY - 14, 52, 18);
      }
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillText('Zone 1', labelX + 8, labelY - 1);
    }

    // Draw handles
    if (mode === 'select' || mode === 'poly') {
      pts.forEach(p => drawHandle(p[0], p[1], currentZoneColor));
    }
  }

  function drawArrow(ctx, fromX, fromY, toX, toY, color, label) {
    const headlen = 8;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(toX, toY);
    ctx.fillStyle = color;
    ctx.fill();
    
    ctx.fillStyle = color;
    ctx.font = '12px sans-serif';
    ctx.fillText(label, toX + 5 * Math.cos(angle), toY + 5 * Math.sin(angle));
  }

  document.getElementById('btnSaveRoi').addEventListener('click', async () => {
    let finalType = 'line';
    let amode = currentShapeType;
    if (amode === 'rect') finalType = 'rectangle';
    if (amode === 'poly') finalType = 'polygon';
    
    const normalized = roiPoints.map(p => [p[0] / canvas.width, p[1] / canvas.height]);
    
    try {
      const res = await fetch(`/api/cameras/${camId}/roi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roi_type: finalType,
          roi_data: { 
            points: normalized,
            direction: finalType === 'line' ? lineDirection : undefined
          }
        })
      });
      if (res.ok) {
        alert('ROI Saved successfully!');
        window.location.href = '/cameras';
      }
    } catch(err) {
      console.error(err);
    }
  });
}

// --- Analytics ---
let barChart = null;
let lineChart = null;

async function initAnalytics() {
  const camSelect = document.getElementById('cameraSelect');
  const timeRangeRadios = document.querySelectorAll('input[name="timeRange"]');
  const dateRange = document.getElementById('customDateRange');
  const btnApply = document.getElementById('btnApplyFilter');
  
  try {
    const res = await fetch('/api/cameras');
    if (res.ok) {
      const cams = await res.json();
      cams.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        camSelect.appendChild(opt);
      });
      // Initial load only if cameras are available
      if (cams.length > 0) {
        loadChartData();
      }
    }
  } catch(e){}
  
  timeRangeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      dateRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      if (e.target.value !== 'custom') loadChartData();
    });
  });
  
  camSelect.addEventListener('change', loadChartData);
  btnApply.addEventListener('click', loadChartData);
  
  // Setup tooltip
  if (!document.getElementById('globalChartTooltip')) {
    const tt = document.createElement('div');
    tt.id = 'globalChartTooltip';
    tt.className = 'chart-tooltip';
    document.body.appendChild(tt);
  }
}

async function loadChartData() {
  const camId = document.getElementById('cameraSelect').value;
  if (!camId) return;
  const rangeNode = document.querySelector('input[name="timeRange"]:checked');
  const range = rangeNode ? rangeNode.value : 'weekly';
  
  let url = `/api/analytics/${camId}/${range}`;
  if (range === 'custom') {
    const start = document.getElementById('dateStart').value;
    const end = document.getElementById('dateEnd').value;
    if (!start || !end) return; // Wait until dates are selected
    url += `?start=${start}&end=${end}`;
  }
  
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    
    renderCharts(data);
    
    // Fetch averages
    const avgRes = await fetch(`/api/analytics/${camId}/averages`);
    if (avgRes.ok) {
      const avgData = await avgRes.json();
      
      const elSelected = document.getElementById('avgSelected');
      const elSelectedComp = document.getElementById('avgSelectedCompare');
      const el3Days = document.getElementById('avg3Days');
      const el7Days = document.getElementById('avg7Days');
      const el30Days = document.getElementById('avg30Days');
      
      if (el3Days) el3Days.textContent = avgData.last_3_days;
      if (el7Days) el7Days.textContent = avgData.last_7_days;
      if (el30Days) el30Days.textContent = avgData.last_30_days;
      
      // Compute selected window total
      if (Array.isArray(data)) {
        const selectedTotal = data.reduce((acc, curr) => acc + (curr.in_count || 0) + (curr.out_count || 0), 0);
        if (elSelected) elSelected.textContent = selectedTotal;
        if (elSelectedComp) elSelectedComp.textContent = selectedTotal;
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function renderCharts(data) {
  const barContainer = document.getElementById('barChartContainer');
  const lineContainer = document.getElementById('lineChartContainer');
  
  if (!barContainer || !lineContainer) return;
  
  barContainer.innerHTML = '';
  lineContainer.innerHTML = '';
  
  // Format data: the backend actually returns an array of dicts for hourly, daily, etc.
  // We need to parse it because the previous code assumed {labels, in_counts, out_counts} which was wrong.
  // Wait, let's just make it robust to array of objects like {hour/day, in_count, out_count}
  
  if (!Array.isArray(data) || data.length === 0) {
    barContainer.innerHTML = '<span class="text-muted">No data available</span>';
    lineContainer.innerHTML = '<span class="text-muted">No data available</span>';
    return;
  }
  
  const inCounts = data.map(d => d.in_count || 0);
  const outCounts = data.map(d => d.out_count || 0);
  const maxCount = Math.max(1, ...inCounts, ...outCounts);
  
  // For Trend Overview, show Total Activity (IN + OUT) instead of net change
  const activities = data.map(d => (d.in_count || 0) + (d.out_count || 0));
  const maxAct = Math.max(1, ...activities);
  
  data.forEach((item, i) => {
    let label = `P${i}`;
    if (item.hour) label = item.hour + ':00';
    else if (item.day) label = item.day.substring(5); // MM-DD
    else if (item.week) label = 'Wk ' + item.week;
    else if (item.month) label = 'Mo ' + item.month;
    
    const inC = item.in_count || 0;
    const outC = item.out_count || 0;
    const act = activities[i];
    
    // Bar Chart
    const barCol = document.createElement('div');
    barCol.style = 'display: flex; flex-direction: column; justify-content: flex-end; align-items: center; width: 40px; margin: 0 4px; cursor: pointer;';
    
    const barsWrapper = document.createElement('div');
    barsWrapper.style = 'display: flex; align-items: flex-end; gap: 2px; height: 200px; width: 100%;';
    
    const inH = maxCount > 0 ? (inC / maxCount) * 100 : 0;
    const outH = maxCount > 0 ? (outC / maxCount) * 100 : 0;
    
    barsWrapper.innerHTML = `
      <div style="width: 50%; height: ${inH}%; background: var(--accent); border-radius: 2px 2px 0 0;"></div>
      <div style="width: 50%; height: ${outH}%; background: var(--danger); border-radius: 2px 2px 0 0;"></div>
    `;
    
    // Tooltip logic for bar chart
    barCol.addEventListener('mouseenter', (e) => {
      const tt = document.getElementById('globalChartTooltip');
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${label}</strong><br>IN: <span class="val-in">${inC}</span> | OUT: <span class="val-out">${outC}</span>`;
      tt.style.left = e.pageX + 10 + 'px';
      tt.style.top = e.pageY - 30 + 'px';
    });
    barCol.addEventListener('mousemove', (e) => {
      const tt = document.getElementById('globalChartTooltip');
      tt.style.left = e.pageX + 10 + 'px';
      tt.style.top = e.pageY - 30 + 'px';
    });
    barCol.addEventListener('mouseleave', () => {
      document.getElementById('globalChartTooltip').style.display = 'none';
    });
    
    const labelDiv = document.createElement('div');
    labelDiv.style = 'font-size: 10px; margin-top: 8px; color: var(--text-muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;';
    labelDiv.textContent = label;
    
    barCol.appendChild(barsWrapper);
    barCol.appendChild(labelDiv);
    barContainer.appendChild(barCol);
    
    // Line Chart (represented as bars for simplicity since it's pure CSS)
    const lineCol = document.createElement('div');
    lineCol.style = 'display: flex; flex-direction: column; justify-content: flex-end; align-items: center; width: 40px; margin: 0 4px; cursor: pointer;';
    
    const lineWrapper = document.createElement('div');
    lineWrapper.style = 'display: flex; align-items: flex-end; height: 200px; width: 100%;';
    
    const actH = maxAct > 0 ? (act / maxAct) * 100 : 0;
    lineWrapper.innerHTML = `
      <div style="width: 100%; height: ${actH}%; background: var(--accent2); border-radius: 2px 2px 0 0;"></div>
    `;
    
    // Tooltip logic for line chart
    lineCol.addEventListener('mouseenter', (e) => {
      const tt = document.getElementById('globalChartTooltip');
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${label}</strong><br>Total Traffic: <span class="val-in">${act}</span>`;
      tt.style.left = e.pageX + 10 + 'px';
      tt.style.top = e.pageY - 30 + 'px';
    });
    lineCol.addEventListener('mousemove', (e) => {
      const tt = document.getElementById('globalChartTooltip');
      tt.style.left = e.pageX + 10 + 'px';
      tt.style.top = e.pageY - 30 + 'px';
    });
    lineCol.addEventListener('mouseleave', () => {
      document.getElementById('globalChartTooltip').style.display = 'none';
    });
    
    const lineLabelDiv = document.createElement('div');
    lineLabelDiv.style = 'font-size: 10px; margin-top: 8px; color: var(--text-muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;';
    lineLabelDiv.textContent = label;
    
    lineCol.appendChild(lineWrapper);
    lineCol.appendChild(lineLabelDiv);
    lineContainer.appendChild(lineCol);
  });
}




