import json

with open('data/routes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Filter routes for Zapotlan de Juarez
routes = [r for r in data['routes'] if r.get('municipio') == 'Zapotlán de Juárez']
print(f"Routes in Zapotlan: {len(routes)}")

# Collect all localities using sets (like the API does)
total_localidades = set()
localidades_urbanas = set()
localidades_rurales = set()

# Also track by name to see if cvegeo causes issues
by_name_total = set()
by_name_urbanas = set()
by_name_rurales = set()

for r in routes:
    print(f"\nRoute: {r.get('nombre')}")
    a = r.get('analysis', {})
    
    for mun in a.get('municipios_atravesados', []):
        for loc in mun.get('localidades_urbanas', []):
            loc_id = loc.get('cvegeo') or loc.get('nombre')
            nombre = loc.get('nombre')
            total_localidades.add(loc_id)
            localidades_urbanas.add(loc_id)
            by_name_total.add(nombre)
            by_name_urbanas.add(nombre)
            print(f"  [U] {nombre} (cvegeo: {loc.get('cvegeo')})")
            
        for loc in mun.get('localidades_rurales', []):
            loc_id = loc.get('cvegeo') or loc.get('nombre')
            nombre = loc.get('nombre')
            total_localidades.add(loc_id)
            localidades_rurales.add(loc_id)
            by_name_total.add(nombre)
            by_name_rurales.add(nombre)
            print(f"  [R] {nombre} (cvegeo: {loc.get('cvegeo')})")

print(f"\n=== By CVEGEO ===")
print(f"Total: {len(total_localidades)}")
print(f"Urbanas: {len(localidades_urbanas)}")
print(f"Rurales: {len(localidades_rurales)}")

print(f"\n=== By NAME ===")
print(f"Total: {len(by_name_total)}")
print(f"Urbanas: {len(by_name_urbanas)}")
print(f"Rurales: {len(by_name_rurales)}")

if len(total_localidades) != len(by_name_total):
    print(f"\n⚠️ DIFFERENCE: cvegeo gives {len(total_localidades)}, name gives {len(by_name_total)}")
