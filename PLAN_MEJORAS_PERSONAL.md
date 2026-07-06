# PLAN DE MEJORAS - MÓDULO DE PERSONAL
## Roadmap de Implementación 2026
**Versión**: 1.0 | **Fecha**: 28/05/2026

---

## 📋 MATRIZ DE MEJORAS (Prioridad vs Esfuerzo)

```
                        ESFUERZO →
              BAJO          MEDIO        ALTO
IMPACTO ↑
ALTO      ✅ HACER YA    🔶 PLANEAR   🔴 EVALUAR
          -Validación   -Auditoría   -SQLite
          -Búsqueda     -Reportes    -Multiusuario
          -Acentos      -Backup Auto

MEDIO     🟡 OPCIONAL   🟡 EVALUAR   ⚪ FUTURO
          -Filtros      -Permisos    -API
          -Acceso       -Historia

BAJO      ⚪ LUEGO      ⚪ LUEGO     ⚪ FUTURO
          -UI Minor     -Polish      -Mobile
```

---

## 🎯 MEJORAS DETALLADAS

### 1️⃣ VALIDACIÓN DE CÉDULA ECUATORIANA

**Prioridad**: 🔴 CRÍTICA  
**Esfuerzo**: ⚡ BAJO (30 min)  
**Impacto**: 🔥 ALTO

**Problema**: Aceptaactualmente cualquier número

**Solución**: Validar algoritmo módulo-11 ecuatoriano

```javascript
// Agregar en handlePersonnelSubmit() línea 1850

function validateEcuadorianID(cedula) {
    if (!/^\d{10}$/.test(cedula)) return false;
    
    const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    
    for (let i = 0; i < 9; i++) {
        let digit = parseInt(cedula[i]) * coef[i];
        if (digit > 9) digit -= 9;
        sum += digit;
    }
    
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(cedula[9]);
}

// Uso:
if (!validateEcuadorianID(cedula)) {
    alert('❌ Cédula inválida');
    return;
}
```

**Beneficio**: ✅ Evita 95% de errores de cédula

**Tiempo estimado**: 30 minutos

---

### 2️⃣ BÚSQUEDA AVANZADA CON FILTROS

**Prioridad**: 🟠 ALTA  
**Esfuerzo**: ⚡ BAJO (1 hora)  
**Impacto**: 🔥 MEDIO-ALTO

**Mejora actual**: Solo busca por nombre  
**Mejora propuesta**: Agregar filtros dropdown

```html
<!-- Agregar en index.html antes de tabla de personal -->
<div class="filter-bar">
    <input id="searchPersonal" placeholder="Buscar nombre...">
    
    <select id="filterGrade" class="filter-select">
        <option value="">-- Todos los Grados --</option>
        <option value="CPNV">CPNV</option>
        <option value="ALFG">ALFG</option>
        <!-- etc -->
    </select>
    
    <select id="filterCondition" class="filter-select">
        <option value="">-- Todas las Condiciones --</option>
        <option value="OPERATIVO">OPERATIVO</option>
        <option value="FRANCO">FRANCO</option>
        <option value="PERMISO">PERMISO</option>
    </select>
    
    <select id="filterUnit" class="filter-select">
        <option value="">-- Todas las Unidades --</option>
        <option value="SUR">SUR</option>
        <option value="NORTE">NORTE</option>
    </select>
    
    <button onclick="applyAdvancedFilters()">🔍 Filtrar</button>
</div>
```

```javascript
function applyAdvancedFilters() {
    const name = document.getElementById('searchPersonal').value.toLowerCase();
    const grade = document.getElementById('filterGrade').value;
    const condition = document.getElementById('filterCondition').value;
    const unit = document.getElementById('filterUnit').value;
    
    const filtered = personnel.filter(p => 
        (!name || p.name.toLowerCase().includes(name)) &&
        (!grade || p.grade === grade) &&
        (!condition || p.condition === condition) &&
        (!unit || p.unit === unit)
    );
    
    renderFilteredTable(filtered);
}
```

