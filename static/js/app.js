let player = null;
let musicRestored = false;
function saveMusicState() {
  if (player && player.getPlayerState) {
    const state = player.getPlayerState();
    localStorage.setItem("musicPlaying", state === 1 ? "true" : "false");
  }
}

function restoreMusicState() {
  if (musicRestored) return;
  const wasPlaying = localStorage.getItem("musicPlaying") === "true";
  if (wasPlaying && player && player.playVideo) {
    setTimeout(() => {
      player.playVideo();
      musicRestored = true;
    }, 500);
  }
}

setInterval(() => {
  if (player) saveMusicState();
}, 2000);

function onYouTubeIframeAPIReady() {
  player = new YT.Player("musicPlayer", {
    height: "200",
    width: "356",
    videoId: "jfKfPfyJRdk",
    playerVars: { autoplay: 0, controls: 1 },
    events: { onReady: onPlayerReady },
  });
}

function onPlayerReady(event) {
  event.target.setVolume(30);
  updateMusicPlayerVisibility();
  restoreMusicState();
}

(function loadYouTubeApi() {
  var tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  var firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
})();

let config = {};
let timeLeft = 0;
let totalSeconds = 0;
let isRunning = false;
let intervalId = null;
let currentSessionType = "work";
let pomodoroCount = 0;
let currentSessionId = null;
let startTimestamp = null;
let endTimestamp = null;

// Small helper: format ISO date string to pt-BR or return original
function formatDate(iso) {
  if (!iso) return "";
  try {
    // Parsear como data LOCAL (ano, mês, dia), não como UTC.
    // new Date("YYYY-MM-DD") interpreta como meia-noite UTC, o que desloca
    // a data 1 dia para trás em fusos negativos como UTC-3 (Brasil).
    const datePart = iso.split("T")[0];
    const [year, month, day] = datePart.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return iso;
  }
}

function updateMusicPlayerVisibility() {
  const musicPlayer = document.getElementById("musicPlayer");
  if (!musicPlayer) return;
  if (config.music_enabled) {
    musicPlayer.classList.remove("hidden");
    setTimeout(() => restoreMusicState(), 1000);
  } else {
    musicPlayer.classList.add("hidden");
    if (player && player.pauseVideo) {
      player.pauseVideo();
      localStorage.setItem("musicPlaying", "false");
    }
  }
}

function loadInlineReport() {
  const totalEl = document.getElementById("inlineReportTotal");
  if (!totalEl) return;
  totalEl.textContent = "Carregando...";
  const tzOffset = new Date().getTimezoneOffset();
  fetch(`/api/report?tz_offset=${tzOffset}`)
    .then((r) => r.json())
    .then((data) => {
      // Preferir campos calculados no servidor quando presentes
      const todayTotal = Number(data.today_total_minutes || 0);
      const todayCompleted = Number(data.today_completed || 0);

      totalEl.textContent = `Total focado hoje: ${todayTotal} min`;
      pomodoroCount = todayCompleted;
      const pcEl = document.getElementById("pomodoroCount");
      if (pcEl) pcEl.textContent = `Pomodoros completados: ${pomodoroCount}`;
    })
    .catch(() => {
      totalEl.textContent = "Erro ao carregar relatório";
    });
}

async function loadConfig() {
  const response = await fetch("/api/config");
  config = await response.json();
  timeLeft = config.work_time * 60;
  totalSeconds = timeLeft;
  updateDisplay();
  updateMusicPlayerVisibility();
  loadInlineReport();
}

function openConfigModal() {
  fetch("/api/config")
    .then((r) => r.json())
    .then((data) => {
      document.getElementById("cfg_work_time").value = data.work_time;
      document.getElementById("cfg_short_break").value = data.short_break;
      document.getElementById("cfg_long_break").value = data.long_break;
      document.getElementById("cfg_pomodoros_until_long_break").value = data.pomodoros_until_long_break;
      document.getElementById("cfg_music_enabled").checked = data.music_enabled;
      const el = document.getElementById("configModal");
      el.classList.add("open");
      el.setAttribute("aria-hidden", "false");
    });
}

function closeConfigModal() {
  const el = document.getElementById("configModal");
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

async function saveConfigModal() {
  const payload = {
    work_time: Number(document.getElementById("cfg_work_time").value),
    short_break: Number(document.getElementById("cfg_short_break").value),
    long_break: Number(document.getElementById("cfg_long_break").value),
    pomodoros_until_long_break: Number(document.getElementById("cfg_pomodoros_until_long_break").value),
    music_enabled: document.getElementById("cfg_music_enabled").checked,
  };

  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    config = payload;
    if (!isRunning) {
      timeLeft = config.work_time * 60;
      totalSeconds = timeLeft;
      updateDisplay();
    }
    updateMusicPlayerVisibility();
    closeConfigModal();
  } else {
    alert("Falha ao salvar configurações");
  }
}

function toggleTimer() {
  if (isRunning) pauseTimer(); else startTimer();
}

