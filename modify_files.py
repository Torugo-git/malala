import json
import re

def update_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the closing bracket of defaultProducts array
    pattern = r'(const defaultProducts = \[)(.*?)(    \];)'
    match = re.search(pattern, content, re.DOTALL)

    if not match:
        print(f"Could not find defaultProducts in {filename}")
        return

    with open('new_products.json', 'r', encoding='utf-8') as f:
        new_products = json.load(f)

    # Format new products
    new_products_str = ""
    for p in new_products:
        p_str = f"      {{ id: {p['id']}, title: '{p['title']}', category: '{p['category']}', price: {p['price']:.2f}, stock: {p['stock']}, badge: '{p['badge']}', image: '{p['image']}', images: [], desc: '{p['desc']}' }},\n"
        new_products_str += p_str

    # Remove trailing comma and newline from the last product
    new_products_str = new_products_str.rstrip(",\n") + "\n"

    # Insert the new products before the closing bracket
    existing_products = match.group(2)
    if not existing_products.endswith(',\n'):
        if existing_products.endswith('\n'):
            existing_products = existing_products[:-1] + ",\n"
        else:
            existing_products += ",\n"

    new_content = content[:match.start(2)] + existing_products + new_products_str + content[match.start(3):]

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"Updated {filename}")

update_file('index.html')
update_file('admin.html')