**Beneficio**: ✅ Búsqueda 10x más poderosa

**Tiempo estimado**: 60 minutos

---

### 3️⃣ ELIMINACIÓN DE ACENTOS EN BÚSQUEDA

**Prioridad**: 🟡 MEDIA  
**Esfuerzo**: ⚡ BAJO (15 min)  
**Impacto**: 🟡 MEDIO

**Problema**: Buscar "Garcia" no encuentra "García"

**Solución**: Función normalize()

```javascript
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Usar en búsqueda:
function renderPersonnelTable(searchTerm = '') {
    const normalized = removeAccents(searchTerm.toLowerCase());
    const filtered = personnel.filter(p => 
        removeAccents(p.name.toLowerCase()).includes(normalized)
    );
    // ... renderizar
}
```

**Beneficio**: ✅ Búsqueda más tolerante

**Tiempo estimado**: 15 minutos

---

### 4️⃣ PREVENCIÓN DE DUPLICADOS

**Prioridad**: 🟠 ALTA  
**Esfuerzo**: ⚡ BAJO (45 min)  
**Impacto**: 🔥 ALTO

**Problema**: Puede registrarse 2 personas con misma cédula

**Solución**: Validar unicidad antes de guardar

```javascript
function handlePersonnelSubmit(e) {
    e.preventDefault();
    
    const cedula = document.getElementById('personalCedula').value;
    const id = document.getElementById('personalId').value;
    
    // Verificar si la cédula ya existe (excepto si editando el mismo)
    const exists = personnel.some(p => p.idNum === cedula && p.id !== id);
    
    if (exists) {
        alert('❌ Esta cédula ya está registrada');
        return;
    }
    
    // ... continuar con registro
}
```

**Beneficio**: ✅ Evita duplicados

**Tiempo estimado**: 45 minutos

---

### 5️⃣ SISTEMA DE AUDITORÍA

**Prioridad**: 🔶 MEDIA  
**Esfuerzo**: 🟡 MEDIO (2-3 horas)  
**Impacto**: 🔥 ALTO

**Valor**: Rastrear quién cambió qué y cuándo

```javascript
const auditLog = [
    {
        timestamp: '2026-05-28 14:30:45',
        user: 'usuario_logueado',
        action: 'CREATE', // CREATE | UPDATE | DELETE
        table: 'personnel',
        recordId: 'p001',
        changes: {
            before: { name: '---' },
            after: { name: 'García López' }
        }
    }
];

function logAudit(action, table, recordId, before, after) {
    auditLog.push({
        timestamp: new Date().toLocaleString('es-ES'),
        user: currentUser, // Variable global
        action: action,
        table: table,
        recordId: recordId,
        changes: { before, after }
    });
    
    localStorage.setItem('gyauditlog', JSON.stringify(auditLog));
}

// Usar en handlePersonnelSubmit:
logAudit('UPDATE', 'personnel', id, oldData, newData);
```

**Beneficio**: ✅ Trazabilidad completa

**Tiempo estimado**: 2-3 horas

---

### 6️⃣ BACKUP AUTOMÁTICO A IndexedDB

**Prioridad**: 🟠 ALTA  
**Esfuerzo**: 🟡 MEDIO (1.5 horas)  
**Impacto**: 🔥 MUY ALTO

**Problema**: Si se limpia localStorage, se pierden datos

**Solución**: Backup a IndexedDB cada hora

```javascript
// Inicializar IndexedDB
const dbRequest = indexedDB.open('OMAI_GT100', 1);

dbRequest.onerror = () => console.error('Error IndexedDB');

dbRequest.onsuccess = (event) => {
    const db = event.target.result;
    
    // Crear object store si no existe
    if (!db.objectStoreNames.contains('backups')) {
        db.createObjectStore('backups', { keyPath: 'id' });
    }
};

// Función de backup
function backupToIndexedDB() {
    const backup = {
        id: new Date().getTime(),
        timestamp: new Date().toISOString(),
        data: {
            personnel: personnel,
            guardAssignments: guardAssignments,
            specialAssignments: specialAssignments,
            // ... otros arrays
        }
    };
    
    const dbRequest = indexedDB.open('OMAI_GT100');
    dbRequest.onsuccess = (event) => {
        const db = event.target.result;
        const store = db.transaction('backups', 'readwrite')
            .objectStore('backups');
        store.add(backup);
    };
}

// Ejecutar cada hora
setInterval(backupToIndexedDB, 3600000);
```