async function startTimer() {
  if (!isRunning) {
    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_type: currentSessionType }),
    });
    const data = await response.json();
    currentSessionId = data.session_id;

    isRunning = true;
    // Use timestamps to compute remaining time to avoid interval drift
    startTimestamp = Date.now();
    endTimestamp = Date.now() + timeLeft * 1000;
    document.getElementById("startBtn").textContent = "Pausar";

    intervalId = setInterval(() => {
      // Recompute timeLeft from endTimestamp (ms) to avoid drift when tab is inactive
      timeLeft = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
      updateDisplay();
      if (timeLeft <= 0) completeSession();
    }, 500);
  }
}

function pauseTimer() {
  isRunning = false;
  clearInterval(intervalId);
  // Recompute and keep the remaining seconds when pausing
  if (endTimestamp) {
    timeLeft = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
  }
  startTimestamp = null;
  endTimestamp = null;
  document.getElementById("startBtn").textContent = "Continuar";
}

async function completeSession() {
  pauseTimer();
  if (currentSessionId) {
    await fetch(`/api/session/complete/${currentSessionId}`, { method: "POST" });
  }
  if (currentSessionType === "work") {
    // tocar som indicando término do pomodoro
    try { playEndSound(); } catch (e) { console.warn('Falha ao reproduzir som', e); }
    pomodoroCount++;
    document.getElementById("pomodoroCount").textContent = `Pomodoros completados: ${pomodoroCount}`;
    if (pomodoroCount % config.pomodoros_until_long_break === 0) startBreak("long_break"); else startBreak("short_break");
  } else {
    startWork();
  }
  loadInlineReport();
}

// Toca um som curto usando Web Audio API para sinalizar fim do pomodoro
function playEndSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, ctx.currentTime);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  setTimeout(() => {
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
    setTimeout(() => {
      try { o.stop(); ctx.close(); } catch (e) {}
    }, 50);
  }, 220);
}

function startWork() {
  currentSessionType = "work";
  timeLeft = config.work_time * 60;
  totalSeconds = timeLeft;
  document.getElementById("sessionType").textContent = "Estudos";
  document.getElementById("startBtn").textContent = "Iniciar";
  updateDisplay();
}

function startBreak(type) {
  currentSessionType = type;
  const minutes = type === "long_break" ? config.long_break : config.short_break;
  timeLeft = minutes * 60;
  totalSeconds = timeLeft;
  document.getElementById("sessionType").textContent = type === "long_break" ? "Pausa Longa" : "Pausa Curta";
  document.getElementById("startBtn").textContent = "Iniciar";
  updateDisplay();
}

async function resetTimer() {
  if (currentSessionId) {
    const elapsedSeconds = Math.max(0, totalSeconds - timeLeft);
    const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
    if (elapsedMinutes > 0) {
      try {
        await finalizeCurrentSession(currentSessionId, elapsedMinutes);
      } catch (e) {
        console.error("Falha ao registrar sessão parcial", e);
      }
    }
    currentSessionId = null;
  }
  pauseTimer();
  currentSessionType = "work";
  timeLeft = config.work_time * 60;
  totalSeconds = timeLeft;
  document.getElementById("sessionType").textContent = "Estudos";
  document.getElementById("startBtn").textContent = "Iniciar";
  updateDisplay();
  loadInlineReport();
}

