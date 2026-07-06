# Análisis de la Función `updatePersonnelStats()`

## 🔍 FUENTE DEL CÓDIGO

El código completo está disponible en dos versiones:
- **Minificada**: `script.min.js` (usado en producción)
- **Source**: `SISTEMA_BACKEND/script.js` línea 2204 (versión legible para desarrollo)

## Función Source Legible

```javascript
function updatePersonnelStats(){
  const _0x1f9ae3=a0_0x5407ed,
    _0xd048ec=document.getElementById('statTotalPersonal'),
    _0x586b1f=document.getElementById('statTotalPersonnelGrid'),
    _0x4502fc=document.getElementById('statTotalGtEcho'),
    _0xd21ef3=document.getElementById('statTotalCodesc'),
    _0x1a774c=document.getElementById('statTotalOperativos'),
    _0x1d97be=document.getElementById('statTotalOtros');
    
  if(!_0xd048ec) return;
  
  // Si personnel está vacío, limpiar datos
  personnel.length === 0x0 ? 
    (baborPersonnel=[], estriborPersonnel=[], guardAssignments=[], specialAssignments=[], 
     localStorage.removeItem('baborPersonnel'), localStorage.removeItem('estriborPersonnel')) : 
    // Si personal no es vacío, restaurar datos de localStorage si es necesario
    (baborPersonnel.length === 0x0 && localStorage.getItem('baborPersonnel') && 
      (baborPersonnel=JSON.parse(localStorage.getItem('baborPersonnel'))),
     estriborPersonnel.length === 0x0 && localStorage.getItem('estriborPersonnel') && 
      (estriborPersonnel=JSON.parse(localStorage.getItem('estriborPersonnel'))),
     guardAssignments.length === 0x0 && localStorage.getItem('guardAssignments') && 
      (guardAssignments=JSON.parse(localStorage.getItem('guardAssignments'))),
     specialAssignments.length === 0x0 && localStorage.getItem('specialAssignments') && 
      (specialAssignments=JSON.parse(localStorage.getItem('specialAssignments'))));
  
  // Actualizar total personal
  _0xd048ec.textContent = personnel.length;
  
  // Calcular operativos (personal sin 'condition' o con condition='operativo')
  const _0x3ebd1f = personnel.filter(p => !p.condition || p.condition === 'operativo').length;
  const _0x3b6ca3 = personnel.length - _0x3ebd1f; // otros/descanso
  
  if(_0x1a774c) _0x1a774c.textContent = _0x3ebd1f;
  if(_0x1d97be) _0x1d97be.innerHTML = _0x3b6ca3;
  
  // Calcular personal en grupos seleccionados
  const _0x35c852 = () => {
    if(selectedWatchGroup === 'both') return baborPersonnel.length + estriborPersonnel.length;
    if(selectedWatchGroup === 'babor') return baborPersonnel.length;
    if(selectedWatchGroup === 'estribor') return estriborPersonnel.length;
    return 0x0;
  };
  
  const _0x21e347 = _0x35c852();
  
  if(_0x586b1f) _0x586b1f.innerHTML = _0x21e347;
  
  // GT ECHO Babor
  if(_0x4502fc){
    const _0x293f68 = selectedWatchGroup === 'babor' || selectedWatchGroup === 'both';
    _0x4502fc.innerHTML = _0x293f68 ? baborPersonnel.length : 0x0;
  }
  
  // CODESC Estribor
  if(_0xd21ef3){
    const _0x54e030 = selectedWatchGroup === 'estribor' || selectedWatchGroup === 'both';
    _0xd21ef3.innerHTML = _0x54e030 ? estriborPersonnel.length : 0x0;
  }
  
  // Procesar asignaciones especiales y de guardia
  const _0x3d629e = [...specialAssignments, ...guardAssignments];
  const _0x264d5c = new Set(baborPersonnel.map(p => String(p.id)));
  const _0x3ad0f6 = new Set(estriborPersonnel.map(p => String(p.id)));
  
  const _0x26c87c = {}, _0x47790d = {}, _0x50aefb = {};
  
  _0x3d629e.forEach(assignment => {
    const _0x4d9b96 = assignment.position || 'Sin Puesto';
    const _0x50c7ee = String(assignment.id);
    
    if(_0x264d5c.has(_0x50c7ee)) 
      _0x26c87c[_0x4d9b96] = (_0x26c87c[_0x4d9b96] || 0x0) + 0x1;
    else if(_0x3ad0f6.has(_0x50c7ee))
      _0x47790d[_0x4d9b96] = (_0x47790d[_0x4d9b96] || 0x0) + 0x1;
    else
      _0x50aefb[_0x4d9b96] = (_0x50aefb[_0x4d9b96] || 0x0) + 0x1;
  });
  
  // Obtener puestos únicos
  const _0x43b407 = [...new Set([
    ...Object.keys(_0x26c87c),
    ...Object.keys(_0x47790d),
    ...Object.keys(_0x50aefb)
  ])].filter(p => p !== 'Sin Puesto');
  
  // Crear gráfico de puestos (Chart.js)
  const _0x2ea3d2 = document.getElementById('personnelPostChart');
  if(_0x2ea3d2){
    if(personnelPostChart) personnelPostChart.destroy();
    personnelPostChart = new Chart(_0x2ea3d2.getContext('2d'), {
      type: 'bar',
      data: {
        labels: _0x43b407,
        datasets: [
          {
            label: 'Babor',
            data: _0x43b407.map(pos => _0x26c87c[pos] || 0x0),
            backgroundColor: '#0ea5e9',
            borderColor: '#0ea5e9',
            borderWidth: 0x1
          },
          {
            label: 'Estribor',
            data: _0x43b407.map(pos => _0x47790d[pos] || 0x0),
            backgroundColor: '#ec4899',
            borderColor: '#ec4899',
            borderWidth: 0x1
          },
          {
            label: 'Sin Grupo',
            data: _0x43b407.map(pos => _0x50aefb[pos] || 0x0),
            backgroundColor: '#6366f1',
            borderColor: '#6366f1',
            borderWidth: 0x1
          }
        ]
      },
      options: { /* opciones de gráfico */ }
    });
  }
  
  // Crear gráfico de unidades
  const _0x1221b0 = {}, _0x5057ff = new Set(), _0x2fde1d = new Set();
  personnel.forEach(p => {
    const _0x5d8b3d = p.unit || 'S/N';
    const _0x222ae8 = p.specialty || 'Sin Especialidad';
    if(!_0x1221b0[_0x5d8b3d]) _0x1221b0[_0x5d8b3d] = {};
    _0x1221b0[_0x5d8b3d][_0x222ae8] = (_0x1221b0[_0x5d8b3d][_0x222ae8] || 0x0) + 0x1;
    _0x5057ff.add(_0x222ae8);
    _0x2fde1d.add(_0x5d8b3d);
  });
  
  const _0x51dfab = [..._0x2fde1d].sort();
  const _0x306d51 = [..._0x5057ff].sort((a, b) => {
    const orderList = ['TICO', 'MARINERO', 'BUZO', 'NADADOR', 'RADISTA', 'MECANICO', 'SUB.'];
    return orderList.indexOf(a) - orderList.indexOf(b);
  });
  
  // Crear gráfico de unidades (stacked bar chart)
  // ...
}
```

