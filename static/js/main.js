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

  // Initialize global status for all pages
  initGlobalStatus();
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
      const icon = sidebarToggle.querySelector('svg');
      if (icon) {
        icon.style.transform = shouldCollapse ? 'rotate(180deg)' : 'rotate(0deg)';
      }
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
      const icon = sidebarToggle.querySelector('svg');
      if (icon) {
        icon.style.transform = willCollapse ? 'rotate(180deg)' : 'rotate(0deg)';
      }
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

// --- Global Status ---
let globalStatusInterval = null;

async function initGlobalStatus() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Create global status element in sidebar
  const statusContainer = document.createElement('div');
  statusContainer.style.padding = '16px';
  statusContainer.style.marginTop = 'auto';
  statusContainer.style.borderTop = '1px solid var(--border-subtle)';
  statusContainer.innerHTML = `
    <div class="system-status-title" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">System Status</div>
    <div class="global-status-container" style="display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px;">
      <span id="globalStatusIndicator" style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: var(--text-muted);"></span>
      <span id="globalStatusText" style="color: var(--text-primary);">Idle</span>
    </div>
  `;
  
  // Insert before footer
  const footer = sidebar.querySelector('.sidebar-footer');
  if (footer) {
    sidebar.insertBefore(statusContainer, footer);
  } else {
    sidebar.appendChild(statusContainer);
  }

  async function pollGlobalStatus() {
    try {
      const res = await fetch('/api/cameras?t=' + Date.now());
      if (res.ok) {
        const cameras = await res.json();
        const activeCams = cameras.filter(c => c.running);
        
        const indicator = document.getElementById('globalStatusIndicator');
        const text = document.getElementById('globalStatusText');
        
        if (activeCams.length > 0) {
          // Check stats for the first active camera to see if it's counting or loading
          const statRes = await fetch('/api/cameras/' + activeCams[0].id + '/stats?t=' + Date.now());
          if (statRes.ok) {
            const stats = await statRes.json();
            if (stats.status === 'running') {
              indicator.style.backgroundColor = 'var(--accent-green)';
              text.textContent = 'Counting Active';
            } else if (stats.status === 'loading') {
              indicator.style.backgroundColor = 'var(--accent-yellow)';
              text.textContent = 'Loading Model...';
            } else {
              indicator.style.backgroundColor = 'var(--accent-blue)';
              text.textContent = 'Camera Online';
            }
          }
        } else {
          indicator.style.backgroundColor = 'var(--text-muted)';
          text.textContent = 'Idle';
        }
      }
    } catch(err) {
      console.error('Global status poll error:', err);
    }
  }

  pollGlobalStatus();
  globalStatusInterval = setInterval(pollGlobalStatus, 3000);
}

// --- Dashboard ---
let dashboardInterval = null;
let activeCameraId = null;

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
  await fetchSummary();
  dashboardInterval = setInterval(fetchSummary, 3000);

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

  // Initialize analytics on the dashboard
  initAnalytics();
}