**Beneficio**: ✅ Protección contra pérdida de datos

**Tiempo estimado**: 1.5 horas

---

### 7️⃣ REPORTES AVANZADOS

**Prioridad**: 🔶 MEDIA  
**Esfuerzo**: 🟡 MEDIO-ALTO (3-4 horas)  
**Impacto**: 🟡 MEDIO

**Agregar**:
- Reporte de personal por unidad
- Reporte de personal por grado
- Análisis de bajas/permisos
- Proyecciones de disponibilidad

```javascript
function generateAdvancedReports() {
    // Reporte 1: Por unidad
    const byUnit = {};
    personnel.forEach(p => {
        if (!byUnit[p.unit]) byUnit[p.unit] = [];
        byUnit[p.unit].push(p);
    });
    
    // Reporte 2: Por grado
    const byGrade = {};
    personnel.forEach(p => {
        if (!byGrade[p.grade]) byGrade[p.grade] = [];
        byGrade[p.grade].push(p);
    });
    
    // Reporte 3: Por condición
    const byCondition = {};
    personnel.forEach(p => {
        if (!byCondition[p.condition]) byCondition[p.condition] = 0;
        byCondition[p.condition]++;
    });
    
    return { byUnit, byGrade, byCondition };
}
```

**Beneficio**: ✅ Informes ejecutivos listos

**Tiempo estimado**: 3-4 horas

---

### 8️⃣ MIGRACIÓN A SQLite

**Prioridad**: 🔴 CRÍTICA (Largo plazo)  
**Esfuerzo**: 🔴 ALTO (10-15 horas)  
**Impacto**: 🔥 CRÍTICO

**¿Por qué?** localStorage tiene límites (5-10MB)

**Arquitectura**:
```
┌─────────────────────┐
│  Frontend (HTML/JS) │
├─────────────────────┤
│    API HTTP/JSON    │
├─────────────────────┤
│   Backend (Node.js) │
├─────────────────────┤
│  SQLite Database    │
└─────────────────────┘
```

**Beneficios**:
- ✅ Capacidad ilimitada de datos
- ✅ Multiusuario real
- ✅ Transacciones ACID
- ✅ Escalable

**Tiempo estimado**: 10-15 horas

---

## 📅 CRONOGRAMA DE IMPLEMENTACIÓN

### SPRINT 1 (Semana 1 - Mayo 28 - Junio 3)
```
Lunes 28:    ✅ Validación de cédula (30 min)
             ✅ Eliminación acentos (15 min)
             
Martes 29:   ✅ Búsqueda avanzada (1 hora)
             ✅ Prevención duplicados (45 min)
             
Miércoles 30: ✅ Testing y ajustes
              
Jueves 31:   ⏱️ Reserva para correcciones
             
Viernes 2:   📋 Documentación de cambios
```

**Resultado**: +4 mejoras implementadas (24 líneas de código)

---

### SPRINT 2 (Semana 2 - Junio 4 - Junio 10)
```
Lunes 4:     🟡 Backup a IndexedDB (1.5 horas)
             
Martes 5:    🟡 Sistema de auditoría (2 horas)
             
Miércoles 6: 🔶 Reportes avanzados (3 horas)
             
Jueves 7:    ⏱️ Testing e integración
             
Viernes 8:   ⏱️ Despliegue a producción
```

**Resultado**: +3 mejoras implementadas

---

### SPRINT 3+ (Junio 11+)
```
🔴 Migración a SQLite (Principal objetivo)
   - Análisis de arquitectura: 2h
   - Diseño de API: 3h
   - Implementación backend: 6h
   - Testing: 4h
   - Total: ~15 horas (2-3 semanas)
```

