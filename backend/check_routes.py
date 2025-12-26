import json

with open('data/routes.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

routes = data.get('routes', [])
print(f"Total routes: {len(routes)}")

for r in routes:
    a = r.get('analysis', {})
    print(f"{r.get('id')}: analyzed={r.get('analyzed')}, dist={a.get('distancia_km')}, mun={a.get('num_municipios')}, urb={a.get('localidades_urbanas')}, rur={a.get('localidades_rurales')}")
