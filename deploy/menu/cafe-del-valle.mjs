/* Café del Valle POS — la carta impresa (Menú + Menú Bebidas), transcrita tal cual.

   Precios en quetzales, como están impresos. Las recetas van vacías a propósito:
   las cargan los encargados desde Menú / Inventario.

   Regla de ruteo (ver src/lib/stations.js): cuando un platillo INCLUYE una bebida,
   el platillo se queda en su categoría (cocina) y se crea un extra con el
   NOMBRE DEL PLATILLO y destino "barra". Al enviar la orden, la bebida sale como
   línea aparte en el tablero del barista y no en el papel de cocina:

     cocina → 1× Combo N.1
     barra  → 1× Combo N.1 · bebida incluida

   Ese extra es un grupo de UNA sola opción, así que el modal lo deja marcado de
   entrada: el cajero no tiene que acordarse de tocarlo, y no se puede quitar. */
import { catColors, MOD_GROUPS as MOD_GROUPS_BASE } from "../../src/data.js";

// ------------------------------------------------------------- categorías
const C = (id, name, icon, hue, station) => ({ id, name, icon, hue, station, ...catColors(hue) });

// Bebidas primero: es un café y la primera pestaña es la que se abre por defecto.
export const CATEGORIES = [
  C("calientes", "Calientes", "☕", 70, "barra"),
  C("frias", "Frías", "🧋", 100, "barra"),
  C("infusiones", "Infusiones y Chai's", "🍵", 130, "barra"),
  C("bebidas_esp", "Bebidas especiales", "✨", 85, "barra"),
  C("smoothies", "Smoothies y Chamoyadas", "🍹", 25, "barra"),
  C("alitas", "Alitas", "🍗", 45, "cocina"),
  C("boneless", "Boneless", "🥡", 60, "cocina"),
  C("hamburguesas", "Hamburguesas", "🍔", 30, "cocina"),
  C("especiales", "Especiales", "🌮", 78, "cocina"),
  C("papas", "Papas fritas", "🍟", 90, "cocina"),
  C("crepas", "Crepas dulces", "🥞", 50, "cocina"),
  C("combos", "Combos", "🍱", 120, "cocina"),
  C("postres", "Postres", "🍰", 20, "cocina"),
];

// -------------------------------------------------------------- opciones
const O = (name, delta = 0, station) => ({ name, delta, ...(station ? { station } : {}) });
const G = (id, label, options, type = "single") => ({ id, label, type, required: false, options });

/* Bebida incluida en un platillo: un grupo de una opción, con el nombre del
   platillo y destino barra. */
const bebidaIncluida = (id, platillo) => G(id, "Bebida incluida", [O(platillo, 0, "barra")]);

export const MODS = {
  // Se conservan los tres grupos que edita la pantalla Menú → Opciones.
  leche: MOD_GROUPS_BASE.leche,
  azucar: MOD_GROUPS_BASE.azucar,
  extras: MOD_GROUPS_BASE.extras,

  // El primero de cada grupo queda marcado de entrada: va el más común.
  temp: G("temp", "Temperatura", [O("Caliente"), O("Frío")]),
  proteina_quesadilla: G("proteina_quesadilla", "Relleno", [O("Pollo"), O("Res")]),
  fruta_crepa: G("fruta_crepa", "Fruta", [O("Banano"), O("Melocotón")]),
  sabor_cafe: G("sabor_cafe", "Sabor", [O("Vainilla"), O("Caramelo"), O("Avellana"), O("Coco"), O("Almendra")]),
  sabor_coca: G("sabor_coca", "Sabor", [O("Vainilla"), O("Caramelo"), O("Coco"), O("Cereza")]),
  sabor_sidra: G("sabor_sidra", "Sabor", [O("Fresa"), O("Kiwi"), O("Coco"), O("Selva verde"), O("Menta fresa"), O("Cereza"), O("Piña chipotle")]),
  sabor_tisana: G("sabor_tisana", "Sabor", [O("Manzana Arándanos"), O("Cielo Rojo")]),
  chai_cafe: G("chai_cafe", "Con café", [O("Sin café"), O("Con café", 5)]),

  // Combos: 2 coca-colas cada uno → van al barista.
  bebida_combo1: bebidaIncluida("bebida_combo1", "Combo N.1"),
  bebida_combo2: bebidaIncluida("bebida_combo2", "Combo N.2"),
  bebida_combo3: bebidaIncluida("bebida_combo3", "Combo N.3"),
  // Afogatto: helado con espresso encima; el espresso lo saca la barra.
  bebida_afogatto: bebidaIncluida("bebida_afogatto", "Afogatto"),
  bebida_afogatto_black: bebidaIncluida("bebida_afogatto_black", "Afogatto Black"),
};

