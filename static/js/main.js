/**
 * People Counter - Main JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;

  if (path === '/') {
    initDashboard();
  } else if (path === '/cameras') {
    initCameras();
  } else if (path === '/add-camera') {
    initAddCamera();
  } else if (path.startsWith('/roi/')) {
    initROI();
  } else if (path === '/analytics') {
    initAnalytics();
  }
});

// --- Dashboard ---
let dashboardInterval = null;
let activeCameraId = null;

async function fetchSummary() {
  try {
    const res = await fetch('/api/analytics/summary');
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
  const pollToggle = document.getElementById('pollToggle');
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

  if (pollToggle) {
    updateVisibility(pollToggle.checked);
    if (pollToggle.checked) {
      await fetchSummary();
      dashboardInterval = setInterval(fetchSummary, 3000);
    }
    
    pollToggle.addEventListener('change', async (e) => {
      const isOn = e.target.checked;
      updateVisibility(isOn);
      
      if (isOn) {
        await fetchSummary();
        dashboardInterval = setInterval(fetchSummary, 3000);
        loadChartData()
      } else {
        clearInterval(dashboardInterval);
      }
    });
  }

  try {
    const camRes = await fetch('/api/cameras');
    if (camRes.ok) {
      const cameras = await camRes.json();
      const activeCam = cameras.find(c => c.running);
      if (activeCam) {
        activeCameraId = activeCam.id;
      }
    }
  } catch(e) {}

  // Initialize analytics on the dashboard
  initAnalytics();
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
      card.innerHTML = `
        <div class="camera-card-header" style="padding: 16px 20px;">
          <div class="camera-card-info" style="gap: 12px;">
            <div class="camera-icon-wrapper" style="width: 40px; height: 40px; border-radius: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
            </div>
            <div>
              <h2 class="camera-title" style="font-size: 15px; margin-bottom: 2px;">${cam.name}</h2>
              <div class="camera-meta" style="font-size: 12px; gap: 8px;">
                <span class="meta-item"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${cam.location}</span>
                <span class="meta-divider">•</span>
                <span class="meta-item">${statusBadge}</span>
              </div>
            </div>
          </div>
          
          <div class="camera-card-actions" style="gap: 6px;">
            <button class="btn ${cam.running ? 'btn-success' : 'btn-primary'}" style="padding: 6px 12px; font-size: 12px;" onclick="toggleCamera(${cam.id}, ${cam.running})">
              ${cam.running 
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"></rect></svg> Stop' 
                : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Start'}
            </button>
            <a href="/roi/${cam.id}" class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;" title="ROI Setup"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path></svg> ROI</a>
            <button class="btn btn-danger" style="padding: 6px 10px; font-size: 12px;" onclick="deleteCamera(${cam.id})" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
          </div>
        </div>
        
        <div class="camera-card-stream-section" style="padding: 12px 16px 16px 16px;">
          <div class="stream-header" style="margin-bottom: 10px;">
            <div class="stream-title" style="font-size: 13px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 20 14.9"></path><path d="M8 11.899A3 3 0 1 1 16 11.9"></path><circle cx="12" cy="15" r="1"></circle></svg>
              Live Feed
            </div>
            <div class="stream-toggle-wrapper" style="font-size: 12px;">
              <span>Stream</span>
              <label class="switch" style="width: 36px; height: 20px;">
                <input type="checkbox" id="streamToggle_${cam.id}" ${!cam.running ? 'disabled' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
          </div>
          
          <div class="video-wrapper" id="livePreviewContainer_${cam.id}">
            <div class="video-offline">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4; margin-bottom: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="10" y1="15" x2="10" y2="9"></line><line x1="14" y1="15" x2="14" y2="9"></line></svg>
              <div style="font-size: 12px; color: var(--text-muted);">Stream paused to save bandwidth.</div>
            </div>
          </div>
        </div>

        <div class="camera-card-footer" style="padding: 12px 16px; font-size: 11px;">
          <div class="footer-left">
            <span>ROI: ${cam.roi_type || 'None'}</span>
            <span class="meta-divider">•</span>
            <span>Added: ${createdDate}</span>
          </div>
          <div class="footer-right">
            <span>Last Seen: ${lastSeenDate}</span>
          </div>
        </div>
      `;
      grid.appendChild(card);

      const toggle = card.querySelector(`#streamToggle_${cam.id}`);
      const container = card.querySelector(`#livePreviewContainer_${cam.id}`);
      
      toggle.addEventListener('change', () => {
        if (toggle.checked) {
          container.innerHTML = `<img src="/api/stream/${cam.id}?t=${Date.now()}" alt="Live Stream">`;
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
  img.src = `/api/stream/${camId}?snapshot=1`;
  img.onload = () => {
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

  function pointNear(px, py, x, y, r = 8) {
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

  canvas.addEventListener('pointermove', (e) => {
    const p = mousePos(e);
    if (dragging && dragging.type === 'point') {
      roiPoints[dragging.idx] = [p.x, p.y];
      draw();
      return;
    }
    
    if (drawing) {
      tempPoint = [p.x, p.y];
      draw();
    }
  });

  canvas.addEventListener('pointerup', (e) => {
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
    let actualMode = getModeFromPoints();

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
    let amode = getModeFromPoints();
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
    
    // Assuming backend returns { labels: [...], in_counts: [...], out_counts: [...], occupancies: [...] }
    renderCharts(data);
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
