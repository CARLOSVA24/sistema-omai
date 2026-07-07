// Global flag to control Leaflet Draw patch for middle markers
var enableLeafletPatch = false;

console.log("GESTIÓN DE PATRULLAJES TERRESTRES v2.0 - MULTI-USER SYNC ACTIVE");

// --- MONKEY PATCH LEAFLET DRAW FOR TOUCH/HYBRID DEVICES (FORCE MIDDLE MARKERS) ---
if (typeof L !== 'undefined' && L.Edit && L.Edit.PolyVerticesEdit) {
    const originalInitMarkers = L.Edit.PolyVerticesEdit.prototype._initMarkers;
    L.Edit.PolyVerticesEdit.prototype._initMarkers = function () {
        // Apply patch only when enabled (Inteligencia module)
        if (!enableLeafletPatch) {
            // Run original behavior without forcing
            return originalInitMarkers.apply(this, arguments);
        }
        const originalTouch = L.Browser.touch;
        L.Browser.touch = false; // Force Leaflet Draw to think it's not a touch device to create middle markers
        try {
            originalInitMarkers.apply(this, arguments);
        } finally {
            L.Browser.touch = originalTouch;
        }
    };
}

// --- CENTRALIZED DATA SYNC (MULTI-USER) ---
const API_BASE = '/api';
// Las contraseñas ya NO se almacenan en el frontend.
// La autenticación se realiza exclusivamente en el servidor mediante bcrypt.
var storedRoles = []; // Solo se almacenan los roles (no contraseñas)
var rotationStartDate = null;
var rotationStartGroup = 'GRUPO 1';
var codescStartDate = null;
var codescStartGroup = 'GOLF';
var logisticsStartDate = null;
var logisticsStartGroup = 'ESTRIBOR';
var lastDistributionConfig = null;

const legacyGroupMap = {
    'ALFA': 'GRUPO 1',
    'BRAVO': 'GRUPO 2',
    'CHARLIE': 'GRUPO 3',
    'DELTA': 'GRUPO 4',
    'FRANCO': 'GRUPO 4'
};

function normalizeRotationGroup(value) {
    const normalized = String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
    return legacyGroupMap[normalized] || normalized;
}

const normalizeGroup = value => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();

// Verificar si se está ejecutando desde el servidor o como archivo local
if (window.location.protocol === 'file:') {
    alert("⚠️ ATENCIÓN: Has abierto el sistema como un archivo local.\n\nPara que el modo MULTIUSUARIO funcione, debes usar el archivo 'INICIAR_PROGRAMA.bat' y acceder vía http://localhost:3000.\n\nLos datos no se sincronizarán en este modo.");
}

async function serverLoad(key, defaultVal) {
    try {
        const res = await fetch(`${API_BASE}/store/${key}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();

        // MIGRACIÓN: Si el servidor está vacío pero hay datos locales, subirlos al servidor
        const localData = safeJSONParse(key, null);
        const serverIsEmpty = !data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0);

        if (serverIsEmpty && localData) {
            console.log(`Sincronizando ${key} con el servidor central...`);
            await serverSave(key, localData);
            return localData;
        }

        return !serverIsEmpty ? data : defaultVal;
    } catch (e) {
        console.warn(`Error loading ${key} from server, using local fallback`, e);
        return safeJSONParse(key, defaultVal);
    }
}

async function serverSave(key, data) {
    try {
        // Obtener el socket ID actual para que el servidor no rebote el evento de vuelta
        const socketId = (typeof socket !== 'undefined' && socket && socket.id) ? socket.id : '';
        await fetch(`${API_BASE}/store/${key}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-socket-id': socketId
            },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error(`Error saving ${key} to server`, e);
        saveAppState(key, JSON.stringify(data));
    }
}

function saveAppState(key, value) {
    localStorage.setItem(key, value);
    let data = value;
    try {
        if (typeof value === 'string') {
            data = JSON.parse(value);
        }
    } catch (e) {
        // value is a plain string, keep it as is
    }
    serverSave(key, data);
}

async function updateConnectionStatus() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (!dot || !text) return;

    try {
        const res = await fetch(`${API_BASE}/status`);
        if (res.ok) {
            dot.style.background = '#22c55e'; // Verde
            dot.style.boxShadow = '0 0 10px #22c55e';
            text.textContent = 'BD Conectada';
            text.style.color = '#15803d';
            console.log("Conexión con servidor OK");
        } else {
            throw new Error("Servidor respondió con error");
        }
    } catch (e) {
        dot.style.background = '#ef4444'; // Rojo
        dot.style.boxShadow = '0 0 10px #ef4444';
        text.textContent = 'Sin Conexión';
        text.style.color = '#b91c1c';
        console.error("Fallo de conexión al servidor:", e);
    }
}

async function loadAllDataFromServer() {
    crimes = await serverLoad('gyecrimes', []);
    personnel = await serverLoad('gyepersonal', []);
    guardAssignments = await serverLoad('guardAssignments', []);
    specialAssignments = await serverLoad('specialAssignments', []);
    baborPersonnel = await serverLoad('baborPersonnel', []);
    estriborPersonnel = await serverLoad('estriborPersonnel', []);
    opsEvents = await serverLoad('opsEvents', []);
    instantOps = await serverLoad('instantOps', []);
    patrolOrders = await serverLoad('patrolOrders', []);
    templatePatrolOrders = await serverLoad('templatePatrolOrders', []);
    commandPostPersonnel = await serverLoad('commandPostPersonnel', []);
    personnelHistory = await serverLoad('personnelHistory', []);
    vehicles = await serverLoad('gyevehicles', []);
    choferes = await serverLoad('gyechoferes', []);
    externalOrdersMetadata = await serverLoad('externalOrdersMetadata', []);
    await window.loadOrgUnits();

    // Cargar datos de Planificación Diaria de Operaciones desde el servidor
    if (typeof planData !== 'undefined') {
        planData = await serverLoad('planData', []);
        if (typeof renderPlanTable === 'function') {
            renderPlanTable();
        }
    }

    rotationStartDate = await serverLoad('rotationStartDate', null);
    rotationStartGroup = await serverLoad('rotationStartGroup', 'GRUPO 1');
    codescStartDate = await serverLoad('codescReferenceDate', null); // Usamos codescReferenceDate para mantener compatibilidad
    codescStartGroup = await serverLoad('codescStartGroup', 'GOLF');
    lastDistributionConfig = await serverLoad('lastDistributionConfig', null);

    // Sincronizar dibujos manuales (Polígonos/Líneas)
    const serverDrawnItems = await serverLoad('gyeDrawnItems', null);
    if (serverDrawnItems) {
        localStorage.setItem('gyeDrawnItems', JSON.stringify(serverDrawnItems));
    }

    // Las contraseñas ya no se sincronizan desde app_data: ahora están en la tabla 'users' del servidor.
    // Solo recargamos la lista de roles para el selector de login.
    try {
        const rolesRes = await fetch(`${API_BASE}/users`);
        if (rolesRes.ok) storedRoles = await rolesRes.json();
    } catch (e) { console.warn('No se pudo actualizar lista de roles:', e); }

    // Normalize legacy condition fields for loaded data and persist cleaned values
    normalizeConditionFields();
    saveData();
}

function normalizeConditionFields() {
    personnel = (personnel || []).map(p => {
        const condition = String(p.condition || p.condicion || 'OPERATIVO').toUpperCase().trim();
        return { ...p, condition };
    });

    commandPostPersonnel = (commandPostPersonnel || []).map(p => {
        const condition = String(p.condition || p.condicion || 'OPERATIVO').toUpperCase().trim();
        return { ...p, condition };
    });

    choferes = (choferes || []).map(c => {
        const condicion = String(c.condicion || c.condition || 'OPERATIVO').toUpperCase().trim();
        return { ...c, condicion };
    });

    baborPersonnel = (baborPersonnel || []).map(p => {
        const condition = String(p.condition || p.condicion || 'OPERATIVO').toUpperCase().trim();
        return { ...p, condition };
    });

    estriborPersonnel = (estriborPersonnel || []).map(p => {
        const condition = String(p.condition || p.condicion || 'OPERATIVO').toUpperCase().trim();
        return { ...p, condition };
    });

    // --- CORRECCIÓN DE COLUMNAS CAMBIADAS (SEGíšN REPORTE) ---
    // Reparto tiene el teléfono, Contacto tiene el grupo, Grupo tiene el reparto
    personnel = (personnel || []).map(p => {
        const isPhone = val => /^\d{7,15}$/.test(String(val || '').replace(/[^0-9]/g, ''));
        const isGroup = val => {
            const v = String(val || '').toUpperCase();
            return v.includes('ECHO') || v.includes('CODES');
        };

        // SÍel reparto parece teléfono, hacemos la rotación de campos
        if (isPhone(p.unit) && isGroup(p.contact)) {
            const oldUnit = p.unit; // era el teléfono
            const oldContact = p.contact; // era el grupo
            const oldGrupoDest = p.grupoDestino; // era el reparto real

            return {
                ...p,
                unit: oldGrupoDest,
                contact: oldUnit,
                grupoDestino: oldContact
            };
        }
        return p;
    });
}

// Configuración Inicial
const GYE_COORDS = [-2.1894, -79.8891];
const ZOOM_LEVEL = 12;

// Colores por delito para el mapa de calor
const CRIME_COLORS = {
    'robo': '#0ea5e9',
    'sicariato': '#ef4444',
    'muertes violentas': '#ef4444',
    'extorsion': '#10b981',
    'droga': '#f59e0b',
    'armas': '#475569',
    'secuestro': '#db2777',
    'narcotrafico': '#6366f1',
    'cámaras': '#22d3ee',
    'atentado': '#7f1d1d',
    'contrabando': '#d97706',
    'operacion': '#8b5cf6'
};

// --- SOLUCIÓN DEFINITIVA: Logo Institucional Embebido ---
const INSTITUTIONAL_LOGO_BASE64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCABBAEcDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9UjWZqWpWukWM95eXENrawx+ZLPPJ5aRr/eZjU11e2+n20k9xMkEEC+Y8jfKqrXj+m6ZP8bdWt/EGuWssXg+3cz6JpEhwl6w/1d9cp35/1cTfdwHPzEbABniX4x6nqGnvc+GbNbSweTyLbX9bt5fKnkyf+PW0T97dco542fJ86F1rk/Eeu2dppGgap4g8aeIfEWmavqb6fLPYz/2XHYSJv3v5cSpIY0eNwfMc7EV33/JUPh6DxN4z8DPpfxAube/tra8kiguWt/st6J7SblpIUTYYXdJFTy15iC53eY1dvb+AZTeXCWmhWGj6b9rkvWMkKkSymHyTIqnPlqY8oWXaWEjfdoA4C31Lw3c+CbjWoj4nl1Rr37Fp+lweMNQL3LvEssG+TzfkzE6Svw+xM/e21spql1Y+EPCureGPF+v2j63Zf2ja6Zq0P9rrBH5aPI06n/SXjjyiZSTO90rv08J3lu4vI9ctIYQ2Uf59nTHTzNnTj6IKw774fXNnrMurhbgXLJLbQ3OnTrF5VvIRI8YQJ8hkcD958z/7VAF3Tvi02mwafN4vtI9Psb4R/ZvEemTefpNwG/1chk+9CW9JPk+cLvavXwVIBHIPIIr5/it/EkPivwf4a0lrD/hAYd1pPo9nbfvbazjhfYLky7/MRnREzHt5J+9/D0VssvwX1eOEzyzeA9Rulhh3As2iTP0TPe2fsf8All0Py42AHsNFIORxRQB5J8WpD4q1bw/4EWaRY9Ylku9SWNfkbT4GjMsbt23vJDEU6sryEdK7zxLrUPhnR2lQxRvtEUEbEIm7HAFcn4dlOqfGzxrdAg29lYadp6qef3wM8r/pLF/3yK0/FUsd74q0bTSyhg/mbHwd/Jfv/wBcjQBkWmna5ZxRa1aaNDrGr3HDPeTpbGKP1ICHLV4p8S/Cvxm124S4vCtjoluI5nsdOu1YbcSblcbcuMOEMfRyOCteufGjxxL4U/sZLd7p5Lm4kV4LdgpuIxH8yNn7p/u/Q1yWh+Kp/iB47njvJLiGxuLG5srNNMuS1wsL7d0qlcBSDG37w8/MmOooA8m8VeJNc8LfCK306e1n1OD7WY11ayZJbied0wiJbg7pI5D8oYNu2c4rs/hdoPxn8H3cGy0N5pzIDLY6pMkQg+VMeUMsV6HGfu991a/hRvA3gHxjY2Nto+rW15aW1vi91O2eeSJWxHEX5JVuSN+B/qyOnNb+rfEWfwp4112VDdX1ldkq9jHhJYpYoygCZ6tIVX5unzJ6igDqhp2oaclxr8umx6JqISJLiKG6+0LJFHI0n8Kr/wA9HrrtQ0/TvHHh6ezvI1udM1C3kgmibkPGw2suex5rA+GnipfGGi300901xK11JC8TD/Vjj5F9V960/AxaKzubR7qK4mhl+cQrsVPwP0oAw/hDf6m/hi78P6nPPJq3hq6bSZL65ffJcxoEaGZm6F3heNn9GJFFSaa1zpnxp8TqybtPvNFsLiKBByZlmuElbH+6YfyooA50+J9O+HvxW+IN1qsrxWM1npN8rIhbzJJXlthGijksWjQf8DFRR+MYvE/irSdUi0bVtLukk8r7LrdsbS4jTp5qK3Rdksx5/wCeR/u8r8cNJgstZ8PeK7ne2mRb9G1VoiAIrW5eMx3Q9GhuEhIY/dUyMMc1wIvdSu9U1Pw/YabqWs2c1zMsniDXLtri9nljPkMUijUKkMe5MrJt3JLvUN1oAz/jSNVutbuIhZxrqOmzm7AmuFhjuVVt6OGydrYYBl75XHQ1X+FHiHxH4J0+C9Xwrc6hdyagkd1Z6eiz3VtZOPlZYlPPlHylHPzLvPavYYbOLxjpT6fdwW//AAlNvaBw06jbJIeACD1xtIOehzt4rxfTPA/jbTPGUWpWGiahol9CgRZs+ZZOoGBtkUtxg4+YbfmPNAGn4L+L2m6f8YPiLr+oJrWmyi2sbCG0122FnNOo82TMCHLTYeV1f+7sX1qD4j61rl1c6XrEGjhPEdxFFPqWkF/39s/7uRYXbpwuxd44zGa057H4rz3un6ze+H9HkuLYOlpqkkcT3lnG2/LeaeFVtqZ2AMe9YWgfDfxTqXit5r7R9Y1F72TMlzqM7LboOxVlG7YeeHwPTNAHafAhz4Wkh0i5hea5QNLd3TTeZHBGnmSHZIvB+d8H2IrrtN+Jfh7wtMJtf1D+z5r6YSK5y6qH5TLqD99g6j12t6VFrUmk+F9H1HRtKa2gSKJ5dRlkcIRCi+Yfurt5HZf4eOtcm2mW1t4s0681M6v4IurDTjq0clzNBNY3cEG9ZJJYV+64+05IYgAykjkUAeg+HtRbxB8b/EEtvIDp1joOnrBcKPlEs0tyzqfoiRH/AIGKKd8GbC6l8NX3iG/hlj1DxDePqZtwoQwwHEdvFtPQrDHFkeu71ooA9G1LSLLVdOurG8torizuojBLDIgZJIyCCjA8EEEjB45r511d9a+HGn3fhCO8OntqMscWk+Ij8kt1brgNZtM/yi+ES7YpH4YBDltjAfTNY3iLwxpHirSrjTtX0+31GxugokhuYlkU4YMuQR2YAj0IzQBxPibw5oWg+EDqFyz6Nb6LZrObqUvI0cMSE/PzvkKqSASSSTWR4e8Z3s2gyzo41w2xRjFqURhuNj/cMq7c7/vdVUfMO3zVmeM/hh4gk0G70LTLyXxB4YlZAdJ1W5MVzCY3EitHckSeYg2ACKZG8xmO5ynFcvqdxZpoWh+Hb/w5qujpaXa3Uujarokk2nXUSo8SxzvbrJbxoN0b/L8oMeTGtAHrQ8a6xPDC40SOVW3jzI2eSNSu7nIXn7v8Pr7Vk6945l0KLTH1u6s/DGn6hdCwgkbLLuKM4jG37vCNuL7QuDjNcU+s+H7C28NTaNqnh3T9R8P6pLfHRNJuZGtpUeGaARoI13KuJUk2iLGUJxzurNtlHinQdJ02Hwpr/iu8s9avdVeK6tJNMss3LzlopzdKjSwqtyQRGjFgMbMUAa+s65q+n+Jb/Q5bhY7sTxNZabLB5lvq+nOY1ndm6hY1ZgcAeWAGbcGVinhTwXpHj3WoxpFpLb+B7QpFJeT3Ms51gxYKW8TSEs1qpXc20jzHUKcqpz0OjfB/UdXgisvFd+jaBAMW/hTS3kFjGvUpNKx3XAydu07E28eXivZoLK3t7eKCK3iigiUIkSIAqKOgAHAAx0oAk8pCB8i9AOlFPooAKaegoooArH/UJ9P/AGWpX6N/ntRRQBkQf8fT/wC8n8q0pP8AXSfRv5LRRQBMeo+lS0UUAFFFFAH/2Q==";

// Estado de la Aplicación
// Estado de la Aplicación (Usando 'var' para visibilidad global en index.html)
// --- WEB SOCKETS: TIEMPO REAL ---
const socket = (typeof io !== 'undefined') ? io() : null;

if (socket) {
    socket.on('dataUpdate', (payload) => {
        const { key, data } = payload;
        console.log(`Recibida actualización en tiempo real para: ${key}`);

        // No sobrescribir si el usuario está editando algo
        if (editingId || editingPersonnelId || editingInstantOpId) return;

        // Actualizar variables globales y UI según la clave
        if (key === 'gyecrimes') {
            crimes = data;
            if (typeof renderTable === 'function') renderTable();
            if (typeof refreshMarkers === 'function') refreshMarkers();
            if (typeof refreshHeatLayer === 'function') refreshHeatLayer();
            if (typeof updateDashboard === 'function') updateDashboard();
        } else if (key === 'gyepersonal') {
            personnel = data;
            if (typeof renderPersonnelTable === 'function') renderPersonnelTable();
            if (typeof updatePersonnelStats === 'function') updatePersonnelStats();
            if (typeof renderDistributionTable === 'function') renderDistributionTable();
            if (typeof renderWatchDivision === 'function') renderWatchDivision();
            if (typeof updateDashboard === 'function') updateDashboard();
            if (typeof renderOtherFunctionsView === 'function') renderOtherFunctionsView();
        } else if (key === 'patrolOrders') {
            patrolOrders = data;
            if (typeof renderORDPATTable === 'function') renderORDPATTable();
            if (typeof populateOrderReferences === 'function') populateOrderReferences();
        } else if (key === 'instantOps') {
            instantOps = data;
            if (typeof renderInstantOpsTable === 'function') renderInstantOpsTable();
        } else if (key === 'gyevehicles') {
            vehicles = data;
            if (typeof renderVehiclesTable === 'function') renderVehiclesTable();
        } else if (key === 'gyechoferes') {
            choferes = data;
            if (typeof renderChoferesTable === 'function') renderChoferesTable();
        } else if (key === 'opsEvents') {
            opsEvents = data;
            if (typeof renderOpsPlanningTable === 'function') renderOpsPlanningTable();
        } else if (key === 'planData') {
            if (typeof planData !== 'undefined') {
                planData = data;
                if (typeof renderPlanTable === 'function') renderPlanTable();
            }
        } else if (key === 'commandPostPersonnel') {
            commandPostPersonnel = data;
            if (typeof renderCommandPostTable === 'function') renderCommandPostTable();
            if (typeof populateCommandPostSelectors === 'function') populateCommandPostSelectors();
        } else if (key === 'guardAssignments' || key === 'specialAssignments' || key === 'baborPersonnel' || key === 'estriborPersonnel') {
            if (key === 'guardAssignments') guardAssignments = data;
            if (key === 'specialAssignments') specialAssignments = data;
            if (key === 'baborPersonnel') baborPersonnel = data;
            if (key === 'estriborPersonnel') estriborPersonnel = data;
            if (typeof renderWatchDivision === 'function') renderWatchDivision();
            if (typeof updatePersonnelStats === 'function') updatePersonnelStats();
        } else if (key === 'lastDistributionConfig') {
            lastDistributionConfig = data;
            if (typeof renderDistributionTable === 'function') renderDistributionTable();
        } else if (key === 'app_passwords') {
            // Las contraseñas ya no se manejan en el frontend.
            // Solo actualizamos la lista de roles si cambió la tabla de usuarios.
            fetch(`${API_BASE}/users`).then(r => r.json()).then(roles => {
                storedRoles = roles;
                if (typeof renderAdminKeysTable === 'function') renderAdminKeysTable();
            }).catch(e => console.warn('Error actualizando roles:', e));
        } else if (key === 'gyeDrawnItems') {
            if (typeof drawnItems !== 'undefined' && drawnItems) {
                drawnItems.clearLayers();
                localStorage.setItem('gyeDrawnItems', JSON.stringify(data));
                loadDrawnItems();
            }
        } else if (key === 'rotationStartDate' || key === 'rotationStartGroup' || key === 'codescReferenceDate' || key === 'codescStartGroup' || key === 'logisticsReferenceDate' || key === 'logisticsStartGroup') {
            if (key === 'rotationStartDate') rotationStartDate = data;
            if (key === 'rotationStartGroup') rotationStartGroup = data;
            if (key === 'codescReferenceDate') codescStartDate = data;
            if (key === 'codescStartGroup') codescStartGroup = data;
            if (key === 'logisticsReferenceDate') logisticsStartDate = data;
            if (key === 'logisticsStartGroup') logisticsStartGroup = data;
            if (typeof updatePersonnelStats === 'function') updatePersonnelStats();
            if (typeof updateDashboard === 'function') updateDashboard();
        } else if (key === 'operationName') {
            operationName = data;
            const opNameEl = document.getElementById('operationNameDisplay');
            if (opNameEl) opNameEl.textContent = data || 'SIN NOMBRE';
        } else if (key === 'templatePatrolOrders') {
            templatePatrolOrders = data;
        } else if (key === 'externalOrdersMetadata') {
            externalOrdersMetadata = data;
        }
    });

    socket.on('userUpdate', (users) => {
        var mapEl = document.getElementById('map');
        var switcher = document.getElementById('map-layer-switcher');
        if (!mapEl || !switcher) return;
        var isVisible = mapEl.style.display !== 'none' && mapEl.offsetParent !== null;
        // Only show switcher when map is visible AND user is in Inteligencia module
        var role = sessionStorage.getItem('currentUserRole');
        var show = isVisible && role === 'INTELIGENCIA OMAI';
        switcher.style.display = show ? 'flex' : 'none';
        const currentRole = sessionStorage.getItem('currentUserRole');
        if (currentRole === 'ADMINISTRADOR') {
            renderActiveUsers(users);
        }
    });

    socket.on('newLog', (log) => {
        const currentRole = sessionStorage.getItem('currentUserRole');
        if (currentRole === 'ADMINISTRADOR') {
            appendNewLog(log);
        }
    });

    // Cargar logs iniciales si es admin (diferido para que window.refreshActivityLogs esté disponible)
    const initialRole = sessionStorage.getItem('currentUserRole');
    if (initialRole === 'ADMINISTRADOR') {
        setTimeout(() => {
            if (typeof window.refreshActivityLogs === 'function') {
                window.refreshActivityLogs();
            }
        }, 500);
    }

    // Reportar presencia inicial
    const role = sessionStorage.getItem('currentUserRole');
    if (role) {
        socket.emit('reportRole', { role });
    }
}

window.logActionToServer = function (action) {
    if (socket) {
        const role = sessionStorage.getItem('currentUserRole') || 'ANÓNIMO';
        socket.emit('logAction', { role, action });
    }
};

window.renderActiveUsers = function (users) {
    const tbody = document.getElementById('activeUsersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        const connectedTime = new Date(u.connectedAt).toLocaleTimeString();
        tr.innerHTML = `
            <td style="font-weight:700; color:var(--primary);">👤 ${u.role}</td>
            <td><code style="background:#f1f5f9; padding:2px 4px; border-radius:4px;">${u.ip}</code></td>
            <td>${connectedTime}</td>
            <td><span style="display:inline-block; width:8px; height:8px; background:#22c55e; border-radius:50%; margin-right:5px;"></span> En línea</td>
        `;
        tbody.appendChild(tr);
    });
};

window.refreshActivityLogs = async function () {
    try {
        const res = await fetch('/api/activity-logs');
        const logs = await res.json();
        renderActivityLogs(logs);
    } catch (e) { console.error("Error cargando logs:", e); }
};

window.renderActivityLogs = function (logs) {
    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    logs.forEach(log => appendNewLog(log, false));
};

function appendNewLog(log, isNew = true) {
    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    if (isNew) tr.style.background = '#f0fdf4';
    const time = new Date(log.timestamp).toLocaleString();
    tr.innerHTML = `
        <td style="font-size:0.8rem; color:var(--text-muted);">${time}</td>
        <td style="font-weight:600;">${log.user_role}</td>
        <td style="color:#334155;">${log.action}</td>
    `;
    if (isNew) {
        tbody.insertBefore(tr, tbody.firstChild);
        setTimeout(() => { tr.style.background = 'transparent'; }, 3000);
    } else {
        tbody.appendChild(tr);
    }
}

async function initAuth() {
    console.log("Iniciando Auth (modo seguro servidor)...");

    const loginSelect = document.getElementById('loginRole');
    if (loginSelect) {
        loginSelect.innerHTML = '<option value="">Cargando roles...</option>';
    }

    try {
        // Cargar roles desde el servidor (sin contraseñas)
        const res = await fetch(`${API_BASE}/users`);
        if (!res.ok) throw new Error('No se pudo obtener la lista de usuarios del servidor.');
        const roles = await res.json();
        storedRoles = roles;

        if (loginSelect) {
            loginSelect.innerHTML = '';
            if (!roles || roles.length === 0) {
                // Último recurso si el servidor no responde
                const opt = document.createElement('option');
                opt.value = 'ADMINISTRADOR';
                opt.textContent = 'ADMINISTRADOR';
                loginSelect.appendChild(opt);
            } else {
                roles.forEach(role => {
                    const opt = document.createElement('option');
                    opt.value = role;
                    opt.textContent = role;
                    loginSelect.appendChild(opt);
                });
            }
            console.log("Menú de acceso poblado con:", storedRoles);
        }
    } catch (e) {
        console.warn('Error cargando roles del servidor:', e);
        // Fallback: mostrar solo ADMINISTRADOR para que el sistema no quede bloqueado
        if (loginSelect) {
            loginSelect.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = 'ADMINISTRADOR';
            opt.textContent = 'ADMINISTRADOR';
            loginSelect.appendChild(opt);
        }
    }

    const currentSession = sessionStorage.getItem('currentUserRole');
    if (currentSession) {
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) loginOverlay.style.display = 'none';
        applyRBAC(currentSession);
    } else {
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) loginOverlay.style.display = 'flex';
    }

    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        // Eliminar listeners previos clonando el elemento
        const newBtn = btnLogin.cloneNode(true);
        btnLogin.parentNode.replaceChild(newBtn, btnLogin);
        newBtn.addEventListener('click', handleLogin);
    }
}

async function handleLogin() {
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) btnLogin.disabled = true;

    try {
        const roleSelect = document.getElementById('loginRole');
        const passInput = document.getElementById('loginPassword');
        if (!roleSelect || !passInput) throw new Error("Elementos de login no encontrados");

        const role = roleSelect.value;
        const pass = passInput.value;

        if (!role || !pass) {
            const errorDiv = document.getElementById('loginError');
            if (errorDiv) { errorDiv.textContent = 'Ingrese su usuario y contraseña.'; errorDiv.style.display = 'block'; }
            return;
        }

        // Enviar credenciales al servidor para validación segura
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, password: pass })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            // Limpiar el campo de contraseña inmediatamente
            if (passInput) passInput.value = '';

            sessionStorage.setItem('currentUserRole', data.role);
            const overlay = document.getElementById('loginOverlay');
            if (overlay) overlay.style.display = 'none';
            const errorDiv = document.getElementById('loginError');
            if (errorDiv) errorDiv.style.display = 'none';

            console.log("Acceso concedido como:", data.role);
            if (socket) socket.emit('reportRole', { role: data.role });
            if (typeof logActionToServer === 'function') logActionToServer('Inicio de sesión exitoso');

            try {
                applyRBAC(data.role);
            } catch (rbacError) {
                console.error("Error aplicando RBAC:", rbacError);
            }
        } else {
            const errorDiv = document.getElementById('loginError');
            if (errorDiv) {
                errorDiv.textContent = data.message || 'Credenciales incorrectas.';
                errorDiv.style.display = 'block';
            }
            console.warn("Acceso denegado para:", role);
        }
    } catch (err) {
        console.error("Error en handleLogin:", err);
        const errorDiv = document.getElementById('loginError');
        if (errorDiv) {
            errorDiv.textContent = 'Error de conexión con el servidor. Verifique que el servidor esté activo.';
            errorDiv.style.display = 'block';
        }
    } finally {
        if (btnLogin) btnLogin.disabled = false;
    }
}

function applyRBAC(role) {
    const statusArea = document.querySelector('.user-auth-area');
    if (statusArea) {
        let badge = statusArea.querySelector('.role-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'role-badge';
            badge.style.display = 'flex';
            badge.style.flexDirection = 'column';
            badge.style.alignItems = 'flex-end';
            badge.style.lineHeight = '1.3';
            statusArea.insertBefore(badge, statusArea.firstChild);
        }
        badge.innerHTML = `
            <span style="font-size:0.7rem; color:rgba(0,0,0,0.5); font-weight:500; text-transform:uppercase; letter-spacing:1px;">Usuario activo</span>
            <span style="font-size:0.9rem; color:#0f172a; font-weight:700; font-style:italic; letter-spacing:0.5px;">👤 ${role}</span>
        `;

        let logoutBtn = statusArea.querySelector('.logout-btn');
        if (!logoutBtn) {
            logoutBtn = document.createElement('button');
            logoutBtn.className = 'logout-btn';
            logoutBtn.innerHTML = 'Cerrar Sesión';
            logoutBtn.style.background = 'var(--accent)';
            logoutBtn.style.color = '#ffffff';
            logoutBtn.style.border = 'none';
            logoutBtn.style.padding = '0.5rem 1rem';
            logoutBtn.style.borderRadius = '6px';
            logoutBtn.style.fontWeight = '600';
            logoutBtn.style.fontSize = '0.8rem';
            logoutBtn.style.cursor = 'pointer';
            logoutBtn.style.transition = 'all 0.2s ease';
            logoutBtn.style.whiteSpace = 'nowrap';

            logoutBtn.onmouseover = () => { logoutBtn.style.filter = 'brightness(1.15)'; };
            logoutBtn.onmouseout = () => { logoutBtn.style.filter = 'brightness(1)'; };

            logoutBtn.onclick = () => {
                sessionStorage.removeItem('currentUserRole');
                location.reload();
            };
            statusArea.appendChild(logoutBtn);
        }
    }

    const menus = {
        'personal': document.getElementById('menuItem-personal'),
        'operaciones': document.getElementById('menuItem-operaciones'),
        'logistica': document.getElementById('menuItem-logistica'),
        'inteligencia': document.getElementById('menuItem-inteligencia'),
        'historicos': document.getElementById('menuItem-historicos'),
        'admin': document.getElementById('adminMenu'),
        'about': document.getElementById('menuItem-about')
    };

    // Ocultar todos primero
    Object.values(menus).forEach(m => { if (m) m.style.display = 'none'; });

    // Mostrar según el rol
    if (role === 'ADMINISTRADOR') {
        Object.values(menus).forEach(m => { if (m) m.style.display = 'block'; });
        enableLeafletPatch = true;
    } else if (role === 'JEFE OMAI') {
        ['personal', 'operaciones', 'logistica', 'inteligencia', 'historicos', 'about'].forEach(k => {
            if (menus[k]) menus[k].style.display = 'block';
        });
        enableLeafletPatch = false;
    } else if (role === 'CMDTE GT 51') {
        ['personal', 'operaciones', 'logistica', 'inteligencia', 'historicos', 'about'].forEach(k => {
            if (menus[k]) menus[k].style.display = 'block';
        });
        enableLeafletPatch = false;
    } else if (role === 'PERSONAL OMAI') {
        ['personal', 'about'].forEach(k => { if (menus[k]) menus[k].style.display = 'block'; });
        enableLeafletPatch = false;
    } else if (role === 'LOGISTICA OMAI') {
        ['logistica', 'about'].forEach(k => { if (menus[k]) menus[k].style.display = 'block'; });
        enableLeafletPatch = false;
    } else if (role === 'INTELIGENCIA OMAI') {
        ['inteligencia', 'about'].forEach(k => { if (menus[k]) menus[k].style.display = 'block'; });
        enableLeafletPatch = true;
    } else {
        enableLeafletPatch = false;
    }
    // Hide map layer switcher and map tools for non‑Inteligencia modules
    var switcher = document.getElementById('map-layer-switcher');
    if (switcher) {
        switcher.style.display = (role === 'INTELIGENCIA OMAI') ? 'flex' : 'none';
    }
    var mapTools = document.getElementById('map-tools-item');
    if (mapTools) {
        mapTools.style.display = (role === 'INTELIGENCIA OMAI') ? 'block' : 'none';
    }



    if (role === 'CMDTE GT 51') {
        setTimeout(() => {
            document.querySelectorAll('input:not([type="search"]), select:not(.filter-select), textarea').forEach(el => {
                if (el.id !== 'loginRole' && el.id !== 'loginPassword') {
                    el.disabled = true;
                }
            });
            document.querySelectorAll('.btn-primary, .btn-secondary').forEach(el => {
                if (!el.id.includes('export') && !el.classList.contains('nav-btn') && !el.classList.contains('sub-menu-btn') && el.id !== 'btnLogin') {
                    el.style.display = 'none';
                }
            });
            document.querySelectorAll('.btn-remove-row, .delete-btn').forEach(el => el.style.display = 'none');
            const mapTools = document.getElementById('map-tools-item');
            if (mapTools) mapTools.style.display = 'none';
        }, 500);
    }
}

window.handleGenerateKey = async function (e) {
    e.preventDefault();
    const role = document.getElementById('keyRole').value.trim().toUpperCase();
    const newPass = document.getElementById('newPassword').value.trim();

    if (!role || !newPass) return;
    if (newPass.length < 4) {
        showNotification('La contraseña debe tener al menos 4 caracteres.', 'error');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, newPassword: newPass })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            logActionToServer(`Actualizó clave para el rol: ${role}`);
            showNotification('Contraseña actualizada exitosamente para: ' + role);
            document.getElementById('adminKeysForm').reset();
            // Recargar la tabla de usuarios
            const rolesRes = await fetch(`${API_BASE}/users`);
            storedRoles = await rolesRes.json();
            renderAdminKeysTable();
        } else {
            showNotification('Error: ' + (data.message || 'No se pudo actualizar.'), 'error');
        }
    } catch (err) {
        console.error('Error al cambiar contraseña:', err);
        showNotification('Error de conexión con el servidor.', 'error');
    }
};

window.renderAdminKeysTable = function () {
    const tbody = document.getElementById('adminKeysTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Usar storedRoles (cargados desde el servidor, sin contraseñas)
    const roles = storedRoles || [];

    if (roles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Sin usuarios configurados</td></tr>';
        return;
    }

    roles.forEach(role => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${role}</strong></td>
            <td>
                <span style="color: var(--text-muted); font-style: italic;">Contraseña protegida (solo en servidor)</span>
            </td>
            <td style="display:flex; gap:0.5rem; justify-content:center;">
                <button class="btn-action edit-key-btn" data-role="${role}">Cambiar Clave</button>
                ${role !== 'ADMINISTRADOR' ? `<button class="delete-btn delete-key-btn" data-role="${role}">&#x1F5D1;&#xFE0F; Borrar</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.edit-key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.getElementById('keyRole').value = e.target.dataset.role;
            document.getElementById('newPassword').value = '';
            document.getElementById('newPassword').focus();
        });
    });

    document.querySelectorAll('.delete-key-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const role = e.target.dataset.role;
            if (confirm(`¿Estás seguro de que deseas eliminar el acceso para: ${role}?`)) {
                try {
                    // Borrar usuario en el servidor
                    const res = await fetch(`${API_BASE}/delete-user`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role })
                    });
                    if (res.ok) {
                        storedRoles = storedRoles.filter(r => r !== role);
                        renderAdminKeysTable();
                        showNotification(`Usuario ${role} eliminado.`);
                        logActionToServer(`Eliminó el acceso para el rol: ${role}`);
                    } else {
                        showNotification('Error al eliminar usuario.', 'error');
                    }
                } catch (err) {
                    console.error('Error al eliminar usuario:', err);
                    showNotification('Error de conexión.', 'error');
                }
            }
        });
    });
};

function safeJSONParse(key, defaultVal) {
    try {
        const val = localStorage.getItem(key);
        if (val === null || val === undefined || val === 'undefined') return defaultVal;
        return JSON.parse(val) || defaultVal;
    } catch (e) {
        console.warn('Error parsing ' + key + ' from localStorage', e);
        return defaultVal;
    }
}

var crimes = [];
var personnel = [];
var selectedLatLng = null;
var editingId = null;
var editingPersonnelId = null;
var map;
var kmzLayer = null;
var kmzControl = null;
var drawnItems = null;
var markerLayer = null;
var currentPropertyLayer = null;
var polygonDrawer = null;
var polylineDrawer = null;
var editHandler = null;
var heatLayers = {};
var incidentMarkers = {};
var crimeChart = null;
var guardAssignments = [];
var specialAssignments = [];
var selectedWatchGroup = localStorage.getItem('selectedWatchGroup') || null;
var baborPersonnel = [];
var estriborPersonnel = [];
var opsEvents = [];
var instantOps = [];
var patrolOrders = [];
var commandPostPersonnel = [];
var personnelHistory = [];
var vehicles = [];
var operationName = localStorage.getItem('operationName') || "S/N";
var externalOrdersMetadata = [];
var templatePatrolOrders = [];
var currentInstantOpsPhotos = [];
var editingInstantOpId = null;
var escudoBase64 = INSTITUTIONAL_LOGO_BASE64; // Usar el logo embebido por defecto
var seqStr = "001";
var closedOrders = [];
var incidentFilters = { type: '', district: '' };
var isHistoricosView = false;
var currentSigningOpId = null;
var signaturePadInstance = null;
// --- Global helpers for Orden de Patrulla ---
window.updateORDPATAutomaticFields = function () {
    const dtgInput = document.getElementById('opDTGAuto');
    const seqInput = document.getElementById('opSequence');
    if (!dtgInput || !seqInput) return;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const monthShorts = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const month = monthShorts[now.getMonth()];
    const year = now.getFullYear();

    dtgInput.value = `${day}${hour}${min}R-${month}-${year}`;

    let maxSerial = 0;
    patrolOrders.forEach(op => {
        const s = parseInt(op.serial, 10);
        if (!isNaN(s) && s > maxSerial) maxSerial = s;
    });
    seqInput.value = (maxSerial + 1).toString().padStart(3, '0');
    window.updateORDPATDisplayId();
};

window.updateORDPATDisplayId = function () {
    const prefixInput = document.getElementById('opPrefix');
    const dtgInput = document.getElementById('opDTGAuto');
    const seqInput = document.getElementById('opSequence');
    const displayId = document.getElementById('displayIdCentered');
    if (!prefixInput || !dtgInput || !seqInput || !displayId) return;

    const prefix = prefixInput.value || '';
    const dtg = dtgInput.value || 'XXXXXXR-XXX-2026';
    const serial = seqInput.value || '000';
    displayId.textContent = `${prefix}${dtg}-${serial}-S`;
};

window.handleNewORDPATClick = function () {
    const ordpatBtn = document.querySelector('.sub-menu-btn[data-view="ordpatView"]');
    if (ordpatBtn) {
        ordpatBtn.click();
    } else {
        showAppView('ordpatView');
    }

    // En lugar de resetear, pre-llenamos con la última
    window.prefillORDPATFormWithLast();

    window.updateORDPATAutomaticFields();
    window.updateORDPATDisplayId();
    showNotification('Formulario pre-llenado con datos de la última orden generada');
};

window.prefillORDPATFormWithLast = function () {
    if (!patrolOrders || patrolOrders.length === 0) return;

    // Obtener la última generada por fecha
    const sorted = [...patrolOrders].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const last = sorted[0];

    console.log("Pre-llenando con última orden:", last.displayId);

    // Campos de texto y selectores simples
    const simpleFields = {
        'opHuso': last.huso,
        'opLugar': last.lugar,
        'opDestinatario': last.destinatario,
        'opCopia': last.copia,
        'opHeaderText': last.headerText,
        'opOrgComando': last.orgComando,
        'opSituacionMain': last.situacionMain,
        'opSituacionAmenaza': last.amenaza,
        'opSituacionPropias': last.propias,
        'opMisionA': last.misionA,
        'opMisionB': last.misionB,
        'opIntencion': last.intencion,
        'opConcepto': last.concepto,
        'opTareasText': last.tareasText,
        'opConducta': last.conducta,
        'opCoordinacion': last.coordinacion,
        'opLogAbastecimiento': last.logistica,
        'opLogEvacuacion': last.logEvacuacion,
        'opLogPersonal': last.logPersonal,
        'opMando': last.mando,
        'opComunicaciones': last.comunicaciones,
        'opFirmanteNombre': last.firmanteNombre,
        'opFirmanteGrado': last.firmanteGrado,
        'opFirmanteCargo': last.firmanteCargo,
        'opAutorNombre': last.autorNombre,
        'opAutorCargo': last.autorCargo,
        'opSumilla': last.sumilla,
        'opPrecedencia': last.precedencia
    };

    for (const [id, val] of Object.entries(simpleFields)) {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    }

    // Re-poblar tablas dinámicas (Referencias y Elementos)
    const refsBody = document.getElementById('opRefsBody');
    if (refsBody && last.referencias) {
        refsBody.innerHTML = '';
        last.referencias.forEach(ref => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><input type="text" class="row-ref-text" value="${ref.text || ''}" style="width:100%"></td>
                             <td><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">í—</button></td>`;
            refsBody.appendChild(row);
        });
    }

    const orgBody = document.getElementById('opOrgElementsBody');
    if (orgBody && last.orgElementos) {
        orgBody.innerHTML = '';
        last.orgElementos.forEach(el => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><input type="text" class="org-sigla" value="${el.sigla || ''}"></td>
                             <td><input type="text" class="org-nomi" value="${el.nombre || ''}"></td>
                             <td><input type="text" class="org-pers" value="${el.personal || ''}"></td>
                             <td><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">í—</button></td>`;
            orgBody.appendChild(row);
        });
    }
};

// --- INDEXED DB HELPER (Para PDFs Externos) ---
const DB_NAME = 'OrderRepositoryDB';
const STORE_NAME = 'orders';
let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
};

// Helpers para convertir de Blob a DataURL/Base64 y viceversa
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function dataURLToBlob(dataUrl) {
    try {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    } catch (e) {
        console.error("DataURL to Blob failed:", e);
        return null;
    }
}

const saveOrderToDB = async (id, blob) => {
    // 1. Guardar localmente en IndexedDB
    await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, blob });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });

    // 2. Convertir a DataURL y guardar en el servidor SQLite
    try {
        const dataUrl = await blobToBase64(blob);
        await serverSave('file_' + id, dataUrl);
        localStorage.setItem(`synced_file_${id}`, 'true');
    } catch (e) {
        console.error("Error saving file to server:", e);
    }
};

const getOrderFromDB = async (id) => {
    // 1. Intentar obtener localmente de IndexedDB
    let blob = await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
        request.onerror = (e) => reject(e);
    });

    // 2. Si no está localmente, buscar en el servidor
    if (!blob) {
        try {
            console.log(`File ${id} not found in local IndexedDB. Fetching from server...`);
            const dataUrl = await serverLoad('file_' + id, null);
            if (dataUrl) {
                blob = dataURLToBlob(dataUrl);
                if (blob) {
                    // Guardar localmente para caché futura
                    await new Promise((resolve) => {
                        const transaction = db.transaction([STORE_NAME], 'readwrite');
                        const store = transaction.objectStore(STORE_NAME);
                        const request = store.put({ id, blob });
                        request.onsuccess = () => resolve();
                        request.onerror = () => resolve(); // ignorar fallos de guardado de caché
                    });
                    localStorage.setItem(`synced_file_${id}`, 'true');
                }
            }
        } catch (e) {
            console.error("Error loading file from server:", e);
        }
    }

    return blob;
};

const deleteOrderFromDB = async (id) => {
    // 1. Eliminar localmente de IndexedDB
    await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });

    // 2. Eliminar del servidor (guardando null o vacío)
    try {
        await serverSave('file_' + id, null);
        localStorage.removeItem(`synced_file_${id}`);
    } catch (e) {
        console.error("Error deleting file from server:", e);
    }
};

const syncLocalFilesToServer = async () => {
    if (!db) return;
    try {
        const localIds = await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e);
        });

        console.log("Local files in IndexedDB:", localIds);

        for (const id of localIds) {
            const syncKey = `synced_file_${id}`;
            if (!localStorage.getItem(syncKey)) {
                console.log(`File ${id} not marked as synced. Syncing to server...`);
                const blob = await new Promise((resolve, reject) => {
                    const transaction = db.transaction([STORE_NAME], 'readonly');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.get(id);
                    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
                    request.onerror = (e) => reject(e);
                });

                if (blob) {
                    const dataUrl = await blobToBase64(blob);
                    await serverSave('file_' + id, dataUrl);
                    localStorage.setItem(syncKey, 'true');
                    console.log(`File ${id} successfully synced to server SQLite.`);
                }
            }
        }
    } catch (e) {
        console.error("Error running background file sync:", e);
    }
};

initDB().then(() => {
    console.log("IndexedDB Initialized");
    syncLocalFilesToServer();
}).catch(err => console.error("IDB Fail:", err));

// Migración de Datos (Asegurar IDs)
patrolOrders.forEach(op => { if (!op.id) op.id = 'ordpat_' + Math.random().toString(36).substr(2, 9); });

const CATEGORY_GRADIENTS = {
    'robo': { 0.2: 'white', 0.5: '#38bdf8', 0.8: '#0ea5e9', 1.0: '#0284c7' },       // Azul
    'sicariato': { 0.2: 'white', 0.5: '#f87171', 0.8: '#ef4444', 1.0: '#b91c1c' },  // Rojo
    'muertes violentas': { 0.2: 'white', 0.5: '#f87171', 0.8: '#ef4444', 1.0: '#b91c1c' }, // Rojo
    'extorsion': { 0.2: 'white', 0.5: '#6ee7b7', 0.8: '#10b981', 1.0: '#065f46' },  // Esmeralda
    'droga': { 0.2: 'white', 0.5: '#fcd34d', 0.8: '#f59e0b', 1.0: '#d97706' },      // Ambar
    'armas': { 0.2: 'white', 0.5: '#94a3b8', 0.8: '#475569', 1.0: '#1e293b' },      // Slate
    'secuestro': { 0.2: 'white', 0.5: '#f472b6', 0.8: '#db2777', 1.0: '#9d174d' },  // Rosa
    'narcotrafico': { 0.2: 'white', 0.5: '#a5b4fc', 0.8: '#6366f1', 1.0: '#3730a3' }, // Indigo
    'cámaras': { 0.2: 'white', 0.5: '#67e8f9', 0.8: '#22d3ee', 1.0: '#0891b2' },   // Cyan
    'atentado': { 0.2: 'white', 0.5: '#fca5a5', 0.8: '#b91c1c', 1.0: '#7f1d1d' },  // Granate
    'contrabando': { 0.2: 'white', 0.5: '#fbbf24', 0.8: '#d97706', 1.0: '#92400e' }, // Marron/Ambar
    'operacion': { 0.2: 'white', 0.5: '#c084fc', 0.8: '#8b5cf6', 1.0: '#6d28d9' }   // Violeta
};

// Inicialización
// --- MASTER CLICK DELEGATION ---
// Nota: Los .menu-btn del sidebar son manejados por onclick="toggleSidebarMenu()" en index.html
// Este listener maneja: sub-menu-btn y top-nav dropdowns
document.addEventListener('click', (e) => {

    // 2. Top Nav Dropdowns
    const topNavBtn = e.target.closest('.top-nav .nav-btn');
    if (topNavBtn) {
        const navItem = topNavBtn.closest('.nav-item');
        const dropdown = navItem ? navItem.querySelector('.dropdown-content') : null;
        if (dropdown) {
            const isShown = dropdown.classList.contains('show');
            document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.nav-btn.active').forEach(b => b.classList.remove('active'));

            if (!isShown) {
                dropdown.classList.add('show');
                topNavBtn.classList.add('active');
            }
        }
        e.preventDefault();
        return;
    }

    // Cerrar dropdowns al hacer clic fuera
    if (!e.target.closest('.nav-item')) {
        document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
        document.querySelectorAll('.nav-btn.active').forEach(b => b.classList.remove('active'));
    }
});

function showAppView(viewId) {
    if (!viewId) return;

    // Ocultar herramientas de mapa por defecto
    const mapTools = document.getElementById('map-tools-item');
    if (mapTools) mapTools.style.display = 'none';

    const allViews = [
        'personnelView', 'distributionView', 'personnelStatsView', 'watchDivisionView',
        'commandPostView', 'opsPlanningView', 'ordpatView', 'loadOrdersView', 'instantOpsView',
        'historicalPatrolView', 'operationalReportsView', 'logisticsView',
        'crimesTableWrapper', 'dashboardOverlay', 'patrolComplianceView', 'adminKeysView', 'aboutView',
        'postDistributionView', 'ordpatEchoView', 'ordpat51View', 'patrolTemplateRegistryView',
        'adminDataManagementView', 'adminActivityView', 'otherFunctionsView', 'adminOrgView',
        'regimenDiferenciadoView'
    ];

    allViews.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === viewId) {
            el.style.display = (id === 'loadOrdersView' || id === 'dashboardOverlay') ? 'flex' : 'block';
        } else {
            el.style.display = 'none';
        }
    });

    const tableOverlay = document.querySelector('.table-overlay');
    const mapEl = document.getElementById('map');
    const switcher = document.getElementById('map-layer-switcher');
    const role = sessionStorage.getItem('currentUserRole');
    const isMapView = viewId === 'crimesTableWrapper';

    if (tableOverlay) tableOverlay.style.display = isMapView ? 'block' : 'none';
    if (mapEl) {
        mapEl.style.display = isMapView ? 'block' : 'none';
        if (isMapView && typeof map !== 'undefined' && map) {
            if (typeof triggerResilientMapResize === 'function') {
                triggerResilientMapResize();
            } else {
                setTimeout(() => {
                    map.invalidateSize();
                    // Refrescar mapa de calor para eliminar tiles vacíos
                    if (typeof refreshHeatLayer === 'function') refreshHeatLayer();
                }, 200);
            }
        }
    }
    // Ensure switcher only visible when in Inteligencia module and heat map view is active
    if (switcher) {
        switcher.style.display = (isMapView && role === 'INTELIGENCIA OMAI') ? 'flex' : 'none';
    }

    if (viewId === 'personnelStatsView') updatePersonnelStats();
    if (viewId === 'watchDivisionView') renderWatchDivision();
    if (viewId === 'commandPostView') renderCommandPostTable();
    if (viewId === 'historicalPatrolView') renderHistoricalPatrolTable();
    if (viewId === 'ordpatView') { renderORDPATTable(); if (typeof prefillORDPATFormWithLast === 'function') prefillORDPATFormWithLast(); }
    if (viewId === 'opsPlanningView') renderOpsPlanningTable();
    if (viewId === 'instantOpsView') {
        renderInstantOpsTable();
        window.populateOrderReferences(); // Asegurar que las óÓÓrdenes carguen al entrar
    }
    if (viewId === 'loadOrdersView' && typeof renderLoadOrdersView === 'function') renderLoadOrdersView();
    if (viewId === 'patrolComplianceView') { populatePatrolOrdersForCompliance(); renderPatrolComplianceTable(); }
    if (viewId === 'distributionView') renderDistributionTable();
    if (viewId === 'otherFunctionsView') renderOtherFunctionsView();
    if (viewId === 'regimenDiferenciadoView' && typeof initRegimenDiferenciado === 'function') initRegimenDiferenciado();
    if (viewId === 'adminKeysView' && typeof renderAdminKeysTable === 'function') renderAdminKeysTable();
    if (viewId === 'adminOrgView' && typeof renderOrgUnitsAdmin === 'function') renderOrgUnitsAdmin();
    if (viewId === 'postDistributionView') { if (typeof resetPostConfig === 'function') resetPostConfig(); }
    if (viewId === 'patrolTemplateRegistryView' && typeof refreshTemplateRegistry === 'function') refreshTemplateRegistry();
}

function activateSubmenuView(viewId, btn, hideForm = false) {
    if (!viewId) return;

    isHistoricosView = hideForm;

    const parentMenu = btn ? btn.closest('.sub-menu') : null;
    if (parentMenu) {
        parentMenu.querySelectorAll('.sub-menu-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const menuContent = parentMenu.closest('.menu-content');
        if (menuContent) {
            const menuBtn = menuContent.previousElementSibling;
            document.querySelectorAll('.sidebar-menu .menu-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.sidebar-menu .menu-content').forEach(c => c.classList.remove('active'));
            if (menuBtn) menuBtn.classList.add('active');
            menuContent.classList.add('active');
        }
    }

    showAppView(viewId);

    // Si es la vista de Partes al Instante, ocultar/mostrar el formulario según corresponda
    if (viewId === 'instantOpsView') {
        const formContainer = document.querySelector('#instantOpsView .official-document');
        if (formContainer) {
            formContainer.style.display = hideForm ? 'none' : 'block';
        }
        renderInstantOpsTable();
    }
}

function attachSubMenuClickHandlers() {
    document.querySelectorAll('.sub-menu-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const viewId = this.dataset.view;
            if (!viewId) return;

            const parentMenu = this.closest('.sub-menu');
            if (parentMenu) {
                parentMenu.querySelectorAll('.sub-menu-btn').forEach(b => b.classList.remove('active'));
            }
            this.classList.add('active');
            showAppView(viewId);
        });
    });
}

// Inicialización Resiliente
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Initializing app (Multi-user sync)...");

        // Primero inicializar Auth con datos locales/default para que el menú no aparezca vacío
        initAuth();
        if (typeof initAllRichTextEditors === 'function') initAllRichTextEditors();

        // Luego sincronizar con el servidor en segundo plano
        await loadAllDataFromServer();

        // Re-inicializar Auth por si el servidor tiene claves actualizadas
        initAuth();

        // 1. Inicializar Mapa (Crucial para funciones que dependen de 'map')
        if (typeof initMap === 'function') {
            try { initMap(); } catch (e) { console.error("Error inicializando mapa:", e); }
        }

        if (typeof setupTopNav === 'function') {
            try { setupTopNav(); } catch (e) { console.error("Error en setupTopNav:", e); }
        }

        if (typeof updateUI === 'function') updateUI();
        if (typeof setupEventListeners === 'function') setupEventListeners();

        // Iniciar monitoreo de conexión
        updateConnectionStatus();
        setInterval(updateConnectionStatus, 10000); // Cada 10 segundos

        attachSubMenuClickHandlers();

        try { renderTable(); } catch (e) { }
        try { renderPersonnelTable(); } catch (e) { }
        try { updateDashboard(); } catch (e) { }
        try { updatePersonnelStats(); } catch (e) { }
        try { renderOpsPlanningTable(); } catch (e) { }
        try { renderInstantOpsTable(); } catch (e) { }
        try { renderORDPATTable(); } catch (e) { }
        try { renderVehiclesTable(); } catch (e) { }
        try { renderChoferesTable(); } catch (e) { }
        try { renderPatrolComplianceTable(); } catch (e) { }
        try { initInfografiaFilters(); } catch (e) { console.error("Error al inicializar filtros de infografia:", e); }

        if (typeof setupWatchSearch === 'function') setupWatchSearch();

        // --- Inicialización de Filtros y Selectores (Después de cargar datos) ---
        const filterType = document.getElementById('filterCrimeType');
        const filterDistrict = document.getElementById('filterCrimeDistrict');
        const clearBtn = document.getElementById('clearFiltersBtn');

        if (filterType) {
            filterType.addEventListener('change', (e) => {
                incidentFilters.type = e.target.value;
                renderTable();
            });
        }
        if (filterDistrict) {
            filterDistrict.addEventListener('change', (e) => {
                incidentFilters.district = e.target.value;
                renderTable();
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                incidentFilters.type = '';
                incidentFilters.district = '';
                if (filterType) filterType.value = '';
                if (filterDistrict) filterDistrict.value = '';
                renderTable();
            });
        }

        // --- Motor de Guardia Logística (2x2) ---
        const logDateInp = document.getElementById('logisticsRotationDate');
        const logGrpSel = document.getElementById('logisticsStartGroup');

        if (logDateInp) {
            logDateInp.value = logisticsStartDate || localStorage.getItem('logisticsReferenceDate') || '';
            logDateInp.addEventListener('change', (e) => {
                logisticsStartDate = e.target.value;
                saveAppState('logisticsReferenceDate', logisticsStartDate);
                updatePersonnelStats();
            });
        }
        if (logGrpSel) {
            logGrpSel.value = logisticsStartGroup || localStorage.getItem('logisticsStartGroup') || 'ESTRIBOR';
            logGrpSel.addEventListener('change', (e) => {
                logisticsStartGroup = e.target.value;
                saveAppState('logisticsStartGroup', logisticsStartGroup);
                updatePersonnelStats();
            });
        }

        renderTable();

        // Puesto de Mando & Selectors de ORDPAT
        renderCommandPostTable();
        populateCommandPostSelectors();
        populateORDPATSelectors();

        const opShiftSel = document.getElementById('opShiftSelector');
        if (opShiftSel) {
            opShiftSel.addEventListener('change', populateORDPATSelectors);
        }

        const opPostSel = document.getElementById('opPostSelector');
        if (opPostSel) {
            opPostSel.addEventListener('change', syncORDPATPersonnel);
        }

    } catch (err) {
        console.error("Critical Init Error:", err);
    }
});

// --- NUEVO: Lógica de Menú Superior (Click to toggle) ---
function setupTopNav() {
    console.log("Setting up Top Nav...");
    const navBtns = document.querySelectorAll('.top-nav .nav-btn');

    if (navBtns.length === 0) {
        console.warn("No nav buttons found in .top-nav");
        return;
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Buscar el dropdown-content hermano del botón
            const navItem = btn.closest('.nav-item');
            const dropdown = navItem ? navItem.querySelector('.dropdown-content') : null;

            if (dropdown) {
                const alreadyOpen = dropdown.classList.contains('show');

                // Toggle el actual
                dropdown.classList.toggle('show');
                btn.classList.toggle('active');

                console.log(`Dropdown ${btn.textContent.trim()} toggled. Status: ${!alreadyOpen}`);
            } else {
                console.error("Dropdown content not found for button", btn);
            }
        });
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-item')) {
            const openDropdowns = document.querySelectorAll('.dropdown-content.show');
            const activeBtns = document.querySelectorAll('.nav-btn.active');

            if (openDropdowns.length > 0 || activeBtns.length > 0) {
                openDropdowns.forEach(d => d.classList.remove('show'));
                activeBtns.forEach(b => b.classList.remove('active'));
                console.log("Closed all dropdowns (click outside)");
            }
        }
    });
}

function initMap() {
    if (window.map) return;
    // Inicializar mapa centrado en Guayaquil
    window.map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false // Cambiado a false para usar SVG y asegurar interacción de clics
    }).setView(GYE_COORDS, ZOOM_LEVEL);

    map = window.map; // Sincronizar referencia local

    // Capa de mapa (CartoDB Positron - Tema Claro)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    // Mover control de zoom a la derecha
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Inicializar capa de marcadores primero (para que refreshHeatLayer pueda traerla al frente)
    markerLayer = L.featureGroup().addTo(map);

    // Inicializar capas de calor
    refreshHeatLayer();

    // Cargar marcadores iniciales
    refreshMarkers();

    // Control de capas (para gestionar las capas KMZ que se añadan)
    kmzControl = L.control.layers(null, null, {
        collapsed: true,
        position: 'topright'
    }).addTo(map);

    kmzControl.addOverlay(markerLayer, "Marcadores de Incidentes");

    // Inicializar cargador de KMZ
    initKMZLoader();

    // Evento clic en el mapa para seleccionar ubicación
    map.on('click', (e) => {
        selectedLatLng = e.latlng;

        // Actualizar displays si existen (Inteligencia)
        if (document.getElementById('lat')) document.getElementById('lat').textContent = `Lat: ${selectedLatLng.lat.toFixed(5)}`;
        if (document.getElementById('lng')) document.getElementById('lng').textContent = `Lng: ${selectedLatLng.lng.toFixed(5)}`;

        // Marcador temporal
        const tempMarker = L.circleMarker(selectedLatLng, {
            radius: 8,
            fillColor: "#38bdf8",
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);

        setTimeout(() => {
            if (map && tempMarker) {
                map.removeLayer(tempMarker);
            }
        }, 2000);
    });

    // Evento para capturar clics en áreas (polígonos, líneas, círculos) y actualizar coordenadas
    map.on('layeradd', (e) => {
        const layer = e.layer;
        if (layer && layer.options && layer.options.pane !== 'markerPane' &&
            (layer instanceof L.Polygon || layer instanceof L.Polyline || layer instanceof L.Circle)) {
            layer.on('click', (evt) => {
                selectedLatLng = evt.latlng;
                if (document.getElementById('lat')) document.getElementById('lat').textContent = `Lat: ${selectedLatLng.lat.toFixed(5)}`;
                if (document.getElementById('lng')) document.getElementById('lng').textContent = `Lng: ${selectedLatLng.lng.toFixed(5)}`;

                // Marcador temporal
                const tempMarker = L.circleMarker(selectedLatLng, {
                    radius: 8,
                    fillColor: "#38bdf8",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                setTimeout(() => {
                    if (map && tempMarker) {
                        map.removeLayer(tempMarker);
                    }
                }, 2000);
            });
        }
    });
}

// Funciones para guardar/cargar dibujos del mapa
function saveDrawnItems() {
    if (!drawnItems) return;
    try {
        const data = drawnItems.toGeoJSON();
        saveAppState('gyeDrawnItems', JSON.stringify(data));
    } catch (e) {
        console.error("Error saving drawn items", e);
    }
}

function loadDrawnItems() {
    if (!drawnItems || !map) return;
    const dataStr = localStorage.getItem('gyeDrawnItems');
    if (!dataStr) return;
    try {
        const data = JSON.parse(dataStr);
        L.geoJSON(data, {
            style: function (feature) {
                return feature.properties && feature.properties.style ? feature.properties.style : { color: '#38bdf8', weight: 3, fillOpacity: 0.3 };
            },
            onEachFeature: function (feature, layer) {
                layer.feature = feature;

                // Restaurar opciones del layer para futuras ediciones
                if (feature.properties && feature.properties.style) {
                    layer.options = layer.options || {};
                    Object.assign(layer.options, feature.properties.style);
                }

                if (feature.properties && feature.properties.name) {
                    layer.featureName = feature.properties.name;
                    layer.bindPopup(`<b>Sector:</b> ${layer.featureName}`);
                }

                layer.on('contextmenu', (e) => {
                    try {
                        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                        window.openPropertiesModal(layer);
                    } catch (err) {
                        alert("Error right click (load): " + err.message);
                    }
                });

                if (feature.geometry.type === 'LineString') {
                    const coords = layer.getLatLngs();
                    let distance = 0;
                    for (let i = 0; i < coords.length - 1; i++) {
                        distance += coords[i].distanceTo(coords[i + 1]);
                    }
                    layer.bindPopup(`<b>Distancia:</b> ${distance.toFixed(2)} metros`);
                }

                drawnItems.addLayer(layer);
            }
        });
    } catch (e) {
        console.error("Error cargando dibujos:", e);
    }
}

function setupEventListeners() {
    const form = document.getElementById('crimeForm');
    if (form) form.addEventListener('submit', handleFormSubmit);

    const personnelForm = document.getElementById('personnelForm');
    if (personnelForm) personnelForm.addEventListener('submit', handlePersonnelSubmit);

    // Importación Excel de Personal
    const btnImportPersExcel = document.getElementById('importPersonnelExcel');
    const inputPersExcel = document.getElementById('personnelExcelFile');
    const btnDownloadPersTemplate = document.getElementById('downloadPersonnelTemplate');

    if (btnImportPersExcel && inputPersExcel) {
        btnImportPersExcel.addEventListener('click', (e) => {
            e.preventDefault();
            inputPersExcel.click();
        });
        inputPersExcel.addEventListener('change', handlePersonnelExcelImport);
    }

    const personnelSearchInput = document.getElementById('personnelSearchInput');
    if (personnelSearchInput) {
        personnelSearchInput.addEventListener('input', (e) => {
            renderPersonnelTable(e.target.value.toLowerCase());
        });
    }

    const clearFoBtn = document.getElementById('clearFoBtn');
    const newFoBtn = document.getElementById('newFoBtn');

    if (clearFoBtn) {
        clearFoBtn.addEventListener('click', () => {
            showNotification('Formulario de Orden Fragmentaria limpiado');
        });
    }

    if (newFoBtn) {
        newFoBtn.addEventListener('click', () => {
            const createNewFromBase = (baseOrder) => {
                const newId = 'frag_' + Date.now();

                const newFo = JSON.parse(JSON.stringify(baseOrder || {}));
                newFo.id = newId;
                newFo.numero = seqStr;
                newFo.estado = 'abierta';
                newFo.timestamp = new Date().toISOString();

                saveData();

                const formElement = document.getElementById('patrolOrderForm');
                if (formElement) formElement.scrollIntoView({ behavior: 'smooth' });
                showNotification(`Nueva Orden de Patrulla ${seqStr} generada y lista para editar`);
            };

            if (closedOrders.length > 0) {
                const latest = [...closedOrders].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                createNewFromBase(latest);
                createNewFromBase(latest);
            } else {
                const newId = 'frag_' + Date.now();

                const blankFo = {
                    id: newId,
                    numero: seqStr,
                    estado: 'abierta',
                    timestamp: new Date().toISOString()
                };
                saveData();

                showNotification('Iniciando Nueva Orden (No hay registros previos)');
            }
        });
    }

    const clearPersBtn = document.getElementById('clearPersonnelData');
    if (clearPersBtn) {
        clearPersBtn.addEventListener('click', () => {
            if (personnel.length === 0) {
                showNotification('No hay registros de personal para eliminar.');
                return;
            }
            if (confirm('Está seguro de eliminar TODOS los registros de personal? Esta acción no se puede deshacer.')) {
                personnel = [];
                saveData();
                renderPersonnelTable();
                updatePersonnelStats();
                showNotification('Todos los registros de personal han sido eliminados.');
            }
        });
    }

    const clearBtn = document.getElementById('clearData');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('Estás seguro de que deseas borrar todos los registros de incidentes?')) {
                crimes = [];
                editingId = null;
                resetForm();
                saveData();
                refreshHeatLayer();
                updateUI();
                renderTable();
                showNotification('Todos los incidentes borrados');
            }
        });
    }

    // Eventos de Exportación
    const btnExcel = document.getElementById('exportExcel');
    if (btnExcel) btnExcel.addEventListener('click', exportToExcel);

    const btnPDF = document.getElementById('exportPDF');
    if (btnPDF) btnPDF.addEventListener('click', exportToPDF);

    // Evento de Carga KMZ
    const kmzInput = document.getElementById('kmzFile');
    if (kmzInput) kmzInput.addEventListener('change', handleKMZUpload);

    // --- Cargar escudo como base64 para PDF ---
    // Usar el logo embebido definido al inicio
    escudoBase64 = INSTITUTIONAL_LOGO_BASE64;

    // --- Partes al Instante ---
    // Carga inicial de referencias de óÓÓrdenes
    window.populateOrderReferences();

    const instantOpsForm = document.getElementById('instantOpsForm');
    if (instantOpsForm) {
        instantOpsForm.addEventListener('submit', handleInstantReportSubmit);
    } else {
        console.warn('instantOpsForm no encontrado durante la inicialización.');
    }

    const registerInstantPartBtn = document.getElementById('registerInstantPartBtn');
    if (registerInstantPartBtn && instantOpsForm) {
        // Eliminado el listener redundante de click para registerInstantPartBtn ya que el botón es type="submit"
        // y el formulario ya tiene un listener para 'submit'.
    }

    const ioPhotosInput = document.getElementById('ioPhotosInput');
    if (ioPhotosInput) {
        ioPhotosInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            const previewContainer = document.getElementById('ioPhotosPreview');
            // Removed clearing to allow appending multiple times
            // previewContainer.innerHTML = '';
            // currentInstantOpsPhotos = [];

            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target.result;
                    currentInstantOpsPhotos.push(base64);

                    const img = document.createElement('img');
                    img.src = base64;
                    img.style.height = '60px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '4px';
                    img.style.border = '1px solid var(--border)';
                    previewContainer.appendChild(img);
                };
                reader.readAsDataURL(file);
            });
        });
    }

    // Populate Anexo B puesto selector whenever the instantOpsView becomes visible
    populateAnexoBPuestosSelector();
    const ioShiftSelector = document.getElementById('ioShiftSelector');
    if (ioShiftSelector) {
        ioShiftSelector.addEventListener('change', () => {
            populateAnexoBPuestosSelector(true); // Don't reset the selector itself
        });
    }

    // --- Botón Nuevo Parte (limpia el formulario completamente) ---
    const btnNuevoParte = document.getElementById('btnNuevoParte');
    if (btnNuevoParte) {
        btnNuevoParte.addEventListener('click', () => {
            // Reset form fields
            const form = document.getElementById('instantOpsForm');
            if (form) form.reset();

            // Restaurar valores institucionales predeterminados
            document.getElementById('ioResultadosRich').innerHTML = '<ul><li>PRODUCTOS / RESULTADOS:</li></ul>';
            document.getElementById('ioDondeManual').value = 'PROVINCIA: GUAYAS.\nCANTÓN: GUAYAQUIL.\nDISTRITO: SUR.\nPARROQUIA/SECTOR: ';

            document.getElementById('ioLatInput').value = '';
            document.getElementById('ioLngInput').value = '';
            document.getElementById('ioShiftSelector').value = '';
            populateAnexoBPuestosSelector();
            document.getElementById('ioPrecedencia').value = 'U';
            document.getElementById('ioLugar').value = 'GUAYAQUIL';
            document.getElementById('ioDestinatario').value = 'COOPNA';
            document.getElementById('ioBTNarrative').value = 'BT. CíšMPLEME INFORMAR A USTED SEí‘OR ALMIRANTE, LA NOVEDAD SUSCITADA EN LA JURISDICCIÓN DEL GT-100.51 í€œSEGURIDAD MARÍTIMAí€, SEGíšN EL SIGUIENTE DETALLE:';

            // Clear photos
            currentInstantOpsPhotos = [];
            const previewEl = document.getElementById('ioPhotosPreview');
            if (previewEl) previewEl.innerHTML = '';

            // Clear Anexo B
            const puestosEl = document.getElementById('ioPuestosSelector');
            if (puestosEl) puestosEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
            updateAnexoBPreview();

            // Clear signature fields
            document.getElementById('ioFirmanteNombre').value = '';
            document.getElementById('ioFirmanteGrado').value = '';
            document.getElementById('ioFirmanteCargo').value = '';
            document.getElementById('ioAutorNombre').value = '';
            document.getElementById('ioAutorCargo').value = '';
            window.updateIoSignaturePreview();
            window.populateOrderReferences();

            // Clear editing state
            editingInstantOpId = null;
            updateInstantOpsFormDefaults();
            showNotification('Formulario limpio í€” listo para nuevo Parte Oficial');
        });
    }

    const vehicleForm = document.getElementById('vehicleForm');
    if (vehicleForm) vehicleForm.addEventListener('submit', handleVehicleSubmit);

    const choferForm = document.getElementById('choferForm');
    if (choferForm) choferForm.addEventListener('submit', handleChoferSubmit);

    const btnClearVehicles = document.getElementById('clearVehiclesData');
    if (btnClearVehicles) {
        btnClearVehicles.addEventListener('click', () => {
            if (confirm('ííConfirmas que deseas eliminar TODOS los vehículos registrados?')) {
                vehicles = [];
                saveData();
                renderVehiclesTable();
                showNotification('Inventario de vehículos vaciado.');
            }
        });
    }

    const btnExportVehicles = document.getElementById('exportVehiclesExcel');
    if (btnExportVehicles) btnExportVehicles.addEventListener('click', exportVehiclesToExcel);

    const btnExportInstant = document.getElementById('exportOpsInstantExcel');
    if (btnExportInstant) btnExportInstant.addEventListener('click', exportOpsInstantToExcel);

    const btnExportInstantPDF = document.getElementById('exportOpsInstantPDF');
    if (btnExportInstantPDF) btnExportInstantPDF.addEventListener('click', exportOpsInstantToPDF);

    const ioDateInput = document.getElementById('ioDate');
    if (ioDateInput) {
        ioDateInput.value = getCurrentOfficialDTG();
        updateOfficialReportNum();
    }

    // --- CONFIGURACIÓN DE DIBUJO ---
    if (typeof L !== 'undefined' && typeof map !== 'undefined' && map) {
        if (typeof L.Draw === 'undefined') {
            console.warn("Leaflet.Draw is not defined. Skipping drawing tools initialization.");
        } else {
            drawnItems = new L.FeatureGroup();
            map.addLayer(drawnItems);
            if (kmzControl && typeof kmzControl.addOverlay === 'function') {
                kmzControl.addOverlay(drawnItems, "Dibujos Manuales");
            }

            // Configurar Handlers de Dibujo
            const drawOptions = {
                polygon: {
                    allowIntersection: false,
                    shapeOptions: { color: '#38bdf8', weight: 3 }
                },
                polyline: {
                    shapeOptions: { color: '#f59e0b', weight: 3 },
                    metric: true, // Forzar metros
                    showLength: true
                }
            };

            polygonDrawer = new L.Draw.Polygon(map, drawOptions.polygon);
            polylineDrawer = new L.Draw.Polyline(map, drawOptions.polyline);
            editHandler = new L.EditToolbar.Edit(map, {
                featureGroup: drawnItems
            });

            // Evento cuando se termina de dibujar
            map.on(L.Draw.Event.CREATED, function (event) {
                const layer = event.layer;
                const type = event.layerType;

                const currentColor = document.getElementById('polygonColorPicker')?.value || '#38bdf8';

                layer.feature = layer.feature || { type: "Feature", properties: {} };
                layer.feature.properties.style = {
                    color: currentColor,
                    fillColor: currentColor,
                    fillOpacity: 0.3,
                    weight: 3
                };

                if (layer.setStyle) {
                    layer.setStyle(layer.feature.properties.style);
                }

                // Añadir evento de clic derecho
                layer.on('contextmenu', (e) => {
                    try {
                        if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                        window.openPropertiesModal(layer);
                    } catch (err) {
                        alert("Error right click (create): " + err.message);
                    }
                });

                if (type === 'polyline') {
                    const coords = layer.getLatLngs();
                    let distance = 0;
                    for (let i = 0; i < coords.length - 1; i++) {
                        distance += coords[i].distanceTo(coords[i + 1]);
                    }
                    layer.bindPopup(`<b>Distancia:</b> ${distance.toFixed(2)} metros`).openPopup();
                }

                drawnItems.addLayer(layer);
                saveDrawnItems();
                showNotification(`${type.toUpperCase()} creado correctamente`);
            });

            map.on(L.Draw.Event.EDITED, function (e) { saveDrawnItems(); });
            map.on(L.Draw.Event.DELETED, function (e) { saveDrawnItems(); });

            // Cargar dibujos guardados
            loadDrawnItems();
        }
    }

    // Lógica del Modal de Propiedades
    const modal = document.getElementById('propertiesModal');
    const closeBtn = document.querySelector('.close-modal');

    window.openPropertiesModal = function (layer) {
        try {
            currentPropertyLayer = layer;
            if (!modal) throw new Error("Modal element not found");
            modal.classList.add('active');

            // Cargar valores actuales
            const props = layer.options || {};
            document.getElementById('propName').value = layer.featureName || "";
            document.getElementById('propColor').value = props.color || "#38bdf8";
            document.getElementById('propOpacity').value = props.fillOpacity || 0.3;

            // Lógica de Edición de Coordenadas
            const coordEditor = document.getElementById('coordEditorContainer');
            const pointsContainer = document.getElementById('polygonPointsContainer');
            if (pointsContainer) pointsContainer.innerHTML = '';

            if (layer.getLatLngs) {
                if (coordEditor) coordEditor.style.display = 'block';
                let latlngs = layer.getLatLngs();

                // Si el polígono tiene huecos, Leaflet devuelve array de arrays. Tomamos el primero (borde exterior).
                if (latlngs.length > 0 && Array.isArray(latlngs[0])) {
                    latlngs = latlngs[0];
                }

                latlngs.forEach((latlng, index) => {
                    const row = document.createElement('div');
                    row.className = 'coord-row';
                    row.style.display = 'flex';
                    row.style.alignItems = 'center';
                    row.style.gap = '10px';
                    row.style.marginBottom = '8px';
                    row.style.padding = '8px';
                    row.style.background = '#f8fafc';
                    row.style.borderRadius = '6px';
                    row.style.border = '1px solid #e2e8f0';

                    row.innerHTML = `
                        <div class="coord-number" style="font-weight:700; color:#64748b; width:20px;">${index + 1}</div>
                        <div class="coord-input-group" style="flex:1; display:flex; gap:8px;">
                            <div style="flex:1;">
                                <label style="display:block; font-size:0.7rem; color:#94a3b8; text-transform:uppercase;">Latitud</label>
                                <input type="number" step="0.00001" class="vertex-lat" value="${(latlng.lat || 0).toFixed(6)}" style="width:100%; border:none; background:transparent; font-weight:600; padding:2px 0;">
                            </div>
                            <div style="flex:1;">
                                <label style="display:block; font-size:0.7rem; color:#94a3b8; text-transform:uppercase;">Longitud</label>
                                <input type="number" step="0.00001" class="vertex-lng" value="${(latlng.lng || 0).toFixed(6)}" style="width:100%; border:none; background:transparent; font-weight:600; padding:2px 0;">
                            </div>
                        </div>
                        <button type="button" class="btn-target-point" title="Ubicación exacta / Arrastrar" 
                                style="background:#38bdf8; color:white; border:none; width:36px; height:36px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;">
                            📍
                        </button>
                        <button type="button" class="btn-delete-point" title="Eliminar este punto" 
                                style="background:#ef4444; color:white; border:none; width:36px; height:36px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;">
                            🗑️
                        </button>
                    `;

                    const btnTarget = row.querySelector('.btn-target-point');
                    btnTarget.onclick = () => {
                        // Cerrar modal
                        modal.classList.remove('active');

                        // Centrar mapa en el punto
                        window.map.setView(latlng, 18);

                        // Habilitar edición en la capa si no está
                        if (layer.editing) {
                            layer.editing.enable();
                            showNotification("Modo edición activado: ya puede arrastrar los puntos con el mouse.", "info");
                        }

                        // Pequeño resalte visual
                        const pulse = L.circleMarker(latlng, { radius: 20, color: '#38bdf8', fillOpacity: 0.2 }).addTo(window.map);
                        setTimeout(() => window.map.removeLayer(pulse), 2000);
                    };

                    const btnDeleteV = row.querySelector('.btn-delete-point');
                    btnDeleteV.onclick = () => {
                        let currentLatLngs = layer.getLatLngs();
                        let isPolygon = (layer instanceof L.Polygon);

                        // Manejar polígonos con huecos (array de arrays)
                        let isNested = Array.isArray(currentLatLngs[0]);
                        let targetArray = isNested ? currentLatLngs[0] : currentLatLngs;

                        if (targetArray.length <= (isPolygon ? 3 : 2)) {
                            showNotification("No se puede eliminar el punto: el objeto requiere un mínimo de puntos.", "warning");
                            return;
                        }

                        if (confirm(`ííEstás seguro de eliminar el punto número ${index + 1}?`)) {
                            targetArray.splice(index, 1);
                            layer.setLatLngs(currentLatLngs);
                            if (layer.redraw) layer.redraw();

                            // Actualizar propiedades para persistencia
                            layer.feature = layer.feature || { type: "Feature", properties: {} };
                            layer.feature.properties.name = layer.featureName;

                            saveDrawnItems();
                            window.openPropertiesModal(layer); // Refrescar modal
                            showNotification("Punto eliminado con éxito.");
                        }
                    };

                    if (pointsContainer) pointsContainer.appendChild(row);
                });
            } else {
                if (coordEditor) coordEditor.style.display = 'none';
            }
        } catch (e) {
            alert("Error in openPropertiesModal: " + e.message + "\n" + e.stack);
            console.error(e);
        }
    }

    const closeAndCleanup = () => {
        if (currentPropertyLayer && currentPropertyLayer.editing) {
            currentPropertyLayer.editing.disable();
        }
        modal.classList.remove('active');
    };

    if (closeBtn) closeBtn.onclick = closeAndCleanup;
    window.onclick = (event) => { if (event.target == modal) closeAndCleanup(); };

    document.getElementById('saveProperties').onclick = () => {
        if (!currentPropertyLayer) return;

        const newName = document.getElementById('propName').value;
        const newColor = document.getElementById('propColor').value;
        const newOpacity = parseFloat(document.getElementById('propOpacity').value);

        currentPropertyLayer.featureName = newName;
        if (currentPropertyLayer.setStyle) {
            currentPropertyLayer.setStyle({
                color: newColor,
                fillColor: newColor,
                fillOpacity: newOpacity
            });
        }

        // Aplicar cambios en coordenadas si corresponde
        if (currentPropertyLayer.getLatLngs) {
            const latInputs = document.querySelectorAll('.vertex-lat');
            const lngInputs = document.querySelectorAll('.vertex-lng');
            const newCoords = [];

            latInputs.forEach((latInp, i) => {
                const lat = parseFloat(latInp.value);
                const lng = parseFloat(lngInputs[i].value);
                if (!isNaN(lat) && !isNaN(lng)) {
                    newCoords.push([lat, lng]);
                }
            });

            if (newCoords.length > 0) {
                currentPropertyLayer.setLatLngs(newCoords);
                if (currentPropertyLayer.redraw) currentPropertyLayer.redraw();
            }
        }

        if (newName) {
            currentPropertyLayer.bindPopup(`<b>Sector:</b> ${newName}`);
        }

        // Update feature properties so toGeoJSON exports them
        currentPropertyLayer.feature = currentPropertyLayer.feature || { type: "Feature", properties: {} };
        currentPropertyLayer.feature.properties.style = {
            color: newColor,
            fillColor: newColor,
            fillOpacity: newOpacity,
            weight: 3
        };
        currentPropertyLayer.feature.properties.name = newName;

        saveDrawnItems();

        // Limpiar puntos de edición
        if (currentPropertyLayer.editing) currentPropertyLayer.editing.disable();

        modal.classList.remove('active');
        showNotification("Propiedades actualizadas");
    };

    document.getElementById('deleteObject').onclick = () => {
        if (!currentPropertyLayer) return;
        if (confirm("ííEstás seguro de eliminar este objeto?")) {
            if (currentPropertyLayer.editing) currentPropertyLayer.editing.disable();
            drawnItems.removeLayer(currentPropertyLayer);
            saveDrawnItems();
            modal.classList.remove('active');
            showNotification("Objeto eliminado");
        }
    };

    // Vincular Menú Superior
    const btnDrawPolygon = document.getElementById('drawPolygon');
    if (btnDrawPolygon) {
        btnDrawPolygon.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if (polygonDrawer) polygonDrawer.enable();
                else throw new Error("polygonDrawer is null or undefined");
            } catch (err) {
                console.error(err);
                alert("Error Polygon: " + err.message + "\n" + err.stack);
            }
        });
    }

    const btnDrawPolyline = document.getElementById('drawPolyline');
    if (btnDrawPolyline) {
        btnDrawPolyline.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if (polylineDrawer) polylineDrawer.enable();
                else throw new Error("polylineDrawer is null or undefined");
            } catch (err) {
                console.error(err);
                alert("Error Polyline: " + err.message + "\n" + err.stack);
            }
        });
    }

    const btnEditDrawing = document.getElementById('editDrawing');
    if (btnEditDrawing) {
        btnEditDrawing.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if (!editHandler) throw new Error("editHandler is null");
                if (editHandler.enabled()) {
                    editHandler.disable();
                    showNotification("Modo edición desactivado");
                    const overlay = document.getElementById('debug-overlay');
                    if (overlay) overlay.remove();
                } else {
                    editHandler.enable();
                    showNotification("Haz clic y arrastra los puntos para modificar");
                    setTimeout(() => {
                        try {
                            let overlay = document.getElementById('debug-overlay');
                            if (!overlay) {
                                overlay = document.createElement('div');
                                overlay.id = 'debug-overlay';
                                overlay.style = "position: fixed; bottom: 20px; left: 20px; z-index: 100000; background: rgba(0,0,0,0.85); color: #00ff00; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; max-width: 400px; max-height: 400px; overflow: auto; pointer-events: none;";
                                document.body.appendChild(overlay);
                            }
                            let html = "<h3>DIAGNOSTICS</h3>";
                            html += `DrawnItems count: ${drawnItems ? drawnItems.getLayers().length : 'null'}<br>`;
                            let editingIcons = document.querySelectorAll('.leaflet-editing-icon');
                            html += `Editing icons (.leaflet-editing-icon): ${editingIcons.length}<br>`;
                            let middleIcons = document.querySelectorAll('.leaflet-middle-icon');
                            html += `Middle icons (.leaflet-middle-icon): ${middleIcons.length}<br>`;
                            editingIcons.forEach((el, idx) => {
                                let style = window.getComputedStyle(el);
                                html += `Icon ${idx}: class="${el.className.substring(0, 30)}..." display="${style.display}" opacity="${style.opacity}" w="${style.width}" h="${style.height}"<br>`;
                            });
                            overlay.innerHTML = html;
                        } catch (diagErr) {
                            console.error("Diag error: ", diagErr);
                        }
                    }, 1500);
                }
            } catch (err) {
                console.error(err);
                alert("Error Edit: " + err.message + "\n" + err.stack);
            }
        });
    }

    const colorPicker = document.getElementById('polygonColorPicker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            const newColor = e.target.value;
            // Cambiar color de todos los dibujos actuales
            drawnItems.eachLayer(layer => {
                if (layer.setStyle) {
                    layer.setStyle({ color: newColor, fillColor: newColor });
                    layer.options = layer.options || {};
                    layer.options.color = newColor;
                    layer.options.fillColor = newColor;

                    if (layer.feature && layer.feature.properties) {
                        layer.feature.properties.style = layer.feature.properties.style || {};
                        layer.feature.properties.style.color = newColor;
                        layer.feature.properties.style.fillColor = newColor;
                    }
                }
            });
            saveDrawnItems();
        });
    }

    const btnDrawMeasure = document.getElementById('drawMeasure');
    if (btnDrawMeasure) {
        btnDrawMeasure.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if (polylineDrawer) polylineDrawer.enable();
                else throw new Error("polylineDrawer is null or undefined");
                showNotification("Haz clic en el mapa para medir distancias");
            } catch (err) {
                console.error(err);
                alert("Error Measure: " + err.message + "\n" + err.stack);
            }
        });
    }

    const btnMenuImportKMZ = document.getElementById('menuImportKMZ');
    if (btnMenuImportKMZ) {
        btnMenuImportKMZ.addEventListener('click', (e) => {
            e.preventDefault();
            if (kmzInput) kmzInput.click();
        });
    }

    const btnMenuSaveData = document.getElementById('menuSaveData');
    if (btnMenuSaveData) {
        btnMenuSaveData.addEventListener('click', (e) => {
            e.preventDefault();
            saveData();
            showNotification("Datos guardados en el almacenamiento local");
        });
    }

    const btnMenuNewDay = document.getElementById('menuNewDay');
    if (btnMenuNewDay) {
        btnMenuNewDay.addEventListener('click', (e) => {
            e.preventDefault();
            activateNewDay();
        });
    }

    const btnMenuExit = document.getElementById('menuExit');
    if (btnMenuExit) {
        btnMenuExit.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm("ííDeseas cerrar la aplicación?")) window.close();
        });
    }

    // Toggle Dashboard
    const menuDashboard = document.getElementById('menuDashboard');
    if (menuDashboard) {
        menuDashboard.addEventListener('click', (e) => {
            e.preventDefault();
            toggleDashboard(true);
        });
    }

    const closeDashboard = document.getElementById('closeDashboard');
    if (closeDashboard) {
        closeDashboard.addEventListener('click', () => {
            toggleDashboard(false);
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleDashboard(false);
    });


    const btnDivide = document.getElementById('dividePersonnelBtn');
    if (btnDivide && !btnDivide.onclick) {
        btnDivide.addEventListener('click', () => {
            handleDividePersonnelClick();
        });
    }

    document.querySelectorAll('.select-group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.getAttribute('data-group');
            handleSelectGroupClick(group);
        });
    });

    const btnSelectBoth = document.getElementById('selectAllGroupsBtn');
    if (btnSelectBoth && !btnSelectBoth.onclick) {
        btnSelectBoth.addEventListener('click', () => {
            handleSelectAllGroupsClick();
        });
    }

    // Listener para el botón de generar distribución
    const btnGenDist = document.getElementById('generateDistributionBtn');
    if (btnGenDist) {
        btnGenDist.addEventListener('click', generatePersonnelDistribution);
    }

    const btnExportDistExcel = document.getElementById('exportDistExcelBtn');
    if (btnExportDistExcel) {
        btnExportDistExcel.addEventListener('click', exportDistributionToExcel);
    }

    const btnExportDistPDF = document.getElementById('exportDistPDFBtn');
    if (btnExportDistPDF) {
        btnExportDistPDF.addEventListener('click', exportDistributionToPDF);
    }

    // Establecer fecha por defecto (ahora)
    const dateInput = document.getElementById('date');
    const now = new Date();
    if (dateInput) dateInput.value = now.toISOString().slice(0, 16);

    // Eventos para el nuevo modal de edición de distribución
    const closeEditDist = document.getElementById('closeEditDist');
    if (closeEditDist) {
        closeEditDist.onclick = () => document.getElementById('editDistModal').classList.remove('active');
    }

    const editDistForm = document.getElementById('editDistForm');
    if (editDistForm) {
        editDistForm.addEventListener('submit', handleManualAssignmentSave);
    }

    // --- Eventos de Planificación de Operaciones ---
    const btnAddOps = document.getElementById('addOpsEventBtn');
    if (btnAddOps) btnAddOps.addEventListener('click', () => openOpsModal());

    const btnExportOps = document.getElementById('exportOpsExcelBtn');
    if (btnExportOps) btnExportOps.addEventListener('click', exportOpsToExcel);

    const btnExportOpsPDF = document.getElementById('exportOpsPDFBtn');
    if (btnExportOpsPDF) btnExportOpsPDF.addEventListener('click', exportOpsToPDF);

    const closeOpsModalBtn = document.getElementById('closeOpsModal');
    if (closeOpsModalBtn) closeOpsModalBtn.addEventListener('click', closeOpsModal);

    const cancelOpsBtn = document.getElementById('cancelOpsBtn');
    if (cancelOpsBtn) cancelOpsBtn.addEventListener('click', closeOpsModal);

    const opsEventForm = document.getElementById('opsEventForm');
    if (opsEventForm) opsEventForm.addEventListener('submit', saveOpsEvent);

    // Listeners para auto-completar personal según Distrito y Turno
    const selectOpsDist = document.getElementById('opsDistrito');
    const selectOpsShift = document.getElementById('opsFechaHora');

    if (selectOpsDist) selectOpsDist.addEventListener('change', updateOpsPersonnelAutoFill);
    if (selectOpsShift) selectOpsShift.addEventListener('change', updateOpsPersonnelAutoFill);

    // Cerrar si se hace clic fuera del contenido del modal
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('addOpsEventModal');
        if (e.target === modal) closeOpsModal();
    });

    // --- ÓÓÓrdenes de Patrulla (ORDPAT) ---
    const ordpatForm = document.getElementById('patrolOrderForm');
    if (ordpatForm) {
        ordpatForm.addEventListener('submit', handleORDPATSubmit);

        // Sincronizar encabezado institucional con inputs
        const opFH = document.getElementById('opFH');
        const opMSJ = document.getElementById('opMSJ');
        const dispFH = document.getElementById('displayFH');
        const dispRef = document.getElementById('displayRef');

        if (opFH && dispFH) {
            opFH.addEventListener('input', (e) => {
                dispFH.querySelector('span').textContent = e.target.value || '---';
            });
        }
        if (opMSJ && dispRef) {
            opMSJ.addEventListener('input', (e) => {
                dispRef.querySelector('span').textContent = e.target.value || '---';
            });
        }

        const opNro = document.getElementById('opNroOrden');
        const opID = document.getElementById('opID');
        const dispNro = document.getElementById('displayNro');
        const dispIdCent = document.getElementById('displayIdCentered');

        if (opNro && dispNro) {
            opNro.addEventListener('input', (e) => {
                dispNro.textContent = e.target.value || '---';
            });
        }
        if (opID && dispIdCent) {
            opID.addEventListener('input', (e) => {
                dispIdCent.textContent = (e.target.value || '---').toUpperCase();
            });
        }
    }

    const addOpTareaBtn = document.getElementById('addOpTareaProgRow');
    if (addOpTareaBtn) {
        addOpTareaBtn.addEventListener('click', () => {
            const tbody = document.getElementById('opTareasProgBody');
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="row-sigla" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="row-tarea" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="row-distrito" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row">í—</button></td>
            `;
            tbody.appendChild(newRow);
        });
    }

    const addOpOrgBtn = document.getElementById('addOpOrgElemRow');
    if (addOpOrgBtn) {
        addOpOrgBtn.addEventListener('click', () => {
            const tbody = document.getElementById('opOrgElementsBody');
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="org-sigla" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="org-nomi" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="org-pers" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row">í—</button></td>
            `;
            tbody.appendChild(newRow);
        });
    }

    // helper for ORDPAT References
    function updateRowLabelsByTbody(tbodyId) {
        document.querySelectorAll(`#${tbodyId} tr`).forEach((row, index) => {
            const labelCell = row.cells[0];
            if (labelCell) {
                labelCell.textContent = String.fromCharCode(97 + index) + ')';
            }
        });
    }

    function updateOpRefLabels() { updateRowLabelsByTbody('opRefsBody'); }
    function updateFoRefLabels() { updateRowLabelsByTbody('foRefsBody'); }

    function updateFoTareasListLabels() {
        const tbody = document.getElementById('foTareasListBody');
        if (!tbody) return;
        Array.from(tbody.rows).forEach((row, index) => {
            const labelCell = row.cells[0];
            if (labelCell) labelCell.textContent = `${index + 1})`;
        });
    }

    const addOpRefBtn = document.getElementById('addOpRefRow');
    if (addOpRefBtn) {
        addOpRefBtn.addEventListener('click', () => {
            const tbody = document.getElementById('opRefsBody');
            const rowCount = tbody.rows.length;
            const letter = String.fromCharCode(97 + rowCount);
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 5px; width: 30px; text-align: center; color: var(--text-muted); font-family: monospace;">${letter})</td>
                <td style="border: 1px solid var(--border); padding: 0;">
                    <input type="text" class="row-ref-text" style="width: 100%; background: transparent; border: none; color: var(--primary); padding: 8px;">
                </td>
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center; width: 50px;">
                    <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">í—</button>
                </td>
            `;
            tbody.appendChild(newRow);
            updateOpRefLabels();
        });
    }

    const addFoRefBtn = document.getElementById('addFoRefRow');
    if (addFoRefBtn) {
        addFoRefBtn.addEventListener('click', () => {
            const tbody = document.getElementById('foRefsBody');
            const rowCount = tbody.rows.length;
            const letter = String.fromCharCode(97 + rowCount);
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 5px; width: 40px; text-align: center; color: var(--text-muted); font-family: monospace;">${letter})</td>
                <td style="border: 1px solid var(--border); padding: 0;">
                    <input type="text" class="row-ref-text" style="width: 100%; background: transparent; border: none; color: var(--primary); padding: 8px;">
                </td>
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center; width: 50px;">
                    <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">í—</button>
                </td>
            `;
            tbody.appendChild(newRow);
            updateFoRefLabels();
        });
    }

    const addFoTareaListBtn = document.getElementById('addFoTareaListRow');
    if (addFoTareaListBtn) {
        addFoTareaListBtn.addEventListener('click', () => {
            const tbody = document.getElementById('foTareasListBody');
            const rowCount = tbody.rows.length;
            const num = rowCount + 1;
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center; color: var(--text-muted); font-family: monospace;">${num})</td>
                <td style="border: 1px solid var(--border); padding: 0;">
                    <textarea class="row-tarea-desc" rows="2" style="width: 100%; background: transparent; border: none; color: var(--primary); padding: 8px; resize: vertical;"></textarea>
                </td>
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;">
                    <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">í—</button>
                </td>
            `;
            tbody.appendChild(newRow);
            updateFoTareasListLabels();
        });
    }


    const addFoTareaBtn = document.getElementById('addFoTareaRow');
    if (addFoTareaBtn) {
        addFoTareaBtn.addEventListener('click', () => {
            const tbody = document.getElementById('foTareasBody');
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="row-unidad" style="width: 100%; background: transparent; border: none; color: var(--primary); padding: 8px;"></td>
                <td style="border: 1px solid var(--border); padding: 0;"><textarea class="row-tarea" style="width: 100%; background: transparent; border: none; color: var(--primary); padding: 8px; resize: vertical;"></textarea></td>
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">í—</button></td>
            `;
            tbody.appendChild(newRow);
        });
    }

    // Delegación para eliminar filas en formularios
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-row')) {
            const row = e.target.closest('tr');
            const tbody = row ? row.parentElement : null;
            if (row) {
                row.remove();
                if (tbody && tbody.id === 'opRefsBody') {
                    updateOpRefLabels();
                }
                if (tbody && tbody.id === 'foRefsBody') {
                    updateFoRefLabels();
                }
                if (tbody && tbody.id === 'foTareasListBody') {
                    updateFoTareasListLabels();
                }
            }
        }
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-action');
        if (!btn) return;

        const id = btn.getAttribute('data-id');
        if (!id) return;

        if (btn.classList.contains('delete')) {
            if (btn.closest('#tableBodyORDPAT')) window.deleteORDPAT(id);
        } else if (btn.classList.contains('edit')) {
            if (btn.closest('#tableBodyORDPAT')) window.generateORDPATPDF(id);
        } else if (btn.classList.contains('load')) {
        }
    });



    const newORDPATBtn = document.getElementById('newORDPATBtn');
    if (newORDPATBtn) {
        newORDPATBtn.addEventListener('click', window.handleNewORDPATClick);
    }

    window.updateORDPATDisplayId = function () {
        const prefixInput = document.getElementById('opPrefix');
        const dtgInput = document.getElementById('opDTGAuto');
        const seqInput = document.getElementById('opSequence');
        const displayId = document.getElementById('displayIdCentered');
        if (!prefixInput || !dtgInput || !seqInput || !displayId) return;

        const prefix = prefixInput.value || '';
        const dtg = dtgInput.value || 'XXXXXXR-XXX-2026';
        const serial = seqInput.value || '000';
        displayId.textContent = `${prefix}${dtg}-${serial}-S`;
    };

    // Initialize on load
    setTimeout(() => window.updateORDPATAutomaticFields(), 1000);

    const clearORDPATBtn = document.getElementById('clearORDPATBtn');
    if (clearORDPATBtn) {
        clearORDPATBtn.addEventListener('click', () => {
            document.getElementById('opTareasProgBody').innerHTML = '';
            document.getElementById('opOrgElementsBody').innerHTML = '';
            document.getElementById('opRefsBody').innerHTML = `
                <tr>
                    <td style="border: 1px solid var(--border); padding: 5px; width: 40px; text-align: center; color: var(--text-muted); font-family: monospace;">a)</td>
                    <td style="border: 1px solid var(--border); padding: 0;">
                        <input type="text" class="row-ref-text" style="width: 100%; background: transparent; border: none; color: white; padding: 8px;">
                    </td>
                    <td style="border: 1px solid var(--border); padding: 5px; text-align: center; width: 50px;">
                        <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">í—</button>
                    </td>
                </tr>
            `;
        });
    }

    // --- Eventos de Reportes Operacionales ---
    const btnGenReport = document.getElementById('generateReportBtn');
    if (btnGenReport) btnGenReport.addEventListener('click', generateOperationalReport);

    const btnExportReportExcel = document.getElementById('exportReportExcel');
    if (btnExportReportExcel) btnExportReportExcel.addEventListener('click', exportOperationalReportToExcel);

    const btnExportReportPDF = document.getElementById('exportReportPDF');
    if (btnExportReportPDF) btnExportReportPDF.addEventListener('click', exportOperationalReportToPDF);

    // --- Eventos de Visor de ÓÓÓrdenes ---
    const orderSearchInput = document.getElementById('orderSearchInput');
    if (orderSearchInput) {
        orderSearchInput.addEventListener('input', (e) => {
            renderLoadOrdersView(e.target.value);
        });
    }

    const btnDownloadCurrent = document.getElementById('downloadCurrentOrder');
    if (btnDownloadCurrent) {
        btnDownloadCurrent.addEventListener('click', () => {
            const activeItem = document.querySelector('.order-item-card.active');
            if (activeItem) {
                const id = activeItem.dataset.id;
                const metadata = externalOrdersMetadata.find(m => m.id === id);
                if (metadata) {
                    getOrderFromDB(id).then(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = metadata.name;
                        a.click();
                        URL.revokeObjectURL(url);
                    });
                }
            }
        });
    }

    const btnDeleteCurrent = document.getElementById('deleteCurrentOrder');
    if (btnDeleteCurrent) {
        btnDeleteCurrent.addEventListener('click', () => {
            const activeItem = document.querySelector('.order-item-card.active');
            if (activeItem && confirm('ííEstá seguro de eliminar esta orden del repositorio?')) {
                const id = activeItem.dataset.id;
                deleteExternalOrder(id);
            }
        });
    }

    const fileInput = document.getElementById('uploadExternalOrder');
    if (fileInput) {
        fileInput.addEventListener('change', handleExternalOrderUpload);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();

    if (!selectedLatLng && !editingId) {
        alert('Por favor, selecciona una ubicación exacta en el mapa.');
        return;
    }

    const type = document.getElementById('crimeType').value;
    const province = document.getElementById('crimeProvince') ? document.getElementById('crimeProvince').value : 'Guayas';
    const city = document.getElementById('crimeCity') ? document.getElementById('crimeCity').value : 'Guayaquil';
    const district = document.getElementById('district').value;
    const date = document.getElementById('date').value;
    const observation = document.getElementById('observation').value;

    if (editingId) {
        // Modo Edición
        const index = crimes.findIndex(c => c.id == editingId);
        if (index !== -1) {
            crimes[index].type = type;
            crimes[index].province = province;
            crimes[index].city = city;
            crimes[index].district = district;
            crimes[index].date = date;
            crimes[index].observation = observation;
            // Si el usuario hizo clic en el mapa, actualizamos lat/lng
            if (selectedLatLng) {
                crimes[index].lat = selectedLatLng.lat;
                crimes[index].lng = selectedLatLng.lng;
            }
            crimes[index].intensity = getIntensity(type);
            logActionToServer(`Editó incidente: ${type} en ${city}, ${province}`);
            showNotification('Registro actualizado con éxito');
        }
    } else {
        // Modo Nuevo Registro
        const newCrime = {
            id: Date.now(),
            type,
            province,
            city,
            district,
            date,
            observation,
            lat: selectedLatLng.lat,
            lng: selectedLatLng.lng,
            intensity: getIntensity(type)
        };
        crimes.push(newCrime);
        logActionToServer(`Registró nuevo incidente: ${type} en ${city}, ${province}`);
        showNotification(`Incidente de ${type} en ${city} registrado con éxito`);
    }

    saveData();
    refreshHeatLayer();
    refreshMarkers();
    updateUI();
    renderTable();
    updateDashboard();
    resetForm();
}

function resetForm() {
    const form = document.getElementById('crimeForm');
    form.reset();
    const provSelect = document.getElementById('crimeProvince');
    if (provSelect) {
        provSelect.value = "Guayas";
        if (typeof updateCrimeCities === 'function') {
            updateCrimeCities();
        }
    }
    editingId = null;
    selectedLatLng = null;
    document.getElementById('observation').value = '';
    document.getElementById('lat').textContent = 'Lat: --';
    document.getElementById('lng').textContent = 'Lng: --';
    document.getElementById('submitBtn').textContent = 'Registrar Incidente';
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.remove('editing');
    submitBtn.style.background = '';

    // Restaurar fecha actual
    const now = new Date();
    document.getElementById('date').value = now.toISOString().slice(0, 16);
}

function editCrime(id) {
    const crime = crimes.find(c => c.id == id);
    if (!crime) return;

    // 1. Asegurarse de que el menú de Inteligencia esté abierto
    const intelMenuContent = document.getElementById('inteligencia');
    if (intelMenuContent && !intelMenuContent.classList.contains('active')) {
        intelMenuContent.classList.add('active');
        const intelMenuBtn = document.querySelector('button[data-target="inteligencia"]');
        if (intelMenuBtn) intelMenuBtn.classList.add('active');
    }

    // 2. Cambiar a la vista Registrar Incidente (mapa)
    const mapBtn = document.querySelector('button[data-type="map"]');
    if (mapBtn && typeof toggleIntelView === 'function') {
        toggleIntelView('map', mapBtn);
    } else {
        const intelForm = document.getElementById('intelFormContainer');
        if (intelForm) intelForm.style.display = 'block';
        const tableOverlay = document.querySelector('.table-overlay');
        if (tableOverlay) tableOverlay.style.display = 'none';
        const mapEl = document.getElementById('map');
        if (mapEl) mapEl.style.display = 'block';
    }

    // 3. Cargar datos del incidente en el formulario
    editingId = id;
    selectedLatLng = null;
    document.getElementById('crimeType').value = crime.type;
    const provSelect = document.getElementById('crimeProvince');
    if (provSelect) {
        provSelect.value = crime.province || "Guayas";
        if (typeof updateCrimeCities === 'function') {
            updateCrimeCities();
        }
    }
    const citySelect = document.getElementById('crimeCity');
    if (citySelect) {
        citySelect.value = crime.city || "Guayaquil";
    }
    document.getElementById('district').value = crime.district || "";
    document.getElementById('date').value = crime.date;
    document.getElementById('observation').value = crime.observation || "";
    document.getElementById('lat').textContent = `Lat: ${crime.lat.toFixed(5)}`;
    document.getElementById('lng').textContent = `Lng: ${crime.lng.toFixed(5)}`;

    // 4. Cambiar apariencia del botón a modo edición
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.textContent = 'Actualizar Incidente';
        submitBtn.classList.add('editing');
        submitBtn.style.background = '#f59e0b';
    }

    // 5. Mover el mapa al punto del incidente
    setTimeout(() => {
        if (map) {
            if (typeof triggerResilientMapResize === 'function') {
                triggerResilientMapResize();
            } else {
                map.invalidateSize();
            }
            map.setView([crime.lat, crime.lng], 16);
            // Pulso visual sobre el marcador
            const pulse = L.circleMarker([crime.lat, crime.lng], {
                radius: 14,
                fillColor: CRIME_COLORS[crime.type] || '#ef4444',
                color: '#fff',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.4
            }).addTo(map);
            setTimeout(() => map.removeLayer(pulse), 2500);
        }
    }, 200);

    // 6. Scroll al formulario en el sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.scrollTop = 0;

    showNotification('Modo edición activo. Modifique los datos y presione "Actualizar Incidente".');
}

// ----------------------------------------------------
// LÓGICA DE PERSONAL
// ----------------------------------------------------

function handlePersonnelSubmit(e) {
    e.preventDefault();

    const grade = document.getElementById('pGrade').value;
    const specialty = document.getElementById('pEspecialidad').value.trim();
    const name = document.getElementById('pName').value.trim();
    const idNum = document.getElementById('pId').value.trim();
    const condition = 'OPERATIVO';
    const unit = document.getElementById('pUnit').value;
    const funcion = document.getElementById('pFunction').value.trim();
    const contact = document.getElementById('pContact').value.trim();
    const grupoDestino = document.getElementById('pGrupoDestino')?.value || 'GT ECHO';
    const rotacion = document.getElementById('pGroup')?.value || 'GRUPO 1';

    if (editingPersonnelId) {
        const index = personnel.findIndex(p => p.id === editingPersonnelId);
        if (index !== -1) {
            personnel[index] = { ...personnel[index], grade, specialty, name, idNum, unit, funcion, contact, grupoDestino, rotacion };
            showNotification('Registro de personal actualizado');
        }
    } else {
        const newPerson = {
            id: Date.now(),
            grade, specialty, name, idNum, condition, unit, funcion, contact, grupoDestino, rotacion
        };
        personnel.push(newPerson);
        showNotification(`${grade} ${name} registrado con éxito`);
    }

    saveData();
    updatePersonnelStats();

    renderPersonnelTable();
    resetPersonnelForm();
}

function applyCodesc2x2Regime(sourceId = 'codescStartDate') {
    let dateInput = document.getElementById(sourceId);

    // Si el origen no tiene valor, intentar con el otro input (sincronización)
    if (!dateInput || !dateInput.value) {
        dateInput = document.getElementById(sourceId === 'codescStartDate' ? 'codescStartDateDist' : 'codescStartDate');
    }

    if (!dateInput || !dateInput.value) {
        showNotification('⚠️ Debe seleccionar una fecha de inicio de ciclo.');
        return;
    }

    const referenceDateStr = dateInput.value;
    localStorage.setItem('codescReferenceDate', referenceDateStr);
    codescStartDate = referenceDateStr;

    // Sincronizar ambos elementos en la UI
    ['codescStartDate', 'codescStartDateDist'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = referenceDateStr;
    });

    const referenceDate = new Date(referenceDateStr + (referenceDateStr.includes('T') ? '' : 'T00:00:00'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - referenceDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        showNotification('⚠️ La fecha es futura. Se aplicará como proyección desde el Día 1 del ciclo.');
    }

    const effectiveDiffDays = diffDays < 0 ? 0 : diffDays;
    const cycleDay = effectiveDiffDays % 4;

    // Determinar el grupo en franco hoy respetando codescStartGroup
    const startGrp = codescStartGroup || localStorage.getItem('codescStartGroup') || 'GOLF';
    let currentFranco;
    if (startGrp === 'GOLF') {
        currentFranco = (cycleDay < 2) ? 'GOLF' : 'FOXTROT';
    } else {
        currentFranco = (cycleDay < 2) ? 'FOXTROT' : 'GOLF';
    }

    personnel.forEach(p => {
        if (isDesignatedOtherFunction(p.funcion)) return; // Exclude other functions
        const destino = (p.grupoDestino || '').toUpperCase();
        if (destino.includes('CODESC')) {
            const rot = (p.rotacion || '').toUpperCase();
            if (rot === currentFranco) {
                p.condition = 'FRANCO';
            } else {
                p.condition = 'OPERATIVO';
            }
        }
    });

    saveData();
    renderPersonnelTable();
    updatePersonnelStats();
    if (typeof renderDistributionTable === 'function') renderDistributionTable();

    showNotification(`íœ… Régimen 2x2 aplicado. Grupo en FRANCO hoy: ${currentFranco} (Día ${cycleDay + 1} del ciclo)`);
}

// Inicializar fecha de inicio si existe en localStorage
document.addEventListener('DOMContentLoaded', () => {
    // Inicialización CODESC
    const referenceDate = localStorage.getItem('codescReferenceDate') || '2026-05-18';
    const dateInputDist = document.getElementById('codescStartDateDist');
    if (dateInputDist) dateInputDist.value = referenceDate;

    const btnRegimeDist = document.getElementById('applyCodesc2x2BtnDist');
    if (btnRegimeDist) btnRegimeDist.addEventListener('click', () => applyCodesc2x2Regime('codescStartDateDist'));

    // Inicialización GT ECHO
    const echoRefDate = localStorage.getItem('rotationStartDate') || '2026-05-18';
    const echoRefType = localStorage.getItem('rotationType') || '21/7';

    const echoDateInput = document.getElementById('rotationStartDate');
    if (echoDateInput) echoDateInput.value = echoRefDate;

    const echoTypeInput = document.getElementById('rotationType');
    if (echoTypeInput) echoTypeInput.value = echoRefType;

    // Ejecutar motor al inicio para refrescar badges
    setTimeout(() => { if (typeof updateRotationEngine === 'function') updateRotationEngine(); }, 500);
});

// --- PUESTO DE MANDO ---
function handleCommandPostSubmit(e) {
    e.preventDefault();
    const grade = document.getElementById('cpGrade').value;
    const specialty = document.getElementById('cpEspecialidad').value.trim().toUpperCase();
    const name = document.getElementById('cpName').value.trim().toUpperCase();
    const idNum = document.getElementById('cpId').value.trim();
    const condition = 'OPERATIVO';
    const unit = document.getElementById('cpUnit').value.trim().toUpperCase();
    const contact = document.getElementById('cpContact').value.trim();
    const grupoDestino = document.getElementById('cpGrupoDestino').value;
    const duty = document.getElementById('cpDuty').value.trim().toUpperCase();
    const grupo = document.getElementById('cpGrupo').value;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const editId = submitBtn.dataset.editId || null;

    if (editId) {
        const idx = commandPostPersonnel.findIndex(p => String(p.id) === String(editId));
        if (idx !== -1) {
            commandPostPersonnel[idx] = {
                ...commandPostPersonnel[idx],
                grade, specialty, name, idNum, unit, contact, grupoDestino, duty, grupo
            };
            showNotification('Registro actualizado correctamente.');
        }
        delete submitBtn.dataset.editId;
        submitBtn.textContent = 'Registrar al Puesto de Mando';
        submitBtn.style.backgroundColor = '';
    } else {
        const exists = commandPostPersonnel.find(p => p.idNum === idNum);
        if (exists) {
            showNotification('⚠️ Ya existe un registro con esa cédula.', 'warning');
            return;
        }
        const newPerson = {
            id: Date.now(),
            grade, specialty, name, idNum, condition, unit, contact, grupoDestino, duty, grupo
        };
        commandPostPersonnel.push(newPerson);
        showNotification(`Personal del Puesto de Mando registrado: ${name}`);
    }

    saveData();
    renderCommandPostTable();
    populateCommandPostSelectors();
    populateORDPATSelectors();
    updatePersonnelStats();
    document.getElementById('commandPostForm').reset();
}

function handleCommandPostExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        let imported = 0;
        let updated = 0;
        const now = Date.now();

        json.forEach((row, index) => {
            const getVal = (possibleKeys) => {
                for (let key of possibleKeys) {
                    if (row[key] !== undefined && row[key] !== null) return row[key];
                    let altKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                    for (let rowKey in row) {
                        let normalizedRowKey = rowKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                        if (normalizedRowKey === altKey) return row[rowKey];
                    }
                }
                return null;
            };

            const idNum = String(getVal(['Cí‰DULA', 'CEDULA', 'IDENTIFICACIÓN', 'IDENTIFICACION', 'ID']) || '').trim();
            if (!idNum) return;

            const existingIdx = commandPostPersonnel.findIndex(p => String(p.idNum).trim() === idNum);

            const personData = {
                grade: String(getVal(['GRADO', 'RANGO']) || 'S/G').toUpperCase(),
                specialty: String(getVal(['ESPECIALIDAD', 'ESP']) || 'S/E').toUpperCase(),
                name: String(getVal(['NOMBRE', 'APELLIDOS Y NOMBRES', 'NOMBRES', 'PERSONAL']) || 'S/N').toUpperCase(),
                idNum: idNum,
                condition: 'OPERATIVO',
                unit: String(getVal(['REPARTO', 'UNIDAD']) || 'S/R').toUpperCase(),
                contact: String(getVal(['CONTACTO', 'TELEFONO', 'CELULAR']) || 'S/N'),
                grupoDestino: window.resolveOrgUnitId(getVal(['GT ECHO/CODESC', 'DESTINO', 'U. OPERATIVA']), row),
                duty: String(getVal(['FUNCIÓN', 'FUNCION', 'CARGO', 'PUESTO', 'ESTADO']) || 'PERSONAL PM').toUpperCase(),
                grupo: String(getVal(['GRUPO', 'ROTACIÓN', 'ROTACION', 'GUARDIA', 'TURNO']) || 'GRUPO 1').toUpperCase()
            };

            if (existingIdx !== -1) {
                commandPostPersonnel[existingIdx] = { ...commandPostPersonnel[existingIdx], ...personData };
                updated++;
            } else {
                commandPostPersonnel.push({
                    id: now + index + Math.floor(Math.random() * 1000),
                    ...personData
                });
                imported++;
            }
        });

        if (imported > 0 || updated > 0) {
            saveData();
            renderCommandPostTable();
            updatePersonnelStats();
            let msg = `íœ… Proceso completado.`;
            if (imported > 0) msg += ` ${imported} nuevos registrados en PM.`;
            if (updated > 0) msg += ` ${updated} tripulantes actualizados en PM.`;
            showNotification(msg, 'success');
        } else {
            showNotification('No se encontraron registros nuevos válidos para importar.', 'warning');
        }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

function renderCommandPostTable() {
    const body = document.getElementById('commandPostTableBody');
    if (!body) return;
    body.innerHTML = '';

    commandPostPersonnel.forEach(p => {
        const unitId = window.resolveOrgUnitId(p.grupoDestino);
        const unitObj = window.orgUnits.find(u => u.id === unitId);
        const groupDestName = unitObj ? unitObj.name : unitId;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.grade}</td>
            <td>${p.specialty || 'S/E'}</td>
            <td style="font-weight: 600;">${p.name}</td>
            <td>${p.idNum}</td>
            <td>${p.unit}</td>
            <td>${p.contact || 'S/N'}</td>
            <td>${groupDestName}</td>
            <td>${p.duty}</td>
            <td>${p.grupo || 'GRUPO 1'}</td>
            <td>
                <button class="btn-action edit" onclick="editCommandPostPerson(${p.id})" title="Editar" style="padding: 2px 6px; font-size: 0.8rem; margin-right: 4px;">✏️</button>
                <button class="btn-action delete" onclick="removeCommandPostPerson(${p.id})" title="Eliminar" style="padding: 2px 6px; font-size: 0.8rem;">🗑️</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

function editCommandPostPerson(id) {
    const p = commandPostPersonnel.find(x => x.id === id);
    if (!p) return;
    document.getElementById('cpGrade').value = p.grade;
    document.getElementById('cpEspecialidad').value = p.specialty;
    document.getElementById('cpName').value = p.name;
    document.getElementById('cpId').value = p.idNum;
    document.getElementById('cpUnit').value = p.unit;
    document.getElementById('cpContact').value = p.contact || '';
    document.getElementById('cpGrupoDestino').value = p.grupoDestino || 'GT ECHO';
    document.getElementById('cpDuty').value = p.duty;
    document.getElementById('cpGrupo').value = p.grupo || 'GRUPO 1';

    const btn = document.querySelector('#commandPostForm button[type="submit"]');
    btn.textContent = 'Actualizar Registro';
    btn.style.backgroundColor = '#f59e0b';
    btn.dataset.editId = id;

    document.getElementById('commandPostForm').scrollIntoView({ behavior: 'smooth' });
}

function removeCommandPostPerson(id) {
    if (!confirm('ííDesea eliminar a esta persona del Puesto de Mando?')) return;
    commandPostPersonnel = commandPostPersonnel.filter(p => p.id !== id);
    saveData();
    renderCommandPostTable();
    populateCommandPostSelectors();
    populateORDPATSelectors();
    updatePersonnelStats();
}

// --- MODAL DE CONFIRMACIÓN PREMIUM (reutilizable) ---
function showConfirmModal({ icon = '⚠️', title = 'Confirmar acción?', message = '', onConfirm = () => { }, onCancel = () => { } } = {}) {
    const modal = document.getElementById('confirmModal');
    if (!modal) { if (confirm(message)) onConfirm(); else onCancel(); return; }
    document.getElementById('confirmModalIcon').textContent = icon;
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMsg').textContent = message;
    modal.style.display = 'flex';
    const okBtn = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');
    const close = () => { modal.style.display = 'none'; };
    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newOk.addEventListener('click', () => { close(); onConfirm(); });
    newCancel.addEventListener('click', () => { close(); onCancel(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { close(); onCancel(); } }, { once: true });
}

// NUEVA CARGA DE PERSONAL
function handleNewPersonnelLoad() {
    console.log("íŸ‘‰ Botón 'Nueva Carga' clickeado. Registros de personal actuales:", personnel ? personnel.length : 'undefined');
    if (!personnel || personnel.length === 0) {
        console.warn("⚠️ Abortando Nueva Carga: No hay registros activos en la lista 'personnel' para archivar.");
        showNotification("No hay registros actuales para archivar.");
        return;
    }

    showConfirmModal({
        icon: '',
        title: 'Nueva Carga de Personal',
        message: 'ííDesea archivar la carga actual en el historial y limpiar el registro para una nueva carga? Los datos actuales se conservarán para reportes históricos.',
        onConfirm: () => {
            // Guardar en el histórico
            personnelHistory = [...personnelHistory, ...personnel];
            // Limpiar el registro actual
            personnel = [];
            saveData();
            renderPersonnelTable();
            updatePersonnelStats();
            showNotification("íœ… Carga archivada en el histórico y registro reiniciado.");
        }
    });
}

// DISTRIBUCIÓN AUTOMíTICA DE PERSONAL (Balanceada)
function generatePersonnelDistribution() {
    if (!personnel || personnel.length === 0) {
        showNotification("⚠️ No hay personal cargado para distribuir.");
        return;
    }

    showConfirmModal({
        icon: 'íš–í¸ ',
        title: 'Distribución Táctica de Precisión',
        message: 'Se organizará al personal en los 4 grupos de rotación (G1-G4). Cada grupo se dividirá en 5 secciones de 20 personas (A1-A5 para G1, B1-B5 para G2, etc.) y un excedente de REACCIÓN. ííProceder?',
        onConfirm: () => {
            const officialGrades = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG"];
            const groupNames = ["GRUPO 1", "GRUPO 2", "GRUPO 3", "GRUPO 4"];
            const groupLetters = { "GRUPO 1": "A", "GRUPO 2": "B", "GRUPO 3": "C", "GRUPO 4": "D" };
            const legacyMap = { 'ALFA': 'GRUPO 1', 'BRAVO': 'GRUPO 2', 'CHARLIE': 'GRUPO 3', 'DELTA': 'GRUPO 4', 'FRANCO': 'GRUPO 4' };

            // 1. NORMALIZAR TODOS LOS GRUPOS PRIMERO (incluyendo designados, solo para limpiar rotacion)
            personnel.forEach(p => {
                let rot = String(p.rotacion || '').toUpperCase().trim();
                for (let key in legacyMap) { if (rot.includes(key)) rot = legacyMap[key]; }
                if (!groupNames.includes(rot)) rot = "GRUPO 1"; // Fallback
                p.rotacion = rot;
            });

            // 2. Distribuir Funciones (A1-D5) dentro de cada Bucket
            //    EXCLUIR al personal designado a Otras Funciones (CPL, COOPNA, etc.)
            const groupBuckets = { "GRUPO 1": [], "GRUPO 2": [], "GRUPO 3": [], "GRUPO 4": [] };
            personnel.forEach(p => {
                if (isDesignatedOtherFunction(p.funcion)) return; // ← EXCLUIDO de la distribución
                groupBuckets[p.rotacion].push(p);
            });

            const excludedCount = personnel.filter(p => isDesignatedOtherFunction(p.funcion)).length;
            if (excludedCount > 0) {
                console.log(`[Distribución] ${excludedCount} efectivo(s) excluido(s) por tener designación especial (CPL, COOPNA u otras).`);
            }

            groupNames.forEach(gn => {
                const list = groupBuckets[gn];
                const letter = groupLetters[gn];

                // Priorizar oficiales al inicio para que sean jefes de sección
                list.sort((a, b) => {
                    const aOff = officialGrades.includes(a.grade);
                    const bOff = officialGrades.includes(b.grade);
                    if (aOff && !bOff) return -1;
                    if (!aOff && bOff) return 1;
                    return 0;
                });

                list.forEach((p, idx) => {
                    p.rotacion = gn;

                    // Lógica de 20 personas por sección
                    if (idx < 100) {
                        const secNum = Math.floor(idx / 20) + 1;
                        p.funcion = `${letter}${secNum}`;
                    } else {
                        p.funcion = "REACCIÓN";
                    }

                    if (!p.grupoDestino || p.grupoDestino === 'S/N') {
                        p.grupoDestino = 'GT ECHO';
                    }
                });

                console.log(`${gn}: ${list.length} personas procesadas.`);
            });

            saveData();
            updatePersonnelStats();
            renderPersonnelTable();
            renderDistributionTable();

            showNotification(`íœ… Distribución completada. Se respetó la organización previa de grupos y se balancearon las 5 funciones de 20 pers.`);
            alert("íŸ“Š DISTRIBUCIÓN TíCTICA APLICADA: 100 personas balanceadas por grupo + Reacción.");
            logActionToServer("Ejecutó Distribución Automática de Personal (Respetando Grupos)");
        }
    });
}

// EXPORTAR LISTADO DE PERSONAL A EXCEL (Distribuido)
function exportPersonnelToExcel() {
    if (!personnel || personnel.length === 0) {
        showNotification("⚠️ No hay personal para exportar.");
        return;
    }

    try {
        const data = personnel.map(p => ({
            "GRADO": p.grade,
            "ESPECIALIDAD": p.specialty || '',
            "NOMBRE": p.name,
            "Cí‰DULA": p.idNum,
            "REPARTO": p.unit || '',
            "CONTACTO": p.contact || '',
            "DESTINO": p.grupoDestino || 'GT ECHO',
            "FUNCIÓN": p.funcion || '',
            "GRUPO": p.rotacion || 'N/A'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Personal_Distribuido");
        XLSX.writeFile(wb, `Listado_Personal_Distribuido_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showNotification("Exportando listado a Excel...");
        logActionToServer("Exportó listado de personal a Excel");
    } catch (e) {
        console.error("Error al exportar Excel:", e);
        showNotification("Error al exportar a Excel.");
    }
}

// EXPORTAR LISTADO DE PERSONAL A PDF (Distribuido)
function exportPersonnelToPDF() {
    exportDistributionToPDF(); // Unify both as they refer to the same tactical distribution
}





function populateCommandPostSelectors() {
    const ioSelector = document.getElementById('ioCommandPostSelector');
    const opSelector = document.getElementById('opCommandPostSelector');

    [ioSelector, opSelector].forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">-- Seleccionar --</option>';
        commandPostPersonnel.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.idNum;
            opt.textContent = `${p.grade} ${p.name} (${p.duty})`;
            sel.appendChild(opt);
        });
        sel.value = currentVal;
    });
}

function populateORDPATSelectors() {
    const shiftSelector = document.getElementById('opShiftSelector');
    const postSelector = document.getElementById('opPostSelector');
    const cpSelector = document.getElementById('opCommandPostSelector');

    // Unificar asignaciones clásicas con la nueva distribución dinámica
    let all = [...(specialAssignments || []), ...(guardAssignments || [])];

    if (lastDistributionConfig) {
        let config = lastDistributionConfig;
        if (typeof config === 'string') try { config = JSON.parse(config); } catch (e) { }
        [...(config.fixed || []), ...(config.support || [])].forEach(post => {
            post.assigned.forEach(p => {
                all.push({
                    assignedLocation: post.name,
                    assignedShift: p.assignedShift || p.turno || 'GENERAL',
                    assignedTime: p.assignedTime || post.schedule
                });
            });
        });
    }

    const shiftMap = {
        "0800-1200 / 2000-0000": "TURNO 1 (08H00 A 12H00 / 20H00 A 00H00)",
        "12H00 A 16H00 / 00H00 A 04H00": "TURNO 2 (12H00 A 16H00 / 00H00 A 04H00)",
        "16H00 A 20H00 / 04H00 A 08H00": "TURNO 3 (16H00 A 20H00 / 04H00 A 08H00)"
    };

    // 1. Poblar Puestos (Todos los activados en la distribución)
    if (postSelector) {
        const curPost = postSelector.value;
        const uniquePosts = [...new Set(all.map(a => a.assignedLocation).filter(Boolean))].sort();

        postSelector.innerHTML = '<option value="">-- Seleccionar Puesto --</option>';
        uniquePosts.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            postSelector.appendChild(opt);
        });
        postSelector.value = curPost;

        // Vincular cambio de puesto para filtrar turnos
        if (!postSelector.dataset.linked) {
            postSelector.addEventListener('change', () => {
                populateORDPATShifts(postSelector.value);
                syncORDPATPersonnel();
            });
            postSelector.dataset.linked = "true";
        }
    }

    // Función auxiliar para poblar turnos según el puesto
    function populateORDPATShifts(selectedPost) {
        if (!shiftSelector) return;
        const curShift = shiftSelector.value;
        shiftSelector.innerHTML = '<option value="">-- Seleccionar Turno --</option>';

        if (!selectedPost) return;

        const filtered = all.filter(a => a.assignedLocation === selectedPost);
        const uniqueShifts = new Set();

        filtered.forEach(a => {
            if (a.assignedTime) {
                const label = shiftMap[a.assignedTime] || a.assignedTime;
                uniqueShifts.add(label);
            } else if (a.assignedShift && a.assignedShift !== "FIJO") {
                let label = a.assignedShift;
                if (label === "TURNO 1") label = shiftMap["0800-1200 / 2000-0000"];
                if (label === "TURNO 2") label = shiftMap["1200-1600 / 0000-0400"];
                if (label === "TURNO 3") label = shiftMap["1600-2000 / 0400-0800"];
                uniqueShifts.add(label);
            }
        });

        Array.from(uniqueShifts).sort().forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = s;
            shiftSelector.appendChild(opt);
        });
        shiftSelector.value = curShift;
    }

    // Inicializar turnos si ya hay un puesto seleccionado
    if (postSelector && postSelector.value) {
        populateORDPATShifts(postSelector.value);
    }

    // 3. Poblar Puesto de Mando (Mantener lógica actual)
    if (cpSelector) {
        const curCP = cpSelector.value;
        cpSelector.innerHTML = '<option value="">-- Seleccionar --</option>';
        commandPostPersonnel.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.idNum;
            opt.textContent = `${p.grade} ${p.name} (${p.duty})`;
            cpSelector.appendChild(opt);
        });
        cpSelector.value = curCP;
    }


    // Si ya hay turno y puesto seleccionado, sincronizar el personal automáticamente
    if (shiftSelector && postSelector && shiftSelector.value && postSelector.value) {
        syncORDPATPersonnel();
    }
}

function syncORDPATPersonnel() {
    const shift = document.getElementById('opShiftSelector')?.value;
    const post = document.getElementById('opPostSelector')?.value;
    const orgBody = document.getElementById('opOrgElementsBody');

    if (!orgBody) return;
    if (!shift || !post) return;

    console.log(`Sincronizando personal para ORDPAT: ${post} | ${shift}`);
    const personnelList = getPersonnelSnapshot(post, shift);

    // Solo auto-poblar si la tabla está vacía para evitar borrar cambios manuales
    if (orgBody.children.length === 0 && personnelList.length > 0) {
        const personnelNames = personnelList.map(p => `${p.grade} ${p.name}`).join(', ');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="org-sigla" value="EC1" style="width: 100%; background: transparent; border: none; color: var(--text-primary); padding: 8px; font-weight: 600;"></td>
            <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="org-nomi" value="${post}" style="width: 100%; background: transparent; border: none; color: var(--text-primary); padding: 8px; font-weight: 600;"></td>
            <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="org-pers" value="${personnelNames}" style="width: 100%; background: transparent; border: none; color: var(--text-primary); padding: 8px;"></td>
            <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" onclick="this.closest('tr').remove()">í—</button></td>
        `;
        orgBody.appendChild(row);
        showNotification(`Personal asignado a ${post} cargado en la organización.`);
    }
}

function resetPersonnelForm() {
    const form = document.getElementById('personnelForm');
    if (form) form.reset();
    editingPersonnelId = null;
    const btn = document.getElementById('submitPersonnelBtn');
    if (btn) {
        btn.textContent = 'Registrar Personal';
        btn.classList.remove('editing');
    }
}

function editPersonnel(id) {
    const person = personnel.find(p => p.id === id);
    if (!person) return;

    editingPersonnelId = id;
    document.getElementById('pGrade').value = person.grade;
    document.getElementById('pEspecialidad').value = person.specialty || '';
    document.getElementById('pName').value = person.name;
    document.getElementById('pId').value = person.idNum;
    document.getElementById('pUnit').value = person.unit;
    document.getElementById('pFunction').value = person.funcion || 'A1';
    document.getElementById('pContact').value = person.contact || '';
    if (document.getElementById('pGrupoDestino')) {
        document.getElementById('pGrupoDestino').value = person.grupoDestino || 'GT ECHO';
    }
    if (document.getElementById('pGroup')) {
        document.getElementById('pGroup').value = person.rotacion || 'GRUPO 1';
    }

    const btn = document.getElementById('submitPersonnelBtn');
    if (btn) {
        btn.textContent = 'Actualizar Personal';
        btn.classList.add('editing');
    }

    // Scroll al formulario y abrir sección si es necesario
    document.querySelector('.sidebar').scrollTop = 0;
    const personalBtn = document.querySelector('.menu-btn[data-target="personal"]');
    if (personalBtn && !personalBtn.classList.contains('active')) {
        personalBtn.click();
    }
    showNotification('Editando ficha de personal...');
}

function deletePersonnel(id) {
    if (confirm('ííEliminar de forma permanente este miembro del personal?')) {
        const targetId = String(id);

        // Remover del control principal
        personnel = personnel.filter(p => String(p.id) !== targetId);

        // Cascading delete de los demás apartados
        baborPersonnel = baborPersonnel.filter(p => String(p.id) !== targetId);
        estriborPersonnel = estriborPersonnel.filter(p => String(p.id) !== targetId);
        guardAssignments = guardAssignments.filter(a => String(a.id) !== targetId);
        specialAssignments = specialAssignments.filter(a => String(a.id) !== targetId);

        // Guardar cambios en las divisiones que no están en saveData()
        saveAppState('baborPersonnel', JSON.stringify(baborPersonnel));
        saveAppState('estriborPersonnel', JSON.stringify(estriborPersonnel));

        if (String(editingPersonnelId) === targetId) resetPersonnelForm();

        saveData(); // Guarda personnel, guardAssignments, specialAssignments, opsEvents
        updatePersonnelStats();
        renderPersonnelTable();

        // Refrescar vistas si las funciones existen
        if (typeof renderWatchDivision === 'function') renderWatchDivision();
        if (typeof renderDistribution === 'function') renderDistribution();
        if (typeof renderDistributionTable === 'function') renderDistributionTable();

        showNotification('Registro de personal eliminado de todos los apartados');
    }
}

let personnelPostChart = null;
let personnelUnitChart = null;
let chartIntelTypeInstance = null;
let chartIntelHourInstance = null;
let chartIntelYearInstance = null;

function updatePersonnelStats() {
    const statTotal = document.getElementById('statTotalPersonal');
    const statGridTotal = document.getElementById('statTotalPersonnelGrid');
    const statBabor = document.getElementById('statTotalBabor');
    const statEstribor = document.getElementById('statTotalEstribor');
    const statOperativos = document.getElementById('statTotalOperativos');
    const statOtros = document.getElementById('statTotalOtros');

    if (!statTotal) return;

    // A. CARGAR DATOS SI ESTíN VACÍOS (Persistencia tras refrescar)
    if (personnel.length === 0) {
        baborPersonnel = [];
        estriborPersonnel = [];
        guardAssignments = [];
        specialAssignments = [];
        localStorage.removeItem('baborPersonnel');
        localStorage.removeItem('estriborPersonnel');
    } else {
        if (baborPersonnel.length === 0 && localStorage.getItem('baborPersonnel')) {
            baborPersonnel = JSON.parse(localStorage.getItem('baborPersonnel'));
        }
        if (estriborPersonnel.length === 0 && localStorage.getItem('estriborPersonnel')) {
            estriborPersonnel = JSON.parse(localStorage.getItem('estriborPersonnel'));
        }
        if (guardAssignments.length === 0 && localStorage.getItem('guardAssignments')) {
            guardAssignments = JSON.parse(localStorage.getItem('guardAssignments'));
        }
        if (specialAssignments.length === 0 && localStorage.getItem('specialAssignments')) {
            specialAssignments = JSON.parse(localStorage.getItem('specialAssignments'));
        }
    }

    // --- CíLCULO DE GRUPOS EN FRANCO (Mover al inicio para usar en contadores globales) ---
    let gtEchoFranco = "N/A";
    let codescFranco = "N/A";

    // A. GT ECHO (Régimen 21/7)
    const echoStartDate = rotationStartDate || localStorage.getItem('rotationStartDate');
    if (echoStartDate) {
        const startE = new Date(echoStartDate + (echoStartDate.includes('T') ? '' : 'T00:00:00'));
        const todayE = new Date();
        todayE.setHours(0, 0, 0, 0);
        const diffE = todayE - startE;
        const diffDaysE = diffE >= 0 ? Math.floor(diffE / (24 * 3600 * 1000)) : 0;
        const currentWeekE = (Math.floor(diffDaysE / 7) % 4) + 1;
        const groupsE = ['GRUPO 1', 'GRUPO 2', 'GRUPO 3', 'GRUPO 4'];
        const startGrpRaw = rotationStartGroup || localStorage.getItem('rotationStartGroup') || 'GRUPO 1';
        const normalizedStart = normalizeGroup(startGrpRaw);
        const startIdx = groupsE.indexOf(normalizedStart) !== -1 ? groupsE.indexOf(normalizedStart) : 0;
        gtEchoFranco = groupsE[(startIdx + (currentWeekE - 1)) % 4];
    }

    // B. CODESC (Régimen 2x2)
    const codescRefDate = codescStartDate || localStorage.getItem('codescReferenceDate');
    if (codescRefDate) {
        const diffDaysC = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(codescRefDate).setHours(0, 0, 0, 0)) / (24 * 3600 * 1000));
        const cycleDay = (diffDaysC >= 0 ? diffDaysC : 0) % 4;
        const startGrpC = codescStartGroup || localStorage.getItem('codescStartGroup') || 'GOLF';
        codescFranco = (startGrpC === 'GOLF') ? ((cycleDay < 2) ? 'GOLF' : 'FOXTROT') : ((cycleDay < 2) ? 'FOXTROT' : 'GOLF');
    }

    // C. LOGÍSTICA (Régimen 2x2 Independiente)
    let logisticsFranco = "N/A";
    const logRefDate = logisticsStartDate || localStorage.getItem('logisticsReferenceDate');
    if (logRefDate) {
        const diffDaysL = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(logRefDate).setHours(0, 0, 0, 0)) / (24 * 3600 * 1000));
        const cycleDayL = (diffDaysL >= 0 ? diffDaysL : 0) % 4;
        const startGrpL = logisticsStartGroup || localStorage.getItem('logisticsStartGroup') || 'ESTRIBOR';
        logisticsFranco = (startGrpL === 'ESTRIBOR') ? ((cycleDayL < 2) ? 'ESTRIBOR' : 'BABOR') : ((cycleDayL < 2) ? 'BABOR' : 'ESTRIBOR');
    }

    // Actualizar UI del motor logístico
    const elLogCurrentFranco = document.getElementById('logisticsCurrentFranco');
    if (elLogCurrentFranco) elLogCurrentFranco.textContent = logisticsFranco;

    // --- CÁLCULO DE TOTALES GLOBALES ---
    const isPersonInRest = (p) => {
        // Puesto de Mando (GT 100.51) no entra a régimen de trabajo (siempre operativo)
        const isPM = (typeof commandPostPersonnel !== 'undefined' && commandPostPersonnel &&
            commandPostPersonnel.some(pm => String(pm.id) === String(p.id) || String(pm.idNum) === String(p.idNum))) ||
            String(p.funcion || '').toUpperCase().trim() === 'PM' ||
            String(p.duty || '').toUpperCase().includes('PM') ||
            String(p.grupoDestino || '').toUpperCase().includes('100.51');
        if (isPM) return false;

        let rot = normalizeGroup(p.rotacion || p.guardia || p.grupo);

        // Si es BABOR o ESTRIBOR, usamos el Franco de Logística
        if (rot === 'BABOR' || rot === 'ESTRIBOR') {
            return logisticsFranco !== 'N/A' && rot === logisticsFranco;
        }

        // Todas las unidades siguen el Régimen 21/7 (GRUPO 1, 2, 3, 4)
        return gtEchoFranco !== 'N/A' && rot === gtEchoFranco;
    };

    // 1. Filtrar unidades activas
    const activeUnits = window.orgUnits.filter(u => u.status === 'ACTIVE');
    const activeUnitIds = activeUnits.map(u => u.id);

    // 2. Conteos de Logística (Choferes y PM)
    const choferesList = choferes || [];
    const pmList = commandPostPersonnel || [];

    const chRest = choferesList.filter(c => isPersonInRest(c)).length;
    const chOp = choferesList.length - chRest;

    const pmRest = pmList.filter(p => isPersonInRest(p)).length;
    const pmOp = pmList.length - pmRest;

    // 3. Conteos de otras funciones especiales (CPL, COOPNA, Otras)
    const cplCount = personnel.filter(p => {
        const f = (p.funcion || '').toUpperCase().trim();
        return f === 'CPL';
    }).length;

    const coopnaCount = personnel.filter(p => {
        const f = (p.funcion || '').toUpperCase().trim();
        return f === 'COOPNA';
    }).length;

    const standardFunctions = ['OPERATIVO', 'REACCIÓN', 'REACCION', 'PERSEO', 'FRANCO', 'PM', 'CHOFER', ''];
    const otrasCount = personnel.filter(p => {
        const f = (p.funcion || '').toUpperCase().trim();
        return f !== 'CPL' && f !== 'COOPNA' && !standardFunctions.includes(f) && typeof isDesignatedOtherFunction === 'function' && isDesignatedOtherFunction(f);
    }).length;

    // 4. Calcular personal general operativo y en descanso dinámicamente
    let activeUnitsPersonnelCount = 0;
    let activeUnitsOperativosCount = 0;
    let activeUnitsRestCount = 0;

    personnel.forEach(p => {
        if (isDesignatedOtherFunction(p.funcion)) return; // Excluir otras funciones
        const unitId = window.resolveOrgUnitId(p.grupoDestino);
        if (activeUnitIds.includes(unitId)) {
            activeUnitsPersonnelCount++;
            if (isPersonInRest(p)) {
                activeUnitsRestCount++;
            } else {
                activeUnitsOperativosCount++;
            }
        }
    });

    // Total general de todo el personal activo en el sistema
    const totalGeneral = activeUnitsPersonnelCount + choferesList.length + pmList.length + cplCount + coopnaCount + otrasCount;

    // --- ACTUALIZAR CONTADORES DE FICHAS GLOBALES ---
    if (statTotal) statTotal.textContent = totalGeneral;
    if (statGridTotal) statGridTotal.textContent = totalGeneral;

    if (statOperativos) statOperativos.textContent = activeUnitsOperativosCount;
    if (statOtros) statOtros.textContent = activeUnitsRestCount;

    // Operativos Neto conforme a Regla 7 (Efectivos en unidades activas - descansos/franquicias/PM/Chofer/otras funciones)
    const operativosNeto = activeUnitsPersonnelCount - (chRest + pmRest + cplCount + coopnaCount + otrasCount);

    const elCPL = document.getElementById('statTotalCPL');
    const elCOOPNA = document.getElementById('statTotalCOOPNA');
    const elOtrasFunc = document.getElementById('statTotalOtrasFunc');
    const elOperativosNeto = document.getElementById('statOperativosNeto');

    if (elCPL) elCPL.textContent = cplCount;
    if (elCOOPNA) elCOOPNA.textContent = coopnaCount;
    if (elOtrasFunc) elOtrasFunc.textContent = otrasCount;
    if (elOperativosNeto) elOperativosNeto.textContent = operativosNeto;

    // Cuadros Separados de Choferes y PM con desglose Op/Desc
    const elChOp = document.getElementById('statChoferesOp');
    const elChDesc = document.getElementById('statChoferesDesc');
    if (elChOp) elChOp.textContent = chOp;
    if (elChDesc) elChDesc.textContent = chRest;

    const elPMOp = document.getElementById('statPMOp');
    const elPMDesc = document.getElementById('statPMDesc');
    if (elPMOp) elPMOp.textContent = pmOp;
    if (elPMDesc) elPMDesc.textContent = pmRest;

    // --- RÉGIMEN DIFERENCIADO: Contadores de Vulnerable y Suboficiales ---
    const rdVulnList = window.rdVulnerable || JSON.parse(localStorage.getItem('gyevulnerable') || '[]');
    const rdSubList = window.rdSuboficiales || JSON.parse(localStorage.getItem('gyesuboficiales') || '[]');

    // Conteos por tipo de vulnerabilidad para estadísticas
    const vulStats = {};
    rdVulnList.forEach(v => {
        const t = v.tipoVulnerabilidad || 'OTRO';
        vulStats[t] = (vulStats[t] || 0) + 1;
    });

    // Actualizar badges en UI si existen
    const elVulTotal = document.getElementById('statVulnerableTotal');
    const elSubTotal = document.getElementById('statSuboficialesTotal');
    if (elVulTotal) elVulTotal.textContent = rdVulnList.length;
    if (elSubTotal) elSubTotal.textContent = rdSubList.length;

    // Actualizar desglose por tipo de vulnerabilidad si existe el contenedor
    const vulStatsContainer = document.getElementById('statVulnerableByType');
    if (vulStatsContainer && rdVulnList.length > 0) {
        const TIPO_LABELS = {
            'SALUD_FISICA': '🏥 Salud Física',
            'SALUD_MENTAL': '🧠 Salud Mental',
            'SOCIAL': '👨‍👩‍👧 Situación Social',
            'EMBARAZO': '🤰 Embarazo',
            'DISCAPACIDAD': '♿ Discapacidad',
            'RIESGO_LABORAL': '⚠️ Riesgo Laboral',
            'OTRO': '📋 Otro'
        };
        vulStatsContainer.innerHTML = Object.keys(vulStats).map(k => {
            const pct = Math.round((vulStats[k] / rdVulnList.length) * 100);
            return `<div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;font-weight:600;color:#475569;margin-bottom:3px;">
                    <span>${TIPO_LABELS[k] || k}</span><span style="color:#b91c1c;">${vulStats[k]} (${pct}%)</span>
                </div>
                <div style="background:#fef2f2;border-radius:4px;height:6px;overflow:hidden;">
                    <div style="background:#b91c1c;height:6px;width:${pct}%;transition:width 0.4s;border-radius:4px;"></div>
                </div>
            </div>`;
        }).join('');
    }

    // --- DYNAMICALLY RENDER TOTAL CARDS BY ACTIVE UNIT ---
    const unitTotalsContainer = document.getElementById('dynamicUnitTotalsContainer');
    if (unitTotalsContainer) {
        const unitCardsHtml = activeUnits.map(unit => {
            const unitPers = personnel.filter(p => !isDesignatedOtherFunction(p.funcion) && window.isBelongingToUnit(p, unit.id));
            let borderCol = '#3b82f6';
            if (unit.id === 'GT_ECHO' || unit.id === 'GT ECHO') borderCol = '#16a34a';
            if (unit.id === 'CODESC') borderCol = '#db2777';
            return `
                <div class="stat-card" style="border-top: 4px solid ${borderCol};">
                    <span class="stat-value">${unitPers.length}</span>
                    <span class="stat-label" style="color: ${borderCol}; font-weight: 700;">Total ${unit.name}</span>
                </div>
            `;
        }).join('');
        unitTotalsContainer.innerHTML = unitCardsHtml;
    }

    // --- DYNAMICALLY RENDER SUB-LABEL NET SUMMARY ---
    const netSummaryLabelContainer = document.getElementById('dynamicNetSummaryLabel');
    if (netSummaryLabelContainer) {
        // Encontrar la unidad principal activa (o la primera)
        const primaryUnit = activeUnits.find(u => u.id === 'GT_ECHO') || activeUnits[0];
        if (primaryUnit) {
            const unitPers = personnel.filter(p => !isDesignatedOtherFunction(p.funcion) && window.isBelongingToUnit(p, primaryUnit.id));
            const otherFuncInUnit = unitPers.filter(p => typeof isDesignatedOtherFunction === 'function' && isDesignatedOtherFunction(p.funcion)).length;
            const unitNeto = Math.max(0, unitPers.length - otherFuncInUnit);

            let labelCol = '#16a34a';
            if (primaryUnit.id === 'CODESC') labelCol = '#db2777';
            else if (primaryUnit.id !== 'GT_ECHO') labelCol = '#3b82f6';

            netSummaryLabelContainer.innerHTML = `
                <span style="font-size: 0.8rem;">📋</span>
                <p style="margin: 0; font-size: 0.78rem; color: #64748b;">
                    <strong>Total ${primaryUnit.name} (Neto):</strong> <span id="statGtEchoNeto"
                        style="font-weight: 900; color: ${labelCol};">${unitNeto}</span> — descontando CPL + COOPNA + Otras
                    Funciones del total ${primaryUnit.name}.
                </p>
            `;
        } else {
            netSummaryLabelContainer.style.display = 'none';
        }
    }

    // --- DYNAMICALLY RENDER GROUPS DESGLOSE BY ACTIVE UNIT ---
    const groupsContainer = document.getElementById('dynamicDashboardGroupsContainer');
    if (groupsContainer) {
        let groupsHtml = '';
        activeUnits.forEach(unit => {
            const isGT10051 = unit.id.includes('100.51') || unit.name.includes('100.51') || unit.id === 'PM' || unit.name.toUpperCase().includes('PUESTO DE MANDO');
            if (isGT10051) {
                const pmSet = new Set();
                pmList.forEach(p => pmSet.add(p.idNum || p.id));

                const pmEfectivos = [...pmList];
                personnel.forEach(p => {
                    const resUnitId = window.resolveOrgUnitId(p.grupoDestino);
                    if (resUnitId === unit.id && !pmSet.has(p.idNum || p.id)) {
                        pmEfectivos.push(p);
                        pmSet.add(p.idNum || p.id);
                    }
                });

                const OFFICERS_GRADES = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG"];
                const officersCount = pmEfectivos.filter(p => {
                    const gr = String(p.grade || p.rango || '').toUpperCase().trim();
                    return OFFICERS_GRADES.includes(gr);
                }).length;
                const crewCount = pmEfectivos.length - officersCount;
                const totalPM = pmEfectivos.length;

                let borderCol = '#1e40af';
                let borderSub = '#93c5fd';

                groupsHtml += `
                    <div style="background: white; padding: 1.5rem; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow); border-top: 4px solid ${borderCol};">
                        <h3 style="color: ${borderCol}; font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem; border-bottom: 2px solid ${borderSub}; padding-bottom: 0.5rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; letter-spacing: 0.5px;">
                            <span>${unit.name}</span>
                            <span style="font-size: 0.65rem; background: #eff6ff; color: #1e40af; border: 1px dashed #3b82f6; padding: 3px 10px; border-radius: 20px; font-weight: 700; letter-spacing: 0.5px;">SIN RÉGIMEN (DIARIO)</span>
                        </h3>
                        <div style="display: flex; gap: 1.5rem; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                            <div style="flex: 1; display: flex; flex-direction: column; gap: 0.5rem; min-width: 150px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 8px;">
                                    <span style="font-weight: 700; color: #475569; font-size: 0.85rem;">👨‍✈️ Oficiales:</span>
                                    <span style="font-weight: 900; color: #1e40af; font-size: 1.1rem;">${officersCount}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 16px; border-radius: 8px;">
                                    <span style="font-weight: 700; color: #475569; font-size: 0.85rem;">👮‍♂️ Tripulantes:</span>
                                    <span style="font-weight: 900; color: #1e40af; font-size: 1.1rem;">${crewCount}</span>
                                </div>
                            </div>
                            <div style="flex: 0 0 140px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 15px; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); margin: 0 auto;">
                                <span style="font-weight: 800; color: #1e3a8a; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Total Diario</span>
                                <span style="font-weight: 950; color: #1d4ed8; font-size: 2.2rem; line-height: 1;">${totalPM}</span>
                                <span style="font-size: 0.65rem; color: #1e40af; font-weight: 700; margin-top: 5px; background: #bfdbfe; padding: 2px 8px; border-radius: 10px;">Efectivos</span>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            const unitPers = personnel.filter(p => !isDesignatedOtherFunction(p.funcion) && window.isBelongingToUnit(p, unit.id));

            let unitGroups = ['GRUPO 1', 'GRUPO 2', 'GRUPO 3', 'GRUPO 4'];
            const isCodesc = unit.id.toUpperCase().includes('CODESC');



            let francoLabel = 'Sin configurar';
            let unitFranco = 'N/A';
            const isEchoRegime = unit.id === 'GT_ECHO' || unit.id === 'GT ECHO' || unit.id.toUpperCase().includes('100.61') || unit.name.toUpperCase().includes('100.61');
            if (isEchoRegime) {
                unitFranco = gtEchoFranco;
                francoLabel = gtEchoFranco !== 'N/A' ? `FRANCO: ${gtEchoFranco}` : 'FRANCO: Sin configurar';
            } else if (unit.id === 'CODESC') {
                unitFranco = codescFranco;
                francoLabel = codescFranco !== 'N/A' ? `FRANCO: ${codescFranco}` : 'FRANCO: Sin configurar';
            } else {
                unitFranco = gtEchoFranco;
                francoLabel = gtEchoFranco !== 'N/A' ? `FRANCO: ${gtEchoFranco}` : 'FRANCO: Sin configurar';
            }

            let borderCol = '#3b82f6';
            let borderSub = '#bfdbfe';
            if (isEchoRegime) {
                borderCol = '#16a34a';
                borderSub = '#bbf7d0';
            } else if (unit.id === 'CODESC') {
                borderCol = '#db2777';
                borderSub = '#fbcfe8';
            }

            const groupCardsHtml = unitGroups.map(grpName => {
                // Contar desde personal general
                const countGeneral = unitPers.filter(p => normalizeGroup(p.rotacion) === grpName).length;
                // Contar desde Choferes
                const countChoferesGrp = choferesList.filter(c => {
                    const hasGroupMatch = window.resolveOrgUnitId(c.grupo) === unit.id;
                    const hasGuardMatch = normalizeGroup(c.guardia) === grpName;

                    if (isCodesc) {
                        const rot = normalizeGroup(c.guardia);
                        if (grpName === 'FOXTROT') return hasGroupMatch && (rot === 'BABOR' || rot === 'FOXTROT');
                        if (grpName === 'GOLF') return hasGroupMatch && (rot === 'ESTRIBOR' || rot === 'GOLF');
                    }
                    return hasGroupMatch && hasGuardMatch;
                }).length;

                // Contar desde PM
                const countPMGrp = pmList.filter(pm => {
                    const hasGroupMatch = window.resolveOrgUnitId(pm.grupoDestino) === unit.id;
                    const hasGuardMatch = normalizeGroup(pm.grupo) === grpName;

                    if (isCodesc) {
                        const rot = normalizeGroup(pm.grupo);
                        if (grpName === 'FOXTROT') return hasGroupMatch && (rot === 'BABOR' || rot === 'FOXTROT');
                        if (grpName === 'GOLF') return hasGroupMatch && (rot === 'ESTRIBOR' || rot === 'GOLF');
                    }
                    return hasGroupMatch && hasGuardMatch;
                }).length;

                const grpCount = countGeneral + countChoferesGrp + countPMGrp;

                let textCol = '#3b82f6';
                if (grpName === 'GRUPO 2' || grpName === 'GOLF') textCol = '#10b981';
                if (grpName === 'GRUPO 3') textCol = '#f59e0b';
                if (grpName === 'GRUPO 4') textCol = '#8b5cf6';
                if (grpName === 'FOXTROT') textCol = '#db2777';

                const isFranco = grpName === unitFranco;
                const cardStyle = isFranco
                    ? `padding: 1rem; background: ${isCodesc ? '#fdf2f8' : '#f1f5f9'}; border: 2px dashed ${borderCol}; border-radius: 10px; box-shadow: none;`
                    : `padding: 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: none;`;

                return `
                    <div class="stat-card" style="${cardStyle}">
                        <span class="stat-value" style="font-size: 1.5rem; color: ${textCol};">${grpCount}</span>
                        <span class="stat-label" style="font-size: 0.65rem; font-weight: 700; color: ${textCol}; margin-top: 5px;">${grpName}</span>
                    </div>
                `;
            }).join('');

            groupsHtml += `
                <div style="background: white; padding: 1.5rem; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow); border-top: 4px solid ${borderCol};">
                    <h3 style="color: ${borderCol}; font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1rem; border-bottom: 2px solid ${borderSub}; padding-bottom: 0.5rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; letter-spacing: 0.5px;">
                        <span>Grupos ${unit.name}</span>
                        <span style="font-size: 0.65rem; background: #f1f5f9; color: #64748b; border: 1px dashed #94a3b8; padding: 3px 10px; border-radius: 20px; font-weight: 700; letter-spacing: 0.5px;">${francoLabel}</span>
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(${Math.min(4, unitGroups.length)}, 1fr); gap: 1rem;">
                        ${groupCardsHtml}
                    </div>
                </div>
            `;
        });
        groupsContainer.innerHTML = groupsHtml;
    }

    // --- ACTUALIZAR GRíFICO: EFECTIVOS POR PUESTO (Simplificado) ---
    let allPosts = [];
    const counts = {
        operativos: {},
        descanso: {}
    };

    const allAssignments = [...specialAssignments, ...guardAssignments];
    allAssignments.forEach(a => {
        const loc = a.assignedLocation || "Otro";
        if (loc === "Otro") return;

        const person = personnel.find(p => String(p.id) === String(a.id));
        if (!person || isDesignatedOtherFunction(person.funcion)) return;

        const inRest = isPersonInRest(person);
        if (inRest) {
            counts.descanso[loc] = (counts.descanso[loc] || 0) + 1;
        } else {
            counts.operativos[loc] = (counts.operativos[loc] || 0) + 1;
        }
    });

    allPosts = [...new Set([
        ...Object.keys(counts.operativos), ...Object.keys(counts.descanso)
    ])].sort();

    const ctxPost = document.getElementById('personnelPostChart');
    if (ctxPost) {
        if (personnelPostChart) personnelPostChart.destroy();
        personnelPostChart = new Chart(ctxPost.getContext('2d'), {
            type: 'bar',
            data: {
                labels: allPosts,
                datasets: [
                    { label: 'OPERATIVOS', data: allPosts.map(p => counts.operativos[p] || 0), backgroundColor: '#1d4ed8' },
                    { label: 'DESCANSO OPERACIONAL', data: allPosts.map(p => counts.descanso[p] || 0), backgroundColor: '#f97316' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: false, // Quitar stack global para ver grupos de estados
                        ticks: { stepSize: 1, color: '#64748b' },
                        grid: { color: 'rgba(226, 232, 240, 0.5)' }
                    },
                    x: {
                        ticks: { color: '#64748b', font: { size: 10 } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 }, color: '#64748b' } },
                    datalabels: {
                        anchor: 'center', align: 'center',
                        formatter: (val) => val > 0 ? val : '',
                        font: { weight: 'bold', size: 10 }, color: '#ffffff'
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    // 3. Reparto por Estado Operativo
    const unitStateCounts = {};
    personnel.forEach(p => {
        if (isDesignatedOtherFunction(p.funcion)) return; // Exclude other functions
        const u = p.unit || "S/R";
        if (!unitStateCounts[u]) unitStateCounts[u] = { operativos: 0, descanso: 0 };

        if (isPersonInRest(p)) {
            unitStateCounts[u].descanso++;
        } else {
            unitStateCounts[u].operativos++;
        }
    });

    const allUnitsSorted = Object.keys(unitStateCounts).sort();
    const unitDatasets = [
        { label: 'OPERATIVOS', data: allUnitsSorted.map(u => unitStateCounts[u].operativos), backgroundColor: '#1d4ed8' },
        { label: 'DESCANSO OPERACIONAL', data: allUnitsSorted.map(u => unitStateCounts[u].descanso), backgroundColor: '#f97316' }
    ];

    const ctxUnit = document.getElementById('personnelUnitChart');
    if (ctxUnit) {
        if (personnelUnitChart) personnelUnitChart.destroy();
        personnelUnitChart = new Chart(ctxUnit.getContext('2d'), {
            type: 'bar',
            data: { labels: allUnitsSorted, datasets: unitDatasets },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true } },
                plugins: {
                    datalabels: { color: '#ffffff', font: { weight: 'bold', size: 10 }, formatter: (v) => v > 0 ? v : '' }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
}


function designadoConductor(id) {
    const p = personnel.find(x => x.id === id);
    if (!p) return;

    if (typeof choferes === 'undefined' || !choferes) {
        showNotification('Módulo de chóferes no inicializado.', 'error');
        return;
    }

    const exists = choferes.find(c => c.idNum === p.idNum);
    if (exists) {
        showNotification('⚠️ Esta persona ya está registrada como conductor en Logística.', 'warning');
        return;
    }

    // Crear modal de selección de guardia
    const overlay = document.createElement('div');
    overlay.id = 'guardiaSelModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:2rem;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:2rem;margin-bottom:0.5rem;"></div>
            <h3 style="margin:0 0 0.5rem;color:#1e293b;font-size:1.1rem;">Designar Conductor</h3>
            <p style="color:#475569;font-size:0.9rem;margin:0 0 1.5rem;">
                <strong>${p.grade} ${p.name}</strong><br>
                Seleccione la guardia de servicio:
            </p>
            <div style="display:flex;gap:1rem;justify-content:center;">
                <button onclick="confirmarGuardiaChofer(${id},'BABOR')"
                    style="flex:1;padding:0.8rem;background:#1d4ed8;color:white;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;">
                    BABOR
                </button>
                <button onclick="confirmarGuardiaChofer(${id},'ESTRIBOR')"
                    style="flex:1;padding:0.8rem;background:#065f46;color:white;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;">
                    ESTRIBOR
                </button>
            </div>
            <button onclick="document.getElementById('guardiaSelModal').remove()"
                style="margin-top:1rem;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.85rem;text-decoration:underline;">
                Cancelar
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function confirmarGuardiaChofer(id, guardia) {
    // Cerrar modal
    const modal = document.getElementById('guardiaSelModal');
    if (modal) modal.remove();

    const p = personnel.find(x => x.id === id);
    if (!p) return;

    choferes.push({
        id: Date.now(),
        grade: p.grade,
        esp: 'Chofer',
        name: p.name,
        idNum: p.idNum,
        condicion: p.condition || 'OPERATIVO',
        unit: p.unit,
        contact: p.contact || 'S/N',
        grupo: p.grupoDestino || 'GT ECHO',
        guardia: guardia
    });

    if (typeof saveData === 'function') saveData();
    if (typeof renderChoferesTable === 'function') renderChoferesTable();
    showNotification(`íœ… ${p.grade} ${p.name} designado como Conductor de ${guardia}.`);
}

function renderPersonnelTable(searchTerm = '') {
    const tableBody = document.getElementById('tableBodyPersonnel');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const filtered = personnel.filter(p => {
        if (isDesignatedOtherFunction(p.funcion)) return false;
        const name = (p.name || '').toLowerCase();
        const unit = (p.unit || '').toLowerCase();
        const funcion = (p.funcion || '').toLowerCase();
        const rotacion = (p.rotacion || '').toLowerCase();
        const idNum = (p.idNum || '').toLowerCase();
        const search = searchTerm.toLowerCase();
        return name.includes(search) || unit.includes(search) || funcion.includes(search) || rotacion.includes(search) || idNum.includes(search);
    });

    filtered.forEach(p => {
        const row = document.createElement('tr');
        if (editingPersonnelId === p.id) row.style.background = 'rgba(56, 189, 248, 0.1)';

        const condicion = p.condition || 'OPERATIVO';
        const isOperativo = condicion === 'OPERATIVO';
        const rowColorStyle = !isOperativo ? 'color: #ef4444; font-weight: bold;' : '';

        if (!isOperativo) {
            row.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
        }

        // Badge para GT ECHO / CODESC (Dinámico)
        const unitId = window.resolveOrgUnitId(p.grupoDestino);
        const unitObj = window.orgUnits.find(u => u.id === unitId);
        const groupDestName = unitObj ? unitObj.name : unitId;
        let badgeStyle = 'background-color: #f1f5f9; color: #475569; border: 1px solid var(--border);';
        if (unitId === 'CODESC') {
            badgeStyle = 'background-color: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8;';
        } else if (unitId === 'GT_ECHO' || unitId === 'GT ECHO') {
            badgeStyle = 'background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;';
        } else {
            badgeStyle = 'background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;';
        }
        const badgeHtml = `<span style="padding: 4px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; display: inline-block; text-align: center; min-width: 70px; ${badgeStyle}">${groupDestName}</span>`;

        // Badge para GRUPO (Rotación)
        const rotacionText = p.rotacion || 'N/A';
        let rotColor = '#64748b';
        if (rotacionText === 'GRUPO 1' || rotacionText === 'ALFA') rotColor = '#3b82f6';
        else if (rotacionText === 'GRUPO 2' || rotacionText === 'BRAVO') rotColor = '#10b981';
        else if (rotacionText === 'GRUPO 3' || rotacionText === 'CHARLIE') rotColor = '#f59e0b';
        else if (rotacionText === 'GRUPO 4' || rotacionText === 'DELTA' || rotacionText === 'FRANCO') rotColor = '#8b5cf6';

        const rotBadgeHtml = rotacionText !== 'N/A'
            ? `<span style="padding: 4px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; display: inline-block; text-align: center; color: white; background-color: ${rotColor}; min-width: 70px;">${rotacionText}</span>`
            : `<span style="color: #94a3b8; font-size: 0.8rem; font-weight: 600;">N/A</span>`;

        row.innerHTML = `
            <td style="${rowColorStyle}">${p.grade}</td>
            <td style="${rowColorStyle}">${p.specialty || 'S/N'}</td>
            <td style="${rowColorStyle}">${p.name}</td>
            <td style="${rowColorStyle}">${p.idNum}</td>
            <td style="${rowColorStyle}">${p.unit}</td>
            <td style="${rowColorStyle}">${p.contact || 'S/N'}</td>
            <td style="text-align: center; vertical-align: middle;">${badgeHtml}</td>
            <td style="${rowColorStyle}">${p.funcion || 'OPERATIVO'}</td>
            <td style="text-align: center; vertical-align: middle;">${rotBadgeHtml}</td>
            <td class="table-actions">
                <button class="btn-action edit" onclick="editPersonnel(${p.id})" title="Editar">✏️</button>
                <button class="btn-action" onclick="designadoConductor(${p.id})" title="Designar Conductor / Enviar a Logística" style="background:#fef3c7; color:#d97706;">🚐</button>
                ${isDesignatedOtherFunction(p.funcion)
                ? `<button class="btn-action" onclick="removeOtherFunctionDesignation(${p.id})" title="En Otras Funciones: ${p.funcion} — Clic para retornar" style="background:#fee2e2; color:#b91c1c;">📋↩</button>`
                : `<button class="btn-action" onclick="designateOtherFunction(${p.id})" title="Designar a Otras Funciones" style="background:#eff6ff; color:#1d4ed8;">📋</button>`
            }
                <button class="btn-action delete" onclick="deletePersonnel(${p.id})" title="Eliminar">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function isDesignatedOtherFunction(func) {
    if (!func) return false;
    const f = func.toUpperCase().trim();
    if (f === 'CPL' || f === 'COOPNA') return true;
    if (f.includes('SIN GRUPO') || f.includes('SIN FUNCION') || f.includes('SIN FUNCIÓN') || f === 'N/A' || f === 'S/F' || f === 'PM' || f.includes('PUESTO DE MANDO')) {
        return false;
    }
    const standardRoles = [
        'A1', 'A2', 'A3', 'A4', 'A5',
        'B1', 'B2', 'B3', 'B4', 'B5',
        'C1', 'C2', 'C3', 'C4', 'C5',
        'D1', 'D2', 'D3', 'D4', 'D5',
        'REACCIÓN', 'REACCION', 'PERSEO', 'FRANCO', 'OPERATIVO',
        'CHOFER', 'CONDUCTOR'
    ];
    return !standardRoles.includes(f);
}

function renderOtherFunctionsView() {
    const tableDesignated = document.getElementById('tableBodyDesignatedOtherFunctions');
    if (!tableDesignated) return;

    tableDesignated.innerHTML = '';

    const desigSearch = ((document.getElementById('otherFunctionsDesignatedSearch') || {}).value || '').toLowerCase().trim();

    // Only show designated personnel (those with special functions)
    const designatedPersonnel = personnel.filter(p => isDesignatedOtherFunction(p.funcion));

    // Update counter badge
    const countBadge = document.getElementById('otherFunctionsCount');
    if (countBadge) countBadge.textContent = `${designatedPersonnel.length} efectivo${designatedPersonnel.length !== 1 ? 's' : ''}`;

    // Apply search filter
    const filtered = designatedPersonnel.filter(p => {
        if (!desigSearch) return true;
        const name = (p.name || '').toLowerCase();
        const idNum = (p.idNum || '').toLowerCase();
        const grade = (p.grade || '').toLowerCase();
        const func = (p.funcion || '').toLowerCase();
        const unit = (p.unit || '').toLowerCase();
        return name.includes(desigSearch) || idNum.includes(desigSearch) || grade.includes(desigSearch) || func.includes(desigSearch) || unit.includes(desigSearch);
    });

    if (filtered.length === 0) {
        const emptyMsg = designatedPersonnel.length === 0
            ? 'No hay personal designado aún. Usa el ícono 📋 en Registro de Personal para designar.'
            : 'No se encontraron resultados para la búsqueda.';
        tableDesignated.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem; color: var(--text-muted); font-style: italic;">${emptyMsg}</td></tr>`;
        return;
    }

    filtered.forEach((p, idx) => {
        const row = document.createElement('tr');
        const groupDestText = p.grupoDestino || 'GT ECHO';
        const badgeColor = groupDestText === 'CODESC'
            ? 'background:#fdf2f8; color:#db2777; border:1px solid #fbcfe8;'
            : 'background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;';
        const rotText = p.rotacion || 'N/A';

        row.innerHTML = `
            <td style="text-align:center; color:#94a3b8; font-size:0.75rem; font-weight:700;">${idx + 1}</td>
            <td style="font-weight:700;">${p.grade}</td>
            <td>${p.specialty || 'S/N'}</td>
            <td style="font-weight:600;">${p.name}</td>
            <td style="color:#64748b; font-size:0.85rem;">${p.idNum}</td>
            <td>${p.unit || 'S/N'}</td>
            <td style="text-align:center;"><span style="padding:3px 8px; border-radius:10px; font-size:0.7rem; font-weight:800; ${badgeColor}">${groupDestText}</span></td>
            <td style="color:#64748b;">${rotText}</td>
            <td style="text-align:center;"><span style="background:#fee2e2; color:#b91c1c; padding:3px 10px; border-radius:12px; font-weight:900; font-size:0.8rem; letter-spacing:0.5px;">${p.funcion}</span></td>
            <td style="text-align:center;">
                <button class="btn-action" onclick="removeOtherFunctionDesignation(${p.id})" title="Retornar al Registro de Personal" style="background:#fee2e2; color:#b91c1c; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:700;">↩️ Retornar</button>
            </td>
        `;
        tableDesignated.appendChild(row);
    });
}

function designateOtherFunction(id) {
    const p = personnel.find(x => x.id === id);
    if (!p) return;

    // Create a modal for custom function entry
    const overlay = document.createElement('div');
    overlay.id = 'otherFuncModal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:#fff; border-radius:16px; padding:2rem; max-width:400px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3); color:#1e293b;">
            <div style="font-size:2rem; margin-bottom:0.5rem; text-align:center;">📋</div>
            <h3 style="margin:0 0 0.5rem; color:#1e293b; font-size:1.1rem; text-align:center;">Designar Función Especial</h3>
            <p style="color:#475569; font-size:0.9rem; margin:0 0 1.5rem; text-align:center;">
                <strong>${p.grade} ${p.name}</strong><br>
                Seleccione o ingrese la función designada:
            </p>
            
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:1.5rem;">
                <div style="display:flex; gap:10px;">
                    <button type="button" onclick="selectPresetOtherFunc('CPL')" style="flex:1; padding:8px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:6px; font-weight:700; cursor:pointer;">CPL</button>
                    <button type="button" onclick="selectPresetOtherFunc('COOPNA')" style="flex:1; padding:8px; background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; border-radius:6px; font-weight:700; cursor:pointer;">COOPNA</button>
                </div>
                
                <div style="margin-top:5px;">
                    <label style="font-size:0.75rem; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Otra Función (Manual):</label>
                    <input type="text" id="customOtherFuncInput" placeholder="Ej: JEFE DE GUARDIA, SECRETARIO" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; outline:none; font-size:0.9rem; font-weight:600; text-transform:uppercase;">
                </div>
            </div>

            <div style="display:flex; gap:1rem; justify-content:center;">
                <button onclick="document.getElementById('otherFuncModal').remove()" style="flex:1; padding:0.8rem; background:#f1f5f9; color:#475569; border:none; border-radius:10px; font-weight:700; cursor:pointer;">
                    Cancelar
                </button>
                <button onclick="confirmOtherFuncDesignation(${id})" style="flex:1; padding:0.8rem; background:#1d4ed8; color:white; border:none; border-radius:10px; font-weight:700; cursor:pointer;">
                    Confirmar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Global utility to select preset and populate input
    window.selectPresetOtherFunc = function (preset) {
        const input = document.getElementById('customOtherFuncInput');
        if (input) input.value = preset;
    };

    // Focus the manual input
    setTimeout(() => {
        const input = document.getElementById('customOtherFuncInput');
        if (input) input.focus();
    }, 100);
}

window.confirmOtherFuncDesignation = function (id) {
    const input = document.getElementById('customOtherFuncInput');
    const value = (input ? input.value : '').trim().toUpperCase();

    if (!value) {
        alert("Por favor ingrese o seleccione una función.");
        return;
    }

    const p = personnel.find(x => x.id === id);
    if (!p) return;

    // Preserve original function if not already preserved
    if (!p.originalFuncion) {
        p.originalFuncion = p.funcion || 'OPERATIVO';
    }

    p.funcion = value;

    // Close Modal
    const modal = document.getElementById('otherFuncModal');
    if (modal) modal.remove();

    saveData();
    updatePersonnelStats();
    renderPersonnelTable();
    renderOtherFunctionsView();
    showNotification(`✅ ${p.grade} ${p.name} designado a la función de ${value}.`);
};

function removeOtherFunctionDesignation(id) {
    const p = personnel.find(x => x.id === id);
    if (!p) return;

    if (!confirm(`¿Desea retornar a ${p.grade} ${p.name} al listado general de personal?`)) return;

    const oldFunc = p.funcion;
    p.funcion = p.originalFuncion || 'OPERATIVO';
    delete p.originalFuncion;

    saveData();
    updatePersonnelStats();
    renderPersonnelTable();
    renderOtherFunctionsView();
    showNotification(`↩️ ${p.grade} ${p.name} removido de la función ${oldFunc} y retornado a ${p.funcion}.`);
}

function downloadPersonnelTemplate() {
    const ws_data = [
        ['GRADO', 'ESPECIALIDAD', 'NOMBRE', 'CÉDULA', 'REPARTO', 'CONTACTO', 'GT ECHO/CODESC', 'FUNCIÓN', 'GRUPO'],
        ['TNnv', 'SU', 'Pérez Juan', '0999999999', 'SUR', '0988888888', 'GT ECHO', 'OPERATIVO', 'GRUPO 1']
    ];

    // Set column widths
    const wscols = [
        { wch: 15 }, { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 25 }, { wch: 12 }
    ];

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Personal");

    XLSX.writeFile(wb, "Plantilla_Importar_Personal_GT100.xlsx");
}

function handlePersonnelExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Robust multi-sheet scanning to find the sheet with the most valid records and headers
            let bestSheetName = workbook.SheetNames[0];
            let maxScore = -1;
            let bestColMap = null;
            let bestHeaderRowIndex = -1;

            for (const sheetName of workbook.SheetNames) {
                const ws = workbook.Sheets[sheetName];
                const dataArray = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                if (!dataArray || dataArray.length === 0) continue;

                let foundHeadersMax = 0;
                let tempHeaderRowIndex = -1;
                let sheetBestColMap = { grade: -1, spec: -1, name: -1, id: -1, cond: -1, unit: -1, role: -1, status: -1, contact: -1, grupoDestino: -1, rotacion: -1 };

                for (let i = 0; i < Math.min(15, dataArray.length); i++) {
                    const row = dataArray[i];
                    if (!Array.isArray(row)) continue;

                    let rowColMap = { grade: -1, spec: -1, name: -1, id: -1, cond: -1, unit: -1, role: -1, status: -1, contact: -1, grupoDestino: -1, rotacion: -1 };
                    let foundHeaders = 0;

                    for (let j = 0; j < row.length; j++) {
                        const cellVal = String(row[j] || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        if (!cellVal) continue;

                        if (cellVal === 'grado' || cellVal === 'rango' || (cellVal.includes('grado') && cellVal.length < 15)) { rowColMap.grade = j; foundHeaders++; }
                        else if (cellVal.includes('especialidad') || cellVal === 'esp') { rowColMap.spec = j; foundHeaders++; }
                        else if (cellVal === 'nombres' || cellVal === 'nombre' || cellVal.includes('nombres y apellidos') || cellVal.includes('apellidos y nombres')) { rowColMap.name = j; foundHeaders++; }
                        else if (cellVal.includes('cedula') || cellVal.includes('identificacion') || cellVal === 'dni' || cellVal === 'id') { rowColMap.id = j; foundHeaders++; }
                        else if (cellVal.includes('condicion')) { rowColMap.cond = j; foundHeaders++; }
                        else if (cellVal.includes('reparto') || cellVal.includes('unidad')) { rowColMap.unit = j; foundHeaders++; }
                        else if (cellVal.includes('telefon') || cellVal.includes('contacto') || cellVal.includes('celular')) { rowColMap.contact = j; foundHeaders++; }
                        else if (cellVal === 'destino' || cellVal.includes('gt echo') || cellVal.includes('codesc')) { rowColMap.grupoDestino = j; foundHeaders++; }
                        else if (cellVal === 'funcion' || cellVal === 'cargo' || cellVal === 'rol') { rowColMap.funcion = j; foundHeaders++; }
                        else if (cellVal === 'grupo' || cellVal === 'rotacion' || cellVal === 'cuadrilla') { rowColMap.rotacion = j; foundHeaders++; }
                    }

                    if (foundHeaders > foundHeadersMax) {
                        foundHeadersMax = foundHeaders;
                        tempHeaderRowIndex = i;
                        sheetBestColMap = rowColMap;
                    }
                }

                // Contar filas con datos reales en esta hoja
                let validRows = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const row = dataArray[i];
                    if (Array.isArray(row) && row.some(v => v !== undefined && v !== null && String(v).trim() !== '')) {
                        validRows++;
                    }
                }

                // Peso estratégico: cabeceras encontradas aportan 1000 puntos cada una, filas aportan 1 punto cada una.
                const score = (foundHeadersMax * 1000) + validRows;

                if (score > maxScore) {
                    maxScore = score;
                    bestSheetName = sheetName;
                    bestHeaderRowIndex = tempHeaderRowIndex;
                    bestColMap = sheetBestColMap;
                }
            }

            console.log(`[Excel Import] Seleccionada la hoja "${bestSheetName}" con score ${maxScore}.`);

            const worksheet = workbook.Sheets[bestSheetName];
            const dataArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            if (dataArray.length === 0) {
                showNotification("El archivo Excel está vacío.");
                return;
            }

            let colMap = bestColMap || { grade: -1, spec: -1, name: -1, id: -1, cond: -1, unit: -1, role: -1, status: -1, contact: -1, grupoDestino: -1, rotacion: -1 };
            let headerRowIndex = bestHeaderRowIndex;

            // Si no encontró cabeceras claras, usar mapeo por defecto
            if (headerRowIndex === -1 || (colMap.grade === -1 && colMap.name === -1 && colMap.id === -1)) {
                colMap = { grade: 0, spec: 1, name: 2, id: 3, cond: 4, unit: 5, contact: 6, grupoDestino: 7, rotacion: 8 };
                headerRowIndex = -1; // Comienza a leer desde el inicio de la hoja
            }

            // --- INTELIGENCIA DE DETECCION ANALITICA ---
            // Si después de buscar cabeceras, algunas columnas críticas siguen en -1,
            // adivinamos la columna analizando las primeras 15 filas de datos reales.
            if (colMap.grade === -1 || colMap.name === -1 || colMap.id === -1) {
                const startRowIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;

                // Determinar el número máximo de columnas en las primeras 15 filas de datos
                let maxCols = 0;
                for (let i = startRowIdx; i < Math.min(startRowIdx + 15, dataArray.length); i++) {
                    if (Array.isArray(dataArray[i]) && dataArray[i].length > maxCols) {
                        maxCols = dataArray[i].length;
                    }
                }

                for (let j = 0; j < maxCols; j++) {
                    let isGradeCol = 0;
                    let isIdCol = 0;
                    let isNameCol = 0;
                    let nonCrapCount = 0;

                    for (let i = startRowIdx; i < Math.min(startRowIdx + 15, dataArray.length); i++) {
                        if (!Array.isArray(dataArray[i])) continue;
                        const cellVal = String(dataArray[i][j] || '').trim();
                        if (!cellVal) continue;
                        nonCrapCount++;

                        const cellValUpper = cellVal.toUpperCase();
                        // 1. Cédula/ID (números de 9 o 10 dígitos, limpiando guiones o puntos)
                        if (/^\d{9,10}$/.test(cellVal.replace(/[-.\s]/g, ""))) {
                            isIdCol++;
                        }
                        // 2. Grado (abreviaturas militares o palabras comunes de grado)
                        if (['MARO', 'CBOS', 'CBOP', 'SGOS', 'SGOP', 'SUBS', 'SUBP', 'SUBM', 'ALFG', 'TNFG', 'TNNV', 'CPCB', 'CPFG', 'CPNV', 'MARINERO', 'CABO', 'SARGENTO', 'SUBOFICIAL', 'TENIENTE', 'CAPITAN'].some(g => cellValUpper.includes(g))) {
                            isGradeCol++;
                        }
                        // 3. Nombres (texto con espacios, sin dígitos y longitud > 5)
                        if (cellVal.includes(' ') && !/\d/.test(cellVal) && cellVal.length > 5) {
                            isNameCol++;
                        }
                    }

                    if (nonCrapCount > 0) {
                        if (colMap.id === -1 && (isIdCol / nonCrapCount) > 0.5) {
                            colMap.id = j;
                            console.log(`[Auto-Detect] Detectada columna de Cédula en índice ${j}`);
                        } else if (colMap.grade === -1 && (isGradeCol / nonCrapCount) > 0.5) {
                            colMap.grade = j;
                            console.log(`[Auto-Detect] Detectada columna de Grado en índice ${j}`);
                        } else if (colMap.name === -1 && (isNameCol / nonCrapCount) > 0.5) {
                            colMap.name = j;
                            console.log(`[Auto-Detect] Detectada columna de Nombre en índice ${j}`);
                        } else if (colMap.contact === -1) {
                            let isPhoneCol = 0;
                            for (let i = startRowIdx; i < Math.min(startRowIdx + 15, dataArray.length); i++) {
                                const val = String(dataArray[i][j] || '').replace(/[-.\s]/g, "");
                                if (/^\+?\d{7,15}$/.test(val)) isPhoneCol++;
                            }
                            if ((isPhoneCol / nonCrapCount) > 0.5) {
                                colMap.contact = j;
                                console.log(`[Auto-Detect] Detectada columna de Contacto/Teléfono en índice ${j}`);
                            }
                        } else if (colMap.grupoDestino === -1) {
                            let isGroupCol = 0;
                            for (let i = startRowIdx; i < Math.min(startRowIdx + 15, dataArray.length); i++) {
                                const val = String(dataArray[i][j] || '').toUpperCase();
                                if (val.includes('ECHO') || val.includes('CODES')) isGroupCol++;
                            }
                            if ((isGroupCol / nonCrapCount) > 0.5) {
                                colMap.grupoDestino = j;
                                console.log(`[Auto-Detect] Detectada columna de GT/CODESC en índice ${j}`);
                            }
                        }
                    }
                }
            }

            // Fallback absoluto por defecto para cualquier columna que aún quede en -1 para evitar errores
            // Mapeo por defecto robusto (alineado con la especificidad del usuario)
            if (colMap.grade === -1) colMap.grade = 0;
            if (colMap.spec === -1) colMap.spec = 1;
            if (colMap.name === -1) colMap.name = 2;
            if (colMap.id === -1) colMap.id = 3;
            // Ajuste directo según reporte de usuario:
            // Excel Index 6 -> Reparto (Unit)
            // Excel Index 4 -> Contacto (Teléfono)
            // Excel Index 5 -> GT ECHO / CODESC
            if (colMap.contact === -1) colMap.contact = 4;
            if (colMap.grupoDestino === -1) colMap.grupoDestino = 5;
            if (colMap.unit === -1) colMap.unit = 6;
            if (colMap.funcion === -1) colMap.funcion = 7;
            if (colMap.rotacion === -1) colMap.rotacion = 8;

            let importedCount = 0;
            let currentDetectedGuard = null; // babor, estribor
            let currentDetectedGroup = null; // ALFA, BRAVO, CHARLIE, DELTA

            for (let i = headerRowIndex + 1; i < dataArray.length; i++) {
                const row = dataArray[i];
                if (!Array.isArray(row)) continue;

                // Evitar filas completamente vacías
                const hasData = row.some(v => v !== undefined && v !== null && String(v).trim() !== '');
                if (!hasData) continue;

                const rowTextStr = row.join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                // Detectar si la fila es un encabezado de división de guardia
                if (rowTextStr.includes("guardia de babor") || rowTextStr.includes("grupo babor") || rowTextStr.trim() === "babor") {
                    currentDetectedGuard = 'babor';
                    continue;
                } else if (rowTextStr.includes("guardia de estribor") || rowTextStr.includes("grupo estribor") || rowTextStr.trim() === "estribor") {
                    currentDetectedGuard = 'estribor';
                    continue;
                }

                // Detectar si la fila es un encabezado de grupo de rotación
                const rowTextUpper = rowTextStr.toUpperCase();
                if (rowTextUpper.includes("GRUPO ALFA") || rowTextUpper.includes("ROTACION ALFA") || rowTextUpper.trim() === "ALFA") {
                    currentDetectedGroup = 'ALFA';
                    continue;
                } else if (rowTextUpper.includes("GRUPO BRAVO") || rowTextUpper.includes("ROTACION BRAVO") || rowTextUpper.trim() === "BRAVO") {
                    currentDetectedGroup = 'BRAVO';
                    continue;
                } else if (rowTextUpper.includes("GRUPO CHARLIE") || rowTextUpper.includes("ROTACION CHARLIE") || rowTextUpper.trim() === "CHARLIE") {
                    currentDetectedGroup = 'CHARLIE';
                    continue;
                } else if (rowTextUpper.includes("GRUPO DELTA") || rowTextUpper.includes("ROTACION DELTA") || rowTextUpper.trim() === "DELTA" || rowTextUpper.includes("GRUPO FRANCO") || rowTextUpper.includes("ROTACION FRANCO") || rowTextUpper.trim() === "FRANCO") {
                    currentDetectedGroup = 'DELTA';
                    continue;
                }

                // Extraer valores o usar mapeo
                const gradeVal = colMap.grade !== -1 ? row[colMap.grade] : '';
                const specVal = colMap.spec !== -1 ? row[colMap.spec] : '';
                const nameVal = colMap.name !== -1 ? row[colMap.name] : '';
                const idVal = colMap.id !== -1 ? row[colMap.id] : '';
                const condVal = colMap.cond !== -1 ? row[colMap.cond] : '';
                let unitVal = colMap.unit !== -1 ? row[colMap.unit] : '';
                let contactVal = colMap.contact !== -1 ? row[colMap.contact] : '';
                let grupoDestinoVal = colMap.grupoDestino !== -1 ? row[colMap.grupoDestino] : '';
                let funcionVal = colMap.funcion !== -1 ? row[colMap.funcion] : '';
                const rotacionVal = colMap.rotacion !== -1 ? row[colMap.rotacion] : '';

                let funcionFinal = String(funcionVal || '').toUpperCase().trim();
                // Si no tiene función o es genérica, lo dejamos como OPERATIVO 
                // para que luego usen el botón de "Generar Distribución" balanceada.
                if (!funcionFinal || funcionFinal === 'S/N') {
                    funcionFinal = 'OPERATIVO';
                }

                // --- CORRECCIÓN DINíMICA DE DESPLAZAMIENTO ---
                const isPhone = val => /^\+?[\d\s\-()]{7,15}$/.test(String(val || '').replace(/[^0-9+]/g, ''));
                const isGroup = val => {
                    const v = String(val || '').toUpperCase();
                    return v.includes('ECHO') || v.includes('CODES');
                };

                // Si Reparto (unitVal) parece un teléfono, moverlo a contacto
                if (isPhone(unitVal) && !isPhone(contactVal)) {
                    const tmp = contactVal;
                    contactVal = unitVal;
                    unitVal = isGroup(tmp) ? '' : tmp;
                }

                // Si Contacto parece un grupo de destino, moverlo
                if (isGroup(contactVal) && !isGroup(grupoDestinoVal)) {
                    const tmp = grupoDestinoVal;
                    grupoDestinoVal = contactVal;
                    if (isPhone(funcionVal)) {
                        contactVal = funcionVal;
                        funcionVal = '';
                    } else if (isPhone(tmp)) {
                        contactVal = tmp;
                    } else {
                        contactVal = '';
                    }
                }

                const phoneRegex = /[+\d][\d\s\-()]{5,}/;
                const roleRegex = /\b(A[1-9]|B[1-9]|C[1-9]|D[1-9]|FUNCION|FUNCIÓN|ROL|TAREA|APOYO|OPERATIVO|LOGISTICA|INTELIGENCIA)\b/i;
                const currentContact = String(contactVal || '').trim();
                const currentFunction = String(funcionVal || '').trim();

                if (currentContact && roleRegex.test(currentContact)) {
                    const phoneCandidateIndex = row.findIndex((cell, idx) => {
                        if (idx === colMap.contact || idx === colMap.funcion) return false;
                        return phoneRegex.test(String(cell || '').trim());
                    });

                    if (phoneCandidateIndex !== -1) {
                        const candidatePhone = String(row[phoneCandidateIndex] || '').trim();
                        if (candidatePhone) {
                            if (!currentFunction || !phoneRegex.test(currentFunction)) {
                                funcionVal = contactVal;
                                contactVal = candidatePhone;
                            } else if (phoneRegex.test(currentFunction)) {
                                const tmp = contactVal;
                                contactVal = funcionVal;
                                funcionVal = tmp;
                            }
                        }
                    } else if (currentFunction && phoneRegex.test(currentFunction)) {
                        const tmp = contactVal;
                        contactVal = funcionVal;
                        funcionVal = tmp;
                    }
                } else if (currentFunction && phoneRegex.test(currentFunction) && (!currentContact || !phoneRegex.test(currentContact))) {
                    const tmp = contactVal;
                    contactVal = funcionVal;
                    funcionVal = tmp;
                }

                const grupoDestino = window.resolveOrgUnitId(grupoDestinoVal, row);

                const normalizeGroup = value => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
                const legacyGroupMap = {
                    'ALFA': 'GRUPO 1',
                    'BRAVO': 'GRUPO 2',
                    'CHARLIE': 'GRUPO 3',
                    'DELTA': 'GRUPO 4'
                };

                let rotacion = normalizeGroup(rotacionVal || '');
                if (rotacion === 'FRANCO') rotacion = 'GRUPO 4'; // Migración de Franco a Grupo 4
                if (!rotacion || !['GRUPO 1', 'GRUPO 2', 'GRUPO 3', 'GRUPO 4', 'N/A'].includes(rotacion)) {
                    // Si se detectó un grupo por encabezado de sección, usar ese
                    if (currentDetectedGroup) {
                        rotacion = currentDetectedGroup;
                    } else {
                        // Buscar en la fila entera si la cabecera rotación no fue explícita pero hay un grupo obvio
                        const rowStr = row.join(' ').toUpperCase();
                        if (rowStr.includes('GRUPO 1') || rowStr.includes('ALFA')) rotacion = 'GRUPO 1';
                        else if (rowStr.includes('GRUPO 2') || rowStr.includes('BRAVO')) rotacion = 'GRUPO 2';
                        else if (rowStr.includes('GRUPO 3') || rowStr.includes('CHARLIE')) rotacion = 'GRUPO 3';
                        else if (rowStr.includes('GRUPO 4') || rowStr.includes('DELTA') || rowStr.includes('FRANCO')) rotacion = 'GRUPO 4';
                        else rotacion = 'N/A';
                    }
                }
                if (legacyGroupMap[rotacion]) rotacion = legacyGroupMap[rotacion];

                let grade = String(gradeVal || 'S/N Grado');
                let specialty = String(specVal || '');
                const name = String(nameVal || 'S/N Nombre');
                const idNum = String(idVal || 'S/N Cédula');

                // Si Especialidad está vacía, intentar extraerla del Grado
                if (!specialty && grade !== 'S/N Grado') {
                    if (grade.includes('-')) {
                        const parts = grade.split('-');
                        grade = parts[0].trim();
                        specialty = parts.slice(1).join('-').trim();
                    } else {
                        const parts = grade.split(' ');
                        if (parts.length > 1 && !grade.toLowerCase().includes('cabo') && !grade.toLowerCase().includes('sargento')) {
                            grade = parts[0].trim();
                            specialty = parts.slice(1).join(' ').trim();
                        } else if (parts.length > 2) {
                            grade = parts.slice(0, 2).join(' ').trim();
                            specialty = parts.slice(2).join(' ').trim();
                        }
                    }
                }

                if (!specialty || specialty.trim() === '') {
                    specialty = 'S/N Especialidad';
                }

                // Si la fila "parece" un título o cabecera ignorado, la omitimos
                if (grade === 'S/N Grado' && name === 'S/N Nombre' && idNum === 'S/N Cédula') continue;

                // --- EVITAR DUPLICADOS AL IMPORTAR ---
                let exists = false;
                const normalizedId = idNum.trim().toUpperCase();
                const hasId = normalizedId !== '' && normalizedId !== 'S/N' && normalizedId !== 'N/A' && !normalizedId.includes('Cí‰DULA') && !normalizedId.includes('CEDULA');
                const hasName = name && name.trim() !== '' && name.trim().toUpperCase() !== 'S/N NOMBRE' && name.trim().toUpperCase() !== 'S/N';

                for (let idx = 0; idx < personnel.length; idx++) {
                    const p = personnel[idx];
                    const pId = String(p.idNum || '').trim().toUpperCase();
                    const hasPId = pId !== '' && pId !== 'S/N' && pId !== 'N/A' && !pId.includes('Cí‰DULA') && !pId.includes('CEDULA');
                    const hasPName = p.name && p.name.trim() !== '' && p.name.trim().toUpperCase() !== 'S/N NOMBRE' && p.name.trim().toUpperCase() !== 'S/N';

                    if (hasId && hasPId && normalizedId === pId) {
                        exists = true;
                        p.grade = grade;
                        p.specialty = specialty;
                        p.name = name;
                        p.condition = String(condVal || 'OPERATIVO').toUpperCase().trim();
                        p.unit = String(unitVal || 'N/A');
                        p.contact = String(contactVal || '');
                        p.grupoDestino = grupoDestino;
                        p.funcion = funcionFinal;
                        p.rotacion = rotacion;
                        break;
                    } else if (hasName && hasPName && p.name.trim().toLowerCase() === name.trim().toLowerCase()) {
                        exists = true;
                        p.grade = grade;
                        p.specialty = specialty;
                        if (hasId) p.idNum = idNum;
                        p.condition = String(condVal || 'OPERATIVO').toUpperCase().trim();
                        p.unit = String(unitVal || 'N/A');
                        p.contact = String(contactVal || '');
                        p.grupoDestino = grupoDestino;
                        p.funcion = funcionFinal;
                        p.rotacion = rotacion;
                        break;
                    }
                }

                if (exists) {
                    importedCount++;
                    continue;
                }

                const newPerson = {
                    id: Date.now() + importedCount,
                    grade: grade,
                    specialty: specialty,
                    name: name,
                    idNum: idNum,
                    condition: String(condVal || 'OPERATIVO').toUpperCase().trim(),
                    unit: String(unitVal || 'N/A'),
                    contact: String(contactVal || ''),
                    grupoDestino: grupoDestino,
                    funcion: funcionFinal,
                    rotacion: rotacion
                };

                personnel.push(newPerson);

                // Auto-asignación a guardia (Babor / Estribor)
                if (currentDetectedGuard === 'babor') {
                    baborPersonnel.push(newPerson);
                } else if (currentDetectedGuard === 'estribor') {
                    estriborPersonnel.push(newPerson);
                } else {
                    // Si no hay cabecera, alternar para mantener balance 50/50
                    if (baborPersonnel.length <= estriborPersonnel.length) {
                        baborPersonnel.push(newPerson);
                    } else {
                        estriborPersonnel.push(newPerson);
                    }
                }

                importedCount++;
            }

            if (importedCount > 0) {
                if (baborPersonnel.length > 0) saveAppState('baborPersonnel', JSON.stringify(baborPersonnel));
                if (estriborPersonnel.length > 0) saveAppState('estriborPersonnel', JSON.stringify(estriborPersonnel));

                saveData();
                updatePersonnelStats();
                renderPersonnelTable();

                if (typeof renderWatchDivision === 'function') renderWatchDivision();

                showNotification(`Se importaron ${importedCount} registros exitosamente.`);
            } else {
                showNotification("No se encontraron registros válidos en el archivo.");
            }

        } catch (error) {
            console.error("Error al importar Excel:", error);
            showNotification("Error al leer el archivo Excel. Verifica el formato.");
        }

        // Reset input so the same file can be uploaded again if needed
        document.getElementById('personnelExcelFile').value = '';
    };

    reader.readAsArrayBuffer(file);
}
function refreshHeatLayer() {
    if (typeof map === 'undefined' || !map) return;
    if (typeof L.heatLayer !== 'function') {
        console.warn("Leaflet.heat plugin no cargado.");
        return;
    }

    // Remover todas las capas de calor existentes
    Object.values(heatLayers).forEach(layer => {
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    });

    const crimesData = Array.isArray(crimes)
        ? crimes
        : (crimes && typeof crimes === 'object')
            ? Object.values(crimes)
            : [];

    // Tipos de delitos + Operaciones
    const types = Object.keys(CRIME_COLORS);

    types.forEach(type => {
        // Combinar crímenes y operaciones para el calor si es tipo operacion
        let dataToHeat = [];
        if (type === 'operacion') {
            const opsData = Array.isArray(instantOps)
                ? instantOps
                : (instantOps && typeof instantOps === 'object')
                    ? Object.values(instantOps)
                    : [];
            dataToHeat = opsData
                .filter(op => op.lat != null && op.lng != null && op.lat !== '' && op.lng !== '' && !isNaN(parseFloat(op.lat)) && !isNaN(parseFloat(op.lng)))
                .map(op => [parseFloat(op.lat), parseFloat(op.lng), 0.8]);
        } else {
            dataToHeat = crimesData
                .filter(c => {
                    if (!c) return false;
                    const cType = (c.type || '').toLowerCase().trim();
                    const targetType = type.toLowerCase().trim();
                    if (cType !== targetType) return false;

                    // Aplicar filtros de la UI para mantener el mapa de calor sincronizado
                    if (incidentFilters.type && c.type && !c.type.toLowerCase().includes(incidentFilters.type.toLowerCase())) return false;
                    if (incidentFilters.district && c.district !== incidentFilters.district) return false;

                    return c.lat != null && c.lng != null && c.lat !== '' && c.lng !== '' && !isNaN(parseFloat(c.lat)) && !isNaN(parseFloat(c.lng));
                })
                .map(c => [parseFloat(c.lat), parseFloat(c.lng), parseFloat(c.intensity || getIntensity(c.type) || 0.5)]);
        }

        if (dataToHeat.length > 0) {
            // Crear una capa de calor individual para este tipo
            heatLayers[type] = L.heatLayer(dataToHeat, {
                radius: 25,
                blur: 15,
                maxZoom: 17,
                gradient: CATEGORY_GRADIENTS[type]
            }).addTo(map);
        } else {
            heatLayers[type] = null;
        }
    });

    // Siempre traer los marcadores al frente después de re-añadir capas de calor
    setTimeout(() => {
        if (markerLayer && typeof markerLayer.bringToFront === 'function') {
            markerLayer.bringToFront();
        }
    }, 100);
}

function refreshMarkers() {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    console.log("Actualizando marcadores...");

    // Limpiar objeto de referencias
    for (let id in incidentMarkers) delete incidentMarkers[id];

    const crimesData = Array.isArray(crimes)
        ? crimes
        : (crimes && typeof crimes === 'object')
            ? Object.values(crimes)
            : [];

    const opsData = Array.isArray(instantOps)
        ? instantOps
        : (instantOps && typeof instantOps === 'object')
            ? Object.values(instantOps)
            : [];

    crimesData.forEach(crime => {
        if (!crime) return;

        // Aplicar filtros de la UI para mantener los marcadores sincronizados
        if (incidentFilters.type && crime.type && !crime.type.toLowerCase().includes(incidentFilters.type.toLowerCase())) return;
        if (incidentFilters.district && crime.district !== incidentFilters.district) return;

        if (crime.lat == null || crime.lng == null || crime.lat === '' || crime.lng === '' || isNaN(parseFloat(crime.lat)) || isNaN(parseFloat(crime.lng))) return;

        const crimeLat = parseFloat(crime.lat);
        const crimeLng = parseFloat(crime.lng);

        // Marcador con área de clic mejorada y PANE específico para estar SOBRE el mapa de calor
        const marker = L.circleMarker([crimeLat, crimeLng], {
            radius: 10, // Aumentado un poco más
            fillColor: CRIME_COLORS[(crime.type || '').toLowerCase().trim()] || '#fff',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            interactive: true,
            pane: 'markerPane', // Crucial: markerPane tiene z-index 600, overlayPane (calor) tiene 400
            bubblingMouseEvents: false
        });

        const crimeColor = CRIME_COLORS[(crime.type || '').toLowerCase().trim()] || '#38bdf8';
        const crimeEmoji = (() => {
            const t = (crime.type || '').toLowerCase();
            if (t.includes('sicariato') || t.includes('muerte')) return '💀';
            if (t.includes('robo')) return '💀';
            if (t.includes('extorsion')) return '💀';
            if (t.includes('droga')) return '💀';
            if (t.includes('secuestro')) return '💀';
            if (t.includes('narcotrafico')) return '💀';
            if (t.includes('armas')) return '💀';
            if (t.includes('atentado')) return '💀';
            if (t.includes('contrabando')) return '💀';
            if (t.includes('cámaras') || t.includes('camara')) return '💀';
            return '💀';
        })();

        const popupContent = `
            <div class="custom-popup" style="min-width: 220px; padding: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);">
                <div style="background: ${crimeColor}; color: white; padding: 10px 14px; font-weight: 800; font-size: 0.9rem; text-transform: uppercase;">
                    ${crimeEmoji} ${crime.type}
                </div>
                <div style="padding: 12px; background: #1e293b; color: #f1f5f9; border-top: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin: 0 0 6px 0; font-size: 0.85rem;"><b style="color: #94a3b8;">Distrito:</b> ${crime.district || 'S/N'}</p>
                    <p style="margin: 0 0 6px 0; font-size: 0.85rem;"><b style="color: #94a3b8;">Fecha:</b> ${new Date(crime.date).toLocaleString()}</p>
                    <p style="margin: 0 0 8px 0; font-size: 0.85rem;"><b style="color: #94a3b8;">Coord:</b> ${crimeLat.toFixed(5)}, ${crimeLng.toFixed(5)}</p>
                    <hr style="margin: 8px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin: 0 0 12px 0; font-size: 0.85rem; line-height: 1.4;"><b style="color: #94a3b8;">Observación:</b><br>${crime.observation || 'Sin observaciones'}</p>
                    <button onclick="editCrime('${crime.id}')" style="width: 100%; padding: 8px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 700; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span></span> MODIFICAR INCIDENTE
                    </button>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, {
            className: 'custom-leaflet-popup',
            autoPan: true,
            autoPanPadding: [50, 50],
            closeButton: false
        });

        markerLayer.addLayer(marker);
        incidentMarkers[crime.id] = marker;
    });

    // Añadir marcadores de operaciones
    opsData.forEach(op => {
        if (op.lat == null || op.lng == null || op.lat === '' || op.lng === '' || isNaN(parseFloat(op.lat)) || isNaN(parseFloat(op.lng))) return;
        
        const opLat = parseFloat(op.lat);
        const opLng = parseFloat(op.lng);

        const marker = L.circleMarker([opLat, opLng], {
            radius: 11,
            fillColor: CRIME_COLORS.operacion,
            color: '#fff',
            weight: 3,
            opacity: 1,
            fillOpacity: 1,
            interactive: true,
            pane: 'markerPane',
            bubblingMouseEvents: false
        });

        const popupContent = `
            <div class="custom-popup" style="min-width: 250px; border-radius: 10px; overflow: hidden;">
                <div style="background: #8b5cf6; color: white; padding: 10px 14px; font-weight: bold; font-size: 0.85rem;">
                    íŸš€ OPERACIÓN: ${op.reportNum || 'S/N'}
                </div>
                <div style="padding: 12px; background: #1e293b; color: #f1f5f9;">
                    <p style="margin: 0 0 4px 0; font-size: 0.85rem;"><b>REF:</b> ${op.ref || '---'}</p>
                    <p style="margin: 0 0 4px 0; font-size: 0.85rem;"><b>Ubicación:</b> ${op.donde || '---'}</p>
                    <p style="margin: 0 0 8px 0; font-size: 0.85rem;"><b>Fecha:</b> ${op.date || '---'}</p>
                    
                    <div style="margin: 8px 0 0 0; font-size: 0.8rem; color: #cbd5e1; max-height: 100px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                        ${op.resultadosRich ? stripHtmlForPDF(op.resultadosRich).substring(0, 150) + '...' : 'Sin detalles registrados'}
                    </div>
                    
                    <button onclick="generateOfficialDetailedPDF('${op.id}')" style="width: 100%; margin-top: 12px; padding: 8px; background: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600;">
                        Descargar PDF Oficial
                    </button>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, { className: 'custom-leaflet-popup', closeButton: false });
        markerLayer.addLayer(marker);
        incidentMarkers[op.id] = marker;
    });

    // Asegurar que los marcadores estén siempre encima (Doble garantía con z-index de pane)
    if (markerLayer && typeof markerLayer.bringToFront === 'function') {
        markerLayer.bringToFront();
    }
}

function focusOnIncident(id) {
    const marker = incidentMarkers[id];
    if (marker) {
        const latLng = marker.getLatLng();
        map.setView(latLng, 16);
        marker.openPopup();

        // Feedback visual temporal
        const circle = L.circle(latLng, {
            radius: 50,
            color: '#38bdf8',
            fillColor: '#38bdf8',
            fillOpacity: 0.3,
            weight: 2
        }).addTo(map);

        setTimeout(() => map.removeLayer(circle), 2000);
    }
}

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const crimesData = Array.isArray(crimes)
        ? crimes
        : (crimes && typeof crimes === 'object')
            ? Object.values(crimes)
            : [];

    const filteredCrimes = crimesData.filter(crime => {
        if (!crime || typeof crime !== 'object') return false;
        if (incidentFilters.type && crime.type && !crime.type.toLowerCase().includes(incidentFilters.type.toLowerCase())) return false;
        if (incidentFilters.district && crime.district !== incidentFilters.district) return false;
        return true;
    });

    if (typeof updateIntelStats === 'function') {
        updateIntelStats(filteredCrimes);
    }

    if (filteredCrimes.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="8" style="text-align:center; color: #64748b; padding: 2rem;">No hay incidentes que coincidan con los filtros seleccionados.</td>`;
        tableBody.appendChild(emptyRow);
        return;
    }

    filteredCrimes.forEach(crime => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        if (editingId === crime.id) row.style.background = 'rgba(56, 189, 248, 0.1)';

        row.onclick = (e) => {
            if (e.target.closest('.table-actions')) return;
            focusOnIncident(crime.id);
        };

        const crimeType = crime.type || 'S/N';
        const crimeDate = crime.date ? new Date(crime.date).toLocaleString() : 'S/N';
        const latLng = (typeof crime.lat === 'number' && typeof crime.lng === 'number')
            ? `${crime.lat.toFixed(4)}, ${crime.lng.toFixed(4)}`
            : 'S/N';
        const observation = crime.observation || '---';

        row.innerHTML = `
            <td style="text-transform: capitalize;">${crimeType}</td>
            <td>${crime.province || 'Guayas'}</td>
            <td>${crime.city || 'Guayaquil'}</td>
            <td>${crime.district || 'S/N'}</td>
            <td>${crimeDate}</td>
            <td>${latLng}</td>
            <td>${observation}</td>
            <td class="table-actions">
                <button class="btn-action report" onclick="generateInstantReportFromCrime(${crime.id})" title="Generar Parte">📄</button>
                <button class="btn-action edit" onclick="editCrime(${crime.id})" title="Editar">✏️</button>
                <button class="btn-action delete" onclick="deleteCrime(${crime.id})" title="Eliminar">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function deleteCrime(id) {
    if (confirm('Eliminar este registro?')) {
        const deletedCrime = crimes.find(c => c.id === id);
        if (deletedCrime) {
            logActionToServer(`Eliminó incidente: ${deletedCrime.type} en ${deletedCrime.district}`);
        }
        crimes = crimes.filter(c => c.id !== id);
        if (editingId === id) resetForm();
        saveData();
        refreshHeatLayer();
        refreshMarkers();
        updateUI();
        renderTable();
        updateDashboard();
        showNotification('Registro eliminado');
    }
}

function exportToExcel() {
    if (crimes.length === 0) {
        alert('No hay datos para exportar');
        return;
    }

    const data = crimes.map(c => ({
        Delito: c.type.toUpperCase(),
        Distrito: c.district || 'N/A',
        Fecha: new Date(c.date).toLocaleString(),
        Latitud: c.lat,
        Longitud: c.lng
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Patrullajes");
    XLSX.writeFile(workbook, "Reporte_Patrullajes_GT100.51.xlsx");
}

function exportToPDF() {
    if (crimes.length === 0) {
        alert('No hay datos para exportar');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Título del PDF
    doc.setFontSize(18);
    doc.text('GT 100.51 - SEGURIDAD MARÍTIMA', 14, 20);
    doc.setFontSize(12);
    doc.text('REPORTE DE INCIDENTES DELICTIVOS', 14, 30);
    doc.text(`Fecha de reporte: ${new Date().toLocaleString()}`, 14, 38);

    // Generar cuerpo de la tabla
    const tableData = crimes.map(c => [
        c.type.toUpperCase(),
        c.district || 'N/A',
        new Date(c.date).toLocaleString(),
        c.lat,
        c.lng
    ]);

    doc.autoTable({
        head: [['Delito', 'Distrito', 'Fecha', 'Latitud', 'Longitud']],
        body: tableData,
        startY: 40,
        theme: 'striped',
        headStyles: { fillColor: [14, 165, 233] }
    });

    doc.save('Reporte_Incidentes_GT100.51.pdf');
}

function setDistributionInterfaceMessage(message) {
    const messageContainer = document.getElementById('distributionMessage');
    const messageText = document.getElementById('distributionMessageText');
    if (!messageContainer || !messageText) return;
    if (!message) {
        messageContainer.style.display = 'none';
        messageText.textContent = '';
        return;
    }
    messageText.textContent = message;
    messageContainer.style.display = 'block';
}

function exportDistributionToExcel() {
    const allAssignments = [...specialAssignments, ...guardAssignments];
    if (allAssignments.length === 0) {
        setDistributionInterfaceMessage('No hay una distribución generada para exportar.');
        showNotification('No hay una distribución generada para exportar.');
        return;
    }
    setDistributionInterfaceMessage('');

    const shiftsResources = [
        { name: "TURNO 1", time: "0800-1200 / 2000-0000" },
        { name: "TURNO 2", time: "1200-1600 / 0000-0400" },
        { name: "TURNO 3", time: "1600-2000 / 0400-0800" }
    ];

    // Datos finales para la hoja (Array of Arrays)
    const aoa_data = [
        ["GT 100.51 - CUADRO DE DISTRIBUCIÓN DE PERSONAL"],
        [`Fecha de Generación: ${new Date().toLocaleString()}`],
        [], // Espacio
        ["GRADO", "ESPECIALIDAD", "NOMBRES Y APELLIDOS", "Cí‰DULA", "REPARTO", "CONTACTO", "GRUPO"] // Encabezado de tabla
    ];

    // Helper para agregar bloques de datos
    const appendExcelBlock = (title, items) => {
        if (items.length === 0) return;

        // Fila de Encabezado de Sección
        aoa_data.push([title.toUpperCase()]);

        const uniqueLocs = [...new Set(items.map(m => m.assignedLocation))];
        uniqueLocs.forEach(locName => {
            const locMembers = items.filter(m => m.assignedLocation === locName);
            const time = locMembers[0].assignedTime || "";

            // Fila de Encabezado de Puesto
            aoa_data.push([`   ${locName}${time ? ' (' + time + ')' : ''}`]);

            // Filas de Personal
            locMembers.forEach(p => {
                aoa_data.push([
                    p.grade,
                    p.specialty || "N/A",
                    p.name,
                    p.idNum || "S/N",
                    p.unit || "N/A",
                    p.contact || "S/N",
                    p.rotacion || "N/A"
                ]);
            });
        });
        aoa_data.push([]); // Espacio entre bloques
    };

    // Construir estructura
    appendExcelBlock("TAREAS DE APOYO (CUOTAS FIJAS)", specialAssignments);

    shiftsResources.forEach(shift => {
        const shiftMembers = guardAssignments.filter(d => d.assignedShift === shift.name);
        appendExcelBlock(`${shift.name} (${shift.time})`, shiftMembers);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(aoa_data);

    // Ajustes de ancho de columna
    const wscols = [
        { wch: 15 }, // Grado
        { wch: 15 }, // Especialidad
        { wch: 40 }, // Nombres
        { wch: 15 }, // Cédula
        { wch: 15 }, // Reparto
        { wch: 15 }, // Contacto
        { wch: 15 }  // Grupo
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Distribucion_GT100.51");
    XLSX.writeFile(workbook, "Distribucion_Personal_GT100.51.xlsx");
}

function exportOpsToExcel() {
    if (opsEvents.length === 0) {
        showNotification('No hay eventos planificados para exportar.');
        return;
    }

    const aoa_data = [
        ["PLANIFICACIÓN DE OPERACIONES G.T. 100-51 \"CODESC\""],
        [],
        ["FECHA:", new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(), "", "", "", "", "", ""]
    ];

    // Grupar eventos por distrito
    const groups = {};
    opsEvents.forEach(event => {
        const dist = event.distrito || 'SIN DISTRITO';
        if (!groups[dist]) groups[dist] = [];
        groups[dist].push(event);
    });

    Object.keys(groups).sort().forEach(distName => {
        const events = groups[distName];

        // Fila de encabezado de distrito
        aoa_data.push([distName, "", "", "", "", "", "", ""]);
        aoa_data.push(["Ní°", "EVENTO / FECHA-HORA", "SECTOR", "PERSONAL EMPLEADO", "VEHÍCULOS", "NOVEDAD", "", ""]);

        events.forEach((item, index) => {
            aoa_data.push([
                index + 1,
                `${item.evento} ${item.fechaHora}`,
                item.sector,
                item.personal,
                item.vehiculos,
                item.novedad || '-',
                "",
                ""
            ]);
        });

        // Fila vacía entre distritos
        aoa_data.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(aoa_data);

    // Formato específico basado en el modelo
    worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Título unificado
        { s: { r: 2, c: 0 }, e: { r: 2, c: 0 } }, // FECHA label
        { s: { r: 2, c: 1 }, e: { r: 2, c: 5 } }  // FECHA value
    ];

    const wscols = [
        { wch: 8 },  // Ní°
        { wch: 25 }, // Evento
        { wch: 20 }, // Fecha/Hora
        { wch: 15 }, // Distrito
        { wch: 40 }, // Sector
        { wch: 30 }, // Personal
        { wch: 20 }, // Vehículos
        { wch: 40 }  // Novedad
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "GT. 100-51");
    XLSX.writeFile(workbook, `PLANIFICACION_GT100.51_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportOpsToPDF() {
    if (opsEvents.length === 0) {
        showNotification("No hay eventos registrados para exportar.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    // Agrupar eventos por distrito
    const groups = {};
    opsEvents.forEach(event => {
        const dist = event.distrito || 'SIN DISTRITO';
        if (!groups[dist]) groups[dist] = [];
        groups[dist].push(event);
    });

    let currentY = 15;

    // Título Principal Global
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('PLANIFICACIÓN DE OPERACIONES', 148.5, currentY, { align: 'center' });

    currentY += 8;
    // Fecha Global
    doc.setFontSize(10);
    doc.text(`FECHA: ${new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase()}`, 148.5, currentY, { align: 'center' });

    currentY += 15;

    Object.keys(groups).sort().forEach((distName, groupIndex) => {
        const events = groups[distName];

        if (groupIndex > 0) {
            // Añadir espacio entre distritos o nueva página si es necesario
            currentY += 15;
            if (currentY > 180) {
                doc.addPage();
                currentY = 15;
            }
        }

        // Subtítulo del Distrito
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(distName, 14, currentY);

        const rows = events.map((item, index) => [
            index + 1,
            `${item.evento} ${item.fechaHora}`,
            item.sector,
            item.personal,
            item.vehiculos,
            item.novedad || '-'
        ]);

        doc.autoTable({
            startY: currentY + 5,
            head: [['Ní°', 'EVENTO / FECHA-HORA', 'SECTOR', 'PERSONAL EMPLEADO', 'VEHÍCULOS', 'NOVEDAD / CAMBIOS']],
            body: rows,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { cellWidth: 60 },
                2: { cellWidth: 50 },
                3: { cellWidth: 40 },
                4: { cellWidth: 40 },
                5: { cellWidth: 70 }
            },
            margin: { left: 10, right: 10 },
            didDrawPage: (data) => {
                currentY = data.cursor.y;
            }
        });

        currentY = doc.lastAutoTable?.finalY || currentY;
    });

    // Pie de firma del Oficial de OMAI
    let finalY = currentY + 25;

    if (finalY > 180) {
        doc.addPage();
        finalY = 30;
    }

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('__________________________', 148.5, finalY, { align: 'center' });
    doc.text('OFICIAL OMAI', 148.5, finalY + 7, { align: 'center' });

    doc.save(`PLANIFICACION_OPERACIONES_${new Date().toISOString().split('T')[0]}.pdf`);
}

// --- Funciones de Planificación de Operaciones ---
function updateOpsPersonnelAutoFill() {
    const districtElem = document.getElementById('opsDistrito');
    const shiftElem = document.getElementById('opsFechaHora');
    const personalInput = document.getElementById('opsPersonal');

    if (!districtElem || !shiftElem || !personalInput) return;

    const district = (districtElem.value || "").trim();
    const shiftVal = (shiftElem.value || "").trim();

    if (!district || !shiftVal) {
        personalInput.value = "";
        return;
    }

    // Asegurar que los datos estén cargados (usar window para asegurar acceso global)
    let gAssignments = window.guardAssignments || [];
    let sAssignments = window.specialAssignments || [];

    if (gAssignments.length === 0 && localStorage.getItem('guardAssignments')) {
        try { gAssignments = JSON.parse(localStorage.getItem('guardAssignments')); } catch (e) { }
    }
    if (sAssignments.length === 0 && localStorage.getItem('specialAssignments')) {
        try { sAssignments = JSON.parse(localStorage.getItem('specialAssignments')); } catch (e) { }
    }

    // Mapear el valor del select al nombre de turno usado en las asignaciones
    const shiftMapping = {
        "08H00 A 12H00": ["T1", "TURNO 1"],
        "12H00 A 16H00": ["T2", "TURNO 2"],
        "16H00 A 20H00": ["T3", "TURNO 3"],
        "TOQUE DE QUEDA T1": ["T1 TQ", "CONTROL TOQUE DE QUEDA"],
        "TOQUE DE QUEDA T2": ["T2 TQ", "CONTROL TOQUE DE QUEDA"],
        "TOQUE DE QUEDA": ["T1 TQ", "T2 TQ", "CONTROL TOQUE DE QUEDA"]
    };

    let targetShiftNames = [shiftVal.toUpperCase()];
    for (const key in shiftMapping) {
        if (shiftVal.toUpperCase().includes(key.toUpperCase())) {
            targetShiftNames = shiftMapping[key].map(s => s.toUpperCase());
            break;
        }
    }

    const officerGrades = ['CPNV', 'CPFG', 'CPCB', 'TNNV', 'TNFG', 'ALFG', 'MAESTRO'];
    const allAssignments = [...gAssignments, ...sAssignments];

    const targetDistrictClean = district.toUpperCase();

    const matchingAssignments = allAssignments.filter(a => {
        const aLoc = (a.assignedLocation || "").trim().toUpperCase();
        const aShift = (a.assignedShift || "").trim().toUpperCase();
        const isSupport = aShift === "APOYO" || aShift === "TAREA DE APOYO";

        if (aLoc !== targetDistrictClean) return false;
        return isSupport || targetShiftNames.includes(aShift);
    });

    let ofCount = 0;
    let triCount = 0;

    matchingAssignments.forEach(p => {
        const grade = (p.grade || '').toUpperCase();
        const isOfficer = officerGrades.some(og => grade.includes(og));
        if (isOfficer) ofCount++;
        else triCount++;
    });

    const ofStr = ofCount.toString().padStart(2, '0');
    const triStr = triCount.toString().padStart(2, '0');

    if (ofCount === 0 && triCount === 0) {
        personalInput.value = `00 OFI 00 TRIP (Sin Asignaciones)`;
    } else {
        personalInput.value = `${ofStr} OFI ${triStr} TRIP`;
    }
}

function renderOpsPlanningTable() {
    const container = document.getElementById('opsPlanningContainer');
    if (!container) return;

    container.innerHTML = '';

    if (opsEvents.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay eventos planificados. Haz clic en "Nuevo Evento".</p>';
        return;
    }

    // Agrupar eventos por distrito
    const groups = {};
    opsEvents.forEach(event => {
        const dist = event.distrito || 'SIN DISTRITO';
        if (!groups[dist]) groups[dist] = [];
        groups[dist].push(event);
    });

    // Para cada distrito, crear una tabla
    Object.keys(groups).sort().forEach(distName => {
        const events = groups[distName];

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'district-table-wrapper';
        tableWrapper.style.marginBottom = '2rem';
        tableWrapper.style.overflowX = 'auto';
        tableWrapper.style.background = 'var(--bg-card)';
        tableWrapper.style.borderRadius = '8px';
        tableWrapper.style.border = '1px solid var(--border)';

        const table = document.createElement('table');
        table.className = 'distribution-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = new Date().toLocaleDateString('es-ES', options).toUpperCase();

        table.innerHTML = `
            <thead>
                <tr style="background: #1e293b; color: white;">
                    <th colspan="8" style="padding: 12px; font-size: 1.1rem; text-align: center; border-bottom: 2px solid var(--accent-primary);">
                        DISTRITO: ${distName} - PLANIFICACIÓN GT 100.51
                    </th>
                </tr>
                <tr style="background: rgba(255,255,255,0.02);">
                    <th colspan="2" style="text-align: left; padding: 10px; border-bottom: 1px solid var(--border); font-size: 0.8rem;">FECHA:</th>
                    <th colspan="6" style="text-align: left; padding: 10px; color: var(--accent-primary); border-bottom: 1px solid var(--border); font-size: 0.8rem;">${dateStr}</th>
                </tr>
                <tr style="background: var(--bg-sidebar); font-size: 0.85rem;">
                    <th style="width: 60px; text-align: center;">Ní°</th>
                    <th style="min-width: 200px;">EVENTO / FECHA-HORA</th>
                    <th>SECTOR</th>
                    <th style="width: 150px;">PERSONAL EMPLEADO</th>
                    <th style="width: 150px;">VEHÍCULOS</th>
                    <th>NOVEDAD / CAMBIOS</th>
                    <th style="width: 100px;">ACCIONES</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        events.forEach((event, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center; font-weight: bold; border: 1px solid var(--border); padding: 8px;">${index + 1}</td>
                <td style="font-weight: 500; border: 1px solid var(--border); padding: 8px;">${event.evento} ${event.fechaHora}</td>
                <td style="font-size: 0.85rem; border: 1px solid var(--border); padding: 8px;">${event.sector}</td>
                <td style="border: 1px solid var(--border); padding: 8px;">${event.personal}</td>
                <td style="border: 1px solid var(--border); padding: 8px;">${event.vehiculos}</td>
                <td style="font-size: 0.85rem; color: var(--text-muted); border: 1px solid var(--border); padding: 8px;">${event.novedad || '-'}</td>
                <td class="table-actions" style="border: 1px solid var(--border); text-align: center; padding: 8px;">
                    <button class="btn-action edit" onclick="openOpsModal('${event.id}')" title="Editar">✏️</button>
                    <button class="btn-action delete" onclick="deleteOpsEvent('${event.id}')" title="Eliminar">🗑️</button>
                </td>
            `;
            tbody.appendChild(row);
        });

        tableWrapper.appendChild(table);
        container.appendChild(tableWrapper);
    });
}

function renderVehicleSelectionList(selectedPlatesString = "", eventId = null) {
    const container = document.getElementById('opsVehiculosContainer');
    if (!container) return;

    container.innerHTML = '';
    const selectedPlates = selectedPlatesString ? selectedPlatesString.split(',').map(s => s.trim()) : [];

    // Recopilar vehículos asignados a otros eventos
    const assignedVehicles = [];
    opsEvents.forEach(evt => {
        if (eventId && evt.id === eventId) return; // omitimos el actual si es edicion
        if (evt.vehiculos) {
            evt.vehiculos.split(',').forEach(p => assignedVehicles.push(p.trim()));
        }
    });

    // Vehículos "disponibles" son los que están marcados como tales en logística y no asignados a otros eventos
    const availableVehicles = vehicles.filter(v => v.available && !assignedVehicles.includes(v.plate));

    // Mostrar también los seleccionados actualmente en este evento, incluso si por alguna razón no están "disponibles"
    const vehiclesToShow = [...availableVehicles];
    selectedPlates.forEach(plate => {
        if (!vehiclesToShow.find(v => v.plate === plate)) {
            const vObj = vehicles.find(v => v.plate === plate);
            if (vObj) vehiclesToShow.push(vObj);
        }
    });

    if (vehiclesToShow.length === 0) {
        container.innerHTML = '<p style="grid-column: 1 / -1; font-size: 0.8rem; color: var(--text-muted); text-align: center;">No hay vehículos disponibles</p>';
        updateVehicleAvailabilityCounter();
        return;
    }

    vehiclesToShow.forEach(v => {
        const isChecked = selectedPlates.includes(v.plate);
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '8px';
        div.style.padding = '4px';
        div.style.border = '1px solid transparent';
        div.style.borderRadius = '4px';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.2s';

        div.innerHTML = `
            <input type="checkbox" class="ops-vehicle-check" value="${v.plate}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer;">
            <div style="display: flex; flex-direction: column; overflow: hidden;">
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-main); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${v.plate}</span>
                <span style="font-size: 0.65rem; color: var(--text-muted); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${v.type} - ${v.brand}</span>
            </div>
        `;

        // Toggle checkbox on div click (optional but nice)
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                updateVehicleAvailabilityCounter();
            }
        };

        // Update counter when checkbox changes
        const cb = div.querySelector('input');
        cb.onchange = () => updateVehicleAvailabilityCounter();

        container.appendChild(div);
    });

    updateVehicleAvailabilityCounter();
}

function updateVehicleAvailabilityCounter() {
    const assignedVehicles = [];
    const currentEventId = document.getElementById('editOpsId').value;
    opsEvents.forEach(evt => {
        if (currentEventId && evt.id === currentEventId) return;
        if (evt.vehiculos) {
            evt.vehiculos.split(',').forEach(p => assignedVehicles.push(p.trim()));
        }
    });

    const totalBase = vehicles.filter(v => v.available && !assignedVehicles.includes(v.plate)).length;
    const selected = document.querySelectorAll('.ops-vehicle-check:checked').length;
    const disponiblesReales = Math.max(0, totalBase - selected);

    const counter = document.getElementById('availableVehiclesCount');
    if (counter) {
        counter.textContent = `Asignados: ${selected} | Disp: ${disponiblesReales}`;
    }
}

function openOpsModal(eventId = null) {
    console.log("Abriendo Modal Ops. EventId:", eventId);
    const modal = document.getElementById('addOpsEventModal');
    const form = document.getElementById('opsEventForm');
    const title = document.getElementById('opsModalTitle');
    const districtSelect = document.getElementById('opsDistrito');
    const shiftSelect = document.getElementById('opsFechaHora');

    if (!modal || !form) {
        console.error("No se encontró el modal o formulario de operaciones");
        return;
    }

    form.reset();
    const editIdInput = document.getElementById('editOpsId');
    if (editIdInput) editIdInput.value = '';

    // Población dinámica de Selectores basada en la Distribución Actual
    const allAssignments = [...(guardAssignments || []), ...(specialAssignments || [])];

    const shiftMap = {
        "0800-1200 / 2000-0000": "TURNO 1 (08H00 A 12H00 / 20H00 A 00H00)",
        "12H00 A 16H00 / 00H00 A 04H00": "TURNO 2 (12H00 A 16H00 / 00H00 A 04H00)",
        "16H00 A 20H00 / 04H00 A 08H00": "TURNO 3 (16H00 A 20H00 / 04H00 A 08H00)"
    };

    // 1. Limpiar y poblar Distritos basados únicamente en Asignaciones Reales
    if (districtSelect) {
        while (districtSelect.options.length > 1) districtSelect.remove(1);
        const uniquePosts = new Set();
        allAssignments.forEach(a => { if (a.assignedLocation) uniquePosts.add(a.assignedLocation); });

        if (uniquePosts.size === 0) {
            console.warn("No hay personal asignado en ninguna ubicación.");
        }

        Array.from(uniquePosts).sort().forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            districtSelect.appendChild(option);
        });
    }

    // 2. Función para actualizar los turnos según el distrito seleccionado
    window.updateOpsShiftSelector = function () {
        if (!shiftSelect || !districtSelect) return;
        const selectedDist = districtSelect.value;

        // Limpiar turnos
        while (shiftSelect.options.length > 1) shiftSelect.remove(1);

        if (!selectedDist) {
            updateOpsPersonnelAutoFill();
            return;
        }

        const activeShiftsForDist = new Set();
        allAssignments.forEach(a => {
            if (a.assignedLocation === selectedDist) {
                // Prioridad 1: Usar assignedTime (el horario real introducido)
                if (a.assignedTime) {
                    const prettyLabel = shiftMap[a.assignedTime] || a.assignedTime;
                    activeShiftsForDist.add(prettyLabel);
                }
                // Prioridad 2: Si no hay assignedTime, usar assignedShift con mapeo
                else if (a.assignedShift && a.assignedShift !== "FIJO") {
                    let label = a.assignedShift;
                    if (label === "TURNO 1") label = shiftMap["0800-1200 / 2000-0000"];
                    if (label === "TURNO 2") label = shiftMap["1200-1600 / 0000-0400"];
                    if (label === "TURNO 3") label = shiftMap["1600-2000 / 0400-0800"];
                    activeShiftsForDist.add(label);
                }
            }
        });

        Array.from(activeShiftsForDist).sort().forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            shiftSelect.appendChild(option);
        });

        updateOpsPersonnelAutoFill();
    };

    // Vincular el evento de cambio del distrito
    if (districtSelect) {
        districtSelect.onchange = window.updateOpsShiftSelector;
    }

    // Inicializar turnos (vacíos hasta que se elija distrito)
    if (shiftSelect) {
        while (shiftSelect.options.length > 1) shiftSelect.remove(1);
    }



    if (eventId) {
        title.textContent = 'Editar Evento Operativo';
        const event = opsEvents.find(e => e.id === eventId);
        if (event) {
            document.getElementById('editOpsId').value = event.id;
            document.getElementById('opsEvento').value = event.evento;

            // Primero ponemos el distrito y disparamos la población de turnos
            if (districtSelect) {
                districtSelect.value = event.distrito;
                if (window.updateOpsShiftSelector) window.updateOpsShiftSelector();
            }

            // Ahora que los turnos están poblados, seleccionamos el correcto
            if (shiftSelect) shiftSelect.value = event.fechaHora;

            document.getElementById('opsSector').value = event.sector;
            document.getElementById('opsPersonal').value = event.personal;
            renderVehicleSelectionList(event.vehiculos || "", event.id);
            document.getElementById('opsNovedad').value = event.novedad || '';

            updateOpsPersonnelAutoFill();
        }
    } else {
        title.textContent = 'Nuevo Evento Operativo';
        renderVehicleSelectionList("");
        updateOpsPersonnelAutoFill();
    }

    modal.style.display = 'flex';
}


function updateOpsPersonnelAutoFill() {
    const shiftVal = document.getElementById('opsFechaHora').value;
    const distVal = document.getElementById('opsDistrito').value;
    const personalInput = document.getElementById('opsPersonal');

    if (!personalInput) return;
    if (!shiftVal || !distVal) {
        personalInput.value = "";
        return;
    }

    let targetTime = null;
    let targetTurn = null;

    // Lógica de detección inteligente para mapear strings de UI a datos de Distribución
    if (shiftVal.includes("TURNO 1")) {
        targetTime = "0800-1200 / 2000-0000";
        targetTurn = "TURNO 1";
    } else if (shiftVal.includes("TURNO 2")) {
        targetTime = "1200-1600 / 0000-0400";
        targetTurn = "TURNO 2";
    } else if (shiftVal.includes("TURNO 3")) {
        targetTime = "1600-2000 / 0400-0800";
        targetTurn = "TURNO 3";
    } else if (shiftVal.includes("TOQUE DE QUEDA T1")) {
        targetTime = "2300 - 0200";
        targetTurn = "T1 TQ";
    } else if (shiftVal.includes("TOQUE DE QUEDA T2")) {
        targetTime = "0200 - 0500";
        targetTurn = "T2 TQ";
    } else {
        // Si es un horario manual (ej: "0800-1600"), se usa tal cual para buscar
        targetTime = shiftVal;
        targetTurn = shiftVal;
    }

    // Buscar personal por TIEMPO (más específico para puestos fijos/apoyo)
    let snapshot = getPersonnelSnapshot(distVal, targetTime);

    // Si no hay resultados por tiempo, intentar por NOMBRE DE TURNO
    if (snapshot.length === 0 && targetTurn !== targetTime) {
        snapshot = getPersonnelSnapshot(distVal, targetTurn);
    }

    if (snapshot.length === 0) {
        personalInput.value = "00 OF + 00 TRI";
        return;
    }

    // Grados de Oficiales
    const OFFICERS_GRADES = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG"];

    const ofs = snapshot.filter(p => OFFICERS_GRADES.includes(p.grade)).length;
    const tris = snapshot.length - ofs;
    personalInput.value = `${ofs.toString().padStart(2, '0')} OF + ${tris.toString().padStart(2, '0')} TRI`;
}







function closeOpsModal() {
    document.getElementById('addOpsEventModal').style.display = 'none';
}

function saveOpsEvent(e) {
    e.preventDefault();

    const eventId = document.getElementById('editOpsId').value;
    const eventData = {
        id: eventId || 'ops_' + Date.now(),
        evento: document.getElementById('opsEvento').value,
        fechaHora: document.getElementById('opsFechaHora').value,
        distrito: document.getElementById('opsDistrito').value,
        sector: document.getElementById('opsSector').value,
        personal: document.getElementById('opsPersonal').value,
        // Recolectar vehículos seleccionados
        vehiculos: Array.from(document.querySelectorAll('.ops-vehicle-check:checked')).map(cb => cb.value).join(', '),
        novedad: document.getElementById('opsNovedad').value
    };

    if (eventId) {
        const index = opsEvents.findIndex(e => e.id === eventId);
        if (index !== -1) opsEvents[index] = eventData;
        showNotification('Evento actualizado correctamente');
    } else {
        opsEvents.push(eventData);
        showNotification('Evento guardado correctamente');
    }

    saveAppState('opsEvents', JSON.stringify(opsEvents));
    renderOpsPlanningTable();
    closeOpsModal();
}

function deleteOpsEvent(eventId) {
    if (confirm('ííEstás seguro de eliminar este evento planificado?')) {
        opsEvents = opsEvents.filter(e => e.id !== eventId);
        saveAppState('opsEvents', JSON.stringify(opsEvents));
        renderOpsPlanningTable();
        showNotification('Evento eliminado');
    }
}

function exportDistributionToPDF() {
    if (!personnel || personnel.length === 0) {
        showNotification('No hay personal registrado para exportar.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text('GT 100.51 - DISTRIBUCIÓN TÁCTICA DE PERSONAL', 105, 15, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Operación: " + (typeof operationName !== 'undefined' ? operationName : "GENERAL"), 14, 22);
    doc.text("Generado el: " + new Date().toLocaleString(), 14, 27);

    let startY = 32;

    const groupOrder = ["GRUPO 1", "GRUPO 2", "GRUPO 3", "GRUPO 4"];
    const groupedByGroup = {};

    personnel.forEach(p => {
        if (isDesignatedOtherFunction(p.funcion)) return; // Exclude other functions from PDF distribution
        const groupKey = String(p.rotacion || "N/A").toUpperCase().trim();
        if (!groupedByGroup[groupKey]) groupedByGroup[groupKey] = [];
        groupedByGroup[groupKey].push(p);
    });

    groupOrder.forEach((groupName) => {
        const groupMembers = groupedByGroup[groupName] || [];
        if (groupMembers.length === 0) return;

        if (startY > 260) { doc.addPage(); startY = 20; }

        let colorGrp = [59, 130, 246]; // Azul
        if (groupName === "GRUPO 2") colorGrp = [16, 185, 129]; // Verde
        if (groupName === "GRUPO 3") colorGrp = [245, 158, 11]; // Naranja
        if (groupName === "GRUPO 4") colorGrp = [139, 92, 246]; // Morado

        doc.setFillColor(colorGrp[0], colorGrp[1], colorGrp[2]);
        doc.rect(14, startY, 182, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("LISTADO DETALLADO DEL " + groupName, 105, startY + 5.5, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        startY += 10;

        const groupLetterMap = { "GRUPO 1": "A", "GRUPO 2": "B", "GRUPO 3": "C", "GRUPO 4": "D" };
        const letter = groupLetterMap[groupName] || "A";
        const sections = [letter + "1", letter + "2", letter + "3", letter + "4", letter + "5", "REACCIÓN"];

        const groupedByFunc = {};
        sections.forEach(s => groupedByFunc[s] = []);

        groupMembers.forEach(p => {
            let f = (p.funcion || "REACCIÓN").toUpperCase().trim();
            if (groupedByFunc.hasOwnProperty(f)) groupedByFunc[f].push(p);
            else groupedByFunc["REACCIÓN"].push(p);
        });

        sections.forEach(cat => {
            const members = groupedByFunc[cat];
            if (members.length === 0) return;

            if (startY > 270) { doc.addPage(); startY = 20; }

            let catBg = [240, 253, 250];
            let catText = [13, 148, 136];
            if (cat === "REACCIÓN") {
                catBg = [254, 242, 242];
                catText = [185, 28, 28];
            }

            doc.setFillColor(catBg[0], catBg[1], catBg[2]);
            doc.rect(14, startY, 182, 6, 'F');
            doc.setTextColor(catText[0], catText[1], catText[2]);
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.text("SECCIÓN: " + cat + " (" + members.length + " PERS.)", 18, startY + 4.5);
            doc.setTextColor(0, 0, 0);
            startY += 7;

            const rankHierarchy = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
            members.sort((a, b) => {
                let rA = rankHierarchy.indexOf(String(a.grade || "").trim().toUpperCase());
                let rB = rankHierarchy.indexOf(String(b.grade || "").trim().toUpperCase());
                if (rA === -1) rA = 999;
                if (rB === -1) rB = 999;
                return rA - rB || String(a.name || "").localeCompare(String(b.name || ""));
            });

            const rows = members.map(p => [
                p.grade || '',
                p.specialty || 'N/A',
                p.name || '',
                p.idNum || 'S/N',
                p.unit || 'S/N',
                p.contact || 'S/N',
                p.grupoDestino || 'GT ECHO',
                p.funcion || ''
            ]);

            doc.autoTable({
                startY: startY,
                head: [['Grado', 'Espec.', 'Nombres y Apellidos', 'Cédula', 'Reparto', 'Contacto', 'Destino', 'Func.']],
                body: rows,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1.2 },
                headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], halign: 'center' },
                margin: { left: 14, right: 14 },
                didDrawPage: (data) => {
                    startY = data.cursor.y + 4;
                }
            });

            startY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : startY) + 6;
        });
        startY += 8;
    });

    const fileName = "Distribucion_Tactica_" + new Date().toISOString().slice(0, 10) + ".pdf";
    doc.save(fileName);
    showNotification("PDF de distribución generado correctamente.");
}

function updateUI() {
    const totalCrimesEl = document.getElementById('totalCrimes');
    if (totalCrimesEl) totalCrimesEl.textContent = crimes.length;

    const dashTotalEl = document.getElementById('dashTotal');
    if (dashTotalEl) dashTotalEl.textContent = crimes.length;

    // Actualizar nombre de operación en el nav
    const opDisplay = document.getElementById('currentOperationalDate');
    if (opDisplay) {
        opDisplay.textContent = `OPERACIÓN: ${operationName}`;
    }
}

function toggleDashboard(show) {
    const overlay = document.getElementById('dashboardOverlay');
    if (show) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
        updateDashboard();
    } else {
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
    }
}

function updateDashboard() {
    const districtStatsContainer = document.getElementById('dashDistricts');
    if (!districtStatsContainer) return;
    districtStatsContainer.innerHTML = '';

    // Agrupar por distrito
    const summary = {};
    const districts = ['SUR', 'ESTEROS', '9 DE OCTUBRE'];
    districts.forEach(d => summary[d] = 0);

    crimes.forEach(c => {
        if (summary[c.district] !== undefined) {
            summary[c.district]++;
        }
    });

    // Renderizar resumen por distrito
    districts.forEach(d => {
        const row = document.createElement('div');
        row.className = 'district-row';
        row.innerHTML = `
            <span class="district-name">${d}</span>
            <span class="district-count">${summary[d]}</span>
        `;
        districtStatsContainer.appendChild(row);
    });

    // Gráfico de Barras con Chart.js
    const ctx = document.getElementById('crimeChart').getContext('2d');

    if (crimeChart) {
        crimeChart.destroy();
    }

    crimeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: districts,
            datasets: [{
                label: 'Incidentes',
                data: districts.map(d => summary[d]),
                backgroundColor: [
                    'rgba(14, 165, 233, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(34, 197, 94, 0.7)'
                ],
                borderColor: [
                    '#0ea5e9',
                    '#ef4444',
                    '#22c55e'
                ],
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', stepSize: 1 },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
}

function saveData() {
    try {
        saveAppState('gyecrimes', JSON.stringify(crimes));
        saveAppState('gyepersonal', JSON.stringify(personnel));
        saveAppState('guardAssignments', JSON.stringify(guardAssignments));
        saveAppState('specialAssignments', JSON.stringify(specialAssignments));
        saveAppState('opsEvents', JSON.stringify(opsEvents));
        saveAppState('instantOps', JSON.stringify(instantOps));
        saveAppState('gyevehicles', JSON.stringify(vehicles));
        saveAppState('gyechoferes', JSON.stringify(choferes));
        saveAppState('patrolOrders', JSON.stringify(patrolOrders));
        saveAppState('commandPostPersonnel', JSON.stringify(commandPostPersonnel));
        saveAppState('personnelHistory', JSON.stringify(personnelHistory));
        saveAppState('operationName', operationName);
        saveAppState('rotationStartDate', rotationStartDate);
        saveAppState('rotationStartGroup', rotationStartGroup);
        saveAppState('codescReferenceDate', codescStartDate);
        saveAppState('codescStartGroup', codescStartGroup);
        saveAppState('templatePatrolOrders', JSON.stringify(templatePatrolOrders));
        saveAppState('externalOrdersMetadata', JSON.stringify(externalOrdersMetadata));
        saveAppState('baborPersonnel', JSON.stringify(baborPersonnel));
        saveAppState('estriborPersonnel', JSON.stringify(estriborPersonnel));
    } catch (e) {
        console.error("Error al guardar en localStorage:", e);
        if (e.name === 'QuotaExceededError') {
            alert("⚠️ Error: El almacenamiento local está lleno. No se pueden guardar más datos.");
        }
    }
}

function formatDoc(cmd, value = null) {
    if (value) {
        document.execCommand(cmd, false, value);
    } else {
        document.execCommand(cmd, false, null);
    }
}

function populateAnexoBPuestosSelector(skipShiftReset = false) {
    const shiftSelector = document.getElementById('ioShiftSelector');
    const container = document.getElementById('ioPuestosSelector');
    if (!container || !shiftSelector) return;

    const all = [...(specialAssignments || []), ...(guardAssignments || [])];

    // 1. Populating unique shifts if not skipping
    if (!skipShiftReset) {
        const previousVal = shiftSelector.value;
        const shiftMap = new Map();

        all.forEach(a => {
            if (!a.assignedShift) return;
            const shiftVal = a.assignedShift;
            const timeVal = a.assignedTime || "";
            const val = shiftVal + "::" + timeVal;
            const label = shiftVal === "FIJO" && timeVal ? timeVal : (timeVal ? `${shiftVal} (${timeVal})` : shiftVal);
            shiftMap.set(val, label);
        });

        shiftSelector.innerHTML = '<option value="">-- Todos los Turnos --</option>';
        Array.from(shiftMap.keys()).sort().forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = shiftMap.get(val);
            shiftSelector.appendChild(opt);
        });
        shiftSelector.value = previousVal;
    }

    // 2. Filter posts based on selected shift
    let filteredAll = all;
    if (shiftSelector.value) {
        const parts = shiftSelector.value.split("::");
        const sShift = parts[0];
        const sTime = parts[1];
        if (sTime !== undefined) {
            filteredAll = all.filter(a => a.assignedShift === sShift && (a.assignedTime || "") === sTime);
        } else {
            filteredAll = all.filter(a => a.assignedShift === sShift);
        }
    }

    const uniquePosts = [...new Set(filteredAll.map(a => a.assignedLocation).filter(Boolean))].sort();
    container.innerHTML = '';
    container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-top: 10px; padding: 5px;';

    if (uniquePosts.length === 0) {
        container.innerHTML = '<small style="color:var(--text-muted);">No hay puestos disponibles para este turno.</small>';
        return;
    }

    uniquePosts.forEach(post => {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex; align-items:center; gap:10px; background:#f1f5f9; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:0.85rem; color:#1e293b; transition: background 0.2s;';
        label.onmouseenter = () => label.style.background = '#e2e8f0';
        label.onmouseleave = () => label.style.background = '#f1f5f9';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = post;
        checkbox.id = 'post_' + post.replace(/\s+/g, '_');
        checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-primary); margin: 0;';
        checkbox.addEventListener('change', updateAnexoBPreview);

        const span = document.createElement('span');
        span.textContent = post;
        span.style.fontWeight = '500';

        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
    });

    updateAnexoBPreview();
}

function updateAnexoBPreview() {
    const preview = document.getElementById('ioPersonnelPreview');
    if (!preview) return;

    const selectedPosts = getSelectedAnexBPosts();
    if (selectedPosts.length === 0) {
        preview.innerHTML = '<em style="color:var(--text-muted);">Ningún puesto seleccionado.</em>';
        return;
    }

    const all = [...(specialAssignments || []), ...(guardAssignments || [])];
    const selectedShift = document.getElementById('ioShiftSelector')?.value;
    let filtered = all.filter(a => selectedPosts.includes(a.assignedLocation));

    if (selectedShift) {
        const parts = selectedShift.split("::");
        const sShift = parts[0];
        const sTime = parts[1];
        if (sTime !== undefined) {
            filtered = filtered.filter(a => a.assignedShift === sShift && (a.assignedTime || "") === sTime);
        } else {
            filtered = filtered.filter(a => a.assignedShift === sShift);
        }
    }

    if (filtered.length === 0) {
        preview.innerHTML = '<em style="color:var(--text-muted);">Sin personal registrado en esos puestos.</em>';
        return;
    }

    // Group by post
    const byPost = {};
    filtered.forEach(p => {
        const loc = p.assignedLocation || 'SIN PUESTO';
        if (!byPost[loc]) byPost[loc] = [];
        byPost[loc].push(p);
    });

    let html = '';
    Object.entries(byPost).forEach(([post, members]) => {
        html += `<div style="margin-bottom:6px;"><strong style="color:var(--accent-primary);">${post}</strong>: `;
        html += members.map(m => `${m.grade || ''} ${m.name}`).join(' / ');
        html += `</div>`;
    });
    preview.innerHTML = html;
}

function getSelectedAnexBPosts() {
    const container = document.getElementById('ioPuestosSelector');
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
}

function setSelectedAnexBPosts(posts) {
    const container = document.getElementById('ioPuestosSelector');
    if (!container) return;
    container.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = posts.includes(cb.value);
    });
    updateAnexoBPreview();
}

function handleInstantReportSubmit(e) {
    e.preventDefault();
    console.log('handleInstantReportSubmit ejecutado');

    const latVal = parseFloat(document.getElementById('ioLatInput').value);
    const lngVal = parseFloat(document.getElementById('ioLngInput').value);

    if (document.getElementById('ioLatInput').value && isNaN(latVal)) {
        alert('Por favor, ingrese coordenadas válidas (Latitud y Longitud o déjelo en blanco).');
        return;
    }

    // Asegurar que el número de reporte esté completo
    let reportNum = document.getElementById('ioReportNum').value.trim();
    if (!reportNum) {
        // Generar automáticamente en el formato CGT. 100.51-CDO-031824R-ABR-2026-R
        const now = new Date();
        const day = now.getDate().toString().padStart(2, '0');
        const month = now.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
        const year = now.getFullYear();
        const hour = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        reportNum = `CGT. 100.51-CDO-${day}${hour}${min}R-${month}-${year}-R.`;
        document.getElementById('ioReportNum').value = reportNum;
    }

    const ioDateInput = document.getElementById('ioDate');
    if (ioDateInput && !ioDateInput.value.trim()) {
        ioDateInput.value = getCurrentOfficialDTG();
    }

    const newOp = {
        id: editingInstantOpId || ('op_' + Date.now()),
        reportNum: reportNum,
        precedencia: document.getElementById('Precedencia').value,
        lugar: document.getElementById('Lugar').value,
        destinatario: document.getElementById('Destinatario').value,
        copia: document.getElementById('Copia').value,
        btNarrative: document.getElementById('BTNarrative').value,
        ref: document.getElementById('Ref').value,
        resultadosRich: document.getElementById('ioResultadosRich').innerHTML, // Contenido con formato
        quien: document.getElementById('Quien').value,
        patrulla: document.getElementById('Patrulla').value,
        date: document.getElementById('Date').value,
        como: document.getElementById('Como').value,
        donde: document.getElementById('DondeManual').value,
        acciones: document.getElementById('AccionesTomadas').value,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal,
        photos: currentInstantOpsPhotos.slice(),
        annexBShift: document.getElementById('ShiftSelector')?.value || '',
        annexBPosts: getSelectedAnexBPosts(),
        status: 'draft',
        annexBPersonnel: (() => {
            const posts = getSelectedAnexBPosts();
            const shift = document.getElementById('ShiftSelector')?.value;
            const all = [...(specialAssignments || []), ...(guardAssignments || [])];
            let filtered = all.filter(a => posts.includes(a.assignedLocation));
            if (shift) {
                const parts = shift.split("::");
                const sShift = parts[0];
                const sTime = parts[1];
                if (sTime !== undefined) {
                    filtered = filtered.filter(a => a.assignedShift === sShift && (a.assignedTime || "") === sTime);
                } else {
                    filtered = filtered.filter(a => a.assignedShift === sShift);
                }
            }
            return filtered.map(p => ({ grade: p.grade || '', name: p.name || '', location: p.assignedLocation, shift: p.assignedShift || '' }));
        })(),
        firmanteNombre: document.getElementById('FirmanteNombre').value.trim(),
        firmanteGrado: document.getElementById('FirmanteGrado').value.trim(),
        firmanteCargo: document.getElementById('FirmanteCargo').value.trim(),
        autorNombre: document.getElementById('AutorNombre').value.trim(),
        autorCargo: document.getElementById('AutorCargo').value.trim()
    };

    if (editingInstantOpId) {
        const index = instantOps.findIndex(o => o.id === editingInstantOpId);
        if (index !== -1) {
            instantOps[index] = newOp;
        }
    } else {
        instantOps.push(newOp);
    }

    try {
        saveData();
        renderInstantOpsTable(); // Priorizar el renderizado visual

        // Ejecutar actualizaciones de mapa de forma segura
        if (typeof refreshHeatLayer === 'function') {
            try { refreshHeatLayer(); } catch (err) { console.warn("Error actualizando heatlayer:", err); }
        }
        if (typeof refreshMarkers === 'function') {
            try { refreshMarkers(); } catch (err) { console.warn("Error actualizando markers:", err); }
        }
    } catch (err) {
        console.error("Error en post-procesamiento de registro:", err);
    }

    // Reset form
    document.getElementById('instantOpsForm').reset();
    const richEditor = document.getElementById('ioResultadosRich');
    if (richEditor) richEditor.innerHTML = '';

    document.getElementById('ioDondeManual').value = '';
    document.getElementById('ioLatInput').value = '';
    document.getElementById('ioLngInput').value = '';
    updateInstantOpsFormDefaults();

    // Clear photos
    currentInstantOpsPhotos = [];
    const previewContainer = document.getElementById('ioPhotosPreview');
    if (previewContainer) previewContainer.innerHTML = '';

    // Reset Anexo B selection
    const puestosContainer = document.getElementById('ioPuestosSelector');
    if (puestosContainer) puestosContainer.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    updateAnexoBPreview();

    editingInstantOpId = null;
    updateOfficialReportNum();
    selectedLatLng = null;

    showNotification('PARTE AL INSTANTE REGISTRADO');
}

function generateInstantReportFromCrime(id) {
    const crime = crimes.find(c => c.id === id);
    if (!crime) return;

    // 1. Cambiar a la vista de Partes al Instante
    // Simular el clic en el botón del sub-menú para que se aplique toda la lógica de UI
    const intelBtn = document.querySelector('.menu-btn[data-target="inteligencia"]');
    if (intelBtn && !intelBtn.classList.contains('active')) {
        intelBtn.click();
    }

    const reportSubBtn = document.querySelector('.sub-menu-btn[data-view="instantOpsView"]');
    if (reportSubBtn) {
        reportSubBtn.click();
    }

    // 2. Pre-llenar el formulario
    document.getElementById('ioRef').value = `REPORTE DE INCIDENTE: ${crime.type.toUpperCase()}`;
    document.getElementById('ioDate').value = crime.date;
    document.getElementById('ioLatInput').value = crime.lat.toFixed(6);
    document.getElementById('ioLngInput').value = crime.lng.toFixed(6);
    document.getElementById('ioDondeManual').value = `DISTRITO ${crime.district || 'S/N'}`;

    // Contenido enriquecido para Resultados
    const resultadosEditor = document.getElementById('ioResultadosRich');
    if (resultadosEditor) {
        resultadosEditor.innerHTML = `<div><b>DETALLES DEL INCIDENTE:</b></div><div>${crime.observation || 'Sin observaciones registradas.'}</div>`;
    }

    // Campos por defecto para inteligencia
    document.getElementById('ioQuien').value = "INTELIGENCIA / GT 100.51";
    document.getElementById('ioResultadosRich').focus();

    showNotification('Datos del incidente cargados en el formulario de Parte Oficial');
}

function getCurrentOfficialDTG() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const month = now.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
    const year = now.getFullYear();
    return `${day}${hour}${min}R-${month}-${year}`;
}

function updateInstantOpsFormDefaults() {
    const dateInput = document.getElementById('ioDate');
    if (dateInput) dateInput.value = getCurrentOfficialDTG();

    const resultsInput = document.getElementById('ioResultadosRich');
    if (resultsInput && (!resultsInput.innerText || resultsInput.innerText.trim() === "")) {
        resultsInput.innerHTML = '<ul><li>PRODUCTOS / RESULTADOS:</li></ul>';
    }

    const dondeInput = document.getElementById('ioDondeManual');
    if (dondeInput && (!dondeInput.value || dondeInput.value.trim() === "")) {
        dondeInput.value = 'PROVINCIA: GUAYAS.\nCANTÓN: GUAYAQUIL.\nDISTRITO: SUR.\nPARROQUIA/SECTOR: ';
    }

    updateOfficialReportNum();
}

function updateOfficialReportNum() {
    const numInput = document.getElementById('ioReportNum');
    if (!numInput) return;

    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = now.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
    const year = now.getFullYear();
    const hour = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');

    // Formato: CGT. 100.51-CDO-141730R-MAR-2026-R
    const officialNum = `CGT. 100.51-CDO-${day}${hour}${min}R-${month}-${year}-R`;
    numInput.value = officialNum;

    const dateInput = document.getElementById('ioDate');
    if (dateInput && !dateInput.value.trim()) {
        dateInput.value = getCurrentOfficialDTG();
    }
}

window.updateIoSignaturePreview = function () {
    const nombre = document.getElementById('ioFirmanteNombre').value.trim() || '---';
    const cargo = document.getElementById('ioFirmanteCargo').value.trim() || '---';
    const preview = document.getElementById('prevIoFirmaPor');
    if (preview) {
        preview.textContent = `FIRMA POR: ${nombre.toUpperCase()} / ${cargo.toUpperCase()}`;
    }
};

window.populateOrderReferences = function () {
    const datalist = document.getElementById('patrolOrderRefs');
    if (!datalist) return;
    datalist.innerHTML = '';

    // Usar el array global patrolOrders directamente
    const orders = (typeof patrolOrders !== 'undefined') ? patrolOrders : (window.patrolOrders || []);

    orders.forEach(order => {
        const option = document.createElement('option');
        // Reconstruir displayId si falta para compatibilidad
        let displayIdStr = order.displayId;
        if (!displayIdStr && order.prefix && order.dtg && order.serial) {
            displayIdStr = `${order.prefix}${order.dtg}-${order.serial}-S`;
        }
        option.value = displayIdStr || order.id || 'S/N';
        datalist.appendChild(option);
    });
};

function renderInstantOpsTable() {
    const tableBody = document.getElementById('tableBodyInstantOps');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Filtrar según el módulo (Operaciones vs Históricos)
    const filteredOps = instantOps.filter(op => {
        if (isHistoricosView) {
            return op.status === 'closed';
        } else {
            return op.status !== 'closed'; // Solo drafts en Operaciones
        }
    });

    // Mostrar más recientes primero
    const sortedOps = [...filteredOps].sort((a, b) => {
        const tsA = parseInt((a.id || '').replace('op_', '')) || 0;
        const tsB = parseInt((b.id || '').replace('op_', '')) || 0;
        return tsB - tsA;
    });

    sortedOps.forEach(op => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.onclick = (e) => {
            if (e.target.closest('.table-actions')) return;
            focusOnIncident(op.id);
        };

        const actionButtons = isHistoricosView ? `
            <button class="btn-action edit" onclick="generateOfficialDetailedPDF('${op.id}')" title="Descargar Borrador PDF"></button>
            ${op.signedPdfId ? `<button class="btn-action edit" onclick="viewSignedPdf('${op.signedPdfId}')" title="Ver PDF Firmado Institucional" style="background:#0369a1; color:white;"></button>` : ''}
            <button class="btn-action delete" onclick="deleteInstantOp('${op.id}')" title="Eliminar">🗑️</button>
        ` : `
            <button class="btn-action edit" onclick="editInstantOp('${op.id}')" title="Modificar"></button>
            <button class="btn-action edit" onclick="generateOfficialDetailedPDF('${op.id}')" title="Previsualizar PDF"></button>
            <button class="btn-action delete" onclick="closeInstantOp('${op.id}')" title="Cerrar y Archivar" style="background: #107c10; color: white;"></button>
        `;

        row.innerHTML = `
            <td style="font-weight: 700; color: var(--text-main);">${op.reportNum || 'S/N'}</td>
            <td style="font-size: 0.8rem; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${op.ref || '---'}</td>
            <td>${op.donde || '---'}</td>
            <td>${op.date || '---'}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem;">
                ${op.resultadosRich ? stripHtmlForPDF(op.resultadosRich).substring(0, 50) + '...' : '---'}
            </td>
            <td class="table-actions">
                ${actionButtons}
            </td>
        `;
        tableBody.appendChild(row);
    });
}

window.closeInstantOp = function (id) {
    currentSigningOpId = id;
    const modal = document.getElementById('signatureModal');
    if (modal) {
        modal.style.display = 'block';
        initSignaturePad();
    }
}

function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';

    let drawing = false;
    let lastPos = { x: 0, y: 0 };

    function getMousePos(canvasDom, touchOrMouseEvent) {
        const rect = canvasDom.getBoundingClientRect();
        const clientX = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientX : touchOrMouseEvent.clientX;
        const clientY = touchOrMouseEvent.touches ? touchOrMouseEvent.touches[0].clientY : touchOrMouseEvent.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    canvas.onmousedown = (e) => {
        drawing = true;
        lastPos = getMousePos(canvas, e);
    };

    canvas.onmousemove = (e) => {
        if (!drawing) return;
        const mousePos = getMousePos(canvas, e);
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.stroke();
        lastPos = mousePos;
    };

    canvas.onmouseup = () => drawing = false;

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        drawing = true;
        lastPos = getMousePos(canvas, e);
    }, false);

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!drawing) return;
        const touchPos = getMousePos(canvas, e);
        ctx.beginPath();
        ctx.moveTo(lastPos.x, lastPos.y);
        ctx.lineTo(touchPos.x, touchPos.y);
        ctx.stroke();
        lastPos = touchPos;
    }, false);

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        drawing = false;
    }, false);

    document.getElementById('confirmSignatureBtn').onclick = () => {
        confirmSignature();
    };
}

window.clearSignature = function () {
    const canvas = document.getElementById('signaturePad');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

window.closeSignatureModal = function () {
    const modal = document.getElementById('signatureModal');
    if (modal) modal.style.display = 'none';
    currentSigningOpId = null;
    clearSignature();
}

window.confirmSignature = confirmSignature;

window.launchFirmaECFallback = function () {
    showNotification("Llamando a FirmaEC...", "info");

    // Si hay un ID de parte actual, esperamos un momento antes de pedir confirmación
    if (currentSigningOpId) {
        setTimeout(() => {
            if (confirm("ííCompletó la firma en la aplicación FirmaEC?\n\nAl confirmar, el documento se marcará como 'Firmado Digitalmente'.")) {
                const index = instantOps.findIndex(o => o.id === currentSigningOpId);
                if (index !== -1) {
                    instantOps[index].status = 'closed';
                    instantOps[index].signature = 'DIGITAL_SIGNATURE_FIRMAEC';
                    instantOps[index].signedDate = new Date().toISOString();
                    saveData();
                    renderInstantOpsTable();
                    closeSignatureModal();
                    showNotification('Parte validado con Firma Electrónica (FirmaEC)', 'success');
                }
            }
        }, 3000);
    }
};

window.launchFirmaEC = function () {
    // Intentar abrir mediante link real (más compatible con file://)
    const firmaLink = document.createElement('a');
    firmaLink.href = "firmaec://";
    document.body.appendChild(firmaLink);
    firmaLink.click();
    document.body.removeChild(firmaLink);

    window.launchFirmaECFallback();
};

window.handleSignedPdfUpload = async function (e) {
    const file = e.target.files[0];
    if (!file || !currentSigningOpId) return;

    if (file.type !== 'application/pdf') {
        showNotification("Por favor seleccione un archivo PDF válido.", "error");
        return;
    }

    showNotification("Archivando documento firmado...");
    try {
        const id = 'signed_' + currentSigningOpId;
        await saveOrderToDB(id, file);

        const index = instantOps.findIndex(o => o.id === currentSigningOpId);
        if (index !== -1) {
            instantOps[index].status = 'closed';
            instantOps[index].signature = 'DIGITAL_PDF_SIGNED';
            instantOps[index].signedPdfId = id;
            instantOps[index].signedDate = new Date().toISOString();

            saveData();
            renderInstantOpsTable();
            closeSignatureModal();
            showNotification('Parte Oficial firmado y archivado exitosamente.', 'success');
        }
    } catch (err) {
        console.error("Error archiving signed PDF:", err);
        showNotification("Error al archivar el documento.", "error");
    }
    e.target.value = ''; // Reset
};

window.viewSignedPdf = async function (id) {
    try {
        const order = await getOrderFromDB(id);
        if (order) {
            const url = URL.createObjectURL(order);
            window.open(url, '_blank');
        } else {
            showNotification("No se encontró el archivo firmado en la base de datos.", "error");
        }
    } catch (err) {
        console.error("Error loading signed PDF:", err);
        showNotification("Error al cargar el archivo.", "error");
    }
};

function confirmSignature() {
    if (!currentSigningOpId) return;

    const canvas = document.getElementById('signaturePad');
    // Verificar si el canvas está vacío (opcional, aquÍpermitimos si hay al menos algo de dibujo)
    const signatureBase64 = canvas.toDataURL();

    const index = instantOps.findIndex(o => o.id === currentSigningOpId);
    if (index !== -1) {
        instantOps[index].status = 'closed';
        instantOps[index].signature = signatureBase64;
        instantOps[index].signedDate = new Date().toISOString();

        saveData();
        renderInstantOpsTable();
        closeSignatureModal();
        showNotification('Parte firmado electrónicamente y archivado en Históricos');
    }
}

window.editInstantOp = function (id) {
    const op = instantOps.find(o => o.id === id);
    if (!op) return;

    editingInstantOpId = id;

    // Obtener y simular clics para cambiar a la vista correcta si fuera necesario
    const intelBtn = document.querySelector('.menu-btn[data-target="inteligencia"]');
    if (intelBtn && !intelBtn.classList.contains('active')) intelBtn.click();
    const reportSubBtn = document.querySelector('.sub-menu-btn[data-view="instantOpsView"]');
    if (reportSubBtn) reportSubBtn.click();

    // Poblar formulario
    document.getElementById('ioReportNum').value = op.reportNum || '';
    document.getElementById('ioPrecedencia').value = op.precedencia || 'R';
    document.getElementById('ioLugar').value = op.lugar || '';
    document.getElementById('ioDestinatario').value = op.destinatario || '';
    document.getElementById('ioCopia').value = op.copia || '';
    document.getElementById('ioBTNarrative').value = op.btNarrative || '';
    document.getElementById('ioRef').value = op.ref || '';
    document.getElementById('ioResultadosRich').innerHTML = op.resultadosRich || '';
    document.getElementById('ioQuien').value = op.quien || '';
    document.getElementById('ioPatrulla').value = op.patrulla || '';
    document.getElementById('ioDate').value = op.date || '';
    document.getElementById('ioComo').value = op.como || '';
    document.getElementById('ioDondeManual').value = op.donde || '';
    document.getElementById('ioAccionesTomadas').value = op.acciones || '';
    document.getElementById('ioLatInput').value = op.lat ? op.lat.toFixed(6) : '';
    document.getElementById('ioLngInput').value = op.lng ? op.lng.toFixed(6) : '';

    currentInstantOpsPhotos = op.photos ? op.photos.slice() : [];
    const previewContainer = document.getElementById('ioPhotosPreview');
    if (previewContainer) {
        previewContainer.innerHTML = '';
        currentInstantOpsPhotos.forEach(base64 => {
            const img = document.createElement('img');
            img.src = base64;
            img.style.height = '60px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            img.style.border = '1px solid var(--border)';
            previewContainer.appendChild(img);
        });
    }

    // Restore Anexo B posts
    if (document.getElementById('ioShiftSelector')) {
        document.getElementById('ioShiftSelector').value = op.annexBShift || '';
    }
    populateAnexoBPuestosSelector(true);
    if (op.annexBPosts && op.annexBPosts.length > 0) {
        setSelectedAnexBPosts(op.annexBPosts);
    }

    // Restore signature fields
    document.getElementById('ioFirmanteNombre').value = op.firmanteNombre || '';
    document.getElementById('ioFirmanteGrado').value = op.firmanteGrado || '';
    document.getElementById('ioFirmanteCargo').value = op.firmanteCargo || '';
    document.getElementById('ioAutorNombre').value = op.autorNombre || '';
    document.getElementById('ioAutorCargo').value = op.autorCargo || '';
    window.updateIoSignaturePreview();

    const formElement = document.getElementById('instantOpsForm');
    if (formElement) formElement.scrollIntoView({ behavior: 'smooth' });
    showNotification('Datos cargados para modificación');
};

function generateOfficialDetailedPDF(id) {
    const op = instantOps.find(o => o.id === id);
    if (!op) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    buildParteAlInstantePDF(doc, op);
    doc.save(`Parte_Oficial_${op.reportNum.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);
}

function stripHtmlForPDF(html) {
    if (!html) return '';
    let text = html.replace(/<br\s*[\/]?>/gi, "\n");
    text = text.replace(/<\/div>/gi, "\n");
    text = text.replace(/<\/p>/gi, "\n");
    text = text.replace(/<[^>]+>/g, "");

    // Decodificar entidades básicas
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value.trim();
}

function deleteInstantOp(id) {
    if (confirm('ííEliminar este parte operativo?')) {
        instantOps = instantOps.filter(op => op.id !== id);
        saveData();
        refreshHeatLayer();
        refreshMarkers();
        renderInstantOpsTable();
        showNotification('Parte operativo eliminado');
    }
}

function exportOpsInstantToExcel() {
    if (instantOps.length === 0) {
        showNotification('No hay partes registrados para exportar.');
        return;
    }

    const data = instantOps.map(op => ({
        "Ní° Reporte": op.reportNum,
        "Referencia": op.ref,
        "Ubicación (Dónde)": op.donde,
        "Fecha (Cuándo)": op.date,
        "Resultados": stripHtmlForPDF(op.resultadosRich || ''),
        "Latitud": op.lat,
        "Longitud": op.lng,
        "Acciones": op.acciones
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "PartesInstante");
    XLSX.writeFile(workbook, `Reporte_Partes_Instante_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function getCurrentInstantOpFormData() {
    const latVal = parseFloat(document.getElementById('ioLatInput').value);
    const lngVal = parseFloat(document.getElementById('ioLngInput').value);
    return {
        reportNum: document.getElementById('ioReportNum').value.trim(),
        precedencia: document.getElementById('ioPrecedencia').value.trim(),
        lugar: document.getElementById('ioLugar').value.trim(),
        destinatario: document.getElementById('ioDestinatario').value.trim(),
        copia: document.getElementById('ioCopia').value.trim(),
        btNarrative: document.getElementById('ioBTNarrative').value.trim(),
        ref: document.getElementById('ioRef').value.trim(),
        resultadosRich: document.getElementById('ioResultadosRich').innerHTML,
        quien: document.getElementById('ioQuien').value.trim(),
        patrulla: document.getElementById('ioPatrulla').value.trim(),
        date: document.getElementById('ioDate').value.trim(),
        como: document.getElementById('ioComo').value.trim(),
        donde: document.getElementById('ioDondeManual').value.trim(),
        acciones: document.getElementById('ioAccionesTomadas').value.trim(),
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal,
        photos: currentInstantOpsPhotos.slice(),
        annexBPosts: getSelectedAnexBPosts(),
        annexBPersonnel: (() => {
            const posts = getSelectedAnexBPosts();
            const all = [...(specialAssignments || []), ...(guardAssignments || [])];
            return all
                .filter(a => posts.includes(a.assignedLocation))
                .map(p => ({ grade: p.grade || '', name: p.name || '', location: p.assignedLocation, shift: p.assignedShift || '' }));
        })()
    };
}

function buildParteAlInstantePDF(doc, op) {
    const margin = 18;
    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - margin * 2;
    let currentY = 15;

    function drawOfficialHeader(title, includeRef = false) {
        let y = 15;
        // --- MARCAS DE CLASIFICACIÓN ---
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(190, 30, 45); // Rojo institucional
        doc.text('SECRETO', pageWidth / 2, y, { align: 'center' });
        y += 8;

        // --- ENCABEZADO CON ESCUDO ---
        if (escudoBase64) {
            const shieldSize = 24;
            const shieldX = (pageWidth - shieldSize) / 2;
            try { doc.addImage(escudoBase64, 'PNG', shieldX, y, shieldSize, shieldSize); } catch (e) { }
            y += shieldSize + 4;
        } else {
            y += 10;
        }

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('ARMADA DEL ECUADOR', pageWidth / 2, y, { align: 'center' });
        y += 4.5;
        doc.text('GRUPO DE TAREA 100.51', pageWidth / 2, y, { align: 'center' });
        y += 4.5;
        doc.text('í€œSEGURIDAD MARÍTIMAí€', pageWidth / 2, y, { align: 'center' });
        y += 10;

        // --- TÍTULO PRINCIPAL ---
        doc.setFontSize(14);
        doc.text('PARTE AL INSTANTE', pageWidth / 2, y, { align: 'center' });
        y += 8;

        // --- REFERENCIA (Si se solicita) ---
        if (includeRef) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`REF: ${op.ref || 'S/N'}`, pageWidth / 2, y, { align: 'center' });
            y += 8;
        }

        // --- TÍTULO DEL ANEXO (Si no es el principal) ---
        if (title && title !== 'PARTE AL INSTANTE') {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(title, pageWidth / 2, y, { align: 'center' });
            y += 10;
        }

        return y;
    }

    currentY = drawOfficialHeader('PARTE AL INSTANTE');

    // --- METADATA SUPERIOR ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');

    // Izquierda
    doc.text('NíšMERO:', margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(op.reportNum || 'S/N', margin + 25, currentY);

    // Derecha (Precedencia)
    doc.setFont('helvetica', 'bold');
    doc.text('PRECEDENCIA:', pageWidth - margin - 35, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(op.precedencia || 'U', pageWidth - margin - 5, currentY, { align: 'right' });

    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('LUGAR:', margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(op.lugar || 'GUAYAQUIL', margin + 25, currentY);

    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('DESTINATARIO:', margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(op.destinatario || 'COOPNA', margin + 25, currentY);

    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('COPIA:', margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(op.copia || '', margin + 25, currentY);

    currentY += 12;

    // --- INTRODUCCIÓN BT. ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('BT.', margin, currentY);
    currentY += 5;

    const btText = op.btNarrative || 'CíšMPLEME INFORMAR A USTED SEí‘OR ALMIRANTE, LA NOVEDAD SUSCITADA EN LA JURISDICCIÓN DEL GT-100.51 í€œSEGURIDAD MARÍTIMAí€, SEGíšN EL SIGUIENTE DETALLE:';
    const btLines = doc.splitTextToSize(btText, contentWidth);
    doc.text(btLines, margin, currentY);
    currentY += (btLines.length * 5) + 5;

    // --- TABLA PRINCIPAL DE CONTENIDO ---
    const mainTableBody = [
        [
            { content: 'REF.', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.ref || 'S/N', styles: { fontStyle: 'bold' } }
        ],
        [
            {
                content: stripHtmlForPDF(op.resultadosRich || 'SIN RESULTADOS DETALLADOS'),
                colSpan: 2,
                styles: { minHeight: 40, cellPadding: 5 }
            }
        ],
        [
            { content: 'QUIí‰N:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.quien || 'EL GT-100.51 í€œSEGURIDAD MARÍTIMAí€' }
        ],
        [
            { content: 'PATRULLA INVOLUCRADA:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.patrulla || 'S/N' }
        ],
        [
            { content: 'CÓMO:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.como || '---' }
        ],
        [
            { content: 'CUíNDO:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.date || '---' }
        ],
        [
            { content: 'DÓNDE:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: `PROVINCIA: ${op.dondeManual || 'GUAYAS'}\nCOORDENADAS: ${op.lat && op.lng ? `LAT: ${op.lat.toFixed(6)} LONG: ${op.lng.toFixed(6)}` : 'S/N'}` }
        ],
        [
            { content: 'ACCIONES TOMADAS:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.acciones || '---' }
        ]
    ];

    doc.autoTable({
        startY: currentY,
        body: mainTableBody,
        theme: 'grid',
        styles: {
            fontSize: 9,
            cellPadding: 4,
            lineColor: [0, 0, 0],
            lineWidth: 0.25,
            valign: 'middle',
            textColor: 0
        },
        columnStyles: {
            0: { cellWidth: 45 },
            1: { cellWidth: contentWidth - 45 }
        },
        margin: { left: margin, right: margin },
        didDrawPage: function (data) {
            // Clasificación en páginas subsecuentes
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(190, 30, 45);
            doc.text('SECRETO', pageWidth / 2, 15, { align: 'center' });
            doc.setTextColor(0, 0, 0);
        }
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('BT.', margin, currentY);
    currentY += 15;

    // --- BLOQUE DE FIRMAS (Fidelidad total al documento de referencia) ---
    if (currentY > 230) { doc.addPage(); currentY = 30; }

    const centerX = pageWidth / 2;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Atentamente,', margin, currentY);
    currentY += 15;

    // Linea 1: Por [Nombre]
    doc.setFont('helvetica', 'bolditalic');
    doc.text('Por ', margin, currentY);
    const porWidth = doc.getTextWidth('Por ');
    doc.setFont('helvetica', 'normal');
    doc.text(op.firmanteNombre || 'FIDEL ERAZO JíCOME', margin + porWidth, currentY);
    currentY += 4.5;

    // Linea 2: Grado
    doc.setFont('helvetica', 'normal');
    doc.text(op.firmanteGrado || 'CAPITíN DE NAVÍO - EMC', margin, currentY);
    currentY += 4.5;

    // Linea 3: Cargo (Negrita)
    doc.setFont('helvetica', 'bold');
    doc.text(op.firmanteCargo || 'COMANDANTE DEL GRUPO DE TAREA 100.51 í€œSEGURIDAD MARÍTIMAí€', margin, currentY);
    currentY += 4.5;

    // Linea 4: Elaborador (Nombre í€” Cargo) en una sola línea
    doc.setFont('helvetica', 'normal');
    const authorLine = `${op.autorNombre || 'TNFG-SU STACEY PABLO'} í€” ${op.autorCargo || 'ODG PUESTO DE MANDO GT 100.51'}`;
    doc.text(authorLine, margin, currentY);
    currentY += 10;

    // --- ANEXOS (Summary in Main Body) ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ANEXOS: ', margin, currentY);
    const anexosLabelWidth = doc.getTextWidth('ANEXOS: ');
    doc.text('A: LISTADO DE PERSONAL', margin + anexosLabelWidth, currentY);
    currentY += 4.5;
    doc.text('B: REGISTRO FOTOGRÁFICO', margin + anexosLabelWidth, currentY);
    currentY += 10;

    // --- ANEXO A: PERSONAL (Using standardized function) ---
    if (op.annexBPersonnel && op.annexBPersonnel.length > 0) {
        addPersonnelAnnex(doc, pageWidth, null, null, 8, op.annexBPersonnel, "PARTE AL INSTANTE");
    }

    // --- ANEXO B: FOTOS ---
    if (op.photos && op.photos.length > 0) {
        doc.addPage();
        // Reutilizar lógica de encabezado de ORDPAT o la interna
        const drawAnnexBHeader = () => {
            let y = 15;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(190, 30, 45);
            doc.text('SECRETO', pageWidth / 2, y, { align: 'center' });
            y += 8;
            if (escudoBase64) {
                const shieldSize = 22;
                doc.addImage(escudoBase64, 'PNG', (pageWidth - shieldSize) / 2, y, shieldSize, shieldSize);
                y += shieldSize + 2;
            }
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            doc.text('ARMADA DEL ECUADOR', pageWidth / 2, y, { align: 'center' });
            y += 4;
            doc.text('GRUPO DE TAREA 100.51', pageWidth / 2, y, { align: 'center' });
            y += 4;
            doc.text('í€œSEGURIDAD MARÍTIMAí€', pageWidth / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(14);
            doc.text('PARTE AL INSTANTE', pageWidth / 2, y, { align: 'center' });
            y += 8;
            return y;
        };

        let photoY = drawAnnexBHeader();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('ANEXO B (REGISTRO FOTOGRÁFICO)', pageWidth / 2, photoY, { align: 'center' });
        photoY += 10;

        const imgWidth = 80;
        const imgHeight = 60;
        op.photos.forEach((imgData, idx) => {
            if (photoY + imgHeight > 270) {
                doc.addPage();
                photoY = 20;
            }
            try {
                const xPos = idx % 2 === 0 ? margin : margin + imgWidth + 10;
                doc.addImage(imgData, 'JPEG', xPos, photoY, imgWidth, imgHeight);
                if (idx % 2 !== 0) photoY += imgHeight + 10;
            } catch (e) {
                console.error("Error adding photo to PDF:", e);
            }
        });
    }
}

function exportOpsInstantToPDF() {
    if (instantOps.length > 0) {
        exportInstantOpsArchiveToPDF();
        return;
    }

    const op = getCurrentInstantOpFormData();
    if (!op.reportNum) {
        const now = new Date();
        const day = now.getDate().toString().padStart(2, '0');
        const month = now.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
        const year = now.getFullYear();
        const hour = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        op.reportNum = `CGT. 100.51-CDO-${day}${hour}${min}R-${month}-${year}-R.`;
        document.getElementById('ioReportNum').value = op.reportNum;
    }

    if (!op.date) {
        op.date = getCurrentOfficialDTG();
        const ioDateInput = document.getElementById('ioDate');
        if (ioDateInput) ioDateInput.value = op.date;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    buildParteAlInstantePDF(doc, op);
    doc.save(`Parte_Al_Instante_${op.reportNum.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`);
}

function exportInstantOpsArchiveToPDF() {
    if (instantOps.length === 0) {
        showNotification('No hay partes guardados para exportar.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 16;
    const pageWidth = 210;
    const title = 'ARCHIVO DE PARTES AL INSTANTE';
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(title, pageWidth / 2, margin, { align: 'center' });

    const rows = instantOps.map(op => [
        op.reportNum || 'S/N',
        op.ref || '---',
        op.donde || '---',
        op.date || '---',
        op.patrulla || '---',
        stripHtmlForPDF(op.resultadosRich || '').replace(/\s+/g, ' ').substring(0, 120)
    ]);

    if (doc.autoTable) {
        doc.autoTable({
            head: [[
                'Ní° Reporte', 'REF', 'DÓNDE', 'CUíNDO', 'PATRULLA', 'RESULTADOS'
            ]],
            body: rows,
            startY: margin + 10,
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [44, 62, 80], textColor: 255 },
            columnStyles: {
                0: { cellWidth: 32 },
                1: { cellWidth: 28 },
                2: { cellWidth: 35 },
                3: { cellWidth: 25 },
                4: { cellWidth: 25 },
                5: { cellWidth: 45 }
            },
            margin: { left: margin, right: margin }
        });
    } else {
        doc.setFontSize(9);
        let y = margin + 12;
        rows.forEach(row => {
            doc.text(row.join(' | '), margin, y);
            y += 6;
            if (y > 280) { doc.addPage(); y = margin; }
        });
    }

    doc.save(`Archivo_Partes_Instante_${new Date().toISOString().split('T')[0]}.pdf`);
}

function showNotification(msg) {
    const toast = document.getElementById('notification');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function handleKMZUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    showNotification(`Importando ${file.name}...`);

    const reader = new FileReader();
    reader.onload = async function (event) {
        try {
            const data = event.target.result;
            let kmlText = "";

            if (file.name.toLowerCase().endsWith('.kmz')) {
                // Descomprimir KMZ usando JSZip
                const zip = new JSZip();
                const zipContents = await zip.loadAsync(data);
                const kmlFileName = Object.keys(zipContents.files).find(f => f.toLowerCase().endsWith('.kml'));

                if (!kmlFileName) {
                    showNotification("Error: No se encontró KML dentro del KMZ");
                    return;
                }
                kmlText = await zipContents.files[kmlFileName].async("string");
            } else {
                // Leer KML como texto
                const decoder = new TextDecoder();
                kmlText = decoder.decode(data);
            }

            // Crear capa con Omnivore respetando los estilos del KML
            const customLayer = L.geoJson(null, {
                style: function (feature) {
                    const p = feature.properties || {};
                    return {
                        color: p.stroke || '#38bdf8',
                        weight: p['stroke-width'] || 2,
                        opacity: p['stroke-opacity'] || 0.8,
                        fillColor: p.fill || '#38bdf8',
                        fillOpacity: p['fill-opacity'] || 0.3
                    };
                },
                onEachFeature: function (feature, layer) {
                    if (feature.properties && feature.properties.name) {
                        layer.bindPopup(`<b>Sector:</b> ${feature.properties.name}`);
                    }
                }
            });

            const kmlLayer = omnivore.kml.parse(kmlText, null, customLayer);
            kmlLayer.addTo(map);

            kmlLayer.on('ready', function () {
                const bounds = kmlLayer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds);
                }
                if (kmzControl) {
                    kmzControl.addOverlay(kmlLayer, file.name);
                }
                showNotification(`"${file.name}" cargado con sus colores originales`);
            });

        } catch (err) {
            console.error("KMZ Processing Error:", err);
            showNotification("Error al procesar el archivo geográfico");
        }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

// Extensión para que los marcadores desaparezcan suavemente
L.Marker.prototype.fadeOut = function (duration = 1000) {
    const self = this;
    let opacity = 1;
    const interval = 50;
    const step = interval / duration;

    const timer = setInterval(() => {
        opacity -= step;
        if (opacity < 0) opacity = 0;

        if (typeof self.setOpacity === 'function') {
            self.setOpacity(opacity);
        } else if (typeof self.setStyle === 'function') {
            self.setStyle({ opacity, fillOpacity: opacity });
        }

        if (opacity <= 0) {
            clearInterval(timer);
            map.removeLayer(self);
        }
    }, interval);
};

L.CircleMarker.prototype.fadeOut = L.Marker.prototype.fadeOut;

function dividePersonnelIntoGroups() {
    if (personnel.length === 0) {
        showNotification('No hay registros de personal para dividir.');
        return;
    }

    // Solo considerar a los operativos para la división de guardias (excluyendo otras funciones especiales)
    const operativos = personnel.filter(p => !isDesignatedOtherFunction(p.funcion) && (!p.condition || p.condition === 'OPERATIVO'));

    if (operativos.length === 0) {
        showNotification('No hay personal operativo disponible para la división.');
        return;
    }

    // Crear copia y ordenar para la división equitativa por jerarquía
    const sortedPersonnel = [...operativos].sort((a, b) => {
        const hierarchy = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
        return hierarchy.indexOf(a.grade) - hierarchy.indexOf(b.grade);
    });

    // 1. División General / Babor-Estribor (CODESC y otros 2x2)
    baborPersonnel = [];
    estriborPersonnel = [];

    sortedPersonnel.forEach((person, index) => {
        if (index % 2 === 0) {
            baborPersonnel.push(person);
        } else {
            estriborPersonnel.push(person);
        }
    });

    saveAppState('baborPersonnel', JSON.stringify(baborPersonnel));
    saveAppState('estriborPersonnel', JSON.stringify(estriborPersonnel));

    // 2. División Dinámica de las unidades 21/7 (como UT 100.61.4 y UT 100.61.5 / CODESC y GT ECHO) en GRUPO 1, GRUPO 2, GRUPO 3, GRUPO 4
    const target21_7Units = ['CODESC_NORTE', 'CODESC_SUR', 'UT_100.61.4', 'UT_100.61.5', 'GT_ECHO', 'CODESC'];

    target21_7Units.forEach(unitId => {
        // Filtrar personal operativo de esta unidad específica
        const unitPers = sortedPersonnel.filter(p => window.resolveOrgUnitId(p.grupoDestino) === unitId);

        // Agrupar por grado para asegurar un balance perfecto por jerarquía
        const personnelByGrade = {};
        const hierarchy = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];

        hierarchy.forEach(g => personnelByGrade[g] = []);
        unitPers.forEach(p => {
            const gradeKey = hierarchy.includes(p.grade) ? p.grade : "MARO";
            personnelByGrade[gradeKey].push(p);
        });

        // Distribuir equitativamente usando round-robin en cada grado
        let currentGroupIndex = 0;
        hierarchy.forEach(grade => {
            const list = personnelByGrade[grade];
            list.forEach(p => {
                const grpNum = (currentGroupIndex % 4) + 1;
                const groupName = `GRUPO ${grpNum}`;

                // Buscar y actualizar en la lista principal de personal
                const idx = personnel.findIndex(x => String(x.id) === String(p.id) || String(x.idNum) === String(p.idNum));
                if (idx !== -1) {
                    personnel[idx].rotacion = groupName;
                }

                currentGroupIndex++;
            });
        });
    });

    // Guardar el estado general de personnel
    saveAppState('gyepersonal', JSON.stringify(personnel));
}

function setWatchDivisionInterfaceMessage(message) {
    const messageContainer = document.getElementById('watchDivisionMessage');
    const messageText = document.getElementById('watchDivisionMessageText');
    if (!messageContainer || !messageText) return;
    if (!message) {
        messageContainer.style.display = 'none';
        messageText.textContent = '';
        return;
    }
    messageText.textContent = message;
    messageContainer.style.display = 'block';
}

function handleSelectGroupClick(group) {
    if (personnel.length === 0) {
        setWatchDivisionInterfaceMessage('Debe cargar el listado de personal antes de seleccionar un grupo.');
        showNotification('Debe cargar el listado de personal antes de seleccionar un grupo.');
        return;
    }

    if (baborPersonnel.length === 0 && estriborPersonnel.length === 0) {
        setWatchDivisionInterfaceMessage('Primero debes dividir el personal antes de seleccionar un grupo.');
        showNotification('Primero debes dividir el personal antes de seleccionar un grupo.');
        return;
    }

    selectedWatchGroup = group;
    saveAppState('selectedWatchGroup', group);
    renderWatchDivision();
    updatePersonnelStats();
    setWatchDivisionInterfaceMessage('');
    showNotification(`Grupo ${group.toUpperCase()} seleccionado para distribución`);
}

function handleSelectAllGroupsClick() {
    if (personnel.length === 0) {
        setWatchDivisionInterfaceMessage('Debe cargar el listado de personal antes de seleccionar ambos grupos.');
        showNotification('Debe cargar el listado de personal antes de seleccionar ambos grupos.');
        return;
    }

    if (baborPersonnel.length === 0 && estriborPersonnel.length === 0) {
        setWatchDivisionInterfaceMessage('Primero debes dividir el personal para poder seleccionar ambos grupos.');
        showNotification('Primero debes dividir el personal para poder seleccionar ambos grupos.');
        return;
    }

    selectedWatchGroup = 'both';
    saveAppState('selectedWatchGroup', 'both');
    renderWatchDivision();
    updatePersonnelStats();
    setWatchDivisionInterfaceMessage('');
    showNotification('Ambos grupos seleccionados para distribución');
}

function handleDividePersonnelClick() {
    if (personnel.length === 0) {
        setWatchDivisionInterfaceMessage('Debe cargar el listado de personal antes de dividirlo.');
        showNotification('Debe cargar el listado de personal antes de dividirlo.');
        return;
    }

    dividePersonnelIntoGroups();
    renderWatchDivision();
    setWatchDivisionInterfaceMessage('');
    showNotification('Personal dividido equitativamente');
}

function renderWatchDivision() {
    const baborList = document.getElementById('baborList');
    const estriborList = document.getElementById('estriborList');
    if (!baborList || !estriborList) return;

    setWatchDivisionInterfaceMessage('');

    // Cargar si están vacíos
    if (personnel.length === 0) {
        baborPersonnel = [];
        estriborPersonnel = [];
    } else {
        if (baborPersonnel.length === 0 && localStorage.getItem('baborPersonnel')) {
            baborPersonnel = JSON.parse(localStorage.getItem('baborPersonnel'));
        }
        if (estriborPersonnel.length === 0 && localStorage.getItem('estriborPersonnel')) {
            estriborPersonnel = JSON.parse(localStorage.getItem('estriborPersonnel'));
        }
    }

    // Actualizar estilo del botón "Seleccionar Ambos"
    const btnBoth = document.getElementById('selectAllGroupsBtn');
    if (btnBoth) {
        if (selectedWatchGroup === 'both') {
            btnBoth.style.boxShadow = '0 0 15px var(--accent-secondary)';
            btnBoth.style.filter = 'brightness(1.2)';
            btnBoth.innerHTML = '<span class="icon">íŸ‘¥</span> Escogido (Ambos) íœ“';
        } else {
            btnBoth.style.boxShadow = 'none';
            btnBoth.style.filter = 'none';
            btnBoth.innerHTML = '<span class="icon">íŸ‘¥</span> Seleccionar Ambos';
        }
    }

    const renderGroup = (list, members, groupName) => {
        list.innerHTML = '';
        if (members.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding-top: 2rem;">No hay personal asignado. Haz clic en "Dividir Personal".</p>';
            return;
        }

        const isSelected = selectedWatchGroup === groupName || selectedWatchGroup === 'both';
        const column = list.closest('.group-column');
        const header = column.querySelector('.group-header');
        const selectBtn = header.querySelector('.select-group-btn');

        if (isSelected) {
            column.style.boxShadow = `0 0 20px ${groupName === 'babor' ? 'var(--color-robo)' : 'var(--color-sicariato)'}`;
            if (selectedWatchGroup === 'both') {
                selectBtn.textContent = 'Seleccionado íœ“';
                selectBtn.style.opacity = '0.5';
            } else {
                selectBtn.textContent = 'Seleccionado íœ“';
                selectBtn.style.opacity = '1';
            }
        } else {
            column.style.boxShadow = 'none';
            selectBtn.textContent = 'Seleccionar';
            selectBtn.style.opacity = '0.7';
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Grado</th>
                    <th>Nombres</th>
                    <th style="text-align: center;">Rotación</th>
                    <th style="text-align: center;">Cambiar</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');

        members.forEach(p => {
            const rotacionText = p.rotacion || 'N/A';
            const rotColor = { 'GRUPO 1': '#3b82f6', 'GRUPO 2': '#10b981', 'GRUPO 3': '#f59e0b', 'GRUPO 4': '#8b5cf6', 'ALFA': '#3b82f6', 'BRAVO': '#10b981', 'CHARLIE': '#f59e0b', 'DELTA': '#8b5cf6' }[rotacionText] || '#94a3b8';
            const rotBadge = rotacionText !== 'N/A'
                ? `<span style="padding:2px 6px; border-radius:6px; font-size:0.7rem; font-weight:700; color:white; background:${rotColor};">${rotacionText}</span>`
                : `<span style="color:#94a3b8; font-size:0.7rem;">N/A</span>`;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${p.grade}</td>
                <td>${p.name}</td>
                <td style="text-align: center;">${rotBadge}</td>
                <td style="text-align: center;">
                    <button class="btn-action edit" onclick="swapPersonnelGuard(${p.id})" title="Pasar al otro grupo">/button>
                </td>
            `;
            tbody.appendChild(row);
        });
        list.appendChild(table);
    };

    renderGroup(baborList, baborPersonnel, 'babor');
    renderGroup(estriborList, estriborPersonnel, 'estribor');

    // Limpiar inputs de búsqueda al renderizar para evitar inconsistencias
    const bSearch = document.getElementById('baborPersonnelSearch');
    const eSearch = document.getElementById('estriborPersonnelSearch');
    if (bSearch) bSearch.value = '';
    if (eSearch) eSearch.value = '';
}

function setupWatchSearch() {
    const baborInput = document.getElementById('baborPersonnelSearch');
    const estriborInput = document.getElementById('estriborPersonnelSearch');

    if (baborInput) {
        baborInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#baborList tbody tr');
            rows.forEach(row => {
                const name = row.cells[1].textContent.toLowerCase();
                row.style.display = name.includes(term) ? '' : 'none';
            });
        });
    }

    if (estriborInput) {
        estriborInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#estriborList tbody tr');
            rows.forEach(row => {
                const name = row.cells[1].textContent.toLowerCase();
                row.style.display = name.includes(term) ? '' : 'none';
            });
        });
    }
}

function swapPersonnelGuard(personId) {
    const id = Number(personId);
    let person = baborPersonnel.find(p => Number(p.id) === id);

    if (person) {
        // Mover de Babor a Estribor
        baborPersonnel = baborPersonnel.filter(p => Number(p.id) !== id);
        estriborPersonnel.push(person);
    } else {
        person = estriborPersonnel.find(p => Number(p.id) === id);
        if (person) {
            // Mover de Estribor a Babor
            estriborPersonnel = estriborPersonnel.filter(p => Number(p.id) !== id);
            baborPersonnel.push(person);
        }
    }
    if (person) {
        saveAppState('baborPersonnel', JSON.stringify(baborPersonnel));
        saveAppState('estriborPersonnel', JSON.stringify(estriborPersonnel));
        renderWatchDivision();
        showNotification(`${person.grade} ${person.name} movido de guardia.`);
    }
}

function addExtraFixedPost() {
    const container = document.getElementById('extraFixedPostsContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'post-item';
    div.style.gap = '10px';
    div.innerHTML = `
        <div class="post-label-group" style="flex: 1; display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" class="ios-switch mini post-active" data-post="Nuevo Puesto" checked>
            <input type="text" placeholder="Nombre Puesto" class="post-name-input" 
                oninput="this.previousElementSibling.dataset.post = this.value" 
                style="border: 1px solid var(--border); background: #fff; padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.8rem; width: 100%; font-weight: 600; color: var(--text-primary); outline: none;">
        </div>
        <input type="text" class="post-schedule" placeholder="Horario" value="" 
            style="width:95px; padding:0.4rem 0.6rem; border-radius:6px; border:1px solid var(--border); font-size:0.78rem;">
        <input type="number" class="post-quota-officers" placeholder="Ofic." value="0" min="0" title="Cantidad de Oficiales" style="width:50px; padding: 0.4rem; border: 1px solid var(--border); border-radius: 6px; text-align: center; font-size: 0.75rem; background-color: #f8fafc; font-weight: 700; color: var(--primary);">
        <input type="number" class="post-quota-crew" placeholder="Trip." value="1" min="0" title="Cantidad de Tripulantes" style="width:50px; padding: 0.4rem; border: 1px solid var(--border); border-radius: 6px; text-align: center; font-size: 0.75rem; background-color: #f8fafc; font-weight: 700; color: var(--text-muted);">
        <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:var(--danger); padding:0 5px;">&times;</button>
    `;
    container.appendChild(div);
}

async function generatePersonnelDistribution() {
    if (personnel.length === 0) {
        setDistributionInterfaceMessage('Debe cargar el listado de personal antes de generar la distribución.');
        showNotification("No hay personal registrado para distribuir.");
        return;
    }
    setDistributionInterfaceMessage('');
    if (rotationStartDate) {
        await applyEcho21_7Regime();
    }

    const normalizeText = (value) => String(value || '').trim().toUpperCase();

    const normalizeFunction = value => {
        const raw = String(value || '').trim().toUpperCase();
        const match = raw.match(/^([A-Z]+)\s*0*(\d+)$/);
        if (match) return { prefix: match[1], number: parseInt(match[2], 10) };
        return { prefix: raw, number: 0 };
    };

    const functionCompare = (a, b) => {
        const fa = normalizeFunction(a.funcion || 'A1');
        const fb = normalizeFunction(b.funcion || 'A1');
        if (fa.prefix !== fb.prefix) return fa.prefix.localeCompare(fb.prefix);
        return fa.number - fb.number;
    };

    const gradeOrder = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
    const normalizeGrade = g => String(g || '').trim().toUpperCase();

    const personnelToAssign = personnel.filter(p => {
        if (isDesignatedOtherFunction(p.funcion)) return false;
        const condition = normalizeText(p.condicion || p.condition || 'OPERATIVO');
        return condition === 'OPERATIVO' || condition === 'FRANCO';
    });

    if (personnelToAssign.length === 0) {
        setDistributionInterfaceMessage('No hay personal operativo o en franco disponible para distribuir.');
        showNotification('No hay personal para distribuir.');
        return;
    }

    // --- ASEGURAR QUE TODO EL PERSONAL TENGA GRUPO (BALANCEO AUTOMíTICO) ---
    let groupCounts = { 'GRUPO 1': 0, 'GRUPO 2': 0, 'GRUPO 3': 0, 'GRUPO 4': 0 };
    personnelToAssign.forEach(p => {
        const rot = String(p.rotacion || '').toUpperCase().trim();
        if (groupCounts[rot] !== undefined) groupCounts[rot]++;
        else if (groupCounts['ALFA'] !== undefined && rot === 'ALFA') groupCounts['GRUPO 1']++; // Alias
    });

    personnelToAssign.forEach(p => {
        let rot = String(p.rotacion || '').toUpperCase().trim();
        if (!rot || rot === 'N/A' || rot === '' || rot === 'S/N') {
            // Asignar al grupo con menos gente para balancear
            let minGroup = 'GRUPO 1';
            let minVal = Infinity;
            ['GRUPO 1', 'GRUPO 2', 'GRUPO 3', 'GRUPO 4'].forEach(g => {
                if (groupCounts[g] < minVal) {
                    minVal = groupCounts[g];
                    minGroup = g;
                }
            });
            p.rotacion = minGroup;
            groupCounts[minGroup]++;
        }
    });

    personnelToAssign.sort((a, b) => {
        const func = functionCompare(a, b);
        if (func !== 0) return func;

        const destA = normalizeText(a.grupoDestino || 'GT ECHO');
        const destB = normalizeText(b.grupoDestino || 'GT ECHO');
        if (destA !== destB) return destA.localeCompare(destB);

        const rotA = normalizeText(a.rotacion || 'N/A');
        const rotB = normalizeText(b.rotacion || 'N/A');
        if (rotA !== rotB) return rotA.localeCompare(rotB);

        let rankA = gradeOrder.indexOf(normalizeGrade(a.grade));
        let rankB = gradeOrder.indexOf(normalizeGrade(b.grade));
        if (rankA === -1) rankA = 999;
        if (rankB === -1) rankB = 999;
        if (rankA !== rankB) return rankA - rankB;

        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });

    guardAssignments = personnelToAssign.map(p => {
        const condition = normalizeText(p.condicion || p.condition || 'OPERATIVO');
        if (condition === 'FRANCO') {
            return {
                ...p,
                assignedLocation: 'DESCANDO OPERACIONAL',
                assignedShift: 'FRANQUICIA',
                assignedTime: 'N/A'
            };
        }

        const unitId = window.resolveOrgUnitId(p.grupoDestino);
        const unitObj = window.orgUnits.find(u => u.id === unitId);
        const unitName = unitObj ? unitObj.name : unitId;
        return {
            ...p,
            assignedLocation: unitName,
            assignedShift: p.rotacion || 'N/A',
            assignedTime: p.funcion || 'N/A'
        };
    });

    setDistributionInterfaceMessage('Distribución organizada por función y grupo. El menú de Distribución por Puestos permanece independiente.');
    saveData();
    renderDistributionTable();
    showNotification(`íœ… Distribución generada: ${guardAssignments.length} efectivos asignados.`);
}


function renderDistributionTable() {
    const tableBody = document.getElementById("distributionTableBody");
    const summaryGrid = document.getElementById("distributionSummaryGrid");
    if (!tableBody) return;
    tableBody.innerHTML = "";
    if (summaryGrid) summaryGrid.innerHTML = "";

    if (!personnel || personnel.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `<td colspan="10" style="text-align:center; padding: 2rem; color: #94a3b8; font-style: italic;">
            Sin personal registrado.
        </td>`;
        tableBody.appendChild(emptyRow);
        return;
    }

    const searchVal = (document.getElementById("distributionSearch")?.value || "").toLowerCase().trim();

    // 1. Agrupar personal por Unidad Destino (resueltas)
    const personnelByUnit = {};
    const activeUnitIds = window.orgUnits.filter(u => u.status === 'ACTIVE').map(u => u.id);

    personnel.forEach(p => {
        if (isDesignatedOtherFunction(p.funcion)) return; // Excluir otras funciones

        // Excluir comisiones, médicos, cursos, etc.
        const condition = String(p.condicion || p.condition || 'OPERATIVO').trim().toUpperCase();
        if (condition !== 'OPERATIVO' && condition !== 'FRANCO') return;

        // Filtrar por búsqueda si está activa
        if (searchVal) {
            const name = String(p.name || "").toLowerCase();
            const idNum = String(p.idNum || "").toLowerCase();
            const grade = String(p.grade || "").toLowerCase();
            if (!name.includes(searchVal) && !idNum.includes(searchVal) && !grade.includes(searchVal)) {
                return;
            }
        }

        const unitId = window.resolveOrgUnitId(p.grupoDestino);

        // Solo incluir si la unidad está activa
        if (activeUnitIds.includes(unitId)) {
            if (!personnelByUnit[unitId]) personnelByUnit[unitId] = [];
            personnelByUnit[unitId].push(p);
        }
    });

    // Ordenar las unidades alfabéticamente por su nombre
    const sortedUnitIds = Object.keys(personnelByUnit).sort((a, b) => {
        const uA = window.orgUnits.find(u => u.id === a);
        const uB = window.orgUnits.find(u => u.id === b);
        const nameA = uA ? uA.name : a;
        const nameB = uB ? uB.name : b;
        return nameA.localeCompare(nameB);
    });

    if (sortedUnitIds.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `<td colspan="10" style="text-align:center; padding: 2rem; color: #94a3b8; font-style: italic;">
            Sin personal operativo para distribuir.
        </td>`;
        tableBody.appendChild(emptyRow);
        return;
    }

    // 2. Iterar por cada Unidad Destino
    sortedUnitIds.forEach(unitId => {
        const unitPersonnel = personnelByUnit[unitId];
        const unitObj = window.orgUnits.find(u => u.id === unitId);
        const unitName = unitObj ? unitObj.name : (unitId === 'GT_ECHO' || unitId === 'GT ECHO' ? 'GT ECHO' : unitId);

        // ---- CARGAR ENCABEZADO DE UNIDAD EN EL GRID SUPERIOR ----
        if (summaryGrid) {
            const unitHeader = document.createElement("div");
            unitHeader.style.cssText = "grid-column: 1 / -1; margin-top: 1.5rem; margin-bottom: 0.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem;";
            unitHeader.innerHTML = `<h3 style="margin: 0; color: var(--primary); font-family: 'Outfit';">🏢 ${unitName} - Resumen Operativo (${unitPersonnel.length} PERS.)</h3>`;
            summaryGrid.appendChild(unitHeader);
        }

        // Header de Unidad en la Tabla
        const unitHeaderRow = document.createElement("tr");
        unitHeaderRow.style.backgroundColor = "var(--primary)";
        unitHeaderRow.style.color = "white";
        unitHeaderRow.innerHTML = `
            <td colspan="10" style="font-weight:900; padding:14px 20px; font-size:1.1rem; font-family:'Outfit',sans-serif; text-transform:uppercase; letter-spacing:1px; background-color: var(--primary); color: white; border-top: 3px solid #0f172a;">
                🏢 UNIDAD: ${unitName} (${unitPersonnel.length} PERS.)
            </td>
        `;
        tableBody.appendChild(unitHeaderRow);

        // Agrupar por grupo (rotación) dentro de esta unidad
        const groupedByGroup = {};
        unitPersonnel.forEach(p => {
            const groupKey = String(p.rotacion || "N/A").toUpperCase().trim();
            if (!groupedByGroup[groupKey]) groupedByGroup[groupKey] = [];
            groupedByGroup[groupKey].push(p);
        });

        // Determinar el orden de grupos para esta unidad
        let groupOrder = ["GRUPO 1", "GRUPO 2", "GRUPO 3", "GRUPO 4"];



        // Procesar cada grupo de la unidad
        groupOrder.forEach(groupName => {
            const groupMembers = groupedByGroup[groupName] || [];
            if (groupMembers.length === 0) return;

            // Determinar categorías (secciones) dinámicamente para este grupo
            let funcCategories = [];
            if (["GRUPO 1", "GRUPO 2", "GRUPO 3", "GRUPO 4"].includes(groupName)) {
                const groupLetterMap = { "GRUPO 1": "A", "GRUPO 2": "B", "GRUPO 3": "C", "GRUPO 4": "D" };
                const letter = groupLetterMap[groupName] || "A";
                funcCategories = [`${letter}1`, `${letter}2`, `${letter}3`, `${letter}4`, `${letter}5`, "REACCIÓN"];
            } else {
                const uniqueFuncs = [...new Set(groupMembers.map(p => (p.funcion || "OPERATIVO").toUpperCase().trim()))];
                funcCategories = uniqueFuncs.filter(f => f !== 'REACCIÓN' && f !== 'REACCION');
                if (uniqueFuncs.includes('REACCIÓN') || uniqueFuncs.includes('REACCION')) {
                    funcCategories.push('REACCIÓN');
                }
                if (funcCategories.length === 0) {
                    funcCategories = ["OPERATIVO"];
                }
            }

            // ---- CARGAR RESUMEN EN EL GRID SUPERIOR ----
            if (summaryGrid) {
                const counts = {};
                funcCategories.forEach(k => counts[k] = 0);

                let officersCount = 0;
                let crewCount = 0;

                groupMembers.forEach(p => {
                    let f = (p.funcion || "").toUpperCase().trim();
                    if (counts.hasOwnProperty(f)) {
                        counts[f]++;
                    } else if (counts.hasOwnProperty("REACCIÓN")) {
                        counts["REACCIÓN"]++;
                    } else if (funcCategories.length > 0) {
                        counts[funcCategories[0]]++;
                    }

                    const grade = String(p.grade || '').toUpperCase().trim();
                    const isOfficer = ['CPNV', 'CPFG', 'CPCB', 'TNNV', 'TNFG', 'ALFG', 'MAESTRO'].some(g => grade.includes(g));
                    if (isOfficer) {
                        officersCount++;
                    } else {
                        crewCount++;
                    }
                });

                const card = document.createElement("div");
                let colorGrp = "#3b82f6";
                if (groupName === "GRUPO 2" || groupName === "GOLF") colorGrp = "#10b981";
                if (groupName === "GRUPO 3") colorGrp = "#f59e0b";
                if (groupName === "GRUPO 4") colorGrp = "#8b5cf6";
                card.style.cssText = `background:white; border-radius:12px; padding:1.25rem; border:1px solid #e2e8f0; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); border-top:4px solid ${colorGrp};`;

                let gridItemsHtml = '';
                funcCategories.forEach(cat => {
                    if (cat === 'REACCIÓN') {
                        gridItemsHtml += `
                            <div style="color:#ef4444; border-top:1px solid #fee2e2; grid-column:span 2; padding-top:4px; display:flex; justify-content:space-between; margin-top:4px;">
                                <span>REACCIÓN:</span>
                                <span style="color:#b91c1c;">${counts[cat]}</span>
                            </div>
                        `;
                    } else {
                        gridItemsHtml += `<div style="color:#64748b;">${cat}: <span style="color:#1e293b;">${counts[cat]}</span></div>`;
                    }
                });

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #f1f5f9; padding-bottom:5px;">
                        <h4 style="margin:0; color:${colorGrp}; font-family:'Outfit';">${groupName}</h4>
                        <span style="background:${colorGrp}22; color:${colorGrp}; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:800;">${groupMembers.length} PERS.</span>
                    </div>
                    
                    <!-- Destacar Oficiales y Tripulantes -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; padding: 8px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.8rem; font-weight: 700;">
                        <div style="color: #475569; display: flex; justify-content: space-between;">
                            <span>👨‍✈️ Ofic:</span>
                            <span style="color: #1e40af; font-weight: 900;">${officersCount}</span>
                        </div>
                        <div style="color: #475569; display: flex; justify-content: space-between;">
                            <span>👮‍♂️ Trip:</span>
                            <span style="color: #1e40af; font-weight: 900;">${crewCount}</span>
                        </div>
                        <div style="grid-column: span 2; border-top: 1px dashed #cbd5e1; padding-top: 4px; display: flex; justify-content: space-between; color: #1e293b;">
                            <span>👥 Total:</span>
                            <span style="color: #1d4ed8; font-weight: 900;">${groupMembers.length}</span>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.8rem; font-weight:700;">
                        ${gridItemsHtml}
                    </div>
                `;
                summaryGrid.appendChild(card);
            }

            // ---- Header de sección de Grupo Principal en la Tabla ----
            const groupHeader = document.createElement("tr");
            groupHeader.classList.add("shift-header");
            groupHeader.style.background = "#eff6ff";
            let colorTextGrp = "#1e40af";
            if (groupName === "GRUPO 2" || groupName === "GOLF") colorTextGrp = "#065f46";
            if (groupName === "GRUPO 3") colorTextGrp = "#92400e";
            if (groupName === "GRUPO 4") colorTextGrp = "#5b21b6";

            groupHeader.innerHTML = `
                <td colspan="9" style="color:${colorTextGrp}; font-weight:800; padding:12px 16px; border-left:5px solid ${colorTextGrp}; font-family:'Outfit',sans-serif; letter-spacing:0.5px;">
                    LISTADO DETALLADO DEL ${groupName.toUpperCase()}
                </td>
                <td style="text-align:right; color:${colorTextGrp}; font-weight:700; font-size:0.85em; padding-right:16px;">
                    ${groupMembers.length} PERS.
                </td>
            `;
            tableBody.appendChild(groupHeader);

            // Agrupar por categorías de función
            const groupedByFunc = {};
            funcCategories.forEach(k => groupedByFunc[k] = []);

            groupMembers.forEach(p => {
                let f = (p.funcion || "OPERATIVO").toUpperCase().trim();
                if (groupedByFunc.hasOwnProperty(f)) {
                    groupedByFunc[f].push(p);
                } else if (groupedByFunc.hasOwnProperty("REACCIÓN")) {
                    groupedByFunc["REACCIÓN"].push(p);
                } else if (funcCategories.length > 0) {
                    groupedByFunc[funcCategories[0]].push(p);
                }
            });

            funcCategories.forEach(cat => {
                const members = groupedByFunc[cat] || [];
                if (members.length === 0) return;

                // Header de Categoría
                const catHeader = document.createElement("tr");
                let bgColor = "#f1f5f9";
                let textColor = "#475569";
                if (cat === "REACCIÓN") {
                    bgColor = "#fef2f2";
                    textColor = "#b91c1c";
                } else {
                    bgColor = "#f0fdfa";
                    textColor = "#0d9488";
                }

                catHeader.innerHTML = `<td colspan="10" style="background:${bgColor}; color:${textColor}; font-size:0.85em; padding:8px 25px; font-weight:800; border-bottom:1px solid #e2e8f0;"> SECCIÓN / ROL: ${cat} (${members.length} PERS.)</td>`;
                tableBody.appendChild(catHeader);

                // Ordenar por jerarquía militar
                const rankHierarchy = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
                members.sort((a, b) => {
                    let rA = rankHierarchy.indexOf(String(a.grade || '').trim().toUpperCase());
                    let rB = rankHierarchy.indexOf(String(b.grade || '').trim().toUpperCase());
                    if (rA === -1) rA = 999;
                    if (rB === -1) rB = 999;
                    return rA - rB || String(a.name || '').localeCompare(String(b.name || ''));
                });

                members.forEach(item => {
                    const destino = window.resolveOrgUnitId(item.grupoDestino);
                    const unitObj = window.orgUnits.find(u => u.id === destino);
                    const groupDestName = unitObj ? unitObj.name : destino;

                    let badgeStyle = 'background-color: #f1f5f9; color: #475569; border: 1px solid var(--border);';
                    if (destino === 'CODESC') {
                        badgeStyle = 'background-color: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8;';
                    } else if (destino === 'GT_ECHO' || destino === 'GT ECHO') {
                        badgeStyle = 'background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;';
                    } else {
                        badgeStyle = 'background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;';
                    }
                    const destinoBadge = `<span style="padding: 2px 7px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; ${badgeStyle}">${groupDestName}</span>`;

                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td style="text-align:center; font-weight:700;">${item.grade || ''}</td>
                        <td style="text-align:center; color:#64748b; font-size:0.85em;">${item.specialty || "N/A"}</td>
                        <td>${item.name || ''}</td>
                        <td style="text-align:center; font-family:monospace; color:#64748b;">${item.idNum || "S/N"}</td>
                        <td style="text-align:center; font-size:0.85em;">${item.unit || "S/N"}</td>
                        <td style="text-align:center;">${item.contact || "S/N"}</td>
                        <td style="text-align:center;">${destinoBadge}</td>
                        <td style="text-align:center; font-weight:bold; color:var(--primary);">${item.funcion || 'A1'}</td>
                        <td style="text-align:center; font-weight:700;">${item.rotacion || 'N/A'}</td>
                        <td style="text-align:center;">
                            <button class="btn-action edit" onclick="openEditDistributionModal(${item.id})" title="Editar Asignación">✏️</button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            });
        });
    });

    updatePersonnelStats();
}


function openEditDistributionModal(personId) {
    let person = personnel.find(p => String(p.id) === String(personId));
    if (!person) return;

    document.getElementById('editDistId').value = person.id;
    document.getElementById('editDistName').textContent = `${person.grade} ${person.name}`;

    // Set current values
    const groupSelect = document.getElementById('editDistGroup');
    const funcSelect = document.getElementById('editDistFunction');

    if (groupSelect) groupSelect.value = person.rotacion || person.group || 'GRUPO 1';
    if (funcSelect) funcSelect.value = person.funcion || person.function || 'A1';

    document.getElementById('editDistModal').classList.add('active');
}

function handleManualAssignmentSave(e) {
    e.preventDefault();
    const id = document.getElementById('editDistId').value;
    const newGroup = document.getElementById('editDistGroup').value;
    const newFunction = document.getElementById('editDistFunction').value;

    let updated = false;

    // 1. Actualizar en el array maestro de personal (Persistencia total)
    const personIdx = personnel.findIndex(p => String(p.id) === String(id));
    if (personIdx !== -1) {
        personnel[personIdx].rotacion = newGroup;
        personnel[personIdx].group = newGroup;
        personnel[personIdx].funcion = newFunction;
        personnel[personIdx].function = newFunction;

        // Si la función es FRANCO o OPERATIVO, actualizamos la condición también
        if (newFunction === 'FRANCO') {
            personnel[personIdx].condicion = 'FRANCO';
        } else if (newFunction === 'OPERATIVO') {
            personnel[personIdx].condicion = 'OPERATIVO';
        } else if (newFunction === 'PM') {
            personnel[personIdx].condicion = 'OPERATIVO';
            // Agregar al Puesto de Mando (PM)
            const person = personnel[personIdx];
            if (typeof commandPostPersonnel !== 'undefined' && commandPostPersonnel) {
                const exists = commandPostPersonnel.find(pm => pm.idNum === person.idNum);
                if (!exists) {
                    commandPostPersonnel.push({
                        id: Date.now(),
                        grade: person.grade,
                        specialty: person.specialty,
                        name: person.name,
                        idNum: person.idNum,
                        condition: person.condition || 'OPERATIVO',
                        unit: person.unit,
                        contact: person.contact || 'S/N',
                        grupoDestino: person.grupoDestino || 'GT_ECHO',
                        duty: 'PERSONAL PM',
                        grupo: newGroup || 'GRUPO 1'
                    });
                }
            }
        }

        updated = true;
    }

    // 2. Sincronizar con la distribución actual (si existe)
    if (lastDistributionConfig && lastDistributionConfig.fixed) {
        const allPosts = [...(lastDistributionConfig.fixed || []), ...(lastDistributionConfig.support || [])];
        for (const post of allPosts) {
            const p = post.assigned.find(a => String(a.id) === String(id));
            if (p) {
                p.rotacion = newGroup;
                p.group = newGroup;
                p.funcion = newFunction;
                p.function = newFunction;
            }
        }
    }

    // Sincronizar en arrays clásicos
    [...specialAssignments, ...guardAssignments].forEach(p => {
        if (String(p.id) === String(id)) {
            p.rotacion = newGroup;
            p.group = newGroup;
            p.funcion = newFunction;
            p.function = newFunction;
        }
    });

    if (updated) {
        saveData();
        document.getElementById('editDistModal').classList.remove('active');

        renderPersonnelTable();
        if (typeof renderCommandPostTable === 'function') renderCommandPostTable();
        if (typeof populateCommandPostSelectors === 'function') populateCommandPostSelectors();
        if (typeof populateORDPATSelectors === 'function') populateORDPATSelectors();
        if (typeof renderDistributionTable === 'function') renderDistributionTable();
        if (typeof renderPostDistResults === 'function') renderPostDistResults(lastDistributionConfig);

        updatePersonnelStats();
        showNotification("Datos de personal actualizados y asignados al Puesto de Mando");
    }
}
function activateNewDay() {
    const confirmMsg = `ííESTí SEGURO DE INICIAR UNA NUEVA OPERACIÓN?\n\nEsta acción:\n1. Reiniciará la lista de división de guardias (Babor/Estribor).\n2. Limpiará la tabla de distribución de personal.\n3. Limpiará la planificación operativa de esta misión.\n\n* El historial de inteligencia (MAPA DE CALOR) y los Partes al Instante SE MANTENDRíN intactos.`;

    if (confirm(confirmMsg)) {
        const name = prompt("Ingrese el nombre de la NUEVA OPERACIÓN (Ej: TORMENTA, ESCUDO):", "");

        if (name) {
            operationName = name.toUpperCase();

            // Reiniciar datos operacionales específicos de la misión
            guardAssignments = [];
            specialAssignments = [];
            opsEvents = [];
            baborPersonnel = [];
            estriborPersonnel = [];
            selectedWatchGroup = null;

            // Limpiar localStorage de estos datos específicos
            localStorage.removeItem('baborPersonnel');
            localStorage.removeItem('estriborPersonnel');
            localStorage.removeItem('selectedWatchGroup');

            // Guardar nueva misión y resetear los demás
            saveAppState('operationName', operationName);
            saveData();

            // Actualizar UI
            updateUI();
            updatePersonnelStats();
            renderPersonnelTable();
            renderOpsPlanningTable();
            if (typeof renderWatchDivision === 'function') renderWatchDivision();
            if (typeof renderDistributionTable === 'function') renderDistributionTable();
            if (typeof generatePersonnelDistribution === 'function') generatePersonnelDistribution();

            // Notificar y mover a vista de personal
            showNotification(`Operación ${operationName} activada con éxito.`);
            const personalBtn = document.querySelector('.menu-btn[data-target="personal"]');
            if (personalBtn) personalBtn.click();
        }
    }
}

function renderHistoricalPatrolTable() {
    const tableBody = document.getElementById('historicalPatrolBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Filtrar solo óÓÓrdenes cerradas para el historial
    const closedOrders = patrolOrders.filter(op => op.status === 'cerrada');

    closedOrders.forEach(order => {
        const fullId = order.displayId || `${order.prefix || ''}${order.dtg || ''}-${order.serial || ''}-S`;
        const creationDate = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : (order.dtg || '---');
        const closeDate = order.closeDate || (order.status === 'cerrada' ? 'REG. ANTIGUO' : '---');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 700; color: var(--text-main);">${fullId}</td>
            <td>${creationDate}</td>
            <td>${closeDate}</td>
            <td><span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; border: 1px solid rgba(34, 197, 94, 0.2);">cerrada</span></td>
            <td class="table-actions" style="display: flex; gap: 8px; justify-content: center;">
                <button onclick="viewCompliancePDF('${order.id}')" class="btn-action edit" title="Ver Cumplimiento" style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; cursor: pointer; color: #000;"><i class="fa-solid fa-eye"></i></button>
                <button onclick="window.generateORDPATPDF('${order.id}')" class="btn-action delete" title="Ver Orden Original" style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; cursor: pointer;"><i class="fa-solid fa-file-pdf"></i></button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- LÓGICA DE VEHÍCULOS (LOGÍSTICA) ---

function handleVehicleSubmit(e) {
    e.preventDefault();
    const plate = document.getElementById('vPlate').value.toUpperCase();
    const type = document.getElementById('vType').value;
    const brand = document.getElementById('vBrand').value;
    const km = parseFloat(document.getElementById('vKM').value);
    const lastMaint = parseFloat(document.getElementById('vLastMaintKM').value);

    // Validar si ya existe (para editar o evitar duplicados)
    const existingIndex = vehicles.findIndex(v => v.plate === plate);

    const submitBtn = document.getElementById('submitVehicleBtn');
    const isEditing = submitBtn.dataset.mode === 'edit';

    if (existingIndex !== -1) {
        // Si estamos en modo edición o el usuario confirma, actualizamos
        if (isEditing || confirm(`El vehículo con placa ${plate} ya existe. ¿Deseas actualizar sus datos?`)) {
            const availableEl = document.getElementById('vAvailable');
            const available = availableEl ? availableEl.checked : (vehicles[existingIndex].available !== undefined ? vehicles[existingIndex].available : true);
            vehicles[existingIndex] = { ...vehicles[existingIndex], type, brand, km, lastMaint, available };
            showNotification(`Vehículo ${plate} actualizado.`);
        } else return;
    } else {
        const availableEl = document.getElementById('vAvailable');
        const available = availableEl ? availableEl.checked : true;
        vehicles.push({
            id: Date.now(),
            plate,
            type,
            brand,
            km,
            lastMaint,
            available,
            history: [] // Para futuro tracking de rutas
        });
        showNotification(`Vehículo ${plate} registrado con éxito.`);
    }

    saveData();
    renderVehiclesTable();
    e.target.reset();

    // Restaurar el botón a su estado original
    submitBtn.textContent = 'Registrar Vehículo';
    submitBtn.style.backgroundColor = '';
    submitBtn.dataset.mode = 'add';
}

function toggleVehicleAvailability(plate) {
    const v = vehicles.find(veh => veh.plate === plate);
    if (v) {
        v.available = !v.available;
        saveData();
        renderVehiclesTable();
        showNotification(`Estado de ${plate} actualizado.`);
    }
}

function editVehicle(plate) {
    const v = vehicles.find(veh => veh.plate === plate);
    if (!v) return;

    // Poblar el formulario
    document.getElementById('vPlate').value = v.plate;
    document.getElementById('vType').value = v.type;
    document.getElementById('vBrand').value = v.brand;
    document.getElementById('vKM').value = v.km;
    document.getElementById('vLastMaintKM').value = v.lastMaint;
    const availableEl = document.getElementById('vAvailable');
    if (availableEl) availableEl.checked = v.available;

    // Cambiar texto del botón para indicar edición
    const submitBtn = document.getElementById('submitVehicleBtn');
    submitBtn.textContent = 'Actualizar Datos del Vehículo';
    submitBtn.style.backgroundColor = '#f59e0b'; // Color naranja para distinguir
    submitBtn.dataset.mode = 'edit';

    // Hacer scroll al formulario
    const formContainer = document.getElementById('vehicleForm');
    if (formContainer) {
        formContainer.scrollIntoView({ behavior: 'smooth' });
    }
}

function renderVehiclesTable() {
    const tbody = document.getElementById('tableBodyVehicles');
    if (!tbody) return;
    tbody.innerHTML = '';

    vehicles.forEach(v => {
        const recorrido = v.km - v.lastMaint;
        let statusClass = 'status-ok';
        let statusText = 'Mantenimiento al día';

        if (recorrido >= 5000) {
            statusClass = 'status-danger';
            statusText = 'MANTENIMIENTO REQUERIDO';
        } else if (recorrido >= 4000) {
            statusClass = 'status-warning';
            statusText = 'Próximo mantenimiento';
        }

        const availClass = v.available ? 'status-ok' : 'status-danger';
        const availText = v.available ? 'DISPONIBLE' : 'NO DISPONIBLE';

        const row = document.createElement('tr');
        if (statusClass === 'status-danger') {
            row.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        }

        row.innerHTML = `
            <td style="font-weight: 700;">${v.plate}</td>
            <td>${v.type}</td>
            <td>${v.brand}</td>
            <td class="km-value">${v.km.toLocaleString()} KM</td>
            <td class="km-value">${v.lastMaint.toLocaleString()} KM</td>
            <td class="recorrido-value">${recorrido.toLocaleString()} KM</td>
            <td>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <input type="checkbox" ${v.available ? 'checked' : ''} onchange="toggleVehicleAvailability('${v.plate}')" style="width: 18px; height: 18px; cursor: pointer;">
                    <span class="status-pill ${availClass}" style="min-width: 70px; font-size: 0.6rem;">${availText}</span>
                </div>
            </td>
            <td><span class="status-pill ${statusClass}">${statusText}</span></td>
            <td class="table-actions">
                <button class="btn-action edit" onclick="editVehicle('${v.plate}')" title="Modificar Datos Vehículo" style="background: rgba(59, 130, 246, 0.1); color: #2563eb;"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-action edit" onclick="updateVehicleMileage('${v.plate}')" title="Actualizar Kilometraje" style="background: rgba(245, 158, 11, 0.1); color: #d97706;"><i class="fa-solid fa-gauge"></i></button>
                <button class="btn-action" onclick="recordVehicleMaintenance('${v.plate}')" title="Registrar Mantenimiento Realizado" style="background: rgba(16, 185, 129, 0.1); color: #059669;"><i class="fa-solid fa-screwdriver-wrench"></i></button>
                <button class="btn-action delete" onclick="deleteVehicle('${v.plate}')" title="Eliminar Vehículo" style="background: rgba(239, 68, 68, 0.1); color: #dc2626;"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateVehicleMileage(plate) {
    const v = vehicles.find(veh => veh.plate === plate);
    if (!v) return;

    const newKM = prompt(`Ingrese el nuevo kilometraje para ${plate} (KM actual: ${v.km}):`, v.km);
    if (newKM !== null && !isNaN(newKM)) {
        const parsedKM = parseFloat(newKM);
        if (parsedKM < v.km) {
            alert('El nuevo kilometraje no puede ser menor al actual.');
            return;
        }
        v.km = parsedKM;
        saveData();
        renderVehiclesTable();
        showNotification(`Kilometraje de ${plate} actualizado.`);
    }
}

function recordVehicleMaintenance(plate) {
    const v = vehicles.find(veh => veh.plate === plate);
    if (!v) return;

    if (confirm(`ííConfirma que se ha realizado el mantenimiento de los 5000 KM para el vehículo ${plate}?\nSe reseteará el kilometraje de referencia a ${v.km} KM.`)) {
        v.lastMaint = v.km;
        saveData();
        renderVehiclesTable();
        showNotification(`Mantenimiento registrado para ${plate}. Próximo a los ${(v.km + 5000).toLocaleString()} KM.`);
    }
}

function deleteVehicle(plate) {
    if (confirm(`ííEstá seguro de eliminar el vehículo ${plate}?`)) {
        vehicles = vehicles.filter(v => v.plate !== plate);
        saveData();
        renderVehiclesTable();
        showNotification(`Vehículo ${plate} eliminado.`);
    }
}

function exportVehiclesToExcel() {
    if (vehicles.length === 0) {
        showNotification("No hay vehículos para exportar.");
        return;
    }

    let csv = "Placa,Tipo,Marca/Modelo,Kilometraje Actual,Ultimo Mantenimiento,Recorrido desde Maint,Estado\n";
    vehicles.forEach(v => {
        const recorrido = v.km - v.lastMaint;
        let status = "OK";
        if (recorrido >= 5000) status = "MANTENIMIENTO REQUERIDO";
        else if (recorrido >= 4000) status = "PREVENTIVO";

        csv += `"${v.plate}","${v.type}","${v.brand}",${v.km},${v.lastMaint},${recorrido},"${status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_vehiculos_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}





// --- LÓGICA DE ÓRDENES DE PATRULLA (ORDPAT-GT 100.51) ---

function handleORDPATSubmit(e) {
    e.preventDefault();

    // Recolectar tareas
    const tareas = [];
    document.querySelectorAll('#opTareasProgBody tr').forEach(row => {
        const sigla = row.querySelector('.row-sigla').value;
        const tarea = row.querySelector('.row-tarea').value;
        const distrito = row.querySelector('.row-distrito').value;
        if (sigla || tarea) {
            tareas.push({ sigla, tarea, distrito });
        }
    });

    const orgElem = [];
    document.querySelectorAll('#opOrgElementsBody tr').forEach(row => {
        const sigla = row.querySelector('.org-sigla').value;
        const nombre = row.querySelector('.org-nomi').value;
        const personal = row.querySelector('.org-pers').value;
        if (sigla || nombre) {
            orgElem.push({ sigla, nombre, personal });
        }
    });

    const selectedShift = document.getElementById('opShiftSelector')?.value || null;
    const selectedPost = document.getElementById('opPostSelector')?.value || null;
    const snapshot = getPersonnelSnapshot(selectedPost, selectedShift);

    const newORDPAT = {
        id: 'ordpat_' + Date.now(),
        displayId: `${document.getElementById('opPrefix')?.value || ''}${document.getElementById('opDTGAuto')?.value || ''}-${document.getElementById('opSequence')?.value || ''}-S`,
        personnelSnapshot: snapshot,
        prefix: document.getElementById('opPrefix')?.value || 'ARE-ORDPAT-UT100.51.4-',
        dtg: document.getElementById('opDTGAuto')?.value || '---',
        serial: document.getElementById('opSequence')?.value || '001',
        headerText: document.getElementById('opHeaderText')?.value || '',
        referencias: (() => {
            const refs = [];
            document.querySelectorAll('#opRefsBody tr').forEach((row, idx) => {
                const text = row.querySelector('.row-ref-text')?.value;
                if (text) refs.push({ label: String.fromCharCode(97 + idx) + ')', text: text });
            });
            return refs;
        })(),
        orgComando: document.getElementById('opOrgComando')?.value || '',
        orgElementos: orgElem,
        huso: document.getElementById('opHuso')?.value || 'ROMEO',
        dtgInicio: document.getElementById('opDTGInicio')?.value || '',
        dtgTermino: document.getElementById('opDTGTermino')?.value || '',
        situacionMain: document.getElementById('opSituacionMain')?.value || '',
        amenaza: document.getElementById('opSituacionAmenaza')?.value || '',
        propias: document.getElementById('opSituacionPropias')?.value || '',
        misionA: document.getElementById('opMisionA')?.value || '',
        misionB: document.getElementById('opMisionB')?.value || '',
        intencion: document.getElementById('opIntencion')?.value || '',
        concepto: document.getElementById('opConcepto')?.value || '',
        tareasText: document.getElementById('opTareasText')?.value || '',
        conducta: document.getElementById('opConducta')?.value || '',
        coordinacion: document.getElementById('opCoordinacion')?.value || '',
        logistica: document.getElementById('opLogAbastecimiento')?.value || '',
        logEvacuacion: document.getElementById('opLogEvacuacion')?.value || '',
        logPersonal: document.getElementById('opLogPersonal')?.value || '',
        mando: document.getElementById('opMando')?.value || '',
        comunicaciones: document.getElementById('opComunicaciones')?.value || '',
        firmanteNombre: document.getElementById('opFirmanteNombre')?.value || '',
        firmanteGrado: document.getElementById('opFirmanteGrado')?.value || '',
        firmanteCargo: document.getElementById('opFirmanteCargo')?.value || '',
        autorNombre: document.getElementById('opAutorNombre')?.value || '',
        autorCargo: document.getElementById('opAutorCargo')?.value || '',
        sumilla: document.getElementById('opSumilla')?.value || '',
        lugar: document.getElementById('opLugar')?.value || 'GUAYAQUIL',
        precedencia: document.getElementById('opPrecedencia')?.value || 'R',
        destinatario: document.getElementById('opDestinatario')?.value || '',
        copia: document.getElementById('opCopia')?.value || '',
        timestamp: new Date().toISOString()
    };

    patrolOrders.push(newORDPAT);
    saveData();
    renderORDPATTable();
    window.populateOrderReferences(); // Actualizar desplegables
    e.target.reset();
    if (document.getElementById('opTareasProgBody')) document.getElementById('opTareasProgBody').innerHTML = '';
    if (document.getElementById('opOrgElementsBody')) document.getElementById('opOrgElementsBody').innerHTML = '';
    document.getElementById('opRefsBody').innerHTML = `
        <tr>
            <td style="border: 1px solid var(--border); padding: 5px; width: 30px; text-align: center; color: var(--text-muted); font-family: monospace;">a)</td>
            <td style="border: 1px solid var(--border); padding: 0;"><input type="text" class="row-ref-text" style="width: 100%; background: transparent; border: none; color: var(--primary); padding: 8px;"></td>
            <td style="border: 1px solid var(--border); padding: 5px; text-align: center; width: 50px;"><button type="button" class="btn-remove-row">í—</button></td>
        </tr>
    `;
    showNotification(`Orden de Patrulla guardada con éxito`);

    // Mostrar el PDF inmediatamente
    generateORDPATPDF(newORDPAT.id);

    // Auto-preparar la siguiente orden con los mismos datos base
    setTimeout(() => prefillORDPATFormWithLast(), 500);
}

function prefillORDPATFormWithLast() {
    if (patrolOrders.length === 0) return;
    const last = patrolOrders[patrolOrders.length - 1];

    // Campos básicos
    const fields = {
        'opDTGAuto': last.dtg,
        'opSequence': (parseInt(last.serial) + 1).toString().padStart(3, '0'),
        'opHeaderText': last.headerText,
        'opOrgComando': last.orgComando,
        'opSituacionMain': last.situacionMain,
        'opSituacionAmenaza': last.amenaza,
        'opMision': last.mision,
        'opConcepto': last.concepto,
        'opTareasText': last.tareasText || '',
        'opConducta': last.conducta,
        'opCoordinacion': last.coordinacion,
        'opLogistica': last.logistica,
        'opMando': last.mando,
        'opETNombre': last.etNombre,
        'opETCargo': last.etCargo,
        'opFirmanteNombre': last.firmanteNombre,
        'opFirmanteGrado': last.firmanteGrado,
        'opFirmanteCargo': last.firmanteCargo,
        'opFirmanteSecundario': last.firmanteSecundario,
        'opSumilla': last.sumilla
    };

    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    }

    // Referencias
    const refsBody = document.getElementById('opRefsBody');
    if (refsBody) {
        refsBody.innerHTML = '';
        (last.referencias || []).forEach((ref, idx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="border: 1px solid var(--border); padding: 5px; width: 30px; text-align: center;">${ref.label}</td>
                <td><input type="text" class="row-ref-text" style="width: 100%; background: transparent; border: none; color: var(--text-main); padding: 8px;" value="${ref.text}"></td>
                <td><button type="button" class="btn-remove-row">í—</button></td>
            `;
            refsBody.appendChild(row);
        });
    }

    // Elementos de Organización
    const orgBody = document.getElementById('opOrgElementsBody');
    if (orgBody) {
        orgBody.innerHTML = '';
        (last.orgElementos || []).forEach(el => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="text" class="org-sigla" value="${el.sigla}"></td>
                <td><input type="text" class="org-nomi" value="${el.nombre}"></td>
                <td><input type="text" class="org-pers" value="${el.personal}"></td>
                <td><button type="button" class="btn-remove-row">í—</button></td>
            `;
            orgBody.appendChild(row);
        });
    }

    // Tareas
    const tareasBody = document.getElementById('opTareasProgBody');
    if (tareasBody) {
        tareasBody.innerHTML = '';
        (last.tareas || []).forEach(t => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="text" class="row-sigla" value="${t.sigla}"></td>
                <td><input type="text" class="row-tarea" value="${t.tarea}"></td>
                <td><input type="text" class="row-distrito" value="${t.distrito}"></td>
                <td><button type="button" class="btn-remove-row">í—</button></td>
            `;
            tareasBody.appendChild(row);
        });
    }
    console.log("Formulario ORDPAT pre-llenado con éxito.");
}

function renderORDPATTable() {
    const tableBody = document.getElementById('tableBodyORDPAT');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Mostrar SOLO óÓÓrdenes que NO estén cerradas en la tabla principal
    const activeOrders = patrolOrders.filter(op => !op.status || op.status === 'abierta');
    const sorted = [...activeOrders].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    sorted.forEach((op, index) => {
        const fullId = `${op.prefix || ''}${op.dtg || ''}-${op.serial || ''}-S`;

        const statusBadge = `<span style="background: #fef08a; color: #854d0e; padding: 3px 6px; border-radius: 4px; font-weight: bold; font-size: 0.7rem; display: inline-block; min-width: 60px; text-align: center;">ABIERTA</span>`;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">${fullId}</td>
            <td>${op.dtg || '---'}</td>
            <td style="font-size: 0.8rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${op.misionA || op.mision || '---'}</td>
            <td>${statusBadge}</td>
            <td class="table-actions" style="display: flex; gap: 4px; justify-content: center; align-items: center; flex-wrap: wrap; min-width: 180px;">
                <button onclick="window.generateORDPATPDF('${op.id}')" title="Generar PDF Oficial" style="background: #2563eb; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">PDF</button>
                <button onclick="window.editORDPAT('${op.id}')" title="Editar Orden" style="background: #7c3aed; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">Editar</button>
                <button onclick="openCloseOrderModal('${op.id}')" title="Subir Cumplimiento y Cerrar" style="background: #e67e22; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">Cerrar</button>
                <button onclick="window.deleteORDPAT('${op.id}')" title="Eliminar" style="background: #dc2626; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

window.deleteORDPAT = function deleteORDPAT(id) {
    console.log("Attempting to delete ORDPAT:", id);
    if (confirm('ííEliminar esta Orden de Patrulla?')) {
        patrolOrders = patrolOrders.filter(op => op.id !== id);
        saveData();
        renderORDPATTable();
        showNotification('Orden de Patrulla eliminada');
    }
};

window.editORDPAT = function editORDPAT(id) {
    const op = patrolOrders.find(o => o.id === id);
    if (!op) { alert('No se encontr\u00f3 la orden con ID: ' + id); return; }

    // Mapeado EXACTO: propiedad del objeto => ID real del campo HTML
    const fields = {
        'opDTGAuto': op.dtg,
        'opSequence': op.serial,
        'opHuso': op.huso,
        'opDTGInicio': op.dtgInicio,
        'opDTGTermino': op.dtgTermino,
        'opLugar': op.lugar,
        'opDestinatario': op.destinatario,
        'opCopia': op.copia,
        'opHeaderText': op.headerText,
        'opOrgComando': op.orgComando,
        'opSituacionMain': op.situacionMain,
        'opSituacionAmenaza': op.amenaza,
        'opSituacionPropias': op.propias,
        'opConcepto': op.concepto,
        'opTareasText': op.tareasText,
        'opConducta': op.conducta,
        'opCoordinacion': op.coordinacion,
        'opLogAbastecimiento': op.logistica,
        'opLogEvacuacion': op.logEvacuacion,
        'opLogPersonal': op.logPersonal,
        'opMando': op.mando,
        'opComunicaciones': op.comunicaciones,
        'opFirmanteNombre': op.firmanteNombre,
        'opFirmanteGrado': op.firmanteGrado,
        'opFirmanteCargo': op.firmanteCargo,
        'opAutorNombre': op.autorNombre,
        'opAutorCargo': op.autorCargo,
        'opSumilla': op.sumilla
    };
    for (const [fieldId, val] of Object.entries(fields)) {
        const el = document.getElementById(fieldId);
        if (el) el.value = val || '';
    }

    // Selector de precedencia
    const precSel = document.getElementById('opPrecedencia');
    if (precSel && op.precedencia) precSel.value = op.precedencia;

    // Selectores Puesto y Turno con cascada
    const postSel = document.getElementById('opPostSelector');
    const shiftSel = document.getElementById('opShiftSelector');
    if (postSel && op.post) {
        postSel.value = op.post;
        if (typeof populateORDPATSelectors === 'function') populateORDPATSelectors();
    }
    if (shiftSel && op.shift) shiftSel.value = op.shift;

    // Referencias
    const refsBody = document.getElementById('opRefsBody');
    if (refsBody && op.referencias && op.referencias.length > 0) {
        refsBody.innerHTML = '';
        op.referencias.forEach(ref => {
            const row = document.createElement('tr');
            const safeText = (ref.text || '').replace(/"/g, '&quot;');
            row.innerHTML = `<td style="border:1px solid var(--border);padding:5px;width:30px;text-align:center;color:var(--text-muted);font-family:monospace;">${ref.label}</td><td style="border:1px solid var(--border);padding:0;"><input type="text" class="row-ref-text" style="width:100%;background:transparent;border:none;color:var(--primary);padding:8px;" value="${safeText}"></td><td style="border:1px solid var(--border);padding:5px;text-align:center;width:50px;"><button type="button" class="btn-remove-row">&times;</button></td>`;
            refsBody.appendChild(row);
        });
    }

    // Organizaci\u00f3n
    const orgBody = document.getElementById('opOrgElementsBody');
    if (orgBody) {
        orgBody.innerHTML = '';
        (op.orgElementos || []).forEach(el => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><input type="text" class="org-sigla" value="${el.sigla || ''}"></td><td><input type="text" class="org-nomi" value="${el.nombre || ''}"></td><td><input type="text" class="org-pers" value="${el.personal || ''}"></td><td><button type="button" class="btn-remove-row">&times;</button></td>`;
            orgBody.appendChild(row);
        });
    }

    // Tareas
    const tareasBody = document.getElementById('opTareasProgBody');
    if (tareasBody) {
        tareasBody.innerHTML = '';
        (op.tareas || []).forEach(t => {
            const row = document.createElement('tr');
            row.innerHTML = `<td><input type="text" class="row-sigla" value="${t.sigla || ''}"></td><td><input type="text" class="row-tarea" value="${t.tarea || ''}"></td><td><input type="text" class="row-distrito" value="${t.distrito || ''}"></td><td><button type="button" class="btn-remove-row">&times;</button></td>`;
            tareasBody.appendChild(row);
        });
    }

    const form = document.getElementById('patrolOrderForm');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showNotification('Editando: ' + (op.dtg || id) + ' - Modifique y guarde');
};



// --- DÍAS DE OPERACIÓN & REPORTES ---

// --- DÍAS DE OPERACIÓN & REPORTES ---

// --- HELPER: NORMALIZACIÓN DE TEXTO PARA BíšSQUEDA ROBUSTA ---
function normalizeOpText(text) {
    if (!text) return "";
    return text.toString().toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/\s+/g, ' ') // Colapsar espacios
        .trim();
}

function getPersonnelSnapshot(puesto, turno) {
    let rawAll = [...(specialAssignments || []), ...(guardAssignments || [])];

    // INTEGRACIÓN CON NUEVA DISTRIBUCIÓN POR PUESTOS
    if (lastDistributionConfig) {
        let config = lastDistributionConfig;
        if (typeof config === 'string') try { config = JSON.parse(config); } catch (e) { }

        [...(config.fixed || []), ...(config.support || [])].forEach(post => {
            post.assigned.forEach(p => {
                rawAll.push({
                    id: p.id,
                    idNum: p.idNum,
                    name: p.name,
                    grade: p.grade,
                    specialty: p.specialty,
                    assignedLocation: post.name,
                    assignedShift: p.assignedShift || p.turno || 'GENERAL',
                    assignedTime: p.assignedTime || post.schedule
                });
            });
        });
    }

    if (rawAll.length === 0) return [];

    const searchPostNorm = normalizeOpText(puesto);
    const searchShiftNorm = normalizeOpText(turno);

    // Identificar el Número de Turno Buscado (1, 2 o 3)
    const searchTurnMatch = searchShiftNorm.match(/(?:T|TURNO|^|\s)([123])(?:\s|$|\))/i);
    const searchTurnNum = searchTurnMatch ? searchTurnMatch[1] : null;

    const results = rawAll.filter(a => {
        const locNorm = normalizeOpText(a.assignedLocation);
        const shiftNorm = normalizeOpText(a.assignedShift);
        const timeNorm = normalizeOpText(a.assignedTime);

        // 1. Validar Puesto (Ubicación)
        if (searchPostNorm) {
            const matchPuesto = locNorm.includes(searchPostNorm) || searchPostNorm.includes(locNorm);
            if (!matchPuesto) return false;
        }

        // 2. Validar Turno (EXCLUSIVIDAD TOTAL REQUERIDA)
        if (!searchShiftNorm) return true;

        // Si el personal es de "TODOS LOS TURNOS", se incluye siempre
        if (shiftNorm.includes("TODOS") || shiftNorm.includes("DIARIO")) {
            return true;
        }

        // Si tenemos un número de turno en la búsqueda (1, 2 o 3)
        if (searchTurnNum) {
            const shipTurnMatch = shiftNorm.match(/(?:T|TURNO|^|\s)([123])(?:\s|$|\))/i);
            const shipTurnNum = shipTurnMatch ? shipTurnMatch[1] : null;

            if (shipTurnNum && shipTurnNum === searchTurnNum) return true;
        }

        // Fallback: Si no hay números detectados o no hubo match por número, usamos coincidencia de texto
        // Comprobar contra el nombre del turno Y contra el horario
        const matchShift = shiftNorm.includes(searchShiftNorm) || searchShiftNorm.includes(shiftNorm);
        const matchTime = timeNorm.includes(searchShiftNorm) || searchShiftNorm.includes(timeNorm);

        return matchShift || matchTime;
    });

    return results.map(p => ({
        id: p.id,
        idNum: p.idNum,
        name: p.name,
        grade: p.grade,
        specialty: p.specialty,
        assignedLocation: p.assignedLocation,
        assignedShift: p.assignedShift,
        assignedTime: p.assignedTime
    }));
}

function renderOperationalReportsView() {
    // Vista de Reportes OMAI de Personal
}

function generateOMAIReport() {
    const year = document.getElementById('reportYear').value;
    const period = document.getElementById('reportPeriod').value;
    const body = document.getElementById('omaiReportBody');

    if (!body) return;

    body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">Procesando registros de personal...</td></tr>';

    setTimeout(() => {
        const groupedData = getOMAIReportGroupedData();
        renderOMAIReportTable(groupedData);
    }, 300);
}

function renderOMAIReportTable(data) {
    const body = document.getElementById('omaiReportBody');
    if (!body) return;

    body.innerHTML = '';

    if (data.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">No se encontraron personas registradas en el periodo seleccionado.</td></tr>';
        return;
    }

    data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.grade}</td>
            <td style="font-weight: 600; color: var(--text-main);">${p.name}</td>
            <td>${p.specialty}</td>
            <td>${p.idNum}</td>
            <td style="text-align: center; font-weight: bold; color: var(--accent-primary); font-size: 1.1rem;">${p.days || 1}</td>
            <td><span class="status-badge ${p.condition.toLowerCase().includes('operativo') ? 'active' : 'inactive'}">${p.condition}</span></td>
        `;
        body.appendChild(tr);
    });
}

function exportOMAIReportToExcel() {
    const data = getOMAIReportGroupedData();
    if (data.length === 0) {
        showNotification("No hay datos para exportar.");
        return;
    }

    const year = document.getElementById('reportYear').value;
    const periodName = document.getElementById('reportPeriod').options[document.getElementById('reportPeriod').selectedIndex].text;

    const wsData = [
        ["REPORTE DE DÍAS OMAI DE PERSONAL"],
        [`PERIODO: ${periodName} ${year}`],
        [],
        ["GRADO", "NOMBRES Y APELLIDOS", "ESPECIALIDAD", "Cí‰DULA", "DÍAS OMAI", "ESTADO"]
    ];

    data.forEach(p => {
        wsData.push([p.grade, p.name, p.specialty, p.idNum, p.days, p.condition]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte OMAI");
    XLSX.writeFile(wb, `Reporte_OMAI_${year}_${periodName.replace(/\s+/g, '_')}.xlsx`);
}

function exportOMAIReportToPDF() {
    const data = getOMAIReportGroupedData();
    if (data.length === 0) {
        showNotification("No hay datos para exportar.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const year = document.getElementById('reportYear').value;
    const periodName = document.getElementById('reportPeriod').options[document.getElementById('reportPeriod').selectedIndex].text;

    doc.setFontSize(14);
    doc.text("REPORTE DE DÍAS OMAI DE PERSONAL", 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`PERIODO: ${periodName} ${year}`, 105, 22, { align: 'center' });

    const tableData = data.map(p => [p.grade, p.name, p.specialty, p.idNum, p.days, p.condition]);

    doc.autoTable({
        startY: 30,
        head: [["GRADO", "NOMBRES Y APELLIDOS", "ESPECIALIDAD", "Cí‰DULA", "DÍAS OMAI", "ESTADO"]],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [14, 165, 233] }
    });

    doc.save(`Reporte_OMAI_${year}.pdf`);
}

function getOMAIReportGroupedData() {
    const year = document.getElementById('reportYear').value;
    const period = document.getElementById('reportPeriod').value;
    const combined = [...personnel, ...commandPostPersonnel, ...personnelHistory];

    const filtered = combined.filter(p => {
        // Unicamente personal en estado OPERATIVO
        const status = String(p.condition || '').toUpperCase().trim();
        if (status !== 'OPERATIVO') return false;

        const regDate = new Date(p.id);
        if (regDate.getFullYear().toString() !== year) return false;
        const month = regDate.getMonth() + 1;
        if (period.startsWith('m')) return month === parseInt(period.substring(1));
        if (period === 's1') return month >= 1 && month <= 6;
        if (period === 's2') return month >= 7 && month <= 12;
        if (period === 'year') return true;
        return false;
    });

    const groupedMap = {};
    filtered.forEach(p => {
        const hasName = p.name && p.name !== 'S/N Nombre' && p.name !== 'S/N';
        const hasId = p.idNum && p.idNum !== 'S/N Cédula' && p.idNum !== 'S/N';

        let key;
        if (hasId) key = p.idNum.trim().toUpperCase();
        else if (hasName) key = `NAME_${p.name.trim().toUpperCase()}`;
        else key = `ANON_${p.id}`;

        if (!groupedMap[key]) {
            groupedMap[key] = {
                grade: p.grade, name: p.name, specialty: p.specialty,
                idNum: p.idNum, condition: p.condition, days: 0
            };
        }
        groupedMap[key].days += 1;
    });

    return Object.values(groupedMap).sort((a, b) => b.days - a.days);
}

// --- VISOR DE ÓRDENES EXTERNAS (LOAD ORDERS) ---

async function handleExternalOrderUpload(e) {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        showNotification("Por favor seleccione un archivo PDF válido.", "error");
        return;
    }

    showNotification("Procesando archivo...");
    const id = 'ext_' + Date.now();
    const metadata = {
        id: id,
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
    };

    try {
        await saveOrderToDB(id, file);
        externalOrdersMetadata.push(metadata);
        saveAppState('externalOrdersMetadata', JSON.stringify(externalOrdersMetadata));

        renderLoadOrdersView();
        showNotification("Orden cargada exitosamente al repositorio.");
    } catch (err) {
        console.error("Upload Fail:", err);
        showNotification("Error al guardar el archivo.", "error");
    }

    e.target.value = ''; // Reset input
}

function renderLoadOrdersView(searchTerm = "") {
    const listContainer = document.getElementById('loadOrdersList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const search = searchTerm.toLowerCase();

    const filtered = externalOrdersMetadata.filter(o =>
        (o.name || "").toLowerCase().includes(search)
    ).sort((a, b) => b.timestamp - a.timestamp);

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No hay óÓÓrdenes externas registradas.</div>';
        return;
    }

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'order-item-card';
        div.dataset.id = item.id;
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="background: rgba(59, 130, 246, 0.1); color: var(--accent); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;"></div>
                <div style="flex: 1; min-width: 0;">
                    <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">${item.name}</h4>
                    <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">${item.date} í€¢ ${item.size}</div>
                </div>
            </div>
            <div style="display: flex; gap: 5px; margin-top: 5px;">
                <span class="doc-id-badge" style="font-size: 0.65rem; padding: 2px 8px;">PDF</span>
                <span class="doc-id-badge" style="font-size: 0.65rem; padding: 2px 8px; background: rgba(59, 130, 246, 0.05); color: var(--accent);">EXTERNA</span>
            </div>
        `;

        // Handle selection
        div.onclick = (e) => {
            selectOrderForPreview(item.id, div);
        };

        listContainer.appendChild(div);
    });
}

async function selectOrderForPreview(id, element) {
    document.querySelectorAll('.order-item-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    document.getElementById('viewerInitialState').style.display = 'none';
    document.getElementById('viewerToolbar').style.display = 'flex';
    const iframe = document.getElementById('orderPDFViewer');
    iframe.style.display = 'block';

    const label = document.getElementById('viewingOrderLabel');
    const metadata = externalOrdersMetadata.find(m => m.id === id);
    label.textContent = `VISTA PREVIA: ${metadata ? metadata.name : 'Documento'}`;

    showNotification("Cargando documento...");

    try {
        const blob = await getOrderFromDB(id);
        if (!blob) throw new Error("File not found");

        const blobUrl = URL.createObjectURL(blob);

        // Revoke previous URL to avoid memory leaks
        if (iframe.dataset.currentUrl) {
            URL.revokeObjectURL(iframe.dataset.currentUrl);
        }

        iframe.src = blobUrl;
        iframe.dataset.currentUrl = blobUrl;
        iframe.classList.add('viewer-active');
    } catch (err) {
        console.error("Preview Fail:", err);
        showNotification("Error al cargar el archivo de la base de datos.", "error");
    }
}

async function deleteExternalOrder(id) {
    try {
        await deleteOrderFromDB(id);
        externalOrdersMetadata = externalOrdersMetadata.filter(m => m.id !== id);
        saveAppState('externalOrdersMetadata', JSON.stringify(externalOrdersMetadata));

        // Reset viewer if deleted order was being viewed
        const iframe = document.getElementById('orderPDFViewer');
        if (iframe.dataset.currentUrl) {
            URL.revokeObjectURL(iframe.dataset.currentUrl);
        }
        iframe.src = '';
        iframe.style.display = 'none';
        document.getElementById('viewerToolbar').style.display = 'none';
        document.getElementById('viewerInitialState').style.display = 'flex';

        renderLoadOrdersView();
        showNotification("Orden eliminada del repositorio.");
    } catch (err) {
        console.error("Delete Fail:", err);
        showNotification("Error al eliminar el archivo.", "error");
    }
}

// --- GENERACIÓN DE PDF: ORDPAT-GT 100.51 ---

// --- HELPER: ANEXO DE PERSONAL ---
function addPersonnelAnnex(doc, pageWidth, filterShift = null, filterPost = null, fontSize = 8, itemsOverride = null, docTitle = "ORDEN DE PATRULLA", referenceId = "") {
    // Si el snapshot está vacío o no se proporciona, intentamos usar el estado global como respaldo
    const sourceMatched = (itemsOverride && itemsOverride.length > 0) ? itemsOverride : [...(specialAssignments || []), ...(guardAssignments || [])];

    const shiftMap = {
        "0800-1200 / 2000-0000": "TURNO 1 (08H00 A 12H00 / 20H00 A 00H00)",
        "12H00 A 16H00 / 00H00 A 04H00": "TURNO 2 (12H00 A 16H00 / 00H00 A 04H00)",
        "16H00 A 20H00 / 04H00 A 08H00": "TURNO 3 (16H00 A 20H00 / 04H00 A 08H00)"
    };

    const shiftsResources = [
        { name: "TURNO 1", time: "0800-1200 / 2000-0000" },
        { name: "TURNO 2", time: "1200-1600 / 0000-0400" },
        { name: "TURNO 3", time: "1600-2000 / 0400-0800" }
    ];

    let all = [...sourceMatched];
    // ... (logic remains same)

    if (!itemsOverride || itemsOverride.length === 0) {
        const searchPostNorm = normalizeOpText(filterPost);
        const searchShiftNorm = normalizeOpText(filterShift);
        if (searchPostNorm) {
            all = all.filter(a => {
                const locNorm = normalizeOpText(a.assignedLocation);
                if (!locNorm) return false;
                return locNorm.includes(searchPostNorm) || searchPostNorm.includes(locNorm);
            });
        }
        if (searchShiftNorm) {
            all = all.filter(a => {
                const shipShiftNorm = normalizeOpText(a.assignedShift);
                if (!shipShiftNorm) return false;
                if (shipShiftNorm.includes("TODOS") || shipShiftNorm.includes("APOYO") || shipShiftNorm.includes("DISPONIBLE")) return true;
                return shipShiftNorm.includes(searchShiftNorm) || searchShiftNorm.includes(shipShiftNorm);
            });
        }
    }

    doc.addPage(pageWidth > 250 ? 'l' : 'p', 'mm', 'a4');
    const margin = 25.4;
    startY = 65; // Ajustado para dejar espacio al encabezado institucional global

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('ANEXO "A"', pageWidth / 2, startY, { align: 'center' });
    startY += 6;
    doc.text('NÓMINA DE PMP DE PATRULLA CON SU ARMAMENTO', pageWidth / 2, startY, { align: 'center' });
    startY += 10;

    // ... (rest of function)
    if (all.length === 0) {
        doc.setFont(undefined, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text('AVISO: NO SE DETECTÓ PERSONAL ASIGNADO EN EL SISTEMA PARA ESTA CONFIGURACIÓN', pageWidth / 2, startY + 20, { align: 'center' });
        doc.setFontSize(9);
        doc.text('(Asegúrese de realizar la Distribución de Guardia antes de generar la orden)', pageWidth / 2, startY + 30, { align: 'center' });
        return;
    }

    const renderBlock = (title, items, bgColor, altColor) => {
        if (items.length === 0) return;

        // Título de Sección con Barra de Color
        doc.setFillColor(...bgColor);
        doc.rect(margin, startY, pageWidth - (margin * 2), fontSize * 0.8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(fontSize);
        doc.setFont(undefined, 'bold');

        // REEMPLAZAR "FIJO" con horario real si aplica
        let displayTitle = title;
        if (displayTitle === "FIJO" && items.length > 0) {
            displayTitle = items[0].assignedTime || "FIJO";
        }
        // Mapear a etiqueta bonita si existe
        displayTitle = shiftMap[displayTitle] || displayTitle;

        doc.text(displayTitle.toUpperCase(), pageWidth / 2, startY + (fontSize * 0.5), { align: 'center' });
        doc.setTextColor(0, 0, 0); // Reset color
        startY += 8;

        if (startY > (pageWidth > 250 ? 170 : 250)) {
            doc.addPage(pageWidth > 250 ? 'l' : 'p', 'mm', 'a4');
            startY = 60; // Ajustado para el encabezado institucional en cada página
        }

        const uniqueLocs = [...new Set(items.map(m => m.assignedLocation))];
        uniqueLocs.forEach(locName => {
            const locMembers = items.filter(m => m.assignedLocation === locName);
            const time = locMembers[0].assignedTime || "";

            // Validar espacio para el título del puesto + al menos una fila de tabla
            if (startY > (pageWidth > 250 ? 180 : 260)) {
                doc.addPage(pageWidth > 250 ? 'l' : 'p', 'mm', 'a4');
                startY = 60; // Ajustado para el encabezado institucional en cada página
            }

            // Título de Puesto
            doc.setFillColor(...altColor);
            doc.rect(margin, startY, pageWidth - (margin * 2), 6, 'F');
            doc.setTextColor(...bgColor);
            doc.setFontSize(8);
            doc.text(`${locName} ${time ? ' - ' + time : ''}`, margin + 4, startY + 4.5);
            startY += 6;

            doc.autoTable({
                startY: startY,
                head: [['No.', 'Grado', 'Apellidos y Nombres', 'Cédula', 'Observaciones']],
                body: locMembers.map((p, idx) => [idx + 1, p.grade, p.name, p.idNum || "S/N", ""]),
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 1.5 },
                headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
                margin: { top: 38, left: margin, right: margin },
                didDrawPage: (data) => {
                    startY = data.cursor.y + 5;
                }
            });

            startY = (doc.lastAutoTable || doc.previousAutoTable || { finalY: startY }).finalY + 4;
        });
        startY += 2;
    };

    // Clasificar personal para visualización
    if (filterShift && !itemsOverride) {
        const filteredGuard = all.filter(a => !(a.assignedShift || "").toUpperCase().includes("APOYO"));
        // Modo Estricto para lista global
        const searchShift = filterShift.toUpperCase();
        const res = shiftsResources.find(r => r.name === searchShift);
        const displayTitle = res ? `${res.name} (${res.time})` : searchShift;
        renderBlock(displayTitle, filteredGuard, [14, 165, 233], [240, 249, 255]);
    } else if (itemsOverride) {
        // MODO SNAPSHOT: Respetar la lista exacta guardada sin re-filtrar
        const snapshotSpecial = all.filter(a => {
            const s = (a.assignedShift || "").toUpperCase();
            return s.includes("APOYO") || s.includes("INTERVENCION") || s.includes("DISPONIBLE") || s.includes("TODOS");
        });
        if (snapshotSpecial.length > 0) {
            renderBlock("INTERVENCIÓN / APOYO", snapshotSpecial, [239, 68, 68], [254, 242, 242]);
        }

        const shiftMembersPool = all.filter(a => {
            const s = (a.assignedShift || "").toUpperCase();
            return !s.includes("APOYO") && !s.includes("INTERVENCION") && !s.includes("DISPONIBLE") && !s.includes("TODOS");
        });

        const shiftsInSnapshot = [...new Set(shiftMembersPool.map(m => m.assignedShift))];
        shiftsInSnapshot.forEach(sName => {
            const members = shiftMembersPool.filter(m => m.assignedShift === sName);
            const sNameNorm = normalizeOpText(sName);
            const res = shiftsResources.find(r => sNameNorm.includes(normalizeOpText(r.name)));
            const displayTitle = res ? `${res.name} (${res.time})` : (sName || "OPERACIÓN");
            renderBlock(displayTitle, members, [14, 165, 233], [240, 249, 255]);
        });
    } else {
        // Modo General
        const filteredSpecial = all.filter(a => (a.assignedShift || "").toUpperCase().includes("APOYO"));
        const filteredGuard = all.filter(a => !(a.assignedShift || "").toUpperCase().includes("APOYO"));

        if (filteredSpecial.length > 0) {
            renderBlock("TAREAS DE APOYO", filteredSpecial, [239, 68, 68], [254, 242, 242]);
        }

        shiftsResources.forEach(shift => {
            const shiftMembers = filteredGuard.filter(d => (d.assignedShift || "").toUpperCase().includes(shift.name));
            if (shiftMembers.length > 0) {
                renderBlock(`${shift.name} (${shift.time})`, shiftMembers, [14, 165, 233], [240, 249, 255]);
            }
        });
    }
}

/**
 * Helper para renderizado de bloques de texto con soporte de listas jerárquicas.
 */
function pdfRenderBlock(doc, content, x, maxWidth, config) {
    let { margin, pageWidth, limitY, currentY, startY_page, drawJustifiedLine, indent = 12, orientation = 'p', lineHeight = 5 } = config;
    const paragraphs = (content || 'N/A').split('\n');

    doc.setFont('helvetica', 'normal');

    paragraphs.forEach(para => {
        if (!para.trim()) return;

        let cleanPara = para.trim();

        // Refined bullet/number regex:
        // Group 1: The prefix (e.g., '1)', 'a.', '-', 'í€¢', '%í', '%')
        // Group 2: The text
        const match = cleanPara.match(/^([0-9a-z]+\)|[0-9a-z]+\.|í·|í€¢|[\u2022\u00b7]|\*|-|%[^\s0-9a-z]?|%)\s*(.*)$/i);

        if (match) {
            let prefix = match[1];
            let text = match[2];

            // Normalize weird placeholders like %í, %í„, or just % to a clean bullet
            if (prefix.startsWith('%')) {
                prefix = "í€¢";
            }

            // Hierarchy Identification:
            // Revised to match user's visual preference (less aggressive indents)
            let levelIndent = 0;
            let textIndent = 8;
            let isBoldHeader = false;

            if (prefix.match(/^\d+\.$/)) {
                // Level 1: 1. 2.
                levelIndent = 0;
                textIndent = 10;
                isBoldHeader = true;
            } else if (prefix.match(/^[A-Z]\.$/)) {
                // Level 2: A. B.
                levelIndent = 4;
                textIndent = 10;
                isBoldHeader = true;
            } else if (prefix.match(/^\d+\)$/)) {
                // Level 3: 1) 2)
                levelIndent = 10;
                textIndent = 8;
            } else if (prefix.match(/^[*í€¢í·-]/)) {
                // Level 4: Bullets (Indented more than Level 3)
                levelIndent = 16;
                textIndent = 8;
            } else if (prefix.match(/^[a-z]\)$/)) {
                // Level 5: a) b)
                levelIndent = 22;
                textIndent = 8;
            }

            const prefixX = x + levelIndent;
            const textX = prefixX + textIndent;
            const textWidth = pageWidth - textX - (margin * 0.8);

            if (currentY > limitY) { doc.addPage(orientation); currentY = startY_page; }

            // Render Prefix
            doc.setFont(undefined, 'bold');
            doc.text(prefix, prefixX, currentY);

            if (isBoldHeader) doc.setFont(undefined, 'bold');
            else doc.setFont(undefined, 'normal');

            // Render Text with justify support
            const words = text.split(/\s+/);
            let firstLineText = "";
            let i = 0;
            while (i < words.length) {
                let testText = firstLineText + (firstLineText ? " " : "") + words[i];
                if (doc.getTextWidth(testText) > textWidth) break;
                firstLineText = testText;
                i++;
            }

            // Draw first line (justified if not last)
            if (i === words.length || !drawJustifiedLine) {
                doc.text(firstLineText, textX, currentY);
            } else {
                drawJustifiedLine(doc, firstLineText, textX, currentY, textWidth);
            }
            currentY += lineHeight;

            // Update caller's perspective of indentation for next non-prefixed line
            // (Note: Since we return currentY, we'd need to return currentIndent too if we wanted 
            // perfect state, but within a block usually all sub-lines align to the first word)

            // Draw remaining lines
            const remainingText = words.slice(i).join(" ");
            if (remainingText) {
                doc.setFont(undefined, 'normal');
                const remainingLines = doc.splitTextToSize(remainingText, textWidth);
                remainingLines.forEach((line, idx) => {
                    if (currentY > limitY) { doc.addPage(orientation); currentY = startY_page; }

                    // Only justify if it's not the last line of the paragraph
                    if (idx < remainingLines.length - 1 && drawJustifiedLine) {
                        drawJustifiedLine(doc, line, textX, currentY, textWidth);
                    } else {
                        doc.text(line, textX, currentY);
                    }
                    currentY += lineHeight;
                });
            }
        } else {
            // Standard paragraph
            const lines = doc.splitTextToSize(cleanPara, maxWidth);
            lines.forEach((line, idx) => {
                if (currentY > limitY) { doc.addPage(orientation); currentY = startY_page; }

                if (idx < lines.length - 1 && drawJustifiedLine) {
                    drawJustifiedLine(doc, line, x, currentY, maxWidth);
                } else {
                    doc.text(line, x, currentY);
                }
                currentY += lineHeight;
            });
        }
    });
    return currentY;
}

// Helper to load images for PDF (Base64 or URL)
/**
 * Garantiza que la imagen del logo institucional esté cargada.
 */
function loadInstitutionalLogo() {
    return new Promise((resolve) => {
        const img = document.getElementById('institutionalLogo');
        if (!img) {
            console.error("Institutional logo element not found!");
            resolve(null);
            return;
        }

        if (img.complete && img.naturalWidth > 0) {
            resolve(img);
        } else {
            img.onload = () => {
                console.log("Institutional logo loaded successfully via event.");
                resolve(img);
            };
            img.onerror = () => {
                console.error("Failed to load institutional logo from:", img.src);
                resolve(null);
            };
            // Double check if it completed between our test and the event attachment
            if (img.complete) {
                resolve(img.naturalWidth > 0 ? img : null);
            }
        }
    });
}

window.generateORDPATPDF = async function generateORDPATPDF(id, options = {}) {
    try {
        console.log("Generating Institutional ORDPAT PDF for ID:", id);
        const op = patrolOrders.find(o => o.id === id);
        if (!op) { alert('ERROR: No se encontró la orden con ID: ' + id + '\nTotal óÓÓrdenes: ' + patrolOrders.length); return; }
        if (!window.jspdf) { alert('ERROR: La librería jsPDF no está cargada. Verifique que el servidor esté corriendo.'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const margin = 25.4;
        // --- ENCABEZADO INSTITUCIONAL (Strict Layout) ---
        const drawOfficialHeader = (title) => {
            let y = 15;

            // 1. Clasificación Centrada (Arriba)
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(190, 30, 45); // Un rojo similar al solicitado
            doc.text('SECRETO', pageWidth / 2, y, { align: 'center' });
            y += 5;

            // 2. Escudo / Logo Centrado (Debajo de SECRETO)
            if (escudoBase64) {
                const shieldSize = 25;
                doc.addImage(escudoBase64, 'PNG', (pageWidth - shieldSize) / 2, y, shieldSize, shieldSize);
                y += shieldSize + 5;
            }

            // 3. Bloque de Unidad (Alineado a la derecha opcionalmente, pero quitamos lo que no sirve)
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            const rightX = pageWidth - margin;
            doc.text('ARMADA DEL ECUADOR', rightX, 15, { align: 'right' });
            doc.text('GRUPO DE TAREA 100.51', rightX, 19, { align: 'right' });
            doc.text('í€œSEGURIDAD MARÍTIMAí€', rightX, 23, { align: 'right' });

            y = 55; // Ajustamos inicio del título
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 10;
            return y;
        };
        let currentY = 0;
        currentY = drawOfficialHeader("ORDEN DE PATRULLA");

        // --- PDF HELPERS (Restored) ---
        const drawJustifiedLine = (doc, text, x, y, maxWidth) => {
            const words = text.trim().split(/\s+/);
            if (words.length <= 1) { doc.text(text, x, y); return; }
            const totalWidth = words.reduce((sum, word) => sum + doc.getTextWidth(word), 0);
            const freeSpace = maxWidth - totalWidth;
            const spaceBetween = freeSpace / (words.length - 1);
            let currentX = x;
            words.forEach((word) => {
                doc.text(word, currentX, y);
                currentX += doc.getTextWidth(word) + spaceBetween;
            });
        };

        const stripHTML = (html) => {
            if (!html) return "";
            let tmp = document.createElement("DIV");
            tmp.innerHTML = html.replace(/<br\s*[\/]?>/gi, "\n").replace(/&nbsp;/g, " ");
            return tmp.textContent || tmp.innerText || "";
        };

        const renderJustifiedBlock = (rawText, x, maxWidth, indent = 0) => {
            const text = stripHTML(rawText);
            const lines = doc.splitTextToSize(text, maxWidth - indent);
            lines.forEach((line, idx) => {
                if (currentY > 275) { doc.addPage(); currentY = 60; }
                if (idx === lines.length - 1) { doc.text(line, x + indent, currentY); }
                else { drawJustifiedLine(doc, line, x + indent, currentY, maxWidth - indent); }
                currentY += 5;
            });
        };

        const drawSectionHeader = (text) => {
            if (currentY > 260) { doc.addPage(); currentY = 60; }
            doc.setFont('helvetica', 'bold');
            doc.text(text, margin, currentY);
            doc.line(margin, currentY + 0.5, margin + doc.getTextWidth(text), currentY + 0.5);
            currentY += 7;
            doc.setFont('helvetica', 'normal');
        };

        // ID de Orden (Removido del encabezado por petición)
        const ordId = `${op.prefix || 'ARE-ORDPAT-UT100.51.4-'}${op.dtg || 'XXXXXXR-XXX-2026'}-${op.serial || 'XXX'}-S`;
        currentY += 5;

        // Metadatos de Control (Número, Lugar, Precedencia...)
        doc.setFontSize(9);
        doc.text(`NíšMERO:`, margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(ordId, margin + 25, currentY);
        doc.setFont('helvetica', 'bold');
        doc.text(`PRECEDENCIA:`, pageWidth - margin - 40, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(op.precedencia || 'R', pageWidth - margin - 10, currentY);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.text(`EJECUTOR:`, margin, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(op.destinatario || 'COOPNA', margin + 25, currentY);
        currentY += 5;

        if (op.copia) {
            doc.setFont('helvetica', 'bold');
            doc.text(`COPIA:`, margin, currentY);
            doc.setFont('helvetica', 'normal');
            doc.text(op.copia, margin + 25, currentY);
            currentY += 10;
        } else {
            currentY += 5;
        }

        // Párrafo de Referencia (CUADRO DE TEXTO MODIFICABLE)
        doc.setFont('helvetica', 'bold');
        const headerText = op.headerText || `A LA ORDEN DE PATRULLA ARE-CODESC-OPE-XXXX-2026-P ...`;
        renderJustifiedBlock(headerText, margin, pageWidth - (2 * margin), 0);
        currentY += 5;

        drawSectionHeader("REFERENCIAS:");
        (op.referencias || []).forEach(ref => {
            const txt = `${ref.label} ${ref.text}`;
            renderJustifiedBlock(txt, margin, pageWidth - (2 * margin), 5);
            currentY += 2;
        });
        currentY += 5;

        drawSectionHeader("ORGANIZACIÓN POR TAREAS:");
        doc.setFont('helvetica', 'bold');
        doc.text(op.orgComando || '---', margin + 5, currentY);
        currentY += 7;
        (op.orgElementos || []).forEach(el => {
            doc.setFont('helvetica', 'normal');
            doc.text(el.sigla || '---', margin + 10, currentY);
            doc.text(el.nombre || '---', margin + 35, currentY);
            doc.text(el.personal || '---', pageWidth - margin, currentY, { align: 'right' });
            currentY += 5;
        });
        currentY += 5;

        doc.setFont('helvetica', 'normal');
        doc.text(`Huso Horario: ${op.huso || 'ROMEO'}`, margin, currentY);
        currentY += 10;

        drawSectionHeader("1. SITUACIÓN");
        renderJustifiedBlock(op.situacionMain || '---', margin, pageWidth - (2 * margin), 5);
        currentY += 3;
        doc.setFont('helvetica', 'bold');
        doc.text("A. AMENAZAS Y RIESGOS", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.amenaza || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 5;

        drawSectionHeader("2. MISIÓN");
        doc.setFont('helvetica', 'bold');
        doc.text("A. PROPÓSITO (PARA QUí‰)", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.misionA || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("B. TAREA (QUí‰ SE VA A HACER)", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.misionB || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 10;

        drawSectionHeader("3. EJECUCIÓN");
        doc.setFont('helvetica', 'bold');
        doc.text("A. INTENCIÓN DEL COMANDANTE", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.intencion || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("B. CONCEPTO DE LA OPERACIÓN", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.concepto || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("B. TAREAS A LAS UNIDADES", margin + 5, currentY);
        currentY += 7;

        if (op.tareasText) {
            doc.setFont('helvetica', 'normal');
            renderJustifiedBlock(op.tareasText, margin + 5, pageWidth - (2 * margin) - 5, 5);
            currentY += 5;
        } else if (op.tareas && op.tareas.length > 0) {
            const rows = op.tareas.map(t => [t.sigla, t.tarea, t.distrito]);
            doc.autoTable({
                startY: currentY,
                head: [['SIGLA', 'TAREA', 'DISTRITO']],
                body: rows,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                margin: { left: margin + 5 },
                didDrawPage: (data) => { currentY = data.cursor.y; }
            });
            currentY = (doc.lastAutoTable?.finalY || currentY) + 8;
        }

        doc.setFont('helvetica', 'bold');
        doc.text("C. CONDUCTA EN LAS OPERACIONES", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.conducta || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 5;

        doc.setFont('helvetica', 'bold');
        doc.text("D. INSTRUCCIONES DE COORDINACIÓN", margin + 5, currentY);
        currentY += 7;
        doc.setFont('helvetica', 'normal');
        renderJustifiedBlock(op.coordinacion || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
        currentY += 10;

        // 4. ADMINISTRACIÓN Y LOGÍSTICA
        drawSectionHeader("4. ADMINISTRACIÓN Y LOGÍSTICA.");
        doc.setFont('helvetica', 'bold');
        doc.text("A. ABASTECIMIENTOS.", margin + 5, currentY);
        currentY += 5;
        renderJustifiedBlock(op.logistica || '---', margin, pageWidth - (2 * margin), 10);

        doc.setFont('helvetica', 'bold');
        doc.text("B. EVACUACIÓN Y HOSPITALIZACIÓN.", margin + 5, currentY);
        currentY += 5;
        renderJustifiedBlock(op.logEvacuacion || '---', margin, pageWidth - (2 * margin), 10);

        doc.setFont('helvetica', 'bold');
        doc.text("C. PERSONAL.", margin + 5, currentY);
        currentY += 5;
        renderJustifiedBlock(op.logPersonal || '---', margin, pageWidth - (2 * margin), 10);
        currentY += 5;

        // 5. COMANDO Y CONTROL
        drawSectionHeader("5. COMANDO Y CONTROL.");
        doc.setFont('helvetica', 'bold');
        doc.text("A. COMANDO.", margin + 5, currentY);
        currentY += 5;
        renderJustifiedBlock(op.mando || '---', margin, pageWidth - (2 * margin), 10);

        doc.setFont('helvetica', 'bold');
        doc.text("B. COMUNICACIONES Y ELECTRÓNICA.", margin + 5, currentY);
        currentY += 5;
        renderJustifiedBlock(op.comunicaciones || '---', margin, pageWidth - (2 * margin), 10);
        currentY += 15;

        // --- BLOQUE DE FIRMAS (Strict Compliance) ---
        if (currentY > 220) { doc.addPage(); currentY = 60; }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Atentamente,', margin, currentY);
        currentY += 15;

        // Linea 1: Por [Nombre]
        const firmanteNombre = (op.firmanteNombre || 'COMANDANTE').toUpperCase();
        const firmanteGrado = (op.firmanteGrado || '').toUpperCase();
        const firmanteCargo = (op.firmanteCargo || 'COMANDANTE CGT 100.51').toUpperCase();
        const autorNombre = (op.autorNombre || '').toUpperCase();
        const autorCargo = (op.autorCargo || '').toUpperCase();

        doc.setFont('helvetica', 'bolditalic');
        doc.text('Por ', margin, currentY);
        let porW = doc.getTextWidth('Por ');
        doc.setFont('helvetica', 'normal');
        doc.text(firmanteNombre, margin + porW, currentY);
        currentY += 5;

        // Linea 2: Grado
        if (firmanteGrado) {
            doc.text(firmanteGrado, margin, currentY);
            currentY += 5;
        }

        // Linea 3: Cargo (Negrita)
        doc.setFont('helvetica', 'bold');
        doc.text(firmanteCargo, margin, currentY);
        currentY += 8;

        // Linea 4: Elaborador
        if (autorNombre || autorCargo) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const authorLine = [autorNombre, autorCargo].filter(Boolean).join(' í€” ');
            doc.text(authorLine, margin, currentY);
            currentY += 10;
        }

        // Sumilla (Bottom Left)
        if (op.sumilla) {
            doc.setFontSize(7);
            doc.text('|', margin, currentY);
            doc.text(`${op.sumilla.toUpperCase()}. -`, margin, currentY + 4);
            currentY += 10;
        }


        // --- ANEXOS LISTING ---
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('ANEXOS:', margin, currentY);
        let anexW = doc.getTextWidth('ANEXOS: ');
        doc.setFont('helvetica', 'normal');
        doc.text('A: NOMINA DEL PERSONAL', margin + anexW, currentY);
        currentY += 5;

        addPersonnelAnnex(doc, pageWidth, null, null, 8, op.personnelSnapshot, "ORDEN DE PATRULLA", ordId);

        // --- LOOP POST-GENERACIÓN: HEADERS Y PAGINACIÓN ---
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);

            // --- ENCABEZADO INSTITUCIONAL ---
            let headerY = 15;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(190, 30, 45); // Rojo Institucional
            doc.text('S E C R E T O', pageWidth / 2, headerY, { align: 'center' });
            doc.line(pageWidth / 2 - 10, headerY + 1, pageWidth / 2 + 10, headerY + 1); // Subrayado para SECRETO

            if (escudoBase64) {
                const shieldSize = 25;
                doc.addImage(escudoBase64, 'PNG', (pageWidth - shieldSize) / 2, headerY + 4, shieldSize, shieldSize);
            }

            // Bloque Unidad Top-Right
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(9);
            const rightX = pageWidth - margin;
            doc.text('ARMADA DEL ECUADOR', rightX, 15, { align: 'right' });
            doc.text('GRUPO DE TAREA 100.51', rightX, 19, { align: 'right' });
            doc.text('í€œSEGURIDAD MARÍTIMAí€', rightX, 23, { align: 'right' });
            doc.text(op.lugar || 'GUAYAQUIL', rightX, 27, { align: 'right' });
            doc.text(new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(), rightX, 31, { align: 'right' });

            // Título y ID de Orden
            headerY = 55;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text("ORDEN DE PATRULLA", pageWidth / 2, headerY, { align: 'center' });
            doc.line(pageWidth / 2 - 25, headerY + 1, pageWidth / 2 + 25, headerY + 1); // Subrayado
            headerY += 7;
            const ordIdFinal = `${op.prefix || 'ARE-ORDPAT-UT100.51.4-'}${op.dtg || 'XXXXXXR-XXX-2026'}-${op.serial || 'XXX'}-S`;
            doc.setFontSize(9);
            doc.text(ordIdFinal, pageWidth / 2, headerY, { align: 'center' });

            // Clasificación al Pie (Opcional pero recomendado para SECRETO)
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(239, 68, 68);
            doc.text('SECRETO', pageWidth / 2, 285, { align: 'center' });

            // Numeración de Página
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, 285, { align: 'right' });
        }

        if (options.returnBlob) {
            return doc.output('bloburl');
        }

        // Generar y abrir PDF
        const pdfBlobUrl = doc.output('bloburl');
        window.open(pdfBlobUrl, '_blank');
        doc.save(`ORDPAT_${(op.fragNro || 'X').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);

    } catch (err) {
        console.error('ERROR generando PDF ORDPAT:', err);
        alert('ERROR al generar el PDF:\n' + err.message + '\n\nRevise la consola del navegador (F12) para más detalles.');
    }
}

function updateIntelStats(dataToUse) {
    const sourceData = dataToUse || (typeof crimes !== 'undefined' ? crimes : []);
    if (!sourceData || sourceData.length === 0) {
        if (chartIntelTypeInstance) chartIntelTypeInstance.destroy();
        if (chartIntelHourInstance) chartIntelHourInstance.destroy();
        return;
    }

    // Helper para colores del semáforo
    const getSemaforoColor = (type) => {
        if (!type) return '#94a3b8';
        const t = type.toLowerCase();
        // Mapeo directo si existe en CRIME_COLORS
        if (CRIME_COLORS[t]) return CRIME_COLORS[t];

        // Búsqueda por inclusión para mayor tolerancia
        if (t.includes('robo')) return CRIME_COLORS['robo'];
        if (t.includes('sicariato') || t.includes('muerte')) return CRIME_COLORS['sicariato'];
        if (t.includes('extorsion')) return CRIME_COLORS['extorsion'];
        if (t.includes('droga')) return CRIME_COLORS['droga'];
        if (t.includes('secuestro')) return CRIME_COLORS['secuestro'];
        if (t.includes('narcotrafico')) return CRIME_COLORS['narcotrafico'];
        if (t.includes('operacion')) return CRIME_COLORS['operacion'];
        if (t.includes('atentado')) return CRIME_COLORS['atentado'];
        if (t.includes('armas')) return CRIME_COLORS['armas'];
        if (t.includes('cámaras') || t.includes('camara')) return CRIME_COLORS['cámaras'];
        if (t.includes('contrabando')) return CRIME_COLORS['contrabando'];

        return '#64748b'; // Gris por defecto
    };

    // Procesar datos por tipo
    const typesCount = {};
    sourceData.forEach(c => {
        if (c.type) {
            typesCount[c.type] = (typesCount[c.type] || 0) + 1;
        }
    });

    const typeLabels = Object.keys(typesCount);
    const typeValues = Object.values(typesCount);
    const typeColors = typeLabels.map(label => getSemaforoColor(label));

    // Procesar datos por hora
    const hoursCount = new Array(24).fill(0);
    sourceData.forEach(c => {
        if (c.date) {
            const hour = new Date(c.date).getHours();
            hoursCount[hour]++;
        }
    });

    const hourLabels = hoursCount.map((_, i) => `${i}:00`);
    const hourValues = hoursCount;

    // Destruir instancias previas
    if (chartIntelTypeInstance) chartIntelTypeInstance.destroy();
    if (chartIntelHourInstance) chartIntelHourInstance.destroy();
    if (chartIntelYearInstance) chartIntelYearInstance.destroy();

    const canvasType = document.getElementById('chartIntelType');
    const canvasHour = document.getElementById('chartIntelHour');

    if (canvasType) {
        const ctxType = canvasType.getContext('2d');
        chartIntelTypeInstance = new Chart(ctxType, {
            type: 'bar',
            data: {
                labels: typeLabels,
                datasets: [{
                    label: 'Cantidad',
                    data: typeValues,
                    backgroundColor: typeColors,
                    borderRadius: 6,
                    borderWidth: 0,
                    barThickness: 30
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0f172a',
                        titleFont: { size: 14, weight: 'bold' },
                        padding: 12
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { color: '#64748b', stepSize: 1 },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        ticks: { color: '#334155', font: { weight: '600' } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    if (canvasHour) {
        const ctxHour = canvasHour.getContext('2d');

        // Agrupar por tipo para gráfico apilado por horas
        const types = Object.keys(CRIME_COLORS);
        const hourDatasets = [];

        types.forEach(type => {
            const dataForType = new Array(24).fill(0);
            let hasData = false;

            sourceData.forEach(c => {
                if (c.type === type && c.date) {
                    const hour = new Date(c.date).getHours();
                    dataForType[hour]++;
                    hasData = true;
                }
            });

            if (hasData) {
                hourDatasets.push({
                    label: type,
                    data: dataForType,
                    backgroundColor: getSemaforoColor(type),
                    borderRadius: 4,
                    borderWidth: 0,
                    stack: 'Stack 0' // Asegura el apilamiento
                });
            }
        });

        chartIntelHourInstance = new Chart(ctxHour, {
            type: 'bar',
            data: {
                labels: hourLabels,
                datasets: hourDatasets.length > 0 ? hourDatasets : [{
                    label: 'Sin datos',
                    data: new Array(24).fill(0),
                    backgroundColor: '#e2e8f0'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { boxWidth: 12, font: { size: 10 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#0f172a'
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { color: '#64748b', stepSize: 1 },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: '#334155', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
        // --- Gráfico anual de incidentes ---
        const canvasYear = document.getElementById('chartIntelYear');
        if (canvasYear) {
            // Preparar datos por año y tipo de delito
            const years = [];
            const typeSet = new Set();
            // Recopilar años y tipos presentes en sourceData
            sourceData.forEach(c => {
                if (c.date && c.type) {
                    const y = new Date(c.date).getFullYear();
                    years.push(y);
                    typeSet.add(c.type);
                }
            });
            const uniqueYears = [...new Set(years)].sort();
            const types = [...typeSet];
            // Inicializar contador año-tipo
            const counts = {};
            uniqueYears.forEach(y => {
                counts[y] = {};
                types.forEach(t => counts[y][t] = 0);
            });
            // Contar incidentes
            sourceData.forEach(c => {
                if (c.date && c.type) {
                    const y = new Date(c.date).getFullYear();
                    if (counts[y] && counts[y][c.type] !== undefined) {
                        counts[y][c.type]++;
                    }
                }
            });
            const yearLabels = uniqueYears.map(String);
            // Construir datasets por tipo
            const yearDatasets = types.map(type => ({
                label: type,
                data: uniqueYears.map(y => counts[y][type]),
                backgroundColor: getSemaforoColor(type),
                borderRadius: 4,
                borderWidth: 0,
                stack: 'Stack 0'
            }));
            const ctxYear = canvasYear.getContext('2d');
            chartIntelYearInstance = new Chart(ctxYear, {
                type: 'bar',
                data: {
                    labels: yearLabels,
                    datasets: yearDatasets.length ? yearDatasets : [{
                        label: 'Sin datos',
                        data: new Array(yearLabels.length).fill(0),
                        backgroundColor: '#e2e8f0'
                    }]
                },
                options: {
                    // Bars vertical (axis X = años)
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#0f172a',
                            titleFont: { size: 14, weight: 'bold' },
                            padding: 12,
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: { color: '#64748b', stepSize: 1 },
                            grid: { color: '#f1f5f9' }
                        },
                        y: {
                            ticks: { color: '#334155', font: { weight: '600' } },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }
}

// --- Intelligence Filters moved to main DOMContentLoaded ---

// ==========================================
// CIERRE DE ÓRDENES DE PATRULLA (PDF UPLOAD)
// ==========================================

window.openCloseOrderModal = function (orderId) {
    currentORDPATIdForCompliance = orderId;
    const modal = document.getElementById('closeOrderModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

window.closeCloseOrderModal = function () {
    currentORDPATIdForCompliance = null;
    const modal = document.getElementById('closeOrderModal');
    if (modal) {
        modal.style.display = 'none';
        const form = document.getElementById('closeOrderForm');
        if (form) form.reset();
    }
}

window.submitCloseOrder = function (event) {
    event.preventDefault();
    if (!currentORDPATIdForCompliance) return;

    const fileInput = document.getElementById('compliancePdfInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        showNotification('Debe adjuntar el archivo PDF de cumplimiento para cerrar la orden.', 'error');
        return;
    }

    const file = fileInput.files[0];
    if (file.type !== 'application/pdf') {
        showNotification('Solo se permiten archivos en formato PDF.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Pdf = e.target.result;

        // Encontrar y actualizar la orden de patrulla
        const orderIndex = patrolOrders.findIndex(op => op.id === currentORDPATIdForCompliance);
        if (orderIndex !== -1) {
            patrolOrders[orderIndex].status = 'cerrada';
            patrolOrders[orderIndex].closeDate = getCurrentOfficialDTG();
            patrolOrders[orderIndex].complianceFile = base64Pdf;

            saveData();
            renderORDPATTable();
            showNotification('Orden de Patrulla cerrada exitosamente con su cumplimiento archivado.');
            closeCloseOrderModal();
        } else {
            showNotification('Error al encontrar la Orden de Patrulla.', 'error');
        }
    };
    reader.readAsDataURL(file);
}

window.viewCompliancePDF = function (orderId) {
    const order = patrolOrders.find(op => op.id === orderId);
    if (order && order.complianceFile) {
        // Generar blob desde base64 para previsualización o descarga
        try {
            const arr = order.complianceFile.split(',');
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Abrir en nueva pestaña
            window.open(url, '_blank');
        } catch (error) {
            console.error("Error abriendo PDF:", error);
            showNotification('No se pudo abrir el archivo PDF.', 'error');
        }
    } else {
        showNotification('No se encontró el documento de cumplimiento para esta orden.', 'error');
    }
}

// -- RICH TEXT EDITORS --
function makeRichTextEditor(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    let editorDiv = el;
    const isTextarea = el.tagName.toLowerCase() === 'textarea';
    const defaultValue = isTextarea ? el.value.replace(/\n/g, '<br>') : el.innerHTML;

    if (isTextarea) {
        editorDiv = document.createElement('div');
        editorDiv.id = el.id;
        editorDiv.className = (el.className || '') + ' rich-text-editor';
        editorDiv.contentEditable = "true";
        editorDiv.innerHTML = defaultValue;

        editorDiv.style.cssText = el.style.cssText;
        editorDiv.style.minHeight = el.rows ? (el.rows * 20 + 'px') : '60px';
        editorDiv.style.border = '1px solid #cbd5e1';
        editorDiv.style.padding = '8px';
        editorDiv.style.backgroundColor = '#ffffff';
        editorDiv.style.borderRadius = '4px';
        editorDiv.style.overflowY = 'auto';

        el.parentNode.replaceChild(editorDiv, el);

        Object.defineProperty(editorDiv, 'value', {
            get: function () { return this.innerHTML; },
            set: function (val) { this.innerHTML = val; }
        });

        if (el.form) {
            el.form.addEventListener('reset', () => {
                setTimeout(() => { editorDiv.innerHTML = defaultValue; }, 0);
            });
        }
    } else {
        editorDiv.classList.add('rich-text-editor');
        editorDiv.style.border = '1px solid #cbd5e1';
        editorDiv.style.borderRadius = '4px';
        editorDiv.style.backgroundColor = '#ffffff';

        if (typeof editorDiv.value === 'undefined') {
            Object.defineProperty(editorDiv, 'value', {
                get: function () { return this.innerHTML; },
                set: function (val) { this.innerHTML = val; }
            });
        }
    }
}

function createGlobalToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar-global';
    toolbar.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; background: #f8fafc; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; align-items: center; margin-bottom: 20px; margin-top: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); position: sticky; top: 0; z-index: 100;';

    const cmds = [
        { cmd: 'bold', icon: '<b>N</b>', title: 'Negrita' },
        { cmd: 'italic', icon: '<i>K</i>', title: 'Cursiva' },
        { cmd: 'underline', icon: '<u>S</u>', title: 'Subrayado' },
        { cmd: 'strikeThrough', icon: '<del>ab</del>', title: 'Tachado' },
        { cmd: 'subscript', icon: 'X<sub>2</sub>', title: 'Subíndice' },
        { cmd: 'superscript', icon: 'X<sup>2</sup>', title: 'Superíndice' },
        { separator: true },
        { cmd: 'justifyLeft', icon: 'Izq', title: 'Alinear Izquierda' },
        { cmd: 'justifyCenter', icon: 'Cen', title: 'Centrar' },
        { cmd: 'justifyRight', icon: 'Der', title: 'Alinear Derecha' },
        { cmd: 'justifyFull', icon: 'Jus', title: 'Justificar' },
        { separator: true },
        { cmd: 'outdent', icon: 'í† Nivel', title: 'Reducir Nivel de Lista' },
        { cmd: 'indent', icon: 'í†’ Nivel', title: 'Aumentar Nivel de Lista' },
    ];

    const toolbarTitle = document.createElement('div');
    toolbarTitle.style.cssText = 'font-weight: bold; font-size: 11px; color: #64748b; margin-right: 8px; letter-spacing: 0.5px;';
    toolbarTitle.innerHTML = 'íŸ“ FORMATO<br>DE TEXTO:';
    toolbar.appendChild(toolbarTitle);

    cmds.forEach(item => {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.style.cssText = 'width: 1px; height: 24px; background: #cbd5e1; margin: 0 4px;';
            toolbar.appendChild(sep);
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = item.icon;
        btn.title = item.title;
        btn.style.cssText = 'padding: 4px 8px; font-size: 12px; font-weight: 500; background: white; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; color: #334155; transition: all 0.2s ease;';
        btn.onmousedown = (e) => {
            e.preventDefault(); // Mantiene el foco en el editor actual
            document.execCommand(item.cmd, false, null);
        };
        btn.onmouseenter = () => btn.style.background = '#e2e8f0';
        btn.onmouseleave = () => btn.style.background = 'white';
        toolbar.appendChild(btn);
    });

    const sep2 = document.createElement('div');
    sep2.style.cssText = 'width: 1px; height: 24px; background: #cbd5e1; margin: 0 4px;';
    toolbar.appendChild(sep2);

    // Color controls
    const colorContainer = document.createElement('div');
    colorContainer.style.cssText = 'display: flex; gap: 8px; align-items: center; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; background: white; margin-right: 4px;';

    const hlWrapper = document.createElement('div');
    hlWrapper.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    const hlIcon = document.createElement('span');
    hlIcon.innerHTML = 'íŸ–í¸';
    hlIcon.title = 'Color de Resaltado';
    hlIcon.style.cssText = 'font-size: 12px; cursor: help;';
    const hlColor = document.createElement('input');
    hlColor.type = 'color';
    hlColor.value = '#ffff00';
    hlColor.title = 'Color de Resaltado';
    hlColor.style.cssText = 'width: 20px; height: 20px; padding: 0; border: none; cursor: pointer; background: transparent;';
    hlColor.onchange = (e) => {
        document.execCommand('hiliteColor', false, e.target.value);
    };
    hlWrapper.appendChild(hlIcon);
    hlWrapper.appendChild(hlColor);

    const tcWrapper = document.createElement('div');
    tcWrapper.style.cssText = 'display: flex; align-items: center; gap: 4px; border-left: 1px solid #cbd5e1; padding-left: 8px;';
    const tcIcon = document.createElement('span');
    tcIcon.innerHTML = '<strong style="color:red; font-size: 14px;">A</strong>';
    tcIcon.title = 'Color de Fuente';
    tcIcon.style.cssText = 'font-size: 12px; cursor: help;';
    const tcColor = document.createElement('input');
    tcColor.type = 'color';
    tcColor.value = '#000000';
    tcColor.title = 'Color de Fuente';
    tcColor.style.cssText = 'width: 20px; height: 20px; padding: 0; border: none; cursor: pointer; background: transparent;';
    tcColor.onchange = (e) => {
        document.execCommand('foreColor', false, e.target.value);
    };
    tcWrapper.appendChild(tcIcon);
    tcWrapper.appendChild(tcColor);

    colorContainer.appendChild(hlWrapper);
    colorContainer.appendChild(tcWrapper);
    toolbar.appendChild(colorContainer);

    const fontLabel = document.createElement('span');
    fontLabel.style.cssText = 'font-size: 11px; font-weight: bold; color: #64748b; margin-left: 8px; margin-right: 4px;';
    fontLabel.textContent = 'Fuente:';
    toolbar.appendChild(fontLabel);

    const fontSelect = document.createElement('select');
    fontSelect.style.cssText = 'padding: 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; color: #334155; margin-right: 8px; cursor: pointer; font-weight: 500;';
    ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana'].forEach(font => {
        const opt = document.createElement('option');
        opt.value = font;
        opt.textContent = font;
        fontSelect.appendChild(opt);
    });
    fontSelect.onchange = (e) => {
        document.execCommand('fontName', false, e.target.value);
    };
    toolbar.appendChild(fontSelect);

    const sizeLabel = document.createElement('span');
    sizeLabel.style.cssText = 'font-size: 11px; font-weight: bold; color: #64748b; margin-right: 4px;';
    sizeLabel.textContent = 'Tamaño:';
    toolbar.appendChild(sizeLabel);

    const sizeSelect = document.createElement('select');
    sizeSelect.style.cssText = 'padding: 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; color: #334155; cursor: pointer; font-weight: 500;';
    [
        { val: 1, text: '10 pt' },
        { val: 2, text: '13 pt' },
        { val: 3, text: '16 pt (Normal)' },
        { val: 4, text: '18 pt' },
        { val: 5, text: '24 pt' },
        { val: 6, text: '32 pt' },
        { val: 7, text: '48 pt' }
    ].forEach(size => {
        const opt = document.createElement('option');
        opt.value = size.val;
        opt.textContent = size.text;
        if (size.val === 3) opt.selected = true;
        sizeSelect.appendChild(opt);
    });
    sizeSelect.onchange = (e) => {
        document.execCommand('fontSize', false, e.target.value);
    };
    toolbar.appendChild(sizeSelect);

    const listLibLabel = document.createElement('span');
    listLibLabel.style.cssText = 'font-size: 11px; font-weight: bold; color: #64748b; margin-left: 8px; margin-right: 4px; border-left: 1px solid #cbd5e1; padding-left: 8px;';
    listLibLabel.textContent = 'Numeración:';
    toolbar.appendChild(listLibLabel);

    const listLibSelect = document.createElement('select');
    listLibSelect.style.cssText = 'padding: 4px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; color: #334155; margin-right: 8px; cursor: pointer; font-weight: 500;';
    [
        { val: '', text: 'Estilo de lista...' },
        { val: 'decimal', text: '1. 2. 3.' },
        { val: 'upper-roman', text: 'I. II. III.' },
        { val: 'upper-alpha', text: 'A. B. C.' },
        { val: 'lower-alpha', text: 'a. b. c.' },
        { val: 'lower-roman', text: 'i. ii. iii.' },
        { val: 'disc', text: 'í€¢ Viñeta (círculo sólido)' },
        { val: 'circle', text: 'í—‹ Viñeta (círculo hueco)' },
        { val: 'square', text: 'í–  Viñeta (cuadrado)' }
    ].forEach(optData => {
        const opt = document.createElement('option');
        opt.value = optData.val;
        opt.textContent = optData.text;
        listLibSelect.appendChild(opt);
    });

    listLibSelect.onchange = (e) => {
        const val = e.target.value;
        if (!val) return;
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            let node = sel.anchorNode;
            // Buscar el elemento lista contenedor (OL o UL)
            while (node && node.nodeName !== 'OL' && node.nodeName !== 'UL' && (!node.classList || !node.classList.contains('rich-text-editor'))) {
                node = node.parentNode;
            }
            if (node && (node.nodeName === 'OL' || node.nodeName === 'UL')) {
                // Modifica el estilo de la lista en la que el usuario se encuentra
                node.style.listStyleType = val;
            } else {
                // Si no hay lista, crea una nueva (UL si es viñeta, OL si es número)
                const isBullet = ['disc', 'circle', 'square'].includes(val);
                document.execCommand(isBullet ? 'insertUnorderedList' : 'insertOrderedList', false, null);
                setTimeout(() => {
                    let n = window.getSelection().anchorNode;
                    while (n && n.nodeName !== 'OL' && n.nodeName !== 'UL' && (!n.classList || !n.classList.contains('rich-text-editor'))) {
                        n = n.parentNode;
                    }
                    if (n && (n.nodeName === 'OL' || n.nodeName === 'UL')) {
                        n.style.listStyleType = val;
                    }
                }, 10);
            }
        }
        e.target.value = ''; // resetea el dropdown
    };
    toolbar.appendChild(listLibSelect);

    return toolbar;
}

function initAllRichTextEditors() {
    // 1. Convertir textareas a div contenteditable
    const editors = [
        'ioResultadosRich', 'ioBTNarrative', 'ioComo', 'ioDondeManual', 'ioAccionesTomadas',
        'opHeaderText', 'opSituacionMain', 'opSituacionAmenaza', 'opSituacionPropias',
        'opMisionA', 'opMisionB', 'opIntencion', 'opConcepto', 'opTareasText',
        'opConducta', 'opCoordinacion', 'opLogAbastecimiento', 'opLogEvacuacion',
        'opLogPersonal', 'opMando', 'opComunicaciones'
    ];
    editors.forEach(id => makeRichTextEditor(id));

    // 2. Insertar una única toolbar global en ÓÓÓrdenes de Patrulla
    const patrolForm = document.getElementById('patrolOrderForm');
    if (patrolForm) {
        // Buscar la primera sección (Identificación)
        const firstSection = patrolForm.querySelector('.form-section');
        if (firstSection) {
            const tb = createGlobalToolbar();
            // Insertar justo después de la sección de Identificación
            firstSection.parentNode.insertBefore(tb, firstSection.nextSibling);
        }
    }

    // 3. Insertar una única toolbar global en Partes al Instante
    const instantForm = document.getElementById('instantOpsForm');
    if (instantForm) {
        // En Partes al Instante, la sección "Identificación" está en un div con estilo flex (Metadata Top)
        const narrativeDiv = document.getElementById('ioBTNarrative');
        if (narrativeDiv && narrativeDiv.parentNode) {
            const tb2 = createGlobalToolbar();
            // Insertar justo antes del div que contiene ioBTNarrative
            instantForm.insertBefore(tb2, narrativeDiv.parentNode);
        }
    }
}

// --- MOTOR DE ROTACION 21/7 ---
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (rotationStartDate) {
            const rotInput = document.getElementById('rotationStartDate');
            if (rotInput) rotInput.value = rotationStartDate;
        }
        if (rotationStartGroup) {
            rotationStartGroup = normalizeRotationGroup(rotationStartGroup);
            const rotGroupInput = document.getElementById('rotationStartGroup');
            if (rotGroupInput) rotGroupInput.value = rotationStartGroup;
        }
        updateRotationEngine();

        if (codescStartDate) {
            const cInput = document.getElementById('codescStartDate');
            if (cInput) cInput.value = codescStartDate;
        }
        if (codescStartGroup) {
            const cGroupInput = document.getElementById('codescStartGroup');
            if (cGroupInput) cGroupInput.value = codescStartGroup;
        }
        updateCodescEngine();
    }, 1000);
});

window.updateRotationEngine = async function () {
    const input = document.getElementById('rotationStartDate');
    const startGroupInput = document.getElementById('rotationStartGroup');
    const typeInput = document.getElementById('rotationType');

    if (startGroupInput) {
        rotationStartGroup = normalizeRotationGroup(startGroupInput.value);
        localStorage.setItem('rotationStartGroup', rotationStartGroup);
        await serverSave('rotationStartGroup', rotationStartGroup);
    } else if (!rotationStartGroup) {
        rotationStartGroup = 'GRUPO 1';
    }

    const rotationType = typeInput ? typeInput.value : (localStorage.getItem('rotationType') || '21/7');
    localStorage.setItem('rotationType', rotationType);

    if (!input || !input.value) {
        currentFrancoGroup = 'N/A';
        if (document.getElementById('rotCycleStatus')) {
            document.getElementById('rotCycleStatus').textContent = 'Semana -- (Dias --)';
        }
        if (document.getElementById('rotFrancoGroup')) {
            document.getElementById('rotFrancoGroup').textContent = 'N/A';
            document.getElementById('rotFrancoGroup').style.background = '#e2e8f0';
            document.getElementById('rotFrancoGroup').style.color = '#475569';
        }
        return;
    }

    const start = new Date(input.value + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = today - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const isFuture = diffDays < 0;

    const effectiveDiffDays = isFuture ? 0 : diffDays;

    let cycleLength, dayLabel, statusText;
    let francoGroupIndex;

    const groups = ['GRUPO 1', 'GRUPO 2', 'GRUPO 3', 'GRUPO 4'];
    const normalizeGroup = value => String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const legacyGroupMap = {
        'ALFA': 'GRUPO 1',
        'BRAVO': 'GRUPO 2',
        'CHARLIE': 'GRUPO 3',
        'DELTA': 'GRUPO 4'
    };
    const normalizedStartGroup = legacyGroupMap[normalizeGroup(rotationStartGroup)] || normalizeGroup(rotationStartGroup);
    const startIndex = groups.indexOf(normalizedStartGroup);

    if (rotationType === '12/4') {
        cycleLength = 16;
        const dayOfCycle = effectiveDiffDays % cycleLength;
        francoGroupIndex = (startIndex !== -1 ? (startIndex + Math.floor(dayOfCycle / 4)) % 4 : Math.floor(dayOfCycle / 4) % 4);
        dayLabel = `Día ${dayOfCycle + 1} de 16`;
        statusText = `Ciclo 12/4 - ${dayLabel}`;
    } else {
        cycleLength = 28;
        const dayOfCycle = effectiveDiffDays % cycleLength;
        const currentWeek = Math.floor(dayOfCycle / 7) + 1;
        francoGroupIndex = (startIndex !== -1 ? (startIndex + (currentWeek - 1)) % 4 : (currentWeek - 1) % 4);
        dayLabel = `Semana ${currentWeek} de 4 (Día ${dayOfCycle + 1} de 28)`;
        statusText = dayLabel;
    }

    currentFrancoGroup = groups[francoGroupIndex];
    const colors = {
        'GRUPO 1': '#3b82f6',
        'GRUPO 2': '#10b981',
        'GRUPO 3': '#f59e0b',
        'GRUPO 4': '#8b5cf6'
    };
    let francoColor = colors[currentFrancoGroup] || '#64748b';

    if (document.getElementById('rotCycleStatus')) {
        if (isFuture) {
            document.getElementById('rotCycleStatus').textContent = ` PROYECCIÓN Inicia Ciclo (Día 1)`;
            document.getElementById('rotCycleStatus').style.color = '#f59e0b';
        } else {
            document.getElementById('rotCycleStatus').textContent = statusText;
            document.getElementById('rotCycleStatus').style.color = '#3b82f6';
        }
    }
    const francoBadge = document.getElementById('rotFrancoGroup');
    if (francoBadge) {
        francoBadge.textContent = `Grupo ${currentFrancoGroup}${isFuture ? ' (Proyec.)' : ''}`;
        francoBadge.style.background = isFuture ? '#f59e0b' : francoColor;
        francoBadge.style.color = '#ffffff';
    }

    rotationStartDate = input.value;
    localStorage.setItem('rotationStartDate', rotationStartDate);
    await serverSave('rotationStartDate', rotationStartDate);
    if (typeof updatePersonnelStats === 'function') updatePersonnelStats();
};

window.updateCodescEngine = async function () {
    const input = document.getElementById('codescStartDate');
    const startGroupInput = document.getElementById('codescStartGroup');

    if (startGroupInput) {
        codescStartGroup = startGroupInput.value;
        localStorage.setItem('codescStartGroup', codescStartGroup);
        await serverSave('codescStartGroup', codescStartGroup);
    } else if (!codescStartGroup) {
        codescStartGroup = 'GOLF';
    }

    if (!input || !input.value) {
        if (document.getElementById('codescCycleStatus')) {
            document.getElementById('codescCycleStatus').textContent = 'Día --';
        }
        if (document.getElementById('codescFrancoBadge')) {
            document.getElementById('codescFrancoBadge').textContent = 'N/A';
        }
        return;
    }

    const start = new Date(input.value + (input.value.includes('T') ? '' : 'T00:00:00'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = today - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const isFuture = diffDays < 0;
    const effectiveDiffDays = isFuture ? 0 : diffDays;

    const cycleDay = effectiveDiffDays % 4;

    let currentFranco;
    if (codescStartGroup === 'GOLF') {
        currentFranco = (cycleDay < 2) ? 'GOLF' : 'FOXTROT';
    } else {
        currentFranco = (cycleDay < 2) ? 'FOXTROT' : 'GOLF';
    }

    if (document.getElementById('codescCycleStatus')) {
        if (isFuture) {
            document.getElementById('codescCycleStatus').textContent = `í³ PROYECCIÓN í€” Inicia Día 1`;
            document.getElementById('codescCycleStatus').style.color = '#f59e0b';
        } else {
            document.getElementById('codescCycleStatus').textContent = `Día ${cycleDay + 1} de 4 del ciclo 2x2`;
            document.getElementById('codescCycleStatus').style.color = '#e11d48';
        }
    }

    const francoBadge = document.getElementById('codescFrancoBadge');
    if (francoBadge) {
        francoBadge.textContent = `Grupo ${currentFranco}${isFuture ? ' (Proyec.)' : ''}`;
        francoBadge.style.background = isFuture ? '#f59e0b' : '#fff1f2';
        francoBadge.style.color = isFuture ? '#ffffff' : '#e11d48';
    }

    codescStartDate = input.value;
    localStorage.setItem('codescReferenceDate', codescStartDate);
    await serverSave('codescReferenceDate', codescStartDate);

    if (typeof updatePersonnelStats === 'function') updatePersonnelStats();
};

window.applyEchoRotationRegime = async function () {
    // Primero aseguramos que los cálculos del motor estén al día
    await updateRotationEngine();

    const startDateInput = document.getElementById('rotationStartDate');
    const typeInput = document.getElementById('rotationType');
    const rotationType = typeInput ? typeInput.value : (localStorage.getItem('rotationType') || '21/7');

    if (!startDateInput || !startDateInput.value) {
        showNotification('⚠️ Debe ingresar una Fecha de Inicio del Ciclo.', 'error');
        return;
    }

    if (typeof currentFrancoGroup === 'undefined' || !currentFrancoGroup) {
        showNotification('⚠️ Error al calcular el grupo. Verifique la fecha.', 'error');
        return;
    }

    const startDate = new Date(startDateInput.value + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const effectiveDay = diffDays < 0 ? 0 : diffDays;

    // Calcular el índice del día dentro del ciclo
    const cycleLength = rotationType === '12/4' ? 16 : 28;
    const currentDayIndex = (effectiveDay % cycleLength) + 1;

    const groupLabelMap = {
        'ALFA': 'GRUPO 1',
        'BRAVO': 'GRUPO 2',
        'CHARLIE': 'GRUPO 3',
        'DELTA': 'GRUPO 4'
    };
    const currentGroupLabel = groupLabelMap[currentFrancoGroup.toUpperCase()] || currentFrancoGroup.toUpperCase();

    const buildRotationLabel = (funcion, dayIndex) => {
        const label = `Día ${dayIndex}`;
        if (!funcion || !funcion.trim()) return label;
        return `${funcion.trim()} / ${label}`;
    };

    let count = 0;
    personnel.forEach(p => {
        if (isDesignatedOtherFunction(p.funcion)) return; // Exclude other functions
        const unitId = window.resolveOrgUnitId(p.grupoDestino);
        
        // El régimen 21/7 aplica a todo el personal de CODESC y GT ECHO (independientemente de si sus IDs son legacy o dinámicos)
        const isEchoOrCodesc = ['CODESC_NORTE', 'CODESC_SUR', 'UT_100.61.4', 'UT_100.61.5', 'GT_ECHO', 'CODESC'].includes(unitId) ||
                               (p.grupoDestino || '').toUpperCase().includes('ECHO') ||
                               (p.grupoDestino || '').toUpperCase().includes('CODES');

        if (isEchoOrCodesc) {
            const rot = (p.rotacion || '').toUpperCase();
            const personGroup = (p.rotacion || '').toUpperCase();
            const rotGroupLabel = groupLabelMap[rot] || '';
            const isFranco = personGroup === currentGroupLabel || rotGroupLabel === currentGroupLabel || rot === currentFrancoGroup.toUpperCase();
            if (isFranco) {
                p.condition = 'FRANCO';
                p.turno = 'FRANCO';
            } else {
                p.condition = 'OPERATIVO';
                p.turno = buildRotationLabel(p.funcion, currentDayIndex);
            }
            count++;
        }
    });

    if (count === 0) {
        showNotification('⚠️ No se encontró personal asignado a GT ECHO para distribuir.', 'warning');
    } else {
        saveData();
        renderPersonnelTable();
        updatePersonnelStats();
        if (typeof renderDistributionTable === 'function') renderDistributionTable();

        showNotification(`íœ… Régimen ${rotationType} aplicado a ${count} personas. Grupo en FRANCO: ${currentFrancoGroup}`);
    }
};

// Mantener alias para compatibilidad
window.applyEcho21_7Regime = window.applyEchoRotationRegime;





function updateDistributionStats(counts) {
    // GT ECHO
    const echoAlfa = document.getElementById('statGtEchoAlfa');
    const echoBravo = document.getElementById('statGtEchoBravo');
    const echoCharlie = document.getElementById('statGtEchoCharlie');
    const echoDelta = document.getElementById('statGtEchoDelta');
    if (echoAlfa) echoAlfa.textContent = counts.gtEcho['GRUPO 1'];
    if (echoBravo) echoBravo.textContent = counts.gtEcho['GRUPO 2'];
    if (echoCharlie) echoCharlie.textContent = counts.gtEcho['GRUPO 3'];
    if (echoDelta) echoDelta.textContent = counts.gtEcho['GRUPO 4'];

    // CODESC
    const codescFoxtrot = document.getElementById('statCodescFoxtrot');
    const codescGolf = document.getElementById('statCodescGolf');

    if (codescFoxtrot) codescFoxtrot.textContent = counts.codesc.FOXTROT;
    if (codescGolf) codescGolf.textContent = counts.codesc.GOLF;
}

// ==========================================================================
// --- DISTRIBUCION POR PUESTOS (CODESC / GT ECHO) ---
// ==========================================================================

window.toggleMultiSelect = function (btn) {
    const dropdown = btn.nextElementSibling;
    const isActive = dropdown.classList.contains('active');
    // Cerrar otros
    document.querySelectorAll('.multi-select-dropdown.active').forEach(d => d.classList.remove('active'));
    if (!isActive) dropdown.classList.add('active');
};

window.addPostRow = function (tbodyId, data = { name: '', schedule: '', funcion: [] }) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    // Obtener pool conforme a la sección (Puestos Fijos -> CODESC, Puestos de Apoyo -> GT ECHO)
    const isFixed = (tbodyId === 'fixedPostsBody');
    const targetPool = (typeof personnel !== 'undefined' ? personnel : []).filter(p => {
        if (isDesignatedOtherFunction(p.funcion)) return false;
        const cond = (p.condition || 'OPERATIVO').toUpperCase();
        if (cond === 'BAJA' || cond === 'INACTIVO') return false;
        
        const belongsToCodesc = window.isBelongingToUnit(p, 'CODESC');
        return isFixed ? belongsToCodesc : !belongsToCodesc;
    });
    const functions = [...new Set(targetPool.map(p => (p.funcion || 'OPERATIVO').toUpperCase()))].sort();

    const row = document.createElement('tr');
    row.className = 'post-config-row';

    // Manejar array de funciones
    const selectedFunctions = Array.isArray(data.funcion) ? data.funcion : (data.funcion ? [data.funcion] : []);

    // Generar opciones de función con checkboxes
    const functionOptionsHtml = functions.map(f => `
        <label class="multi-select-option">
            <input type="checkbox" value="${f}" ${selectedFunctions.includes(f) ? 'checked' : ''} 
                onchange="updateRowPersonnelCounts(this.closest('tr'));">
            <span>${f}</span>
        </label>
    `).join('');

    row.innerHTML = `
        <td style="padding: 5px;">
            <input type="text" class="post-name" value="${data.name}" placeholder="Puesto..." style="width: 100%; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
        </td>
        <td style="padding: 5px;">
            <input type="text" class="post-sched" value="${data.schedule}" placeholder="Horario..." style="width: 100%; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
        </td>
        <td style="padding: 5px;">
            <div class="multi-select-container">
                <div class="multi-select-trigger" onclick="toggleMultiSelect(this)">
                    <span class="trigger-label">-- Seleccionar Funciones --</span>
                    <span class="arrow"></span>
                </div>
                <div class="multi-select-dropdown">
                    ${functionOptionsHtml}
                </div>
                <div class="function-counts" style="font-size: 0.65rem; color: #64748b; margin-top: 4px; font-weight: 700;"></div>
            </div>
        </td>
        <td style="padding: 5px; text-align: center;">
            <button class="btn-action delete" onclick="this.closest('tr').remove(); if(window.syncMultiSelectDropdowns) window.syncMultiSelectDropdowns();" title="Eliminar">🗑️</button>
        </td>
    `;
    tbody.appendChild(row);

    // Actualizar conteos iniciales
    updateRowPersonnelCounts(row);

    // Cerrar dropdown cuando se hace clic fuera
    const closeDropdownHandler = (e) => {
        if (!e.target.closest('.multi-select-container')) {
            document.querySelectorAll('.multi-select-dropdown.active').forEach(d => d.classList.remove('active'));
        }
    };
    document.addEventListener('click', closeDropdownHandler);
    if (window.syncMultiSelectDropdowns) window.syncMultiSelectDropdowns();
};

window.syncPostFunctionDropdowns = function () {
    const dropdowns = document.querySelectorAll('.post-function');
    const selectedFunctions = new Set();

    // 1. Recopilar funciones seleccionadas
    dropdowns.forEach(select => {
        if (select.value) selectedFunctions.add(select.value);
    });

    // 2. Actualizar visibilidad de opciones en cada dropdown
    dropdowns.forEach(select => {
        const currentValue = select.value;
        const options = select.querySelectorAll('option');

        options.forEach(opt => {
            if (!opt.value) return; // Ignorar el "-- Seleccionar --"

            // Si la función está seleccionada en OTRO dropdown
            if (selectedFunctions.has(opt.value) && opt.value !== currentValue) {
                opt.disabled = true;
                opt.style.display = 'none';
            } else {
                opt.disabled = false;
                opt.style.display = 'block';
            }
        });
    });
};

window.updateRowPersonnelCounts = function (row) {
    const checkboxes = row.querySelectorAll('.multi-select-dropdown input[type=checkbox]:checked');
    const triggerLabel = row.querySelector('.trigger-label');
    const countsDiv = row.querySelector('.function-counts');
    const ofGrades = ['ALFG', 'TNFG', 'TNNV', 'CPCB', 'CPFG', 'CPNV'];

    const selectedFunctions = Array.from(checkboxes).map(cb => cb.value.toUpperCase().trim());

    // Actualizar label del trigger
    if (selectedFunctions.length === 0) {
        triggerLabel.textContent = '-- Seleccionar Funciones --';
        triggerLabel.style.color = '#94a3b8';
    } else if (selectedFunctions.length <= 2) {
        triggerLabel.textContent = selectedFunctions.join(', ');
        triggerLabel.style.color = '#1e293b';
    } else {
        triggerLabel.textContent = `${selectedFunctions.length} funciones seleccionadas`;
        triggerLabel.style.color = 'var(--accent-primary)';
    }

    // Determinar pool conforme a la sección (Puestos Fijos -> CODESC, Puestos de Apoyo -> GT ECHO)
    const isFixed = row.closest('tbody')?.id === 'fixedPostsBody';
    let availablePool = (typeof personnel !== 'undefined' ? personnel : []).filter(p => {
        if (isDesignatedOtherFunction(p.funcion)) return false;
        const cond = (p.condition || 'OPERATIVO').toUpperCase();
        if (cond === 'BAJA' || cond === 'INACTIVO') return false;
        
        const belongsToCodesc = window.isBelongingToUnit(p, 'CODESC');
        return isFixed ? belongsToCodesc : !belongsToCodesc;
    });

    if (selectedFunctions.length > 0) {
        // Filtrar personal que tenga CUALQUIERA de las funciones seleccionadas
        const matchedPeople = availablePool.filter(p => {
            const pFunc = (p.funcion || '').toUpperCase().trim();
            return selectedFunctions.includes(pFunc);
        });

        // Si no se encontró nadie con esas funciones específicas (distribución no generada aún),
        // mostrar el total del pool como referencia amplia
        if (matchedPeople.length === 0 && availablePool.length > 0) {
            const ofCount = availablePool.filter(p => ofGrades.includes((p.grade || '').toUpperCase())).length;
            const trCount = availablePool.filter(p => !ofGrades.includes((p.grade || '').toUpperCase())).length;
            countsDiv.textContent = `Pool global: ${ofCount} OF / ${trCount} TR (sin distrib. táctica)`;
        } else {
            const ofCount = matchedPeople.filter(p => ofGrades.includes((p.grade || '').toUpperCase())).length;
            const trCount = matchedPeople.filter(p => !ofGrades.includes((p.grade || '').toUpperCase())).length;
            countsDiv.textContent = `Pool disponible: ${ofCount} OF / ${trCount} TR`;
        }
    } else {
        // Sin función seleccionada: mostrar total del pool correspondiente
        const ofCount = availablePool.filter(p => ofGrades.includes((p.grade || '').toUpperCase())).length;
        const trCount = availablePool.filter(p => !ofGrades.includes((p.grade || '').toUpperCase())).length;
        countsDiv.textContent = `Pool ${isFixed ? 'CODESC' : 'GT ECHO'}: ${ofCount} OF / ${trCount} TR`;
    }
    if (window.syncMultiSelectDropdowns) window.syncMultiSelectDropdowns();
};


window.syncMultiSelectDropdowns = function () {
    // Permitir que la misma función sea seleccionada en múltiples filas
    // (el mismo personal puede emplearse en distintos puestos simultáneamente)
    const allCheckboxes = document.querySelectorAll('.multi-select-dropdown input[type=checkbox]');
    allCheckboxes.forEach(cb => {
        cb.disabled = false;
        const label = cb.closest('label.multi-select-option');
        if (label) label.style.display = 'flex';
    });
};;


window.resetPostConfig = function (force = false) {
    const fixedBody = document.getElementById('fixedPostsBody');
    const supportBody = document.getElementById('supportPostsBody');
    if (!fixedBody || !supportBody) return;

    if (!force && (fixedBody.children.length > 0 || supportBody.children.length > 0)) return;

    fixedBody.innerHTML = '';
    supportBody.innerHTML = '';

    // Valores iniciales (sin asignación de personal aún)
    addPostRow('fixedPostsBody', { name: 'PUESTO DE GUARDIA 1', schedule: '08:00 - 08:00' });
    addPostRow('fixedPostsBody', { name: 'PUESTO DE GUARDIA 2', schedule: '08:00 - 08:00' });

    // Ejemplo GT ECHO
    addPostRow('supportPostsBody', { name: 'PATRULLAJE GT ECHO', schedule: 'TURNO 1' });

    showNotification("Vista de puestos configurada con valores base. Seleccione la función y el personal para cada uno.");
};

window.generatePostAssignments = function () {
    if (!personnel || personnel.length === 0) {
        showNotification("No hay personal para distribuir.");
        return;
    }

    const config = { fixed: [], support: [] };
    const assignedIds = new Set();

    const collect = (tbodyId, targetArray) => {
        document.querySelectorAll(`#${tbodyId} tr`).forEach(row => {
            const checkboxes = row.querySelectorAll('.multi-select-dropdown input[type=checkbox]:checked');
            const postObj = {
                name: row.querySelector('.post-name').value.trim(),
                schedule: row.querySelector('.post-sched').value.trim(),
                assigned: [],
                funciones: Array.from(checkboxes).map(cb => cb.value)
            };
            targetArray.push(postObj);
        });
    };

    collect('fixedPostsBody', config.fixed);
    collect('supportPostsBody', config.support);

    const allConfigPosts = [...config.fixed, ...config.support];
    const operative = personnel.filter(p => !isDesignatedOtherFunction(p.funcion) && (p.condition || 'OPERATIVO').toUpperCase() === 'OPERATIVO');
    const echoPool = operative.filter(p => !window.isBelongingToUnit(p, 'CODESC'));
    const codescPool = operative.filter(p => window.isBelongingToUnit(p, 'CODESC'));

    // Definir orden de rangos para distribución equitativa
    const ofOrder = ['CPNV', 'CPFG', 'CPCB', 'TNNV', 'TNFG', 'ALFG'];
    const sortPersonnelByRank = (assignedArray) => {
        return [...assignedArray].sort((a, b) => {
            const gradeA = (a.grade || '').toUpperCase();
            const gradeB = (b.grade || '').toUpperCase();
            const idxA = ofOrder.indexOf(gradeA);
            const idxB = ofOrder.indexOf(gradeB);

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return gradeA.localeCompare(gradeB) || (a.name || '').localeCompare(b.name || '');
        });
    };

    // 3. Obtener funciones de Puestos Fijos y distribuir el CODESC Pool en ellos
    const fixedFunctions = new Set();
    config.fixed.forEach(post => {
        if (post.funciones) {
            post.funciones.forEach(fn => fixedFunctions.add(fn.toUpperCase()));
        }
    });

    let matchingCodesc = codescPool.filter(p => fixedFunctions.has((p.funcion || 'OTRO').toUpperCase()));
    matchingCodesc = sortPersonnelByRank(matchingCodesc);

    matchingCodesc.forEach((p) => {
        const isOfficer = ofOrder.includes((p.grade || '').toUpperCase());
        let bestPost = null;
        let minTypeCount = Infinity;
        let minTotalCount = Infinity;

        config.fixed.forEach(post => {
            // Solo considerar puestos fijos que incluyan la función del tripulante
            if (!post.funciones || !post.funciones.map(f => f.toUpperCase()).includes((p.funcion || '').toUpperCase())) return;

            let typeCount = 0;
            post.assigned.forEach(ap => {
                const apIsOfficer = ofOrder.includes((ap.grade || '').toUpperCase());
                if (apIsOfficer === isOfficer) typeCount++;
            });

            let totalCount = post.assigned.length;

            if (typeCount < minTypeCount) {
                minTypeCount = typeCount;
                minTotalCount = totalCount;
                bestPost = post;
            } else if (typeCount === minTypeCount) {
                if (totalCount < minTotalCount) {
                    minTotalCount = totalCount;
                    bestPost = post;
                }
            }
        });

        if (bestPost && !bestPost.assigned.find(ap => ap.id === p.id)) {
            bestPost.assigned.push(p);
            assignedIds.add(String(p.id));
        }
    });

    // 4. Obtener funciones de Puestos de Apoyo y distribuir el ECHO Pool en ellos
    const supportFunctions = new Set();
    config.support.forEach(post => {
        if (post.funciones) {
            post.funciones.forEach(fn => supportFunctions.add(fn.toUpperCase()));
        }
    });

    let matchingEcho = echoPool.filter(p => supportFunctions.has((p.funcion || 'OTRO').toUpperCase()));
    matchingEcho = sortPersonnelByRank(matchingEcho);

    matchingEcho.forEach((p) => {
        const isOfficer = ofOrder.includes((p.grade || '').toUpperCase());
        let bestPost = null;
        let minTypeCount = Infinity;
        let minTotalCount = Infinity;

        config.support.forEach(post => {
            // Solo considerar puestos de apoyo que incluyan la función del tripulante
            if (!post.funciones || !post.funciones.map(f => f.toUpperCase()).includes((p.funcion || '').toUpperCase())) return;

            let typeCount = 0;
            post.assigned.forEach(ap => {
                const apIsOfficer = ofOrder.includes((ap.grade || '').toUpperCase());
                if (apIsOfficer === isOfficer) typeCount++;
            });

            let totalCount = post.assigned.length;

            if (typeCount < minTypeCount) {
                minTypeCount = typeCount;
                minTotalCount = totalCount;
                bestPost = post;
            } else if (typeCount === minTypeCount) {
                if (totalCount < minTotalCount) {
                    minTotalCount = totalCount;
                    bestPost = post;
                }
            }
        });

        if (bestPost && !bestPost.assigned.find(ap => ap.id === p.id)) {
            bestPost.assigned.push(p);
            assignedIds.add(String(p.id));
        }
    });

    // 5. Personal CODESC sobrante (Sin función específica asignada, va al reactor)
    const remainingCodesc = codescPool.filter(p => !assignedIds.has(String(p.id)));
    if (remainingCodesc.length > 0) {
        config.fixed.push({
            name: 'PUESTO DE REACCIÓN (CODESC)',
            schedule: '24 HORAS',
            assigned: remainingCodesc
        });
    }

    // 6. Personal ECHO sobrante (O sin función asignada a puesto)
    const remainingEcho = echoPool.filter(p => !assignedIds.has(String(p.id)));
    if (remainingEcho.length > 0) {
        config.support.push({
            name: 'PERSONAL DISPONIBLE / RELEVO',
            schedule: 'PENDIENTE',
            assigned: remainingEcho
        });
    }

    // 6. Ordenar Personal por Puesto: (Ya tenemos nuestra función sortPersonnelByRank)
    allConfigPosts.forEach(post => {
        if (post.assigned.length > 0) post.assigned = sortPersonnelByRank(post.assigned);
    });
    // También ordenar los sobrantes
    config.fixed.forEach(post => {
        if (post.assigned.length > 0) post.assigned = sortPersonnelByRank(post.assigned);
    });
    config.support.forEach(post => {
        if (post.assigned.length > 0) post.assigned = sortPersonnelByRank(post.assigned);
    });

    renderPostDistResults(config);
    lastDistributionConfig = config;
    saveAppState('lastDistributionConfig', JSON.stringify(config));
};

window.renderPostDistResults = function (config) {
    const container = document.getElementById('postDistResults');
    if (!container) return;
    container.innerHTML = '';

    const createCard = (post) => {
        const card = document.createElement('div');
        card.style.cssText = "background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); transition: transform 0.2s;";
        card.onmouseover = () => card.style.transform = "translateY(-4px)";
        card.onmouseout = () => card.style.transform = "translateY(0)";

        // Ordenar personal: Oficiales primero (rango alto a bajo), luego Tripulantes
        const ofOrder = ['CPNV', 'CPFG', 'CPCB', 'TNNV', 'TNFG', 'ALFG'];
        const sortedAssigned = [...post.assigned].sort((a, b) => {
            const gradeA = (a.grade || '').toUpperCase();
            const gradeB = (b.grade || '').toUpperCase();
            const idxA = ofOrder.indexOf(gradeA);
            const idxB = ofOrder.indexOf(gradeB);

            // Si ambos son oficiales (o ambos no lo son)
            if (idxA !== -1 && idxB !== -1) return idxA - idxB; // Menor índice = mayor rango
            if (idxA !== -1) return -1; // A es oficial, B no
            if (idxB !== -1) return 1;  // B es oficial, A no

            // Ambos son tripulantes, ordenar por grado y nombre
            return gradeA.localeCompare(gradeB) || (a.name || '').localeCompare(b.name || '');
        });

        let listHtml = sortedAssigned.map(p => {
            const isOf = ofOrder.includes((p.grade || '').toUpperCase());
            const color = isOf ? '#3b82f6' : '#475569';
            return `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; padding: 5px 0; border-bottom: 1px dashed #f1f5f9;">
                      <div style="display: flex; flex-direction: column;">
                        <span><b style="color: ${color};">${p.grade}</b> ${p.name}</span>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <span style="font-size: 0.65rem; color: #94a3b8;">${p.rotacion || 'N/A'}</span>
                            ${p.assignedShift ? `<span style="font-size: 0.6rem; background: #f1f5f9; color: #64748b; padding: 1px 4px; border-radius: 4px;">${p.assignedShift}</span>` : ''}
                        </div>
                      </div>
                      <button onclick="openEditDistributionModal(${p.id})" style="border: none; background: #eff6ff; color: #3b82f6; cursor: pointer; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; transition: all 0.2s;" title="Reasignar Puesto/Turno">✏️</button>
                    </div>`;
        }).join('') || '<p style="font-size:0.7rem; color:#94a3b8; text-align:center; padding:10px;">Sin asignación</p>';

        card.innerHTML = `
            <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                   <h4 style="margin:0; font-size: 0.9rem; color: #1e293b;">${post.name}</h4>
                   <p style="margin:2px 0 0; font-size: 0.65rem; color: #64748b; font-weight: 700;">’ ${post.schedule}</p>
                </div>
                <span style="background: #eff6ff; color: #3b82f6; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 800;">${post.assigned.length}</span>
            </div>
            <div style="max-height: 250px; overflow-y: auto;">${listHtml}</div>
        `;
        return card;
    };

    const wrapper = document.createElement('div');
    wrapper.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;";

    [...config.fixed, ...config.support].forEach(p => wrapper.appendChild(createCard(p)));
    container.appendChild(wrapper);

    const totalOp = personnel.filter(p => !isDesignatedOtherFunction(p.funcion) && (p.condition || 'OPERATIVO').toUpperCase() === 'OPERATIVO').length;
    document.getElementById('distSummaryLabel').innerHTML = `<b>Personal Operativo Total:</b> ${totalOp}`;

    // Guardar estado y actualizar dashboard
    lastDistributionConfig = config;
    saveAppState('lastDistributionConfig', JSON.stringify(config));

    if (typeof updatePersonnelStats === 'function') updatePersonnelStats();

    showNotification("Distribución generada. Se aplicó validación de descanso (evitar turnos seguidos).");
};

window.exportPostAssignmentsPDF = function () {
    // Si es un string (desde localStorage), parsearlo
    let config = lastDistributionConfig;
    if (typeof config === 'string') {
        try { config = JSON.parse(config); } catch (e) { console.error(e); }
    }

    if (!config || (!config.fixed && !config.support)) {
        showNotification("No hay una distribución generada para exportar.", "warning");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 15;
    const pageWidth = doc.internal.pageSize.width;

    // Título Principal
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("DISTRIBUCIÓN DE PERSONAL POR PUESTOS", pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    const fecha = new Date().toLocaleString();
    doc.text(`Generado el: ${fecha}`, margin, 28);
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, 30, pageWidth - margin, 30);

    let currentY = 38;

    const allPosts = [...(config.fixed || []), ...(config.support || [])];

    allPosts.forEach((post, index) => {
        if (!post.assigned || post.assigned.length === 0) return;

        // Verificar si necesitamos nueva página ANTES de dibujar el encabezado del puesto
        if (currentY > 240) {
            doc.addPage();
            currentY = 20;
        }

        // Título del Puesto
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30, 64, 175); // Azul oscuro
        doc.text(`${post.name.toUpperCase()}`, margin, currentY);

        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Horario: ${post.schedule}`, margin + 2, currentY + 4);

        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        currentY += 8;

        const tableBody = post.assigned.map(p => [
            p.grade || '---',
            p.name || '---',
            p.rotacion || '---',
            p.assignedShift || p.turno || 'GENERAL',
            p.assignedTime || 'N/A'
        ]);

        doc.autoTable({
            startY: currentY,
            head: [['GRADO', 'NOMBRES Y APELLIDOS', 'GRUPO', 'TURNO', 'HORARIO ESPECIFICO']],
            body: tableBody,
            margin: { left: margin, right: margin },
            theme: 'grid',
            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, halign: 'center' },
            bodyStyles: { fontSize: 8, textColor: 50 },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 20, halign: 'center' },
                3: { cellWidth: 30, halign: 'center' },
                4: { cellWidth: 35, halign: 'center' }
            },
            styles: { overflow: 'linebreak', cellPadding: 2 },
            didDrawPage: (data) => {
                // Footers o encabezados por página si fuera necesario
            }
        });

        currentY = doc.lastAutoTable.finalY + 12;
    });

    // Pie de página en todas las hojas
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Fuerza de Tarea 100.51 - Sistema OMAI - Página ${i} de ${pageCount}`, pageWidth / 2, 285, { align: 'center' });
    }

    doc.save(`Asignacion_Puestos_${new Date().toISOString().split('T')[0]}.pdf`);
    showNotification("PDF de asignación generado con éxito.");
};

// Inicialización automática diferida
setTimeout(() => { if (typeof resetPostConfig === 'function') resetPostConfig(); }, 2000);

// ==========================================================================
// --- GESTIÓN DE ÓRDENES TíCTICAS (TEMPLATE-BASED: ECHO / 100.51) ---
// ==========================================================================

window.saveTemplatePatrolOrder = function (type, contentId) {
    const refInput = document.getElementById('ref_' + contentId);
    const contentEl = document.getElementById(contentId);
    const displaySpan = document.getElementById('displayRef_' + contentId);

    let orderRef = '';

    // Si el usuario editó directamente en el papel, sincronizar hacia el input de control
    if (displaySpan) {
        orderRef = displaySpan.textContent.trim();
        if (refInput) {
            refInput.value = orderRef;
        }
    } else if (refInput) {
        orderRef = refInput.value.trim();
    }

    if (!orderRef) {
        alert("Por favor ingrese una REFERENCIA para la orden antes de guardar.");
        if (displaySpan) displaySpan.focus();
        else if (refInput) refInput.focus();
        return;
    }

    // Capturar el estado actual del documento (HTML editado)
    const orderData = {
        id: 'tmpl_' + Date.now(),
        reference: orderRef,
        type: type, // ECHO o GT51
        date: new Date().toLocaleDateString(),
        timestamp: Date.now(),
        status: 'abierta', // abierta o cerrada
        fulfillmentSaved: false,
        htmlContent: contentEl.innerHTML
    };

    // Si ya existe una con la misma referencia, preguntar si sobrescribir
    const existingIndex = templatePatrolOrders.findIndex(o => o.reference === orderRef);
    if (existingIndex !== -1) {
        if (!confirm("Ya existe una orden guardada con esta referencia. ííDesea actualizarla?")) return;
        // Mantener el status original al actualizar
        orderData.status = templatePatrolOrders[existingIndex].status;
        orderData.fulfillmentSaved = templatePatrolOrders[existingIndex].fulfillmentSaved;
        templatePatrolOrders[existingIndex] = orderData;
    } else {
        templatePatrolOrders.push(orderData);
    }

    saveAppState('templatePatrolOrders', templatePatrolOrders);
    showNotification("Orden de Patrulla " + type + " guardada exitosamente en el registro.");
    refreshTemplateRegistry();
};

window.resetTemplateForm = function (contentId) {
    if (!confirm("Desea limpiar el formulario para una nueva orden? Se perderán los cambios locales no guardados.")) return;

    const contentEl = document.getElementById(contentId);
    const refInput = document.getElementById('ref_' + contentId);

    // Generar nuevos valores automáticos
    const dtg = generateMilitaryDTG();
    const seq = getNextPatrolOrderSequence();
    const newRef = `ARE-ORDPAT-UT100.51.4-${dtg}-${seq}-P`;

    if (refInput) refInput.value = newRef;

    // Limpiar celdas editables y áreas de texto
    contentEl.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.textContent = '';
    });

    contentEl.querySelectorAll('textarea').forEach(ta => {
        ta.value = '';
        ta.textContent = '';
    });

    // Actualizar el campo de texto dentro del papel (si existe)
    const displaySpan = document.getElementById('displayRef_' + contentId);
    if (displaySpan) displaySpan.textContent = newRef;

    showNotification("Nueva Orden: " + newRef);
};

window.refreshTemplateRegistry = function () {
    const tbodyEcho = document.getElementById('templateOrdersTableBodyEcho');
    const tbody51 = document.getElementById('templateOrdersTableBody51');
    const emptyMsgEcho = document.getElementById('emptyRegistryMsgEcho');
    const emptyMsg51 = document.getElementById('emptyRegistryMsg51');

    if (tbodyEcho) tbodyEcho.innerHTML = '';
    if (tbody51) tbody51.innerHTML = '';

    if (!templatePatrolOrders || templatePatrolOrders.length === 0) {
        if (emptyMsgEcho) emptyMsgEcho.style.display = 'block';
        if (emptyMsg51) emptyMsg51.style.display = 'block';
        return;
    }

    const echoOrders = templatePatrolOrders.filter(o => o.type === 'ECHO').sort((a, b) => b.timestamp - a.timestamp);
    const gt51Orders = templatePatrolOrders.filter(o => o.type === 'GT51').sort((a, b) => b.timestamp - a.timestamp);

    if (emptyMsgEcho) emptyMsgEcho.style.display = echoOrders.length === 0 ? 'block' : 'none';
    if (emptyMsg51) emptyMsg51.style.display = gt51Orders.length === 0 ? 'block' : 'none';

    const renderRows = (orders, tbody) => {
        if (!tbody) return;
        orders.forEach(order => {
            const tr = document.createElement('tr');

            const statusColor = order.status === 'cerrada' ? '#10b981' : '#f59e0b';
            const fulfillmentStatus = order.fulfillmentSaved ? 'CARGADO' : 'PENDIENTE';

            tr.innerHTML = `
                <td>${order.date}</td>
                <td style="font-weight:bold; color:var(--primary); font-family:monospace;">${order.reference}</td>
                <td><span style="background:${statusColor}22; color:${statusColor}; padding:4px 8px; border-radius:6px; font-weight:800; font-size:0.7rem;">${order.status.toUpperCase()}</span></td>
                <td style="font-size:0.75rem; font-weight:600;">${fulfillmentStatus}</td>
                <td class="table-actions" style="display:flex; gap:8px; justify-content:center;">
                    <button onclick="modifyTemplateOrder('${order.id}')" class="btn-action" title="Modificar Contenido" style="background:#f1f5f9;"></button>
                    <button onclick="viewTemplateOrderPDF('${order.id}')" class="btn-action" title="Ver / Imprimir PDF" style="background:#eff6ff; color:#3b82f6;"></button>
                    <button onclick="closeTemplateOrder('${order.id}')" class="btn-action" style="background:#fff7ed; color:#f97316;" title="Cerrar si hay cumplimiento">Cerrar</button>
                    <button onclick="deleteTemplateOrder('${order.id}')" class="delete-btn" title="Eliminar Registro" style="padding:4px 8px;">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    renderRows(echoOrders, tbodyEcho);
    renderRows(gt51Orders, tbody51);
};

window.modifyTemplateOrder = function (id) {
    const order = templatePatrolOrders.find(o => o.id === id);
    if (!order) return;

    const viewId = order.type === 'ECHO' ? 'ordpatEchoView' : 'ordpat51View';
    const contentId = order.type === 'ECHO' ? 'ordpatEchoContent' : 'ordpat51Content';

    showAppView(viewId);

    // Cargar contenido guardado
    const contentEl = document.getElementById(contentId);
    const refInput = document.getElementById('ref_' + contentId);

    if (contentEl) contentEl.innerHTML = order.htmlContent;
    if (refInput) refInput.value = order.reference;

    showNotification("Editando orden: " + order.reference);
};

window.viewTemplateOrderPDF = function (id) {
    const order = templatePatrolOrders.find(o => o.id === id);
    if (!order) return;

    // Usar el contenido guardado para imprimir
    const tempDiv = document.createElement('div');
    tempDiv.id = 'tempPrintDiv';
    tempDiv.style.display = 'none';
    tempDiv.innerHTML = order.htmlContent;
    document.body.appendChild(tempDiv);

    // Pasar la referencia para el encabezado
    printPatrolOrder('tempPrintDiv', order.reference);

    setTimeout(() => tempDiv.remove(), 3000);
};

window.closeTemplateOrder = function (id) {
    const order = templatePatrolOrders.find(o => o.id === id);
    if (!order) return;

    if (order.status === 'cerrada') {
        showNotification("Esta orden ya está cerrada.", "info");
        return;
    }

    // Verificar si existe cumplimiento (en Partes al Instante o Partes Operacionales)
    const searchRef = normalizeOpText(order.reference);
    const hasFulfillment = instantOps.some(op =>
        normalizeOpText(op.orderRef).includes(searchRef) ||
        normalizeOpText(op.description).includes(searchRef)
    );

    if (!hasFulfillment) {
        const manual = confirm("NO se detectó un Parte al Instante vinculado a esta referencia (" + order.reference + ").\n\nííDesea marcar el cumplimiento manualmente y cerrar la orden de todas formas?");
        if (!manual) return;
    }

    order.status = 'cerrada';
    order.fulfillmentSaved = true;
    order.closeDate = getCurrentOfficialDTG(); // Registrar fecha de cierre
    saveAppState('templatePatrolOrders', templatePatrolOrders);
    refreshTemplateRegistry();
    showNotification("Orden " + order.reference + " CERRADA correctamente.", "success");
};

window.deleteTemplateOrder = function (id) {
    if (!confirm("Seguro que desea eliminar permanentemente este registro del historial?")) return;
    templatePatrolOrders = templatePatrolOrders.filter(o => o.id !== id);
    saveAppState('templatePatrolOrders', templatePatrolOrders);
    refreshTemplateRegistry();
    showNotification("Registro eliminado.");
};

// Integración con menú lateral
const origShowAppView = window.showAppView;
window.showAppView = function (viewId) {
    if (origShowAppView) origShowAppView(viewId);
    if (viewId === 'patrolTemplateRegistryView') refreshTemplateRegistry();
};

// Inicialización diferida para la tabla
setTimeout(() => { if (typeof refreshTemplateRegistry === 'function') refreshTemplateRegistry(); }, 3000);

/**
 * Genera el DTG en formato militar: 200800R-MAY-2026
 */
function generateMilitaryDTG() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const year = now.getFullYear();
    const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
    const month = months[now.getMonth()];

    // Usamos 'R' para el huso horario Romeo (Ecuador)
    return `${day}${hour}${minute}R-${month}-${year}`;
}

/**
 * Obtiene el siguiente número secuencial para óÓÓrdenes de patrulla
 */
function getNextPatrolOrderSequence() {
    if (!templatePatrolOrders || templatePatrolOrders.length === 0) return "5001";

    // Buscar el número más alto en las referencias existentes (asumiendo formato -XXXX-P)
    let maxSeq = 5000;
    templatePatrolOrders.forEach(o => {
        const parts = (o.reference || "").split('-');
        if (parts.length >= 2) {
            const seqStr = parts[parts.length - 2]; // El penúltimo es el número (ej: 5117)
            const seq = parseInt(seqStr);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
    });

    return (maxSeq + 1).toString();
}


// ==========================================================================
// --- SELECTOR DE PERSONAL PARA ANEXO "A" DE ÓRDENES DE PATRULLA ---
// ==========================================================================

window.loadPersonalFromDistribucion = function (unit) {
    const listId = unit === 'Echo' ? 'personalListEcho' : 'personalList51';
    const selectId = unit === 'Echo' ? 'puestoPickerEcho' : 'puestoPicker51';
    const listEl = document.getElementById(listId);
    const selectEl = document.getElementById(selectId);
    if (!listEl || !selectEl) return;

    let config = lastDistributionConfig;
    if (typeof config === 'string') { try { config = JSON.parse(config); } catch (e) { config = null; } }

    if (!config || (!config.fixed && !config.support)) {
        listEl.innerHTML = '<p style="text-align:center; color:#ef4444; font-size:0.75rem; padding:1rem;">⚠️ No hay una distribución de puestos generada. Genere la distribución primero.</p>';
        return;
    }

    // Consolidar todos los puestos con personal asignado
    const allPosts = [...(config.fixed || []), ...(config.support || [])];
    const activePosts = allPosts.filter(p => p.assigned && p.assigned.length > 0);

    // Guardar selección actual
    const currentSelection = selectEl.value;

    // Limpiar y re-poblar el select SOLO con puestos activados (SIN DUPLICADOS)
    const firstOption = selectEl.options[0];
    selectEl.innerHTML = '';
    selectEl.appendChild(firstOption);

    const seenNames = new Set();
    activePosts.forEach(post => {
        if (!seenNames.has(post.name)) {
            const opt = document.createElement('option');
            opt.value = post.name;
            opt.textContent = post.name;
            selectEl.appendChild(opt);
            seenNames.add(post.name);
        }
    });

    // Restaurar selección si sigue siendo válida
    if (currentSelection && seenNames.has(currentSelection)) {
        selectEl.value = currentSelection;
    }

    // Obtener el filtro actual
    const selectedPost = selectEl.value;

    // Filtrar los puestos a mostrar
    const postsToShow = selectedPost
        ? activePosts.filter(p => p.name === selectedPost)
        : activePosts;

    // Renderizar encabezado de puesto seleccionado
    let html = '';
    if (selectedPost) {
        html += `<div style="background: #f1f5f9; padding: 10px; border-radius: 8px 8px 0 0; border: 1px solid #e2e8f0; border-bottom: none; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 800; font-size: 0.85rem; color: #1e3a8a; text-transform: uppercase;">íŸ“ PUESTO: ${selectedPost}</span>
            <span id="recordCount_${listId}" style="font-size: 0.7rem; background: #3b82f6; color: white; padding: 2px 8px; border-radius: 10px; font-weight: 700;">--</span>
        </div>`;
    }

    html += `<table style="width:100%; border-collapse:collapse; font-size:0.75rem; border: 1px solid #e2e8f0;">`;
    html += `<thead><tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">` +
        `<th style="padding:6px 10px; text-align:left; width:30px;"><input type="checkbox" id="selectAll_${listId}" onchange="toggleAllPersonalCheckboxes('${listId}', this.checked)" title="Seleccionar todo"></th>` +
        (selectedPost ? '' : '<th style="padding:6px 10px; text-align:left;">PUESTO</th>') +
        '<th style="padding:6px 10px; text-align:left;">FUNCIÓN</th>' +
        '<th style="padding:6px 10px; text-align:left;">GRAD/ESP</th>' +
        '<th style="padding:6px 10px; text-align:left;">APELLIDOS Y NOMBRES</th>' +
        '<th style="padding:6px 10px; text-align:left;">CÉDULA</th>' +
        '</tr></thead><tbody>';

    let count = 0;
    postsToShow.forEach(post => {
        post.assigned.forEach((p, idx) => {
            count++;
            const pid = `pick_${unit}_${post.name.replace(/\s+/g, '_')}_${p.id || idx}`;
            const grade = p.grade || '---';
            const spec = p.specialty || '';
            const funcionValue = p.funcion || '---';
            const fullGrade = spec ? `${grade} ${spec}` : grade;
            html += `<tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onclick="document.getElementById('${pid}').click()">
                <td style="padding:5px 10px;"><input type="checkbox" id="${pid}"
                    data-name="${(p.name || '').replace(/"/g, '&quot;')}"
                    data-grade="${fullGrade.replace(/"/g, '&quot;')}"
                    data-cedula="${p.idNum || ''}"
                    data-funcion="${funcionValue.replace(/"/g, '&quot;')}"
                    data-puesto="${post.name.replace(/"/g, '&quot;')}"></td>
                ${selectedPost ? '' : `<td style="padding:5px 10px; color:#64748b; font-weight:600;">${post.name}</td>`}
                <td style="padding:5px 10px; color:#7c3aed; font-weight:600;">${funcionValue}</td>
                <td style="padding:5px 10px; font-weight:700; color:#1e40af;">${fullGrade}</td>
                <td style="padding:5px 10px;">${p.name || '---'}</td>
                <td style="padding:5px 10px; color:#64748b;">${p.idNum || '---'}</td>
            </tr>`;
        });
    });

    if (count === 0) {
        html += `<tr><td colspan="6" style="padding:2rem; text-align:center; color:#94a3b8;">No hay personal asignado en la distribución para esta selección.</td></tr>`;
    }

    html += '</tbody></table>';
    listEl.innerHTML = html;

    // Actualizar contador
    const counter = document.getElementById(`recordCount_${listId}`);
    if (counter) counter.innerText = `${count} efectivo(s)`;
};

window.toggleAllPersonalCheckboxes = function (listId, checked) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = checked);
};

window.insertPersonalToAnexoA = function (unit) {
    const listId = unit === 'Echo' ? 'personalListEcho' : 'personalList51';
    const tbodyId = unit === 'Echo' ? 'anexoATbodyEcho' : 'anexoATbody51';

    const listEl = document.getElementById(listId);
    const tbody = document.getElementById(tbodyId);
    if (!listEl || !tbody) return;

    const checked = listEl.querySelectorAll('input[type=checkbox]:checked');
    if (checked.length === 0) {
        showNotification('⚠️ Seleccione al menos un efectivo de la lista.', 'warning');
        return;
    }

    // Limpiar tabla completamente antes de insertar
    tbody.innerHTML = '';

    // Determinar el siguiente número de orden
    let nextOrd = 1;

    // Arma por defecto según grado
    const ofGrades = ['ALFG', 'TNFG', 'TNNV', 'CPCB', 'CPFG', 'CPNV'];
    const getWeapon = (grade) => {
        const g = (grade || '').toUpperCase().split(' ')[0];
        return ofGrades.includes(g) ? 'PISTOLA 9MM' : 'FUSIL HK';
    };
    const getMunicion = (grade) => {
        const g = (grade || '').toUpperCase().split(' ')[0];
        return ofGrades.includes(g) ? '15' : '30';
    };

    checked.forEach(cb => {
        const name = cb.dataset.name || '';
        const grade = cb.dataset.grade || '';
        const cedula = cb.dataset.cedula || '';
        if (!name && !grade && !cedula) return;
        const weapon = getWeapon(grade);
        const municion = getMunicion(grade);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td contenteditable="true">${nextOrd}</td>
            <td contenteditable="true">${grade}</td>
            <td contenteditable="true">${name}</td>
            <td contenteditable="true">${weapon}</td>
            <td contenteditable="true">${municion}</td>
            <td contenteditable="true">${cedula}</td>
        `;
        tbody.appendChild(tr);
        nextOrd++;
    });

    showNotification(`íœ… ${checked.length} efectivo(s) insertados en el ANEXO "A".`, 'success');

    // Desmarcar todos
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
};

window.filterAnexoTable = function (unit, query) {
    const tbodyId = unit === 'Echo' ? 'anexoATbodyEcho' : 'anexoATbody51';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    const q = query.toLowerCase().trim();

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(q)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    // Si la búsqueda está vacía, asegurar que todo sea visible
    if (!q) {
        rows.forEach(row => row.style.display = '');
    }
};

// Registrar listeners para que el cambio en el select cargue e inserte automáticamente
try {
    const eSelect = document.getElementById('puestoPickerEcho');
    if (eSelect) eSelect.addEventListener('change', () => loadPersonalFromDistribucion('Echo'));
    const p51 = document.getElementById('puestoPicker51');
    if (p51) p51.addEventListener('change', () => loadPersonalFromDistribucion('51'));
} catch (e) { console.error('Error registrando listeners ANEXO A', e); }

// ==========================================================================
// ===== MÓDULO DE CHOFERES (2x2 BABOR / ESTRIBOR) =========================
// ==========================================================================

// Variable global de choferes (declarada aquÍsi no existe en el scope externo)
if (typeof choferes === 'undefined') { var choferes = []; }

function handleChoferSubmit(e) {
    e.preventDefault();
    const grade = document.getElementById('cGrade').value;
    const esp = document.getElementById('cEspecialidad').value.trim();
    const name = document.getElementById('cName').value.trim().toUpperCase();
    const idNum = document.getElementById('cId').value.trim();
    const condicion = 'OPERATIVO';
    const unit = document.getElementById('cUnit').value.trim().toUpperCase();
    const contact = document.getElementById('cContact').value.trim();
    const grupo = document.getElementById('cGrupoDestino').value;
    const funcion = (document.getElementById('cFuncion') ? document.getElementById('cFuncion').value.trim().toUpperCase() : 'CHOFER');
    const guardia = document.getElementById('cGuardia').value;

    const submitBtn = document.getElementById('submitChoferBtn');
    const editId = submitBtn.dataset.editId || null;

    if (editId) {
        const idx = choferes.findIndex(c => String(c.id) === String(editId));
        if (idx !== -1) {
            choferes[idx] = { ...choferes[idx], grade, esp, name, idNum, unit, contact, grupo, funcion, guardia };
            showNotification('Chofer actualizado correctamente.');
        }
        delete submitBtn.dataset.editId;
        submitBtn.textContent = 'Registrar Chofer';
        submitBtn.style.backgroundColor = '';
    } else {
        const exists = choferes.find(c => c.idNum === idNum);
        if (exists) {
            showNotification('⚠️ Ya existe un chofer con esa cédula.', 'warning');
            return;
        }
        choferes.push({ id: Date.now(), grade, esp, name, idNum, condicion, unit, contact, grupo, funcion, guardia });
        showNotification('Chofer registrado con éxito.');
        updatePersonnelStats();
    }
    saveData();
    renderChoferesTable();
    e.target.reset();
    document.getElementById('cEspecialidad').value = 'Chofer';
    if (document.getElementById('cFuncion')) document.getElementById('cFuncion').value = 'CHOFER';
}

function handleChoferExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);

        let imported = 0;
        let skipped = 0;
        const now = Date.now();

        json.forEach((row, index) => {
            const getVal = (possibleKeys) => {
                for (let key of possibleKeys) {
                    if (row[key] !== undefined && row[key] !== null) return row[key];
                    let altKey = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                    // Buscar en las llaves del objeto row ignorando mayusculas/minusculas
                    for (let rowKey in row) {
                        let normalizedRowKey = rowKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                        if (normalizedRowKey === altKey) return row[rowKey];
                    }
                }
                return null;
            };

            let idNum = String(getVal(['Cí‰DULA', 'CEDULA', 'IDENTIFICACIÓN', 'IDENTIFICACION', 'ID', 'DOCUMENTO']) || '').trim();
            if (!idNum || idNum === "") return;

            const existingIdx = choferes.findIndex(c => String(c.idNum).trim() === idNum);

            const choferData = {
                grade: String(getVal(['GRADO', 'RANGO']) || 'S/G').toUpperCase(),
                esp: String(getVal(['ESPECIALIDAD', 'ESP']) || 'CHOFER').toUpperCase(),
                name: String(getVal(['NOMBRE', 'APELLIDOS Y NOMBRES', 'NOMBRES', 'PERSONAL']) || 'S/N').toUpperCase(),
                idNum: idNum,
                condicion: 'OPERATIVO',
                unit: String(getVal(['REPARTO', 'UNIDAD', 'REFE']) || 'S/R').toUpperCase(),
                contact: String(getVal(['CONTACTO', 'TELEFONO', 'CELULAR', 'TELí‰FONO']) || 'S/N'),
                grupo: window.resolveOrgUnitId(getVal(['GT ECHO/CODESC', 'DESTINO', 'U. OPERATIVA', 'DIVISION']), row),
                funcion: String(getVal(['FUNCIÓN', 'FUNCION', 'CARGO', 'PUESTO', 'ASIGNACION']) || 'CHOFER').toUpperCase(),
                guardia: String(getVal(['GRUPO', 'ROTACIÓN', 'ROTACION', 'GUARDIA', 'TURNO', 'ROT']) || 'GRUPO 1').toUpperCase()
            };

            if (existingIdx !== -1) {
                // Actualizar existente
                choferes[existingIdx] = { ...choferes[existingIdx], ...choferData };
                skipped++; // Usaremos esto como contador de actualizados para el mensaje
            } else {
                // Insertar nuevo
                choferes.push({
                    id: now + index + Math.floor(Math.random() * 1000),
                    ...choferData
                });
                imported++;
            }
        });

        if (imported > 0 || skipped > 0) {
            saveData();
            renderChoferesTable();
            updatePersonnelStats();
            let msg = `íœ… Proceso completado.`;
            if (imported > 0) msg += ` ${imported} nuevos registrados.`;
            if (skipped > 0) msg += ` ${skipped} registros existentes fueron actualizados con nuevos datos.`;
            showNotification(msg, 'success');
        } else {
            showNotification('No se encontraron registros nuevos válidos para importar.', 'warning');
        }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

function renderChoferesTable() {
    const tbody = document.getElementById('tableBodyChoferes');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!Array.isArray(choferes) || choferes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#94a3b8; padding:1.5rem; font-style:italic;">No hay conductores registrados.</td></tr>`;
        return;
    }

    const divisions = ['BABOR', 'ESTRIBOR'];

    divisions.forEach(div => {
        const list = choferes.filter(c => normalizeGroup(c.guardia) === div);
        if (list.length === 0 && choferes.filter(c => !divisions.includes(normalizeGroup(c.guardia))).length === 0) return;

        // Subcabecera de División
        const headerRow = document.createElement('tr');
        headerRow.style.backgroundColor = div === 'BABOR' ? '#eff6ff' : '#fff7ed';
        headerRow.innerHTML = `
            <td colspan="10" style="padding: 10px 15px; font-weight: 800; color: ${div === 'BABOR' ? '#1e40af' : '#9a3412'}; border-bottom: 2px solid #cbd5e1;">
                DIVISION ${div} (${list.length} efectivos)
            </td>
        `;
        tbody.appendChild(headerRow);

        list.forEach(c => {
            const unitId = window.resolveOrgUnitId(c.grupo);
            const unitObj = window.orgUnits.find(u => u.id === unitId);
            const groupDestName = unitObj ? unitObj.name : unitId;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:700;">${c.grade || 'S/G'}</td>
                <td>${c.esp || 'Chofer'}</td>
                <td>${c.name || 'S/N'}</td>
                <td>${c.idNum || 'S/C'}</td>
                <td>${c.unit || 'S/U'}</td>
                <td>${c.contact || 'S/N'}</td>
                <td>${groupDestName}</td>
                <td>${c.funcion || 'CHOFER'}</td>
                <td>${c.guardia || 'S/G'}</td>
                <td class="table-actions">
                    <button class="btn-action edit" onclick="editChofer(${c.id})" title="Editar">✏️</button>
                    <button class="btn-action" onclick="returnToGeneralGroups(${c.id})" title="Volver a Grupos Generales" style="background:#dcfce7; color:#166534;">👥</button>
                    <button class="btn-action delete" onclick="deleteChofer(${c.id})" title="Eliminar">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    });

    // Mostrar también los que no tienen división asignada o tienen grupos antiguos
    const others = choferes.filter(c => !divisions.includes(normalizeGroup(c.guardia)));
    if (others.length > 0) {
        const hOthers = document.createElement('tr');
        hOthers.style.backgroundColor = '#f8fafc';
        hOthers.innerHTML = `<td colspan="10" style="padding: 10px 15px; font-weight: 800; color: #64748b; border-bottom: 2px solid #cbd5e1;">OTROS / SIN DIVISIÓN (${others.length})</td>`;
        tbody.appendChild(hOthers);
        others.forEach(c => {
            const unitId = window.resolveOrgUnitId(c.grupo);
            const unitObj = window.orgUnits.find(u => u.id === unitId);
            const groupDestName = unitObj ? unitObj.name : unitId;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:700;">${c.grade || 'S/G'}</td>
                <td>${c.esp || 'Chofer'}</td>
                <td>${c.name || 'S/N'}</td>
                <td>${c.idNum || 'S/C'}</td>
                <td>${c.unit || 'S/U'}</td>
                <td>${c.contact || 'S/N'}</td>
                <td>${groupDestName}</td>
                <td>${c.funcion || 'CHOFER'}</td>
                <td>${c.guardia || 'S/G'}</td>
                <td class="table-actions">
                    <button class="btn-action edit" onclick="editChofer(${c.id})" title="Editar">✏️</button>
                    <button class="btn-action" onclick="returnToGeneralGroups(${c.id})" title="Volver a Grupos Generales" style="background:#dcfce7; color:#166534;">👥</button>
                    <button class="btn-action delete" onclick="deleteChofer(${c.id})" title="Eliminar">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function editChofer(id) {
    const c = choferes.find(x => x.id === id);
    if (!c) return;
    document.getElementById('cGrade').value = c.grade;
    document.getElementById('cEspecialidad').value = c.esp;
    document.getElementById('cName').value = c.name;
    document.getElementById('cId').value = c.idNum;
    document.getElementById('cUnit').value = c.unit;
    document.getElementById('cContact').value = c.contact;
    document.getElementById('cGrupoDestino').value = c.grupo || 'GT ECHO';
    if (document.getElementById('cFuncion')) document.getElementById('cFuncion').value = c.funcion || 'CHOFER';
    document.getElementById('cGuardia').value = c.guardia || 'GRUPO 1';
    const btn = document.getElementById('submitChoferBtn');
    btn.textContent = 'Actualizar Chofer';
    btn.style.backgroundColor = '#f59e0b';
    btn.dataset.editId = id;
    const formEl = document.getElementById('choferForm');
    if (formEl) {
        const firstFocusable = formEl.querySelector('input,select,textarea,button');
        if (firstFocusable && typeof firstFocusable.focus === 'function') {
            try { firstFocusable.focus({ preventScroll: true }); } catch (err) { firstFocusable.focus(); }
        }
    }
}

function deleteChofer(id) {
    if (!confirm('Eliminar este chofer del registro?')) return;
    choferes = choferes.filter(c => c.id !== id);
    saveData();
    renderChoferesTable();
    showNotification('Chofer eliminado.');
}

function returnToGeneralGroups(id) {
    const c = choferes.find(x => x.id === id);
    if (!c) return;

    if (confirm(`Devolver a ${c.grade} ${c.name} a los grupos generales? Se retirará de la lista de conductores.`)) {
        choferes = choferes.filter(x => x.id !== id);
        saveData();
        renderChoferesTable();
        showNotification(`${c.grade} ${c.name} ha sido devuelto a los grupos generales.`);
    }
}

// ---- Cargar choferes en el panel selector de la Orden de Patrulla ----
window.loadChoferesForPatrol = function (unit) {
    // El panel selector de choferes usa el mismo listEl / checkbox container
    // que el de personal normal. Filtramos por guardia según unidad:
    // Se muestran los choferes OPERATIVOS para que el usuario elija.
    const listId = unit === 'Echo' ? 'personalListEcho' : 'personalList51';
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const choferesActivos = (choferes || []).filter(c => c.condicion === 'OPERATIVO');

    if (choferesActivos.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color:#ef4444; font-size:0.75rem; padding:1rem;">⚠️ No hay choferes OPERATIVOS registrados. Regístrelos en Logística í†’ Choferes.</p>';
        return;
    }

    let html = '<table style="width:100%; border-collapse:collapse; font-size:0.75rem;">';
    html += '<thead><tr style="background:#f3e8ff; border-bottom:2px solid #c4b5fd;">' +
        '<th style="padding:6px 10px; text-align:left; width:30px;">íœ”</th>' +
        '<th style="padding:6px 10px; text-align:left;">GUARDIA</th>' +
        '<th style="padding:6px 10px; text-align:left;">GRAD/ESP</th>' +
        '<th style="padding:6px 10px; text-align:left;">APELLIDOS Y NOMBRES</th>' +
        '<th style="padding:6px 10px; text-align:left;">Cí‰DULA</th>' +
        '</tr></thead><tbody>';

    choferesActivos.forEach((c, idx) => {
        const pid = `chofPick_${unit}_${c.id || idx}`;
        const fullGrade = c.esp ? `${c.grade} ${c.esp}` : c.grade;
        const gColor = c.guardia === 'BABOR' ? '#1d4ed8' : '#065f46';
        const gBadge = `<span style="background:${gColor}; color:white; border-radius:4px; padding:1px 6px; font-size:0.65rem; font-weight:700;">${c.guardia}</span>`;
        html += `<tr style="border-bottom:1px solid #f1f5f9; cursor:pointer; background:rgba(139,92,246,0.04);" onclick="document.getElementById('${pid}').click()">
            <td style="padding:5px 10px;"><input type="checkbox" id="${pid}"
                data-name="${(c.name || '').replace(/"/g, '&quot;')}"
                data-grade="${fullGrade.replace(/"/g, '&quot;')}"
                data-cedula="${c.idNum || ''}"
                data-is-chofer="true"
                data-puesto="CHOFER"></td>
            <td style="padding:5px 10px;">${gBadge}</td>
            <td style="padding:5px 10px; font-weight:700; color:#7c3aed;">${fullGrade}</td>
            <td style="padding:5px 10px; font-style:italic; font-weight:700;">${c.name || '---'}</td>
            <td style="padding:5px 10px; color:#64748b;">${c.idNum || '---'}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    listEl.innerHTML = html;
};

// Parchear insertPersonalToAnexoA para que los choferes aparezcan en negrita-cursiva
const _origInsert = window.insertPersonalToAnexoA;
window.insertPersonalToAnexoA = function (unit) {
    const listId = unit === 'Echo' ? 'personalListEcho' : 'personalList51';
    const tbodyId = unit === 'Echo' ? 'anexoATbodyEcho' : 'anexoATbody51';
    const listEl = document.getElementById(listId);
    const tbody = document.getElementById(tbodyId);
    if (!listEl || !tbody) return;

    const checked = listEl.querySelectorAll('input[type=checkbox]:checked');
    if (checked.length === 0) {
        showNotification('⚠️ Seleccione al menos un efectivo de la lista.', 'warning');
        return;
    }

    // Limpiar tabla completamente antes de insertar
    tbody.innerHTML = '';

    let nextOrd = 1;

    const ofGrades = ['ALFG', 'TNFG', 'TNNV', 'CPCB', 'CPFG', 'CPNV'];
    const getWeapon = (g) => { const x = (g || '').toUpperCase().split(' ')[0]; return ofGrades.includes(x) ? 'PISTOLA 9MM' : 'FUSIL HK'; };
    const getMun = (g) => { const x = (g || '').toUpperCase().split(' ')[0]; return ofGrades.includes(x) ? '15' : '30'; };

    checked.forEach(cb => {
        const name = cb.dataset.name || '';
        const grade = cb.dataset.grade || '';
        const cedula = cb.dataset.cedula || '';
        if (!name && !grade && !cedula) return;
        const isChofer = cb.dataset.isChofer === 'true';
        const weapon = isChofer ? 'CHOFER' : getWeapon(grade);
        const municion = isChofer ? '-' : getMun(grade);

        // Estilo especial para choferes: negrita + cursiva
        const styleCell = isChofer
            ? 'style="font-weight:700; font-style:italic;"'
            : '';

        const tr = document.createElement('tr');
        if (isChofer) tr.style.cssText = 'font-weight:700; font-style:italic;';
        tr.innerHTML = `
            <td contenteditable="true" ${styleCell}>${nextOrd}</td>
            <td contenteditable="true" ${styleCell}>${grade}</td>
            <td contenteditable="true" ${styleCell}>${name}</td>
            <td contenteditable="true" ${styleCell}>${weapon}</td>
            <td contenteditable="true" ${styleCell}>${municion}</td>
            <td contenteditable="true" ${styleCell}>${cedula}</td>
        `;
        tbody.appendChild(tr);
        nextOrd++;
    });

    showNotification(`íœ… ${checked.length} efectivo(s) insertados en el ANEXO "A".`, 'success');
    listEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
};

// --- KMZ LOADER LOGIC ---
var operationAreasLayer = null;

function initKMZLoader() {
    console.log("Inicializando Cargador de KMZ...");

    // Crear grupo de capas para áreas de operación
    operationAreasLayer = L.layerGroup().addTo(window.map);
    if (kmzControl) {
        kmzControl.addOverlay(operationAreasLayer, "íreas de Operación (KMZ)");
    }

    const loadKMZBtn = document.getElementById('loadKMZ');
    const kmzInput = document.getElementById('kmzInput');

    if (!loadKMZBtn || !kmzInput) {
        console.warn("Elementos de carga KMZ no encontrados en el DOM.");
        return;
    }

    loadKMZBtn.addEventListener('click', (e) => {
        e.preventDefault();
        kmzInput.click();
    });

    kmzInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const isKml = file.name.toLowerCase().endsWith('.kml');
        const isKmz = file.name.toLowerCase().endsWith('.kmz');

        if (!isKml && !isKmz) {
            showNotification("íŒ Formato de archivo no soportado. Use .kml o .kmz", "error");
            return;
        }

        showNotification(`Procesando: ${file.name}...`, 'info');

        const reader = new FileReader();
        reader.onload = async function (evt) {
            try {
                let kmlText = '';

                if (isKmz) {
                    const zip = await JSZip.loadAsync(evt.target.result);
                    const kmlFileName = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'));

                    if (!kmlFileName) {
                        throw new Error("No se encontró un archivo KML dentro del KMZ.");
                    }
                    kmlText = await zip.file(kmlFileName).async('string');
                } else {
                    // Es un KML plano
                    kmlText = evt.target.result;
                }

                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(kmlText, 'text/xml');

                // Verificar si hubo errores de parseo XML
                const parserError = kmlDoc.getElementsByTagName('parsererror');
                if (parserError.length > 0) {
                    throw new Error("Error al analizar el contenido XML del archivo.");
                }

                const tj = window.togeojson || window.toGeoJSON;
                if (!tj) {
                    throw new Error("La librería de conversión KMZ no se ha cargado correctamente.");
                }
                const geojson = tj.kml(kmlDoc);

                if (!geojson || !geojson.features || geojson.features.length === 0) {
                    throw new Error("El archivo no contiene geometrías válidas (puntos, líneas o polígonos).");
                }

                const newLayer = L.geoJSON(geojson, {
                    style: function (feature) {
                        return {
                            color: feature.properties.stroke || '#ff7800',
                            weight: feature.properties['stroke-width'] || 2,
                            opacity: feature.properties['stroke-opacity'] || 0.6,
                            fillColor: feature.properties.fill || '#ff7800',
                            fillOpacity: feature.properties['fill-opacity'] || 0.2
                        };
                    },
                    onEachFeature: function (feature, layer) {
                        // Guardar nombre inicial
                        if (feature.properties && feature.properties.name) {
                            layer.featureName = feature.properties.name;
                            layer.bindPopup(`<b>Nombre:</b> ${layer.featureName}<br>${feature.properties.description || ''}`);
                        }

                        // HABILITAR EDICIÓN DE PROPIEDADES (Clic Derecho)
                        layer.on('contextmenu', (e) => {
                            try {
                                if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
                                currentPropertyLayer = layer;
                                window.openPropertiesModal(layer);
                            } catch (err) {
                                console.error("Error opening properties for KMZ layer:", err);
                            }
                        });

                        // Agregar a los items dibujados para permitir edición de puntos y persistencia
                        if (drawnItems) {
                            drawnItems.addLayer(layer);
                        }
                    }
                }).addTo(operationAreasLayer);

                // Persistir los elementos importados para que aparezcan al recargar
                if (typeof saveDrawnItems === 'function') {
                    saveDrawnItems();
                }

                // Ajustar vista si hay capas
                try {
                    const bounds = newLayer.getBounds();
                    if (bounds.isValid()) {
                        window.map.fitBounds(bounds);
                    }
                } catch (e) {
                    console.warn("No se pudo ajustar la vista a los límites de la capa:", e);
                }

                showNotification(`íœ… "${file.name}" cargado con éxito.`, "success");
            } catch (error) {
                console.error("Error procesando KMZ/KML:", error);
                showNotification(`íŒ Error: ${error.message}`, "error");
            }
        };

        if (isKmz) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    });
}

// ==========================================================================
// === MÓDULO DE PURGA Y GESTIÓN DE DATOS (SOLO ADMINISTRADOR) ==============
// ==========================================================================

const PURGE_MASTER_KEY = 'omai2024';
let _currentPurgeTarget = null;

window.openPurgeModal = function (target, label) {
    _currentPurgeTarget = target;
    const modal = document.getElementById('purgeConfirmModal');
    const lbl = document.getElementById('purgeTargetLabel');
    const pass = document.getElementById('purgePasswordInput');
    const err = document.getElementById('purgeErrorMsg');
    if (lbl) lbl.textContent = label;
    if (pass) pass.value = '';
    if (err) err.style.display = 'none';
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => { if (pass) pass.focus(); }, 100);
    }
};

window.closePurgeModal = function () {
    _currentPurgeTarget = null;
    const modal = document.getElementById('purgeConfirmModal');
    if (modal) modal.style.display = 'none';
};

window.executePurge = async function () {
    const pass = document.getElementById('purgePasswordInput');
    const err = document.getElementById('purgeErrorMsg');
    const inputVal = pass ? pass.value.trim() : '';

    if (!inputVal) {
        showNotification("La clave no puede estar vacía", "error");
        return;
    }

    let verified = false;
    try {
        const res = await fetch(`${API_BASE}/verify-purge-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: inputVal })
        });
        if (res.ok) {
            const data = await res.json();
            verified = data.success === true;
        }
    } catch (e) {
        console.warn('Error verifying key with server, falling back to local verification:', e);
        // Fallback local
        const storedMasterKey = window._purgeKey || PURGE_MASTER_KEY;
        verified = (inputVal === storedMasterKey);
    }

    if (!verified) {
        if (err) err.style.display = 'block';
        if (pass) { pass.value = ''; pass.focus(); }
        return;
    }

    if (err) err.style.display = 'none';

    if (!_currentPurgeTarget) { closePurgeModal(); return; }

    const keysMap = {
        'gyepersonal': () => { personnel = []; saveAppState('gyepersonal', JSON.stringify([])); if (typeof renderPersonnelTable === 'function') renderPersonnelTable(); updatePersonnelStats(); },
        'gyecrimes': () => { crimes = []; saveAppState('gyecrimes', JSON.stringify([])); if (typeof renderTable === 'function') renderTable(); if (typeof refreshMarkers === 'function') refreshMarkers(); if (typeof refreshHeatLayer === 'function') refreshHeatLayer(); },
        'patrolOrders': () => { patrolOrders = []; saveAppState('patrolOrders', JSON.stringify([])); renderORDPATTable(); renderHistoricalPatrolTable(); },
        'instantOps': () => { instantOps = []; saveAppState('instantOps', JSON.stringify([])); if (typeof renderInstantOpsTable === 'function') renderInstantOpsTable(); },
        'lastDistributionConfig': () => { lastDistributionConfig = null; guardAssignments = []; specialAssignments = []; saveAppState('lastDistributionConfig', JSON.stringify(null)); saveAppState('guardAssignments', JSON.stringify([])); saveAppState('specialAssignments', JSON.stringify([])); if (typeof renderDistributionTable === 'function') renderDistributionTable(); }
    };

    if (_currentPurgeTarget === 'ALL') {
        Object.values(keysMap).forEach(fn => { try { fn(); } catch (e) { console.error('Purge error:', e); } });
        opsEvents = []; saveAppState('opsEvents', JSON.stringify([]));
        baborPersonnel = []; saveAppState('baborPersonnel', JSON.stringify([]));
        estriborPersonnel = []; saveAppState('estriborPersonnel', JSON.stringify([]));
        templatePatrolOrders = []; saveAppState('templatePatrolOrders', JSON.stringify([]));
        vehicles = []; saveAppState('gyevehicles', JSON.stringify([]));
        choferes = []; saveAppState('gyechoferes', JSON.stringify([]));
        commandPostPersonnel = []; saveAppState('commandPostPersonnel', JSON.stringify([]));
        logActionToServer('íŸ’¥ REALIZÓ UNA PURGA TOTAL DEL SISTEMA');
        showNotification('íŸ’¥ PURGA TOTAL completada. Todos los datos operativos fueron eliminados.', 'error');
    } else if (keysMap[_currentPurgeTarget]) {
        keysMap[_currentPurgeTarget]();
        logActionToServer(`Purgó datos del módulo: ${_currentPurgeTarget}`);
        showNotification('íœ… Datos eliminados correctamente.', 'success');
    }
    closePurgeModal();
};

document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('purgeConfirmModal');
    if (modal && modal.style.display === 'flex') {
        if (e.key === 'Enter') window.executePurge();
        if (e.key === 'Escape') window.closePurgeModal();
    }
});

// --- FUNCIONES PARA GESTIÓN DE CLAVE MAESTRA DE BORRADO ---

window.handleSavePurgeKey = async function (event) {
    const key = document.getElementById('purgeKeyInput').value.trim();
    const confirm = document.getElementById('purgeKeyConfirm').value.trim();
    const msg = document.getElementById('purgeKeyMsg');

    if (!key) {
        showNotification("La clave no puede estar vacía", "error");
        return;
    }

    if (key !== confirm) {
        if (msg) {
            msg.textContent = "Las claves no coinciden";
            msg.style.color = "#dc2626";
            msg.style.display = "block";
        }
        return;
    }

    // Guardar la clave maestra de purga en el servidor
    try {
        const res = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'PURGA_MAESTRA', newPassword: key })
        });
        if (res.ok) {
            window._purgeKey = key; // Caché local temporal
            if (msg) {
                msg.textContent = "✅ Clave Maestra actualizada con éxito";
                msg.style.color = "#16a34a";
                msg.style.display = "block";
                setTimeout(() => { if (msg) msg.style.display = "none"; }, 3000);
            }
            document.getElementById('purgeKeyForm').reset();
            updatePurgeKeyStatusDisplay();
            showNotification("Clave Maestra de Borrado actualizada");
        } else {
            showNotification("Error al guardar la clave maestra", "error");
        }
    } catch (err) {
        console.error('Error guardando clave maestra:', err);
        showNotification("Error de conexión al guardar", "error");
    }
};

window.togglePurgeKeyVisibility = function () {
    const input = document.getElementById('purgeKeyInput');
    const confirm = document.getElementById('purgeKeyConfirm');
    if (input.type === "password") {
        input.type = "text";
        confirm.type = "text";
    } else {
        input.type = "password";
        confirm.type = "password";
    }
};

window.toggleActivePurgeKeyVisibility = function (event) {
    const span = document.getElementById('purgeKeyStatusSpan');
    if (!span) return;
    const btn = (event && event.currentTarget) ? event.currentTarget : null;

    // If currently masked (contains asterisk) then show the real key
    if (span.textContent.includes('*')) {
        if (window._purgeKey) {
            span.textContent = window._purgeKey;
            span.style.letterSpacing = "normal";
        } else {
            span.textContent = "[Protegida en Servidor]";
            span.style.letterSpacing = "normal";
        }
        if (btn) btn.textContent = "Ocultar";
    } else {
        span.textContent = "********";
        span.style.letterSpacing = "3px";
        if (btn) btn.textContent = "Ver👁️";
    }
};

function updatePurgeKeyStatusDisplay() {
    const span = document.getElementById('purgeKeyStatusSpan');
    if (span) {
        span.textContent = "********";
        span.style.letterSpacing = "3px";
    }
}

// ==========================================
// MÓDULO DE INTELIGENCIA: INFOGRAFÍA DEL DELITO
// ==========================================

const ECUADOR_CITIES = {
    "Guayas": ["Guayaquil", "Durán", "Milagro", "Samborondón", "Daule", "El Empalme", "Naranjal", "Yaguachi", "Otros"],
    "Pichincha": ["Quito", "Sangolquí", "Cayambe", "Machachi", "Otros"],
    "Manabí": ["Portoviejo", "Manta", "Chone", "Montecristi", "El Carmen", "Bahía de Caráquez", "Otros"],
    "El Oro": ["Machala", "Pasaje", "Santa Rosa", "Huaquillas", "Otros"],
    "Esmeraldas": ["Esmeraldas", "Quinindé", "Atacames", "San Lorenzo", "Otros"],
    "Los Ríos": ["Babahoyo", "Quevedo", "Buena Fe", "Ventanas", "Otros"],
    "Santo Domingo de los Tsáchilas": ["Santo Domingo", "Otros"],
    "Santa Elena": ["Santa Elena", "La Libertad", "Salinas", "Otros"],
    "Azuay": ["Cuenca", "Gualaceo", "Paute", "Otros"],
    "Loja": ["Loja", "Catamayo", "Otros"],
    "Tungurahua": ["Ambato", "Baños", "Otros"],
    "Chimborazo": ["Riobamba", "Guano", "Otros"]
};

// Variables para los gráficos de la infografía
let chartInfografiaProvinceInstance = null;
let chartInfografiaCityInstance = null;
let chartInfografiaTypeInstance = null;
let chartInfografiaTimeInstance = null;

// Función para actualizar las ciudades del formulario de incidentes
window.updateCrimeCities = function () {
    const provSelect = document.getElementById('crimeProvince');
    const citySelect = document.getElementById('crimeCity');
    if (!provSelect || !citySelect) return;
    const prov = provSelect.value;
    const cities = ECUADOR_CITIES[prov] || ["Otros"];
    citySelect.innerHTML = "";
    cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        citySelect.appendChild(opt);
    });
};

// Función para actualizar el select de ciudades en el filtro de la infografía
window.updateInfografiaCitiesDropdown = function () {
    const provSelect = document.getElementById('infografiaFilterProvince');
    const citySelect = document.getElementById('infografiaFilterCity');
    if (!provSelect || !citySelect) return;
    const prov = provSelect.value;
    citySelect.innerHTML = '<option value="">Todas las Ciudades</option>';
    if (prov) {
        const cities = ECUADOR_CITIES[prov] || [];
        cities.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            citySelect.appendChild(opt);
        });
    }
};

// Limpia los filtros de la infografía
window.clearInfografiaFilters = function () {
    const prov = document.getElementById('infografiaFilterProvince');
    const city = document.getElementById('infografiaFilterCity');
    const type = document.getElementById('infografiaFilterType');
    const from = document.getElementById('infografiaFilterDateFrom');
    const to = document.getElementById('infografiaFilterDateTo');

    if (prov) prov.value = "";
    if (city) city.innerHTML = '<option value="">Todas las Ciudades</option>';
    if (type) type.value = "";
    if (from) from.value = "";
    if (to) to.value = "";

    window.updateIntelInfografia();
};

// Actualiza los gráficos, KPI y tablas de la infografía dinámica
window.updateIntelInfografia = function () {
    const sourceData = typeof crimes !== 'undefined' ? crimes : [];

    // Obtener valores de filtros
    const filterProv = document.getElementById('infografiaFilterProvince')?.value || '';
    const filterCity = document.getElementById('infografiaFilterCity')?.value || '';
    const filterType = document.getElementById('infografiaFilterType')?.value || '';
    const filterFrom = document.getElementById('infografiaFilterDateFrom')?.value || '';
    const filterTo = document.getElementById('infografiaFilterDateTo')?.value || '';

    // Filtrar incidentes
    const filteredData = sourceData.filter(c => {
        const cProv = c.province || "Guayas";
        const cCity = c.city || "Guayaquil";
        const cType = c.type || "";
        const cDate = c.date ? c.date.substring(0, 10) : "";

        if (filterProv && cProv.toLowerCase() !== filterProv.toLowerCase()) return false;
        if (filterCity && cCity.toLowerCase() !== filterCity.toLowerCase()) return false;
        if (filterType && cType.toLowerCase() !== filterType.toLowerCase()) return false;

        if (filterFrom && cDate < filterFrom) return false;
        if (filterTo && cDate > filterTo) return false;

        return true;
    });

    // 1. ACTUALIZAR TARJETAS KPI
    const totalCrimes = filteredData.length;
    document.getElementById('kpi-total-crimes').textContent = totalCrimes;

    // Calcular provincia crítica
    const provCounts = {};
    filteredData.forEach(c => {
        const p = c.province || "Guayas";
        provCounts[p] = (provCounts[p] || 0) + 1;
    });
    let criticalProv = "NINGUNA";
    let maxProvCount = 0;
    Object.entries(provCounts).forEach(([prov, count]) => {
        if (count > maxProvCount) {
            maxProvCount = count;
            criticalProv = prov;
        }
    });
    document.getElementById('kpi-critical-province').textContent = criticalProv.toUpperCase();
    document.getElementById('kpi-critical-province-count').textContent = `${maxProvCount} incidentes detectados`;

    // Calcular delito predominante
    const typeCounts = {};
    filteredData.forEach(c => {
        const t = c.type || "";
        if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    let predominantType = "NINGUNO";
    let maxTypeCount = 0;
    Object.entries(typeCounts).forEach(([type, count]) => {
        if (count > maxTypeCount) {
            maxTypeCount = count;
            predominantType = type;
        }
    });
    const predominantPercent = totalCrimes > 0 ? Math.round((maxTypeCount / totalCrimes) * 100) : 0;
    document.getElementById('kpi-predominant-crime').textContent = predominantType.toUpperCase();
    document.getElementById('kpi-predominant-crime-percent').textContent = `${predominantPercent}% del total general`;

    // Calcular horario más activo
    const hourCounts = new Array(24).fill(0);
    filteredData.forEach(c => {
        if (c.date) {
            const h = new Date(c.date).getHours();
            hourCounts[h]++;
        }
    });
    let peakHour = 0;
    let maxHourCount = 0;
    hourCounts.forEach((count, hour) => {
        if (count > maxHourCount) {
            maxHourCount = count;
            peakHour = hour;
        }
    });
    const peakHourFormatted = totalCrimes > 0 ? `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 1) % 24).padStart(2, '0')}:00` : '--:--';
    document.getElementById('kpi-peak-hour').textContent = peakHourFormatted;
    document.getElementById('kpi-peak-hour-count').textContent = totalCrimes > 0 ? `${maxHourCount} incidentes registrados` : 'Sin datos';

    // 2. ACTUALIZAR GRÁFICOS
    // Gráfico 1: Provincias
    const allProvs = ["Guayas", "Pichincha", "Manabí", "El Oro", "Esmeraldas", "Los Ríos", "Santo Domingo de los Tsáchilas", "Santa Elena", "Azuay", "Loja", "Tungurahua", "Chimborazo"];
    const provChartLabels = [];
    const provChartData = [];
    allProvs.forEach(p => {
        provChartLabels.push(p);
        provChartData.push(provCounts[p] || 0);
    });

    if (chartInfografiaProvinceInstance) chartInfografiaProvinceInstance.destroy();
    const ctxProv = document.getElementById('chartInfografiaProvince')?.getContext('2d');
    if (ctxProv) {
        chartInfografiaProvinceInstance = new Chart(ctxProv, {
            type: 'bar',
            data: {
                labels: provChartLabels,
                datasets: [{
                    label: 'Incidentes',
                    data: provChartData,
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderColor: '#2563eb',
                    borderWidth: 1.5,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, color: '#64748b' } },
                    y: { grid: { display: false }, ticks: { color: '#334155', font: { weight: '600' } } }
                }
            }
        });
    }

    // Gráfico 2: Ciudades
    const cityCounts = {};
    filteredData.forEach(c => {
        const city = c.city || "Guayaquil";
        cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    const sortedCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cityChartLabels = sortedCities.map(x => x[0]);
    const cityChartData = sortedCities.map(x => x[1]);

    if (chartInfografiaCityInstance) chartInfografiaCityInstance.destroy();
    const ctxCity = document.getElementById('chartInfografiaCity')?.getContext('2d');
    if (ctxCity) {
        chartInfografiaCityInstance = new Chart(ctxCity, {
            type: 'doughnut',
            data: {
                labels: cityChartLabels.length > 0 ? cityChartLabels : ["Sin datos"],
                datasets: [{
                    data: cityChartData.length > 0 ? cityChartData : [1],
                    backgroundColor: [
                        '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#84cc16'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12, color: '#475569', font: { size: 11, weight: '600' } } }
                }
            }
        });
    }

    // Gráfico 3: Tipo de Delito
    const crimeTypes = ["robo", "sicariato", "muertes violentas", "extorsion", "droga", "armas", "secuestro", "narcotrafico", "cámaras", "atentado", "contrabando"];
    const typeChartLabels = crimeTypes.map(t => t.toUpperCase());
    const typeChartData = crimeTypes.map(t => typeCounts[t] || 0);

    // Semáforo de colores para delitos
    const typeColors = crimeTypes.map(t => {
        if (t === 'sicariato' || t === 'muertes violentas' || t === 'atentado') return 'rgba(239, 68, 68, 0.85)'; // Rojo
        if (t === 'extorsion' || t === 'secuestro' || t === 'narcotrafico') return 'rgba(245, 158, 11, 0.85)'; // Naranja
        if (t === 'robo' || t === 'droga' || t === 'armas') return 'rgba(59, 130, 246, 0.85)'; // Azul
        return 'rgba(16, 185, 129, 0.85)'; // Verde (Cámaras/Contrabando)
    });

    if (chartInfografiaTypeInstance) chartInfografiaTypeInstance.destroy();
    const ctxType = document.getElementById('chartInfografiaType')?.getContext('2d');
    if (ctxType) {
        chartInfografiaTypeInstance = new Chart(ctxType, {
            type: 'bar',
            data: {
                labels: typeChartLabels,
                datasets: [{
                    label: 'Casos',
                    data: typeChartData,
                    backgroundColor: typeColors,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9, weight: '700' } } },
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, color: '#64748b' } }
                }
            }
        });
    }

    // Gráfico 4: Tendencia Temporal (Por Mes del Año o por Día)
    const trendCounts = {};
    filteredData.forEach(c => {
        if (c.date) {
            const d = c.date.substring(0, 10);
            trendCounts[d] = (trendCounts[d] || 0) + 1;
        }
    });
    // Ordenar fechas
    const sortedDates = Object.keys(trendCounts).sort();
    const trendLabels = sortedDates.map(d => {
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
    });
    const trendValues = sortedDates.map(d => trendCounts[d]);

    if (chartInfografiaTimeInstance) chartInfografiaTimeInstance.destroy();
    const ctxTime = document.getElementById('chartInfografiaTime')?.getContext('2d');
    if (ctxTime) {
        chartInfografiaTimeInstance = new Chart(ctxTime, {
            type: 'line',
            data: {
                labels: trendLabels.length > 0 ? trendLabels : ["Sin datos"],
                datasets: [{
                    label: 'Frecuencia',
                    data: trendValues.length > 0 ? trendValues : [0],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#8b5cf6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 45, minRotation: 45 } },
                    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { stepSize: 1, color: '#64748b' } }
                }
            }
        });
    }

    // 3. ACTUALIZAR TABLA DE REPORTE TERRITORIAL
    const tableBody = document.getElementById('infografiaTableBody');
    if (tableBody) {
        tableBody.innerHTML = "";

        // Agrupar por provincia y ciudad
        const geoAgg = {};
        filteredData.forEach(c => {
            const p = c.province || "Guayas";
            const ct = c.city || "Guayaquil";
            const key = `${p}::${ct}`;
            geoAgg[key] = (geoAgg[key] || 0) + 1;
        });

        const sortedAgg = Object.entries(geoAgg).sort((a, b) => b[1] - a[1]);

        if (sortedAgg.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #94a3b8;">No se registran incidentes con los filtros seleccionados.</td></tr>`;
        } else {
            sortedAgg.forEach(([key, count]) => {
                const [prov, city] = key.split('::');
                const percent = totalCrimes > 0 ? ((count / totalCrimes) * 100).toFixed(1) : 0;

                // Determinar badge de alerta
                let alertBadge = "";
                if (count <= 2) {
                    alertBadge = `<span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">RIESGO BAJO</span>`;
                } else if (count <= 5) {
                    alertBadge = `<span style="background: rgba(245, 158, 11, 0.1); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">RIESGO MEDIO</span>`;
                } else {
                    alertBadge = `<span style="background: rgba(239, 68, 68, 0.1); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">RIESGO ALTO</span>`;
                }

                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #f1f5f9";
                tr.innerHTML = `
                    <td style="padding: 1rem 0.75rem; font-weight: 700; color: #0f172a;">${prov}</td>
                    <td style="padding: 1rem 0.75rem; color: #475569;">${city}</td>
                    <td style="padding: 1rem 0.75rem; text-align: center; font-weight: 700; color: #1e3a8a;">${count}</td>
                    <td style="padding: 1rem 0.75rem; text-align: center; color: #64748b; font-weight: 600;">${percent}%</td>
                    <td style="padding: 1rem 0.75rem; text-align: center;">${alertBadge}</td>
                `;
                tableBody.appendChild(tr);
            });
        }
    }
};

// Carga las provincias disponibles en el select de filtros
window.initInfografiaFilters = function () {
    const provSelect = document.getElementById('infografiaFilterProvince');
    if (!provSelect) return;

    const provs = ["Guayas", "Pichincha", "Manabí", "El Oro", "Esmeraldas", "Los Ríos", "Santo Domingo de los Tsáchilas", "Santa Elena", "Azuay", "Loja", "Tungurahua", "Chimborazo"];

    provSelect.innerHTML = '<option value="">Todas las Provincias</option>';
    provs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        provSelect.appendChild(opt);
    });

    const formProvSelect = document.getElementById('crimeProvince');
    if (formProvSelect) {
        formProvSelect.innerHTML = "";
        provs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p === "Guayas") opt.selected = true;
            formProvSelect.appendChild(opt);
        });
    }

    window.updateCrimeCities();
};

// Exportación del reporte de infografía a PDF formal para las autoridades
window.exportInfografiaPDF = function () {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210;
        const margin = 20;
        let currentY = 15;

        // Títulos de seguridad y membrete formal
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(190, 30, 45); // Rojo militar
        doc.text("SECRETO", margin, currentY);

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.text("ARMADA DEL ECUADOR", pageWidth - margin, currentY, { align: "right" });
        currentY += 4;
        doc.text("GRUPO DE TAREA 100.51 “SEGURIDAD MARÍTIMA”", pageWidth - margin, currentY, { align: "right" });
        currentY += 4;
        doc.text("SISTEMA DE INTELIGENCIA DE INCIDENTES", pageWidth - margin, currentY, { align: "right" });
        currentY += 8;

        // Escudo Armada local si está disponible en Base64
        if (typeof escudoBase64 !== 'undefined' && escudoBase64) {
            doc.addImage(escudoBase64, "PNG", 95, 12, 18, 18);
            currentY += 12;
        }

        // Título del Reporte
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("INFORME ESTRATÉGICO DE INCIDENCIAS DELICTIVAS (ECUADOR)", pageWidth / 2, currentY, { align: "center" });
        currentY += 6;
        doc.setFontSize(9);
        doc.setFont("helvetica", "italic");
        doc.text("Generado dinámicamente para las Autoridades Nacionales del Ecuador", pageWidth / 2, currentY, { align: "center" });
        currentY += 10;

        // Línea divisoria
        doc.setLineWidth(0.5);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 8;

        // Filtros Activos en el Reporte
        const filterProv = document.getElementById('infografiaFilterProvince')?.value || 'TODAS';
        const filterCity = document.getElementById('infografiaFilterCity')?.value || 'TODAS';
        const filterType = document.getElementById('infografiaFilterType')?.value || 'TODOS';
        const filterFrom = document.getElementById('infografiaFilterDateFrom')?.value || 'INICIO';
        const filterTo = document.getElementById('infografiaFilterDateTo')?.value || 'HOY';

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("PARÁMETROS DE FILTRADO ACTIVO:", margin, currentY);
        currentY += 5;
        doc.setFont("helvetica", "normal");
        doc.text(`• Provincia: ${filterProv.toUpperCase()}   • Ciudad: ${filterCity.toUpperCase()}   • Delito: ${filterType.toUpperCase()}`, margin + 5, currentY);
        currentY += 5;
        doc.text(`• Rango de Fecha: Desde ${filterFrom} Hasta ${filterTo}`, margin + 5, currentY);
        currentY += 10;

        // Tarjetas de Resumen KPI
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, currentY, pageWidth - (margin * 2), 30, "F");
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, currentY, pageWidth - (margin * 2), 30, "S");

        const kpiTotal = document.getElementById('kpi-total-crimes')?.textContent || '0';
        const kpiProv = document.getElementById('kpi-critical-province')?.textContent || 'NINGUNA';
        const kpiType = document.getElementById('kpi-predominant-crime')?.textContent || 'NINGUNO';
        const kpiHour = document.getElementById('kpi-peak-hour')?.textContent || '--:--';

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);
        doc.text("TOTAL INCIDENTES", margin + 10, currentY + 8);
        doc.text("PROVINCIA CRÍTICA", margin + 50, currentY + 8);
        doc.text("DELITO PRINCIPAL", margin + 100, currentY + 8);
        doc.text("HORARIO CRÍTICO", margin + 145, currentY + 8);

        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(kpiTotal, margin + 10, currentY + 18);
        doc.text(kpiProv, margin + 50, currentY + 18);
        doc.text(kpiType, margin + 100, currentY + 18);
        doc.text(kpiHour, margin + 145, currentY + 18);
        currentY += 38;

        // Detalle Geográfico - Tabla de Datos
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("DESGLOSE DE INCIDENTES Y NIVEL DE RIESGO TERRITORIAL", margin, currentY);
        currentY += 6;

        // Armar tabla de incidentes
        const sourceData = typeof crimes !== 'undefined' ? crimes : [];
        const filteredData = sourceData.filter(c => {
            const cProv = c.province || "Guayas";
            const cCity = c.city || "Guayaquil";
            const cType = c.type || "";
            const cDate = c.date ? c.date.substring(0, 10) : "";

            if (filterProv && filterProv !== 'TODAS' && cProv.toLowerCase() !== filterProv.toLowerCase()) return false;
            if (filterCity && filterCity !== 'TODAS' && cCity.toLowerCase() !== filterCity.toLowerCase()) return false;
            if (filterType && filterType !== 'TODOS' && cType.toLowerCase() !== filterType.toLowerCase()) return false;

            if (filterFrom && filterFrom !== 'INICIO' && cDate < filterFrom) return false;
            if (filterTo && filterTo !== 'HOY' && cDate > filterTo) return false;

            return true;
        });

        const geoAgg = {};
        filteredData.forEach(c => {
            const p = c.province || "Guayas";
            const ct = c.city || "Guayaquil";
            const key = `${p}::${ct}`;
            geoAgg[key] = (geoAgg[key] || 0) + 1;
        });

        const sortedAgg = Object.entries(geoAgg).sort((a, b) => b[1] - a[1]);
        const tableRows = [];
        sortedAgg.forEach(([key, count]) => {
            const [prov, city] = key.split('::');
            const percent = filteredData.length > 0 ? ((count / filteredData.length) * 100).toFixed(1) : '0';
            const alertText = count <= 2 ? "BAJO" : (count <= 5 ? "MEDIO" : "ALTO");
            tableRows.push([prov.toUpperCase(), city.toUpperCase(), count.toString(), `${percent}%`, alertText]);
        });

        if (tableRows.length === 0) {
            tableRows.push(["SIN REGISTROS", "SIN REGISTROS", "0", "0%", "N/A"]);
        }

        doc.autoTable({
            startY: currentY,
            head: [['PROVINCIA', 'CIUDAD / CANTÓN', 'INCIDENTES', 'PORCENTAJE', 'NIVEL DE ALERTA']],
            body: tableRows,
            theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: {
                2: { halign: 'center' },
                3: { halign: 'center' },
                4: { halign: 'center', fontStyle: 'bold' }
            },
            margin: { left: margin, right: margin },
            didDrawPage: (data) => {
                currentY = data.cursor.y;
            }
        });

        currentY += 15;
        if (currentY > 250) {
            doc.addPage();
            currentY = 30;
        }

        // Firmas de Responsabilidad
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text("Generado y verificado por:", margin, currentY);
        currentY += 15;
        doc.setFont("helvetica", "bold");
        doc.text("DEPARTAMENTO DE INTELIGENCIA TÁCTICA", margin, currentY);
        doc.setFont("helvetica", "normal");
        doc.text("GRUPO DE TAREA 100.51 “SEGURIDAD MARÍTIMA”", margin, currentY + 4);

        // Secreto en el pie de todas las páginas
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(190, 30, 45);
            doc.text("SECRETO", 105, 287, { align: "center" });
        }

        const pdfUrl = doc.output("bloburl");
        window.open(pdfUrl, "_blank");
        doc.save(`INFORME_DELITOS_ECUADOR_${new Date().toISOString().substring(0, 10)}.pdf`);
        showNotification("PDF de Infografía generado exitosamente.");
    } catch (e) {
        console.error("Error al exportar Infografía PDF:", e);
        alert("Error al generar PDF: " + e.message);
    }
};

// Función de redimensionamiento resiliente para el mapa de Leaflet
window.triggerResilientMapResize = function () {
    const targetMap = window.map || (typeof map !== 'undefined' ? map : null);
    if (!targetMap) return;

    // Invalidad tamaño inmediatamente
    targetMap.invalidateSize();

    // Ejecutar en los próximos frames de renderizado
    requestAnimationFrame(() => {
        targetMap.invalidateSize();
        requestAnimationFrame(() => {
            targetMap.invalidateSize();
        });
    });

    // Ejecutar en tiempos diferidos para asegurar transiciones y repaints
    setTimeout(() => { if (targetMap) targetMap.invalidateSize(true); }, 100);
    setTimeout(() => { 
        if (targetMap) {
            targetMap.invalidateSize(true);
            // Asegurar refresco de marcadores y capa de calor al redimensionar/mostrar mapa
            if (typeof refreshHeatLayer === 'function') refreshHeatLayer();
            if (typeof refreshMarkers === 'function') refreshMarkers();
        }
    }, 300);
    setTimeout(() => { if (targetMap) targetMap.invalidateSize(true); }, 600);
    setTimeout(() => { if (targetMap) targetMap.invalidateSize(true); }, 1200);
};

// ==========================================
// GESTIÓN DINÁMICA DE ESTRUCTURA ORGÁNICA (GT / CODESC)
// ==========================================
window.orgUnits = [];

// Carga las unidades desde el servidor
window.loadOrgUnits = async function () {
    try {
        const res = await fetch('/api/org-units');
        if (res.ok) {
            window.orgUnits = await res.json();
            window.populateOrgUnitsDropdowns();
            console.log("Unidades orgánicas cargadas con éxito:", window.orgUnits);
        } else {
            console.error("Error al cargar unidades orgánicas del servidor.");
        }
    } catch (e) {
        console.error("Error en loadOrgUnits:", e);
    }
};

// Calcula la profundidad de una unidad de forma recursiva (con prevención de ciclos)
window.getUnitDepth = function (unitId, list) {
    let depth = 1;
    let visited = new Set([unitId]);
    let current = list.find(u => u.id === unitId);
    while (current && current.parent_id) {
        if (visited.has(current.parent_id)) {
            console.error("Ciclo jerárquico detectado para unidad:", current.parent_id);
            break;
        }
        depth++;
        visited.add(current.parent_id);
        current = list.find(u => u.id === current.parent_id);
    }
    return depth;
};

// Popula los dropdowns select en los formularios
window.populateOrgUnitsDropdowns = function () {
    const pSelect = document.getElementById('pGrupoDestino');
    const cSelect = document.getElementById('cGrupoDestino');
    const cpSelect = document.getElementById('cpGrupoDestino');

    // Filtrar solo las unidades activas
    const activeUnits = window.orgUnits.filter(u => u.status === 'ACTIVE');

    // 1. Selector de Registro de Personal (#pGrupoDestino)
    if (pSelect) {
        const val = pSelect.value;
        pSelect.innerHTML = activeUnits.map(u =>
            `<option value="${u.id}">${u.name}</option>`
        ).join('') || '<option value="">Sin unidades</option>';
        if (val) pSelect.value = val;
    }

    // 2. Selector de Registro de Choferes (#cGrupoDestino)
    if (cSelect) {
        const val = cSelect.value;
        cSelect.innerHTML = activeUnits.map(u =>
            `<option value="${u.id}">${u.name}</option>`
        ).join('') || '<option value="">Sin unidades</option>';
        if (val) cSelect.value = val;
    }

    // 3. Selector de Registro del Puesto de Mando (#cpGrupoDestino)
    if (cpSelect) {
        const val = cpSelect.value;
        cpSelect.innerHTML = activeUnits.map(u =>
            `<option value="${u.id}">${u.name}</option>`
        ).join('') || '<option value="">Sin unidades</option>';
        if (val) cpSelect.value = val;
    }
};

// Renderiza la vista de administración de unidades (Lista plana)
window.renderOrgUnitsAdmin = function () {
    const container = document.getElementById('orgTreeContainer');
    if (!container) return;

    let html = '';
    const units = window.orgUnits;

    if (units.length === 0) {
        html = '<p style="text-align:center; font-size:0.8rem; color: var(--text-muted);">No hay unidades registradas.</p>';
    } else {
        // Ordenar alfabéticamente
        const sortedUnits = [...units].sort((a, b) => a.name.localeCompare(b.name));
        sortedUnits.forEach(node => {
            html += `
                <div style="margin-top: 6px; padding: 8px; background: ${node.status === 'ACTIVE' ? 'var(--bg-card)' : '#fee2e2'}; border: 1px solid var(--border); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #3b82f6;">
                    <div>
                        <strong>${node.name}</strong> <span style="font-size:0.65rem; color: var(--text-muted); background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight:700; margin-left: 6px;">${node.id}</span>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 2px;">
                            ${node.status === 'ACTIVE' ? '🟢 Activo' : '🔴 Inactivo'}
                        </div>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button onclick="editOrgUnit('${node.id}', '${node.name.replace(/'/g, "\\'")}', '', '', '${node.status}')" class="btn-secondary btn-small" style="padding: 2px 8px; font-size: 0.75rem;">✏️</button>
                        <button onclick="deleteOrgUnit('${node.id}')" class="btn-remove-row btn-small" style="padding: 2px 8px; font-size: 0.75rem; color: #dc2626;">🗑️</button>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;

    // Actualizar los dropdowns select
    window.populateOrgUnitsDropdowns();
};

// Guardar / Actualizar Unidad
window.handleSaveOrgUnit = async function (e) {
    e.preventDefault();
    const isEdit = document.getElementById('orgUnitIsEdit').value === 'true';
    const id = document.getElementById('orgUnitId').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const name = document.getElementById('orgUnitName').value.trim();
    const status = document.getElementById('orgUnitStatus').value;

    if (!id || !name) return;

    try {
        const res = await fetch('/api/org-units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, parent_id: null, category: 'UNIDAD', status })
        });
        if (res.ok) {
            showNotification(isEdit ? "Unidad actualizada con éxito" : "Unidad creada con éxito");
            await window.loadOrgUnits();
            window.cancelOrgEdit();
            window.renderOrgUnitsAdmin();
        } else {
            const data = await res.json();
            showNotification("Error al guardar: " + data.message, "error");
        }
    } catch (err) {
        console.error("Error al guardar unidad:", err);
        showNotification("Error de red al guardar unidad.", "error");
    }
};

// Rellena el formulario de edición
window.editOrgUnit = function (id, name, parent_id, category, status) {
    document.getElementById('orgFormTitle').textContent = "Editar Unidad";
    document.getElementById('orgUnitIsEdit').value = "true";

    const idField = document.getElementById('orgUnitId');
    idField.value = id;
    idField.disabled = true; // No permitir cambiar la clave primaria

    document.getElementById('orgUnitName').value = name;
    document.getElementById('orgUnitStatus').value = status;

    document.getElementById('orgCancelBtn').style.display = "inline-block";
};

// Cancela la edición y limpia el formulario
window.cancelOrgEdit = function () {
    document.getElementById('orgFormTitle').textContent = "Crear Nueva Unidad";
    document.getElementById('orgUnitIsEdit').value = "false";

    const idField = document.getElementById('orgUnitId');
    idField.value = "";
    idField.disabled = false;

    document.getElementById('adminOrgForm').reset();
    document.getElementById('orgCancelBtn').style.display = "none";
};

// Eliminar / Desactivar Unidad
window.deleteOrgUnit = async function (id) {


    if (confirm(`¿Estás seguro de que deseas desactivar la unidad '${id}'? (Se mantendrá oculta en registros nuevos pero preservada para datos históricos)`)) {
        try {
            const res = await fetch('/api/org-units/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (res.ok) {
                showNotification("Unidad desactivada.");
                await window.loadOrgUnits();
                window.renderOrgUnitsAdmin();
            } else {
                showNotification("Error al desactivar unidad.", "error");
            }
        } catch (err) {
            console.error("Error al desactivar:", err);
        }
    }
};

// Obtiene todos los IDs de subunidades subordinadas (hasta 3 niveles de jerarquía recursiva)
window.getOrgUnitAndDescendants = function (unitId) {
    let ids = [unitId];
    if (!window.orgUnits || window.orgUnits.length === 0) return ids;

    // Nivel 2
    const level2 = window.orgUnits.filter(u => u.parent_id === unitId && u.id !== unitId);
    level2.forEach(u2 => {
        ids.push(u2.id);
        // Nivel 3
        const level3 = window.orgUnits.filter(u => u.parent_id === u2.id && u.id !== u2.id);
        level3.forEach(u3 => {
            ids.push(u3.id);
        });
    });
    return ids;
};

// Verifica si un miembro pertenece a una unidad o a sus descendientes
window.isBelongingToUnit = function (p, targetUnitId) {
    const resolvedDest = window.resolveOrgUnitId(p.grupoDestino);
    const allowed = window.getOrgUnitAndDescendants(targetUnitId);
    if (allowed.includes(resolvedDest)) return true;
    
    // Soporte tolerante: si la subunidad resuelta contiene el ID del target (ej: CODESC_SUR contiene CODESC)
    const cleanTarget = String(targetUnitId || '').toUpperCase().trim();
    const cleanResolved = String(resolvedDest || '').toUpperCase().trim();
    if (cleanTarget && cleanResolved && (cleanResolved.includes(cleanTarget) || cleanTarget.includes(cleanResolved))) {
        return true;
    }
    return false;
};

// Resuelve de manera robusta y tolerante el ID de una unidad basándose en un valor de texto o fila completa
window.resolveOrgUnitId = function (rawVal, rowData = null) {
    if (!window.orgUnits || window.orgUnits.length === 0) {
        return 'GT_ECHO';
    }

    const cleanVal = String(rawVal || '').toUpperCase().trim().replace(/[\s_\-]+/g, '');
    const activeUnits = window.orgUnits.filter(u => u.status === 'ACTIVE');

    if (cleanVal) {
        // 1. Intentar coincidencia exacta con ID o Nombre
        for (const unit of activeUnits) {
            const uId = unit.id.toUpperCase().replace(/[\s_\-]+/g, '');
            const uName = unit.name.toUpperCase().replace(/[\s_\-]+/g, '');
            if (cleanVal === uId || cleanVal === uName) {
                return unit.id;
            }
        }
        // 2. Si no coincide, buscar en sub-cadenas
        for (const unit of activeUnits) {
            const uId = unit.id.toUpperCase().replace(/[\s_\-]+/g, '');
            const uName = unit.name.toUpperCase().replace(/[\s_\-]+/g, '');
            if (cleanVal.includes(uId) || uId.includes(cleanVal) || cleanVal.includes(uName) || uName.includes(cleanVal)) {
                return unit.id;
            }
        }
    }

    // 3. Buscar en toda la fila (rowData es Array o String u Objeto) si se provee
    if (rowData) {
        let rowStr = '';
        if (Array.isArray(rowData)) {
            rowStr = rowData.join(' ');
        } else if (typeof rowData === 'object') {
            rowStr = Object.values(rowData).join(' ');
        } else {
            rowStr = String(rowData);
        }
        rowStr = rowStr.toUpperCase().replace(/[\s_\-]+/g, '');
        for (const unit of activeUnits) {
            const uId = unit.id.toUpperCase().replace(/[\s_\-]+/g, '');
            const uName = unit.name.toUpperCase().replace(/[\s_\-]+/g, '');
            if (rowStr.includes(uId) || rowStr.includes(uName)) {
                return unit.id;
            }
        }
    }

    // Fallback: si hay GT_ECHO retornar ese, si no el primero activo, si no 'GT_ECHO'
    if (activeUnits.some(u => u.id === 'GT_ECHO')) return 'GT_ECHO';
    return activeUnits.length > 0 ? activeUnits[0].id : 'GT_ECHO';
};