function finalizeCurrentSession(sessionId, elapsedMinutes) {
  return fetch(`/api/session/complete/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ elapsed_minutes: Number(elapsedMinutes) }),
  });
}

async function skipToNext() {
  const elapsedSeconds = Math.max(0, totalSeconds - timeLeft);
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
  pauseTimer();
  if (currentSessionId && elapsedMinutes > 0) {
    try {
      await finalizeCurrentSession(currentSessionId, elapsedMinutes);
    } catch (e) {
      console.error("Falha ao registrar sessão parcial", e);
    }
  }
  if (currentSessionType === "work") startBreak("short_break"); else startWork();
  currentSessionId = null;
  loadInlineReport();
}

function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  document.getElementById("timer").textContent = timeStr;

  // Atualizar título da aba com o tempo restante quando o timer está rodando
  if (isRunning) {
    const sessionLabel = document.getElementById("sessionType").textContent || "Pomodoro";
    document.title = `${timeStr} — ${sessionLabel} | Pomodoro Timer`;
  } else {
    document.title = "Pomodoro Timer";
  }
}

// Abrir modal de relatório diário
function openReportModal() {
  const modal = document.getElementById("reportModal");
  const content = document.getElementById("reportContent");
  if (content) {
    // preservar o canvas e usar um container específico para a tabela/resumo
    let tableContainer = content.querySelector('#reportTableContainer');
    if (!tableContainer) {
      tableContainer = document.createElement('div');
      tableContainer.id = 'reportTableContainer';
      content.appendChild(tableContainer);
    }
    tableContainer.textContent = 'Carregando...';
  }
  
  // Limpar gráfico anterior para forçar recriação com dados frescos
  if (window._reportChart) {
    window._reportChart.destroy();
    window._reportChart = null;
  }
  
  // solicitar relatório já ajustado ao fuso local do usuário (minutes)
  const tzOffset = new Date().getTimezoneOffset();
  fetch(`/api/report?tz_offset=${tzOffset}`)
    .then((r) => r.json())
    .then((data) => {
      // Usar daily ajustado pelo servidor (já inclui tz_offset)
      const effectiveDaily = (data.daily || []).slice();
      // ordenar por data asc (menor -> maior) para o eixo X
      effectiveDaily.sort((a, b) => {
        try { return new Date(a.date) - new Date(b.date); } catch (e) { return 0; }
      });
      const mediaGeral = data.media_geral || 0;
      const totalGeral = data.total_minutes || 0;

      // Preparar dados para o gráfico (já ordenados asc)
      const labels = effectiveDaily.map((d) => formatDate(d.date));
      const values = effectiveDaily.map((d) => d.total_minutes || 0);

      // Criar/atualizar canvas Chart.js
      const canvas = document.getElementById("reportCanvas");
      if (canvas) {
        if (window._reportChart) {
          window._reportChart.data.labels = labels;
          window._reportChart.data.datasets[0].data = values;
          window._reportChart.$mediaGeral = mediaGeral;
          // esconder legenda (apenas as barras são suficientes)
          if (window._reportChart.options && window._reportChart.options.plugins && window._reportChart.options.plugins.legend) {
            window._reportChart.options.plugins.legend.display = false;
          }
          window._reportChart.update();
        } else {
          const ctx = canvas.getContext("2d");
          const avgLinePlugin = {
            id: 'avgLine',
            afterDraw: function(chart) {
              const avg = chart.$mediaGeral || 0;
              if (!avg) return;
              const yScale = chart.scales.y;
              const xScale = chart.scales.x;
              const y = yScale.getPixelForValue(avg);
              const ctx = chart.ctx;
              ctx.save();
              ctx.setLineDash([6,4]);
              ctx.strokeStyle = 'rgba(60,60,60,0.8)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(xScale.left, y);
              ctx.lineTo(xScale.right, y);
              ctx.stroke();
              ctx.restore();
            }
          };

          window._reportChart = new Chart(ctx, {
            data: {
              labels,
              datasets: [
                {
                  type: "bar",
                  label: "Total (min)",
                  data: values,
                  backgroundColor: "rgba(150,79,76,0.85)",
                  borderRadius: 6,
                }
              ],
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
                tooltip: { mode: "index", intersect: false },
              },
              scales: {
                y: { beginAtZero: true, title: { display: true, text: "Minutos" } },
                x: { ticks: { maxRotation: 45, minRotation: 0 } },
              },
            },
            plugins: [avgLinePlugin]
          });
          window._reportChart.$mediaGeral = mediaGeral;
        }
      }

      // renderizar tabela usando os mesmos dados ordenados
      renderReportTable(effectiveDaily, mediaGeral, totalGeral, content);
    })
    .catch((err) => {
      console.error("Erro ao carregar relatório:", err);
      if (content) content.textContent = "Erro ao carregar relatório";
    });
  if (modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }
}

function closeReportModal() {
  const modal = document.getElementById("reportModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function renderReportTable(daily, mediaGeral, totalGeral, container) {
  if (!container) return;
  // garantir que exista um container específico para a tabela e resumo
  let tableContainer = container.querySelector('#reportTableContainer');
  if (!tableContainer) {
    tableContainer = document.createElement('div');
    tableContainer.id = 'reportTableContainer';
    container.appendChild(tableContainer);
  }

  if (!daily || daily.length === 0) {
    tableContainer.innerHTML = '<div style="text-align:center; padding:12px">Sem dados</div>';
    return;
  }

  // Resumo: total geral e média por dia
  let html = `<div class="report-summary">`;
  html += `<div class="report-summary-item">Total geral: <span class="report-summary-value">${totalGeral} min</span></div>`;
  html += `<div class="report-summary-item">Média/dia: <span class="report-summary-value">${mediaGeral} min</span></div>`;
  html += `</div>`;

  // Tabela simples e legível
  html += '<div class="plain-report-table-wrapper"><table class="report-table plain-report-table">';
  html += '<thead><tr><th>Data</th><th style="text-align:center">Total (min)</th><th style="text-align:center">Sessões</th></tr></thead>';
  html += '<tbody>';
  daily.forEach((d) => {
    // formatar data para pt-BR
    const dateStr = formatDate(d.date);

    html += `<tr class="report-row"><td class="report-date">${dateStr}</td><td class="report-number">${d.total_minutes}</td><td class="report-number">${d.sessions}</td></tr>`;
  });
  html += '</tbody></table></div>';
  tableContainer.innerHTML = html;
}

loadConfig();

// Atalho de teclado: Espaço para iniciar/pausar o timer
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  // Ignorar quando o foco está em um campo de texto/input/textarea
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  e.preventDefault();
  toggleTimer();
});

// Fechar modais ao clicar no overlay (fora do conteúdo)
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
  });
});
