const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
// Función para validar orígenes locales o de red privada de manera robusta y segura
function isLocalOrPrivateOrigin(origin) {
    try {
        const url = new URL(origin);
        const hostname = url.hostname;

        // 1. Localhost y loopback
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
            return true;
        }

        // 2. Nombres de host locales (sin puntos, p.ej., http://servidor:3000) o que terminan en .local (mDNS)
        if (!hostname.includes('.') || hostname.endsWith('.local')) {
            return true;
        }

        // 3. Rangos de IPs privadas IPv4
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = hostname.match(ipv4Regex);
        if (match) {
            const parts = match.slice(1).map(Number);
            if (parts.some(p => p > 255)) return false;

            const [p1, p2, p3, p4] = parts;

            // 10.0.0.0/8 (Red Privada Clase A)
            if (p1 === 10) return true;

            // 172.16.0.0/12 (Red Privada Clase B)
            if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;

            // 192.168.0.0/16 (Red Privada Clase C)
            if (p1 === 192 && p2 === 168) return true;

            // 100.64.0.0/10 (CGNAT / Redes privadas de Tailscale)
            if (p1 === 100 && p2 >= 64 && p2 <= 127) return true;

            // 25.0.0.0/8 (Redes de Hamachi)
            if (p1 === 25) return true;

            // 26.0.0.0/8 (Redes de Radmin VPN)
            if (p1 === 26) return true;

            // 169.254.0.0/16 (IP de enlace local / Link-local)
            if (p1 === 169 && p2 === 254) return true;
        }

        // 4. Direcciones IPv6 locales/privadas
        if (hostname.startsWith('[') && hostname.endsWith(']')) {
            const ipv6 = hostname.slice(1, -1).toLowerCase();
            if (ipv6 === '::1') return true;
            if (ipv6.startsWith('fe80:')) return true;
            if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// ─── DOMINIOS PÚBLICOS PERMITIDOS (Cloudflare Tunnel, ngrok, Render, Railway, etc.) ─
function isAllowedPublicOrigin(origin) {
    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();
        return hostname.endsWith('.trycloudflare.com') ||
               hostname.endsWith('.cfargotunnel.com') ||
               hostname.endsWith('.ngrok-free.dev') ||
               hostname.endsWith('.ngrok-free.app') ||
               hostname.endsWith('.onrender.com') ||
               hostname.endsWith('.railway.app') ||
               hostname.endsWith('.fly.dev') ||
               hostname.endsWith('.vercel.app') ||
               hostname.endsWith('.netlify.app') ||
               hostname.includes('ngrok') ||
               hostname.includes('cloudflare');
    } catch (e) {
        return false;
    }
}

const corsOptions = {
    origin: (origin, callback) => {
        // Permitir peticiones sin origin (ej. llamadas de curl, node-fetch o apps de escritorio locales)
        if (!origin) return callback(null, true);
        // Permitir redes privadas (uso local / LAN)
        if (isLocalOrPrivateOrigin(origin)) {
            return callback(null, true);
        }
        // Permitir dominios públicos autorizados
        if (isAllowedPublicOrigin(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS: Origen no permitido: ${origin}`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-socket-id']
};

const io = new Server(server, {
    cors: corsOptions
});

const PORT = process.env.PORT || 3000;

// Middleware
// Detección de ruta para compatibilidad con ejecutable (.exe)
const rootPath = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');

// Middleware
app.use(cors(corsOptions));
// Límite reducido: datos operacionales no deben exceder 10MB
app.use(bodyParser.json({ limit: '10mb', strict: false }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
// Aceptar texto plano para compatibilidad con valores primitivos (strings, null)
app.use(bodyParser.text({ limit: '10mb', type: 'text/plain' }));

app.use(express.static(rootPath));

// Database setup
const dbPath = process.env.DB_PATH || path.join(rootPath, 'database.sqlite');
// Ensure the directory for the database exists (needed for cloud persistent disks)
const dbDir = path.dirname(dbPath);
if (!require('fs').existsSync(dbDir)) {
    require('fs').mkdirSync(dbDir, { recursive: true });
    console.log(`Directorio de base de datos creado: ${dbDir}`);
}

// Abrir la base de datos y arrancar el servidor SOLO cuando la BD esté lista
const db = new sqlite3.Database(dbPath, async (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log(`Base de datos conectada en: ${dbPath}`);
    await initializeDatabase();
    startServer();
});

// (función antigua eliminada — ver _initializeDatabase más abajo)
function _OLD_UNUSED_initializeDatabase_PLACEHOLDER() {
    db.run(`CREATE TABLE IF NOT EXISTS app_data (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
        role TEXT PRIMARY KEY,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_role TEXT,
        action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS org_units (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        category TEXT,
        status TEXT DEFAULT 'ACTIVE',
        FOREIGN KEY(parent_id) REFERENCES org_units(id)
    )`, (createErr) => {
        if (createErr) {
            console.error("Error creando tabla org_units:", createErr);
            return;
        }
        db.all("SELECT id FROM org_units", [], (err, rows) => {
            if (err) {
                console.error("Error consultando org_units:", err);
                return;
            }
            if (!rows || rows.length === 0) {
                const stmt = db.prepare("INSERT INTO org_units (id, name, parent_id, category, status) VALUES (?, ?, ?, ?, ?)");
                stmt.run("GT_ECHO", "GT ECHO", null, "GT", "ACTIVE");
                stmt.run("CODESC", "CODESC", null, "GT", "ACTIVE");
                stmt.run("GT_100_51", "GT 100.51", null, "GT", "ACTIVE");
                stmt.run("FRAPAL", "FRAPAL", "GT_100_51", "BUQUE", "ACTIVE");
                stmt.run("FRAMOR", "FRAMOR", "GT_100_51", "BUQUE", "ACTIVE");
                stmt.finalize();
                console.log("Unidades organizacionales por defecto (GT ECHO / CODESC / GT 100.51) creadas.");
            }
            // Asegurar existencia de UT 100.61.4, UT 100.61.5, GT 100.51 y subordinados
            db.run("INSERT OR IGNORE INTO org_units (id, name, parent_id, category, status) VALUES ('UT_100.61.4', 'UT 100.61.4', NULL, 'UT', 'ACTIVE')");
            db.run("INSERT OR IGNORE INTO org_units (id, name, parent_id, category, status) VALUES ('UT_100.61.5', 'UT 100.61.5', NULL, 'UT', 'ACTIVE')");
            db.run("INSERT OR IGNORE INTO org_units (id, name, parent_id, category, status) VALUES ('GT_100_51', 'GT 100.51', NULL, 'GT', 'ACTIVE')");
            db.run("INSERT OR IGNORE INTO org_units (id, name, parent_id, category, status) VALUES ('FRAPAL', 'FRAPAL', 'GT_100_51', 'BUQUE', 'ACTIVE')");
            db.run("INSERT OR IGNORE INTO org_units (id, name, parent_id, category, status) VALUES ('FRAMOR', 'FRAMOR', 'GT_100_51', 'BUQUE', 'ACTIVE')");
        });
    });

    // Unificación de personal bajo UT 100.61.5 (Ejecución única)
    db.get("SELECT value FROM app_data WHERE key = 'unificacion_ut_100_61_5_ejecutada'", [], (errFlag, flagRow) => {
        if (errFlag || flagRow) {
            // Ya se ejecutó la unificación en el pasado, no hacer nada para no sobreescribir asignaciones manuales nuevas
            return;
        }
        db.get("SELECT value FROM app_data WHERE key = 'gyepersonal'", [], (err, row) => {
            if (err) {
                console.error("Error consultando gyepersonal para unificación:", err);
                return;
            }
            if (row && row.value) {
                try {
                    let data = JSON.parse(row.value);
                    let changed = false;
                    if (Array.isArray(data)) {
                        data.forEach(item => {
                            if (item.grupoDestino !== 'UT_100.61.5') {
                                item.grupoDestino = 'UT_100.61.5';
                                changed = true;
                            }
                        });
                    }
                    if (changed) {
                        db.run("UPDATE app_data SET value = ? WHERE key = 'gyepersonal'", [JSON.stringify(data)], (updErr) => {
                            if (updErr) console.error("Error actualizando personal a UT 100.61.5:", updErr);
                            else {
                                console.log("Todos los registros de personal actualizados bajo UT 100.61.5 con éxito.");
                                // Registrar que ya se ejecutó la unificación
                                db.run("INSERT OR REPLACE INTO app_data (key, value) VALUES ('unificacion_ut_100_61_5_ejecutada', 'true')");
                            }
                        });
                    } else {
                        // Si no hubo cambios, también marcar como ejecutada
                        db.run("INSERT OR REPLACE INTO app_data (key, value) VALUES ('unificacion_ut_100_61_5_ejecutada', 'true')");
                    }
                } catch(e) {
                    console.error("Error parseando personal para actualización de UT 100.61.5:", e);
                }
            }
        });
    });

    // Migración silenciosa de personal y choferes
    db.all("SELECT key, value FROM app_data WHERE key IN ('gyepersonal', 'gyechoferes')", [], (err, rows) => {
        if (err) {
            console.error("Error cargando app_data para migración:", err);
            return;
        }
        if (rows) {
            for (const row of rows) {
                try {
                    let data = JSON.parse(row.value);
                    let changed = false;
                    if (Array.isArray(data)) {
                        for (const item of data) {
                            if (item.grupoDestino === "GT ECHO") {
                                item.grupoDestino = "GT_ECHO";
                                changed = true;
                            }
                            if (item.grupoDestino === "CODESC") {
                                item.grupoDestino = "CODESC";
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        db.run("UPDATE app_data SET value = ? WHERE key = ?", [JSON.stringify(data), row.key], (updErr) => {
                            if (updErr) console.error(`Error actualizando migración para ${row.key}:`, updErr);
                            else console.log(`Migración silenciosa exitosa para la clave app_data: ${row.key}`);
                        });
                    }
                } catch (e) {
                    console.error(`Error parseando valor para migración de ${row.key}:`, e);
                }
            }
        }
    });

    // Crear usuarios por defecto usando hashSync (síncrono) para evitar
    // problemas de async/await dentro de callbacks de SQLite
    db.all("SELECT role, password FROM users", (err, rows) => {
        if (err) { console.error('Error leyendo usuarios:', err); return; }

        const SALT_ROUNDS = 10;
        const isHashed = (p) => typeof p === 'string' && p.startsWith('$2');

        if (!rows || rows.length === 0) {
            // Primer arranque: insertar usuarios con contraseñas hasheadas (síncronamente)
            const defaultPasswords = {
                "ADMINISTRADOR": "admin",
                "JEFE OMAI": "jefe",
                "PERSONAL OMAI": "personal",
                "LOGISTICA OMAI": "logistica",
                "INTELIGENCIA OMAI": "inteligencia",
                "CMDTE GT 51": "cmdte",
                "PURGA_MAESTRA": "omai2024"
            };
            const stmt = db.prepare("INSERT INTO users (role, password) VALUES (?, ?)");
            for (const [role, pass] of Object.entries(defaultPasswords)) {
                const hashed = bcrypt.hashSync(pass, SALT_ROUNDS);
                stmt.run(role, hashed);
            }
            stmt.finalize();
            console.log('Usuarios iniciales creados con contraseñas hasheadas.');
        } else {
            // Migrar contraseñas en texto plano que aún no estén hasheadas
            for (const row of rows) {
                if (!isHashed(row.password)) {
                    const hashed = bcrypt.hashSync(row.password, SALT_ROUNDS);
                    db.run("UPDATE users SET password = ? WHERE role = ?", [hashed, row.role]);
                    console.log(`Contraseña migrada a bcrypt para rol: ${row.role}`);
                }
            }
        }

        // Asegurar que la clave maestra (PURGA_MAESTRA) siempre exista
        db.get("SELECT password FROM users WHERE role = 'PURGA_MAESTRA'", [], (pmErr, pmRow) => {
            if (pmErr) {
                console.error('Error consultando PURGA_MAESTRA:', pmErr);
            } else if (!pmRow) {
                const hashed = bcrypt.hashSync("omai2024", SALT_ROUNDS);
                db.run("INSERT INTO users (role, password) VALUES ('PURGA_MAESTRA', ?)", [hashed], (insErr) => {
                    if (insErr) console.error('Error insertando PURGA_MAESTRA por defecto:', insErr);
                    else console.log('Clave maestra de borrado inicializada en base de datos.');
                });
            }
        });
    });
} // end initializeDatabase — ahora retorna Promise

// Convierte initializeDatabase a Promise para poder awaitarla antes de server.listen
function initializeDatabase() {
    return new Promise((resolve) => {
        _initializeDatabase(resolve);
    });
}

async function _initializeDatabase(onDone) {
    // Tablas estructurales (no necesitan callback — se ejecutan en serie por sqlite3)
    await runDb(`CREATE TABLE IF NOT EXISTS app_data (key TEXT PRIMARY KEY, value TEXT)`);
    await runDb(`CREATE TABLE IF NOT EXISTS users (role TEXT PRIMARY KEY, password TEXT)`);
    await runDb(`CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_role TEXT, action TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await runDb(`CREATE TABLE IF NOT EXISTS org_units (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, category TEXT, status TEXT DEFAULT 'ACTIVE', FOREIGN KEY(parent_id) REFERENCES org_units(id))`);

    // Insertar unidades organizacionales por defecto
    const orgUnits = [
        ['GT_ECHO','GT ECHO',null,'GT','ACTIVE'],
        ['CODESC','CODESC',null,'GT','ACTIVE'],
        ['GT_100_51','GT 100.51',null,'GT','ACTIVE'],
        ['FRAPAL','FRAPAL','GT_100_51','BUQUE','ACTIVE'],
        ['FRAMOR','FRAMOR','GT_100_51','BUQUE','ACTIVE'],
        ['UT_100.61.4','UT 100.61.4',null,'UT','ACTIVE'],
        ['UT_100.61.5','UT 100.61.5',null,'UT','ACTIVE'],
    ];
    for (const [id, name, parent_id, category, status] of orgUnits) {
        await runDb(`INSERT OR IGNORE INTO org_units (id, name, parent_id, category, status) VALUES (?, ?, ?, ?, ?)`, [id, name, parent_id, category, status]);
    }

    // Crear usuarios por defecto con hashSync (síncrono)
    const SALT_ROUNDS = 10;
    const rows = await allDb('SELECT role FROM users');
    if (!rows || rows.length === 0) {
        const defaultPasswords = {
            "ADMINISTRADOR": "admin",
            "JEFE OMAI": "jefe",
            "PERSONAL OMAI": "personal",
            "LOGISTICA OMAI": "logistica",
            "INTELIGENCIA OMAI": "inteligencia",
            "CMDTE GT 51": "cmdte",
            "CORLOJ": "corloj",
            "FRAPAL": "frapal",
            "FRAMOR": "framor",
            "CORIOS": "corios",
            "CORMAN": "corman",
            "ESCLAM": "esclam",
            "TRAHUA": "trahua",
            "ESCAUX": "escaux",
            "TRACAL": "tracal",
            "TANATA": "tanata",
            "REMIMB": "remimb",
            "REMCHI": "remchi",
            "ESCORB": "escorb",
            "COMSUB": "comsub",
            "PURGA_MAESTRA": "omai2024"
        };
        const stmt = db.prepare("INSERT OR REPLACE INTO users (role, password) VALUES (?, ?)");
        for (const [role, pass] of Object.entries(defaultPasswords)) {
            stmt.run(role, bcrypt.hashSync(pass, SALT_ROUNDS));
        }
        await finalizeStmt(stmt);
        console.log(`[DB] ${Object.keys(defaultPasswords).length} usuarios iniciales creados.`);
    } else {
        console.log(`[DB] ${rows.length} usuarios ya existen en la base de datos.`);
    }
    console.log('[DB] Base de datos inicializada y lista.');
    if (onDone) onDone();
}

// Helpers: envuelven sqlite3 callbacks en Promises
function runDb(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, (err) => { if (err) { console.error('[DB run]', err); resolve(); } else resolve(); });
    });
}
function allDb(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => { if (err) { console.error('[DB all]', err); resolve([]); } else resolve(rows); });
    });
}
function finalizeStmt(stmt) {
    return new Promise((resolve) => { stmt.finalize(resolve); });
}

