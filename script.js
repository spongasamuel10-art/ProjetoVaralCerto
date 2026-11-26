import { db, ref, onValue, update } from "./firebase.js";

const elConnectionBadge = document.getElementById("connection-badge");
const elConnectionText = document.getElementById("connection-text");
const elVaralStatus = document.getElementById("varal-status");
const elSensorStatus = document.getElementById("sensor-status");
const elBoxVaral = document.getElementById("box-varal");
const elBoxSensor = document.getElementById("box-sensor");
const elProgress = document.getElementById("varal-progress");
const elPercent = document.getElementById("visualizer-percent");
const elBtnToggle = document.getElementById("btn-toggle-varal");
const elCheckAuto = document.getElementById("check-auto");
const elModeBadge = document.getElementById("mode-badge");
const elEventLogs = document.getElementById("event-logs");

let estadoAtualVaral = "FECHADO";
let ultimoEstadoRegistrado = null;
let deferredPrompt = null;

// Guarda os dados vindos do Firebase
let dadosTelemetria = {
    aberto_24h: 0,
    fechado_24h: 0,
    sem_atual_aberto: 0,
    sem_atual_fechado: 0,
    sem_ant_aberto: 0,
    sem_ant_fechado: 0,
    ultimo_registro_ms: Date.now()
};

// ==========================================
// 1. CONEXÃO E LEITURA DO FIREBASE
// ==========================================
onValue(ref(db, ".info/connected"), (snap) => {
    if (snap.val() === true) {
        elConnectionBadge.classList.add("online");
        elConnectionText.textContent = "ESP32 Online";
    } else {
        elConnectionBadge.classList.remove("online");
        elConnectionText.textContent = "Desconectado";
    }
});

onValue(ref(db, "/"), async (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const varalData = data.varal || data;
    const status = (varalData.status || varalData.posicao || "FECHADO").toUpperCase();
    estadoAtualVaral = status;
    atualizarInterfaceVaral(status);

    const chuva = varalData.chuva === true || String(varalData.sensor_chuva).toUpperCase() === "MOLHADO" || varalData.chuva === 1;
    atualizarInterfaceSensor(chuva);

    if (typeof varalData.modo_auto !== "undefined") {
        elCheckAuto.checked = Boolean(varalData.modo_auto);
        atualizarBadgeModo(elCheckAuto.checked);
    }

    // Se o nó 'estatisticas' ainda não existe no Firebase, cria agora com a hora atual
    if (!data.estatisticas) {
        await update(ref(db, "/estatisticas"), dadosTelemetria);
    } else {
        dadosTelemetria = {
            aberto_24h: Number(data.estatisticas.aberto_24h || 0),
            fechado_24h: Number(data.estatisticas.fechado_24h || 0),
            sem_atual_aberto: Number(data.estatisticas.sem_atual_aberto || 0),
            sem_atual_fechado: Number(data.estatisticas.sem_atual_fechado || 0),
            sem_ant_aberto: Number(data.estatisticas.sem_ant_aberto || 0),
            sem_ant_fechado: Number(data.estatisticas.sem_ant_fechado || 0),
            ultimo_registro_ms: Number(data.estatisticas.ultimo_registro_ms || Date.now())
        };
    }

    atualizarTelaTelemetria();

    if (ultimoEstadoRegistrado !== status) {
        adicionarLog(`Varal mudou para: ${status}`);
        ultimoEstadoRegistrado = status;
    }
});

