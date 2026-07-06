$file = 'c:\Users\hp\OneDrive\Escritorio\CARLOS VALLEJO\CREACION DE PAGINAS WEB\registro de delitos\script.js'
$lines = [System.IO.File]::ReadAllLines($file)
$lines[5314] = '            } else {'
$lines[5315] = '                // Horario personalizado - tratar como un solo turno'
$lines[5316] = '                for (let i = 0; i < quota; i++) {'
$lines[5317] = '                    allSlots.push({ locName: name, shift: "FIJO", time: customSchedule, assigned: false });'
$lines[5318] = '                }'
$lines[5319] = '            }'
$lines[5320] = '        }'
$lines[5321] = '    });'
$lines[5322] = ''
[System.IO.File]::WriteAllLines($file, $lines)
Write-Host 'Done'