const activeUsers = new Map();

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', database: 'connected', timestamp: new Date(), dbPath });
});


const normalizeRoleStr = (str) => String(str || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Endpoint de login: valida credenciales contra la base de datos
app.post('/api/login', (req, res) => {
    const body = req.body;
    const role = body && body.role;
    const password = body && body.password;

    if (!role || typeof role !== 'string' || !password || typeof password !== 'string') {
        return res.status(400).json({ success: false, message: 'Datos de acceso inválidos.' });
    }

    const normInputRole = normalizeRoleStr(role);

    db.all("SELECT role, password FROM users", [], (err, rows) => {
        if (err) {
            console.error('Error en login DB:', err);
            return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }

        const userRow = (rows || []).find(r => normalizeRoleStr(r.role) === normInputRole);

        if (!userRow) {
            return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
        }
        try {
            const match = bcrypt.compareSync(String(password), userRow.password);
            if (match) {
                db.run("INSERT INTO activity_logs (user_role, action) VALUES (?, ?)",
                    [userRow.role, 'Inicio de sesión exitoso']);
                return res.json({ success: true, role: userRow.role });
            } else {
                return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
            }
        } catch (bcryptErr) {
            console.error('Error bcrypt:', bcryptErr);
            return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
        }
    });
});

// --- ENDPOINT SEGURO: Cambiar contraseña ---
app.post('/api/change-password', (req, res) => {
    const { role, newPassword } = req.body;

    if (!role || typeof role !== 'string' || !newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ success: false, message: 'Datos inválidos.' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 4 caracteres.' });
    }

    const sanitizedRole = role.trim().toUpperCase().substring(0, 100);

    bcrypt.hash(newPassword, 10, (err, hashed) => {
        if (err) return res.status(500).json({ success: false, message: 'Error hasheando contraseña.' });
        db.run("INSERT OR REPLACE INTO users (role, password) VALUES (?, ?)", [sanitizedRole, hashed], (dbErr) => {
            if (dbErr) return res.status(500).json({ success: false, message: dbErr.message });
            db.run("INSERT INTO activity_logs (user_role, action) VALUES (?, ?)",
                [sanitizedRole, 'Contraseña actualizada']);
            res.json({ success: true });
        });
    });
});

// --- ENDPOINT SEGURO: Listar roles (sin contraseñas) ---
app.get('/api/users', (req, res) => {
    db.all("SELECT role FROM users WHERE role != 'PURGA_MAESTRA'", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.role));
    });
});