## ¿QUÉ HACE LA FUNCIÓN?

### 1. **Obtiene elementos del DOM**
   - `statTotalPersonal` - Muestra el total de personal
   - `statTotalPersonnelGrid` - Total en la grilla
   - `statTotalGtEcho` - Total GT ECHO (Babor)
   - `statTotalCodesc` - Total CODESC (Estribor)
   - `statTotalOperativos` - Personal operativo
   - `statTotalOtros` - Personal en descanso

### 2. **Gestiona datos de localStorage**
   - Si `personnel` está vacío, limpia los grupos
   - Si hay datos, restaura `baborPersonnel`, `estriborPersonnel`, `guardAssignments` y `specialAssignments` desde localStorage

### 3. **Actualiza estadísticas principales**
   - `statTotalPersonal` = `personnel.length`
   - `statTotalOperativos` = Personal sin condition o con condition='operativo'
   - `statTotalOtros` = Total - Operativos

### 4. **Actualiza grupo por división**
   - Depende de `selectedWatchGroup` (babor, estribor, ambos)
   - `statTotalPersonnelGrid` = Personal en el grupo seleccionado
   - `statTotalGtEcho` = `baborPersonnel.length` (si está seleccionado)
   - `statTotalCodesc` = `estriborPersonnel.length` (si está seleccionado)