// ------------------------------------------------------------- productos
const quitaAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => quitaAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const P = (cat, name, price, desc = "", mods = []) => ({
  id: `m_${cat}_${slug(name)}`,
  cat,
  name,
  price,
  desc,
  sizes: null,
  mods,
  recipe: [],
});

export const PRODUCTS = [
  // ---- Bebidas calientes
  P("calientes", "Capuccino Clásico", 20),
  P("calientes", "Capuccino Especial", 30, "Vainilla, caramelo, avellana, coco o almendra", ["sabor_cafe"]),
  P("calientes", "Mocca Maple", 30),
  P("calientes", "Café Mocca", 30),
  P("calientes", "Café Negro", 15),
  P("calientes", "Chocolate de la Casa", 20),
  P("calientes", "Chocolate Artesanal", 25),
  P("calientes", "Chocolate Coco", 25),
  P("calientes", "Chocolate Blanco", 35),

  // ---- Bebidas frías
  P("frias", "Macciato Praliné", 30),
  P("frias", "Espresso Sunrise", 30),
  P("frias", "Frappe Clásico", 25),
  P("frias", "Frappe Especial", 30, "Vainilla, caramelo, avellana, coco o almendra", ["sabor_cafe"]),
  P("frias", "Frappe Mocca", 30),
  P("frias", "Óreo Frappe", 35),
  P("frias", "Choco Mania Frappe", 35),
  P("frias", "Choco Coco Frappe", 35),
  P("frias", "Choco Menta Frappe", 35),
  P("frias", "Pingüino Frappe", 30),
  P("frias", "Chicle Frappe", 30),
  P("frias", "Chocoflan Frappe", 40),
  P("frias", "Galleta Frappe", 30),
  P("frias", "Algodón de Azúcar", 30),

  // ---- Infusiones y chai's
  P("infusiones", "Tisanas Frutales", 35, "Manzana Arándanos o Cielo Rojo", ["temp", "sabor_tisana"]),
  P("infusiones", "Chai Vainilla", 30, "", ["temp", "chai_cafe"]),
  P("infusiones", "Chai Clásico", 30, "", ["temp", "chai_cafe"]),
  P("infusiones", "Chai Manzana Canela", 30, "", ["temp", "chai_cafe"]),
  P("infusiones", "Té Matcha", 35, "", ["temp"]),
  P("infusiones", "Té Matcha y Coco", 40, "", ["temp"]),
  P("infusiones", "Té Matcha Almendrado", 40, "", ["temp"]),
  P("infusiones", "Blue Matcha", 40),

  // ---- Bebidas especiales
  P("bebidas_esp", "Moccately", 35, "Caliente"),
  P("bebidas_esp", "Café Oreo", 35, "Caliente"),
  P("bebidas_esp", "Caramel Flan", 35, "", ["temp"]),
  P("bebidas_esp", "Dasheen", 35, "", ["temp"]),
  P("bebidas_esp", "Coca-cola del Valle", 20, "Vainilla, caramelo, coco o cereza", ["sabor_coca"]),
  P("bebidas_esp", "Sidras Italianas", 30, "Fresa, kiwi, coco, selva verde, menta fresa, cereza o piña chipotle", ["sabor_sidra"]),
  P("bebidas_esp", "Limonada Flor de Sauco", 35),

  // ---- Smoothies y chamoyadas
  P("smoothies", "Piña colada", 30),
  P("smoothies", "Fresa colada", 30),
  P("smoothies", "Naranja Pepita", 30),
  P("smoothies", "Mango Pepita", 30),
  P("smoothies", "Arándanos", 30),
  P("smoothies", "Chamoyada de Piña", 35),
  P("smoothies", "Chamoyada de Mora", 35),
  P("smoothies", "Chamoyada de Maracuyá", 35),

  // ---- Alitas
  P("alitas", "Alitas Tajín y Miel", 50),
  P("alitas", "Alitas Honey Mustard", 50),
  P("alitas", "Alitas Barbacoa", 50),
  P("alitas", "Alitas Buffalo", 50),
  P("alitas", "Alitas Flaming Hot", 55),

  // ---- Boneless
  P("boneless", "Boneless A la Naranja", 35),
  P("boneless", "Boneless Barbacoa", 35),
  P("boneless", "Boneless Buffalo", 35),
  P("boneless", "Boneless Honey Mustard", 35),
  P("boneless", "Boneless Flaming Hot", 40),

  // ---- Hamburguesas
  P("hamburguesas", "Hamburguesa Crispy", 50, "Vegetales frescos, cebolla caramelizada, queso americano, queso mozzarella, pollo crispy"),
  P("hamburguesas", "Hamburguesa De Res", 38, "Vegetales frescos, aderezo de la casa, queso americano, cebolla caramelizada, carne de res"),
  P("hamburguesas", "Hamburguesa Doble Res BBQ", 50, "Doble torta de res, aderezo de la casa, cebolla caramelizada, queso mozzarella, queso americano, tocino, salsa BBQ"),
  P("hamburguesas", "Hamburguesa GULA", 55, "Vegetales frescos, cebolla caramelizada, torta de pollo crispy, queso americano, triple queso mozzarella"),
  P("hamburguesas", "Hamburguesa Toreada", 50, "Doble torta de res, aderezo de la casa, cebolla toreada con jalapeños, queso mozzarella, queso americano, salsa BBQ"),
  P("hamburguesas", "Hamburguesa MINI", 30, "Vegetales frescos, cebolla caramelizada, aderezo de la casa, queso americano, pollo crispy"),
  P("hamburguesas", "Hamburguesa Dos Mundos", 55, "Aderezo Bufalo Ranch, vegetales frescos, chorizo artesanal, carne de res, cebolla caramelizada, queso mozzarella, queso americano"),
  P("hamburguesas", "Hamburguesa De La Casa", 55, "Aderezo Buffalo Ranch, vegetales frescos, chorizo artesanal, queso mozzarella, cebolla caramelizada"),

  // ---- Especiales (cocina)
  P("especiales", "Quesadilla Suprema", 35, "Pollo o res", ["proteina_quesadilla"]),
  P("especiales", "Quesadilla con Chorizo", 40),
  P("especiales", "Infladitas de Pollo", 45),
  P("especiales", "Nachos con Queso y Carne", 20),
  P("especiales", "Nachos Especiales", 35),

  // ---- Papas fritas
  P("papas", "Papas Simples", 20),
  P("papas", "Papas con Queso y Carne", 40),
  P("papas", "Papas Crispy", 45),
  P("papas", "Papas Rancheras", 45),

  // ---- Crepas dulces
  P("crepas", "Crepa Clásica con Nutella", 30, "Banano o melocotón, nutella, helado de vainilla", ["fruta_crepa"]),
  P("crepas", "Crepa Mixta", 35, "Banano y melocotón, nutella, helado de vainilla"),
  P("crepas", "Crepa Mar y Tierra", 45, "Crema de maní, crema pastelera, banano criollo, dulce de caramelo, maní, helado de vainilla"),
  P("crepas", "Crepa Mamba Negra", 50, "Melocotón, crema de maní, nutella, dulce de caramelo, helado de chocolate, chispas de chocolate"),
  P("crepas", "Crepa Manzana Canela", 45, "Manzana en almíbar, dulce de leche, queso crema, helado de pistacho, almendra lasca"),
  P("crepas", "Crepa Napolitana", 50, "Fresa en almíbar, queso crema, nutella, helado de chocolate, coco dorado"),

  // ---- Combos (llevan 2 coca-colas → extra a barra)
  P("combos", "Combo N.1", 140, "18 boneless de 2-3 sabores al gusto, papas con queso, aderezo ranch, aderezo Buffalo Ranch, 2 coca-cola", ["bebida_combo1"]),
  P("combos", "Combo N.2", 235, "10 alitas de 2 sabores al gusto, 14 boneless de 2 sabores al gusto, papas con queso, aderezo ranch, aderezo Buffalo Ranch, 2 coca-cola", ["bebida_combo2"]),
  P("combos", "Combo N.3", 230, "20 alitas, sabores al gusto, papas con queso, aderezo ranch, aderezo Buffalo Ranch, 2 coca-cola", ["bebida_combo3"]),

  // ---- Postres
  P("postres", "Postre del día", 20),
  P("postres", "Cheesecake", 25),
  P("postres", "Afogatto", 25, "", ["bebida_afogatto"]),
  P("postres", "Afogatto Black", 30, "", ["bebida_afogatto_black"]),
];

// Un id repetido haría que dos productos se pisen en el carrito y en el inventario.
const vistos = new Set();
for (const p of PRODUCTS) {
  if (vistos.has(p.id)) throw new Error(`id de producto repetido: ${p.id}`);
  vistos.add(p.id);
  if (!CATEGORIES.some((c) => c.id === p.cat)) throw new Error(`categoría inexistente en ${p.id}: ${p.cat}`);
  for (const m of p.mods) if (!MODS[m]) throw new Error(`grupo de opciones inexistente en ${p.id}: ${m}`);
}