// --- ENDPOINT SEGURO: Eliminar usuario ---
app.post('/api/delete-user', (req, res) => {
    const { role } = req.body;
    if (!role || typeof role !== 'string') {
        return res.status(400).json({ success: false, message: 'Rol no especificado.' });
    }
    const sanitizedRole = role.trim().toUpperCase().substring(0, 100);
    if (sanitizedRole === 'ADMINISTRADOR' || sanitizedRole === 'PURGA_MAESTRA') {
        return res.status(403).json({ success: false, message: `No se puede eliminar el rol ${sanitizedRole}.` });
    }
    db.run("DELETE FROM users WHERE role = ?", [sanitizedRole], (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        db.run("INSERT INTO activity_logs (user_role, action) VALUES (?, ?)",
            [sanitizedRole, `Usuario ${sanitizedRole} eliminado`]);
        res.json({ success: true });
    });
});

// --- GESTIÓN DE UNIDADES ORGANIZACIONALES (GT/CODESC) ---
// Obtener todas las unidades (activas e inactivas)
app.get('/api/org-units', (req, res) => {
    db.all("SELECT * FROM org_units ORDER BY parent_id ASC, name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Guardar/Actualizar una unidad
app.post('/api/org-units', (req, res) => {
    const { id, name, parent_id, category, status } = req.body;
    if (!id || !name) {
        return res.status(400).json({ success: false, message: "ID y Nombre son obligatorios." });
    }
    
    const sanitizedId = id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const sanitizedName = name.trim();
    const parentId = parent_id ? parent_id.trim().toUpperCase() : null;
    const cat = category ? category.trim() : 'SUBUNIDAD';
    const stat = status ? status.trim() : 'ACTIVE';
    
    if (parentId === sanitizedId) {
        return res.status(400).json({ success: false, message: "Una unidad no puede subordinarse a sí misma." });
    }
    
    db.run("INSERT OR REPLACE INTO org_units (id, name, parent_id, category, status) VALUES (?, ?, ?, ?, ?)",
        [sanitizedId, sanitizedName, parentId, cat, stat],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            db.run("INSERT INTO activity_logs (user_role, action) VALUES ('ADMINISTRADOR', ?)",
                [`Unidad creada/actualizada: ${sanitizedName} (${sanitizedId})`]);
            res.json({ success: true, id: sanitizedId });
        }
    );
});

// Eliminar/Desactivar una unidad (Soft Delete para mantener históricos)
app.post('/api/org-units/delete', (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ success: false, message: "ID no especificado." });
    }
    
    db.run("UPDATE org_units SET status = 'INACTIVE' WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        db.run("INSERT INTO activity_logs (user_role, action) VALUES ('ADMINISTRADOR', ?)",
            [`Unidad desactivada: ${id}`]);
        res.json({ success: true });
    });
});