// ==========================================
// 2. CÁLCULO REAL DA CONTAGEM DE TEMPO
// ==========================================
function atualizarTelaTelemetria() {
    const agora = Date.now();
    // Calcula quantos minutos se passaram desde a última gravação no Firebase
    const minutosDecorridos = Math.floor((agora - dadosTelemetria.ultimo_registro_ms) / 60000);
    const isEstendido = estadoAtualVaral === "ABERTO" || estadoAtualVaral === "ESTENDIDO";

    let aberto24 = dadosTelemetria.aberto_24h;
    let fechado24 = dadosTelemetria.fechado_24h;
    let semAtualAberto = dadosTelemetria.sem_atual_aberto;
    let semAtualFechado = dadosTelemetria.sem_atual_fechado;

    if (minutosDecorridos > 0) {
        if (isEstendido) {
            aberto24 += minutosDecorridos;
            semAtualAberto += minutosDecorridos;
        } else {
            fechado24 += minutosDecorridos;
            semAtualFechado += minutosDecorridos;
        }
    }

    document.getElementById("tempo-aberto-24h").textContent = formatarMinutos(aberto24);
    document.getElementById("tempo-fechado-24h").textContent = formatarMinutos(fechado24);
    document.getElementById("sem-atual-aberto").textContent = formatarMinutos(semAtualAberto);
    document.getElementById("sem-atual-fechado").textContent = formatarMinutos(semAtualFechado);
    document.getElementById("sem-ant-aberto").textContent = formatarMinutos(dadosTelemetria.sem_ant_aberto);
    document.getElementById("sem-ant-fechado").textContent = formatarMinutos(dadosTelemetria.sem_ant_fechado);
}

// Consolida os minutos no Firebase sempre que completa 1 minuto ou mais
async function consolidarTempoNoFirebase(estadoAnterior) {
    const agora = Date.now();
    const minutosDecorridos = Math.floor((agora - dadosTelemetria.ultimo_registro_ms) / 60000);
    if (minutosDecorridos < 1) return;

    const estavaEstendido = estadoAnterior === "ABERTO" || estadoAnterior === "ESTENDIDO";
    const atualizacao = {
        ...dadosTelemetria,
        ultimo_registro_ms: agora
    };

    if (estavaEstendido) {
        atualizacao.aberto_24h += minutosDecorridos;
        atualizacao.sem_atual_aberto += minutosDecorridos;
    } else {
        atualizacao.fechado_24h += minutosDecorridos;
        atualizacao.sem_atual_fechado += minutosDecorridos;
    }

    await update(ref(db, "/estatisticas"), atualizacao);
}

// Atualiza a tela a cada 10 segundos e salva no banco a cada minuto completo
setInterval(() => {
    atualizarTelaTelemetria();
    consolidarTempoNoFirebase(estadoAtualVaral);
}, 10000);

// ==========================================
// 3. CONTROLE E INTERFACE
// ==========================================
function atualizarInterfaceVaral(status) {
    elBtnToggle.disabled = false;
    const isEstendido = status === "ABERTO" || status === "ESTENDIDO";

    if (isEstendido) {
        elVaralStatus.textContent = "ESTENDIDO";
        elBoxVaral.className = "status-box is-open";
        elProgress.style.width = "100%";
        elPercent.textContent = "100%";
        elBtnToggle.className = "btn-primary-action btn-recolher";
        elBtnToggle.innerHTML = `<i data-lucide="arrow-left-to-line"></i><span>PUXAR VARAL (Recolher)</span>`;
    } else {
        elVaralStatus.textContent = "RECOLHIDO";
        elBoxVaral.className = "status-box is-closed";
        elProgress.style.width = "0%";
        elPercent.textContent = "0%";
        elBtnToggle.className = "btn-primary-action btn-estender";
        elBtnToggle.innerHTML = `<i data-lucide="arrow-right-from-line"></i><span>ESTENDER VARAL (Abrir)</span>`;
    }
    lucide.createIcons();
}

function atualizarInterfaceSensor(estaChovendo) {
    if (estaChovendo) {
        elSensorStatus.textContent = "CHUVA DETECTADA";
        elBoxSensor.className = "status-box is-wet";
    } else {
        elSensorStatus.textContent = "SECO";
        elBoxSensor.className = "status-box";
    }
}

function atualizarBadgeModo(isAuto) {
    elModeBadge.textContent = isAuto ? "MODO AUTO" : "MODO MANUAL";
    elModeBadge.classList.toggle("manual", !isAuto);
}

