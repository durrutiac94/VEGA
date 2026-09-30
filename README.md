# Visor de Precios Agrícolas Chile

App web estática para visualizar, filtrar y comparar los precios mayoristas de frutas y verduras en las principales ferias de Chile, utilizando datos oficiales de la Oficina de Estudios y Políticas Agrarias (ODEPA).

Este proyecto nace para mitigar la asimetría de información en la logística agrícola. Su objetivo principal es facilitar la identificación de márgenes de rentabilidad y oportunidades de distribución (B2B de última milla) al comparar terminales de origen (como Arica) con terminales de destino (como la Feria Lagunitas en Puerto Montt).

## Características Principales

* **Arquitectura "Cero Backend":** Interfaz ultraligera que consume datos desde un archivo estático local (`.json`), eliminando latencia, problemas de CORS y costos de servidor.
* **Filtros Dinámicos en Tiempo Real:** Búsqueda asíncrona por producto y segmentación exacta por mercado mayorista sin recargar la página.
* **Depuración de Datos en el Cliente:** Lógica implementada en JavaScript para discriminar automáticamente entre precios reales de comercialización y registros de volumen o envases vacíos.
* **Mobile-First:** Interfaz adaptativa y limpia construida con Bootstrap 5, pensada para ser consultada rápidamente en terreno desde dispositivos móviles.

## Stack Tecnológico

* **Frontend:** HTML5, CSS3, Vanilla JavaScript.
* **Framework CSS:** Bootstrap 5 (vía CDN).
* **Procesamiento de Datos:** Python (Pandas) para la extracción, limpieza y conversión de boletines tabulares a formato estructurado.

## Despliegue Local

Para correr este proyecto en tu entorno de desarrollo y evitar bloqueos de seguridad del navegador al leer archivos locales:

1. Clona este repositorio:
   ```bash
   git clone [https://github.com/tu-usuario/visor-precios-odepa.git](https://github.com/tu-usuario/visor-precios-odepa.git)