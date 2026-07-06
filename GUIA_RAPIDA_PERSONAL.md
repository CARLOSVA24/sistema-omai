# GUÍA RÁPIDA: MÓDULO DE PERSONAL - MEJORAS Y USO ÓPTIMO
## Sistema OMAI GT 100.51

---

## 📊 ESTADO ACTUAL EN NÚMEROS

```
Completitud:        ████████████████████ 100%
Funcionalidad:      ██████████████████░░ 90%
Rendimiento:        ██████████████████░░ 90%
Usabilidad:         ███████████████░░░░░ 85%
Documentación:      ██████████░░░░░░░░░░ 50%
────────────────────────────────────────
PROMEDIO GENERAL:   ██████████████░░░░░░ 83% (BUENO)
```

---

## 🎯 CHECKLIST DE FUNCIONALIDADES

### Operaciones Básicas
- [x] Registrar nuevo personal
- [x] Editar datos existentes
- [x] Buscar por nombre/cédula
- [x] Eliminar registros
- [x] Ver tabla completa de personal
- [x] Exportar a PDF
- [x] Exportar a Excel
- [x] Importar desde Excel

### Características Avanzadas
- [x] Gráficos estadísticos (3 tipos)
- [x] División de guardias (Babor/Estribor)
- [x] Distribución automática de turnos
- [x] Régimen 2x2 para CODESC
- [x] Puesto de mando separado
- [x] Cálculo automático de condiciones
- [x] Histórico de personal
- [x] Búsqueda en tiempo real

### Integraciones
- [x] Órdenes de patrulla
- [x] Partes al instante
- [x] Control de vehículos
- [x] RBAC (Roles y permisos)
- [x] Base de datos local (localStorage)

---

## ⚡ CÓMO USAR EL MÓDULO DE PERSONAL

### 1️⃣ REGISTRAR PERSONAL

**Paso a paso**:
1. Ir a: **👥 PERSONAL** → **Registro de Personal**
2. Completar el formulario:
   - Grado: Seleccionar de lista (CPNV, CPFG, CPCB, TNNV, TNFG, ALFG, etc.)
   - Especialidad: Texto libre (Ej: "Infante de Marina")
   - Nombres: Apellidos y nombres completos
   - Cédula: Número de identificación
   - Condición: OPERATIVO (por defecto)
   - Reparto: Unidad (SUR, NORTE, etc.)
   - Contacto: Teléfono
   - Grupo Destino: GT asignado (GT ECHO, CODESC, etc.)
   - Rotación: ALFA o BRAVO (si aplica)
3. Clic en **"Registrar Personal"**
4. Confirmación: Notificación verde

**Duración**: ~30 segundos

---

### 2️⃣ BUSCAR PERSONAL

**Opción A - Búsqueda rápida**:
1. En la tabla, usar el campo de búsqueda
2. Escribir nombre o cédula
3. Tabla se filtra en tiempo real

**Opción B - Búsqueda visual**:
1. Mirar la tabla completa
2. Scroll hasta encontrar

**Nota**: Busca **insensible a mayúsculas**

---

### 3️⃣ EDITAR PERSONAL

**Paso a paso**:
1. En la tabla, buscar el registro
2. Hacer clic en botón ✏️ (Editar)
3. Se carga el formulario con datos
4. Modificar campos necesarios
5. Clic en **"Actualizar Personal"** (botón cambió de color)
6. Confirmación: Notificación

**Cambios se aplican automáticamente a**:
- Tabla principal
- Gráficos estadísticos
- Distribuciones existentes (si estaban asignados)

---

### 4️⃣ IMPORTAR DESDE EXCEL

**Formatos soportados**:
- Microsoft Excel (.xlsx)
- Google Sheets (exportar como .xlsx)

**Estructura de Excel**:
```
| Grado     | Especialidad     | Apellidos y Nombres | Cédula      | Condición | Reparto | Contacto    |
|-----------|------------------|-------------------|-------------|-----------|---------|-------------|
| Marinero  | Infante Marina   | Pérez García José | 0999999999  | OPERATIVO | SUR     | 0988888888  |
| ALFG      | Logística        | García López Ana  | 0899999998  | FRANCO    | NORTE   | 0987777777  |
```

**Secciones especiales** (auto-detecta):
```
GUARDIA DE BABOR
[registros aquí se asignan a Babor]

GUARDIA DE ESTRIBOR
[registros aquí se asignan a Estribor]
```

**Pasos**:
1. Ir a **Registro de Personal**
2. Clic en **"Importar Excel"** (botón azul)
3. Seleccionar archivo
4. Sistema detecta automáticamente:
   - Encabezados (flexibles: "Nombres"/"Apellidos", "Cédula"/"DNI", etc.)
   - Guardias (si menciona "BABOR" o "ESTRIBOR")
5. Confirmación con número de registros importados

