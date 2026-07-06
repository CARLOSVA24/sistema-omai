import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def capture_screenshots():
    # Crear carpeta para screenshots
    output_dir = os.path.join(os.getcwd(), 'screenshots')
    os.makedirs(output_dir, exist_ok=True)
    
    # Configurar opciones de Chrome
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    # Usar una ventana grande para capturar todos los detalles
    chrome_options.add_argument('--window-size=1920,1080')
    
    print("Iniciando Chrome Driver...")
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        url = "http://localhost:3000"
        print(f"Abriendo {url}...")
        driver.get(url)
        time.sleep(2)
        
        # 1. Capture Login Screen
        print("Capturando pantalla de login...")
        driver.save_screenshot(os.path.join(output_dir, "01_login.png"))
        
        # Iniciar sesión
        print("Ingresando credenciales...")
        # El rol por defecto es ADMINISTRADOR, así que solo ingresamos contraseña
        password_field = driver.find_element(By.ID, "loginPassword")
        password_field.send_keys("admin")
        
        login_btn = driver.find_element(By.ID, "btnLogin")
        login_btn.click()
        
        # Esperar a que el loginOverlay desaparezca
        print("Esperando que cargue el sistema...")
        WebDriverWait(driver, 10).until(
            EC.invisibility_of_element_located((By.ID, "loginOverlay"))
        )
        time.sleep(3) # Tiempo adicional para que el mapa e inicializaciones terminen
        
        # Lista de vistas estándar a capturar llamando a showAppView()
        views = [
            ("personnelView", "02_registro_personal.png"),
            ("distributionView", "03_distribucion_personal.png"),
            ("postDistributionView", "04_distribucion_puestos.png"),
            ("commandPostView", "05_puesto_mando.png"),
            ("otherFunctionsView", "06_otras_funciones.png"),
            ("personnelStatsView", "07_estadisticas_personal.png"),
            ("opsPlanningView", "08_planificacion_operaciones.png"),
            ("ordpatEchoView", "09_ordpat_gt_echo.png"),
            ("ordpat51View", "10_ordpat_gt_100_51.png"),
            ("patrolTemplateRegistryView", "11_registro_gestion_ordenes.png"),
            ("instantOpsView", "12_partes_al_instante.png"),
            ("loadOrdersView", "13_ordenes_operacion.png"),
            ("logisticsView", "14_registro_vehiculos.png"),
            ("historicalPatrolView", "18_historico_ordenes.png"),
            ("operationalReportsView", "19_historico_reportes_omai.png"),
            ("adminKeysView", "20_admin_claves.png"),
            ("adminDataManagementView", "21_admin_datos.png"),
            ("adminActivityView", "22_admin_actividad.png"),
            ("aboutView", "23_acerca_de.png")
        ]
        
        # Capturar vistas estándar
        for view_id, filename in views:
            print(f"Capturando vista: {view_id} -> {filename}")
            driver.execute_script(f"showAppView('{view_id}');")
            time.sleep(1.5) # Esperar renderizado
            
            # Si es estadísticas o gráficos, dar un poco más de tiempo para animación de Chart.js
            if "Stats" in view_id or "Activity" in view_id:
                time.sleep(1)
                
            driver.save_screenshot(os.path.join(output_dir, filename))
            
        # Capturar sub-vistas de Inteligencia usando toggleIntelView
        # Primero activar la sección de Inteligencia (que activa crimesTableWrapper y el mapa)
        print("Activando módulo de Inteligencia...")
        driver.execute_script("showAppView('crimesTableWrapper');")
        time.sleep(1)
        
        # A. Inteligencia - Registrar Incidente (Mapa)
        print("Capturando Inteligencia: Registrar Incidente (Mapa)...")
        driver.execute_script("toggleIntelView('map', document.querySelector('.sub-menu-btn[data-type=\"map\"]'));")
        time.sleep(2) # Esperar a que el mapa cargue tiles
        driver.save_screenshot(os.path.join(output_dir, "15_inteligencia_mapa.png"))
        
        # B. Inteligencia - Tabla de Registro
        print("Capturando Inteligencia: Tabla de Registro...")
        driver.execute_script("toggleIntelView('table', document.querySelector('.sub-menu-btn[data-type=\"table\"]'));")
        time.sleep(2) # Esperar a que rendericen gráficos estadísticos de incidentes
        driver.save_screenshot(os.path.join(output_dir, "16_inteligencia_tabla.png"))
        
        # C. Inteligencia - Infografía del Delito
        print("Capturando Inteligencia: Infografía del Delito...")
        driver.execute_script("toggleIntelView('infografia', document.querySelector('.sub-menu-btn[data-type=\"infografia\"]'));")
        time.sleep(2) # Esperar a que rendericen los 4 gráficos de infografía
        driver.save_screenshot(os.path.join(output_dir, "17_inteligencia_infografia.png"))
        
        print("Proceso de captura completado con éxito.")
        print(f"Imágenes guardadas en: {output_dir}")
        
    except Exception as e:
        print(f"Error durante la captura: {e}")
        
    finally:
        driver.quit()

if __name__ == '__main__':
    capture_screenshots()
