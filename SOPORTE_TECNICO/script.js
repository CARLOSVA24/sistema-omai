console.log("GESTIÓN DE PATRULLAJES TERRESTRES v2.0 - MULTI-USER SYNC ACTIVE");

// --- CENTRALIZED DATA SYNC (MULTI-USER) ---
const API_BASE = '/api';
var defaultPasswords = {
    "ADMINISTRADOR": "admin",
    "JEFE OMAI": "jefe",
    "PERSONAL OMAI": "personal",
    "LOGISTICA OMAI": "logistica",
    "INTELIGENCIA OMAI": "inteligencia",
    "CMDTE GT 51": "cmdte"
};
var storedPasses = Object.assign({}, defaultPasswords); // Variable global inicializada
var rotationStartDate = null;
var rotationStartGroup = 'ALFA';

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
        await fetch(`${API_BASE}/store/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    commandPostPersonnel = await serverLoad('commandPostPersonnel', []);
    personnelHistory = await serverLoad('personnelHistory', []);
    vehicles = await serverLoad('gyevehicles', []);
    externalOrdersMetadata = await serverLoad('externalOrdersMetadata', []);
    
    rotationStartDate = await serverLoad('rotationStartDate', null);
    rotationStartGroup = await serverLoad('rotationStartGroup', 'ALFA');
    
    // Sync passwords
    const serverPasses = await serverLoad('app_passwords', defaultPasswords);
    storedPasses = serverPasses;
    saveAppState('app_passwords', JSON.stringify(serverPasses));
}

// Configuración Inicial
const GYE_COORDS = [-2.1894, -79.8891];
const ZOOM_LEVEL = 12;

// Colores por delito para el mapa de calor
const CRIME_COLORS = {
    robo: '#0ea5e9',
    sicariato: '#ef4444',
    extorsion: '#22c55e',
    droga: '#f59e0b',
    operacion: '#8b5cf6'
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
        } else if (key === 'gyepersonal') {
            personnel = data;
            if (typeof renderPersonnelTable === 'function') renderPersonnelTable();
            if (typeof updatePersonnelStats === 'function') updatePersonnelStats();
        } else if (key === 'instantOps') {
            instantOps = data;
            if (typeof renderInstantOpsTable === 'function') renderInstantOpsTable();
        } else if (key === 'opsEvents') {
            opsEvents = data;
            if (typeof renderOpsPlanningTable === 'function') renderOpsPlanningTable();
        } else if (key === 'patrolOrders') {
            patrolOrders = data;
            if (typeof renderORDPATTable === 'function') renderORDPATTable();
        }
    });
}

function initAuth() {
    console.log("Iniciando Auth...");
    
    // Intentar cargar desde localStorage
    const localPasses = safeJSONParse('app_passwords', null);
    
    // Si no hay nada o es inválido, usar los por defecto inmediatamente
    if (!localPasses || typeof localPasses !== 'object' || Object.keys(localPasses).length === 0 || Array.isArray(localPasses)) {
        console.warn("No se detectaron usuarios válidos, cargando predeterminados...");
        storedPasses = Object.assign({}, defaultPasswords);
        saveAppState('app_passwords', JSON.stringify(storedPasses));
    } else {
        storedPasses = localPasses;
    }
    
    const loginSelect = document.getElementById('loginRole');
    if (loginSelect) {
        loginSelect.innerHTML = '';
        const keys = Object.keys(storedPasses);
        
        if (keys.length === 0) {
            // Último recurso: Cargar administrador al menos
            const opt = document.createElement('option');
            opt.value = 'ADMINISTRADOR';
            opt.textContent = 'ADMINISTRADOR';
            loginSelect.appendChild(opt);
        } else {
            keys.forEach(role => {
                const opt = document.createElement('option');
                opt.value = role;
                opt.textContent = role;
                loginSelect.appendChild(opt);
            });
        }
        console.log("Menú de acceso poblado con:", Object.keys(storedPasses));
    } else {
        console.error("Element 'loginRole' not found during initAuth. Check index.html structure.");
    }
    
    // Si la lista está vacía después de intentar cargar, reintentar en 2 segundos
    if (!storedPasses || Object.keys(storedPasses).length === 0) {
        console.warn("Roles empty, retrying initAuth in 2s...");
        setTimeout(initAuth, 2000);
    }
    
    const currentSession = sessionStorage.getItem('currentUserRole');
    if(currentSession) {
        const loginOverlay = document.getElementById('loginOverlay');
        if(loginOverlay) loginOverlay.style.display = 'none';
        applyRBAC(currentSession);
    } else {
        const loginOverlay = document.getElementById('loginOverlay');
        if(loginOverlay) loginOverlay.style.display = 'flex';
    }
    
    const btnLogin = document.getElementById('btnLogin');
    if(btnLogin) {
        btnLogin.addEventListener('click', handleLogin);
    }
}

function handleLogin() {
    try {
        const roleSelect = document.getElementById('loginRole');
        const passInput = document.getElementById('loginPassword');
        if (!roleSelect || !passInput) throw new Error("Elementos de login no encontrados");

        const role = roleSelect.value;
        const pass = passInput.value.trim();
        
        // Prioridad 1: storedPasses (Sincronizado)
        // Prioridad 2: defaultPasswords (Código fuente)
        const correctPass = (storedPasses && storedPasses[role]) || defaultPasswords[role];
        
        console.log("Auth attempt:", role, "CorrectPass:", !!correctPass);

        if(correctPass && correctPass === pass) {
            sessionStorage.setItem('currentUserRole', role);
            const overlay = document.getElementById('loginOverlay');
            if (overlay) overlay.style.display = 'none';
            const errorDiv = document.getElementById('loginError');
            if (errorDiv) errorDiv.style.display = 'none';
            
            // Notificar éxito
            console.log("Acceso concedido como:", role);
            
            try {
                applyRBAC(role);
            } catch (rbacError) {
                console.error("Error aplicando RBAC, pero permitiendo entrada:", rbacError);
            }
        } else {
            const errorDiv = document.getElementById('loginError');
            if (errorDiv) errorDiv.style.display = 'block';
            console.warn("Credenciales inválidas para:", role);
        }
    } catch (err) {
        console.error("Fallo crítico en handleLogin:", err);
        // Fallback de emergencia: ocultar el overlay para no bloquear al usuario
        const overlay = document.getElementById('loginOverlay');
        if (overlay) overlay.style.display = 'none';
        showNotification("Error en autenticación. Acceso forzado por seguridad.");
    }
}

function applyRBAC(role) {
    const statusArea = document.querySelector('.user-auth-area');
    if(statusArea) {
        let badge = statusArea.querySelector('.role-badge');
        if(!badge) {
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
        if(!logoutBtn) {
            logoutBtn = document.createElement('button');
            logoutBtn.className = 'logout-btn';
            logoutBtn.innerHTML = '🚪 Cerrar Sesión';
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
        'personal':     document.getElementById('menuItem-personal'),
        'operaciones':  document.getElementById('menuItem-operaciones'),
        'logistica':    document.getElementById('menuItem-logistica'),
        'inteligencia': document.getElementById('menuItem-inteligencia'),
        'historicos':   document.getElementById('menuItem-historicos'),
        'admin':        document.getElementById('adminMenu'),
        'about':        document.getElementById('menuItem-about')
    };

    // Ocultar todos primero
    Object.values(menus).forEach(m => { if(m) m.style.display = 'none'; });

    // Mostrar según el rol
    if(role === 'ADMINISTRADOR') {
        Object.values(menus).forEach(m => { if(m) m.style.display = 'block'; });
    } else if (role === 'JEFE OMAI') {
        ['personal','operaciones','logistica','inteligencia','historicos','about'].forEach(k => {
            if(menus[k]) menus[k].style.display = 'block';
        });
    } else if (role === 'CMDTE GT 51') {
        ['personal','operaciones','logistica','inteligencia','historicos','about'].forEach(k => {
            if(menus[k]) menus[k].style.display = 'block';
        });
    } else if (role === 'PERSONAL OMAI') {
        ['personal','about'].forEach(k => { if(menus[k]) menus[k].style.display = 'block'; });
    } else if (role === 'LOGISTICA OMAI') {
        ['logistica','about'].forEach(k => { if(menus[k]) menus[k].style.display = 'block'; });
    } else if (role === 'INTELIGENCIA OMAI') {
        ['inteligencia','about'].forEach(k => { if(menus[k]) menus[k].style.display = 'block'; });
    }
    
    if(role === 'CMDTE GT 51') {
        setTimeout(() => {
            document.querySelectorAll('input:not([type="search"]), select:not(.filter-select), textarea').forEach(el => {
                if(el.id !== 'loginRole' && el.id !== 'loginPassword') {
                    el.disabled = true;
                }
            });
            document.querySelectorAll('.btn-primary, .btn-secondary').forEach(el => {
                if(!el.id.includes('export') && !el.classList.contains('nav-btn') && !el.classList.contains('sub-menu-btn') && el.id !== 'btnLogin') {
                    el.style.display = 'none';
                }
            });
            document.querySelectorAll('.btn-remove-row, .delete-btn').forEach(el => el.style.display = 'none');
            const mapTools = document.getElementById('map-tools-item');
            if(mapTools) mapTools.style.display = 'none';
        }, 500);
    }
}

window.handleGenerateKey = function(e) {
    e.preventDefault();
    const role = document.getElementById('keyRole').value.trim().toUpperCase();
    const newPass = document.getElementById('newPassword').value.trim();
    
    if(!role || !newPass) return;
    
    let storedPasses = JSON.parse(localStorage.getItem('app_passwords'));
    storedPasses[role] = newPass;
    saveAppState('app_passwords', JSON.stringify(storedPasses));
    
    showNotification('Usuario/Clave guardado exitosamente: ' + role);
    document.getElementById('adminKeysForm').reset();
    renderAdminKeysTable();
};

window.renderAdminKeysTable = function() {
    const tbody = document.getElementById('adminKeysTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const storedPasses = JSON.parse(localStorage.getItem('app_passwords')) || {};
    
    Object.keys(storedPasses).forEach(role => {
        const pass = storedPasses[role];
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td><strong>${role}</strong></td>
            <td>
                <span class="password-mask">••••••••</span>
                <span class="password-text" style="display:none;">${pass}</span>
                <button class="btn-action toggle-pass-btn" style="padding:2px 5px; margin-left:10px; font-size:0.75rem;">👁️</button>
            </td>
            <td style="display:flex; gap:0.5rem; justify-content:center;">
                <button class="btn-action edit-key-btn" data-role="${role}" data-pass="${pass}">✏️ Editar</button>
                ${role !== 'ADMINISTRADOR' ? `<button class="delete-btn delete-key-btn" data-role="${role}">🗑️ Borrar</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll('.toggle-pass-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const td = e.target.closest('td');
            const mask = td.querySelector('.password-mask');
            const text = td.querySelector('.password-text');
            if(mask.style.display === 'none') {
                mask.style.display = 'inline';
                text.style.display = 'none';
            } else {
                mask.style.display = 'none';
                text.style.display = 'inline';
            }
        });
    });
    
    document.querySelectorAll('.edit-key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.getElementById('keyRole').value = e.target.dataset.role;
            document.getElementById('newPassword').value = e.target.dataset.pass;
            document.getElementById('keyRole').focus();
        });
    });
    
    document.querySelectorAll('.delete-key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const role = e.target.dataset.role;
            if(confirm(`¿Estás seguro de que deseas eliminar el acceso para: ${role}?`)) {
                let storedPasses = JSON.parse(localStorage.getItem('app_passwords'));
                delete storedPasses[role];
                saveAppState('app_passwords', JSON.stringify(storedPasses));
                renderAdminKeysTable();
                showNotification(`Usuario ${role} eliminado.`);
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

window.prefillORDPATFormWithLast = function() {
    if (!patrolOrders || patrolOrders.length === 0) return;
    
    // Obtener la última generada por fecha
    const sorted = [...patrolOrders].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const last = sorted[0];
    
    console.log("Pre-llenando con última orden:", last.displayId);

    // Campos de texto y selectores simples
    const simpleFields = {
        'opHuso':              last.huso,
        'opLugar':             last.lugar,
        'opDestinatario':      last.destinatario,
        'opCopia':             last.copia,
        'opHeaderText':        last.headerText,
        'opOrgComando':        last.orgComando,
        'opSituacionMain':     last.situacionMain,
        'opSituacionAmenaza':  last.amenaza,
        'opSituacionPropias':  last.propias,
        'opMisionA':           last.misionA,
        'opMisionB':           last.misionB,
        'opIntencion':         last.intencion,
        'opConcepto':          last.concepto,
        'opTareasText':        last.tareasText,
        'opConducta':          last.conducta,
        'opCoordinacion':      last.coordinacion,
        'opLogAbastecimiento': last.logistica,
        'opLogEvacuacion':     last.logEvacuacion,
        'opLogPersonal':       last.logPersonal,
        'opMando':             last.mando,
        'opComunicaciones':    last.comunicaciones,
        'opFirmanteNombre':    last.firmanteNombre,
        'opFirmanteGrado':     last.firmanteGrado,
        'opFirmanteCargo':     last.firmanteCargo,
        'opAutorNombre':       last.autorNombre,
        'opAutorCargo':        last.autorCargo,
        'opSumilla':           last.sumilla,
        'opPrecedencia':       last.precedencia
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
                             <td><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">×</button></td>`;
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
                             <td><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">×</button></td>`;
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

const saveOrderToDB = (id, blob) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, blob });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
};

const getOrderFromDB = (id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
        request.onerror = (e) => reject(e);
    });
};

const deleteOrderFromDB = (id) => {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e);
    });
};

initDB().then(() => console.log("IndexedDB Initialized")).catch(err => console.error("IDB Fail:", err));

// Migración de Datos (Asegurar IDs)
patrolOrders.forEach(op => { if (!op.id) op.id = 'ordpat_' + Math.random().toString(36).substr(2, 9); });

