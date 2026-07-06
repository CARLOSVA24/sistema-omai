/**
 * FUNCIÓN: updatePersonnelStats()
 * UBICACIÓN: SISTEMA_BACKEND/script.js línea 2204
 * PROPÓSITO: Actualiza los contadores de estadísticas de personal en el dashboard
 * 
 * ⚠️ PROBLEMA: La función está INCOMPLETA
 * - Falta código para actualizar grupos individuales (Alfa, Bravo, Charlie, Delta, Foxtrot, Golf)
 * - IDs de elementos en el código no coinciden con los del HTML
 */

function updatePersonnelStats() {
    // OBTENER REFERENCIAS A ELEMENTOS DEL DOM
    const statTotal = document.getElementById('statTotalPersonal');
    const statGridTotal = document.getElementById('statTotalPersonnelGrid');
    const statBabor = document.getElementById('statTotalBabor');              // ❌ PROBLEMA: El HTML tiene 'statTotalGtEcho'
    const statEstribor = document.getElementById('statTotalEstribor');        // ❌ PROBLEMA: El HTML tiene 'statTotalCodesc'
    const statOperativos = document.getElementById('statTotalOperativos');
    const statOtros = document.getElementById('statTotalOtros');

    if (!statTotal) return;

    // A. CARGAR DATOS SI ESTÁN VACÍOS (Persistencia tras refrescar)
    if (personnel.length === 0) {
        // Garantizar que si no hay personal, nada aparezca en las divisiones
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

    // 1. Total Personal Registrado (Siempre el total en la base de datos)
    statTotal.textContent = personnel.length;

    // Estadísticas de condición
    const countOperativos = personnel.filter(p => !p.condition || p.condition === 'OPERATIVO').length;
    const countOtros = personnel.length - countOperativos;
    if (statOperativos) statOperativos.textContent = countOperativos;
    if (statOtros) statOtros.textContent = countOtros;

    // 2. Cálculo del Personal Seleccionado (Babor, Estribor o Ambos)
    const getSelectedCount = () => {
        if (selectedWatchGroup === 'both') return baborPersonnel.length + estriborPersonnel.length;
        if (selectedWatchGroup === 'babor') return baborPersonnel.length;
        if (selectedWatchGroup === 'estribor') return estriborPersonnel.length;
        return 0;
    };

    const currentSelectedTotal = getSelectedCount();

    // 3. Poblar los recuadros de la cuadrícula (Sólo mostrar count si el grupo está entre los elegidos)
    if (statGridTotal) statGridTotal.textContent = currentSelectedTotal;

    if (statBabor) {
        const isBaborVisible = (selectedWatchGroup === 'babor' || selectedWatchGroup === 'both');
        statBabor.textContent = isBaborVisible ? baborPersonnel.length : 0;
    }

    if (statEstribor) {
        const isEstriborVisible = (selectedWatchGroup === 'estribor' || selectedWatchGroup === 'both');
        statEstribor.textContent = isEstriborVisible ? estriborPersonnel.length : 0;
    }

    // --- LÓGICA DE GRÁFICOS CON DESGLOSE POR GRUPO ---

    // 1. Estadísticas por Puesto (Basado en la distribución de guardia actual)
    const allAssignments = [...specialAssignments, ...guardAssignments];

    // Sets de IDs para clasificación rápida
    const baborIds = new Set(baborPersonnel.map(p => String(p.id)));
    const estriborIds = new Set(estriborPersonnel.map(p => String(p.id)));

    const postCountsBabor = {};
    const postCountsEstribor = {};
    const postCountsUndivided = {}; // Para casos donde no hay división previa

    allAssignments.forEach(a => {
        const loc = a.assignedLocation || "Otro";
        const personId = String(a.id);

        if (baborIds.has(personId)) {
            postCountsBabor[loc] = (postCountsBabor[loc] || 0) + 1;
        } else if (estriborIds.has(personId)) {
            postCountsEstribor[loc] = (postCountsEstribor[loc] || 0) + 1;
        } else {
            // Si no está en ninguno de los dos (ej: personal nuevo o no dividido)
            postCountsUndivided[loc] = (postCountsUndivided[loc] || 0) + 1;
        }
    });

    // Unir todas las localizaciones únicas para el eje X
    const allPosts = [...new Set([
        ...Object.keys(postCountsBabor),
        ...Object.keys(postCountsEstribor),
        ...Object.keys(postCountsUndivided)
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
                        label: 'Babor',
                        data: allPosts.map(p => postCountsBabor[p] || 0),
                        backgroundColor: 'rgba(14, 165, 233, 0.6)',
                        borderColor: '#0ea5e9',
                        borderWidth: 1
                    },
                    {
                        label: 'Estribor',
                        data: allPosts.map(p => postCountsEstribor[p] || 0),
                        backgroundColor: 'rgba(239, 68, 68, 0.6)',
                        borderColor: '#ef4444',
                        borderWidth: 1
                    },
                    {
                        label: 'Sin Grupo',
                        data: allPosts.map(p => postCountsUndivided[p] || 0),
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
    
    // ❌ FALTA AQUÍ: Código para actualizar grupos individuales
    // const statGtEchoAlfa = document.getElementById('statGtEchoAlfa');
    // const statGtEchoBravo = document.getElementById('statGtEchoBravo');
    // const statGtEchoCharlie = document.getElementById('statGtEchoCharlie');
    // const statGtEchoDelta = document.getElementById('statGtEchoDelta');
    // const statCodescFoxtrot = document.getElementById('statCodescFoxtrot');
    // const statCodescGolf = document.getElementById('statCodescGolf');
    //
    // // TODO: Implementar lógica para calcular y actualizar estos elementos
}