elBtnToggle.addEventListener("click", async () => {
    const isEstendido = estadoAtualVaral === "ABERTO" || estadoAtualVaral === "ESTENDIDO";
    const novoComando = isEstendido ? "FECHAR" : "ABRIR";
    const novoStatus = isEstendido ? "FECHADO" : "ABERTO";

    elBtnToggle.disabled = true;
    elBtnToggle.innerHTML = `<i data-lucide="loader-2" class="spin"></i><span>Enviando comando...</span>`;
    lucide.createIcons();

    try {
        // Salva o tempo acumulado do estado atual antes de trocar
        await consolidarTempoNoFirebase(estadoAtualVaral);
        await update(ref(db, "/"), { comando: novoComando, status: novoStatus });
        mostrarToast(`Comando "${novoComando}" enviado ao ESP32!`);
    } catch {
        mostrarToast("Erro de comunicação com o Firebase.");
        elBtnToggle.disabled = false;
    }
});

elCheckAuto.addEventListener("change", async (e) => {
    const ativo = e.target.checked;
    atualizarBadgeModo(ativo);
    await update(ref(db, "/"), { modo_auto: ativo });
    mostrarToast(ativo ? "Proteção automática ativada" : "Modo manual ativado");
    adicionarLog(ativo ? "Modo automático ativado" : "Modo automático desativado");
});

// ==========================================
// 4. PREVISÃO DO TEMPO E UTILITÁRIOS
// ==========================================
async function carregarPrevisaoTempo() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=-29.1678&longitude=-51.1794&current=temperature_2m,weather_code,wind_speed_10m&hourly=precipitation_probability&timezone=America%2FSao_Paulo&forecast_days=1`;
    try {
        const res = await fetch(url);
        const dados = await res.json();
        const horaAtual = new Date().getHours();
        document.getElementById("temp").textContent = Math.round(dados.current.temperature_2m);
        document.getElementById("wind-speed").textContent = `${Math.round(dados.current.wind_speed_10m)} km/h`;
        document.getElementById("rain-prob").textContent = `${dados.hourly.precipitation_probability[horaAtual] ?? 0}%`;
        document.getElementById("weather-desc").textContent = traduzirCodigoClima(dados.current.weather_code);
        const agora = new Date();
        document.getElementById("weather-updated").textContent = `Atualizado às ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    } catch {
        document.getElementById("weather-desc").textContent = "Clima indisponível offline";
    }
}

function traduzirCodigoClima(code) {
    if (code === 0) return "Céu limpo e ensolarado";
    if (code <= 3) return "Parcialmente nublado";
    if (code <= 48) return "Nevoeiro / Neblina";
    if (code <= 57) return "Garoa leve";
    if (code <= 67) return "Chuva moderada";
    if (code <= 82) return "Pancadas de chuva";
    if (code >= 95) return "Tempestade / Trovoadas";
    return "Tempo instável";
}

function formatarMinutos(totalMin) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
}

function adicionarLog(mensagem) {
    const empty = elEventLogs.querySelector(".log-empty");
    if (empty) empty.remove();
    const agora = new Date();
    const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}:${String(agora.getSeconds()).padStart(2, "0")}`;
    const li = document.createElement("li");
    li.innerHTML = `<span>${mensagem}</span><span class="log-time">${hora}</span>`;
    elEventLogs.prepend(li);
    if (elEventLogs.children.length > 15) elEventLogs.lastElementChild.remove();
}

document.getElementById("btn-clear-logs").addEventListener("click", () => {
    elEventLogs.innerHTML = `<li class="log-empty">Histórico limpo.</li>`;
});

function mostrarToast(texto) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = texto;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

const btnInstall = document.getElementById("btn-install-pwa");
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove("hidden");
});

btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") btnInstall.classList.add("hidden");
    deferredPrompt = null;
});

carregarPrevisaoTempo();
setInterval(carregarPrevisaoTempo, 15 * 60 * 1000);