const CATEGORY_GRADIENTS = {
    robo: { 0.2: 'white', 0.5: '#38bdf8', 0.8: '#0ea5e9', 1.0: '#0284c7' },       // Azul
    sicariato: { 0.2: 'white', 0.5: '#f87171', 0.8: '#ef4444', 1.0: '#b91c1c' },  // Rojo
    extorsion: { 0.2: 'white', 0.5: '#4ade80', 0.8: '#22c55e', 1.0: '#15803d' },  // Verde
    droga: { 0.2: 'white', 0.5: '#fcd34d', 0.8: '#f59e0b', 1.0: '#d97706' },      // Naranja
    operacion: { 0.2: 'white', 0.5: '#c084fc', 0.8: '#8b5cf6', 1.0: '#6d28d9' }   // Violeta
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
        'crimesTableWrapper', 'dashboardOverlay', 'patrolComplianceView', 'adminKeysView', 'aboutView'
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
    const isMapView = viewId === 'crimesTableWrapper';

    if (tableOverlay) tableOverlay.style.display = isMapView ? 'block' : 'none';
    if (mapEl) {
        mapEl.style.display = isMapView ? 'block' : 'none';
        if (isMapView && typeof map !== 'undefined' && map) {
            setTimeout(() => map.invalidateSize(), 150);
        }
    }

    if (viewId === 'personnelStatsView') updatePersonnelStats();
    if (viewId === 'watchDivisionView') renderWatchDivision();
    if (viewId === 'commandPostView') renderCommandPostTable();
    if (viewId === 'historicalPatrolView') renderHistoricalPatrolTable();
    if (viewId === 'ordpatView') { renderORDPATTable(); if (typeof prefillORDPATFormWithLast === 'function') prefillORDPATFormWithLast(); }
    if (viewId === 'opsPlanningView') renderOpsPlanningTable();
    if (viewId === 'instantOpsView') {
        renderInstantOpsTable();
        window.populateOrderReferences(); // Asegurar que las órdenes carguen al entrar
    }
    if (viewId === 'loadOrdersView' && typeof renderLoadOrdersView === 'function') renderLoadOrdersView();
    if (viewId === 'patrolComplianceView') { populatePatrolOrdersForCompliance(); renderPatrolComplianceTable(); }
    if (viewId === 'adminKeysView' && typeof renderAdminKeysTable === 'function') renderAdminKeysTable();
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
        try { renderPatrolComplianceTable(); } catch (e) { }

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
        preferCanvas: true // Mejor rendimiento para KMZ/KML pesados
    }).setView(GYE_COORDS, ZOOM_LEVEL);

    map = window.map; // Sincronizar referencia local

    // Capa de mapa (CartoDB Positron - Tema Claro)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    // Mover control de zoom a la derecha
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Inicializar capas de calor
    refreshHeatLayer();

    // Inicializar capa de marcadores
    markerLayer = L.layerGroup().addTo(map);
    refreshMarkers();

    // Control de capas (para gestionar las capas KMZ que se añadan)
    kmzControl = L.control.layers(null, null, {
        collapsed: false,
        position: 'topleft'
    }).addTo(map);

    kmzControl.addOverlay(markerLayer, "Marcadores de Incidentes");

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
            if (confirm('¿Está seguro de eliminar TODOS los registros de personal? Esta acción no se puede deshacer.')) {
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
            if (confirm('¿Estás seguro de que deseas borrar todos los registros de incidentes?')) {
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
    // Carga inicial de referencias de órdenes
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
            document.getElementById('ioBTNarrative').value = 'BT. CÚMPLEME INFORMAR A USTED SEÑOR ALMIRANTE, LA NOVEDAD SUSCITADA EN LA JURISDICCIÓN DEL GT-100.51 “SEGURIDAD MARÍTIMA”, SEGÚN EL SIGUIENTE DETALLE:';

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
            showNotification('Formulario limpio — listo para nuevo Parte Oficial');
        });
    }

    const vehicleForm = document.getElementById('vehicleForm');
    if (vehicleForm) vehicleForm.addEventListener('submit', handleVehicleSubmit);

    const btnClearVehicles = document.getElementById('clearVehiclesData');
    if (btnClearVehicles) {
        btnClearVehicles.addEventListener('click', () => {
            if (confirm('¿Confirmas que deseas eliminar TODOS los vehículos registrados?')) {
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
                    row.innerHTML = `
                        <div class="coord-number">${index + 1}</div>
                        <div class="coord-input-group">
                            <div>
                                <label>Latitud</label>
                                <input type="number" step="0.00001" class="vertex-lat" value="${(latlng.lat || 0).toFixed(6)}">
                            </div>
                            <div>
                                <label>Longitud</label>
                                <input type="number" step="0.00001" class="vertex-lng" value="${(latlng.lng || 0).toFixed(6)}">
                            </div>
                        </div>
                    `;
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

    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    window.onclick = (event) => { if (event.target == modal) modal.classList.remove('active'); };

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

        modal.classList.remove('active');
        showNotification("Propiedades actualizadas");
    };

    document.getElementById('deleteObject').onclick = () => {
        if (!currentPropertyLayer) return;
        if (confirm("¿Estás seguro de eliminar este objeto?")) {
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
                } else {
                    editHandler.enable();
                    showNotification("Haz clic y arrastra los puntos para modificar");
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
            if (confirm("¿Deseas cerrar la aplicación?")) window.close();
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

    // --- Órdenes de Patrulla (ORDPAT) ---
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
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row">×</button></td>
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
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row">×</button></td>
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
                    <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">×</button>
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
                    <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">×</button>
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
                    <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">×</button>
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
                <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">×</button></td>
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
                        <button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;">×</button>
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

    // --- Eventos de Visor de Órdenes ---
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
            if (activeItem && confirm('¿Está seguro de eliminar esta orden del repositorio?')) {
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
    const district = document.getElementById('district').value;
    const date = document.getElementById('date').value;
    const observation = document.getElementById('observation').value;

    if (editingId) {
        // Modo Edición
        const index = crimes.findIndex(c => c.id === editingId);
        if (index !== -1) {
            crimes[index].type = type;
            crimes[index].district = district;
            crimes[index].date = date;
            crimes[index].observation = observation;
            // Si el usuario hizo clic en el mapa, actualizamos lat/lng
            if (selectedLatLng) {
                crimes[index].lat = selectedLatLng.lat;
                crimes[index].lng = selectedLatLng.lng;
            }
            crimes[index].intensity = getIntensity(type);
            showNotification('Registro actualizado con éxito');
        }
    } else {
        // Modo Nuevo Registro
        const newCrime = {
            id: Date.now(),
            type,
            district,
            date,
            observation,
            lat: selectedLatLng.lat,
            lng: selectedLatLng.lng,
            intensity: getIntensity(type)
        };
        crimes.push(newCrime);
        showNotification(`Incidente de ${type} en ${district} registrado con éxito`);
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
    editingId = null;
    selectedLatLng = null;
    document.getElementById('observation').value = '';
    document.getElementById('lat').textContent = 'Lat: --';
    document.getElementById('lng').textContent = 'Lng: --';
    document.getElementById('submitBtn').textContent = 'Registrar Incidente';
    document.getElementById('submitBtn').classList.remove('editing');

    // Restaurar fecha actual
    const now = new Date();
    document.getElementById('date').value = now.toISOString().slice(0, 16);
}

function editCrime(id) {
    const crime = crimes.find(c => c.id === id);
    if (!crime) return;

    editingId = id;
    document.getElementById('crimeType').value = crime.type;
    document.getElementById('district').value = crime.district || "";
    document.getElementById('date').value = crime.date;
    document.getElementById('observation').value = crime.observation || "";
    document.getElementById('lat').textContent = `Lat: ${crime.lat.toFixed(5)}`;
    document.getElementById('lng').textContent = `Lng: ${crime.lng.toFixed(5)}`;

    // Cambiar apariencia del botón
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.textContent = 'Actualizar Incidente';
    submitBtn.classList.add('editing');

    // Mover el mapa al punto y mostrar marcador
    map.setView([crime.lat, crime.lng], 15);
    L.circleMarker([crime.lat, crime.lng], {
        radius: 10,
        fillColor: "#ef4444",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map).fadeOut(3000);

    // Hacer scroll al formulario
    document.querySelector('.sidebar').scrollTop = 0;
    showNotification('Editando registro...');
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
    const condition = document.getElementById('pCondicion').value;
    const unit = document.getElementById('pUnit').value;
    const contact = document.getElementById('pContact').value.trim();
    const grupoDestino = document.getElementById('pGrupoDestino')?.value || 'GT ECHO';
    const rotacion = document.getElementById('pRotacion')?.value || 'N/A';

    if (editingPersonnelId) {
        const index = personnel.findIndex(p => p.id === editingPersonnelId);
        if (index !== -1) {
            personnel[index] = { ...personnel[index], grade, specialty, name, idNum, condition, unit, contact, grupoDestino, rotacion };
            showNotification('Registro de personal actualizado');
        }
    } else {
        const newPerson = {
            id: Date.now(),
            grade, specialty, name, idNum, condition, unit, contact, grupoDestino, rotacion
        };
        personnel.push(newPerson);
        showNotification(`${grade} ${name} registrado con éxito`);
    }

    saveData();
    updatePersonnelStats();

    renderPersonnelTable();
    resetPersonnelForm();
}

// --- PUESTO DE MANDO ---
function handleCommandPostSubmit(e) {
    e.preventDefault();
    const grade = document.getElementById('cpGrade').value;
    const specialty = document.getElementById('cpEspecialidad').value.trim().toUpperCase();
    const name = document.getElementById('cpName').value.trim().toUpperCase();
    const idNum = document.getElementById('cpId').value.trim();
    const condition = document.getElementById('cpCondicion').value;
    const unit = document.getElementById('cpUnit').value.trim().toUpperCase();
    const contact = document.getElementById('cpContact').value.trim();
    const duty = document.getElementById('cpDuty').value.trim().toUpperCase();

    const newPerson = {
        id: Date.now(),
        grade, specialty, name, idNum, condition, unit, contact, duty
    };

    commandPostPersonnel.push(newPerson);
    saveData();
    renderCommandPostTable();
    populateCommandPostSelectors();
    populateORDPATSelectors();
    document.getElementById('commandPostForm').reset();
    showNotification(`Personal del Puesto de Mando registrado: ${name}`);
}

function renderCommandPostTable() {
    const body = document.getElementById('commandPostTableBody');
    if (!body) return;
    body.innerHTML = '';

    commandPostPersonnel.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.grade}</td>
            <td>${p.specialty}</td>
            <td style="font-weight: 600;">${p.name}</td>
            <td>${p.idNum}</td>
            <td>${p.condition}</td>
            <td>${p.unit}</td>
            <td>${p.duty}</td>
            <td><button class="btn-remove" onclick="removeCommandPostPerson(${p.id})">×</button></td>
        `;
        body.appendChild(tr);
    });
}

function removeCommandPostPerson(id) {
    if (!confirm('¿Desea eliminar a esta persona del Puesto de Mando?')) return;
    commandPostPersonnel = commandPostPersonnel.filter(p => p.id !== id);
    saveData();
    renderCommandPostTable();
    populateCommandPostSelectors();
    populateORDPATSelectors();
}

// --- MODAL DE CONFIRMACIÓN PREMIUM (reutilizable) ---
function showConfirmModal({ icon = '⚠️', title = '¿Confirmar acción?', message = '', onConfirm = () => {}, onCancel = () => {} } = {}) {
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
    console.log("👉 Botón 'Nueva Carga' clickeado. Registros de personal actuales:", personnel ? personnel.length : 'undefined');
    if (!personnel || personnel.length === 0) {
        console.warn("⚠️ Abortando Nueva Carga: No hay registros activos en la lista 'personnel' para archivar.");
        showNotification("No hay registros actuales para archivar.");
        return;
    }

    showConfirmModal({
        icon: '📦',
        title: 'Nueva Carga de Personal',
        message: '¿Desea archivar la carga actual en el historial y limpiar el registro para una nueva carga? Los datos actuales se conservarán para reportes históricos.',
        onConfirm: () => {
            // Guardar en el histórico
            personnelHistory = [...personnelHistory, ...personnel];
            // Limpiar el registro actual
            personnel = [];
            saveData();
            renderPersonnelTable();
            updatePersonnelStats();
            showNotification("✅ Carga archivada en el histórico y registro reiniciado.");
        }
    });
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
    const all = [...(specialAssignments || []), ...(guardAssignments || [])];

    const shiftMap = {
        "0800-1200 / 2000-0000": "TURNO 1 (08H00 A 12H00 / 20H00 A 00H00)",
        "12H00 A 16H00 / 00H00 A 04H00": "TURNO 2 (12H00 A 16H00 / 00H00 A 04H00)",
        "16H00 A 20H00 / 04H00 A 08H00": "TURNO 3 (16H00 A 20H00 / 04H00 A 08H00)",
        "2300 - 0200": "CONTROL TOQUE DE QUEDA T1 (2300 - 0200)",
        "0200 - 0500": "CONTROL TOQUE DE QUEDA T2 (0200 - 0500)"
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
            <td style="border: 1px solid var(--border); padding: 5px; text-align: center;"><button type="button" class="btn-remove-row" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" onclick="this.closest('tr').remove()">×</button></td>
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
    if (document.getElementById('pCondicion')) document.getElementById('pCondicion').value = person.condition || 'OPERATIVO';
    document.getElementById('pUnit').value = person.unit;
    document.getElementById('pContact').value = person.contact;
    if (document.getElementById('pGrupoDestino')) {
        document.getElementById('pGrupoDestino').value = person.grupoDestino || 'GT ECHO';
    }
    if (document.getElementById('pRotacion')) {
        document.getElementById('pRotacion').value = person.rotacion || 'N/A';
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
    if (confirm('¿Eliminar de forma permanente este miembro del personal?')) {
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

function updatePersonnelStats() {
    const statTotal = document.getElementById('statTotalPersonal');
    const statGridTotal = document.getElementById('statTotalPersonnelGrid');
    const statBabor = document.getElementById('statTotalBabor');
    const statEstribor = document.getElementById('statTotalEstribor');
    const statOperativos = document.getElementById('statTotalOperativos');
    const statOtros = document.getElementById('statTotalOtros');

    if (!statTotal) return;

    // A. CARGAR DATOS SI ESTÁN VACÍOS (Persistencia tras refrescar)
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

    // --- LIMPIEZA DE ARREGLOS DE GUARDIA EN TIEMPO REAL ---
    // IMPORTANTE: Esta función NO debe mutar el arreglo global `personnel`.
    // El arreglo `personnel` es la fuente de verdad y solo se modifica durante
    // la importación de datos (con su propio sistema de deduplicación).
    function deduplicateStateArrays() {
        // Construir índice de nombres activos solo para limpiar babor/estribor
        const activeNames = new Set(personnel.map(p => (p.name || '').trim().toLowerCase()));

        const seenBabor = new Set();
        baborPersonnel = baborPersonnel.filter(p => {
            let key = null;
            const normalizedId = String(p.idNum || '').trim().toUpperCase();
            const hasId = normalizedId !== '' && 
                          normalizedId !== 'S/N' && 
                          normalizedId !== 'N/A' && 
                          !normalizedId.includes('CÉDULA') && 
                          !normalizedId.includes('CEDULA');
            const hasName = p.name && p.name.trim() !== '' && p.name.trim().toUpperCase() !== 'S/N NOMBRE' && p.name.trim().toUpperCase() !== 'S/N';
            
            if (hasId) {
                key = 'DNI_' + normalizedId;
            } else if (hasName) {
                key = 'NAME_' + String(p.name).trim().toLowerCase();
            }
            
            if (key) {
                if (seenBabor.has(key)) return false;
                seenBabor.add(key);
            }
            return activeNames.has((p.name || '').trim().toLowerCase());
        });

        const seenEstribor = new Set();
        estriborPersonnel = estriborPersonnel.filter(p => {
            let key = null;
            const normalizedId = String(p.idNum || '').trim().toUpperCase();
            const hasId = normalizedId !== '' && 
                          normalizedId !== 'S/N' && 
                          normalizedId !== 'N/A' && 
                          !normalizedId.includes('CÉDULA') && 
                          !normalizedId.includes('CEDULA');
            const hasName = p.name && p.name.trim() !== '' && p.name.trim().toUpperCase() !== 'S/N NOMBRE' && p.name.trim().toUpperCase() !== 'S/N';
            
            if (hasId) {
                key = 'DNI_' + normalizedId;
            } else if (hasName) {
                key = 'NAME_' + String(p.name).trim().toLowerCase();
            }
            
            if (key) {
                if (seenEstribor.has(key)) return false;
                seenEstribor.add(key);
            }
            return activeNames.has((p.name || '').trim().toLowerCase());
        });
    }

    // Ejecutar limpieza de arreglos de guardia (sin modificar personnel)
    deduplicateStateArrays();

    // 1. Total Personal Registrado (Siempre el total en la base de datos)
    statTotal.textContent = personnel.length;

    // Estadísticas de condición
    const countOperativos = personnel.filter(p => !p.condition || p.condition === 'OPERATIVO').length;
    const countOtros = personnel.length - countOperativos;
    if (statOperativos) statOperativos.textContent = countOperativos;
    if (statOtros) statOtros.textContent = countOtros;

    // 2. Poblar los recuadros de la cuadrícula
    if (statGridTotal) statGridTotal.textContent = personnel.length;

    // Totales por Unidad Operativa
    const gtEchoPersonnel = personnel.filter(p => (p.grupoDestino || 'GT ECHO') === 'GT ECHO');
    const codescPersonnel = personnel.filter(p => p.grupoDestino === 'CODESC');

    const statTotalGtEcho = document.getElementById('statTotalGtEcho');
    const statTotalCodesc = document.getElementById('statTotalCodesc');
    if (statTotalGtEcho) statTotalGtEcho.textContent = gtEchoPersonnel.length;
    if (statTotalCodesc) statTotalCodesc.textContent = codescPersonnel.length;

    // Distribución por grupos para GT ECHO
    const gtEchoAlfa = gtEchoPersonnel.filter(p => p.rotacion === 'ALFA').length;
    const gtEchoBravo = gtEchoPersonnel.filter(p => p.rotacion === 'BRAVO').length;
    const gtEchoCharlie = gtEchoPersonnel.filter(p => p.rotacion === 'CHARLIE').length;
    const gtEchoDelta = gtEchoPersonnel.filter(p => p.rotacion === 'DELTA' || p.rotacion === 'FRANCO').length;

    const elGtEchoAlfa = document.getElementById('statGtEchoAlfa');
    const elGtEchoBravo = document.getElementById('statGtEchoBravo');
    const elGtEchoCharlie = document.getElementById('statGtEchoCharlie');
    const elGtEchoDelta = document.getElementById('statGtEchoDelta') || document.getElementById('statGtEchoFranco');

    if (elGtEchoAlfa) elGtEchoAlfa.textContent = gtEchoAlfa;
    if (elGtEchoBravo) elGtEchoBravo.textContent = gtEchoBravo;
    if (elGtEchoCharlie) elGtEchoCharlie.textContent = gtEchoCharlie;
    if (elGtEchoDelta) elGtEchoDelta.textContent = gtEchoDelta;

    // Distribución por grupos para CODESC
    const codescFoxtrot = codescPersonnel.filter(p => p.rotacion === 'FOXTROT').length;
    const codescGolf = codescPersonnel.filter(p => p.rotacion === 'GOLF').length;

    const elCodescFoxtrot = document.getElementById('statCodescFoxtrot');
    const elCodescGolf = document.getElementById('statCodescGolf');

    if (elCodescFoxtrot) elCodescFoxtrot.textContent = codescFoxtrot;
    if (elCodescGolf) elCodescGolf.textContent = codescGolf;

    // --- LÓGICA DE GRÁFICOS CON DESGLOSE POR GRUPO ---

    // 1. Estadísticas por Puesto (Basado en la distribución de guardia actual)
    const allAssignments = [...specialAssignments, ...guardAssignments];

    const postCountsGtEcho = {};
    const postCountsCodesc = {};
    const postCountsOther = {};

    allAssignments.forEach(a => {
        const loc = a.assignedLocation || "Otro";
        const personId = String(a.id);
        const person = personnel.find(p => String(p.id) === personId);

        if (person) {
            const group = person.grupoDestino || "GT ECHO";
            if (group === "GT ECHO") {
                postCountsGtEcho[loc] = (postCountsGtEcho[loc] || 0) + 1;
            } else if (group === "CODESC") {
                postCountsCodesc[loc] = (postCountsCodesc[loc] || 0) + 1;
            } else {
                postCountsOther[loc] = (postCountsOther[loc] || 0) + 1;
            }
        } else {
            postCountsOther[loc] = (postCountsOther[loc] || 0) + 1;
        }
    });

    // Unir todas las localizaciones únicas para el eje X
    const allPosts = [...new Set([
        ...Object.keys(postCountsGtEcho),
        ...Object.keys(postCountsCodesc),
        ...Object.keys(postCountsOther)
    ])].filter(p => p !== "Otro"); // Limpiar un poco

    // Renderizar Gráfico de Puestos
    const ctxPost = document.getElementById('personnelPostChart');
    if (ctxPost) {
        if (personnelPostChart) personnelPostChart.destroy();
        personnelPostChart = new Chart(ctxPost.getContext('2d'), {
            type: 'bar',
            data: {
                labels: allPosts,
                datasets: [
                    {
                        label: 'GT ECHO',
                        data: allPosts.map(p => postCountsGtEcho[p] || 0),
                        backgroundColor: 'rgba(22, 163, 74, 0.6)',
                        borderColor: '#16a34a',
                        borderWidth: 1
                    },
                    {
                        label: 'CODESC',
                        data: allPosts.map(p => postCountsCodesc[p] || 0),
                        backgroundColor: 'rgba(219, 39, 119, 0.6)',
                        borderColor: '#db2777',
                        borderWidth: 1
                    },
                    {
                        label: 'Otros',
                        data: allPosts.map(p => postCountsOther[p] || 0),
                        backgroundColor: 'rgba(148, 163, 184, 0.4)',
                        borderColor: '#94a3b8',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', stepSize: 1 }
                    },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#94a3b8', font: { size: 10 } }
                    },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#38bdf8', bodyColor: '#fff' }
                }
            }
        });
    }

    // 3. Estadísticas por Reparto (Desglose por Grados)
    const unitGradeCounts = {}; // { Unit: { Grade: Count } }
    const gradesSet = new Set();
    const unitsSet = new Set();

    personnel.forEach(p => {
        const u = p.unit || "S/N";
        const g = p.grade || "S/N";
        if (!unitGradeCounts[u]) unitGradeCounts[u] = {};
        unitGradeCounts[u][g] = (unitGradeCounts[u][g] || 0) + 1;
        gradesSet.add(g);
        unitsSet.add(u);
    });

    const allUnitsSorted = [...unitsSet].sort();
    const allGradesSorted = [...gradesSet].sort((a, b) => {
        const hierarchy = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
        return hierarchy.indexOf(a) - hierarchy.indexOf(b);
    });

    // Paleta de colores para grados (Premium)
    const gradeColors = [
        '#0ea5e9', '#38bdf8', '#7dd3fc', // Blues
        '#ef4444', '#f87171', '#fca5a5', // Reds
        '#22c55e', '#4ade80', '#86efac', // Greens
        '#f59e0b', '#fbbf24', '#fcd34d', // Oranges
        '#8b5cf6', '#a78bfa', '#c4b5fd'  // Purples
    ];

    const unitDatasets = allGradesSorted.map((grade, index) => {
        return {
            label: grade,
            data: allUnitsSorted.map(unit => unitGradeCounts[unit][grade] || 0),
            backgroundColor: gradeColors[index % gradeColors.length] + '99', // adding transparency
            borderColor: gradeColors[index % gradeColors.length],
            borderWidth: 1
        };
    });

    // Renderizar Gráfico de Repartos
    const ctxUnit = document.getElementById('personnelUnitChart');
    if (ctxUnit) {
        if (personnelUnitChart) personnelUnitChart.destroy();
        personnelUnitChart = new Chart(ctxUnit.getContext('2d'), {
            type: 'bar',
            data: {
                labels: allUnitsSorted,
                datasets: unitDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', stepSize: 1 }
                    },
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 10 } }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'right',
                        labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 }
                    },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#38bdf8', bodyColor: '#fff' }
                }
            }
        });
    }
}

function renderPersonnelTable(searchTerm = '') {
    const tableBody = document.getElementById('tableBodyPersonnel');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const filtered = personnel.filter(p => {
        const name = (p.name || '').toLowerCase();
        const unit = (p.unit || '').toLowerCase();
        return name.includes(searchTerm) || unit.includes(searchTerm);
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

        const groupText = p.grupoDestino || 'GT ECHO';
        const badgeStyle = (groupText === 'CODESC') 
            ? 'background-color: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8;' 
            : 'background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;';
        const badgeHtml = `<span style="padding: 4px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; display: inline-block; text-align: center; min-width: 70px; ${badgeStyle}">${groupText}</span>`;

        const rotacionText = p.rotacion || 'N/A';
        let rotColor = '#64748b'; // N/A
        if (rotacionText === 'ALFA') rotColor = '#3b82f6'; // Azul
        else if (rotacionText === 'BRAVO') rotColor = '#10b981'; // Verde
        else if (rotacionText === 'CHARLIE') rotColor = '#f59e0b'; // Naranja
        else if (rotacionText === 'DELTA' || rotacionText === 'FRANCO') rotColor = '#8b5cf6'; // Morado (Delta / Franco legacy)
        
        const rotBadgeHtml = rotacionText !== 'N/A' 
            ? `<span style="padding: 4px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; display: inline-block; text-align: center; color: white; background-color: ${rotColor}; min-width: 70px;">${rotacionText}</span>`
            : `<span style="color: #94a3b8; font-size: 0.8rem; font-weight: 600;">N/A</span>`;

        row.innerHTML = `
            <td style="${rowColorStyle}">${p.grade}</td>
            <td style="${rowColorStyle}">${p.specialty || 'N/A'}</td>
            <td style="${rowColorStyle}">${p.name}</td>
            <td style="${rowColorStyle}">${p.idNum}</td>
            <td style="${rowColorStyle}">${condicion}</td>
            <td style="${rowColorStyle}">${p.unit}</td>
            <td style="${rowColorStyle}">${p.contact}</td>
            <td style="text-align: center; vertical-align: middle;">${badgeHtml}</td>
            <td style="text-align: center; vertical-align: middle;">${rotBadgeHtml}</td>
            <td class="table-actions">
                <button class="btn-action edit" onclick="editPersonnel(${p.id})" title="Editar">✏️</button>
                <button class="btn-action delete" onclick="deletePersonnel(${p.id})" title="Eliminar">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function downloadPersonnelTemplate() {
    const ws_data = [
        ['Grado', 'Especialidad', 'Apellidos y Nombres', 'Cédula', 'Condición', 'Reparto', 'Nro Telefónico'],
        ['Marinero', 'Infante de Marina', 'Pérez Juan', '0999999999', 'OPERATIVO', 'SUR', '0988888888']
    ];

    // Set column widths
    const wscols = [
        { wch: 15 }, { wch: 25 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }
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

                let tempHeaderRowIndex = -1;
                let tempColMap = { grade: -1, spec: -1, name: -1, id: -1, cond: -1, unit: -1, role: -1, status: -1, contact: -1, grupoDestino: -1, rotacion: -1 };
                let foundHeadersMax = 0;

                for (let i = 0; i < Math.min(15, dataArray.length); i++) {
                    const row = dataArray[i];
                    if (!Array.isArray(row)) continue;

                    let foundHeaders = 0;
                    for (let j = 0; j < row.length; j++) {
                        const cellVal = String(row[j] || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        if (!cellVal) continue;

                        if (cellVal.includes('grado') || cellVal.includes('rango')) { tempColMap.grade = j; foundHeaders++; }
                        else if (cellVal.includes('especialidad') || cellVal === 'esp') { tempColMap.spec = j; foundHeaders++; }
                        else if (cellVal.includes('nombres') || cellVal.includes('nombre')) { tempColMap.name = j; foundHeaders++; }
                        else if (cellVal.includes('cedula') || cellVal.includes('identificacion') || cellVal.includes('dni')) { tempColMap.id = j; foundHeaders++; }
                        else if (cellVal.includes('condicion')) { tempColMap.cond = j; foundHeaders++; }
                        else if (cellVal.includes('reparto') || cellVal.includes('unidad')) { tempColMap.unit = j; foundHeaders++; }
                        else if (cellVal.includes('funcion') || cellVal.includes('función') || cellVal.includes('rol')) { tempColMap.role = j; foundHeaders++; }
                        else if (cellVal.includes('telefon') || cellVal.includes('contacto') || cellVal.includes('celular')) { tempColMap.contact = j; foundHeaders++; }
                        else if (cellVal.includes('echo') || cellVal.includes('codesc') || cellVal.includes('destino') || cellVal.includes('gt')) { tempColMap.grupoDestino = j; foundHeaders++; }
                        else if (cellVal.includes('rotacion') || cellVal.includes('grupo a') || cellVal.includes('alfa')) { tempColMap.rotacion = j; foundHeaders++; }
                    }

                    if (foundHeaders > foundHeadersMax) {
                        foundHeadersMax = foundHeaders;
                        tempHeaderRowIndex = i;
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
                    bestColMap = tempColMap;
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
                colMap = { grade: 0, spec: 1, name: 2, id: 3, cond: 4, unit: 5, contact: 6, grupoDestino: 7, rotacion: 8, role: -1 };
                headerRowIndex = -1; // Comienza a leer desde el inicio de la hoja
            }

            // Si no se detectó contacto o función por encabezado, inferirlos por valores de fila
            if ((colMap.contact === -1 || colMap.role === -1) && dataArray.length > 0) {
                const startRowIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 0;
                const sampleRows = dataArray.slice(startRowIdx, startRowIdx + 15).filter(Array.isArray);
                const maxCols = sampleRows.reduce((max, row) => Math.max(max, row.length), 0);
                const stats = Array.from({ length: maxCols }, () => ({ phone: 0, roleLike: 0, nonEmpty: 0 }));
                const phoneRegex = /[+\d][\d\s\-()]{5,}/;
                const roleRegex = /\b(A[1-9]|B[1-9]|C[1-9]|D[1-9]|FUNCION|FUNCIÓN|ROL|TAREA|APOYO|OPERATIVO|LOGISTICA|INTELIGENCIA)\b/i;

                sampleRows.forEach(row => {
                    for (let j = 0; j < maxCols; j++) {
                        const cell = String(row[j] || '').trim();
                        if (!cell) continue;
                        stats[j].nonEmpty += 1;
                        if (phoneRegex.test(cell)) stats[j].phone += 1;
                        if (roleRegex.test(cell)) stats[j].roleLike += 1;
                    }
                });

                let bestPhoneCol = -1;
                let bestPhoneScore = 0;
                let bestRoleCol = -1;
                let bestRoleScore = 0;

                stats.forEach((col, j) => {
                    if (col.nonEmpty === 0) return;
                    const phoneScore = col.phone / col.nonEmpty;
                    const roleScore = col.roleLike / col.nonEmpty;
                    if (phoneScore > bestPhoneScore && phoneScore >= 0.4) {
                        bestPhoneScore = phoneScore;
                        bestPhoneCol = j;
                    }
                    if (roleScore > bestRoleScore && roleScore >= 0.3) {
                        bestRoleScore = roleScore;
                        bestRoleCol = j;
                    }
                });

                if (colMap.contact === -1 && bestPhoneCol !== -1) {
                    colMap.contact = bestPhoneCol;
                }
                if (colMap.role === -1 && bestRoleCol !== -1 && bestRoleCol !== colMap.contact) {
                    colMap.role = bestRoleCol;
                }

                // SI TENEMOS AMBAS COLUMNAS, VERIFICAR SI SE INTERCAMBIARON POR ERROR
                if (colMap.contact !== -1 && colMap.role !== -1 && colMap.contact !== colMap.role) {
                    const contactStats = stats[colMap.contact] || { phone: 0, roleLike: 0, nonEmpty: 0 };
                    const roleStats = stats[colMap.role] || { phone: 0, roleLike: 0, nonEmpty: 0 };
                    const contactPhoneScore = contactStats.nonEmpty ? contactStats.phone / contactStats.nonEmpty : 0;
                    const contactRoleScore = contactStats.nonEmpty ? contactStats.roleLike / contactStats.nonEmpty : 0;
                    const rolePhoneScore = roleStats.nonEmpty ? roleStats.phone / roleStats.nonEmpty : 0;
                    const roleRoleScore = roleStats.nonEmpty ? roleStats.roleLike / roleStats.nonEmpty : 0;

                    // Si la columna de contacto se parece más a una función y la columna de función se parece más a un teléfono, intercambiamos.
                    if (contactRoleScore > 0.5 && rolePhoneScore > 0.5 && contactPhoneScore < 0.25 && roleRoleScore < 0.25) {
                        const oldContact = colMap.contact;
                        colMap.contact = colMap.role;
                        colMap.role = oldContact;
                        console.log(`[Excel Import] Se intercambiaron columnas contact/role porque parecía que estaban invertidas (${oldContact} <-> ${colMap.contact}).`);
                    }

                    // Si la columna detectada como contacto no tiene formato telefónico, buscar otra columna más probable.
                    if (colMap.contact !== -1 && contactPhoneScore < 0.3) {
                        let bestCandidate = colMap.contact;
                        let bestCandidateScore = contactPhoneScore;
                        stats.forEach((col, j) => {
                            if (j === colMap.role || j === colMap.contact || col.nonEmpty === 0) return;
                            const score = col.phone / col.nonEmpty;
                            if (score > bestCandidateScore) {
                                bestCandidateScore = score;
                                bestCandidate = j;
                            }
                        });
                        if (bestCandidate !== colMap.contact && bestCandidateScore >= 0.5) {
                            console.log(`[Excel Import] Ajustando columna de contacto de ${colMap.contact} a ${bestCandidate} por mejor puntaje telefónico (${bestCandidateScore.toFixed(2)}).`);
                            colMap.contact = bestCandidate;
                        }
                    }
                }
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
                        }
                    }
                }
            }

            // Fallback absoluto por defecto para cualquier columna que aún quede en -1 para evitar errores
            if (colMap.grade === -1) colMap.grade = 0;
            if (colMap.spec === -1) colMap.spec = 1;
            if (colMap.name === -1) colMap.name = 2;
            if (colMap.id === -1) colMap.id = 3;
            if (colMap.cond === -1) colMap.cond = 4;
            if (colMap.unit === -1) colMap.unit = 5;
            if (colMap.contact === -1) colMap.contact = 6;
            if (colMap.grupoDestino === -1) colMap.grupoDestino = 7;
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

                // Extraer valores o usar defaults
                const gradeVal = colMap.grade !== -1 ? row[colMap.grade] : '';
                const specVal = colMap.spec !== -1 ? row[colMap.spec] : '';
                const nameVal = colMap.name !== -1 ? row[colMap.name] : '';
                const idVal = colMap.id !== -1 ? row[colMap.id] : '';
                const condVal = colMap.cond !== -1 ? row[colMap.cond] : '';
                const unitVal = colMap.unit !== -1 ? row[colMap.unit] : '';
                let contactVal = colMap.contact !== -1 ? row[colMap.contact] : '';
                let roleVal = colMap.role !== -1 ? row[colMap.role] : '';
                const grupoDestinoVal = colMap.grupoDestino !== -1 ? row[colMap.grupoDestino] : '';
                const rotacionVal = colMap.rotacion !== -1 ? row[colMap.rotacion] : '';

                const phoneRegex = /[+\d][\d\s\-()]{5,}/;
                const roleRegex = /\b(A[1-9]|B[1-9]|C[1-9]|D[1-9]|FUNCION|FUNCIÓN|ROL|TAREA|APOYO|OPERATIVO|LOGISTICA|INTELIGENCIA)\b/i;
                const currentContact = String(contactVal || '').trim();
                const currentRole = String(roleVal || '').trim();

                if (currentContact && roleRegex.test(currentContact)) {
                    // Si la columna de contacto parece una función, intentar corregirla con otra celda que tenga teléfono.
                    const phoneCandidateIndex = row.findIndex((cell, idx) => {
                        if (idx === colMap.contact || idx === colMap.role) return false;
                        return phoneRegex.test(String(cell || '').trim());
                    });

                    if (phoneCandidateIndex !== -1) {
                        const candidatePhone = String(row[phoneCandidateIndex] || '').trim();
                        if (candidatePhone) {
                            if (!currentRole || !phoneRegex.test(currentRole)) {
                                roleVal = contactVal;
                                contactVal = candidatePhone;
                            } else if (phoneRegex.test(currentRole)) {
                                const tmp = contactVal;
                                contactVal = roleVal;
                                roleVal = tmp;
                            }
                        }
                    } else if (currentRole && phoneRegex.test(currentRole)) {
                        const tmp = contactVal;
                        contactVal = roleVal;
                        roleVal = tmp;
                    }
                } else if (currentRole && phoneRegex.test(currentRole) && (!currentContact || !phoneRegex.test(currentContact))) {
                    // Si la columna detectada como función en realidad es teléfono, intercambiamos.
                    const tmp = contactVal;
                    contactVal = roleVal;
                    roleVal = tmp;
                }

                let grupoDestino = String(grupoDestinoVal || '').toUpperCase().trim();
                if (!grupoDestino || (!grupoDestino.includes('CODES') && !grupoDestino.includes('ECHO'))) {
                    // Buscar de forma tolerante en la fila completa
                    const rowStr = row.join(' ').toUpperCase();
                    if (rowStr.includes('CODESC')) grupoDestino = 'CODESC';
                    else grupoDestino = 'GT ECHO';
                } else {
                    grupoDestino = grupoDestino.includes('CODES') ? 'CODESC' : 'GT ECHO';
                }

                let rotacion = String(rotacionVal || '').toUpperCase().trim();
                if (rotacion === 'FRANCO') rotacion = 'DELTA'; // Migración de Franco a Delta
                if (!rotacion || !['ALFA', 'BRAVO', 'CHARLIE', 'DELTA', 'N/A'].includes(rotacion)) {
                    // Si se detectó un grupo por encabezado de sección, usar ese
                    if (currentDetectedGroup) {
                        rotacion = currentDetectedGroup;
                    } else {
                        // Buscar en la fila entera si la cabecera rotación no fue explícita pero hay un grupo obvio
                        const rowStr = row.join(' ').toUpperCase();
                        if (rowStr.includes('ALFA')) rotacion = 'ALFA';
                        else if (rowStr.includes('BRAVO')) rotacion = 'BRAVO';
                        else if (rowStr.includes('CHARLIE')) rotacion = 'CHARLIE';
                        else if (rowStr.includes('DELTA') || rowStr.includes('FRANCO')) rotacion = 'DELTA';
                        else rotacion = 'N/A';
                    }
                }

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
                const hasId = normalizedId !== '' && normalizedId !== 'S/N' && normalizedId !== 'N/A' && !normalizedId.includes('CÉDULA') && !normalizedId.includes('CEDULA');
                const hasName = name && name.trim() !== '' && name.trim().toUpperCase() !== 'S/N NOMBRE' && name.trim().toUpperCase() !== 'S/N';
                
                for (let idx = 0; idx < personnel.length; idx++) {
                    const p = personnel[idx];
                    const pId = String(p.idNum || '').trim().toUpperCase();
                    const hasPId = pId !== '' && pId !== 'S/N' && pId !== 'N/A' && !pId.includes('CÉDULA') && !pId.includes('CEDULA');
                    const hasPName = p.name && p.name.trim() !== '' && p.name.trim().toUpperCase() !== 'S/N NOMBRE' && p.name.trim().toUpperCase() !== 'S/N';
                    
                    if (hasId && hasPId && normalizedId === pId) {
                        exists = true;
                        p.grade = grade;
                        p.specialty = specialty;
                        p.role = String(roleVal || '');
                        p.name = name;
                        p.condition = String(condVal || 'OPERATIVO').toUpperCase().trim();
                        p.unit = String(unitVal || 'N/A');
                        p.contact = String(contactVal || '');
                        p.grupoDestino = grupoDestino;
                        p.rotacion = rotacion;
                        break;
                    } else if (hasName && hasPName && p.name.trim().toLowerCase() === name.trim().toLowerCase()) {
                        exists = true;
                        p.grade = grade;
                        p.specialty = specialty;
                        p.role = String(roleVal || '');
                        if (hasId) p.idNum = idNum;
                        p.condition = String(condVal || 'OPERATIVO').toUpperCase().trim();
                        p.unit = String(unitVal || 'N/A');
                        p.contact = String(contactVal || '');
                        p.grupoDestino = grupoDestino;
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
                    role: String(roleVal || ''),
                    name: name,
                    idNum: idNum,
                    condition: String(condVal || 'OPERATIVO').toUpperCase().trim(),
                    unit: String(unitVal || 'N/A'),
                    contact: String(contactVal || ''),
                    grupoDestino: grupoDestino,
                    rotacion: rotacion
                };

                personnel.push(newPerson);

                // Auto-asignación a guardia si existe el encabezado
                if (currentDetectedGuard === 'babor') {
                    baborPersonnel.push(newPerson);
                } else if (currentDetectedGuard === 'estribor') {
                    estriborPersonnel.push(newPerson);
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
// ----------------------------------------------------

function getIntensity(type) {
    // Definir importancia del delito para el mapa de calor
    switch (type) {
        case 'sicariato': return 0.9;
        case 'extorsion': return 0.8;
        case 'droga': return 0.7;
        case 'robo': return 0.6;
        default: return 0.5;
    }
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

    // Tipos de delitos + Operaciones
    const types = ['robo', 'sicariato', 'extorsion', 'droga', 'operacion'];

    types.forEach(type => {
        // Combinar crímenes y operaciones para el calor si es tipo operacion
        let dataToHeat = [];
        if (type === 'operacion') {
            dataToHeat = instantOps
                .filter(op => op.lat != null && op.lng != null && !isNaN(op.lat) && !isNaN(op.lng))
                .map(op => [op.lat, op.lng, 0.8]);
        } else {
            dataToHeat = crimes.filter(c => c.type === type).map(c => [c.lat, c.lng, c.intensity]);
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
}

function refreshMarkers() {
    if (!markerLayer) return;
    markerLayer.clearLayers();

    // Limpiar objeto de referencias
    for (let id in incidentMarkers) delete incidentMarkers[id];

    crimes.forEach(crime => {
        const marker = L.circleMarker([crime.lat, crime.lng], {
            radius: 6,
            fillColor: CRIME_COLORS[crime.type] || '#fff',
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });

        const popupContent = `
            <div class="custom-popup">
                <h4 style="margin: 0 0 5px 0; color: #38bdf8; text-transform: capitalize;">${crime.type}</h4>
                <p style="margin: 0; font-size: 0.9em;"><b>Distrito:</b> ${crime.district || 'S/N'}</p>
                <p style="margin: 0; font-size: 0.9em;"><b>Fecha:</b> ${new Date(crime.date).toLocaleString()}</p>
                <hr style="margin: 8px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.1);">
                <p style="margin: 0; font-size: 0.9em;"><b>Observación:</b><br>${crime.observation || 'Sin observaciones'}</p>
            </div>
        `;

        marker.bindPopup(popupContent);
        markerLayer.addLayer(marker);

        // Guardar referencia al marcador
        incidentMarkers[crime.id] = marker;
    });

    // Añadir marcadores de operaciones
    instantOps.forEach(op => {
        if (op.lat == null || op.lng == null || isNaN(op.lat) || isNaN(op.lng)) return;
        const marker = L.circleMarker([op.lat, op.lng], {
            radius: 8,
            fillColor: CRIME_COLORS.operacion,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        });

        const popupContent = `
            <div class="custom-popup" style="min-width: 250px;">
                <div style="background: #8b5cf6; color: white; padding: 5px 10px; border-radius: 4px; font-weight: bold; margin-bottom: 8px; font-size: 0.75rem;">
                    OFICIAL: ${op.reportNum || 'S/N'}
                </div>
                <p style="margin: 0 0 4px 0; font-size: 0.85rem;"><b>REF:</b> ${op.ref || '---'}</p>
                <p style="margin: 0 0 4px 0; font-size: 0.85rem;"><b>Ubicación:</b> ${op.donde || '---'}</p>
                <p style="margin: 0 0 8px 0; font-size: 0.85rem;"><b>Fecha:</b> ${op.date || '---'}</p>
                
                <div style="margin: 8px 0 0 0; font-size: 0.8rem; color: #555; max-height: 100px; overflow-y: auto; border-top: 1px solid #eee; padding-top: 8px;">
                    ${op.resultadosRich ? stripHtmlForPDF(op.resultadosRich).substring(0, 150) + '...' : 'Sin detalles registrados'}
                </div>
                
                <button onclick="generateOfficialDetailedPDF('${op.id}')" style="width: 100%; margin-top: 10px; padding: 6px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">
                    Descargar PDF Oficial
                </button>
            </div>
        `;

        marker.bindPopup(popupContent);
        markerLayer.addLayer(marker);
        incidentMarkers[op.id] = marker; // Reutilizamos el mismo sistema de focus
    });
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
    tableBody.innerHTML = '';

    const filteredCrimes = crimes.filter(crime => {
        if (incidentFilters.type && !crime.type.toLowerCase().includes(incidentFilters.type.toLowerCase())) return false;
        if (incidentFilters.district && crime.district !== incidentFilters.district) return false;
        return true;
    });

    if (typeof updateIntelStats === 'function') {
        updateIntelStats(filteredCrimes);
    }

    if (filteredCrimes.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="6" style="text-align:center; color: #64748b; padding: 2rem;">No hay incidentes que coincidan con los filtros seleccionados.</td>`;
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

        row.innerHTML = `
            <td style="text-transform: capitalize;">${crime.type}</td>
            <td>${crime.district || 'S/N'}</td>
            <td>${new Date(crime.date).toLocaleString()}</td>
            <td>${crime.lat.toFixed(4)}, ${crime.lng.toFixed(4)}</td>
            <td>${crime.observation || '---'}</td>
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
    if (confirm('¿Eliminar este registro?')) {
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
        ["GRADO", "ESPECIALIDAD", "NOMBRES Y APELLIDOS", "CÉDULA", "REPARTO", "CONTACTO"] // Encabezado de tabla
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
                    p.contact || "S/N"
                ]);
            });
        });
        aoa_data.push([]); // Espacio entre bloques
    };

    // Construir estructura
    appendExcelBlock("TAREAS DE APOYO (CUOTAS FIJAS)", specialAssignments);

    const tqMembers = guardAssignments.filter(d => d.assignedShift === "CONTROL TOQUE DE QUEDA");
    appendExcelBlock("CONTROL TOQUE DE QUEDA (REPARTO AUTOMÁTICO)", tqMembers);

    shiftsResources.forEach(shift => {
        const shiftMembers = guardAssignments.filter(d => d.assignedShift === shift.name);
        appendExcelBlock(`${shift.name} (${shift.time})`, shiftMembers);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(aoa_data);

    // Ajustes de ancho de columna
    const wscols = [
        { wch: 15 }, // Grado
        { wch: 25 }, // Especialidad
        { wch: 40 }, // Nombres
        { wch: 15 }, // Cédula
        { wch: 20 }  // Contacto
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
        aoa_data.push(["N°", "EVENTO / FECHA-HORA", "SECTOR", "PERSONAL EMPLEADO", "VEHÍCULOS", "NOVEDAD", "", ""]);

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
        { wch: 8 },  // N°
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
            head: [['N°', 'EVENTO / FECHA-HORA', 'SECTOR', 'PERSONAL EMPLEADO', 'VEHÍCULOS', 'NOVEDAD / CAMBIOS']],
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
                    <th style="width: 60px; text-align: center;">N°</th>
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
        "16H00 A 20H00 / 04H00 A 08H00": "TURNO 3 (16H00 A 20H00 / 04H00 A 08H00)",
        "2300 - 0200": "CONTROL TOQUE DE QUEDA T1 (2300 - 0200)",
        "0200 - 0500": "CONTROL TOQUE DE QUEDA T2 (0200 - 0500)"
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
    window.updateOpsShiftSelector = function() {
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
    if (confirm('¿Estás seguro de eliminar este evento planificado?')) {
        opsEvents = opsEvents.filter(e => e.id !== eventId);
        saveAppState('opsEvents', JSON.stringify(opsEvents));
        renderOpsPlanningTable();
        showNotification('Evento eliminado');
    }
}

function exportDistributionToPDF() {
    const allAssignments = [...guardAssignments];
    if (allAssignments.length === 0) {
        setDistributionInterfaceMessage('No hay una distribución generada para exportar.');
        showNotification('No hay una distribución generada para exportar.');
        return;
    }
    setDistributionInterfaceMessage('');

    const { jsPDF } = window.jspdf;
    
    // Configurar documento
    const docClean = new jsPDF('p', 'mm', 'a4');
    docClean.setFont("helvetica", "bold");
    docClean.setFontSize(16);
    docClean.text('GT 100.51 - CUADRO DE DISTRIBUCIÓN DE PERSONAL', 14, 15);
    docClean.setFontSize(9);
    docClean.setFont("helvetica", "normal");
    docClean.text(`Misión / Operación: ${operationName || "GENERAL"}`, 14, 21);
    docClean.text(`Generado el: ${new Date().toLocaleString()}`, 14, 26);

    let startY = 32;

    // Agrupar todas las asignaciones por LOCALIZACIÓN (al igual que la tabla HTML)
    const grouped = {};
    allAssignments.forEach(a => {
        const loc = a.assignedLocation || "SIN PUESTO";
        if (!grouped[loc]) grouped[loc] = [];
        grouped[loc].push(a);
    });

    const sortedLocations = Object.keys(grouped).sort();

    sortedLocations.forEach(locName => {
        const assignments = grouped[locName];

        // Determinar colores según el tipo de puesto
        let mainColor = [59, 130, 246]; // Azul (Fijo)
        let lightBgColor = [239, 246, 255]; 

        const nameUpper = locName.toUpperCase();
        if (nameUpper.includes("TOQUE DE QUEDA")) {
            mainColor = [239, 68, 68]; // Rojo (TQ)
            lightBgColor = [254, 242, 242];
        } else if (["SEGURIDAD", "APOYO", "CPL"].some(k => nameUpper.includes(k))) {
            mainColor = [249, 115, 22]; // Naranja (Apoyo)
            lightBgColor = [255, 247, 237];
        }

        // Título de la Sección de Localización
        docClean.setFillColor(...mainColor);
        docClean.rect(14, startY, 182, 8, 'F');
        docClean.setTextColor(255, 255, 255);
        docClean.setFontSize(10);
        docClean.setFont("helvetica", "bold");
        docClean.text(nameUpper, 105, startY + 5.5, { align: 'center' });
        startY += 8;

        // Agrupar por Horario dentro de esta localización para claridad
        const timeGroups = {};
        assignments.forEach(a => {
            const t = a.assignedTime || "SIN HORARIO";
            if (!timeGroups[t]) timeGroups[t] = [];
            timeGroups[t].push(a);
        });

        Object.keys(timeGroups).forEach(time => {
            const timeMembers = timeGroups[time];

            // Título de Bloque Horario
            docClean.setFillColor(...lightBgColor);
            docClean.rect(14, startY, 182, 6, 'F');
            docClean.setTextColor(...mainColor);
            docClean.setFontSize(9);
            docClean.setFont("helvetica", "bold");
            docClean.text(`BLOQUE HORARIO: ${time}`, 18, startY + 4.5);
            startY += 6;

            // Ordenar por jerarquía militar
            const rankHierarchy = [
                "CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", 
                "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"
            ];
            timeMembers.sort((a, b) => {
                let rankA = rankHierarchy.indexOf(String(a.grade).trim().toUpperCase());
                let rankB = rankHierarchy.indexOf(String(b.grade).trim().toUpperCase());
                if (rankA === -1) rankA = 999;
                if (rankB === -1) rankB = 999;
                return rankA - rankB;
            });

            // Preparar filas de la tabla
            const rows = timeMembers.map(p => [
                p.grade, 
                p.specialty || "N/A", 
                p.name, 
                p.idNum || "S/N", 
                p.unit || "N/A", 
                p.assignedShift || "GUARDIA", 
                p.grupoDestino || "GT ECHO",
                p.contact || "S/N"
            ]);

            docClean.autoTable({
                startY: startY,
                head: [['Grado', 'Especialidad', 'Nombres y Apellidos', 'Cédula', 'Reparto', 'Turno', 'Destino', 'Contacto']],
                body: rows,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1.5 },
                headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
                margin: { left: 14, right: 14 },
                didDrawPage: (data) => {
                    startY = data.cursor.y + 4;
                }
            });

            // Sincronizar startY real después de autoTable
            startY = (docClean.lastAutoTable?.finalY || startY) + 4;

            // Manejo de nueva página si el espacio es poco
            if (startY > 265) {
                docClean.addPage();
                startY = 20;
            }
        });
        startY += 2;
    });

    docClean.save('Distribucion_Personal_GT100.51.pdf');
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
        saveAppState('patrolOrders', JSON.stringify(patrolOrders));
        saveAppState('commandPostPersonnel', JSON.stringify(commandPostPersonnel));
        saveAppState('personnelHistory', JSON.stringify(personnelHistory));
        saveAppState('operationName', operationName);
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
        precedencia: document.getElementById('ioPrecedencia').value,
        lugar: document.getElementById('ioLugar').value,
        destinatario: document.getElementById('ioDestinatario').value,
        copia: document.getElementById('ioCopia').value,
        btNarrative: document.getElementById('ioBTNarrative').value,
        ref: document.getElementById('ioRef').value,
        resultadosRich: document.getElementById('ioResultadosRich').innerHTML, // Contenido con formato
        quien: document.getElementById('ioQuien').value,
        patrulla: document.getElementById('ioPatrulla').value,
        date: document.getElementById('ioDate').value,
        como: document.getElementById('ioComo').value,
        donde: document.getElementById('ioDondeManual').value,
        acciones: document.getElementById('ioAccionesTomadas').value,
        lat: isNaN(latVal) ? null : latVal,
        lng: isNaN(lngVal) ? null : lngVal,
        photos: currentInstantOpsPhotos.slice(),
        annexBShift: document.getElementById('ioShiftSelector')?.value || '',
        annexBPosts: getSelectedAnexBPosts(),
        status: 'draft',
        annexBPersonnel: (() => {
            const posts = getSelectedAnexBPosts();
            const shift = document.getElementById('ioShiftSelector')?.value;
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
        firmanteNombre: document.getElementById('ioFirmanteNombre').value.trim(),
        firmanteGrado: document.getElementById('ioFirmanteGrado').value.trim(),
        firmanteCargo: document.getElementById('ioFirmanteCargo').value.trim(),
        autorNombre: document.getElementById('ioAutorNombre').value.trim(),
        autorCargo: document.getElementById('ioAutorCargo').value.trim()
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

window.populateOrderReferences = function() {
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
            <button class="btn-action edit" onclick="generateOfficialDetailedPDF('${op.id}')" title="Descargar Borrador PDF">📄</button>
            ${op.signedPdfId ? `<button class="btn-action edit" onclick="viewSignedPdf('${op.signedPdfId}')" title="Ver PDF Firmado Institucional" style="background:#0369a1; color:white;">🖋️</button>` : ''}
            <button class="btn-action delete" onclick="deleteInstantOp('${op.id}')" title="Eliminar">🗑️</button>
        ` : `
            <button class="btn-action edit" onclick="editInstantOp('${op.id}')" title="Modificar">✏️</button>
            <button class="btn-action edit" onclick="generateOfficialDetailedPDF('${op.id}')" title="Previsualizar PDF">📄</button>
            <button class="btn-action delete" onclick="closeInstantOp('${op.id}')" title="Cerrar y Archivar" style="background: #107c10; color: white;">🔒</button>
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
            if (confirm("¿Completó la firma en la aplicación FirmaEC?\n\nAl confirmar, el documento se marcará como 'Firmado Digitalmente'.")) {
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
        if (order && order.blob) {
            const url = URL.createObjectURL(order.blob);
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
    // Verificar si el canvas está vacío (opcional, aquí permitimos si hay al menos algo de dibujo)
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
    if (confirm('¿Eliminar este parte operativo?')) {
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
        "N° Reporte": op.reportNum,
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
        doc.text('“SEGURIDAD MARÍTIMA”', pageWidth / 2, y, { align: 'center' });
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
    doc.text('NÚMERO:', margin, currentY);
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

    const btText = op.btNarrative || 'CÚMPLEME INFORMAR A USTED SEÑOR ALMIRANTE, LA NOVEDAD SUSCITADA EN LA JURISDICCIÓN DEL GT-100.51 “SEGURIDAD MARÍTIMA”, SEGÚN EL SIGUIENTE DETALLE:';
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
            { content: 'QUIÉN:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
            { content: op.quien || 'EL GT-100.51 “SEGURIDAD MARÍTIMA”' }
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
            { content: 'CUÁNDO:', styles: { fontStyle: 'bold', fillColor: [255, 255, 255] } },
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
    doc.text(op.firmanteNombre || 'FIDEL ERAZO JÁCOME', margin + porWidth, currentY);
    currentY += 4.5;

    // Linea 2: Grado
    doc.setFont('helvetica', 'normal');
    doc.text(op.firmanteGrado || 'CAPITÁN DE NAVÍO - EMC', margin, currentY);
    currentY += 4.5;

    // Linea 3: Cargo (Negrita)
    doc.setFont('helvetica', 'bold');
    doc.text(op.firmanteCargo || 'COMANDANTE DEL GRUPO DE TAREA 100.51 “SEGURIDAD MARÍTIMA”', margin, currentY);
    currentY += 4.5;

    // Linea 4: Elaborador (Nombre — Cargo) en una sola línea
    doc.setFont('helvetica', 'normal');
    const authorLine = `${op.autorNombre || 'TNFG-SU STACEY PABLO'} — ${op.autorCargo || 'ODG PUESTO DE MANDO GT 100.51'}`;
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
            doc.text('“SEGURIDAD MARÍTIMA”', pageWidth / 2, y, { align: 'center' });
            y += 8;
            doc.setFontSize(14);
            doc.text('PARTE AL INSTANTE', pageWidth / 2, y, { align: 'center' });
            y += 8;
            return y;
        };
        
        let photoY = drawAnnexBHeader();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('ANEXO “B” (REGISTRO FOTOGRÁFICO)', pageWidth / 2, photoY, { align: 'center' });
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
                'N° Reporte', 'REF', 'DÓNDE', 'CUÁNDO', 'PATRULLA', 'RESULTADOS'
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
        self.setOpacity(opacity);
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

    // Solo considerar a los operativos para la división de guardias
    const operativos = personnel.filter(p => !p.condition || p.condition === 'OPERATIVO');

    if (operativos.length === 0) {
        showNotification('No hay personal operativo disponible para la división.');
        return;
    }

    // Crear copia y ordenar para la división equitativa
    const sortedPersonnel = [...operativos].sort((a, b) => {
        const hierarchy = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG", "SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
        return hierarchy.indexOf(a.grade) - hierarchy.indexOf(b.grade);
    });

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
            btnBoth.innerHTML = '<span class="icon">👥</span> Escogido (Ambos) ✓';
        } else {
            btnBoth.style.boxShadow = 'none';
            btnBoth.style.filter = 'none';
            btnBoth.innerHTML = '<span class="icon">👥</span> Seleccionar Ambos';
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
                selectBtn.textContent = 'Seleccionado ✓';
                selectBtn.style.opacity = '0.5';
            } else {
                selectBtn.textContent = 'Seleccionado ✓';
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
                    <th style="text-align: center;">Cambiar</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');

        members.forEach(p => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${p.grade}</td>
                <td>${p.name}</td>
                <td style="text-align: center;">
                    <button class="btn-action edit" onclick="swapPersonnelGuard(${p.id})" title="Pasar al otro grupo">🔄</button>
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

function generatePersonnelDistribution() {
    if (personnel.length === 0) {
        setDistributionInterfaceMessage('Debe cargar el listado de personal antes de generar la distribución.');
        showNotification("No hay personal registrado para distribuir.");
        return;
    }
    setDistributionInterfaceMessage('');

    // Helper para verificar si un identificador o texto es válido (y no un marcador genérico de importación)
    function isValidIdentifier(val) {
        if (!val) return false;
        const str = String(val).trim().toUpperCase();
        return str !== "" && 
               str !== "S/N" && 
               str !== "N/A" && 
               !str.includes("S/N") && 
               !str.includes("SIN NOMBRE") && 
               !str.includes("CEDULA");
    }

    // 1. Recolectar Slots Activos
    let allSlots = [];

    // Acceder de forma segura a las columnas de tácticas
    const tacticalSectors = document.querySelectorAll('.tactical-grid .tactical-sector');
    const fixedPosts = tacticalSectors.length > 0 ? tacticalSectors[0].querySelectorAll('.post-item') : [];
    const supportPosts = tacticalSectors.length > 1 ? tacticalSectors[1].querySelectorAll('.support-post') : [];

    // Tareas Fijas
    fixedPosts.forEach(item => {
        const activeInput = item.querySelector('.post-active');
        if (activeInput && activeInput.checked) {
            const name = activeInput.getAttribute('data-post');
            const quotaOfficers = parseInt(item.querySelector('.post-quota-officers')?.value || 0);
            const quotaCrew = parseInt(item.querySelector('.post-quota-crew')?.value || 0);
            const scheduleInput = item.querySelector('.post-schedule');
            const customSchedule = scheduleInput ? scheduleInput.value.trim() : 'Sin Horario';

            // Agregar slots de oficiales
            for (let i = 0; i < quotaOfficers; i++) {
                allSlots.push({ 
                    locName: name, 
                    shift: "FIJO", 
                    time: customSchedule, 
                    assigned: false,
                    roleType: "OFFICER"
                });
            }
            // Agregar slots de tripulantes
            for (let i = 0; i < quotaCrew; i++) {
                allSlots.push({ 
                    locName: name, 
                    shift: "FIJO", 
                    time: customSchedule, 
                    assigned: false,
                    roleType: "CREW"
                });
            }
        }
    });

    // Tareas de Apoyo
    supportPosts.forEach(item => {
        const activeInput = item.querySelector('.post-active');
        if (activeInput && activeInput.checked) {
            const name = activeInput.getAttribute('data-post');
            const time = item.querySelector('.support-time')?.value || "Horario Manual";
            const quotaOfficers = parseInt(item.querySelector('.support-qty-officers')?.value || 0);
            const quotaCrew = parseInt(item.querySelector('.support-qty-crew')?.value || 0);

            // Agregar slots de oficiales
            for (let i = 0; i < quotaOfficers; i++) {
                allSlots.push({
                    locName: name,
                    shift: "APOYO",
                    time: time,
                    assigned: false,
                    roleType: "OFFICER"
                });
            }
            // Agregar slots de tripulantes
            for (let i = 0; i < quotaCrew; i++) {
                allSlots.push({
                    locName: name,
                    shift: "APOYO",
                    time: time,
                    assigned: false,
                    roleType: "CREW"
                });
            }
        }
    });

    if (allSlots.length === 0) {
        setDistributionInterfaceMessage('No hay puestos activos para distribuir. Activa al menos un puesto fijo o una tarea de apoyo.');
        showNotification('No hay puestos activos para distribuir.');
        return;
    }

    // Estandarizar rangos para búsquedas insensibles a mayúsculas/minúsculas y espacios
    const OFFICERS_GRADES = ["CPNV", "CPFG", "CPCB", "TNNV", "TNFG", "ALFG"];
    const OTHER_GRADES = ["SUBM", "SUBP", "SUBS", "SGOP", "SGOS", "CBOP", "CBOS", "MARO"];
    const fullHierarchy = [...OFFICERS_GRADES, ...OTHER_GRADES];
    const normalizeGrade = (g) => String(g || '').trim().toUpperCase();
    const normalizedOfficers = OFFICERS_GRADES.map(normalizeGrade);
    const normalizedOthers = OTHER_GRADES.map(normalizeGrade);
    const normalizedFull = fullHierarchy.map(normalizeGrade);

    let basePool = personnel;

    // Filtrar solo operativos de forma case-insensitive y tolerante a nulos/espacios
    let pool = basePool.filter(p => {
        const cond = String(p.condicion || p.condition || '').trim().toUpperCase();
        return cond === "OPERATIVO";
    });
    
    // --- DEDUPLICAR POOL PARA EVITAR REPETIDOS ---
    const uniquePool = [];
    const seenIds = new Set();
    pool.forEach(p => {
        let uniqueKey = null;
        if (p.idNum && isValidIdentifier(p.idNum)) {
            uniqueKey = "DNI_" + String(p.idNum).trim().toUpperCase();
        } else if (p.id && isValidIdentifier(p.id)) {
            uniqueKey = "ID_" + String(p.id).trim();
        } else if (p.name && isValidIdentifier(p.name)) {
            uniqueKey = "NAME_" + p.name.trim().toLowerCase();
        }

        if (uniqueKey) {
            if (!seenIds.has(uniqueKey)) {
                seenIds.add(uniqueKey);
                uniquePool.push(p);
            }
        } else {
            uniquePool.push(p);
        }
    });
    pool = uniquePool;

    // Mezclar el pool de personal para dar rotación justa y aleatoria
    pool = pool.sort(() => Math.random() - 0.5);

    // Set para controlar quién ya fue asignado en todo el proceso y garantizar NO duplicados físicos
    const assignedPeopleIds = new Set();

    // Helper para verificar si alguien ya está asignado de forma segura y tolerante a tipos
    function isAlreadyAssigned(person) {
        if (assignedPeopleIds.has("ID_" + String(person.id))) return true;
        if (person.idNum && isValidIdentifier(person.idNum) && assignedPeopleIds.has("DNI_" + String(person.idNum).trim().toUpperCase())) return true;
        if (person.name && isValidIdentifier(person.name) && assignedPeopleIds.has("NAME_" + person.name.trim().toLowerCase())) return true;
        return false;
    }

    // Helper para marcar a alguien como asignado en nuestro Set restrictivo
    function markAsAssigned(person) {
        assignedPeopleIds.add("ID_" + String(person.id));
        if (person.idNum && isValidIdentifier(person.idNum)) assignedPeopleIds.add("DNI_" + String(person.idNum).trim().toUpperCase());
        if (person.name && isValidIdentifier(person.name)) assignedPeopleIds.add("NAME_" + person.name.trim().toLowerCase());
    }

    // --- SEPARACIÓN POR GRUPOS DESTINO (CODESC vs GT ECHO) ---
    const poolCODESC = pool.filter(p => String(p.grupoDestino || '').trim().toUpperCase() === 'CODESC');
    const poolGTECHO = pool.filter(p => String(p.grupoDestino || '').trim().toUpperCase() !== 'CODESC');

    // Separar oficiales y tripulación por cada grupo destino
    let codescOfficers = poolCODESC.filter(p => normalizedOfficers.includes(normalizeGrade(p.grade)));
    let codescOthers = poolCODESC.filter(p => normalizedOthers.includes(normalizeGrade(p.grade)));

    let gtechoOfficers = poolGTECHO.filter(p => normalizedOfficers.includes(normalizeGrade(p.grade)));
    let gtechoOthers = poolGTECHO.filter(p => normalizedOthers.includes(normalizeGrade(p.grade)));

    // Ordenar de mayor a menor jerarquía para que la distribución empiece desde arriba
    const sortPoolByRank = (pList) => {
        pList.sort((a, b) => {
            let rankA = normalizedFull.indexOf(normalizeGrade(a.grade));
            let rankB = normalizedFull.indexOf(normalizeGrade(b.grade));
            if (rankA === -1) rankA = 999;
            if (rankB === -1) rankB = 999;
            return rankA - rankB;
        });
    };
    sortPoolByRank(codescOfficers);
    sortPoolByRank(codescOthers);
    sortPoolByRank(gtechoOfficers);
    sortPoolByRank(gtechoOthers);

    guardAssignments = [];

    // Motor de Rotación 21/7: Asignar grupo franco activo a la tabla
    if (currentFrancoGroup && currentFrancoGroup !== 'N/A') {
        const francoPersonnel = basePool.filter(p => p.rotacion === currentFrancoGroup);
        francoPersonnel.forEach(p => {
            assignedPeopleIds.add(String(p.idNum || p.id).trim().toUpperCase());
            guardAssignments.push({
                ...p,
                assignedLocation: 'FRANCO REGULAR',
                assignedShift: 'FRANQUICIA',
                assignedTime: 'N/A'
            });
        });
    }

    // Helper de distribución que garantiza balance perfecto de grados mediante intercalado (interleaving)
    function distributeToSpecificSlots(slots, poolsPriority) {
        if (slots.length === 0) return;

        // Agrupar los slots por localización para poder intercalarlos de forma proporcional
        const slotsByLocation = {};
        slots.forEach(s => {
            if (!slotsByLocation[s.locName]) slotsByLocation[s.locName] = [];
            slotsByLocation[s.locName].push(s);
        });

        // Intercalamos los slots de forma proporcional (Distribución Uniforme Matemática)
        // Esto asegura que todos los puestos (grandes o pequeños) reciban una tajada exacta 
        // de todos los grados disponibles (desde Oficiales y SUBM hasta MARO).
        let flatSlots = [];
        const T = slots.length; // Total slots en esta fase

        Object.keys(slotsByLocation).forEach(loc => {
            const locSlots = slotsByLocation[loc];
            const N = locSlots.length;
            const step = T / N;
            
            locSlots.forEach((slot, i) => {
                flatSlots.push({
                    slot: slot,
                    // step / 2 + i * step distribuye uniformemente los slots a lo largo de todo el espectro
                    idealPos: (step / 2) + (i * step)
                });
            });
        });

        // Ordenar los slots por su posición ideal
        flatSlots.sort((a, b) => {
            if (a.idealPos === b.idealPos) {
                return a.slot.locName.localeCompare(b.slot.locName);
            }
            return a.idealPos - b.idealPos;
        });

        let interleavedSlots = flatSlots.map(fs => fs.slot);

        // Asignamos el personal ordenado por jerarquía a los slots intercalados
        interleavedSlots.forEach(slot => {
            let personToAssign = null;

            // Intentar asignar del pool con mayor prioridad disponible
            for (let pIdx = 0; pIdx < poolsPriority.length; pIdx++) {
                const currentPool = poolsPriority[pIdx];
                while (currentPool.length > 0) {
                    const candidate = currentPool.shift();
                    if (!isAlreadyAssigned(candidate)) {
                        personToAssign = candidate;
                        break;
                    }
                }
                if (personToAssign) break;
            }

            if (personToAssign) {
                markAsAssigned(personToAssign);
                slot.assigned = true;
                guardAssignments.push({
                    ...personToAssign,
                    assignedLocation: slot.locName,
                    assignedShift: slot.shift,
                    assignedTime: slot.time
                });
            }
        });
    }

    // Identificar puestos CODESC (HTMC, SPCRE). REACCIÓN es especial: recibe el sobrante CODESC.
    function isCodescQuotaSlot(slot) {
        const name = String(slot.locName || '').toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return name.includes("HTMC") || name.includes("SPCRE");
    }
    function isReaccionSlot(slot) {
        const name = String(slot.locName || '').toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return name.includes("REACCION");
    }

    // Separar los slots predefinidos: HTMC/SPCRE (cuota fija), GT ECHO
    const htmcSpcreOfficerSlots = allSlots.filter(s => s.roleType === "OFFICER" && isCodescQuotaSlot(s));
    const htmcSpcreCrewSlots    = allSlots.filter(s => s.roleType === "CREW"    && isCodescQuotaSlot(s));

    const gtechoOfficerSlots = allSlots.filter(s => s.roleType === "OFFICER" && !isCodescQuotaSlot(s) && !isReaccionSlot(s));
    const gtechoCrewSlots    = allSlots.filter(s => s.roleType === "CREW"    && !isCodescQuotaSlot(s) && !isReaccionSlot(s));

    // FASE 1: CODESC (HTMC, SPCRE y REACCIÓN)
    // Para que la distribución de grados (SUBM, SUBP, etc.) sea 100% equitativa, REACCIÓN debe intercalarse en el mismo proceso.
    const reaccionIsActive = document.querySelector('.post-active[data-post="REACCIÓN"]')?.checked ||
                             document.querySelector('.post-active[data-post="REACCION"]')?.checked || false;
                             
    if (reaccionIsActive) {
        const reaccionSchedule = (() => {
            const chk = document.querySelector('.post-active[data-post="REACCIÓN"]') ||
                        document.querySelector('.post-active[data-post="REACCION"]');
            if (chk) {
                const postItem = chk.closest('.post-item');
                if (postItem) return postItem.querySelector('.post-schedule')?.value || '0800-1600';
            }
            return '0800-1600';
        })();

        // Calcular el remanente de personal CODESC que irá a REACCIÓN
        const reaccionOfficerQuota = Math.max(0, codescOfficers.length - htmcSpcreOfficerSlots.length);
        const reaccionCrewQuota = Math.max(0, codescOthers.length - htmcSpcreCrewSlots.length);

        // Añadir slots virtuales de REACCIÓN a los arrays principales de CODESC para ser intercalados equitativamente
        for (let i = 0; i < reaccionOfficerQuota; i++) {
            htmcSpcreOfficerSlots.push({ locName: 'REACCIÓN', shift: 'CODESC', time: reaccionSchedule, assigned: false, roleType: 'OFFICER' });
        }
        for (let i = 0; i < reaccionCrewQuota; i++) {
            htmcSpcreCrewSlots.push({ locName: 'REACCIÓN', shift: 'CODESC', time: reaccionSchedule, assigned: false, roleType: 'CREW' });
        }
    }

    // Distribuir todos los puestos CODESC de forma intercalada (HTMC, SPCRE, REACCIÓN)
    distributeToSpecificSlots(htmcSpcreOfficerSlots, [codescOfficers, codescOthers, gtechoOfficers, gtechoOthers]);
    distributeToSpecificSlots(htmcSpcreCrewSlots,    [codescOthers, codescOfficers, gtechoOthers, gtechoOfficers]);

    // FASE 2: Distribuir puestos GT ECHO (Distritos, tareas de apoyo, etc.)
    distributeToSpecificSlots(gtechoOfficerSlots, [gtechoOfficers, gtechoOthers, codescOfficers, codescOthers]);
    distributeToSpecificSlots(gtechoCrewSlots,    [gtechoOthers, gtechoOfficers, codescOthers, codescOfficers]);

    // FASE 4: Toque de Queda — personal GT ECHO sobrante
    const tqT1Active = true;
    const tqT2Active = true;
    const activeTqShifts = [];
    if (tqT1Active) activeTqShifts.push({ name: "T1 TQ", time: "2300 - 0200" });
    if (tqT2Active) activeTqShifts.push({ name: "T2 TQ", time: "0200 - 0500" });

    if (activeTqShifts.length > 0) {
        let remainingTqPersonnel = [
            ...gtechoOfficers.filter(p => !isAlreadyAssigned(p)),
            ...gtechoOthers.filter(p => !isAlreadyAssigned(p)),
            ...codescOfficers.filter(p => !isAlreadyAssigned(p)),
            ...codescOthers.filter(p => !isAlreadyAssigned(p))
        ];
        sortPoolByRank(remainingTqPersonnel);
        remainingTqPersonnel.forEach((p, idx) => {
            if (!isAlreadyAssigned(p)) {
                markAsAssigned(p);
                const shift = activeTqShifts[idx % activeTqShifts.length];
                guardAssignments.push({
                    ...p,
                    assignedLocation: "TOQUE DE QUEDA",
                    assignedShift: shift.name,
                    assignedTime: shift.time
                });
            }
        });
    }

    setDistributionInterfaceMessage('');
    saveData();
    renderDistributionTable();
    showNotification(`✅ Distribución generada: ${guardAssignments.length} efectivos asignados.`);
}


function renderDistributionTable() {
    const tableBody = document.getElementById("distributionTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (!guardAssignments || guardAssignments.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `<td colspan="10" style="text-align:center; padding: 2rem; color: #94a3b8; font-style: italic;">
            Sin distribución generada. Configure los puestos y haga clic en "Generar Distribución".
        </td>`;
        tableBody.appendChild(emptyRow);
        return;
    }

    // Agrupar TODAS las asignaciones por FUNCIÓN (A1, A2, A3, etc.)
    const grouped = {};
    guardAssignments.forEach(a => {
        const func = String(a.role || a.specialty || '').trim();
        const key = func || "SIN FUNCIÓN";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
    });

    const parseFuncKey = key => {
        const normalized = String(key).trim().toUpperCase();
        const match = normalized.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            return { prefix: match[1], number: Number(match[2]) };
        }
        return { prefix: normalized, number: Number.MAX_SAFE_INTEGER };
    };

    const sortedFunctions = Object.keys(grouped).sort((a, b) => {
        const aKey = parseFuncKey(a);
        const bKey = parseFuncKey(b);
        if (aKey.prefix === bKey.prefix) return aKey.number - bKey.number;
        return aKey.prefix.localeCompare(bKey.prefix);
    });

    sortedFunctions.forEach(funcName => {
        const assignments = grouped[funcName];
        const displayFunc = funcName.toUpperCase();

        const headerRow = document.createElement("tr");
        headerRow.classList.add("shift-header");
        headerRow.style.background = "rgba(15, 23, 42, 0.05)";
        headerRow.innerHTML = `
            <td colspan="7" style="color:#1f2937; font-weight:800; padding:10px 16px; border-left:5px solid #3b82f6; font-family:'Outfit',sans-serif; letter-spacing:0.5px;">
                FUNCIÓN: ${displayFunc}
            </td>
            <td style="text-align:right; color:#1f2937; font-weight:700; font-size:0.82em; padding-right:16px;">
                ${assignments.length} PERS.
            </td>
        `;
        tableBody.appendChild(headerRow);

        const locationGroups = {};
        assignments.forEach(a => {
            const loc = a.assignedLocation || "SIN PUESTO";
            if (!locationGroups[loc]) locationGroups[loc] = [];
            locationGroups[loc].push(a);
        });

        const sortedLocations = Object.keys(locationGroups).sort();
        sortedLocations.forEach(locName => {
            const locAssignments = locationGroups[locName];
            const locHeader = document.createElement("tr");
            locHeader.innerHTML = `
                <td colspan="10" style="background:rgba(0,0,0,0.02); color:#475569; font-size:0.78em; padding:6px 18px; font-weight:700; border-bottom:1px solid rgba(0,0,0,0.06);">
                    UBICACIÓN: ${locName}
                </td>
            `;
            tableBody.appendChild(locHeader);

            const timeGroups = {};
            locAssignments.forEach(a => {
                const t = a.assignedTime || "SIN HORARIO";
                if (!timeGroups[t]) timeGroups[t] = [];
                timeGroups[t].push(a);
            });

            Object.keys(timeGroups).forEach(time => {
                const timeMembers = timeGroups[time];
                const subHeader = document.createElement("tr");
                subHeader.innerHTML = `<td colspan="10" style="background:rgba(255,255,255,0.9); color:#2563eb; font-size:0.78em; padding:4px 20px; font-weight:600; border-bottom:1px solid rgba(0,0,0,0.04);">⏱ BLOQUE HORARIO: ${time}</td>`;
                tableBody.appendChild(subHeader);

                const rankHierarchy = ["CPNV","CPFG","CPCB","TNNV","TNFG","ALFG","SUBM","SUBP","SUBS","SGOP","SGOS","CBOP","CBOS","MARO"];
                timeMembers.sort((a, b) => {
                    let rA = rankHierarchy.indexOf(String(a.grade||'').trim().toUpperCase());
                    let rB = rankHierarchy.indexOf(String(b.grade||'').trim().toUpperCase());
                    if (rA === -1) rA = 999;
                    if (rB === -1) rB = 999;
                    return rA - rB;
                });

                timeMembers.forEach(item => {
                    const destino = String(item.grupoDestino || '').trim().toUpperCase();
                    const isCodesc = destino === 'CODESC';
                    const destinoBadge = isCodesc
                        ? `<span style="background:#fdf2f8; color:#db2777; border:1px solid #fbcfe8; padding:2px 7px; border-radius:8px; font-size:0.75rem; font-weight:700;">CODESC</span>`
                        : `<span style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:2px 7px; border-radius:8px; font-size:0.75rem; font-weight:700;">GT ECHO</span>`;

                    const row = document.createElement("tr");
                    row.innerHTML = `
                        <td style="text-align:center; font-weight:700;">${item.grade || ''}</td>
                        <td style="text-align:center; color:#64748b; font-size:0.85em;">${item.specialty || "N/A"}</td>
                        <td style="font-weight:600;">${item.name || ''}</td>
                        <td style="text-align:center; font-family:monospace; color:#64748b;">${item.idNum || item.id || "S/N"}</td>
                        <td style="text-align:center; font-size:0.85em;">${item.unit || "S/N"}</td>
                        <td style="text-align:center; color:#94a3b8; font-size:0.82em;">${item.contact || "S/N"}</td>
                        <td style="text-align:center;">${destinoBadge}</td>
                        <td style="text-align:center;">${item.assignedShift || "GUARDIA"}</td>
                        <td style="text-align:center;">${item.assignedLocation || "S/N"}</td>
                        <td style="text-align:center;">
                            <button class="btn-action edit" title="Mover Personal" onclick="openEditDistributionModal('${item.id}')"
                                style="padding:3px 9px; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid #38bdf8; border-radius:6px; cursor:pointer;">
                                🔄
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });
            });
        });
    });

    saveData();
    updatePersonnelStats();
}


function openEditDistributionModal(personId) {
    const allAssignments = [...specialAssignments, ...guardAssignments];
    const person = allAssignments.find(a => String(a.id) === String(personId));
    if (!person) return;

    document.getElementById('editDistId').value = person.id;
    document.getElementById('editDistName').textContent = `${person.grade} ${person.name}`;
    document.getElementById('editDistShift').value = person.assignedShift || "TURNO 1";
    document.getElementById('editDistTime').value = person.assignedTime || "";

    // Poblar puestos dinámicamente: usamos todos los que ya existen en la distribución actual
    const locSelect = document.getElementById('editDistLocation');
    locSelect.innerHTML = '';

    // Obtener lista única de puestos que ya tienen gente asignada
    const currentLocs = [...new Set(allAssignments.map(a => a.assignedLocation))].sort();

    // Y añadir también los puestos base que estén activos por si acaso alguno está vacío
    const activeToggles = Array.from(document.querySelectorAll('.loc-toggle:checked')).map(t => t.value);
    const allLocs = [...new Set([...currentLocs, ...activeToggles])].sort();

    allLocs.forEach(loc => {
        if (!loc) return;
        const option = document.createElement('option');
        option.value = loc;
        option.textContent = loc;
        locSelect.appendChild(option);
    });

    locSelect.value = person.assignedLocation;

    document.getElementById('editDistModal').classList.add('active');
}

function handleManualAssignmentSave(e) {
    e.preventDefault();
    const id = document.getElementById('editDistId').value;
    const newLoc = document.getElementById('editDistLocation').value;
    const newShift = document.getElementById('editDistShift').value;
    const newTime = document.getElementById('editDistTime').value;

    // Buscar en ambos arrays
    let assignment = specialAssignments.find(a => String(a.id) === String(id));
    let sourceArray = specialAssignments;

    if (!assignment) {
        assignment = guardAssignments.find(a => String(a.id) === String(id));
        sourceArray = guardAssignments;
    }

    if (assignment) {
        // Si el turno cambia de "TAREA DE APOYO" a algo más o viceversa, mover entre arrays
        const oldShift = assignment.assignedShift;
        assignment.assignedLocation = newLoc;
        assignment.assignedShift = newShift;
        assignment.assignedTime = newTime;

        if (oldShift === "TAREA DE APOYO" && newShift !== "TAREA DE APOYO") {
            // Mover de special assignments a guard assignments
            specialAssignments = specialAssignments.filter(a => String(a.id) !== String(id));
            guardAssignments.push(assignment);
        } else if (oldShift !== "TAREA DE APOYO" && newShift === "TAREA DE APOYO") {
            // Mover de guard assignments a special assignments
            guardAssignments = guardAssignments.filter(a => String(a.id) !== String(id));
            specialAssignments.push(assignment);
        }

        renderDistributionTable();
        document.getElementById('editDistModal').classList.remove('active');
        showNotification("Asignación actualizada manualmente");
    }
}
function activateNewDay() {
    const confirmMsg = `¿ESTÁ SEGURO DE INICIAR UNA NUEVA OPERACIÓN?\n\nEsta acción:\n1. Reiniciará la lista de división de guardias (Babor/Estribor).\n2. Limpiará la tabla de distribución de personal.\n3. Limpiará la planificación operativa de esta misión.\n\n* El historial de inteligencia (MAPA DE CALOR) y los Partes al Instante SE MANTENDRÁN intactos.`;

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

    // Filtrar solo órdenes cerradas para el historial
    const closedOrders = patrolOrders.filter(op => op.status === 'cerrada');

    closedOrders.forEach(order => {
        const fullId = order.displayId || `${order.prefix || ''}${order.dtg || ''}-${order.serial || ''}-S`;
        const creationDate = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : (order.dtg || '---');
        const closeDate = order.closeDate || '---';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight: 700; color: var(--text-main);">${fullId}</td>
            <td>${creationDate}</td>
            <td>${closeDate}</td>
            <td><span style="background: rgba(34, 197, 94, 0.1); color: #16a34a; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; border: 1px solid rgba(34, 197, 94, 0.2);">cerrada</span></td>
            <td class="table-actions" style="display: flex; gap: 8px; justify-content: center;">
                <button onclick="viewCompliancePDF('${order.id}')" class="btn-action edit" title="Ver Cumplimiento" style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; cursor: pointer;">📑</button>
                <button onclick="window.generateORDPATPDF('${order.id}')" class="btn-action delete" title="Ver Orden Original" style="background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px; border-radius: 6px; cursor: pointer;">📄</button>
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
            const available = document.getElementById('vAvailable').checked;
            vehicles[existingIndex] = { ...vehicles[existingIndex], type, brand, km, lastMaint, available };
            showNotification(`Vehículo ${plate} actualizado.`);
        } else return;
    } else {
        const available = document.getElementById('vAvailable').checked;
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
    document.getElementById('vAvailable').checked = v.available;

    // Cambiar texto del botón para indicar edición
    const submitBtn = document.getElementById('submitVehicleBtn');
    submitBtn.textContent = 'Actualizar Datos del Vehículo';
    submitBtn.style.backgroundColor = '#f59e0b'; // Color naranja para distinguir
    submitBtn.dataset.mode = 'edit';

    // Hacer scroll al formulario
    document.querySelector('.personnel-form-block').scrollIntoView({ behavior: 'smooth' });
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
            <td>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <input type="checkbox" ${v.available ? 'checked' : ''} onchange="toggleVehicleAvailability('${v.plate}')" style="width: 18px; height: 18px; cursor: pointer;">
                    <span class="status-pill ${availClass}" style="min-width: 70px; font-size: 0.6rem;">${availText}</span>
                </div>
            </td>
            <td class="km-value">${v.km.toLocaleString()} KM</td>
            <td class="km-value">${v.lastMaint.toLocaleString()} KM</td>
            <td class="recorrido-value">${recorrido.toLocaleString()} KM</td>
            <td><span class="status-pill ${statusClass}">${statusText}</span></td>
            <td class="table-actions">
                <button class="btn-action edit" onclick="editVehicle('${v.plate}')" title="Modificar Datos Vehículo">✏️</button>
                <button class="btn-action edit" onclick="updateVehicleMileage('${v.plate}')" title="Actualizar Kilometraje">📈</button>
                <button class="btn-maint" onclick="recordVehicleMaintenance('${v.plate}')" title="Registrar Mantenimiento Realizado">🛠️</button>
                <button class="btn-action delete" onclick="deleteVehicle('${v.plate}')" title="Eliminar Vehículo">🗑️</button>
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

    if (confirm(`¿Confirma que se ha realizado el mantenimiento de los 5000 KM para el vehículo ${plate}?\nSe reseteará el kilometraje de referencia a ${v.km} KM.`)) {
        v.lastMaint = v.km;
        saveData();
        renderVehiclesTable();
        showNotification(`Mantenimiento registrado para ${plate}. Próximo a los ${(v.km + 5000).toLocaleString()} KM.`);
    }
}

function deleteVehicle(plate) {
    if (confirm(`¿Está seguro de eliminar el vehículo ${plate}?`)) {
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
            <td style="border: 1px solid var(--border); padding: 5px; text-align: center; width: 50px;"><button type="button" class="btn-remove-row">×</button></td>
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
                <td><button type="button" class="btn-remove-row">×</button></td>
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
                <td><button type="button" class="btn-remove-row">×</button></td>
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
                <td><button type="button" class="btn-remove-row">×</button></td>
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

    // Mostrar SOLO órdenes que NO estén cerradas en la tabla principal
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
                <button onclick="window.generateORDPATPDF('${op.id}')" title="Generar PDF Oficial" style="background: #2563eb; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">📄 PDF</button>
                <button onclick="window.editORDPAT('${op.id}')" title="Editar Orden" style="background: #7c3aed; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">✏️ Editar</button>
                <button onclick="openCloseOrderModal('${op.id}')" title="Subir Cumplimiento y Cerrar" style="background: #e67e22; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">🔒 Cerrar</button>
                <button onclick="window.deleteORDPAT('${op.id}')" title="Eliminar" style="background: #dc2626; color: white; border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem;">🗑️</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

window.deleteORDPAT = function deleteORDPAT(id) {
    console.log("Attempting to delete ORDPAT:", id);
    if (confirm('¿Eliminar esta Orden de Patrulla?')) {
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
        'opDTGAuto':           op.dtg,
        'opSequence':          op.serial,
        'opHuso':              op.huso,
        'opDTGInicio':         op.dtgInicio,
        'opDTGTermino':        op.dtgTermino,
        'opLugar':             op.lugar,
        'opDestinatario':      op.destinatario,
        'opCopia':             op.copia,
        'opHeaderText':        op.headerText,
        'opOrgComando':        op.orgComando,
        'opSituacionMain':     op.situacionMain,
        'opSituacionAmenaza':  op.amenaza,
        'opSituacionPropias':  op.propias,
        'opConcepto':          op.concepto,
        'opTareasText':        op.tareasText,
        'opConducta':          op.conducta,
        'opCoordinacion':      op.coordinacion,
        'opLogAbastecimiento': op.logistica,
        'opLogEvacuacion':     op.logEvacuacion,
        'opLogPersonal':       op.logPersonal,
        'opMando':             op.mando,
        'opComunicaciones':    op.comunicaciones,
        'opFirmanteNombre':    op.firmanteNombre,
        'opFirmanteGrado':     op.firmanteGrado,
        'opFirmanteCargo':     op.firmanteCargo,
        'opAutorNombre':       op.autorNombre,
        'opAutorCargo':        op.autorCargo,
        'opSumilla':           op.sumilla
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

// --- HELPER: NORMALIZACIÓN DE TEXTO PARA BÚSQUEDA ROBUSTA ---
function normalizeOpText(text) {
    if (!text) return "";
    return text.toString().toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/\s+/g, ' ') // Colapsar espacios
        .trim();
}

function getPersonnelSnapshot(puesto, turno) {
    const rawAll = [...(specialAssignments || []), ...(guardAssignments || [])];
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
        ["GRADO", "NOMBRES Y APELLIDOS", "ESPECIALIDAD", "CÉDULA", "DÍAS OMAI", "ESTADO"]
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
        head: [["GRADO", "NOMBRES Y APELLIDOS", "ESPECIALIDAD", "CÉDULA", "DÍAS OMAI", "ESTADO"]],
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
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">No hay órdenes externas registradas.</div>';
        return;
    }

    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = 'order-item-card';
        div.dataset.id = item.id;
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="background: rgba(59, 130, 246, 0.1); color: var(--accent); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">📄</div>
                <div style="flex: 1; min-width: 0;">
                    <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.name}">${item.name}</h4>
                    <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">${item.date} • ${item.size}</div>
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
        "16H00 A 20H00 / 04H00 A 08H00": "TURNO 3 (16H00 A 20H00 / 04H00 A 08H00)",
        "2300 - 0200": "CONTROL TOQUE DE QUEDA T1 (2300 - 0200)",
        "0200 - 0500": "CONTROL TOQUE DE QUEDA T2 (0200 - 0500)"
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
    let startY = 15;
    
    const drawAnnexHeader = () => {
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
        doc.text('“SEGURIDAD MARÍTIMA”', pageWidth / 2, y, { align: 'center' });
        y += 8;

        doc.setFontSize(14);
        doc.text(docTitle, pageWidth / 2, y, { align: 'center' });
        y += 8;

        if (referenceId) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(referenceId, pageWidth / 2, y, { align: 'center' });
            y += 8;
        }

        return y;
    };

    startY = drawAnnexHeader();

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);

    let annexTitle = 'ANEXO “A” (NOMINA DEL PERSONAL)';
    doc.text(annexTitle, pageWidth / 2, startY, { align: 'center' });
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
            startY = 35;
        }

        const uniqueLocs = [...new Set(items.map(m => m.assignedLocation))];
        uniqueLocs.forEach(locName => {
            const locMembers = items.filter(m => m.assignedLocation === locName);
            const time = locMembers[0].assignedTime || "";

            // Validar espacio para el título del puesto + al menos una fila de tabla
            if (startY > (pageWidth > 250 ? 180 : 260)) {
                doc.addPage(pageWidth > 250 ? 'l' : 'p', 'mm', 'a4');
                startY = 35;
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

        const snapshotTQ = all.filter(d => (d.assignedShift || "").toUpperCase().includes("TOQUE DE QUEDA"));
        if (snapshotTQ.length > 0) {
            renderBlock("CONTROL TOQUE DE QUEDA", snapshotTQ, [245, 158, 11], [255, 251, 235]);
        }

        const shiftMembersPool = all.filter(a => {
            const s = (a.assignedShift || "").toUpperCase();
            return !s.includes("APOYO") && !s.includes("TOQUE DE QUEDA") && !s.includes("INTERVENCION") && !s.includes("DISPONIBLE") && !s.includes("TODOS");
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

        const tqMembers = filteredGuard.filter(d => (d.assignedShift || "").toUpperCase().includes("TOQUE DE QUEDA"));
        if (tqMembers.length > 0) {
            renderBlock("CONTROL TOQUE DE QUEDA", tqMembers, [245, 158, 11], [255, 251, 235]);
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
        // Group 1: The prefix (e.g., '1)', 'a.', '-', '•', '%Ï', '%')
        // Group 2: The text
        const match = cleanPara.match(/^([0-9a-z]+\)|[0-9a-z]+\.|·|•|[\u2022\u00b7]|\*|-|%[^\s0-9a-z]?|%)\s*(.*)$/i);

        if (match) {
            let prefix = match[1];
            let text = match[2];

            // Normalize weird placeholders like %Ï, %Ä, or just % to a clean bullet
            if (prefix.startsWith('%')) {
                prefix = "•";
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
            } else if (prefix.match(/^[*•·-]/)) {
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
    if (!op) { alert('ERROR: No se encontró la orden con ID: ' + id + '\nTotal órdenes: ' + patrolOrders.length); return; }
    if (!window.jspdf) { alert('ERROR: La librería jsPDF no está cargada. Verifique que el servidor esté corriendo.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const margin = 25.4;
    // --- ENCABEZADO INSTITUCIONAL (Strict Layout) ---
    const drawOfficialHeader = (title) => {
        let y = 15;
        // 1. Clasificación Top-Left
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(190, 30, 45);
        doc.text('SECRETO', margin, y);
        
        // 2. Bloque Unidad Top-Right
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        const rightX = pageWidth - margin;
        doc.text('ARMADA DEL ECUADOR', rightX, y, { align: 'right' });
        y += 4;
        doc.text('GRUPO DE TAREA 100.51', rightX, y, { align: 'right' });
        y += 4;
        doc.text('“SEGURIDAD MARÍTIMA”', rightX, y, { align: 'right' });
        y += 4;
        doc.text(op.lugar || 'GUAYAQUIL', rightX, y, { align: 'right' });
        y += 4;
        doc.text(new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(), rightX, y, { align: 'right' });
        y += 10;

        if (escudoBase64) {
            const shieldSize = 20;
            doc.addImage(escudoBase64, 'PNG', (pageWidth - shieldSize) / 2, 15, shieldSize, shieldSize);
        }

        y = 45;
        doc.setFontSize(14);
        doc.text(title, pageWidth / 2, y, { align: 'center' });
        y += 8;
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
            if (currentY > 275) { doc.addPage(); currentY = 25; }
            if (idx === lines.length - 1) { doc.text(line, x + indent, currentY); }
            else { drawJustifiedLine(doc, line, x + indent, currentY, maxWidth - indent); }
            currentY += 5;
        });
    };

    const drawSectionHeader = (text) => {
        if (currentY > 260) { doc.addPage(); currentY = 25; }
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
    doc.text(`NÚMERO:`, margin, currentY);
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
    doc.text("A. PROPÓSITO (PARA QUÉ)", margin + 5, currentY);
    currentY += 7;
    doc.setFont('helvetica', 'normal');
    renderJustifiedBlock(op.misionA || '---', margin + 5, pageWidth - (2 * margin) - 5, 5);
    currentY += 5;

    doc.setFont('helvetica', 'bold');
    doc.text("B. TAREA (QUÉ SE VA A HACER)", margin + 5, currentY);
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
    if (currentY > 220) { doc.addPage(); currentY = 40; }
    
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
        const authorLine = [autorNombre, autorCargo].filter(Boolean).join(' — ');
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

        // 1. Clasificación (Top Centered)
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(239, 68, 68);
        doc.text('SECRETO', pageWidth / 2, 12, { align: 'center' });

        // Bloque Institucional removido a petición del usuario


        // Clasificación al Pie (Opcional pero recomendado para SECRETO)
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(239, 68, 68);
        doc.text('SECRETO', pageWidth / 2, 285, { align: 'center' });
    }

    if (options.returnBlob) {
        return doc.output('bloburl');
    }

    // Generar y abrir PDF
    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
    doc.save(`ORDPAT_${(op.fragNro || 'X').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);

    } catch(err) {
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
        if (t.includes('robo')) return '#0ea5e9';      // Azul
        if (t.includes('sicariato')) return '#ef4444'; // Rojo
        if (t.includes('extorsion')) return '#22c55e'; // Verde
        if (t.includes('droga')) return '#f59e0b';     // Naranja
        if (t.includes('operacion')) return '#8b5cf6'; // Violeta
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
        chartIntelHourInstance = new Chart(ctxHour, {
            type: 'bar',
            data: {
                labels: hourLabels,
                datasets: [{
                    label: 'Incidentes',
                    data: hourValues,
                    backgroundColor: '#6366f1', // Indigo para las horas
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { color: '#64748b', stepSize: 1 },
                        grid: { color: '#f1f5f9' }
                    },
                    y: {
                        ticks: { color: '#334155', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// --- Intelligence Filters moved to main DOMContentLoaded ---

// ==========================================
// CIERRE DE ÓRDENES DE PATRULLA (PDF UPLOAD)
// ==========================================

window.openCloseOrderModal = function(orderId) {
    currentORDPATIdForCompliance = orderId;
    const modal = document.getElementById('closeOrderModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

window.closeCloseOrderModal = function() {
    currentORDPATIdForCompliance = null;
    const modal = document.getElementById('closeOrderModal');
    if (modal) {
        modal.style.display = 'none';
        const form = document.getElementById('closeOrderForm');
        if (form) form.reset();
    }
}

window.submitCloseOrder = function(event) {
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
    reader.onload = function(e) {
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

window.viewCompliancePDF = function(orderId) {
    const order = patrolOrders.find(op => op.id === orderId);
    if (order && order.complianceFile) {
        // Generar blob desde base64 para previsualización o descarga
        try {
            const arr = order.complianceFile.split(',');
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            const blob = new Blob([u8arr], {type: 'application/pdf'});
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
            get: function() { return this.innerHTML; },
            set: function(val) { this.innerHTML = val; }
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
                get: function() { return this.innerHTML; },
                set: function(val) { this.innerHTML = val; }
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
        { cmd: 'outdent', icon: '← Nivel', title: 'Reducir Nivel de Lista' },
        { cmd: 'indent', icon: '→ Nivel', title: 'Aumentar Nivel de Lista' },
    ];
    
    const toolbarTitle = document.createElement('div');
    toolbarTitle.style.cssText = 'font-weight: bold; font-size: 11px; color: #64748b; margin-right: 8px; letter-spacing: 0.5px;';
    toolbarTitle.innerHTML = '📝 FORMATO<br>DE TEXTO:';
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
    hlIcon.innerHTML = '🖍️';
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
        {val: 1, text: '10 pt'}, 
        {val: 2, text: '13 pt'}, 
        {val: 3, text: '16 pt (Normal)'}, 
        {val: 4, text: '18 pt'}, 
        {val: 5, text: '24 pt'}, 
        {val: 6, text: '32 pt'},
        {val: 7, text: '48 pt'}
    ].forEach(size => {
        const opt = document.createElement('option');
        opt.value = size.val;
        opt.textContent = size.text;
        if(size.val === 3) opt.selected = true;
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
        {val: '', text: 'Estilo de lista...'},
        {val: 'decimal', text: '1. 2. 3.'},
        {val: 'upper-roman', text: 'I. II. III.'},
        {val: 'upper-alpha', text: 'A. B. C.'},
        {val: 'lower-alpha', text: 'a. b. c.'},
        {val: 'lower-roman', text: 'i. ii. iii.'},
        {val: 'disc', text: '• Viñeta (círculo sólido)'},
        {val: 'circle', text: '○ Viñeta (círculo hueco)'},
        {val: 'square', text: '■ Viñeta (cuadrado)'}
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

    // 2. Insertar una única toolbar global en Órdenes de Patrulla
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
            const rotGroupInput = document.getElementById('rotationStartGroup');
            if (rotGroupInput) rotGroupInput.value = rotationStartGroup;
        }
        updateRotationEngine();
    }, 1000);
});

window.updateRotationEngine = async function() {
    const input = document.getElementById('rotationStartDate');
    const startGroupInput = document.getElementById('rotationStartGroup');
    
    if (startGroupInput) {
        rotationStartGroup = startGroupInput.value;
        await serverSave('rotationStartGroup', rotationStartGroup);
    } else if (!rotationStartGroup) {
        rotationStartGroup = 'ALFA';
    }

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
    
    if (diffDays < 0) {
        currentFrancoGroup = 'N/A';
        if (document.getElementById('rotCycleStatus')) {
            document.getElementById('rotCycleStatus').textContent = 'El ciclo inicia en el futuro';
        }
        if (document.getElementById('rotFrancoGroup')) {
            document.getElementById('rotFrancoGroup').textContent = 'N/A';
            document.getElementById('rotFrancoGroup').style.background = '#e2e8f0';
            document.getElementById('rotFrancoGroup').style.color = '#475569';
        }
        rotationStartDate = input.value;
        await serverSave('rotationStartDate', rotationStartDate);
        return;
    }

    const dayOfCycle = diffDays % 28;
    const currentWeek = Math.floor(dayOfCycle / 7) + 1;
    
    // Lista de grupos y colores correspondientes
    const groups = ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA'];
    const colors = {
        'ALFA': '#3b82f6',     // Azul
        'BRAVO': '#10b981',    // Verde
        'CHARLIE': '#f59e0b',  // Naranja
        'DELTA': '#8b5cf6'     // Morado
    };

    // Calcular el índice del grupo franco basado en el grupo de inicio designado manualmente
    const startIndex = groups.indexOf(rotationStartGroup);
    const francoGroupIndex = (startIndex !== -1 ? (startIndex + (currentWeek - 1)) % 4 : (currentWeek - 1) % 4);
    
    currentFrancoGroup = groups[francoGroupIndex];
    let francoColor = colors[currentFrancoGroup] || '#64748b';

    if (document.getElementById('rotCycleStatus')) {
        document.getElementById('rotCycleStatus').textContent = `Semana ${currentWeek} de 4 (Dia ${dayOfCycle + 1} de 28)`;
    }
    const francoBadge = document.getElementById('rotFrancoGroup');
    if (francoBadge) {
        francoBadge.textContent = currentFrancoGroup !== 'N/A' ? `Grupo ${currentFrancoGroup}` : 'N/A';
        francoBadge.style.background = francoColor;
        francoBadge.style.color = '#ffffff';
    }

    rotationStartDate = input.value;
    await serverSave('rotationStartDate', rotationStartDate);
};

// ============================================================
// MAPA DE CALOR - MÓDULO DE INTELIGENCIA
// Funciones de inicialización y refresco del mapa Leaflet
// ============================================================

function getIntensity(type) {
    if (!type) return 0.5;
    const t = type.toLowerCase();
    if (t.includes('sicariato') || t.includes('muerte')) return 1.0;
    if (t.includes('atentado')) return 0.9;
    if (t.includes('extorsion') || t.includes('secuestro') || t.includes('narcotrafico')) return 0.8;
    if (t.includes('droga')) return 0.7;
    if (t.includes('robo') || t.includes('armas') || t.includes('contrabando')) return 0.6;
    return 0.5;
}

function initMap() {
    if (window.map) return;

    window.map = L.map('map', {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false
    }).setView(GYE_COORDS, ZOOM_LEVEL);

    map = window.map;

    // Capa base CartoDB Positron
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(map);

    // Control de zoom
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Capa de marcadores
    markerLayer = L.featureGroup().addTo(map);

    // Inicializar capas de calor
    refreshHeatLayer();

    // Cargar marcadores iniciales
    refreshMarkers();

    // Control de capas KMZ
    kmzControl = L.control.layers(null, null, {
        collapsed: true,
        position: 'topright'
    }).addTo(map);

    kmzControl.addOverlay(markerLayer, "Marcadores de Incidentes");

    // Inicializar KMZ si existe la función
    if (typeof initKMZLoader === 'function') {
        try { initKMZLoader(); } catch(e) { console.warn('KMZ loader error:', e); }
    }

    // Clic en mapa para seleccionar ubicación
    map.on('click', (e) => {
        selectedLatLng = e.latlng;

        if (document.getElementById('lat')) document.getElementById('lat').textContent = `Lat: ${selectedLatLng.lat.toFixed(5)}`;
        if (document.getElementById('lng')) document.getElementById('lng').textContent = `Lng: ${selectedLatLng.lng.toFixed(5)}`;

        const tempMarker = L.circleMarker(selectedLatLng, {
            radius: 8,
            fillColor: "#38bdf8",
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);

        setTimeout(() => {
            if (map && tempMarker) map.removeLayer(tempMarker);
        }, 3000);
    });
}

function refreshHeatLayer() {
    if (typeof map === 'undefined' || !map) return;
    if (typeof L.heatLayer !== 'function') {
        console.warn("Leaflet.heat plugin no cargado.");
        return;
    }

    // Remover capas de calor existentes
    Object.values(heatLayers).forEach(layer => {
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    });

    // Tipos de delitos + Operaciones
    const types = Object.keys(CRIME_COLORS);

    types.forEach(type => {
        let dataToHeat = [];
        if (type === 'operacion') {
            dataToHeat = (typeof instantOps !== 'undefined' ? instantOps : [])
                .filter(op => op.lat != null && op.lng != null && !isNaN(op.lat) && !isNaN(op.lng))
                .map(op => [op.lat, op.lng, 0.8]);
        } else {
            dataToHeat = (Array.isArray(crimes) ? crimes : [])
                .filter(c => c.type === type)
                .map(c => [c.lat, c.lng, c.intensity || 0.5]);
        }

        if (dataToHeat.length > 0) {
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

    // Traer marcadores al frente
    setTimeout(() => {
        if (markerLayer && typeof markerLayer.bringToFront === 'function') {
            markerLayer.bringToFront();
        }
    }, 100);
}

function refreshMarkers() {
    if (!markerLayer) return;
    markerLayer.clearLayers();

    // Limpiar referencias
    for (let id in incidentMarkers) delete incidentMarkers[id];

    (Array.isArray(crimes) ? crimes : []).forEach(crime => {
        const marker = L.circleMarker([crime.lat, crime.lng], {
            radius: 10,
            fillColor: CRIME_COLORS[crime.type] || '#fff',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            interactive: true,
            pane: 'markerPane',
            bubblingMouseEvents: false
        });

        const crimeColor = CRIME_COLORS[crime.type] || '#38bdf8';
        const crimeEmoji = (() => {
            const t = (crime.type || '').toLowerCase();
            if (t.includes('sicariato') || t.includes('muerte')) return '💀';
            if (t.includes('robo')) return '🔵';
            if (t.includes('extorsion')) return '🟢';
            if (t.includes('droga')) return '🟡';
            if (t.includes('secuestro')) return '🔴';
            if (t.includes('narcotrafico')) return '🟤';
            if (t.includes('armas')) return '⚫';
            if (t.includes('atentado')) return '💥';
            if (t.includes('contrabando')) return '🟠';
            return '⚠️';
        })();

        const popupContent = `
            <div class="custom-popup" style="min-width: 220px; padding: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);">
                <div style="background: ${crimeColor}; color: white; padding: 10px 14px; font-weight: 800; font-size: 0.9rem; text-transform: uppercase;">
                    ${crimeEmoji} ${crime.type}
                </div>
                <div style="padding: 12px; background: #1e293b; color: #f1f5f9; border-top: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin: 0 0 6px 0; font-size: 0.85rem;"><b style="color: #94a3b8;">Distrito:</b> ${crime.district || 'S/N'}</p>
                    <p style="margin: 0 0 6px 0; font-size: 0.85rem;"><b style="color: #94a3b8;">Fecha:</b> ${new Date(crime.date).toLocaleString()}</p>
                    <p style="margin: 0 0 8px 0; font-size: 0.85rem;"><b style="color: #94a3b8;">Coord:</b> ${crime.lat.toFixed(5)}, ${crime.lng.toFixed(5)}</p>
                    <hr style="margin: 8px 0; border: 0; border-top: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin: 0 0 12px 0; font-size: 0.85rem; line-height: 1.4;"><b style="color: #94a3b8;">Observación:</b><br>${crime.observation || 'Sin observaciones'}</p>
                    <button onclick="editCrime('${crime.id}')" style="width: 100%; padding: 8px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; font-weight: 700;">
                        ✏️ MODIFICAR INCIDENTE
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

    // Marcadores de operaciones
    (Array.isArray(instantOps) ? instantOps : []).forEach(op => {
        if (op.lat == null || op.lng == null || isNaN(op.lat) || isNaN(op.lng)) return;
        const marker = L.circleMarker([op.lat, op.lng], {
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
                    🚀 OPERACIÓN: ${op.reportNum || 'S/N'}
                </div>
                <div style="padding: 12px; background: #1e293b; color: #f1f5f9;">
                    <p style="margin: 0 0 4px 0; font-size: 0.85rem;"><b>REF:</b> ${op.ref || '---'}</p>
                    <p style="margin: 0 0 4px 0; font-size: 0.85rem;"><b>Ubicación:</b> ${op.donde || '---'}</p>
                    <p style="margin: 0 0 8px 0; font-size: 0.85rem;"><b>Fecha:</b> ${op.date || '---'}</p>
                </div>
            </div>
        `;

        marker.bindPopup(popupContent, { className: 'custom-leaflet-popup', closeButton: false });
        markerLayer.addLayer(marker);
        incidentMarkers[op.id] = marker;
    });

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