### 5. **Crea gráficos (Chart.js)**
   - Gráfico de "Efectivos por Puesto"
   - Gráfico de "Unidades" (Especialidades por Unidad)

## 🔴 **PROBLEMA IDENTIFICADO**

### Por qué ves valores en 0 o 242:

1. **Los valores pueden estar en 0 si:**
   - No hay datos en el array `personnel`
   - Ningún grupo está seleccionado (`selectedWatchGroup` es null)
   - Los datos no se están cargando correctamente desde la base de datos

2. **El valor 242 inicial es porque:**
   - En el HTML, `statTotalPersonal` tiene un valor por defecto de 242
   - Si la función no se ejecuta o no actualiza el elemento, se mantiene el valor inicial

## 🔴 **PROBLEMA CRÍTICO ENCONTRADO**

### Los elementos de grupos individuales NO EXISTEN en el código

Después de analizar completamente la función `updatePersonnelStats()` en ambas versiones (minificada y source), **se descubrió que:**

**❌ NO HAY CÓDIGO para actualizar:**
- `statGtEchoAlfa` (GRUPO 1 - GT ECHO)
- `statGtEchoBravo` (GRUPO 2 - GT ECHO)
- `statGtEchoCharlie` (GRUPO 3 - GT ECHO)
- `statGtEchoDelta` (GRUPO 4 - GT ECHO)
- `statCodescFoxtrot` (FOXTROT - CODESC)
- `statCodescGolf` (GOLF - CODESC)

**Por lo tanto:**
1. ✅ Los elementos existen en el HTML (línea 1260-1313)
2. ✅ Tienen IDs correctos
3. ❌ Pero NUNCA se actualizan porque falta el código JavaScript

### Elementos que SÍ se actualizan correctamente:

✅ `statTotalPersonal` - Total de personal registrado
✅ `statTotalPersonnelGrid` - Total en grupo seleccionado  
✅ `statTotalGtEcho` (ID correcto en source: `statTotalBabor`) - Total GT ECHO
✅ `statTotalCodesc` (ID correcto en source: `statTotalEstribor`) - Total CODESC
✅ `statTotalOperativos` - Personal operativo
✅ `statTotalOtros` - Personal en descanso
✅ Gráfico "Efectivos por Puesto" (personnelPostChart)
✅ Gráfico "Unidades" (personnelUnitChart)

## 🔧 **CÓMO FUNCIONA LA FUNCIÓN** (Paso a paso):

### 1️⃣ **Obtiene referencias a elementos del DOM**
```javascript
const statTotal = document.getElementById('statTotalPersonal');
const statGridTotal = document.getElementById('statTotalPersonnelGrid');
const statBabor = document.getElementById('statTotalBabor');           // ❌ NO EXISTE
const statEstribor = document.getElementById('statTotalEstribor');    // ❌ NO EXISTE
const statOperativos = document.getElementById('statTotalOperativos');
const statOtros = document.getElementById('statTotalOtros');
```

### 2️⃣ **Carga datos desde localStorage si están vacíos**
```javascript
if (personnel.length === 0) {
    // Si no hay personal, limpia los grupos
    baborPersonnel = [];
    estriborPersonnel = [];
    guardAssignments = [];
    specialAssignments = [];
} else {
    // Si hay personal, restaura datos guardados en localStorage
    if (baborPersonnel.length === 0 && localStorage.getItem('baborPersonnel')) {
        baborPersonnel = JSON.parse(localStorage.getItem('baborPersonnel'));
    }
    // ... más restauraciones
}
```