// --- ENDPOINT SEGURO: Verificar clave maestra de borrado ---
app.post('/api/verify-purge-key', (req, res) => {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
        return res.status(400).json({ success: false, message: 'Clave no especificada.' });
    }

    db.get("SELECT password FROM users WHERE role = 'PURGA_MAESTRA'", [], async (err, row) => {
        if (err) {
            console.error('Error DB verify purge key:', err);
            return res.status(500).json({ success: false, message: 'Error interno.' });
        }
        if (!row) {
            // Fallback por si acaso: si no existe en BD, verificar contra la por defecto
            try {
                const match = password.trim() === 'omai2024';
                return res.json({ success: match });
            } catch (e) {
                return res.status(500).json({ success: false, message: 'Error interno.' });
            }
        }
        try {
            const match = await bcrypt.compare(password.trim(), row.password);
            res.json({ success: match });
        } catch (bcryptErr) {
            console.error('Error bcrypt verify purge key:', bcryptErr);
            res.status(500).json({ success: false, message: 'Error interno.' });
        }
    });
});

app.get('/api/store/:key', (req, res) => {
    const key = req.params.key;
    db.get("SELECT value FROM app_data WHERE key = ?", [key], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.json(null);
        try {
            res.json(JSON.parse(row.value));
        } catch (e) {
            // Si el valor no es JSON válido, devolverlo como string directamente
            res.json(row.value);
        }
    });
});