**Ventajas**:
- ✅ Detección automática de columnas
- ✅ Soporta múltiples nombres para headers
- ✅ Maneja tildes y acentos
- ✅ Auto-asignación a guardias si aplica

---

### 5️⃣ VER ESTADÍSTICAS

**Ubicación**: 👥 PERSONAL → **Estadísticas de Personal**

**Indicadores**:
```
┌─────────────────────────────────────────┐
│ Total Personal Registrado: 45           │
├─────────────────────────────────────────┤
│ Operativos: 38 | Otros: 7              │
│ Babor: 22 | Estribor: 23              │
└─────────────────────────────────────────┘
```

**Gráfico 1 - Por Puestos** (Barra agrupada):
- Muestra distribución en puestos de guardia
- Series: Babor, Estribor, Sin Grupo
- Hover para ver valores exactos

**Gráfico 2 - Por Repartos** (Barra apilada):
- Desglose por grado en cada unidad
- Colores por grado militar
- Máximo 15 colores

**Actualización**: Automática cuando se modifica personal

---

### 6️⃣ DIVIDIR EN GUARDIAS

**Propósito**: Preparar personal para distribución de turnos

**Pasos**:
1. Ir a: 👥 PERSONAL → **Distribución de Personal**
2. Clic en **"Dividir Personal"**
3. Seleccionar grupo:
   - ☑️ Solo Babor
   - ☑️ Solo Estribor
   - ☑️ Ambos grupos
4. Sistema abre interfaz de selección:
   - Checkboxes con todo el personal
   - Seleccionar los que van a esta guardia
5. Clic en **"Confirmar División"**
6. Sistema asigna a `baborPersonnel[]` o `estriborPersonnel[]`

**Resultado**: 
- Tabla se actualiza mostrando solo los del grupo seleccionado
- Estadísticas se recalculan
- Listo para generar distribución

---

### 7️⃣ GENERAR DISTRIBUCIÓN

**Propósito**: Crear cuadro de guardia con asignación automática

**Pasos**:
1. Ir a: 👥 PERSONAL → **Distribución de Personal**
2. Asegurar que hay personal dividido en guardias
3. Clic en **"Generar Distribución"**
4. Sistema calcula:
   - Asignación a turnos (T1, T2, T3)
   - Asignación a puestos disponibles
   - Tareas de apoyo (cuotas fijas)
5. Se genera tabla con estructura:
   ```
   TAREAS DE APOYO
   ├─ Puesto 1 (hora)
   │  └─ Marinero Pérez
   │  └─ ALFG García
   └─ Puesto 2 (hora)
      └─ Cabo López
   
   TURNO 1 (0800-1200 / 2000-0000)
   ├─ Puesto A
   └─ Puesto B
   
   TURNO 2 (1200-1600 / 0000-0400)
   [...]
   ```

**Exportar distribución**:
- 📄 PDF: `exportDistributionToPDF()`
- 📊 Excel: `exportDistributionToExcel()`

---

### 8️⃣ RÉGIMEN 2X2 PARA CODESC

**Propósito**: Rotación automática cada 2 días

**Lógica**:
- Ciclo de 4 días
- ALFA: Días 1-2 OPERATIVO, Días 3-4 FRANCO
- BRAVO: Días 1-2 FRANCO, Días 3-4 OPERATIVO

**Pasos**:
1. Ir a: 👥 PERSONAL → **Distribución de Personal**
2. Seleccionar fecha de inicio del ciclo (Calendario)
3. Clic en **"Aplicar Régimen 2x2"**
4. Sistema:
   - Calcula días transcurridos
   - Determina qué grupo está activo HOY
   - Actualiza condición de todos los CODESC
5. Notificación: "✅ Régimen 2x2 aplicado. Grupo Activo hoy: ALFA"

**Ejemplo de salida**:
```
Hoy es 28/05/2026 (Día 3 del ciclo)
→ ALFA: FRANCO
→ BRAVO: OPERATIVO ← Activo hoy
```

---

### 9️⃣ PUESTO DE MANDO

**Ubicación**: 👥 PERSONAL → **Registro de Puesto de Mando**

**Propósito**: Gestionar oficiales en puesto de mando central

**Registro**:
1. Clic en **"Agregar Personal"**
2. Campos adicionales:
   - Cargo (Ej: "OFICIAL DE GUARDIA", "ODG")
3. Registrar como personal normal

**Uso posterior**:
- Seleccionar en Órdenes de Patrulla
- Firmar Partes al Instante
- Reportes de guardia

---

### 🔟 EXPORTAR PERSONAL

**PDF - Distribución profesional**:
1. Ir a Distribución
2. Clic en **"Exportar PDF"**
3. Genera documento con:
   - Encabezado institucional
   - Tabla estructurada por turnos
   - Firmas de autorización
   - Formato: A4 retrato

**Excel - Datos tabulares**:
1. Ir a Distribución
2. Clic en **"Exportar Excel"**
3. Genera hoja con:
   - Tabla desagregada por sección
   - Anchura de columnas optimizada
   - Listo para imprimir