### 3️⃣ **Actualiza estadísticas principales**
```javascript
statTotal.textContent = personnel.length;  // Total personal

// Calcula operativos (personal sin 'condition' o con condition='OPERATIVO')
const countOperativos = personnel.filter(p => !p.condition || p.condition === 'OPERATIVO').length;
const countOtros = personnel.length - countOperativos;

statOperativos.textContent = countOperativos;  // Personal operativo
statOtros.textContent = countOtros;            // Descanso/Otros
```

### 4️⃣ **Calcula personal por grupo seleccionado**
```javascript
const getSelectedCount = () => {
    if (selectedWatchGroup === 'both') return baborPersonnel.length + estriborPersonnel.length;
    if (selectedWatchGroup === 'babor') return baborPersonnel.length;
    if (selectedWatchGroup === 'estribor') return estriborPersonnel.length;
    return 0;
};

const currentSelectedTotal = getSelectedCount();
statGridTotal.textContent = currentSelectedTotal;

// ⚠️ Aquí intenta actualizar statTotalBabor y statTotalEstribor que NO existen
if (statBabor) {  // Nunca se cumple porque statBabor es null
    const isBaborVisible = (selectedWatchGroup === 'babor' || selectedWatchGroup === 'both');
    statBabor.textContent = isBaborVisible ? baborPersonnel.length : 0;
}
```

### 5️⃣ **Crea gráficos de estadísticas**
```javascript
// Gráfico de "Efectivos por Puesto" ✅ FUNCIONA
const ctxPost = document.getElementById('personnelPostChart');
if (ctxPost) {
    // Crea gráfico bar con datos de Babor, Estribor, Sin Grupo
    personn elPostChart = new Chart(ctxPost.getContext('2d'), { ... });
}

// Gráfico de "Unidades/Especialidades" ✅ FUNCIONA  
const ctxUnit = document.getElementById('personnelUnitChart');
if (ctxUnit) {
    // Crea gráfico bar stacked con especialidades por unidad
    personnelUnitChart = new Chart(ctxUnit.getContext('2d'), { ... });
}
```

**❌ FALTA: Código para actualizar statGtEchoAlfa, statGtEchoBravo, etc.**

## 🐛 **DEBUGGING RECOMENDADO**

### Paso 1: Verifica si se ejecuta la función
Abre la consola (F12 o Ctrl+Shift+I) y ejecuta:
```javascript
console.log('Personnel array:', personnel);
console.log('Babor personnel:', baborPersonnel);
console.log('Estribor personnel:', estriborPersonnel);
console.log('Selected group:', selectedWatchGroup);
```

Deberías ver:
- Personnel: Array con objetos de personal
- Babor: Array con personal de Babor (o vacío)
- Estribor: Array con personal de Estribor (o vacío)
- Selected group: 'babor', 'estribor', 'both', o null

### Paso 2: Verifica elementos encontrados
```javascript
console.log('statTotalPersonal:', document.getElementById('statTotalPersonal'));
console.log('statTotalGtEcho:', document.getElementById('statTotalGtEcho'));
console.log('statTotalBabor:', document.getElementById('statTotalBabor'));  // ❌ Será null
```

### Paso 3: Fuerza la actualización
```javascript
updatePersonnelStats();
```

Luego verifica qué elementos se actualizaron en la consola.

### Paso 4: Agrega logs a la función
Edita SISTEMA_BACKEND/script.js línea 2204 y agrega:
```javascript
function updatePersonnelStats() {
    console.log('updatePersonnelStats() called!');
    console.log('Personnel count:', personnel.length);
    console.log('Babor count:', baborPersonnel.length);
    console.log('Estribor count:', estriborPersonnel.length);
    
    // ... resto del código
}
```

## ⚠️ **PROBLEMAS IDENTIFICADOS**