function initSessionControls(cameraId) {
  const btnToggle = document.getElementById('btnToggleCount');
  const activeActionButtons = document.getElementById('activeActionButtons');
  const btnPauseCount = document.getElementById('btnPauseCount');
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

  let currentStatus = 'stopped';

  async function pollStatus() {
    try {
      const res = await fetch(`/api/cameras/${cameraId}/stats?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        currentStatus = data.status;
        
        if (currentStatus === 'running') {
          countingIndicator.style.backgroundColor = 'var(--accent-green)';
          const sessionStr = data.session_name || 'Unknown Lap';
          const classStr = data.class_name ? data.class_name.charAt(0).toUpperCase() + data.class_name.slice(1) : 'Unknown Class';
          countingText.textContent = `Counting Active: ${sessionStr} (${classStr}) | IN: ${data.in_count} | OUT: ${data.out_count}`;
          btnToggle.style.display = 'none';
          activeActionButtons.style.display = 'flex';
        } else if (currentStatus === 'loading') {
          countingIndicator.style.backgroundColor = 'var(--accent-yellow)';
          countingText.textContent = 'Loading model plz wait...';
          btnToggle.style.display = 'none';
          activeActionButtons.style.display = 'none';
        } else {
          countingIndicator.style.backgroundColor = 'var(--text-muted)';
          countingText.textContent = 'Ready to count';
          btnToggle.style.display = 'block';
          btnToggle.textContent = 'Start Counting';
          btnToggle.classList.replace('btn-secondary', 'btn-primary');
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

  btnToggle.addEventListener('click', async () => {
    // Open modal
    inputName.value = '';
    existingSessionSelect.innerHTML = '<option value="">-- Create New Lap --</option>';
    newSessionFields.style.display = 'block';
    
    // Fetch existing sessions
    try {
      const res = await fetch(`/api/sessions/${cameraId}?t=${Date.now()}`);
        if (res.ok) {
          const sessions = await res.json();
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
        body: JSON.stringify({camera_id: cameraId})
      });
      if (res.ok) {
        currentStatus = 'stopped';
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

  btnExitSession?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to exit the current lap?')) return;
    
    if (btnPauseCount) btnPauseCount.disabled = true;
    btnExitSession.disabled = true;
    countingText.textContent = 'Exiting...';
    
    try {
      const res = await fetch('/api/sessions/stop', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({camera_id: cameraId})
      });
      if (res.ok) {
        currentStatus = 'stopped';
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
    currentStatus = 'loading';
    countingIndicator.style.backgroundColor = 'var(--accent-yellow)';
    countingText.textContent = 'Loading model plz wait...';
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
            camera_id: cameraId,
            name: name,
            target_class: parseInt(inputClass.value) || 0
          })
        });
      }
      
      if (!res.ok) {
        const data = await res.json();
        alert(data.detail || data.error || "Failed to start counting.");
        currentStatus = 'stopped';
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
        <div class="camera-card-header" style="padding: 20px; border-bottom: 1px solid var(--border-subtle);">
          <div class="camera-card-info" style="display: flex; gap: 16px; align-items: center;">
            <div class="camera-icon-wrapper" style="width: 48px; height: 48px; border-radius: var(--radius-lg); background: var(--bg-input); display: flex; align-items: center; justify-content: center; color: var(--accent-blue); flex-shrink: 0;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
            </div>
            <div style="flex: 1; min-width: 0;">
              <h2 class="camera-title" style="font-size: 16px; font-weight: 600; margin: 0 0 4px 0; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cam.name}</h2>
              <div class="camera-meta" style="font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
                <span class="meta-item" style="display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${cam.location}</span>
                <span class="meta-divider" style="color: var(--border-subtle);">•</span>
                <span class="meta-item" style="flex-shrink: 0;">${statusBadge}</span>
              </div>
            </div>
          </div>
          
          <div class="camera-card-actions" style="display: flex; gap: 8px; margin-top: 20px;">
            <button class="btn ${cam.running ? 'btn-danger' : 'btn-success'}" style="flex: 1;" onclick="toggleCamera(${cam.id}, ${cam.running})">
              ${cam.running 
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop' 
                : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 6px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start'}
            </button>
            <a href="/edit-camera/${cam.id}" class="btn btn-outline" style="flex: 1; display: flex; justify-content: center; align-items: center;" title="Edit Camera"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</a>
            <a href="/roi/${cam.id}" class="btn btn-outline" style="flex: 1; display: flex; justify-content: center; align-items: center;" title="ROI Setup"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path></svg> ROI</a>
            <button class="btn btn-outline" style="padding: 0 14px; color: var(--danger); border-color: var(--danger-subtle);" onclick="deleteCamera(${cam.id})" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        </div>
        
        <div class="camera-card-stream-section" style="padding: 20px;">
          <div class="stream-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div class="stream-title" style="font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: ${cam.running ? 'var(--accent-green)' : 'var(--text-muted)'}; display: inline-block;"></span>
              Live Feed
            </div>
            <div class="stream-toggle-wrapper" style="font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
              <span>Stream</span>
              <label class="switch" style="width: 36px; height: 20px; margin: 0;">
                <input type="checkbox" id="streamToggle_${cam.id}" ${!cam.running ? 'disabled' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          
          <div class="video-wrapper" id="livePreviewContainer_${cam.id}" style="width: 100%; aspect-ratio: 16/9; background: #000; border-radius: var(--radius-md); overflow: hidden; display: flex; justify-content: center; align-items: center; border: 1px solid var(--border-subtle);">
            <div class="video-offline" style="text-align: center; color: var(--text-muted);">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4; margin-bottom: 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>
              <div style="font-size: 13px;">Stream paused to save bandwidth.</div>
            </div>
          </div>
        </div>

        <div class="camera-card-footer" style="padding: 14px 20px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; background: var(--bg-surface);">
          <div class="footer-left" style="display: flex; gap: 8px;">
            <span>ROI: <span style="color: var(--text-primary); font-weight: 500;">${cam.roi_type || 'None'}</span></span>
            <span class="meta-divider" style="color: var(--border-subtle);">•</span>
            <span>Added: ${createdDate.split(' ')[0]}</span>
          </div>
          <div class="footer-right">
            <span>Seen: ${lastSeenDate.split(' ')[0]}</span>
          </div>
        </div>
      `;
      grid.appendChild(card);

      const toggle = card.querySelector(`#streamToggle_${cam.id}`);
      const container = card.querySelector(`#livePreviewContainer_${cam.id}`);
      
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          container.innerHTML = `<img src="/api/stream/${cam.id}?t=${Date.now()}" alt="Live Stream" style="width: 100%; height: 100%; object-fit: cover; background: #111;" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'800\\\' height=\\\'450\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%23111\\\'/><text x=\\\'50%\\\' y=\\\'50%\\\' font-family=\\\'sans-serif\\\' font-size=\\\'16px\\\' fill=\\\'%23666\\\' text-anchor=\\\'middle\\\' dominant-baseline=\\\'middle\\\'>Stream Offline</text></svg>';">`;
        } else {
          container.innerHTML = `
            <div class="video-offline">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5; margin-bottom: 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>
              <div>Stream paused to save bandwidth.</div>
            </div>
          `;
        }
      });
    });
  } catch (err) {
    grid.innerHTML = '<div class="card"><div style="text-align:center; padding: 20px; color:var(--danger)">Error loading cameras.</div></div>';
    console.error(err);
  }
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
  const btnFinishPoly = document.getElementById('finishPoly');
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
    btnFinishPoly.style.display = (mode === 'poly' && roiPoints.length >= 3) ? 'inline-flex' : 'none';
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
      if (id === 'modeLine') { mode = 'line'; currentShapeType = 'line'; }
      if (id === 'modeRect') { mode = 'rect'; currentShapeType = 'rect'; }
      if (id === 'modePoly') { mode = 'poly'; currentShapeType = 'poly'; }
      if (id === 'modeSelect') mode = 'select';
      
      if (mode !== 'select' && roiPoints.length > 0 && currentShapeType !== getModeFromPoints()) {
         if (!confirm('Clear existing region and change mode?')) {
            mode = 'select';
            updateToolbar();
            return;
         }
         roiPoints = [];
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
  btnFinishPoly.addEventListener('click', () => { mode = 'select'; updateToolbar(); updatePanel(); draw(); });
  
  dirSelect.addEventListener('change', () => { lineDirection = dirSelect.value; draw(); });
  btnFlip.addEventListener('click', () => {
    if (lineDirection === 'both') lineDirection = 'reversed';
    else if (lineDirection === 'reversed') lineDirection = 'both';
    else if (lineDirection === 'in') lineDirection = 'out';
    else if (lineDirection === 'out') lineDirection = 'in';
    dirSelect.value = lineDirection;
    draw();
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
      if (e.detail === 2) {
        // Double click: finish poly
        drawing = false;
        tempPoint = null;
        mode = 'select';
        updateToolbar();
      } else {
        roiPoints.push([p.x, p.y]);
        drawing = true;
        updateToolbar();
      }
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

function initThemeToggle() {
  const toggleBtn = document.getElementById('themeToggle');
  if (!toggleBtn) return;
  const iconDark = document.getElementById('themeIconDark');
  const iconLight = document.getElementById('themeIconLight');

  function applyThemeUI(theme) {
    if (theme === 'light') {
      iconLight.style.display = 'none';
      iconDark.style.display = 'block';
    } else {
      iconLight.style.display = 'block';
      iconDark.style.display = 'none';
    }
  }

  let currentTheme = document.documentElement.getAttribute('data-theme');
  if (!currentTheme) {
    // Fallback if no attribute but script set something or prefers-color-scheme
    currentTheme = 'dark'; // By default root is dark
  }
  applyThemeUI(currentTheme);

  toggleBtn.addEventListener('click', () => {
    let newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    if(newTheme === 'dark') {
      document.documentElement.removeAttribute('data-theme'); // default to root
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    localStorage.setItem('app-theme', newTheme);
    applyThemeUI(newTheme);
  });
}