---

## 🔧 MANTENIMIENTO DEL MÓDULO

### Limpiar Datos

**Eliminar todo personal** (⚠️ IRREVERSIBLE):
```
Configuración → Administración → Limpiar Datos de Personal
```

**Archivar carga actual**:
```
Distribución → Nueva Carga de Personal
→ Los registros se guardan en histórico
→ Se limpia la tabla actual
```

---

## 🚀 MEJORAS RECOMENDADAS (Prioridad)

### 🔴 CRÍTICAS (Implementar ya)
- [ ] Validación de formato de cédula (10 dígitos Ecuador)
- [ ] Prevención de duplicados por cédula
- [ ] Backup automático a IndexedDB

### 🟠 ALTAS (Próximas 2 semanas)
- [ ] Búsqueda avanzada (por grado, condición, reparto)
- [ ] Historial de cambios (quién modificó, cuándo)
- [ ] Impresión directa desde tabla

### 🟡 MEDIAS (Próximas 4 semanas)
- [ ] Migración a SQLite (base de datos real)
- [ ] Reportes por unidad/grado
- [ ] Dashboard con gráficos dinámicos

### 🟢 BAJAS (Futuro)
- [ ] Integración multiusuario en red
- [ ] Sincronización con servidores externos
- [ ] Mobile app complementaria

---

## 🐛 SOLUCIÓN A PROBLEMAS COMUNES

### ❌ Problema: "No aparecen los gráficos"
**Causa**: Chart.js no cargó  
**Solución**:
1. Refrescar página (F5)
2. Si persiste: Contactar TI

### ❌ Problema: "Se perdió un registro"
**Causa**: Caché del navegador  
**Solución**:
1. Ir a: 👥 PERSONAL → Exportar Excel
2. Descargar para tener respaldo
3. Limpiar caché: Ctrl+Shift+Del
4. Recargar sistema

### ❌ Problema: "El Excel no importa"
**Causa**: Formato incorrecto o headers no detectados  
**Solución**:
1. Usar plantilla: Descargar Plantilla Excel
2. Copiar datos a la plantilla
3. Importar nuevamente

### ❌ Problema: "Personal no se actualiza en gráficos"
**Causa**: Estadísticas desincronizadas  
**Solución**:
1. Actualizar página (F5)
2. Volver a Estadísticas de Personal
3. Debe actualizarse automáticamente

---

## 📈 CASOS DE USO REALES

### Caso 1: Incorporación de 30 nuevos marineros
1. Recibir lista en Excel del RH
2. Ir a Personal → Importar Excel
3. Seleccionar archivo
4. ¡Listo! 30 registros en 2 segundos

### Caso 2: Reorganizar guardia para operación especial
1. Ir a Distribución de Personal
2. Dividir en Babor/Estribor
3. Hacer selección manual
4. Generar distribución
5. Exportar PDF
6. Comunicar a unidades

### Caso 3: Justificación de bajo personal
1. Ir a Estadísticas
2. Tomar screenshot de indicadores
3. Incluir en reporte a superiores
4. Evidencia gráfica del estado

### Caso 4: Auditoría de personal
1. Exportar a Excel
2. Validar con RH
3. Hacer correcciones
4. Re-importar

---

## 📚 REFERENCIAS TÉCNICAS

**Funciones principales**:
```javascript
// Registro
handlePersonnelSubmit()         // L:1845

// Visualización
renderPersonnelTable()          // L:2404
updatePersonnelStats()          // L:2173

// Distribución
generatePersonnelDistribution() // L:2600+

// Importación
handlePersonnelExcelImport()    // L:2500+

// Exportación
exportDistributionToPDF()       // L:4300+
exportDistributionToExcel()     // L:4000+

// Régimen 2x2
applyCodesc2x2Regime()          // L:1846
```

**Variables clave**:
```javascript
personnel[]              // Array de personal activo
baborPersonnel[]         // Personal guardia Babor
estriborPersonnel[]      // Personal guardia Estribor
guardAssignments[]       // Asignaciones de turno
specialAssignments[]     // Tareas de apoyo
```

---

## 🎓 CAPACITACIÓN SUGERIDA

**Duración**: 30 minutos

**Temas**:
1. Navegación al módulo (2 min)
2. Registro manual (5 min)
3. Búsqueda y edición (3 min)
4. Importación Excel (5 min)
5. Estadísticas (3 min)
6. División y distribución (7 min)
7. Exportación (3 min)
8. Preguntas (2 min)

**Material recomendado**: Este documento + Video tutorial

---

## 📞 SOPORTE

**Para reportar problemas**:
1. Describir qué pasó
2. Incluir screenshot si es posible
3. Información del navegador (Chrome/Edge/Firefox)
4. Contactar a: **TI / Desarrollo**

---

**Versión**: 1.0  
**Última actualización**: 28/05/2026  
**Siguiente revisión**: 30/06/2026
