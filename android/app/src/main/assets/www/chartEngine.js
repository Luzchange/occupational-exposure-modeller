/**
 * Zero-Dependency High Performance Chart Engine
 * Renders crisp, responsive time-series and histogram charts on HTML5 Canvas.
 * 100% offline capable for Web and Android WebView.
 */

export class ModellerChart {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.data = null;
    this.options = {};
    this.tooltip = null;
    this._initEvents();
  }

  _initEvents() {
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this._onMouseLeave());
    this.canvas.addEventListener('touchstart', (e) => this._onTouch(e), { passive: true });
    this.canvas.addEventListener('touchmove', (e) => this._onTouch(e), { passive: true });
    this.canvas.addEventListener('touchend', () => this._onMouseLeave());
  }

  _getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (this.canvas.width / rect.width),
      y: (clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  _onMouseMove(e) {
    if (!this.data || this.data.type === 'histogram') return;
    const coords = this._getCanvasCoords(e);
    this._renderHover(coords.x, coords.y);
  }

  _onTouch(e) {
    if (!this.data || this.data.type === 'histogram') return;
    const coords = this._getCanvasCoords(e);
    this._renderHover(coords.x, coords.y);
  }

  _onMouseLeave() {
    this.hoverPos = null;
    this.render(this.data, this.options);
  }

  /**
   * Render Time-Series or Histogram
   */
  render(data, options = {}) {
    this.data = data;
    this.options = options;
    if (!this.canvas || !data) return;

    // Handle high DPI display
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(300, rect.width);
    const height = Math.max(220, rect.height || 300);

    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (data.type === 'histogram') {
      this._renderHistogram(ctx, width, height, data, options);
    } else {
      this._renderTimeSeries(ctx, width, height, data, options);
    }

    ctx.restore();
  }

  _renderTimeSeries(ctx, width, height, data, options) {
    const padding = { top: 30, right: 35, bottom: 45, left: 65 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const series = data.series || [];
    if (series.length === 0 || !series[0].x || series[0].x.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No simulation data available', width / 2, height / 2);
      return;
    }

    // Determine X and Y bounds
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;

    series.forEach(s => {
      if (s.x && s.x.length > 0) maxX = Math.max(maxX, Math.max(...s.x));
      if (s.y && s.y.length > 0) maxY = Math.max(maxY, Math.max(...s.y));
    });

    if (options.thresholds) {
      options.thresholds.forEach(th => {
        if (th.val && Number.isFinite(th.val)) {
          maxY = Math.max(maxY, th.val * 1.05);
        }
      });
    }

    if (maxX === 0) maxX = 480;
    if (maxY === 0) maxY = 10;
    maxY = maxY * 1.15; // 15% top margin

    const getXCoord = (x) => padding.left + ((x - minX) / (maxX - minX)) * chartW;
    const getYCoord = (y) => padding.top + chartH - ((y - minY) / (maxY - minY)) * chartH;

    // Draw Gridlines & Axes
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;

    // Horizontal gridlines (Y)
    const yTicks = 5;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= yTicks; i++) {
      const yVal = minY + (i / yTicks) * (maxY - minY);
      const yPixel = getYCoord(yVal);
      ctx.beginPath();
      ctx.moveTo(padding.left, yPixel);
      ctx.lineTo(width - padding.right, yPixel);
      ctx.stroke();

      const formattedY = yVal >= 100 ? yVal.toFixed(0) : (yVal >= 1 ? yVal.toFixed(1) : yVal.toFixed(3));
      ctx.fillText(formattedY, padding.left - 8, yPixel);
    }

    // Vertical gridlines (X)
    const xTicks = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i <= xTicks; i++) {
      const xVal = minX + (i / xTicks) * (maxX - minX);
      const xPixel = getXCoord(xVal);
      ctx.beginPath();
      ctx.moveTo(xPixel, padding.top);
      ctx.lineTo(xPixel, padding.top + chartH);
      ctx.stroke();

      ctx.fillText(xVal.toFixed(0) + 'm', xPixel, padding.top + chartH + 8);
    }

    // Axis Titles
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.fillText('Time (minutes)', padding.left + chartW / 2, height - 12);

    ctx.save();
    ctx.translate(16, padding.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(options.yUnit || 'Concentration (mg/m³)', 0, 0);
    ctx.restore();

    // Draw Threshold Lines (PEL, TLV, STEL)
    if (options.thresholds) {
      options.thresholds.forEach(th => {
        if (!th.val || th.val <= 0 || th.val > maxY) return;
        const thY = getYCoord(th.val);
        ctx.save();
        ctx.strokeStyle = th.color || '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash(th.dash || [5, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, thY);
        ctx.lineTo(width - padding.right, thY);
        ctx.stroke();

        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = th.color || '#ef4444';
        ctx.textAlign = 'right';
        ctx.fillText(`${th.label}: ${th.val.toFixed(1)}`, width - padding.right, thY - 4);
        ctx.restore();
      });
    }

    // Draw Curves
    series.forEach(s => {
      if (!s.x || s.x.length < 2) return;
      ctx.save();
      ctx.strokeStyle = s.color || '#2563eb';
      ctx.lineWidth = s.width || 2.5;

      // Fill area under curve
      if (s.fill) {
        ctx.beginPath();
        ctx.moveTo(getXCoord(s.x[0]), getYCoord(0));
        for (let i = 0; i < s.x.length; i++) {
          ctx.lineTo(getXCoord(s.x[i]), getYCoord(s.y[i]));
        }
        ctx.lineTo(getXCoord(s.x[s.x.length - 1]), getYCoord(0));
        ctx.closePath();
        ctx.fillStyle = s.fill;
        ctx.fill();
      }

      // Stroke Line
      ctx.beginPath();
      for (let i = 0; i < s.x.length; i++) {
        const px = getXCoord(s.x[i]);
        const py = getYCoord(s.y[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    });

    // Draw Legend
    const legendX = padding.left + 10;
    const legendY = 16;
    let curX = legendX;
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'middle';

    series.forEach(s => {
      ctx.fillStyle = s.color || '#2563eb';
      ctx.fillRect(curX, legendY - 4, 12, 8);
      ctx.fillStyle = '#1f2937';
      ctx.textAlign = 'left';
      ctx.fillText(s.name || 'Series', curX + 16, legendY);
      curX += ctx.measureText(s.name || 'Series').width + 30;
    });

    // Draw Hover Crosshair and Tooltip if active
    if (this.hoverPos && this.hoverPos.x >= padding.left && this.hoverPos.x <= width - padding.right) {
      const hoverXVal = minX + ((this.hoverPos.x - padding.left) / chartW) * (maxX - minX);

      // Draw vertical guide line
      ctx.save();
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(this.hoverPos.x, padding.top);
      ctx.lineTo(this.hoverPos.x, padding.top + chartH);
      ctx.stroke();

      // Find closest values in series
      const tooltipLines = [`t = ${hoverXVal.toFixed(1)} min`];
      series.forEach(s => {
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < s.x.length; i++) {
          const diff = Math.abs(s.x[i] - hoverXVal);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        const py = getYCoord(s.y[closestIdx]);
        // draw circle marker
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(this.hoverPos.x, py, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        tooltipLines.push(`${s.name}: ${s.y[closestIdx].toFixed(2)}`);
      });

      // Tooltip box
      const boxW = 140;
      const boxH = 20 + tooltipLines.length * 15;
      let boxX = this.hoverPos.x + 10;
      if (boxX + boxW > width - padding.right) boxX = this.hoverPos.x - boxW - 10;
      let boxY = padding.top + 10;

      ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 6);
      ctx.fill();

      ctx.fillStyle = '#f9fafb';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      tooltipLines.forEach((line, lIdx) => {
        ctx.fillText(line, boxX + 8, boxY + 16 + lIdx * 15);
      });
      ctx.restore();
    }
  }

  _renderHover(x, y) {
    this.hoverPos = { x, y };
    this.render(this.data, this.options);
  }

  _renderHistogram(ctx, width, height, data, options) {
    const padding = { top: 35, right: 30, bottom: 45, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const hist = data.histogram || {};
    const bins = hist.bins || [];
    const labels = hist.labels || [];
    const oel = data.oel || 0;

    if (bins.length === 0) return;

    const maxCount = Math.max(...bins, 1) * 1.15;
    const binW = chartW / bins.length;

    // Draw Gridlines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    const yTicks = 5;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= yTicks; i++) {
      const yVal = (i / yTicks) * maxCount;
      const yPixel = padding.top + chartH - (i / yTicks) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, yPixel);
      ctx.lineTo(width - padding.right, yPixel);
      ctx.stroke();

      ctx.fillText(Math.round(yVal), padding.left - 8, yPixel);
    }

    // Draw Bars
    const minVal = data.min || 0;
    const maxVal = data.max || 100;
    const valSpan = maxVal - minVal;

    bins.forEach((count, b) => {
      const barH = (count / maxCount) * chartH;
      const xPos = padding.left + b * binW;
      const yPos = padding.top + chartH - barH;
      const binMidVal = Number(labels[b]) || 0;

      // Color red if bin is above OEL, blue if below
      const isExceeding = oel > 0 && binMidVal > oel;
      ctx.fillStyle = isExceeding ? '#ef4444' : '#3b82f6';
      ctx.fillRect(xPos + 1, yPos, Math.max(1, binW - 2), barH);
    });

    // OEL Cutoff Line
    if (oel > 0 && oel >= minVal && oel <= maxVal && valSpan > 0) {
      const oelX = padding.left + ((oel - minVal) / valSpan) * chartW;
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(oelX, padding.top);
      ctx.lineTo(oelX, padding.top + chartH);
      ctx.stroke();

      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`OEL (${oel})`, oelX + 5, padding.top + 15);
      ctx.restore();
    }

    // X Axis Labels (sample 5 labels)
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const step = Math.ceil(bins.length / 5);
    for (let b = 0; b < bins.length; b += step) {
      const xPos = padding.left + b * binW + binW / 2;
      ctx.fillText(labels[b] || '', xPos, padding.top + chartH + 8);
    }

    // Axis titles
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.fillText('Exposure Metric Value (mg/m³ or ppm)', padding.left + chartW / 2, height - 12);

    ctx.save();
    ctx.translate(16, padding.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Frequency (Monte Carlo Runs)', 0, 0);
    ctx.restore();

    // Chart Header
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.fillText(`Monte Carlo Distribution (${data.iterations || 0} iterations)`, padding.left, 18);
  }
}