app.post('/api/store/:key', (req, res) => {
    const key = req.params.key;
    const senderSocketId = req.headers['x-socket-id'] || null;

    // Determinar el valor correcto según el tipo de body recibido
    let bodyData = req.body;
    let value;

    if (typeof bodyData === 'string') {
        // body-parser/text capturó un string plano (ej: '"GRUPO 1"' o 'null')
        try {
            bodyData = JSON.parse(bodyData); // intentar parsear por si es JSON válido
        } catch (e) {
            // dejarlo como string si no es JSON
        }
        value = JSON.stringify(bodyData);
    } else {
        value = JSON.stringify(bodyData);
    }

    db.run("INSERT OR REPLACE INTO app_data (key, value) VALUES (?, ?)", [key, value], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // Notificar a TODOS los clientes conectados en tiempo real
        io.emit('dataUpdate', { key, data: bodyData });
        res.json({ success: true });
    });
});

// Logs de actividad
app.get('/api/activity-logs', (req, res) => {
    db.all("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/active-users', (req, res) => {
    res.json(Array.from(activeUsers.values()));
});

// Webhook para enlazar GitHub con el servidor local expuesto por el puente (ngrok)
app.post('/api/github-webhook', (req, res) => {
    console.log('[Webhook GitHub] Petición recibida desde GitHub.');
    
    // Ejecutar git pull en la carpeta raíz de forma segura
    exec('git pull origin master', { cwd: rootPath }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[Webhook GitHub Error] No se pudo hacer git pull: ${error.message}`);
            return res.status(500).json({ success: false, error: error.message });
        }
        console.log(`[Webhook GitHub Success] git pull ejecutado correctamente:\n${stdout}`);
        if (stderr) {
            console.warn(`[Webhook GitHub Warning] Advertencia durante git pull:\n${stderr}`);
        }
        res.json({ success: true, message: 'Código actualizado correctamente desde GitHub.', output: stdout });
    });
});

// WebSocket Events
io.on('connection', (socket) => {
    console.log('Nuevo dispositivo conectado (Tiempo Real)');

    socket.on('reportRole', (data) => {
        const userData = {
            id: socket.id,
            role: data.role,
            ip: socket.handshake.address,
            connectedAt: new Date()
        };
        activeUsers.set(socket.id, userData);
        io.emit('userUpdate', Array.from(activeUsers.values()));
    });

    socket.on('logAction', (data) => {
        const { role, action } = data;
        db.run("INSERT INTO activity_logs (user_role, action) VALUES (?, ?)", [role, action], (err) => {
            if (err) console.error("Log error:", err);
            io.emit('newLog', { user_role: role, action, timestamp: new Date() });
        });
    });

    socket.on('disconnect', () => {
        console.log('Dispositivo desconectado');
        activeUsers.delete(socket.id);
        io.emit('userUpdate', Array.from(activeUsers.values()));
    });
});

// API para obtener datos de personal
app.get('/api/personnel', (req, res) => {
    db.get("SELECT value FROM app_data WHERE key = 'gyepersonal'", (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const personnel = row ? JSON.parse(row.value) : [];
        res.json({ personnel });
    });
});

// API para migración de personal
app.post('/api/migrate-personnel', (req, res) => {
    db.get("SELECT value FROM app_data WHERE key = 'gyepersonal'", (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: err.message });
        }

        let personnel = row ? JSON.parse(row.value) : [];
        if (!Array.isArray(personnel)) personnel = [];

        const stats = {
            total: personnel.length,
            updated: 0,
            addedGroup: 0,
            fixedRotacion: 0
        };

        // Migración: Corregir campos para GT ECHO y CODESC
        personnel.forEach((p, idx) => {
            // Para GT ECHO: si "rotacion" tiene "GRUPO X", convertirlo a "group"
            if (p.grupoDestino === 'GT ECHO') {
                // Si rotacion contiene "GRUPO", es un campo incorrecto que debería ser "group"
                if (p.rotacion && p.rotacion.includes('GRUPO')) {
                    p.group = p.rotacion;  // Mover "GRUPO X" a "group"
                    stats.addedGroup++;
                }
                // Si no hay group, asignar uno
                if (!p.group) {
                    const groups = ['GRUPO 1', 'GRUPO 2', 'GRUPO 3', 'GRUPO 4'];
                    p.group = groups[idx % 4];
                    stats.addedGroup++;
                }
                // Para GT ECHO, rotacion debe ser ALFA o BRAVO (para régimen 21/7)
                if (!p.rotacion || p.rotacion.includes('GRUPO')) {
                    p.rotacion = idx % 2 === 0 ? 'ALFA' : 'BRAVO';
                    stats.fixedRotacion++;
                }
            }
            // Para CODESC: asignar rotacion ALFA o BRAVO
            else if (p.grupoDestino === 'CODESC') {
                if (!p.rotacion || !['ALFA', 'BRAVO'].includes(p.rotacion)) {
                    p.rotacion = idx % 2 === 0 ? 'ALFA' : 'BRAVO';
                    stats.fixedRotacion++;
                }
            }

            stats.updated++;
        });

        // Guardar datos migrados
        const value = JSON.stringify(personnel);
        db.run("INSERT OR REPLACE INTO app_data (key, value) VALUES (?, ?)",
            ['gyepersonal', value],
            (err) => {
                if (err) {
                    return res.status(500).json({ success: false, message: err.message });
                }
                io.emit('dataUpdate', { key: 'gyepersonal', data: personnel });
                res.json({ success: true, stats });
            }
        );
    });
});

// Helper to get local IP address
// Helper to get local IP address (Improved to avoid virtual adapters)
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    const results = [];

    for (const name of Object.keys(interfaces)) {
        // Ignorar adaptadores virtuales comunes
        const lowerName = name.toLowerCase();
        if (lowerName.includes('virtual') ||
            lowerName.includes('vbox') ||
            lowerName.includes('vmware') ||
            lowerName.includes('docker') ||
            lowerName.includes('pseudo') ||
            lowerName.includes('wireguard') ||
            lowerName.includes('tailscale') ||
            lowerName.includes('vpn')) {
            continue;
        }

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                results.push({ name, address: iface.address });
            }
        }
    }

    // Priorizar Wi-Fi o Ethernet
    const priority = results.find(r =>
        r.name.toLowerCase().includes('wi-fi') ||
        r.name.toLowerCase().includes('wifi') ||
        r.name.toLowerCase().includes('ethernet') ||
        r.name.toLowerCase().includes('conexión de área local')
    );

    if (priority) return priority.address;
    return results.length > 0 ? results[0].address : 'localhost';
}

// startServer: arranca el servidor HTTP (llamado después de que la BD esté lista)
function startServer() {
    server.listen(PORT, '0.0.0.0', () => {
        const priorityIp = getLocalIP();
        console.log(`
==================================================
   SISTEMA OMAI GT 100.51 - MODO TIEMPO REAL
==================================================
   SERVIDOR LOCAL: http://localhost:${PORT}
   ACCESO RED:     http://${priorityIp}:${PORT}
   BASE DE DATOS:  ${dbPath}
==================================================
        `);
    });
}

// --- MANEJO GLOBAL DE ERRORES ---
// Middleware para errores de CORS y otros errores no capturados
app.use((err, req, res, next) => {
    if (err.message && err.message.startsWith('CORS:')) {
        console.warn(`[CORS BLOQUEADO] ${err.message} | Path: ${req.path}`);
        return res.status(403).json({ error: 'Acceso denegado por política de seguridad.' });
    }
    console.error('[ERROR SERVIDOR]', err.stack || err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
});

// Captura de rechazos de promesas no manejados
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err.stack || err.message);
});
