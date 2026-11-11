import json

products_text = """
--- PERFUMES E IMPORTADOS ---
- Ansaam Gold / Silver (Lattafa) - Estoque: 8
- Vulcan (Maison Alhambra) - Estoque: 3
- Hassan - Estoque: 6
- Malik - Estoque: 6
- Liquid Brun (Maison Alhambra) - Estoque: 6
- Vulcan (Maison Alhambra) - Estoque: 4
- Lattafa Khamrah - Estoque: 3
- Lattafa Khamrah Qahwa - Estoque: 4
- Philos Pura (Maison Alhambra) - Estoque: 4
- Armaf Club de Nuit Intense Man - Estoque: 8
- Rasasi Hawas - Estoque: 0 (A definir)
- Lattafa Fakhar - Estoque: 0 (A definir)
- Armaf Club de Nuit (Concentrado) - Estoque: 1
- Rasasi Hawas Ice - Estoque: 2
- Hawas Kobra - Estoque: 2
- Armaf Club de Nuit Overdose - Estoque: 1
- Guerlain - Estoque: 3
- Wajid / Velvet - Estoque: 3
- Armaf Club de Nuit Woman - Est.: 3
- Orientica - Estoque: 2
- Armaf Club de Nuit Milestone - Est.: 3
- Lattafa Yara - Estoque: 5
- Emaan / Afnan - Estoque: 3
- Ard Al Zaafaran Bint Hooran Rose - Est.: 3
- Gentleman (Givenchy) - Estoque: 1
- Lattafa Tharwah Gold - Estoque: 1
- Queen of Arabia - Estoque: 3
- Lattafa Hayaati Female - Estoque: 4
- Infinity - Estoque: 1
- Afnan - Estoque: 1

--- KITS E OUTROS PERFUMES ---
- Kit Victoria's Secret Coconut Passion - Estoque: 4 (Kits)
- Kit Victoria's Secret Vanilla Lace - Estoque: 6 (Kits)
- Kit Victoria's Secret Pure Seduction - Estoque: 3 (Kits)
- Kit Victoria's Secret Love Spell - Estoque: 3 (Kits)
- Lattafa Mayar - Estoque: 3
- Lattafa Musamam - Estoque: 4
- Les Fleurs (Maison Alhambra) - Est.: 1
- 212 VIP Black (Carolina Herrera) - Est.: 1
- 212 Men (Carolina Herrera) - Estoque: 1
- Invictus (Paco Rabanne) - Estoque: 1
- Athari - Estoque: 3
- Issey Miyake - Estoque: 3
- Emporio Armani Stronger With You - Est.: 1
- Afnan Supremacy - Estoque: 1
- Sunset - Estoque: 2
- Moonlight - Estoque: 1
- Raghba / Ramz (Lattafa) - Estoque: 3
- Lattafa Al Noble - Estoque: 1
- Maison Alhambra Kuro / Coeur - Est.: 3
- Victoria's Secret (Diversos) - Est.: 5
- Lattafa Opulent - Estoque: 3
- So Scandal! (Jean Paul Gaultier) - Est.: 1
- Lattafa Asad Elixir - Estoque: 1
- Lattafa Asad Woman - Estoque: 2
- Lattafa Asad Bourbon - Estoque: 5
- Sabah - Est.: 5
- Swiss Arabian Shaghaf Oud - Estoque: 3
- Ard Al Zaafaran Bint Hooran - Est.: 3
- Summit - Estoque: 2
- Maison Alhambra Salvo - Est.: 2
- Maison Alhambra Glacier Ultra - Est.: 2

--- ACESSÓRIOS E ELETRÔNICOS ---
- Cabo para iPhone - Estoque: 6
- Fonte / Carregador de tomada para iPhone - Estoque: 7
"""

products = []
current_id = 15
current_category = ""

for line in products_text.split('\n'):
    line = line.strip()
    if not line:
        continue

    if line.startswith("---"):
        if "PERFUMES" in line:
            current_category = "Perfumes"
        elif "KITS" in line:
            current_category = "Kits"
        elif "ACESSÓRIOS" in line or "ELETRÔNICOS" in line:
            current_category = "Eletrônicos/Acessórios"
        continue

    if line.startswith("-"):
        parts = line[1:].split("- Est")
        if len(parts) == 1:
            print("Failed to parse:", line)
            continue

        title = parts[0].strip()
        stock_str = parts[1].strip()

        # Parse stock
        stock_val = 0
        for word in stock_str.split():
            word = word.replace('oque:', '').replace('.:', '').replace('oque', '').strip()
            if word.isdigit():
                stock_val = int(word)
                break

        # Handle cases where it says "Est.: 3" or similar
        if ".:" in stock_str and stock_val == 0:
            stock_val = int(stock_str.split(".:")[1].split()[0].strip())

        product = {
            "id": current_id,
            "title": title,
            "category": current_category,
            "price": 0,
            "stock": stock_val,
            "badge": "Lançamento",
            "image": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&q=80&w=600",
            "images": [],
            "desc": "Produto recém-adicionado."
        }

        products.append(product)
        current_id += 1

print(json.dumps(products, indent=2, ensure_ascii=False))
