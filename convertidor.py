import pandas as pd
import json

file_path = "Boletin_Semanal_Precios_Mayoristas_20260925.xlsx"
json_data = []

# Obtener los nombres de las hojas, omitiendo las dos primeras (Portada y Presentación)
xls = pd.ExcelFile(file_path)
sheet_names = xls.sheet_names[2:]

for sheet in sheet_names:
    # Leemos la hoja, saltando las primeras 5 filas de encabezado que no tienen datos tabulares
    df = pd.read_excel(file_path, sheet_name=sheet, skiprows=5)

    # Limpiamos los nombres de las columnas (a veces traen saltos de línea ocultos)
    df.columns = df.columns.str.replace("\n", " ").str.strip()

    # El segundo recuadro contiene volúmenes; conservamos únicamente el bloque de precios
    filas_volumen = (
        df.astype(str)
        .apply(lambda columna: columna.str.contains("volumen", case=False, na=False))
        .any(axis=1)
    )
    if filas_volumen.any():
        df = df.iloc[: filas_volumen.to_numpy().argmax()]

    for index, row in df.iterrows():
        # Verificamos que la fila no sea texto final (como "Fuente: elaborado por Odepa.")
        if pd.isna(row["Variedad"]) or "Fuente" in str(row["Variedad"]):
            continue

        # Calculamos el promedio semanal usando solo los días que tienen precio mayor a 0
        precios = [
            row["Lunes"],
            row["Martes"],
            row["Miércoles"],
            row["Jueves"],
            row["Viernes"],
        ]
        precios_validos = [
            p for p in precios if pd.notna(p) and isinstance(p, (int, float)) and p > 0
        ]

        precio_prom = (
            int(sum(precios_validos) / len(precios_validos)) if precios_validos else 0
        )

        # Filtramos para no incluir datos sin precio válido
        if precio_prom > 0:
            json_data.append(
                {
                    "producto": sheet,
                    "variedad": str(row["Variedad"]).strip(),
                    "mercado": str(row["Mercado"]).strip(),
                    "precio_promedio": precio_prom,
                    "unidad": str(row["Unidad de comercialización"]).strip(),
                    "fecha_boletin": "2026-09-25",  # Fecha obtenida del nombre del archivo
                }
            )

# Guardamos el archivo JSON en la carpeta 'data'
import os

os.makedirs("data", exist_ok=True)

with open("data/precios_odepa.json", "w", encoding="utf-8") as f:
    json.dump(json_data, f, ensure_ascii=False, indent=2)

print(f"¡Éxito! Se generó precios_odepa.json con {len(json_data)} registros.")
