import json

with open('data/routes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

routes = data['routes']
print(f"Total routes: {len(routes)}")

# Check locality structure
for r in routes[:2]:
    a = r.get('analysis', {})
    muns = a.get('municipios_atravesados', [])
    print(f"\nRoute: {r.get('nombre')}")
    print(f"  distancia_km: {a.get('distancia_km')}")
    print(f"  distancia_rnc_km: {a.get('distancia_rnc_km')}")
    print(f"  municipios: {len(muns)}")
    for m in muns[:2]:
        urbs = m.get('localidades_urbanas', [])
        rurs = m.get('localidades_rurales', [])
        print(f"    {m.get('nombre')}: {len(urbs)} urb, {len(rurs)} rur")
        if urbs:
            print(f"      Sample urban loc: {urbs[0]}")

# Check for duplicates across routes
all_localities = {}
for r in routes:
    a = r.get('analysis', {})
    for mun in a.get('municipios_atravesados', []):
        for loc in mun.get('localidades_urbanas', []):
            name = loc.get('nombre')
            if name in all_localities:
                all_localities[name].append(r.get('nombre'))
            else:
                all_localities[name] = [r.get('nombre')]
        for loc in mun.get('localidades_rurales', []):
            name = loc.get('nombre')
            if name in all_localities:
                all_localities[name].append(r.get('nombre'))
            else:
                all_localities[name] = [r.get('nombre')]

print("\n\nLocalities appearing in multiple routes:")
for name, routes_list in all_localities.items():
    if len(routes_list) > 1:
        print(f"  {name}: {routes_list}")