### Problema 1: IDs de elementos no coinciden
- **HTML tiene**: `statTotalGtEcho`, `statTotalCodesc`
- **Código busca**: `statTotalBabor`, `statTotalEstribor`
- **Resultado**: Estos elementos nunca se actualizan

### Problema 2: Grupos individuales nunca se actualizan
- **HTML tiene**: statGtEchoAlfa, statGtEchoBravo, statGtEchoCharlie, statGtEchoDelta, statCodescFoxtrot, statCodescGolf
- **Código JavaScript**: No hay lógica para actualizar estos elementos
- **Resultado**: Siempre muestran 0

### Problema 3: Lógica incompleta en la función
La función calcula estadísticas de gráficos pero no actualiza los contadores individuales de grupos.

## ✅ **ACCIONES NECESARIAS PARA ARREGLAR**

### 1. **OPCIÓN A: Corregir IDs en HTML** (Rápido)
Cambiar en index.html:
```html
<!-- Línea 1227 -->
<span id="statTotalGtEcho" ...>  → <span id="statTotalBabor" ...>

<!-- Línea 1231 -->
<span id="statTotalCodesc" ...>  → <span id="statTotalEstribor" ...>
```

### 2. **OPCIÓN B: Corregir nombres de variable en JavaScript** (Mejor)
En SISTEMA_BACKEND/script.js línea 2204:
```javascript
// Cambiar de:
const statBabor = document.getElementById('statTotalBabor');
const statEstribor = document.getElementById('statTotalEstribor');

// A:
const statBabor = document.getElementById('statTotalGtEcho');
const statEstribor = document.getElementById('statTotalCodesc');
```

### 3. **AGREGAR LÓGICA para grupos individuales**
Después de la línea 2273 (después de actualizar statEstribor), agregar:
```javascript
// Actualizar grupos individuales de GT ECHO
// Nota: Estos requieren información de cómo se dividen los grupos (Alfa, Bravo, Charlie, Delta)
// Esto depende de cómo se asignan los grupos en la lógica de división de personal

const statGtEchoAlfa = document.getElementById('statGtEchoAlfa');
const statGtEchoBravo = document.getElementById('statGtEchoBravo');
const statGtEchoCharlie = document.getElementById('statGtEchoCharlie');
const statGtEchoDelta = document.getElementById('statGtEchoDelta');

// FALTA SABER: ¿Cómo se divide Babor en 4 grupos (Alfa, Bravo, Charlie, Delta)?
// ¿Cuáles son los criterios de división?
// Buscar si existe:
// - variable 'grupoDestino' o 'grupo' en los datos de personal
// - Lógica de división en funciones como dividePersonnelIntoGroups()
```

### 4. **AGREGAR LÓGICA para grupos CODESC**
```javascript
const statCodescFoxtrot = document.getElementById('statCodescFoxtrot');
const statCodescGolf = document.getElementById('statCodescGolf');

// FALTA SABER: ¿Cómo se divide Estribor en FOXTROT y GOLF?
```

## 🔍 **SIGUIENTES PASOS**

1. ✅ Identifica cómo se dividen los grupos (busca función `dividePersonnelIntoGroups()`)
2. ✅ Encuentra si hay propiedades como 'grupoDestino' o 'grupo' en los datos
3. ✅ Implementa la lógica para actualizar los contadores de grupos individuales
4. ✅ Recompila el archivo minificado (script.min.js) o usa script.js directamente

## 📄 **ARCHIVOS RELACIONADOS**

- **Código Source**: [SISTEMA_BACKEND/script.js](SISTEMA_BACKEND/script.js) línea 2204
- **Código Minificado**: [script.min.js](script.min.js)
- **HTML**: [index.html](index.html) líneas 1211-1330 (sección personnelStatsView)

## 🔴 **RESUMEN EJECUTIVO**

**El dashboard de estadísticas está incompleto. La función `updatePersonnelStats()` no actualiza:**

