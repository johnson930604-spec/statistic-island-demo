// 統計學習島 STAT ISLAND — 互動式統計模擬器 (12 座島專屬 Canvas 實驗) ＆ 統計方法決策樹診斷器
(function () {
  let activeSimIsland = null;
  let simValues = {};
  let missionPassed = false;
  let quizPassed = false;

  // 常態機率密度函數
  function normalPDF(x, mean, sd) {
    const z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  }

  // 誤差函數近似 (計算常態累積機率 Φ)
  function normCDF(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }

  // 檢查各島模擬器是否達成互動任務目標
  function evaluateSimMission(type, v) {
    switch (type) {
      case "hist_skew": {
        const mean = 50 + v.skew * 9.5;
        const median = 50 + v.skew * 2.2;
        const ok = v.skew >= 1.2 && v.bins >= 12;
        return {
          ok,
          metrics: `算術平均數 x̄ = ${mean.toFixed(1)} ｜ 中位數 M = ${median.toFixed(1)} ｜ 組數 Bins = ${v.bins}`,
          msg: ok
            ? "✓ 任務達成！右偏極端值明顯把算術平均數 x̄ 拉向在右尾，高於中位數 M。"
            : "請將「偏態程度」調至 ≥ 1.2 且「直方圖組數」調至 ≥ 12 以完成觀察任務。"
        };
      }
      case "mean_sd": {
        const base = [42, 46, 49, 50, 51, 53, 55];
        const arr = [...base, v.outlier];
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const median = 50.5;
        const ok = v.outlier >= 90 && v.sd <= 10;
        return {
          ok,
          metrics: `含極端值平均 x̄ = ${mean.toFixed(1)} ｜ 中位數 M = ${median.toFixed(1)} ｜ 樣本標準差 s = ${(v.sd + (v.outlier - 50) * 0.25).toFixed(1)}`,
          msg: ok
            ? "✓ 任務達成！單一極端值（≥90）大幅拉動平均數重心並使標準差膨脹，中位數則維持穩健。"
            : "請將「單一極端值數值」推到 ≥ 90，並將「主群體標準差」調至 ≤ 10。"
        };
      }
      case "normal_z": {
        const tail2 = 2 * (1 - normCDF(v.zcut));
        const center = (1 - tail2) * 100;
        const ok = Math.abs(v.zcut - 1.96) <= 0.08;
        return {
          ok,
          metrics: `臨界值 Z = ±${v.zcut.toFixed(2)} ｜ 中央面積 = ${center.toFixed(1)}% ｜ 雙尾顯著水準 α = ${tail2.toFixed(3)}`,
          msg: ok
            ? "✓ 任務達成！Z = ±1.96 精準圍出中央 95% 機率面積，左右雙尾各佔 2.5%（合計 α = 0.05）。"
            : "請將雙尾臨界值 |Z| 調整至約 1.96（範圍 1.88 ~ 2.04），觀察 95% 面積分界線。"
        };
      }
      case "clt_sim": {
        const se = 15 / Math.sqrt(v.n);
        const sampleSkew = v.popSkew / Math.sqrt(v.n);
        const ok = v.n >= 30;
        return {
          ok,
          metrics: `樣本數 n = ${v.n} ｜ 標準誤 SE = σ/√n = ${se.toFixed(2)} ｜ x̄ 偏態係數 ≈ ${sampleSkew.toFixed(2)}`,
          msg: ok
            ? "✓ 任務達成！當 n ≥ 30 時，即使母體右偏，樣本平均數 x̄ 的抽樣分配依然收斂為窄高的常態鐘型！"
            : "請將「每次抽樣樣本數 n」拉到 ≥ 30，觀察標準誤縮小與常態鐘型收斂。"
        };
      }
      case "ci_capture": {
        const alpha = (100 - v.conf) / 100;
        const zCrit = v.conf >= 99 ? 2.58 : v.conf >= 95 ? 1.96 : 1.645;
        const me = zCrit * (12 / Math.sqrt(v.n));
        const ok = v.conf >= 95 && v.n >= 25;
        return {
          ok,
          metrics: `${v.conf}% 信賴區間 ｜ 誤差界限 ±${me.toFixed(2)} ｜ 預期涵蓋率 ≈ ${v.conf}% (α=${alpha.toFixed(2)})`,
          msg: ok
            ? "✓ 任務達成！20 次重複抽樣中絕大多數區間成功網住中央真值 μ，且 n 越大區間越窄！"
            : "請將「信心水準」調至 ≥ 95% 且「樣本數 n」拉到 ≥ 25。"
        };
      }
      case "power_alpha": {
        const se = 3.2 / Math.sqrt(v.n);
        const ncp = v.effect / se;
        const power = 1 - normCDF(1.96 - ncp);
        const ok = power >= 0.8 && v.effect >= 2.0 && v.n >= 25;
        return {
          ok,
          metrics: `非中心參數 δ = ${ncp.toFixed(2)} ｜ 型二錯誤率 β = ${(1 - power).toFixed(2)} ｜ 檢定力 Power (1−β) = ${(power * 100).toFixed(1)}%`,
          msg: ok
            ? "✓ 任務達成！檢定力 Power 突破 80% 黃金門檻，大幅降低縱放真實效果的型二錯誤 β！"
            : "請調高「真實平均數差距 Δμ ≥ 2.0」且「樣本數 n ≥ 25」，使檢定力 Power 達 80% 以上。"
        };
      }
      case "two_sample_t": {
        const se = Math.sqrt((v.sd * v.sd) / 25 + (v.sd * v.sd) / 25);
        const tVal = v.diff / se;
        const pVal = 2 * (1 - normCDF(Math.abs(tVal)));
        const d = v.diff / v.sd;
        const ok = v.diff >= 8 && v.sd <= 10;
        return {
          ok,
          metrics: `t = ${tVal.toFixed(2)} (df=48) ｜ 雙尾 p = ${pVal < 0.001 ? "< 0.001" : pVal.toFixed(3)} ｜ 效果量 Cohen's d = ${d.toFixed(2)}`,
          msg: ok
            ? "✓ 任務達成！當組間平均差距擴大、組內標準差縮小，兩組分佈明顯分離且 p < 0.05！"
            : "請將「兩組平均數差距」拉到 ≥ 8 且「組內標準差 s」調至 ≤ 10。"
        };
      }
      case "paired_t": {
        const n = 20;
        const se = v.sdDiff / Math.sqrt(n);
        const tVal = v.meanDiff / se;
        const pVal = 2 * (1 - normCDF(Math.abs(tVal)));
        const ok = v.meanDiff >= 4 && v.sdDiff <= 5;
        return {
          ok,
          metrics: `配對平均差 d̄ = +${v.meanDiff.toFixed(1)} ｜ 標準誤 SE_d = ${se.toFixed(2)} ｜ 成對 t = ${tVal.toFixed(2)} (p = ${pVal < 0.001 ? "<0.001" : pVal.toFixed(3)})`,
          msg: ok
            ? "✓ 任務達成！透過每位受試者前後相減消除個體基準差異，成對 t 統計量顯著突破臨界值！"
            : "請將「平均進步差值 d̄」調至 ≥ 4 且「差值標準差 s_d」調至 ≤ 5。"
        };
      }
      case "anova_f": {
        const msb = v.between * v.between * 12;
        const msw = v.within * v.within;
        const fVal = msb / msw;
        const eta2 = (2 * msb) / (2 * msb + 42 * msw);
        const ok = v.between >= 10 && v.within <= 6;
        return {
          ok,
          metrics: `組間均方 MSB = ${msb.toFixed(0)} ｜ 組內均方 MSW = ${msw.toFixed(0)} ｜ F = ${fVal.toFixed(2)} ｜ η² = ${(eta2 * 100).toFixed(1)}%`,
          msg: ok
            ? "✓ 任務達成！組間訊號 MSB 遠大於組內雜訊 MSW，F 比值顯著（p < 0.001），可啟動 Tukey 事後比較！"
            : "請將「三組平均數分離度」拉到 ≥ 10 且「組內標準差雜訊」調至 ≤ 6。"
        };
      }
      case "chisq_sim": {
        const half = v.totalN;
        const o11 = Math.round(half * 0.5 + v.assoc);
        const o12 = half - o11;
        const o21 = Math.round(half * 0.5 - v.assoc);
        const o22 = half - o21;
        const e = half * 0.5;
        const chi2 =
          ((o11 - e) ** 2 + (o12 - e) ** 2 + (o21 - e) ** 2 + (o22 - e) ** 2) / e;
        const vCramer = Math.sqrt(chi2 / (2 * half));
        const ok = v.assoc >= 25 && chi2 >= 3.84;
        return {
          ok,
          metrics: `期望次數 E = ${e.toFixed(0)} ｜ 卡方統計量 χ² = ${chi2.toFixed(2)} (臨界值 3.84) ｜ Cramér's V = ${vCramer.toFixed(2)}`,
          msg: ok
            ? "✓ 任務達成！觀察次數 O 大幅偏離獨立期望次數 E，χ² > 3.84（p < 0.05），證實兩類別變數顯著關聯！"
            : "請將「類別關聯偏離度 (O − E)」拉高至 ≥ 25，使 χ² 大於 3.84。"
        };
      }
      case "corr_scatter": {
        const effR = Math.max(-0.98, Math.min(0.98, v.rTarget - v.outlierPull * 0.06));
        const r2 = effR * effR * 100;
        const ok = v.rTarget >= 0.75 && v.outlierPull === 0;
        return {
          ok,
          metrics: `樣本相關係數 r = ${effR.toFixed(2)} ｜ 共同變異 r² = ${r2.toFixed(1)}% ｜ 離群干擾 = ${v.outlierPull}`,
          msg: ok
            ? "✓ 任務達成！排除離群干擾點後，散佈點群沿一、三象限對角線緊密排列，呈現高度正相關！"
            : "請將「真實線性相關 r」拉到 ≥ 0.75，並將「極端離群點干擾幅度」歸零（0）。"
        };
      }
      case "ols_reg": {
        const trueB1 = 1.6;
        const trueB0 = 22;
        const errB1 = Math.abs(v.b1 - trueB1);
        const errB0 = Math.abs(v.b0 - trueB0);
        const sse = 180 + errB1 * errB1 * 420 + errB0 * errB0 * 3.2;
        const r2 = Math.max(0, 1 - sse / 1800);
        const ok = errB1 <= 0.31 && errB0 <= 6;
        return {
          ok,
          metrics: `目前直線 ŷ = ${v.b0} + ${v.b1.toFixed(1)}x ｜ 殘差平方和 SSE = ${sse.toFixed(0)} (最小最佳值≈180) ｜ R² = ${(r2 * 100).toFixed(1)}%`,
          msg: ok
            ? "✓ 任務達成！你的直線已貼近最小平方法（OLS）最佳解 ŷ = 22 + 1.6x，殘差平方和 SSE 降至最低！"
            : "請調整斜率 b₁ 接近 1.6、截距 b₀ 接近 22，讓橘色自訂直線貼合紅色 OLS 最佳迴歸線。"
        };
      }
      default:
        return { ok: true, metrics: "", msg: "" };
    }
  }

  // 繪製 12 座島專屬互動統計圖表
  function drawSimulatorCanvas(type, v) {
    const canvas = document.getElementById("sim-canvas");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || 660;
    const H = rect.height || 230;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fffaf6";
    ctx.fillRect(0, 0, W, H);

    // 底部座標軸線
    const padL = 48, padR = 28, padT = 28, padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const baseY = padT + plotH;

    ctx.strokeStyle = "#d9c6b5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, baseY);
    ctx.lineTo(W - padR, baseY);
    ctx.stroke();

    ctx.font = "700 12px 'Noto Sans TC', sans-serif";

    if (type === "hist_skew") {
      const bins = v.bins;
      const skew = v.skew;
      const barW = plotW / bins;
      for (let i = 0; i < bins; i++) {
        const u = (i + 0.5) / bins; // 0~1
        const center = skew >= 0 ? 0.35 - skew * 0.08 : 0.65 - skew * 0.08;
        const dist = u - center;
        const spread = dist >= 0 ? 0.18 + Math.max(0, skew) * 0.14 : 0.18 + Math.max(0, -skew) * 0.14;
        const hRatio = Math.exp(-0.5 * (dist / spread) ** 2);
        const bh = Math.max(4, hRatio * (plotH - 18));
        ctx.fillStyle = "rgba(62, 124, 140, 0.75)";
        ctx.strokeStyle = "#295966";
        ctx.fillRect(padL + i * barW + 2, baseY - bh, barW - 4, bh);
        ctx.strokeRect(padL + i * barW + 2, baseY - bh, barW - 4, bh);
      }
      // 畫平均數與中位數垂直標線
      const medianX = padL + (0.48 + skew * 0.03) * plotW;
      const meanX = padL + (0.48 + skew * 0.11) * plotW;
      ctx.strokeStyle = "#5e9a6f";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(medianX, padT);
      ctx.lineTo(medianX, baseY);
      ctx.stroke();
      ctx.fillStyle = "#2d6a3e";
      ctx.fillText("中位數 M", medianX - 24, padT + 12);

      ctx.strokeStyle = "#db6a41";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(meanX, padT + 16);
      ctx.lineTo(meanX, baseY);
      ctx.stroke();
      ctx.fillStyle = "#b64e28";
      ctx.fillText("平均數 x̄", meanX - 24, padT + 28);
    } else if (type === "mean_sd") {
      const pts = [42, 46, 49, 50, 51, 53, 55, v.outlier];
      const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
      const mapX = (val) => padL + ((val - 30) / 75) * plotW;

      // 畫標準差帶
      const meanPx = mapX(mean);
      const sdPx = (v.sd / 75) * plotW;
      ctx.fillStyle = "rgba(219, 106, 65, 0.14)";
      ctx.fillRect(meanPx - sdPx, padT + 20, sdPx * 2, plotH - 30);

      // 畫各資料點
      pts.forEach((p, idx) => {
        const px = mapX(p);
        const isOut = idx === pts.length - 1;
        ctx.beginPath();
        ctx.arc(px, baseY - 28, isOut ? 9 : 6.5, 0, Math.PI * 2);
        ctx.fillStyle = isOut ? "#db6a41" : "#3e7c8c";
        ctx.fill();
        if (isOut) {
          ctx.fillStyle = "#b64e28";
          ctx.fillText(`極端值 ${p}`, px - 28, baseY - 44);
        }
      });

      // 支點三角形 (平均數 vs 中位數)
      const medPx = mapX(50.5);
      ctx.fillStyle = "#5e9a6f";
      ctx.fillText("中位數 M = 50.5", medPx - 42, padT + 18);
      ctx.strokeStyle = "#5e9a6f";
      ctx.beginPath();
      ctx.moveTo(medPx, padT + 24);
      ctx.lineTo(medPx, baseY);
      ctx.stroke();

      ctx.fillStyle = "#db6a41";
      ctx.fillText(`重心 x̄ = ${mean.toFixed(1)}`, meanPx - 36, padT + 38);
      ctx.strokeStyle = "#db6a41";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(meanPx, padT + 44);
      ctx.lineTo(meanPx, baseY);
      ctx.stroke();
    } else if (type === "normal_z") {
      const zCut = v.zcut;
      const mapX = (z) => padL + ((z + 3.5) / 7) * plotW;
      const maxPdf = normalPDF(0, 0, 1);
      const mapY = (z) => baseY - (normalPDF(z, 0, 1) / maxPdf) * (plotH - 20);

      // 塗色中央區間與雙尾拒絕域
      for (let i = 0; i < 140; i++) {
        const z1 = -3.5 + (i / 140) * 7;
        const z2 = -3.5 + ((i + 1) / 140) * 7;
        const zm = 0.5 * (z1 + z2);
        ctx.fillStyle =
          Math.abs(zm) > zCut
            ? "rgba(219, 106, 65, 0.55)"
            : "rgba(62, 124, 140, 0.28)";
        ctx.beginPath();
        ctx.moveTo(mapX(z1), baseY);
        ctx.lineTo(mapX(z1), mapY(z1));
        ctx.lineTo(mapX(z2), mapY(z2));
        ctx.lineTo(mapX(z2), baseY);
        ctx.closePath();
        ctx.fill();
      }
      // 畫常態曲線
      ctx.strokeStyle = "#211d1d";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const z = -3.5 + (i / 140) * 7;
        if (i === 0) ctx.moveTo(mapX(z), mapY(z));
        else ctx.lineTo(mapX(z), mapY(z));
      }
      ctx.stroke();

      ctx.fillStyle = "#b64e28";
      ctx.fillText(`-Z = -${zCut.toFixed(2)}`, mapX(-zCut) - 36, padT + 18);
      ctx.fillText(`+Z = +${zCut.toFixed(2)}`, mapX(zCut) - 26, padT + 18);
      ctx.fillStyle = "#211d1d";
      ctx.fillText("Z = 0 (μ)", mapX(0) - 24, baseY + 20);
    } else if (type === "clt_sim") {
      // 同時畫灰色「右偏母體分佈」與橘色「樣本平均數 x̄ 抽樣分配」
      const seRatio = 1 / Math.sqrt(v.n);
      const mapX = (u) => padL + u * plotW;

      // 母體曲線 (灰色虛線)
      ctx.strokeStyle = "#8c7a6b";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const u = i / 100;
        const d = u - 0.35;
        const sp = d >= 0 ? 0.22 + v.popSkew * 0.12 : 0.14;
        const y = baseY - Math.exp(-0.5 * (d / sp) ** 2) * (plotH * 0.55);
        if (i === 0) ctx.moveTo(mapX(u), y);
        else ctx.lineTo(mapX(u), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 樣本平均數抽樣分配 (橘色實線鐘型)
      const sdU = Math.max(0.035, 0.22 * seRatio);
      ctx.fillStyle = "rgba(219, 106, 65, 0.28)";
      ctx.strokeStyle = "#db6a41";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(mapX(0), baseY);
      for (let i = 0; i <= 120; i++) {
        const u = i / 120;
        const d = u - 0.5;
        const h = Math.exp(-0.5 * (d / sdU) ** 2) * (plotH * 0.9);
        ctx.lineTo(mapX(u), baseY - h);
      }
      ctx.lineTo(mapX(1), baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#6e5d53";
      ctx.fillText("灰色虛線：原始右偏母體分佈 (SD = σ)", padL + 8, padT + 14);
      ctx.fillStyle = "#b64e28";
      ctx.fillText(`橘色鐘型：樣本平均數 x̄ 抽樣分配 (n=${v.n}, SE = σ/√n)`, padL + 8, padT + 34);
    } else if (type === "ci_capture") {
      const muX = padL + plotW * 0.5;
      // 真值 μ 垂直線
      ctx.strokeStyle = "#db6a41";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(muX, padT - 6);
      ctx.lineTo(muX, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#b64e28";
      ctx.fillText("母體真值 μ", muX - 30, padT - 10);

      const zCrit = v.conf >= 99 ? 2.58 : v.conf >= 95 ? 1.96 : 1.44;
      const halfW = (zCrit * (95 / Math.sqrt(v.n)));
      const offsets = [
        -0.2, 0.35, -0.55, 0.12, -0.8, 1.85, -0.1, 0.45, -0.38, 0.62,
        -0.25, 0.18, -1.72, 0.3, -0.42, 0.08, -0.6, 0.5, -0.15, 0.28
      ];
      let hitCount = 0;
      offsets.forEach((off, i) => {
        const y = padT + 8 + i * ((plotH - 12) / 20);
        const center = muX + off * (68 / Math.sqrt(v.n));
        const L = center - halfW;
        const R = center + halfW;
        const hit = L <= muX && R >= muX;
        if (hit) hitCount++;
        ctx.strokeStyle = hit ? "#3e7c8c" : "#d64545";
        ctx.lineWidth = hit ? 2 : 2.5;
        ctx.beginPath();
        ctx.moveTo(L, y);
        ctx.lineTo(R, y);
        ctx.stroke();
        ctx.fillStyle = hit ? "#211d1d" : "#d64545";
        ctx.beginPath();
        ctx.arc(center, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#211d1d";
      ctx.fillText(`20 次抽樣區間中成功網住 μ：${hitCount} / 20 條`, padL + 8, baseY + 22);
    } else if (type === "power_alpha" || type === "two_sample_t") {
      const shift = type === "power_alpha" ? v.effect * 0.9 : v.diff * 0.22;
      const sdScale = type === "power_alpha" ? 2.6 / Math.sqrt(v.n) : v.sd * 0.08;
      const mapX = (x) => padL + ((x + 3.5) / 9.5) * plotW;
      const maxP = normalPDF(0, 0, sdScale);
      const mapY = (x, m) => baseY - (normalPDF(x, m, sdScale) / maxP) * (plotH - 22);

      const critX = 1.96 * sdScale;

      // 塗色 Power 區域 (H1 分佈在臨界值右側面積)
      for (let i = 0; i < 120; i++) {
        const x1 = critX + (i / 120) * 5;
        const x2 = critX + ((i + 1) / 120) * 5;
        ctx.fillStyle = "rgba(94, 154, 111, 0.38)";
        ctx.beginPath();
        ctx.moveTo(mapX(x1), baseY);
        ctx.lineTo(mapX(x1), mapY(x1, shift));
        ctx.lineTo(mapX(x2), mapY(x2, shift));
        ctx.lineTo(mapX(x2), baseY);
        ctx.closePath();
        ctx.fill();
      }

      // H0 或 第 1 組曲線
      ctx.strokeStyle = "#3e7c8c";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const x = -3.5 + (i / 140) * 9.5;
        if (i === 0) ctx.moveTo(mapX(x), mapY(x, 0));
        else ctx.lineTo(mapX(x), mapY(x, 0));
      }
      ctx.stroke();

      // H1 或 第 2 組曲線
      ctx.strokeStyle = "#db6a41";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 140; i++) {
        const x = -3.5 + (i / 140) * 9.5;
        if (i === 0) ctx.moveTo(mapX(x), mapY(x, shift));
        else ctx.lineTo(mapX(x), mapY(x, shift));
      }
      ctx.stroke();

      // 臨界線
      ctx.strokeStyle = "#211d1d";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mapX(critX), padT);
      ctx.lineTo(mapX(critX), baseY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#3e7c8c";
      ctx.fillText(type === "power_alpha" ? "H₀ 分佈" : "對照組 x̄₂", mapX(0) - 24, padT + 14);
      ctx.fillStyle = "#db6a41";
      ctx.fillText(type === "power_alpha" ? "H₁ 真實分佈 (綠色=Power 1−β)" : "實驗組 x̄₁", mapX(shift) - 28, padT + 14);
    } else if (type === "paired_t") {
      // 繪製 10 位受試者前測 → 後測配對斜率連線圖
      const x1 = padL + plotW * 0.25;
      const x2 = padL + plotW * 0.75;
      const baseScores = [35, 42, 48, 52, 58, 63, 68, 74, 79, 85];
      const jitter = [-1.2, 0.8, -0.5, 1.1, -0.9, 0.4, 1.3, -0.7, 0.6, -1.0];

      ctx.fillStyle = "#211d1d";
      ctx.fillText("前測 (Pre-test)", x1 - 38, baseY + 22);
      ctx.fillText("後測 (Post-test)", x2 - 42, baseY + 22);

      baseScores.forEach((pre, idx) => {
        const post = pre + v.meanDiff * 2.5 + jitter[idx] * v.sdDiff * 0.8;
        const y1 = baseY - ((pre - 25) / 80) * plotH;
        const y2 = baseY - ((post - 25) / 80) * plotH;
        ctx.strokeStyle = post >= pre ? "rgba(94, 154, 111, 0.75)" : "rgba(214, 69, 69, 0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.fillStyle = "#3e7c8c";
        ctx.beginPath();
        ctx.arc(x1, y1, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#db6a41";
        ctx.beginPath();
        ctx.arc(x2, y2, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#1f5130";
      ctx.fillText("每一條連線代表同一位受試者的前後變化 dᵢ = X_後 − X_前", padL + 12, padT + 12);
    } else if (type === "anova_f") {
      // 繪製 A, B, C 三組常態曲線與點群
      const centers = [-v.between, 0, v.between];
      const colors = ["#3e7c8c", "#d99b1e", "#db6a41"];
      const names = ["組別 A", "組別 B", "組別 C"];
      const mapX = (x) => padL + ((x + 28) / 56) * plotW;
      const maxP = normalPDF(0, 0, v.within);

      centers.forEach((c, idx) => {
        ctx.strokeStyle = colors[idx];
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const x = -28 + (i / 120) * 56;
          const y = baseY - (normalPDF(x, c, v.within) / maxP) * (plotH - 26);
          if (i === 0) ctx.moveTo(mapX(x), y);
          else ctx.lineTo(mapX(x), y);
        }
        ctx.stroke();
        ctx.fillStyle = colors[idx];
        ctx.fillText(names[idx], mapX(c) - 18, padT + 14 + idx * 14);
      });
    } else if (type === "chisq_sim") {
      // 繪製 2x2 列聯表觀察值 O vs 期望值 E 雙長條對照
      const half = v.totalN;
      const e = half * 0.5;
      const cells = [
        { label: "A組×是", o: Math.round(e + v.assoc), e },
        { label: "A組×否", o: Math.round(e - v.assoc), e },
        { label: "B組×是", o: Math.round(e - v.assoc), e },
        { label: "B組×否", o: Math.round(e + v.assoc), e }
      ];
      const groupW = plotW / 4;
      cells.forEach((c, i) => {
        const gx = padL + i * groupW + 18;
        const hO = (c.o / (half * 0.95)) * (plotH - 24);
        const hE = (c.e / (half * 0.95)) * (plotH - 24);

        // 觀察次數 O
        ctx.fillStyle = "#db6a41";
        ctx.fillRect(gx, baseY - hO, 28, hO);
        ctx.fillStyle = "#211d1d";
        ctx.fillText(`O=${c.o}`, gx - 2, baseY - hO - 6);

        // 期望次數 E
        ctx.fillStyle = "#b9aba0";
        ctx.fillRect(gx + 34, baseY - hE, 28, hE);
        ctx.fillStyle = "#6e5d53";
        ctx.fillText(`E=${c.e}`, gx + 32, baseY - hE - 6);

        ctx.fillStyle = "#211d1d";
        ctx.fillText(c.label, gx + 6, baseY + 20);
      });
    } else if (type === "corr_scatter" || type === "ols_reg") {
      // 散佈圖與迴歸線
      const nPts = 28;
      for (let i = 0; i < nPts; i++) {
        const u = (i + 1) / (nPts + 1);
        const zNoise = Math.sin(i * 7.3) * 0.55 + Math.cos(i * 3.7) * 0.45;
        let xVal = u * 20;
        let yVal;
        if (type === "corr_scatter") {
          const r = v.rTarget;
          const stdY = r * (u - 0.5) * 2.2 + Math.sqrt(Math.max(0.04, 1 - r * r)) * zNoise * 0.7;
          yVal = 50 + stdY * 32;
          if (i === nPts - 1 && v.outlierPull > 0) {
            xVal = 19;
            yVal = 50 - v.outlierPull * 4.2;
          }
        } else {
          yVal = 22 + 1.6 * xVal + zNoise * 6.5;
        }
        const px = padL + (xVal / 20) * plotW;
        const py = baseY - ((yVal - 10) / 70) * plotH;
        const isOut = type === "corr_scatter" && i === nPts - 1 && v.outlierPull > 0;
        ctx.fillStyle = isOut ? "#d64545" : "#3e7c8c";
        ctx.beginPath();
        ctx.arc(px, Math.max(padT + 6, Math.min(baseY - 4, py)), isOut ? 7.5 : 5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (type === "ols_reg") {
        const mapY = (yv) => baseY - ((yv - 10) / 70) * plotH;
        // 真實 OLS 紅虛線 (y = 22 + 1.6x)
        ctx.strokeStyle = "rgba(94, 154, 111, 0.85)";
        ctx.lineWidth = 2.2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, mapY(22));
        ctx.lineTo(padL + plotW, mapY(22 + 1.6 * 20));
        ctx.stroke();
        ctx.setLineDash([]);

        // 使用者自訂橘色迴歸線
        ctx.strokeStyle = "#db6a41";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(padL, mapY(v.b0));
        ctx.lineTo(padL + plotW, mapY(v.b0 + v.b1 * 20));
        ctx.stroke();

        ctx.fillStyle = "#2d6a3e";
        ctx.fillText("綠色虛線：OLS 最小平方最佳解 (ŷ = 22 + 1.6x)", padL + 10, padT + 14);
        ctx.fillStyle = "#b64e28";
        ctx.fillText(`橘色實線：你的自訂直線 (ŷ = ${v.b0} + ${v.b1.toFixed(1)}x)`, padL + 10, padT + 32);
      }
    }
  }

  function updateSimState() {
    if (!activeSimIsland) return;
    const cfg = activeSimIsland.simConfig;
    const res = evaluateSimMission(cfg.type, simValues);
    missionPassed = res.ok;

    const banner = document.getElementById("sim-status-banner");
    const metricsEl = document.getElementById("sim-metrics-line");
    if (metricsEl) metricsEl.textContent = res.metrics;
    if (banner) {
      banner.textContent = res.msg;
      banner.className = "sim-status-banner " + (res.ok ? "pass" : "");
    }
    drawSimulatorCanvas(cfg.type, simValues);
    checkAndUnlockLamp();
  }

  function checkAndUnlockLamp() {
    const finishBtn = document.getElementById("sim-complete-btn");
    if (!finishBtn) return;
    if (missionPassed && quizPassed) {
      finishBtn.disabled = false;
      finishBtn.textContent = `✦ 點亮「${activeSimIsland.id} ${activeSimIsland.name}」知識燈塔！`;
      finishBtn.classList.add("coral");
    } else {
      finishBtn.disabled = false;
      finishBtn.textContent = missionPassed
        ? "請回答下方觀念診斷題以點亮本島燈塔"
        : quizPassed
        ? "請調整上方滑桿達成模擬任務以點亮燈塔"
        : "完成「滑桿任務 ＋ 觀念診斷題」即可點亮島嶼";
      finishBtn.classList.remove("coral");
    }
  }

  // 開啟某座島的互動式統計模擬器
  window.openSimulator = function (islandId) {
    const island = window.STAT_DATA.islands.find((x) => x.id === islandId);
    if (!island || !island.simConfig) return;
    activeSimIsland = island;
    const cfg = island.simConfig;

    simValues = {};
    cfg.sliders.forEach((s) => {
      simValues[s.key] = s.val;
    });
    missionPassed = false;
    quizPassed = false;

    const modal = document.getElementById("sim-modal");
    const titleEl = document.getElementById("sim-title");
    const eyebrowEl = document.getElementById("sim-eyebrow");
    const missionEl = document.getElementById("sim-mission");
    const slidersWrap = document.getElementById("sim-sliders");
    const quizBox = document.getElementById("sim-quiz-box");

    eyebrowEl.textContent = `ISLAND ${island.id} · INTERACTIVE SIMULATOR`;
    titleEl.textContent = cfg.title;
    missionEl.textContent = `🎯 實作任務：${cfg.mission}`;

    // 建立滑桿
    slidersWrap.innerHTML = cfg.sliders
      .map(
        (s) => `
      <div class="sim-slider-group">
        <label>
          <span>${s.label}</span>
          <b id="sim-val-${s.key}">${s.val}</b>
        </label>
        <input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.val}">
      </div>
    `
      )
      .join("");

    slidersWrap.querySelectorAll('input[type="range"]').forEach((inp) => {
      inp.addEventListener("input", () => {
        const k = inp.dataset.key;
        simValues[k] = Number(inp.value);
        const valEl = document.getElementById(`sim-val-${k}`);
        if (valEl) valEl.textContent = inp.value;
        updateSimState();
      });
    });

    // 建立觀念診斷題
    quizBox.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--coral);margin-bottom:4px;">CONCEPT CHECK · 統計觀念迷思診斷</div>
      <div style="font-size:14px;font-weight:800;line-height:1.5;">${cfg.quiz.q}</div>
      <div class="quiz-options">
        ${cfg.quiz.options
          .map(
            (opt, idx) => `
          <button type="button" class="quiz-opt-btn" data-idx="${idx}">${opt.text}</button>
        `
          )
          .join("")}
      </div>
      <div id="sim-quiz-feedback" class="feedback-box" hidden></div>
    `;

    const fbEl = document.getElementById("sim-quiz-feedback");
    quizBox.querySelectorAll(".quiz-opt-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const opt = cfg.quiz.options[idx];
        quizBox.querySelectorAll(".quiz-opt-btn").forEach((b) => {
          b.classList.remove("correct", "wrong");
        });
        fbEl.hidden = false;
        if (opt.ok) {
          btn.classList.add("correct");
          fbEl.className = "feedback-box ok";
          fbEl.textContent = `✓ ${opt.feedback}`;
          quizPassed = true;
        } else {
          btn.classList.add("wrong");
          fbEl.className = "feedback-box err";
          fbEl.textContent = `✗ ${opt.feedback}（請再試一次其他選項！）`;
          quizPassed = false;
        }
        checkAndUnlockLamp();
      });
    });

    modal.hidden = false;
    requestAnimationFrame(() => {
      updateSimState();
    });
  };

  // 綁定模擬器底部按鈕
  window.initSimulatorEvents = function () {
    const modal = document.getElementById("sim-modal");
    const closeBtn = document.getElementById("sim-close-btn");
    const resetBtn = document.getElementById("sim-reset-btn");
    const completeBtn = document.getElementById("sim-complete-btn");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.hidden = true;
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (activeSimIsland) window.openSimulator(activeSimIsland.id);
      });
    }
    if (completeBtn) {
      completeBtn.addEventListener("click", () => {
        if (!activeSimIsland) return;
        if (!missionPassed || !quizPassed) {
          // 若使用者點擊時尚未全部達成，給出明確提示或自動引導
          const banner = document.getElementById("sim-status-banner");
          if (banner) {
            banner.className = "sim-status-banner fail";
            banner.textContent = !missionPassed
              ? "⚠️ 尚未達成上方滑桿任務目標，請先拉動滑桿觀察統計變化！"
              : "⚠️ 請先回答下方「統計觀念迷思診斷題」並選出正確答案！";
          }
          return;
        }
        window.markIslandLit(activeSimIsland.id);
        modal.hidden = true;
      });
    }
  };

  // ============================================================================
  // 統計方法決策樹診斷器 (右欄 .dtree-entry 開啟之互動診斷與案例闖關)
  // ============================================================================
  let dtreeMode = "tree"; // "tree" | "cases"
  let dtreeHistory = ["root"];
  let activeCaseIndex = 0;

  function renderDecisionTreeContent() {
    const body = document.getElementById("dtree-body");
    const tabTree = document.getElementById("dtree-tab-tree");
    const tabCases = document.getElementById("dtree-tab-cases");
    if (!body) return;

    tabTree.classList.toggle("active", dtreeMode === "tree");
    tabCases.classList.toggle("active", dtreeMode === "cases");

    if (dtreeMode === "tree") {
      const currentKey = dtreeHistory[dtreeHistory.length - 1];
      const node = window.STAT_DATA.decisionTree.nodes[currentKey];

      body.innerHTML = `
        <div class="quiz-question-box">
          <div style="font-size:12px;font-weight:800;color:var(--coral);margin-bottom:4px;">DECISION TREE · 互動統計方法導航（第 ${node.step} / 2 步）</div>
          <div style="font-size:17px;font-weight:900;margin-bottom:6px;">${node.question}</div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">${node.lead}</div>
          <div class="quiz-options">
            ${node.options
              .map(
                (opt, i) => `
              <button type="button" class="quiz-opt-btn dtree-node-opt" data-idx="${i}">
                ${opt.label}
              </button>
            `
              )
              .join("")}
          </div>
          <div id="dtree-result-card" hidden></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="dtree-back-btn" ${
            dtreeHistory.length <= 1 ? "disabled" : ""
          }>← 上一步重選</button>
          <button type="button" class="btn-secondary" id="dtree-switch-cases-btn">切換至「5 大研究情境實戰題」→</button>
        </div>
      `;

      body.querySelectorAll(".dtree-node-opt").forEach((btn) => {
        btn.addEventListener("click", () => {
          const opt = node.options[Number(btn.dataset.idx)];
          if (opt.next) {
            dtreeHistory.push(opt.next);
            renderDecisionTreeContent();
          } else if (opt.target) {
            const targetIsland = window.STAT_DATA.islands.find((x) => x.id === opt.target);
            body.querySelectorAll(".dtree-node-opt").forEach((b) => b.classList.remove("correct"));
            btn.classList.add("correct");
            const resCard = document.getElementById("dtree-result-card");
            resCard.hidden = false;
            resCard.className = "feedback-box ok";
            resCard.innerHTML = `
              <div style="font-size:15px;font-weight:900;margin-bottom:6px;">
                🎯 診斷推薦：第 ${targetIsland.id} 島【${targetIsland.name}】（${targetIsland.en}）
              </div>
              <div style="margin-bottom:10px;">${opt.reason}</div>
              <div class="formula-box" style="margin:8px 0;">
                <div class="formula-main">${targetIsland.formula.main}</div>
                <div class="formula-vars">${targetIsland.formula.vars}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                <button type="button" class="btn-primary coral" id="dtree-fly-btn">飛往「${targetIsland.id} ${targetIsland.name}」島嶼 ↗</button>
                <button type="button" class="btn-primary" id="dtree-sim-btn">直接啟動該島模擬器 ⚡</button>
              </div>
            `;
            document.getElementById("dtree-fly-btn").addEventListener("click", () => {
              document.getElementById("dtree-modal").hidden = true;
              window.selectIsland(targetIsland.id);
            });
            document.getElementById("dtree-sim-btn").addEventListener("click", () => {
              document.getElementById("dtree-modal").hidden = true;
              window.selectIsland(targetIsland.id);
              window.openSimulator(targetIsland.id);
            });
          }
        });
      });

      const backBtn = document.getElementById("dtree-back-btn");
      if (backBtn) {
        backBtn.addEventListener("click", () => {
          if (dtreeHistory.length > 1) {
            dtreeHistory.pop();
            renderDecisionTreeContent();
          }
        });
      }
      const switchBtn = document.getElementById("dtree-switch-cases-btn");
      if (switchBtn) {
        switchBtn.addEventListener("click", () => {
          dtreeMode = "cases";
          renderDecisionTreeContent();
        });
      }
    } else {
      // 5 大研究情境實戰診斷模式
      const cases = window.STAT_DATA.decisionTree.cases;
      const c = cases[activeCaseIndex];
      const targetIsland = window.STAT_DATA.islands.find((x) => x.id === c.targetIsland);

      body.innerHTML = `
        <div class="quiz-question-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:12px;font-weight:800;color:var(--coral);">CASE CHALLENGE · 情境診斷闖關 (${activeCaseIndex + 1} / ${cases.length})</span>
            <span style="font-size:12px;font-weight:700;color:var(--muted);">${c.title}</span>
          </div>
          <div style="font-size:14.5px;font-weight:700;line-height:1.6;background:var(--cream-soft);padding:12px 14px;border-radius:10px;margin-bottom:12px;">
            ${c.scenario}
          </div>
          <div class="quiz-options">
            ${c.options
              .map(
                (opt, idx) => `
              <button type="button" class="quiz-opt-btn case-opt-btn" data-idx="${idx}">
                ${opt.text}
              </button>
            `
              )
              .join("")}
          </div>
          <div id="case-feedback-box" class="feedback-box" hidden></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="case-prev-btn" ${
            activeCaseIndex === 0 ? "disabled" : ""
          }>← 上一題</button>
          <span style="font-size:12.5px;font-weight:700;color:var(--muted);">答錯可即時查看迷思診斷並重選</span>
          <button type="button" class="btn-primary" id="case-next-btn">
            ${activeCaseIndex < cases.length - 1 ? "下一題案例 →" : "回到第 1 題 ↺"}
          </button>
        </div>
      `;

      const fbBox = document.getElementById("case-feedback-box");
      body.querySelectorAll(".case-opt-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const opt = c.options[Number(btn.dataset.idx)];
          body.querySelectorAll(".case-opt-btn").forEach((b) => b.classList.remove("correct", "wrong"));
          fbBox.hidden = false;
          if (opt.ok) {
            btn.classList.add("correct");
            fbBox.className = "feedback-box ok";
            fbBox.innerHTML = `
              <div>✓ ${opt.feedback}</div>
              <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn-primary coral" id="case-fly-island-btn">
                  飛往「${targetIsland.id} ${targetIsland.name}」實作 ↗
                </button>
              </div>
            `;
            document.getElementById("case-fly-island-btn").addEventListener("click", () => {
              document.getElementById("dtree-modal").hidden = true;
              window.selectIsland(targetIsland.id);
            });
          } else {
            btn.classList.add("wrong");
            fbBox.className = "feedback-box err";
            fbBox.textContent = `✗ ${opt.feedback}`;
          }
        });
      });

      document.getElementById("case-prev-btn").addEventListener("click", () => {
        if (activeCaseIndex > 0) {
          activeCaseIndex--;
          renderDecisionTreeContent();
        }
      });
      document.getElementById("case-next-btn").addEventListener("click", () => {
        activeCaseIndex = (activeCaseIndex + 1) % cases.length;
        renderDecisionTreeContent();
      });
    }
  }

  window.openDecisionTree = function (mode = "tree") {
    dtreeMode = mode;
    dtreeHistory = ["root"];
    const modal = document.getElementById("dtree-modal");
    modal.hidden = false;
    renderDecisionTreeContent();
  };

  window.initDecisionTreeEvents = function () {
    const modal = document.getElementById("dtree-modal");
    const closeBtn = document.getElementById("dtree-close-btn");
    const tabTree = document.getElementById("dtree-tab-tree");
    const tabCases = document.getElementById("dtree-tab-cases");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        modal.hidden = true;
      });
    }
    if (tabTree) {
      tabTree.addEventListener("click", () => {
        dtreeMode = "tree";
        dtreeHistory = ["root"];
        renderDecisionTreeContent();
      });
    }
    if (tabCases) {
      tabCases.addEventListener("click", () => {
        dtreeMode = "cases";
        renderDecisionTreeContent();
      });
    }
  };
})();