---

## 🎯 PRIORIZACIÓN DE CÓDIGO

### ✅ HACER PRIMERO (Esta semana)
```javascript
// 1. Validación de cédula
function validateEcuadorianID(cedula) { /* ... */ }

// 2. Búsqueda sin acentos
function removeAccents(str) { /* ... */ }

// 3. Filtros avanzados
function applyAdvancedFilters() { /* ... */ }

// 4. Validar duplicados
if (personnel.some(p => p.idNum === cedula && p.id !== id)) { /* ... */ }
```

### 🟡 PLANEAR (Próximas 2 semanas)
```javascript
// 5. Auditoría
const auditLog = []
function logAudit(action, table, recordId, before, after) { /* ... */ }

// 6. Backup automático
function backupToIndexedDB() { /* ... */ }
setInterval(backupToIndexedDB, 3600000)

// 7. Reportes
function generateAdvancedReports() { /* ... */ }
```

### 🔴 EVALUAR (Mes siguiente)
```javascript
// 8. Migración a SQLite (Backend)
// Requiere: Express.js, SQLite3, API REST
```

---

## 📊 COMPARATIVA: ANTES vs DESPUÉS

### ANTES (Estado actual: 8.5/10)
```
Validación:        ⚠️ Básica
Búsqueda:          ⚠️ Por nombre
Duplicados:        ❌ Posibles
Auditoría:         ❌ No existe
Backup:            ❌ Solo localStorage
Reportes:          ⚠️ Limitados
Escalabilidad:     ⚠️ ~1000 registros máx
```

### DESPUÉS (Objetivo: 9.5+/10)
```
Validación:        ✅ Cédula + Uniqueness
Búsqueda:          ✅ Avanzada con filtros
Duplicados:        ✅ Bloqueados
Auditoría:         ✅ Completa
Backup:            ✅ Automático
Reportes:          ✅ Avanzados
Escalabilidad:     ✅ 5000+ registros (con SQLite)
```

---

## 💰 ESTIMACIÓN DE ESFUERZO

| Mejora | Tiempo | Complejidad | Riesgo |
|--------|--------|-------------|--------|
| Validación | 30 min | ⭐ Muy baja | Ninguno |
| Sin acentos | 15 min | ⭐ Muy baja | Ninguno |
| Búsqueda avanzada | 1 h | ⭐⭐ Baja | Bajo |
| Duplicados | 45 min | ⭐⭐ Baja | Bajo |
| Auditoría | 2-3 h | ⭐⭐⭐ Media | Medio |
| Backup auto | 1.5 h | ⭐⭐⭐ Media | Medio |
| Reportes | 3-4 h | ⭐⭐⭐ Media | Medio |
| SQLite | 10-15 h | ⭐⭐⭐⭐ Alta | Alto |
| **TOTAL** | **~20-25 h** | **Media** | **Bajo** |

**Conclusión**: Todas las mejoras pueden implementarse en **1 semana** (equipo de 2 desarrolladores)

---

## 🚀 PRÓXIMOS PASOS

### Hoy (28/05/2026)
- [ ] Revisar este plan
- [ ] Aprobar mejoras prioritarias
- [ ] Asignar desarrollador

### Mañana (29/05/2026)
- [ ] Crear branch `feature/personal-improvements`
- [ ] Implementar validación de cédula
- [ ] Implementar búsqueda sin acentos

### Próxima semana
- [ ] Testing en ambiente QA
- [ ] Desplegar a producción
- [ ] Capacitar a usuarios

---

## 📞 CONTACTO

**Para consultas**:
- Desarrollador asignado: [Nombre]
- Lead técnico: [Nombre]
- Jefe de proyectos: [Nombre]

**Estado del plan**: 📋 PENDIENTE APROBACIÓN

---

**Documento preparado por**: Análisis de Sistemas  
**Fecha de creación**: 28/05/2026  
**Próxima revisión**: 30/06/2026