1. ❌ Los elementos Babor/Estribor (IDs no coinciden: busca 'statTotalBabor' pero HTML tiene 'statTotalGtEcho')
2. ❌ Los 4 grupos de GT ECHO (Alfa, Bravo, Charlie, Delta) - Falta código completamente
3. ❌ Los 2 grupos de CODESC (Foxtrot, Golf) - Falta código completamente

**Lo que SÍ funciona:**
- ✅ Total personal (242)
- ✅ Personal operativo vs descanso
- ✅ Gráficos de puestos y unidades
- ✅ (Parcialmente) Totales de grupos si los IDs coincidieran

**Acción inmediata:** Usar el archivo source [SISTEMA_BACKEND/script.js](SISTEMA_BACKEND/script.js) y aplicar los fixes documentados arriba.

### En el HTML (index.html):
```html
<span id="statTotalGtEcho">0</span>      <!-- Mostrado como "Total GT ECHO" -->
<span id="statTotalCodesc">0</span>     <!-- Mostrado como "Total CODESC" -->
```

### Que busca el código JavaScript:
```javascript
const statBabor = document.getElementById('statTotalBabor');     // ❌ NO EXISTE
const statEstribor = document.getElementById('statTotalEstribor'); // ❌ NO EXISTE
```

**Resultado:** 
- El código busca `statTotalBabor` pero el HTML tiene `statTotalGtEcho`
- El código busca `statTotalEstribor` pero el HTML tiene `statTotalCodesc`
- Por lo tanto, estos elementos NO se actualizan (se buscan en null)

## 📋 **MAPEO ACTUAL DE ELEMENTOS:**

### Que la función INTENTA actualizar (en script.js source):
```javascript
const statTotal = document.getElementById('statTotalPersonal');        // ✅ Existe
const statGridTotal = document.getElementById('statTotalPersonnelGrid'); // ✅ Existe
const statBabor = document.getElementById('statTotalBabor');          // ❌ NO EXISTE
const statEstribor = document.getElementById('statTotalEstribor');    // ❌ NO EXISTE
const statOperativos = document.getElementById('statTotalOperativos'); // ✅ Existe
const statOtros = document.getElementById('statTotalOtros');          // ✅ Existe
```

### Que el HTML realmente tiene (index.html líneas 1211-1239):
```html
<span id="statTotalPersonal">242</span>           ✅ ENCONTRADO
<span id="statTotalPersonnelGrid">0</span>       ✅ ENCONTRADO
<span id="statTotalGtEcho">0</span>              ❌ BUSCADO COMO 'statTotalBabor'
<span id="statTotalCodesc">0</span>              ❌ BUSCADO COMO 'statTotalEstribor'
<span id="statTotalOperativos">0</span>          ✅ ENCONTRADO
<span id="statTotalOtros">0</span>               ✅ ENCONTRADO
```

## 📋 **ELEMENTOS QUE NUNCA SE ACTUALIZAN:**

### Grupos GT ECHO (Líneas 1260-1284 del HTML):
```html
<span id="statGtEchoAlfa" class="stat-value">0</span>      <!-- NUNCA ACTUALIZADO -->
<span id="statGtEchoBravo" class="stat-value">0</span>     <!-- NUNCA ACTUALIZADO -->
<span id="statGtEchoCharlie" class="stat-value">0</span>   <!-- NUNCA ACTUALIZADO -->
<span id="statGtEchoDelta" class="stat-value">0</span>     <!-- NUNCA ACTUALIZADO -->
```

### Grupos CODESC (Líneas 1306-1313 del HTML):
```html
<span id="statCodescFoxtrot" class="stat-value">0</span>   <!-- NUNCA ACTUALIZADO -->
<span id="statCodescGolf" class="stat-value">0</span>      <!-- NUNCA ACTUALIZADO -->
```

## ✅ **QUÉ SÍ FUNCIONA:**

- ✅ `personnelPostChart` - Gráfico de efectivos por puesto (actualizado correctamente)
- ✅ `personnelUnitChart` - Gráfico de unidades/especialidades (actualizado correctamente)
- ✅ Total personal, operativos y descanso (si el código encuentra los elementos)
